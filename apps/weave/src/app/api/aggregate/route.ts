import { NextResponse } from "next/server";
import { aggregate } from "@/data/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/aggregate
 *
 * Returns coverage + pass-rate broken down by source and by milestone.
 *
 * Response shape:
 * {
 *   coverage: { total, active, covered, coveragePct },
 *   bySource: [ { source, passRate, pass, fail, skip, blocked, total, runCount } ],
 *   byMilestone: [ { milestone, passRate, pass, fail, skip, blocked, total, runCount } ],
 *   generatedAt: "<ISO>"
 * }
 */
export async function GET() {
  try {
    const result = await aggregate();
    return NextResponse.json(result);
  } catch (e) {
    logger.error("GET /api/aggregate failed", e);
    return NextResponse.json(
      { error: "Úložiště nedostupné", code: "store_unavailable" },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
}
