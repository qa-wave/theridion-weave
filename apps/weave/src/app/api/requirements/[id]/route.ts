import { NextResponse } from "next/server";
import { deleteRequirement, getRequirement, updateRequirement } from "@/data/store";
import { updateRequirementSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

const unavailable = () =>
  NextResponse.json(
    { error: "Úložiště nedostupné", code: "store_unavailable" },
    { status: 503, headers: { "Retry-After": "5" } },
  );

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/requirements/:id */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const req = await getRequirement(id);
    if (!req) return NextResponse.json({ error: "Požadavek nenalezen" }, { status: 404 });
    return NextResponse.json(req);
  } catch (e) {
    logger.error("GET /api/requirements/:id failed", e);
    return unavailable();
  }
}

/** PATCH /api/requirements/:id */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = updateRequirementSchema.safeParse({ ...(body as Record<string, unknown>), id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const updated = await updateRequirement(parsed.data);
    if (!updated) return NextResponse.json({ error: "Požadavek nenalezen" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("PATCH /api/requirements/:id failed", e);
    return unavailable();
  }
}

/** DELETE /api/requirements/:id */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const deleted = await deleteRequirement(id);
    if (!deleted) return NextResponse.json({ error: "Požadavek nenalezen" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    logger.error("DELETE /api/requirements/:id failed", e);
    return unavailable();
  }
}
