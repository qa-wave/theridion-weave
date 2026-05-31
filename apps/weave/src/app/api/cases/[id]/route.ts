import { NextResponse } from "next/server";
import { updateTestCaseSchema } from "@/lib/validation";
import { deleteTestCase, getTestCase, updateTestCase } from "@/data/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tc = getTestCase(id);
  if (!tc) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  return NextResponse.json(tc);
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
  const updated = updateTestCase(parsed.data);
  if (!updated) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteTestCase(id);
  if (!ok) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
