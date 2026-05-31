import { listTestRuns } from "@/data/store";
import { summariseRun } from "@/lib/utils";
import { Card, PageHeader, ResultBadge, SourceBadge } from "@/components/ui";
import { formatDateTime, formatDuration, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SearchParams {
  source?: string;
}

export default async function RunsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const source = sp.source === "eyes" || sp.source === "net" || sp.source === "manual" ? sp.source : undefined;
  const runs = await listTestRuns(source);

  return (
    <>
      <PageHeader
        title="Běhy"
        description="Sloučený pohled na manuální běhy a automatizované výsledky z Eyes (FE) a Net (BE)."
      />

      <div className="mb-4 flex gap-2 text-xs">
        <SourceFilter value={undefined} current={source} label="Vše" />
        <SourceFilter value="manual" current={source} label="Manual" />
        <SourceFilter value="eyes" current={source} label="Eyes" />
        <SourceFilter value="net" current={source} label="Net" />
      </div>

      <div className="space-y-4">
        {runs.length === 0 && (
          <Card className="py-10 text-center text-sm text-[var(--muted)]">
            Zatím žádné běhy. Spusť testy v Eyes/Net a nasměruj Runner na <code>/api/runs/ingest</code>, nebo přidej manuální běh přes API.
          </Card>
        )}
        {runs.map((run) => {
          const s = summariseRun(run);
          return (
            <Card key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SourceBadge source={run.source} />
                  <span className="font-medium">{run.label ?? run.suiteName ?? run.id}</span>
                  {run.suiteName && <span className="text-xs text-[var(--muted)]">{run.suiteName}</span>}
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
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
