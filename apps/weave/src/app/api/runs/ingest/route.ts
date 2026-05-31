import { NextResponse } from "next/server";
import { runnerIngestSchema } from "@/lib/validation";
import { ingestRun } from "@/data/store";

/**
 * Ingest endpoint for automated results from Theridion Eyes / Net, published by
 * the Theridion Runner. Accepts the same payload shape Runner sends to the Hub.
 *
 *   POST /api/runs/ingest
 *   Authorization: Bearer <WEAVE_INGEST_TOKEN>   (enforced only if env is set)
 */
export async function POST(req: Request) {
  const expected = process.env.WEAVE_INGEST_TOKEN;
  if (expected) {
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
  const run = ingestRun(parsed.data);
  return NextResponse.json({ id: run.id, accepted: run.results.length }, { status: 201 });
}
