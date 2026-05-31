// POST /api/modules/verify — validate that a local module is reachable.
// Branches on connectionType:
//   'source'  → filesystem path check (existing behaviour)
//   'app'     → if dataDir given verify it exists; else treat as valid (push-based)
//   'service' → GET {baseUrl}/health (or /api/health) with short timeout
//
// Server-only (may use fs/fetch); never reads secrets.
import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@/lib/logger";
import type { IntegrationKey, ConnectionType } from "@/lib/integrations";
import { isLocalModule } from "@/lib/integrations";

export const runtime = "nodejs";

const bodySchema = z.object({
  key: z.enum(["eyes", "net", "runner"]),
  connectionType: z.enum(["app", "service", "source"]).optional(),
  /** Required for 'source'; ignored for 'app'/'service'. */
  path: z.string().min(1).max(1000).optional(),
  /** Optional data dir for 'app' type offline scan. */
  dataDir: z.string().min(1).max(1000).optional(),
  /** Required for 'service'. */
  baseUrl: z.string().url().optional(),
});

/** Marker files/dirs that signal a valid Theridion module source checkout. */
const MODULE_MARKERS: Record<"eyes" | "net" | "runner", string[]> = {
  eyes: ["CLAUDE.md", "package.json", "apps"],
  net: ["CLAUDE.md", "package.json", "apps"],
  runner: ["CLAUDE.md", "pyproject.toml", "theridion_runner"],
};

/** Data-directory markers that signal a valid app data directory. */
const APP_DATA_MARKERS: Record<"eyes" | "net" | "runner", string[]> = {
  eyes: ["runs", "screenshots", "config.json"],
  net: ["runs", "collections", "config.json"],
  runner: ["runs", "config.json"],
};

/**
 * Quick structural check: does the directory look like the expected Theridion
 * module source checkout?
 */
function detectModule(
  modulePath: string,
  key: "eyes" | "net" | "runner",
): { ok: boolean; detail: string } {
  try {
    const stat = fs.statSync(modulePath);
    if (!stat.isDirectory()) {
      return { ok: false, detail: "Cesta není adresář." };
    }
  } catch {
    return { ok: false, detail: "Adresář neexistuje nebo k němu nemáte přístup." };
  }

  const markers = MODULE_MARKERS[key];
  const found = markers.filter((m) => {
    try {
      fs.accessSync(path.join(modulePath, m));
      return true;
    } catch {
      return false;
    }
  });

  if (found.length === 0) {
    return {
      ok: false,
      detail: `Adresář neobsahuje žádný rozpoznatelný marker Theridion modulu (hledám: ${markers.join(", ")}).`,
    };
  }

  // If a CLAUDE.md is present, check Name field for extra confirmation (best-effort).
  const claudeMd = path.join(modulePath, "CLAUDE.md");
  try {
    const content = fs.readFileSync(claudeMd, "utf-8");
    const expectedName = `theridion-${key}`;
    if (!content.toLowerCase().includes(expectedName)) {
      return {
        ok: false,
        detail: `CLAUDE.md nenashl žádnou zmínku o "${expectedName}". Zkontrolujte, zda cesta ukazuje na správný modul.`,
      };
    }
  } catch {
    // CLAUDE.md not readable — already confirmed presence above; proceed.
  }

  return { ok: true, detail: `Modul theridion-${key} nalezen v: ${modulePath}` };
}

/**
 * Verify an app data directory (optional, for 'app' type offline scan).
 * We check that it exists and contains at least one recognisable marker.
 */
function detectAppDataDir(
  dataDirPath: string,
  key: "eyes" | "net" | "runner",
): { ok: boolean; detail: string } {
  try {
    const stat = fs.statSync(dataDirPath);
    if (!stat.isDirectory()) {
      return { ok: false, detail: "Datová složka není adresář." };
    }
  } catch {
    return { ok: false, detail: "Datová složka neexistuje nebo k ní nemáte přístup." };
  }

  const markers = APP_DATA_MARKERS[key];
  const found = markers.filter((m) => {
    try {
      fs.accessSync(path.join(dataDirPath, m));
      return true;
    } catch {
      return false;
    }
  });

  if (found.length === 0) {
    return {
      ok: false,
      detail: `Datová složka neobsahuje žádný rozpoznatelný marker (hledám: ${markers.join(", ")}).`,
    };
  }

  return { ok: true, detail: `Datová složka modulu theridion-${key} nalezena v: ${dataDirPath}` };
}

/**
 * Probe a service URL — tries /health then /api/health with 5 s timeout.
 * Returns ok=true on any 2xx, ok=false otherwise.
 */
async function probeService(baseUrl: string): Promise<{ ok: boolean; detail: string }> {
  const base = baseUrl.replace(/\/$/, "");
  const probeUrls = [`${base}/health`, `${base}/api/health`];

  for (const url of probeUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (resp.ok) {
        return { ok: true, detail: `Služba dostupná na ${url} (HTTP ${resp.status}).` };
      }
    } catch {
      // Try next URL.
    }
  }

  return {
    ok: false,
    detail: `Služba na ${base} neodpověděla na /health ani /api/health do 5 s.`,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validace selhala", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { key, connectionType, path: modulePath, dataDir, baseUrl } = parsed.data;

  // Double-check: only local modules may be verified via this endpoint.
  if (!isLocalModule(key as IntegrationKey)) {
    return NextResponse.json({ error: "Tato integrace není lokální modul." }, { status: 400 });
  }

  // Infer connectionType from fields when not explicitly passed (back-compat).
  const effectiveCt: ConnectionType = connectionType ?? (modulePath ? "source" : "app");

  try {
    if (effectiveCt === "source") {
      if (!modulePath) {
        return NextResponse.json(
          { error: "Pro typ 'source' je vyžadováno pole path." },
          { status: 422 },
        );
      }
      const result = detectModule(modulePath, key);
      if (!result.ok) {
        return NextResponse.json({ ok: false, detail: result.detail }, { status: 404 });
      }
      return NextResponse.json({ ok: true, detail: result.detail });
    }

    if (effectiveCt === "app") {
      // Push-based: if no dataDir given, treat as valid immediately.
      if (!dataDir) {
        return NextResponse.json({
          ok: true,
          detail:
            "Aplikace bude posílat výsledky do Weave přes push. Čeká se na první příchozí běh.",
          guidance:
            "Vlož URL ingest endpointu a token do nastavení publikování v aplikaci.",
        });
      }
      // Optional dataDir provided — verify it.
      const result = detectAppDataDir(dataDir, key);
      if (!result.ok) {
        return NextResponse.json({ ok: false, detail: result.detail }, { status: 404 });
      }
      return NextResponse.json({ ok: true, detail: result.detail });
    }

    if (effectiveCt === "service") {
      if (!baseUrl) {
        return NextResponse.json(
          { error: "Pro typ 'service' je vyžadováno pole baseUrl." },
          { status: 422 },
        );
      }
      const result = await probeService(baseUrl);
      if (!result.ok) {
        return NextResponse.json({ ok: false, detail: result.detail }, { status: 404 });
      }
      return NextResponse.json({ ok: true, detail: result.detail });
    }

    return NextResponse.json({ error: "Neznámý connectionType." }, { status: 422 });
  } catch (err) {
    logger.error("POST /api/modules/verify failed", err);
    return NextResponse.json({ error: "Interní chyba při ověřování." }, { status: 500 });
  }
}
