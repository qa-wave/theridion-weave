import { NextResponse } from "next/server";
import { createRunFromPlanSchema } from "@/lib/validation";
import { createRunFromPlan } from "@/data/store";
import { logger } from "@/lib/logger";

/**
 * POST /api/runs/from-plan
 * Scaffold a manual TestRun from an existing TestPlan.
 * Body: { planId, triggeredBy?, label? }
 * Returns the new TestRun (201) or 404 if the plan doesn't exist.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = createRunFromPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const run = await createRunFromPlan(parsed.data);
    if (!run) {
      return NextResponse.json({ error: "Test plán nenalezen" }, { status: 404 });
    }
    return NextResponse.json(run, { status: 201 });
  } catch (e) {
    logger.error("POST /api/runs/from-plan failed", e);
    return NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }
}
