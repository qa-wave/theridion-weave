import { NextResponse } from "next/server";
import { z } from "zod";
import { syncToJira } from "@/lib/jira-mirror.server";
import { logger } from "@/lib/logger";

const syncSchema = z.object({
  entity: z.enum(["test", "script", "run"]),
  id: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }

  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const result = await syncToJira(parsed.data.entity, parsed.data.id);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("POST /api/jira/sync failed", e);
    // Return 409 if jira is disabled/misconfigured
    if (msg.includes("disabled") || msg.includes("configured")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
