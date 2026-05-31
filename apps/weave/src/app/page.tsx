import Link from "next/link";
import { Plus } from "lucide-react";
import { coverage, listTestCases, recentRunSummaries, totalsBySource } from "@/data/store";
import { Card, PageHeader, ResultBadge, SourceBadge, StatTile } from "@/components/ui";
import { formatPercent, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [cases, cov, summaries, totals] = await Promise.all([
    listTestCases(),
    coverage(),
    recentRunSummaries(6),
    totalsBySource(),
  ]);

  if (cases.length === 0) {
    return (
      <>
        <PageHeader title="Přehled" description="Test management napříč manuálními scénáři a běhy z Eyes a Net." />
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-[var(--muted)]">Zatím tu nejsou žádné test cases.</p>
          <Link
            href="/cases/new"
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> Vytvořte první test case
          </Link>
        </Card>
      </>
    );
  }

  const critical = cases.filter((c) => c.priority === "critical" && c.status === "active").length;

  return (
    <>
      <PageHeader
        title="Přehled"
        description="Stav test managementu napříč manuálními scénáři a automatizovanými běhy z Eyes a Net."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Test cases" value={cov.total} hint={`${cov.active} aktivních`} />
        <StatTile label="Pokrytí" value={formatPercent(cov.coveragePct, 0)} hint={`${cov.covered}/${cov.active} má passing běh`} accent />
        <StatTile label="Kritické aktivní" value={critical} hint="priority = critical" />
        <StatTile label="Zdroje běhů" value={3} hint="Manual · Eyes · Net" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-[var(--muted)]">Výsledky podle zdroje</h2>
          <div className="space-y-3">
            {totals.map((t) => {
              const passRate = t.total === 0 ? 0 : (t.pass / t.total) * 100;
              return (
                <div key={t.source} className="flex items-center gap-3">
                  <div className="w-16">
                    <SourceBadge source={t.source} />
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${passRate}%` }} />
                  </div>
                  <div className="w-28 text-right text-xs tabular-nums text-[var(--muted)]">
                    {t.pass}/{t.total} pass
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--muted)]">Poslední běhy</h2>
            <Link href="/runs" className="text-xs text-[var(--accent)] hover:underline">
              Vše →
            </Link>
          </div>
          <div className="space-y-2">
            {summaries.length === 0 && <p className="text-sm text-[var(--muted)]">Zatím žádné běhy.</p>}
            {summaries.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <SourceBadge source={s.source} />
                  <span className="text-sm">{s.label}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                  <span className="tabular-nums">{formatPercent(s.passRate, 0)}</span>
                  <span>{formatRelativeTime(s.startedAt)}</span>
                  {s.fail > 0 ? <ResultBadge status="fail" /> : <ResultBadge status="pass" />}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
