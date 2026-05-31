import { NextResponse } from "next/server";
import { createTestPlanSchema } from "@/lib/validation";
import { createTestPlan, listTestPlans } from "@/data/store";

export async function GET() {
  return NextResponse.json(listTestPlans());
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
  return NextResponse.json(createTestPlan(parsed.data), { status: 201 });
}
