import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTestCase, listTestRuns } from "@/data/store";
import { Card, CaseStatusBadge, PageHeader, PriorityBadge, ResultBadge, Tag } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tc = getTestCase(id);
  if (!tc) notFound();

  // results referencing this case across all runs
  const related = listTestRuns()
    .flatMap((r) => r.results.filter((res) => res.testId === tc.id).map((res) => ({ run: r, res })))
    .slice(0, 10);

  return (
    <>
      <Link href="/cases" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft size={14} /> Test cases
      </Link>
      <PageHeader
        title={tc.title}
        action={<div className="flex items-center gap-2"><PriorityBadge priority={tc.priority} /><CaseStatusBadge status={tc.status} /></div>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">Popis</h2>
            <p className="text-sm">{tc.description || "—"}</p>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">Kroky</h2>
            <ol className="space-y-3">
              {tc.steps.length === 0 && <li className="text-sm text-[var(--muted)]">Bez kroků.</li>}
              {tc.steps.map((s) => (
                <li key={s.order} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-xs">
                    {s.order}
                  </span>
                  <div>
                    <div className="text-sm">{s.action}</div>
                    {s.expectedResult && <div className="mt-0.5 text-xs text-[var(--muted)]">→ {s.expectedResult}</div>}
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-lg bg-[var(--surface-2)] p-3 text-sm">
              <span className="text-[var(--muted)]">Očekávaný výsledek: </span>
              {tc.expectedResult || "—"}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">Výskyt v bězích</h2>
            <div className="space-y-2">
              {related.length === 0 && <div className="text-sm text-[var(--muted)]">Zatím žádné běhy.</div>}
              {related.map(({ run, res }, i) => (
                <div key={`${run.id}-${i}`} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm">
                  <span>{run.label ?? run.id}</span>
                  <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                    <span>{formatDateTime(run.startedAt)}</span>
                    <ResultBadge status={res.status} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--muted)]">Owner</dt>
                <dd>{tc.owner}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Tagy</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {tc.tags.length ? tc.tags.map((t) => <Tag key={t}>#{t}</Tag>) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Vytvořeno</dt>
                <dd>{formatDateTime(tc.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Upraveno</dt>
                <dd>{formatDateTime(tc.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
