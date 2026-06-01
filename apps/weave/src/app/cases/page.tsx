import Link from "next/link";
import { Plus } from "lucide-react";
import { allTags, listTestCases } from "@/data/store";
import { Card, CaseStatusBadge, PageHeader, PriorityBadge, Tag } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface SearchParams {
  tag?: string;
  priority?: string;
  status?: string;
}

export default async function CasesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getServerT();
  const sp = await searchParams;
  const cases = await listTestCases(sp);
  const tags = await allTags();
  const hasFilter = Boolean(sp.tag || sp.priority || sp.status);

  return (
    <>
      <PageHeader
        title={t("cases.title")}
        description={t("cases.description")}
        action={
          <Link
            href="/cases/new"
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> {t("cases.new")}
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <FilterLink param="status" value="active" current={sp.status} label="active" />
        <FilterLink param="status" value="draft" current={sp.status} label="draft" />
        <FilterLink param="priority" value="critical" current={sp.priority} label="critical" />
        <FilterLink param="priority" value="high" current={sp.priority} label="high" />
        {tags.map((tag) => (
          <FilterLink key={tag} param="tag" value={tag} current={sp.tag} label={`#${tag}`} />
        ))}
        {(sp.tag || sp.priority || sp.status) && (
          <Link href="/cases" className="text-[var(--accent)] hover:underline">
            {t("cases.filter.cancelFilters")}
          </Link>
        )}
      </div>

      <Card className="p-0">
        <div className="divide-y divide-[var(--border)]">
          {cases.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-[var(--muted)]">
              {hasFilter ? (
                <>{t("cases.empty.withFilter")}</>
              ) : (
                <>
                  <span>{t("cases.empty.noFilter")}</span>
                  <Link href="/cases/new" className="text-[var(--accent)] hover:underline">
                    {t("cases.empty.createFirst")}
                  </Link>
                </>
              )}
            </div>
          )}
          {cases.map((c) => (
            <Link key={c.id} href={`/cases/${c.id}`} className="block px-5 py-4 hover:bg-[var(--surface-2)]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{c.title}</span>
                    <PriorityBadge priority={c.priority} />
                    <CaseStatusBadge status={c.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{c.owner}</span>
                    <span>·</span>
                    <span>{c.steps.length} {t("cases.step.count")}</span>
                    {c.tags.map((tag) => (
                      <Tag key={tag}>#{tag}</Tag>
                    ))}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-[var(--muted)]">{formatRelativeTime(c.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}

function FilterLink({ param, value, current, label }: { param: string; value: string; current?: string; label: string }) {
  const active = current === value;
  return (
    <Link
      href={`/cases?${param}=${encodeURIComponent(value)}`}
      className={
        active
          ? "rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1 text-[var(--foreground)]"
          : "rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[var(--muted)] hover:text-[var(--foreground)]"
      }
    >
      {label}
    </Link>
  );
}
