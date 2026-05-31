import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTestRun, getTestCase, getTestPlan } from "@/data/store";
import { Card, PageHeader, ResultBadge } from "@/components/ui";
import { ExecuteRunForm } from "./execute-run-form";
import type { TestCase } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExecuteRunPage({ params }: Props) {
  const { id } = await params;
  const run = await getTestRun(id);
  if (!run) notFound();

  // Resolve plan name
  const plan = run.planId ? await getTestPlan(run.planId) : undefined;

  // Enrich results with full case details for step rendering
  const enriched = await Promise.all(
    run.results.map(async (result) => {
      const tc: TestCase | undefined = await getTestCase(result.testId);
      return { result, tc };
    }),
  );

  const done = run.finishedAt !== null;

  return (
    <>
      <Link
        href="/runs"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft size={14} /> Běhy
      </Link>
      <PageHeader
        title={plan ? `Provádění: ${plan.name}` : "Provádění běhu"}
        description={
          done
            ? "Běh je dokončen."
            : `${run.results.filter((r) => r.status !== "skip").length} / ${run.results.length} cases ohodnoceno`
        }
      />

      {done && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Běh dokončen. Všechny cases byly ohodnoceny.{" "}
          <Link href="/runs" className="underline">
            Zpět na přehled
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {enriched.map(({ result, tc }, index) => (
          <Card key={result.testId}>
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted)]">#{index + 1}</span>
                  <span className="font-medium">{result.title}</span>
                  <ResultBadge status={result.status} />
                </div>
                {tc?.description && (
                  <p className="mt-1 text-xs text-[var(--muted)]">{tc.description}</p>
                )}
              </div>
            </div>

            {tc && tc.steps.length > 0 && (
              <div className="mb-4 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] text-sm">
                {tc.steps.map((step) => (
                  <div key={step.order} className="flex gap-3 px-3 py-2">
                    <span className="shrink-0 text-xs font-medium text-[var(--muted)]">{step.order}.</span>
                    <div className="min-w-0">
                      <div>{step.action}</div>
                      {step.expectedResult && (
                        <div className="text-xs text-[var(--muted)]">→ {step.expectedResult}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tc?.expectedResult && (
              <p className="mb-4 text-xs text-[var(--muted)]">
                <span className="font-medium">Očekávaný výsledek:</span> {tc.expectedResult}
              </p>
            )}

            <ExecuteRunForm
              runId={run.id}
              testId={result.testId}
              currentStatus={result.status}
              currentNotes={result.notes ?? ""}
              currentEvidence={result.evidence ?? ""}
              disabled={done}
            />
          </Card>
        ))}
      </div>
    </>
  );
}
