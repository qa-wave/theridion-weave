import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getRequirement, listTestCases } from "@/data/store";
import { Card, PageHeader, CaseStatusBadge, PriorityBadge } from "@/components/ui";
import { RequirementStatusBadge, RequirementPriorityBadge } from "@/components/requirement-badges";
import { formatDateTime } from "@/lib/utils";
import { getServerT } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function RequirementDetailPage({ params }: Props) {
  const t = await getServerT();
  const { id } = await params;
  const [req, allCases] = await Promise.all([getRequirement(id), listTestCases()]);
  if (!req) notFound();

  const linkedCases = allCases.filter((c) => req.caseIds.includes(c.id));

  return (
    <>
      <div className="mb-4">
        <Link
          href="/requirements"
          className="flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft size={14} /> {t("requirementDetail.backLink")}
        </Link>
      </div>

      <PageHeader
        title={req.title}
        description={`ID: ${req.id}`}
        action={
          <Link
            href={`/requirements/${req.id}/edit`}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
          >
            {t("requirementDetail.edit")}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">{t("requirementDetail.detail")}</h2>
            <p className="text-sm">{req.description || <span className="text-[var(--muted)]">{t("requirementDetail.noDescription")}</span>}</p>
            {req.externalUrl && (
              <a
                href={req.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
              >
                <ExternalLink size={14} /> {req.externalUrl}
              </a>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">{t("requirementDetail.linkedCases")} ({linkedCases.length})</h2>
            {linkedCases.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{t("requirementDetail.linkedCases.empty")}</p>
            ) : (
              <div className="space-y-2">
                {linkedCases.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2"
                  >
                    <Link
                      href={`/cases/${c.id}`}
                      className="text-sm hover:text-[var(--accent)] hover:underline"
                    >
                      {c.title}
                    </Link>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={c.priority} />
                      <CaseStatusBadge status={c.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">{t("requirementDetail.metadata")}</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[var(--muted)]">{t("requirementDetail.priority")}</dt>
                <dd><RequirementPriorityBadge priority={req.priority} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--muted)]">{t("requirementDetail.status")}</dt>
                <dd><RequirementStatusBadge status={req.status} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--muted)]">{t("requirementDetail.createdAt")}</dt>
                <dd className="text-[var(--muted)]">{formatDateTime(req.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--muted)]">{t("requirementDetail.updatedAt")}</dt>
                <dd className="text-[var(--muted)]">{formatDateTime(req.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
