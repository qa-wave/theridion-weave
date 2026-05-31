import { NextResponse } from "next/server";
import { patchRunResultSchema } from "@/lib/validation";
import { getTestRun, patchRunResult } from "@/data/store";
import { logger } from "@/lib/logger";

/**
 * GET /api/runs/[id]
 * Returns a single TestRun by id.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const run = await getTestRun(id);
    if (!run) return NextResponse.json({ error: "Běh nenalezen" }, { status: 404 });
    return NextResponse.json(run);
  } catch (e) {
    logger.error("GET /api/runs/[id] failed", e);
    return NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }
}

/**
 * PATCH /api/runs/[id]
 * Update a single test result inside a manual run.
 * Body: { testId, status, notes?, evidence? }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = patchRunResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const run = await patchRunResult(id, parsed.data.testId, {
      status: parsed.data.status,
      notes: parsed.data.notes,
      evidence: parsed.data.evidence || undefined,
    });
    if (!run) return NextResponse.json({ error: "Běh nebo test case nenalezen" }, { status: 404 });
    return NextResponse.json(run);
  } catch (e) {
    logger.error("PATCH /api/runs/[id] failed", e);
    return NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }
}
