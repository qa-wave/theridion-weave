import { NextResponse } from "next/server";
import { isDurable, migrate } from "@/data/store";
import { logger } from "@/lib/logger";

/**
 * Idempotent schema bootstrap for Neon. Run once after first deploy:
 *   curl -X POST https://theridion-weave.qawave.ai/api/db/migrate \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: Request) {
  if (!isDurable()) {
    return NextResponse.json({ error: "DATABASE_URL not set — nothing to migrate" }, { status: 400 });
  }
  const secret = process.env.CRON_SECRET ?? process.env.WEAVE_INGEST_TOKEN;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== secret) {
      return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
    }
  }
  try {
    await migrate();
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("migrate failed", e);
    return NextResponse.json({ error: "Migrace selhala" }, { status: 500 });
  }
}
