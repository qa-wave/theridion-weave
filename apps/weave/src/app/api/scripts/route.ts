import { NextResponse } from "next/server";
import { createTestScriptSchema } from "@/lib/validation";
import { createTestScript, listTestScripts } from "@/data/store";
import { logger } from "@/lib/logger";

const unavailable = () =>
  NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
    status: 503,
    headers: { "Retry-After": "5" },
  });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product = searchParams.get("product") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  try {
    const scripts = await listTestScripts({ product, status, q });
    return NextResponse.json(scripts);
  } catch (e) {
    logger.error("GET /api/scripts failed", e);
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
  const parsed = createTestScriptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const scr = await createTestScript(parsed.data);
    return NextResponse.json(scr, { status: 201 });
  } catch (e) {
    logger.error("POST /api/scripts failed", e);
    return unavailable();
  }
}
