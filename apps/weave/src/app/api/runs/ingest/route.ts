import { NextResponse } from "next/server";
import { runnerIngestSchema } from "@/lib/validation";
import { ingestRun } from "@/data/store";
import { logger } from "@/lib/logger";

/**
 * Ingest endpoint for automated results from Theridion Eyes / Net, published by
 * the Theridion Runner. Accepts the same payload shape Runner sends to the Hub.
 *
 *   POST /api/runs/ingest
 *   Authorization: Bearer <WEAVE_INGEST_TOKEN>
 *
 * In production a token MUST be configured — otherwise the endpoint fails safe
 * with 503 rather than accepting anonymous writes.
 */
export async function POST(req: Request) {
  const expected = process.env.WEAVE_INGEST_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Ingest není nakonfigurován", code: "ingest_unconfigured" }, { status: 503 });
    }
    // dev/demo: allow unauthenticated ingest
  } else {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-weave-ingest-token");
    if (token !== expected) {
      return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = runnerIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const run = await ingestRun(parsed.data);
    return NextResponse.json({ id: run.id, accepted: run.results.length }, { status: 201 });
  } catch (e) {
    logger.error("POST /api/runs/ingest failed", e);
    return NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }
}
