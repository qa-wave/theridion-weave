import { NextResponse } from "next/server";
import { updateTestCaseSchema } from "@/lib/validation";
import { deleteTestCase, getTestCase, updateTestCase } from "@/data/store";
import { logger } from "@/lib/logger";

const unavailable = () =>
  NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
    status: 503,
    headers: { "Retry-After": "5" },
  });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const tc = await getTestCase(id);
    if (!tc) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
    return NextResponse.json(tc);
  } catch (e) {
    logger.error("GET /api/cases/[id] failed", e);
    return unavailable();
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = updateTestCaseSchema.safeParse({ ...(body as object), id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const updated = await updateTestCase(parsed.data);
    if (!updated) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("PATCH /api/cases/[id] failed", e);
    return unavailable();
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ok = await deleteTestCase(id);
    if (!ok) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
    return NextResponse.json({ deleted: id });
  } catch (e) {
    logger.error("DELETE /api/cases/[id] failed", e);
    return unavailable();
  }
}
