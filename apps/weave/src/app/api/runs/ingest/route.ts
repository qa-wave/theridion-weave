import { NextResponse } from "next/server";
import { runnerIngestSchema } from "@/lib/validation";
import { runResultV2Schema, normalizeRunResult } from "@/lib/run-result";
import { ingestRun, recordLastSeen, saveIngestedRun } from "@/data/store";
import { enabledIntegrations } from "@/lib/integrations.server";
import { logger } from "@/lib/logger";

/**
 * Ingest endpoint for results published by Theridion Runner / Eyes / Net.
 *
 *   POST /api/runs/ingest
 *   Authorization: Bearer <token>
 *
 * Accepts either:
 *   - canonical RunResult v2  ({ schema_version: 2, run_id, product, requests[] })
 *     → normalized to a TestRun, idempotent on run_id (Idempotency-Key).
 *   - legacy RunnerIngestPayload ({ source, suiteName, results[] }).
 *
 * Auth: the token must match WEAVE_INGEST_TOKEN (legacy) OR the per-source token
 * of any enabled integration (Settings → Integrace). In production, if no token
 * is configured anywhere, ingest fails safe with 503.
 */
async function authorize(req: Request): Promise<NextResponse | null> {
  const sources = await enabledIntegrations().catch(() => []);
  const validTokens = [process.env.WEAVE_INGEST_TOKEN, ...sources.map((s) => s.token)].filter(
    (t): t is string => !!t,
  );

  if (validTokens.length === 0) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Ingest není nakonfigurován", code: "ingest_unconfigured" }, { status: 503 });
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }

  // Canonical RunResult v2
  if ((body as { schema_version?: unknown })?.schema_version === 2) {
    const parsed = runResultV2Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validace RunResult v2 selhala", issues: parsed.error.flatten() }, { status: 422 });
    }
    try {
      const run = normalizeRunResult(parsed.data);
      const { created } = await saveIngestedRun(run);
      // Record health timestamp for the source (best-effort)
      const src = parsed.data.product;
      if (src === "eyes" || src === "net" || src === "runner") {
        recordLastSeen(src).catch(() => undefined);
      }
      return NextResponse.json(
        { id: run.id, accepted: run.results.length, deduped: !created },
        { status: created ? 201 : 200 },
      );
    } catch (e) {
      logger.error("ingest v2 failed", e);
      return NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
        status: 503,
        headers: { "Retry-After": "5" },
      });
    }
  }

  // Legacy RunnerIngestPayload
  const parsed = runnerIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const run = await ingestRun(parsed.data);
    // Record health timestamp for the source (best-effort)
    const src = parsed.data.source;
    if (src === "eyes" || src === "net" || src === "runner") {
      recordLastSeen(src).catch(() => undefined);
    }
    return NextResponse.json({ id: run.id, accepted: run.results.length }, { status: 201 });
  } catch (e) {
    logger.error("ingest (legacy) failed", e);
    return NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }
}
