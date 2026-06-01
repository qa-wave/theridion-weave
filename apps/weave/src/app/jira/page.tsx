import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { listTestCases, listTestScripts, listTestRuns } from "@/data/store";
import { maskSettings } from "@/lib/integrations";
import { loadSettings } from "@/lib/integrations.server";
import { Card, CaseStatusBadge, PageHeader, ScriptStatusBadge, RunStatusBadge, Tag } from "@/components/ui";
import { JiraSyncButton } from "./jira-sync-button";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function JiraPage() {
  const t = await getServerT();
  const [settings, cases, scripts, runs] = await Promise.all([
    loadSettings(),
    listTestCases(),
    listTestScripts(),
    listTestRuns(),
  ]);
  const view = maskSettings(settings);
  const jiraEnabled = view.jira.enabled;
  const baseUrl = settings.jira.baseUrl;

  const syncedCases = cases.filter((c) => c.jiraKey);
  const syncedScripts = scripts.filter((s) => s.jiraKey);
  const syncedRuns = runs.filter((r) => r.jiraKey);

  return (
    <>
      <PageHeader
        title={t("jira.title")}
        description={t("jira.description")}
      />

      {!jiraEnabled && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/5">
          <p className="text-sm text-amber-300">
            {t("jira.notConfigured")}{" "}
            <Link href="/settings" className="underline hover:text-[var(--foreground)]">
              {t("jira.notConfigured.goSettings")}
            </Link>{" "}
            a nakonfiguruj Jira.
          </p>
        </Card>
      )}

      <div className="space-y-6">
        {/* Test cases */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t("jira.cases.title")} ({syncedCases.length} synced)</h2>
          <div className="divide-y divide-[var(--border)]">
            {cases.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="truncate">{c.title}</span>
                  <CaseStatusBadge status={c.status} />
                  {c.jiraKey && (
                    <a
                      href={`${baseUrl}/browse/${c.jiraKey}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      {c.jiraKey} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <JiraSyncButton entity="test" id={c.id} />
              </div>
            ))}
            {cases.length === 0 && <div className="py-4 text-sm text-[var(--muted)]">{t("jira.cases.empty")}</div>}
          </div>
        </Card>

        {/* Scripts */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t("jira.scripts.title")} ({syncedScripts.length} synced)</h2>
          <div className="divide-y divide-[var(--border)]">
            {scripts.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="truncate">{s.name}</span>
                  <Tag>{s.product}</Tag>
                  <ScriptStatusBadge status={s.status} />
                  {s.jiraKey && (
                    <a
                      href={`${baseUrl}/browse/${s.jiraKey}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      {s.jiraKey} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <JiraSyncButton entity="script" id={s.id} />
              </div>
            ))}
            {scripts.length === 0 && <div className="py-4 text-sm text-[var(--muted)]">{t("jira.scripts.empty")}</div>}
          </div>
        </Card>

        {/* Runs */}
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t("jira.runs.title")} ({syncedRuns.length} synced)</h2>
          <div className="divide-y divide-[var(--border)]">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="truncate">{r.label ?? r.suiteName ?? r.id}</span>
                  <RunStatusBadge status={r.runStatus} />
                  {r.jiraKey && (
                    <a
                      href={`${baseUrl}/browse/${r.jiraKey}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      {r.jiraKey} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <JiraSyncButton entity="run" id={r.id} />
              </div>
            ))}
            {runs.length === 0 && <div className="py-4 text-sm text-[var(--muted)]">{t("jira.runs.empty")}</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
