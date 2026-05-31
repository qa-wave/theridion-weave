import { NextResponse } from "next/server";
import { listTestRuns } from "@/data/store";
import { logger } from "@/lib/logger";
import type { RunSource } from "@/lib/types";

/**
 * GET /api/runs/export
 *
 * Export all run results as CSV.
 *
 * Query params:
 *   - source=manual|eyes|net|runner  (filter by source)
 *
 * Columns: run_id, run_source, run_label, suite_name, started_at, finished_at,
 *          test_id, title, status, duration_ms, evidence, notes, issue_url
 */

function csvEscape(v: string | undefined | null): string {
  if (v == null || v === "") return "";
  // RFC 4180: if field contains comma, quote, or newline → wrap in quotes and double internal quotes
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sourceParam = url.searchParams.get("source") as RunSource | null;

  try {
    const runs = await listTestRuns(sourceParam ?? undefined);
    const rows: string[] = [
      "run_id,run_source,run_label,suite_name,started_at,finished_at,test_id,title,status,duration_ms,evidence,notes,issue_url",
    ];

    for (const run of runs) {
      for (const r of run.results) {
        rows.push(
          [
            csvEscape(run.id),
            csvEscape(run.source),
            csvEscape(run.label),
            csvEscape(run.suiteName),
            csvEscape(run.startedAt),
            csvEscape(run.finishedAt ?? ""),
            csvEscape(r.testId),
            csvEscape(r.title),
            csvEscape(r.status),
            csvEscape(String(r.durationMs)),
            csvEscape(r.evidence),
            csvEscape(r.notes),
            csvEscape(r.issueUrl),
          ].join(","),
        );
      }
    }

    const csv = rows.join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="weave-runs-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logger.error("GET /api/runs/export failed", e);
    return NextResponse.json(
      { error: "Úložiště nedostupné", code: "store_unavailable" },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
}
