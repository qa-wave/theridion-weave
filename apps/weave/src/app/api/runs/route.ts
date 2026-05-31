import { NextResponse } from "next/server";
import type { RunSource } from "@/lib/types";
import { createTestRunSchema } from "@/lib/validation";
import { createTestRun, listTestRuns } from "@/data/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const src = searchParams.get("source");
  const source: RunSource | undefined =
    src === "manual" || src === "eyes" || src === "net" ? src : undefined;
  return NextResponse.json(listTestRuns(source));
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = createTestRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  return NextResponse.json(createTestRun(parsed.data), { status: 201 });
}
