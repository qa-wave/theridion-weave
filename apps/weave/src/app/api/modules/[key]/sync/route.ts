// POST /api/modules/[key]/sync — real best-effort synchronisation for an
// installed local module. Behaviour depends on connectionType:
//
//   'source'  → scan installPath for spec/collection files and upsert as
//               TestScript entities (existing behaviour).
//   'app'     → if dataDir given, scan it for exported specs; otherwise skip
//               spec scan. Reports count of runs already ingested via push.
//   'service' → pull recent runs from baseUrl /api/runs (existing best-effort).
//
// Always idempotent. Returns { scriptsSynced, runsSynced, note }.
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadSettings } from "@/lib/integrations.server";
import { listTestScripts, createTestScript, listTestRuns } from "@/data/store";
import { logger } from "@/lib/logger";
import type { IntegrationKey } from "@/lib/integrations";
import { isLocalModule } from "@/lib/integrations";
import type { RunSource } from "@/lib/types";

export const runtime = "nodejs";

// ─── Spec file glob patterns per module ─────────────────────────────────────

const SPEC_PATTERNS: Record<string, RegExp> = {
  eyes: /\.spec\.ts$/i,
  net: /\.(thr|collection\.json)$/i,
};

/**
 * Recursively walk a directory and collect files matching the given predicate.
 * Returns relative paths from the root.
 */
function walkFiles(root: string, match: RegExp, maxDepth = 8): string[] {
  const results: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // skip hidden dirs and node_modules
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile() && match.test(entry.name)) {
        results.push(path.relative(root, fullPath));
      }
    }
  }
  walk(root, 0);
  return results;
}

type LocalModuleKey = "eyes" | "net" | "runner";

function frameworkFor(key: LocalModuleKey): string {
  if (key === "eyes") return "Playwright";
  if (key === "net") return "Bruno";
  return "theridion-runner";
}

function productFor(key: LocalModuleKey): "eyes" | "net" {
  // runner doesn't have a distinct script product — we reuse 'net' as
  // the closest analogy; in practice runner has no spec files to scan.
  return key === "eyes" ? "eyes" : "net";
}

