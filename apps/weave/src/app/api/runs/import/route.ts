import { NextResponse } from "next/server";
import { z } from "zod";
import { saveIngestedRun } from "@/data/store";
import { importJUnit, importPlaywright } from "@/lib/importers";
import { enabledIntegrations, loadSettings } from "@/lib/integrations.server";
import { logger } from "@/lib/logger";
import { buildHubPayload, fireHubWebhook } from "@/lib/hub-webhook";
import type { TestRun } from "@/lib/types";

/**
 * POST /api/runs/import
 *
 * Generic importer: accepts JUnit XML or Playwright JSON, normalizes to a
 * TestRun and persists via the same idempotent saveIngestedRun path.
 *
 * Content-Type header determines the format:
 *   - application/xml  | text/xml           → JUnit XML
 *   - application/json (with ?format=junit) → JUnit XML embedded in JSON body
 *   - application/json (default)            → Playwright JSON report
 *
 * Query params:
 *   - format=junit|playwright  (overrides content-type detection)
 *   - label=<string>           (run label / branch)
 *   - suite=<string>           (suite name override)
 *   - triggeredBy=<string>     (default: "import/<format>")
 *
 * Auth: same token rules as /api/runs/ingest (WEAVE_INGEST_TOKEN or per-source token).
 * In dev/demo mode auth is skipped.
 */

async function maybeNotifyHub(run: TestRun): Promise<void> {
  try {
    const settings = await loadSettings();
    const hub = settings.hub;
    if (!hub.enabled || !hub.token || !hub.baseUrl) return;
    const weaveBase = process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://theridion-weave.qawave.ai");
    fireHubWebhook(hub.baseUrl, hub.token, buildHubPayload(run, weaveBase)).catch(() => undefined);
  } catch {
    // fire-and-forget, never block import
  }
}

const querySchema = z.object({
  format: z.enum(["junit", "playwright"]).optional(),
  label: z.string().max(200).optional(),
  suite: z.string().max(200).optional(),
  triggeredBy: z.string().max(200).optional(),
});

async function authorize(req: Request): Promise<NextResponse | null> {
  const sources = await enabledIntegrations().catch(() => []);
  const validTokens = [process.env.WEAVE_INGEST_TOKEN, ...sources.map((s) => s.token)].filter(
    (t): t is string => !!t,
  );

  if (validTokens.length === 0) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Ingest není nakonfigurován", code: "ingest_unconfigured" },
        { status: 503 },
      );
    }
    return null; // dev/demo: allow unauthenticated
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-weave-ingest-token");
  if (!token || !validTokens.includes(token)) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  const denied = await authorize(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const qParsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!qParsed.success) {
    return NextResponse.json({ error: "Neplatné query parametry", issues: qParsed.error.flatten() }, { status: 400 });
  }
  const { label, suite: suiteName, triggeredBy } = qParsed.data;

  // Detect format: explicit query param > content-type header
  const contentType = req.headers.get("content-type") ?? "";
  let format = qParsed.data.format;
  if (!format) {
    if (contentType.includes("xml")) format = "junit";
    else format = "playwright"; // default JSON
  }

  const opts = { label, suiteName, triggeredBy };

  try {
    let run;
    if (format === "junit") {
      const text = await req.text();
      if (!text.trim()) {
        return NextResponse.json({ error: "Tělo požadavku je prázdné" }, { status: 400 });
      }
      try {
        run = importJUnit(text, opts);
      } catch (e) {
        return NextResponse.json({ error: `Chyba parsování JUnit XML: ${e instanceof Error ? e.message : String(e)}` }, { status: 422 });
      }
    } else {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
      }
      try {
        run = importPlaywright(body, opts);
      } catch (e) {
        return NextResponse.json({ error: `Chyba parsování Playwright JSON: ${e instanceof Error ? e.message : String(e)}` }, { status: 422 });
      }
    }

    const { created } = await saveIngestedRun(run);
    if (created) maybeNotifyHub(run).catch(() => undefined);
    return NextResponse.json(
      { id: run.id, format, accepted: run.results.length, deduped: !created },
      { status: created ? 201 : 200 },
    );
  } catch (e) {
    logger.error("POST /api/runs/import failed", e);
    return NextResponse.json(
      { error: "Úložiště nedostupné", code: "store_unavailable" },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
}
