import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTestScript } from "@/data/store";
import { Card, PageHeader, ScriptStatusBadge, Tag } from "@/components/ui";
import { WorkflowControl } from "@/components/workflow-control";
import { nextScriptStates } from "@/lib/workflow";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ScriptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scr = await getTestScript(id);
  if (!scr) notFound();

  const next = nextScriptStates(scr.status);

  return (
    <>
      <Link href="/scripts" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft size={14} /> Skripty
      </Link>
      <PageHeader
        title={scr.name}
        action={
          <div className="flex items-center gap-2">
            <Tag>{scr.product}</Tag>
            <ScriptStatusBadge status={scr.status} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {next.length > 0 && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">Workflow</h2>
              <WorkflowControl
                apiPath={`/api/scripts/${scr.id}`}
                currentStatus={scr.status}
                nextStates={next}
                statusField="status"
                label="Přejít na"
              />
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">Historie stavů</h2>
            {scr.statusHistory.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Žádná historie.</p>
            ) : (
              <div className="space-y-2">
                {[...scr.statusHistory].reverse().map((h, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs">
                    <span className="font-mono text-[var(--muted)]">{h.from}</span>
                    <span className="text-[var(--muted)]">→</span>
                    <span className="font-mono font-medium">{h.to}</span>
                    <span className="ml-auto text-[var(--muted)]">{h.by}</span>
                    <span className="text-[var(--muted)]">{formatDateTime(h.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--muted)]">Produkt</dt>
                <dd><Tag>{scr.product}</Tag></dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Framework</dt>
                <dd>{scr.framework}</dd>
              </div>
              {scr.specPath && (
                <div>
                  <dt className="text-xs text-[var(--muted)]">Spec path</dt>
                  <dd className="font-mono text-xs">{scr.specPath}</dd>
                </div>
              )}
              {scr.caseKey && (
                <div>
                  <dt className="text-xs text-[var(--muted)]">Case key</dt>
                  <dd className="font-mono text-xs">{scr.caseKey}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-[var(--muted)]">Owner</dt>
                <dd>{scr.owner}</dd>
              </div>
              {scr.jiraKey && (
                <div>
                  <dt className="text-xs text-[var(--muted)]">Jira</dt>
                  <dd>
                    <Tag>
                      <a
                        href={`https://tomasmertin.atlassian.net/browse/${scr.jiraKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {scr.jiraKey}
                      </a>
                    </Tag>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-[var(--muted)]">Vytvořeno</dt>
                <dd>{formatDateTime(scr.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Upraveno</dt>
                <dd>{formatDateTime(scr.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
