import { NextResponse } from "next/server";
import { isDurable, migrate, seedDatabase } from "@/data/store";
import { logger } from "@/lib/logger";

/**
 * Migrate + load the demo dataset into Neon (idempotent). For bootstrapping a
 * fresh database only.
 *   curl -X POST https://theridion-weave.qawave.ai/api/db/seed \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: Request) {
  if (!isDurable()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 400 });
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
    const counts = await seedDatabase();
    return NextResponse.json({ ok: true, ...counts });
  } catch (e) {
    logger.error("seed failed", e);
    return NextResponse.json({ error: "Seed selhal" }, { status: 500 });
  }
}
