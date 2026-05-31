import Link from "next/link";
import { getTestCase, listTestPlans } from "@/data/store";
import { Card, PageHeader } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function PlansPage() {
  const plans = listTestPlans();

  return (
    <>
      <PageHeader
        title="Test plány"
        description="Sady test cases spouštěné dohromady — typicky před releasem nebo jako regrese."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => {
          const cases = p.testCaseIds.map(getTestCase).filter(Boolean);
          return (
            <Card key={p.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">{p.name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{p.description}</p>
                </div>
                <span className="text-xs text-[var(--muted)]">{formatRelativeTime(p.updatedAt)}</span>
              </div>
              <div className="mt-4 space-y-1.5">
                {cases.map((c) => (
                  <Link
                    key={c!.id}
                    href={`/cases/${c!.id}`}
                    className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-sm hover:opacity-90"
                  >
                    <span className="truncate">{c!.title}</span>
                    <span className="text-xs text-[var(--muted)]">{c!.priority}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-3 text-xs text-[var(--muted)]">{cases.length} test cases</div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
