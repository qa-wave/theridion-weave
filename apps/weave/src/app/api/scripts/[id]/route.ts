import { NextResponse } from "next/server";
import {
  updateTestScriptSchema,
  patchScriptStatusSchema,
} from "@/lib/validation";
import {
  deleteTestScript,
  getTestScript,
  updateTestScript,
  patchScriptStatus,
} from "@/data/store";
import { canTransitionScript } from "@/lib/workflow";
import { logger } from "@/lib/logger";

const unavailable = () =>
  NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
    status: 503,
    headers: { "Retry-After": "5" },
  });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const scr = await getTestScript(id);
    if (!scr) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
    return NextResponse.json(scr);
  } catch (e) {
    logger.error("GET /api/scripts/[id] failed", e);
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

  // Check if this is a status transition patch
  const statusParsed = patchScriptStatusSchema.safeParse(body);
  if (statusParsed.success && Object.keys(body as object).every((k) => ["status", "by"].includes(k))) {
    try {
      const existing = await getTestScript(id);
      if (!existing) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
      const { status: toStatus, by } = statusParsed.data;
      if (!canTransitionScript(existing.status, toStatus)) {
        return NextResponse.json(
          {
            error: "Přechod stavu není povolen",
            from: existing.status,
            to: toStatus,
            code: "invalid_transition",
          },
          { status: 409 },
        );
      }
      const updated = await patchScriptStatus(id, toStatus, by);
      if (!updated) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
      return NextResponse.json(updated);
    } catch (e) {
      logger.error("PATCH /api/scripts/[id] status failed", e);
      return unavailable();
    }
  }

  // Regular field update
  const parsed = updateTestScriptSchema.safeParse({ ...(body as object), id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const updated = await updateTestScript(parsed.data);
    if (!updated) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("PATCH /api/scripts/[id] failed", e);
    return unavailable();
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ok = await deleteTestScript(id);
    if (!ok) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
    return NextResponse.json({ deleted: id });
  } catch (e) {
    logger.error("DELETE /api/scripts/[id] failed", e);
    return unavailable();
  }
}
