import Link from "next/link";
import { Plus, Download } from "lucide-react";
import { listTestRuns } from "@/data/store";
import { summariseRun } from "@/lib/utils";
import { Card, PageHeader, ResultBadge, SourceBadge } from "@/components/ui";
import { formatDateTime, formatDuration, formatPercent } from "@/lib/utils";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface SearchParams {
  source?: string;
}

export default async function RunsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getServerT();
  const sp = await searchParams;
  const source =
    sp.source === "eyes" || sp.source === "net" || sp.source === "manual" || sp.source === "runner" ? sp.source : undefined;
  const runs = await listTestRuns(source);

  return (
    <>
      <PageHeader
        title={t("runs.title")}
        description={t("runs.description")}
        action={
          <div className="flex items-center gap-2">
            <a
              href={`/api/runs/export${source ? `?source=${source}` : ""}`}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
              download
            >
              <Download size={14} /> CSV
            </a>
            <Link
              href="/runs/new"
              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus size={16} /> {t("runs.new")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex gap-2 text-xs">
        <SourceFilter value={undefined} current={source} label={t("runs.filter.all")} />
        <SourceFilter value="manual" current={source} label="Manual" />
        <SourceFilter value="eyes" current={source} label="Eyes" />
        <SourceFilter value="net" current={source} label="Net" />
        <SourceFilter value="runner" current={source} label="Runner" />
      </div>

      <div className="space-y-4">
        {runs.length === 0 && (
          <Card className="py-10 text-center text-sm text-[var(--muted)]">
            {t("runs.empty")}
          </Card>
        )}
        {runs.map((run) => {
          const s = summariseRun(run);
          const inProgress = run.source === "manual" && run.finishedAt === null;
          return (
            <Card key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SourceBadge source={run.source} />
                  <span className="font-medium">{run.label ?? run.suiteName ?? run.id}</span>
                  {run.suiteName && <span className="text-xs text-[var(--muted)]">{run.suiteName}</span>}
                  {inProgress && (
                    <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                      {t("runs.inProgress")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
                  {inProgress && (
                    <Link
                      href={`/runs/${run.id}/execute`}
                      className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                    >
                      {t("runs.continue")}
                    </Link>
                  )}
                  <span>pass {formatPercent(s.passRate, 0)}</span>
                  <span>{formatDuration(s.durationMs)}</span>
                  <span>{formatDateTime(run.startedAt)}</span>
                  <span>{run.triggeredBy}</span>
                </div>
              </div>
              <div className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {run.results.map((r, i) => (
                  <div key={`${r.testId}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="truncate">{r.title}</span>
                      {r.notes && <div className="text-xs text-[var(--muted)]">{r.notes}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--muted)]">
                      <span className="tabular-nums">{formatDuration(r.durationMs)}</span>
                      {r.evidence && (
                        <a href={r.evidence} className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer">
                          evidence
                        </a>
                      )}
                      {r.issueUrl && (
                        <a href={r.issueUrl} className="text-red-400 hover:underline" target="_blank" rel="noreferrer">
                          issue
                        </a>
                      )}
                      <ResultBadge status={r.status} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function SourceFilter({ value, current, label }: { value?: string; current?: string; label: string }) {
  const active = value === current;
  const href = value ? `/runs?source=${value}` : "/runs";
  return (
    <a
      href={href}
      className={
        active
          ? "rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1"
          : "rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[var(--muted)] hover:text-[var(--foreground)]"
      }
    >
      {label}
    </a>
  );
}
