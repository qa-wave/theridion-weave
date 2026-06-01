import Link from "next/link";
import { listTestCases, listTestPlans } from "@/data/store";
import { Card, PageHeader } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const t = await getServerT();
  const [plans, cases] = await Promise.all([listTestPlans(), listTestCases()]);
  const byId = new Map(cases.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        title={t("plans.title")}
        description={t("plans.description")}
      />
      {plans.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[var(--muted)]">
          <span>{t("plans.empty")}</span>
          <Link href="/cases" className="text-[var(--accent)] hover:underline">
            {t("plans.empty.goToCases")}
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((p) => {
            const planCases = p.testCaseIds.map((id) => byId.get(id)).filter((c) => c !== undefined);
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
                  {planCases.map((c) => (
                    <Link
                      key={c.id}
                      href={`/cases/${c.id}`}
                      className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-sm hover:opacity-90"
                    >
                      <span className="truncate">{c.title}</span>
                      <span className="text-xs text-[var(--muted)]">{c.priority}</span>
                    </Link>
                  ))}
                </div>
                <div className="mt-3 text-xs text-[var(--muted)]">{planCases.length} {t("plans.caseCount")}</div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
