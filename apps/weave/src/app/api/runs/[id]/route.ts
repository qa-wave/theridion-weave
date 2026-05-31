import { NextResponse } from "next/server";
import { patchRunResultSchema, patchRunStatusSchema } from "@/lib/validation";
import { getTestRun, patchRunResult, patchRunStatus } from "@/data/store";
import { canTransitionRun } from "@/lib/workflow";
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
 * Two modes:
 * 1. Workflow transition: { runStatus, by? } — transitions run workflow status
 * 2. Result update: { testId, status, notes?, evidence? } — updates a single test result
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }

  // Workflow status transition?
  const runStatusParsed = patchRunStatusSchema.safeParse(body);
  if (runStatusParsed.success && Object.keys(body as object).every((k) => ["runStatus", "by"].includes(k))) {
    try {
      const existing = await getTestRun(id);
      if (!existing) return NextResponse.json({ error: "Běh nenalezen" }, { status: 404 });
      const { runStatus: toStatus, by } = runStatusParsed.data;
      if (!canTransitionRun(existing.runStatus, toStatus)) {
        return NextResponse.json(
          {
            error: "Přechod stavu není povolen",
            from: existing.runStatus,
            to: toStatus,
            code: "invalid_transition",
          },
          { status: 409 },
        );
      }
      const updated = await patchRunStatus(id, toStatus, by);
      if (!updated) return NextResponse.json({ error: "Běh nenalezen" }, { status: 404 });
      return NextResponse.json(updated);
    } catch (e) {
      logger.error("PATCH /api/runs/[id] status failed", e);
      return NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, { status: 503, headers: { "Retry-After": "5" } });
    }
  }

  // Result update
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
