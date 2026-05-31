import { NextResponse } from "next/server";
import { createTestCaseSchema } from "@/lib/validation";
import { createTestCase, listTestCases } from "@/data/store";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const cases = await listTestCases({
      tag: searchParams.get("tag") ?? undefined,
      priority: searchParams.get("priority") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      q: searchParams.get("q") ?? undefined,
    });
    return NextResponse.json(cases);
  } catch (e) {
    logger.error("GET /api/cases failed", e);
    return NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = createTestCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const created = await createTestCase(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    logger.error("POST /api/cases failed", e);
    return NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }
}
