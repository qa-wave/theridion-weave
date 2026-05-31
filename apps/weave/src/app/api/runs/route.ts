import { NextResponse } from "next/server";
import type { RunSource } from "@/lib/types";
import { createTestRunSchema } from "@/lib/validation";
import { createTestRun, listTestRuns } from "@/data/store";
import { logger } from "@/lib/logger";

const unavailable = () =>
  NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
    status: 503,
    headers: { "Retry-After": "5" },
  });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const src = searchParams.get("source");
  const source: RunSource | undefined = src === "manual" || src === "eyes" || src === "net" ? src : undefined;
  try {
    return NextResponse.json(await listTestRuns(source));
  } catch (e) {
    logger.error("GET /api/runs failed", e);
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
  const parsed = createTestRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    return NextResponse.json(await createTestRun(parsed.data), { status: 201 });
  } catch (e) {
    logger.error("POST /api/runs failed", e);
    return unavailable();
  }
}
