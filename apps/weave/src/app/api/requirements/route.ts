import { NextResponse } from "next/server";
import { createRequirement, listRequirements } from "@/data/store";
import { createRequirementSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

const unavailable = () =>
  NextResponse.json(
    { error: "Úložiště nedostupné", code: "store_unavailable" },
    { status: 503, headers: { "Retry-After": "5" } },
  );

/** GET /api/requirements — list all requirements */
export async function GET() {
  try {
    return NextResponse.json(await listRequirements());
  } catch (e) {
    logger.error("GET /api/requirements failed", e);
    return unavailable();
  }
}

/** POST /api/requirements — create a requirement */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = createRequirementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    return NextResponse.json(await createRequirement(parsed.data), { status: 201 });
  } catch (e) {
    logger.error("POST /api/requirements failed", e);
    return unavailable();
  }
}