/** Upsert spec files as TestScript entities; returns count of newly created. */
async function syncSpecs(
  scanRoot: string,
  moduleKey: LocalModuleKey,
): Promise<number> {
  const pattern = SPEC_PATTERNS[moduleKey];
  if (!pattern) return 0;

  const specPaths = walkFiles(scanRoot, pattern);
  const existingScripts = await listTestScripts({ product: productFor(moduleKey) });
  const bySpecPath = new Map(
    existingScripts.filter((s) => s.specPath).map((s) => [s.specPath!, s.id]),
  );

  let synced = 0;
  for (const specPath of specPaths) {
    if (!bySpecPath.has(specPath)) {
      await createTestScript({
        name: path.basename(specPath),
        product: productFor(moduleKey),
        framework: frameworkFor(moduleKey),
        specPath,
        status: "draft",
        owner: "sync",
      });
      synced++;
    }
  }
  return synced;
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await context.params;

  if (!isLocalModule(key as IntegrationKey)) {
    return NextResponse.json(
      { error: "Synchronizace je podporována pouze pro lokální moduly (eyes, net, runner)." },
      { status: 400 },
    );
  }

  const moduleKey = key as LocalModuleKey;

  // Load settings and verify the module is installed or active.
  let settings;
  try {
    settings = await loadSettings();
  } catch (err) {
    logger.error(`POST /api/modules/${key}/sync — loadSettings failed`, err);
    return NextResponse.json({ error: "Úložiště nedostupné." }, { status: 503 });
  }

  const cfg = settings[moduleKey as IntegrationKey];
  const ct = cfg.connectionType;

  // For 'source' we need installPath; for 'app' we need installed=true; for 'service' we need baseUrl.
  if (ct === "source" && (!cfg.installed || !cfg.installPath)) {
    return NextResponse.json(
      { error: "Modul není nainstalován nebo nemá nastavenou cestu." },
      { status: 409 },
    );
  }
  if (ct === "service" && (!cfg.enabled || !cfg.baseUrl)) {
    return NextResponse.json(
      { error: "Služba není povolena nebo nemá nastavenou Base URL." },
      { status: 409 },
    );
  }
  if (!ct && !cfg.installed) {
    // Legacy fallback: same guard as before.
    return NextResponse.json(
      { error: "Modul není nainstalován nebo nemá nastavenou cestu." },
      { status: 409 },
    );
  }

  let scriptsSynced = 0;
  let runsSynced = 0;
  let note: string | undefined;

  // ── Branch on connectionType ────────────────────────────────────────────────

  if (ct === "source" || (!ct && cfg.installPath)) {
    // ── Source type: scan installPath ──────────────────────────────────────
    const installPath = cfg.installPath!;
    scriptsSynced = await syncSpecs(installPath, moduleKey);
    note = `Skenováno: ${installPath}`;

    // Best-effort: pull recent runs from the module's HTTP API (if URL set).
    if (cfg.enabled && cfg.baseUrl) {
      try {
        const runsUrl = `${cfg.baseUrl.replace(/\/$/, "")}/api/runs?limit=20`;
        const resp = await fetch(runsUrl, {
          headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {},
          signal: AbortSignal.timeout(5_000),
        });
        if (resp.ok) {
          type RemoteRun = {
            id?: string;
            source?: string;
            suiteName?: string;
            label?: string;
            triggeredBy?: string;
            startedAt?: string;
            finishedAt?: string;
            results?: unknown[];
          };
          const remoteRuns = (await resp.json()) as RemoteRun[];
          if (Array.isArray(remoteRuns)) {
            const { saveIngestedRun } = await import("@/data/store");
            const { randomUUID } = await import("node:crypto");
            for (const r of remoteRuns) {
              const run = {
                id: r.id ?? `run-${randomUUID().slice(0, 8)}`,
                source: (r.source ?? moduleKey) as RunSource,
                suiteName: r.suiteName,
                label: r.label,
                triggeredBy: r.triggeredBy ?? "sync",
                startedAt: r.startedAt ?? new Date().toISOString(),
                finishedAt: r.finishedAt ?? null,
                results: Array.isArray(r.results) ? (r.results as import("@/lib/types").TestResult[]) : [],
                runStatus: "completed" as import("@/lib/types").RunWorkflowStatus,
                statusHistory: [],
              };
              const { created } = await saveIngestedRun(run);
              if (created) runsSynced++;
            }
          }
        }
      } catch {
        // Best-effort — network failures are silently ignored.
      }
    }
  } else if (ct === "app") {
    // ── App type: push-based. Optionally scan dataDir for exported specs ──
    if (cfg.dataDir) {
      try {
        scriptsSynced = await syncSpecs(cfg.dataDir, moduleKey);
        note = `Skenováno: ${cfg.dataDir}`;
      } catch {
        note = "Sken datové složky selhal.";
      }
    } else {
      note = "Aplikace je nakonfigurována jako push-only — výsledky přicházejí přes /api/runs/ingest.";
    }

    // Count runs already ingested via push for this source.
    try {
      const existingRuns = await listTestRuns(moduleKey as RunSource);
      runsSynced = existingRuns.length;
      note = (note ? note + " " : "") + `Celkem ingested běhů: ${runsSynced}.`;
    } catch {
      // Best-effort.
    }
    // runsSynced here reflects existing runs, not newly created — clarify in note.
    // Reset to 0 so callers see "0 new runs pulled" (consistent with pull semantics).
    runsSynced = 0;
  } else if (ct === "service") {
    // ── Service type: pull via baseUrl ────────────────────────────────────
    if (cfg.enabled && cfg.baseUrl) {
      try {
        const runsUrl = `${cfg.baseUrl.replace(/\/$/, "")}/api/runs?limit=20`;
        const resp = await fetch(runsUrl, {
          headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {},
          signal: AbortSignal.timeout(5_000),
        });
        if (resp.ok) {
          type RemoteRun = {
            id?: string;
            source?: string;
            suiteName?: string;
            label?: string;
            triggeredBy?: string;
            startedAt?: string;
            finishedAt?: string;
            results?: unknown[];
          };
          const remoteRuns = (await resp.json()) as RemoteRun[];
          if (Array.isArray(remoteRuns)) {
            const { saveIngestedRun } = await import("@/data/store");
            const { randomUUID } = await import("node:crypto");
            for (const r of remoteRuns) {
              const run = {
                id: r.id ?? `run-${randomUUID().slice(0, 8)}`,
                source: (r.source ?? moduleKey) as RunSource,
                suiteName: r.suiteName,
                label: r.label,
                triggeredBy: r.triggeredBy ?? "sync",
                startedAt: r.startedAt ?? new Date().toISOString(),
                finishedAt: r.finishedAt ?? null,
                results: Array.isArray(r.results) ? (r.results as import("@/lib/types").TestResult[]) : [],
                runStatus: "completed" as import("@/lib/types").RunWorkflowStatus,
                statusHistory: [],
              };
              const { created } = await saveIngestedRun(run);
              if (created) runsSynced++;
            }
          }
        }
        note = `Synchronizováno ze služby: ${cfg.baseUrl}`;
      } catch {
        note = "Synchronizace ze služby selhala (síťová chyba).";
      }
    }
  }

  return NextResponse.json({ scriptsSynced, runsSynced, note });
}
