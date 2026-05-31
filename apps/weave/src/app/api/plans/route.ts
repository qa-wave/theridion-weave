import { NextResponse } from "next/server";
import { createTestPlanSchema } from "@/lib/validation";
import { createTestPlan, listTestPlans } from "@/data/store";
import { logger } from "@/lib/logger";

const unavailable = () =>
  NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
    status: 503,
    headers: { "Retry-After": "5" },
  });

export async function GET() {
  try {
    return NextResponse.json(await listTestPlans());
  } catch (e) {
    logger.error("GET /api/plans failed", e);
    return unavailable();
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = createTestPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    return NextResponse.json(await createTestPlan(parsed.data), { status: 201 });
  } catch (e) {
    logger.error("POST /api/plans failed", e);
    return unavailable();
  }
}
