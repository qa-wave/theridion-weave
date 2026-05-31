import Link from "next/link";
import { Plus } from "lucide-react";
import { listTestScripts } from "@/data/store";
import { Card, PageHeader, ScriptStatusBadge, Tag } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SearchParams {
  product?: string;
  status?: string;
}

export default async function ScriptsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const scripts = await listTestScripts({ product: sp.product, status: sp.status });
  const hasFilter = Boolean(sp.product || sp.status);

  return (
    <>
      <PageHeader
        title="Skripty"
        description="Automatizované testovací skripty — Eyes (FE) a Net (BE). Filtruj podle produktu nebo stavu."
        action={
          <Link
            href="/scripts/new"
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> Nový skript
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <FilterLink param="product" value="eyes" current={sp.product} label="Eyes" />
        <FilterLink param="product" value="net" current={sp.product} label="Net" />
        <FilterLink param="status" value="active" current={sp.status} label="active" />
        <FilterLink param="status" value="flaky" current={sp.status} label="flaky" />
        <FilterLink param="status" value="draft" current={sp.status} label="draft" />
        {hasFilter && (
          <Link href="/scripts" className="text-[var(--accent)] hover:underline">
            × zrušit filtry
          </Link>
        )}
      </div>

      <Card className="p-0">
        <div className="divide-y divide-[var(--border)]">
          {scripts.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-[var(--muted)]">
              {hasFilter ? (
                <>Žádné skripty neodpovídají filtru.</>
              ) : (
                <>
                  <span>Zatím žádné skripty.</span>
                  <Link href="/scripts/new" className="text-[var(--accent)] hover:underline">
                    + Vytvořit první skript
                  </Link>
                </>
              )}
            </div>
          )}
          {scripts.map((s) => (
            <Link key={s.id} href={`/scripts/${s.id}`} className="block px-5 py-4 hover:bg-[var(--surface-2)]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{s.name}</span>
                    <Tag>{s.product}</Tag>
                    <ScriptStatusBadge status={s.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{s.framework}</span>
                    {s.specPath && <><span>·</span><span className="font-mono">{s.specPath}</span></>}
                    <span>·</span>
                    <span>{s.owner}</span>
                    {s.jiraKey && (
                      <><span>·</span><Tag>Jira: {s.jiraKey}</Tag></>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-[var(--muted)]">{formatRelativeTime(s.updatedAt)}</span>
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
      href={`/scripts?${param}=${encodeURIComponent(value)}`}
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
