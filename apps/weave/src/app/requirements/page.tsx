import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { requirementCoverageMatrix } from "@/data/store";
import { Card, PageHeader } from "@/components/ui";
import { RequirementStatusBadge, RequirementPriorityBadge } from "@/components/requirement-badges";
import { formatPercent } from "@/lib/utils";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  const t = await getServerT();
  const matrix = await requirementCoverageMatrix();

  return (
    <>
      <PageHeader
        title={t("requirements.title")}
        description={t("requirements.description")}
        action={
          <Link
            href="/requirements/new"
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> {t("requirements.new")}
          </Link>
        }
      />

      {matrix.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-[var(--muted)]">{t("requirements.empty")}</p>
          <Link
            href="/requirements/new"
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> {t("requirements.empty.createFirst")}
          </Link>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">{t("requirements.table.requirement")}</th>
                <th className="px-4 py-3 font-medium">{t("requirements.table.priority")}</th>
                <th className="px-4 py-3 font-medium">{t("requirements.table.status")}</th>
                <th className="px-4 py-3 font-medium">{t("requirements.table.cases")}</th>
                <th className="px-4 py-3 font-medium">{t("requirements.table.coverage")}</th>
                <th className="px-4 py-3 font-medium">{t("requirements.table.tracker")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {matrix.map(({ requirement: req, totalCases, coveredCases, coveragePct }) => (
                <tr key={req.id} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/requirements/${req.id}`}
                      className="font-medium hover:text-[var(--accent)] hover:underline"
                    >
                      {req.title}
                    </Link>
                    {req.description && (
                      <p className="mt-0.5 text-xs text-[var(--muted)] line-clamp-1">{req.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RequirementPriorityBadge priority={req.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <RequirementStatusBadge status={req.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {coveredCases}/{totalCases}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <div
                          className={
                            coveragePct === 100
                              ? "h-full bg-emerald-500"
                              : coveragePct > 0
                                ? "h-full bg-amber-500"
                                : "h-full bg-[var(--surface-2)]"
                          }
                          style={{ width: `${coveragePct}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs text-[var(--muted)]">
                        {formatPercent(coveragePct, 0)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {req.externalUrl ? (
                      <a
                        href={req.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                      >
                        <ExternalLink size={12} /> {t("requirements.table.link")}
                      </a>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
