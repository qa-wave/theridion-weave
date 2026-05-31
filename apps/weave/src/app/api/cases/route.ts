import { NextResponse } from "next/server";
import { createTestCaseSchema } from "@/lib/validation";
import { createTestCase, listTestCases } from "@/data/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cases = listTestCases({
    tag: searchParams.get("tag") ?? undefined,
    priority: searchParams.get("priority") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  return NextResponse.json(cases);
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
  const created = createTestCase(parsed.data);
  return NextResponse.json(created, { status: 201 });
}
