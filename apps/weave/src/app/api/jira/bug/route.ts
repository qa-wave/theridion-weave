import { NextResponse } from "next/server";
import { z } from "zod";
import { createBugForFailedRun } from "@/lib/jira-mirror.server";
import { logger } from "@/lib/logger";

const bugSchema = z.object({
  runId: z.string().min(1),
  testId: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }

  const parsed = bugSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const result = await createBugForFailedRun(parsed.data.runId, parsed.data.testId);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("POST /api/jira/bug failed", e);
    if (msg.includes("disabled") || msg.includes("configured")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("not found")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
