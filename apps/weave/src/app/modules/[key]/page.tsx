import { notFound } from "next/navigation";
import { loadSettings } from "@/lib/integrations.server";
import { INTEGRATION_META, isLocalModule, installedModules } from "@/lib/integrations";
import type { IntegrationKey } from "@/lib/integrations";
import { listTestScripts, listTestRuns, getLastSeen } from "@/data/store";
import { maskSettings } from "@/lib/integrations";
import { PageHeader, Card, ScriptStatusBadge, SourceBadge } from "@/components/ui";
import { ModuleSyncButton } from "./module-sync-button";
import { getServerT, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ key: string }>;
}

export default async function ModulePage({ params }: Props) {
  const t = await getServerT();
  const locale = await getLocale();
  const { key } = await params;

  if (!isLocalModule(key as IntegrationKey)) notFound();

  const moduleKey = key as IntegrationKey;
  const settings = await loadSettings();
  const view = maskSettings(settings);

  const connected = installedModules(view);
  if (!connected.includes(moduleKey)) notFound();

  const cfg = settings[moduleKey];
  const meta = INTEGRATION_META[moduleKey];
  const ct = cfg.connectionType;

  const [scripts, runs, lastSeenRaw] = await Promise.all([
    listTestScripts({ product: moduleKey === "runner" ? "net" : (moduleKey as "eyes" | "net") }),
    listTestRuns(moduleKey as import("@/lib/types").RunSource),
    (moduleKey === "eyes" || moduleKey === "net" || moduleKey === "runner")
      ? getLastSeen(moduleKey as "eyes" | "net" | "runner")
      : Promise.resolve(null),
  ]);

  const recentRuns = runs.slice(0, 10);
  const ingestEndpoint = "/api/runs/ingest";

  function formatLastSeen(iso: string | null): string {
    if (!iso) return t("settings.lastSeen.never");
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.round(diffMs / 60_000);
    const diffHour = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHour / 24);
    if (diffMin < 2) return t("settings.lastSeen.justNow");
    if (diffMin < 60) return t("settings.lastSeen.minutesAgo", { n: diffMin });
    if (diffHour < 24) return t("settings.lastSeen.hoursAgo", { n: diffHour });
    if (diffDay === 1) return t("settings.lastSeen.yesterday");
    return t("settings.lastSeen.daysAgo", { n: diffDay });
  }

  const lastSeenLabel = formatLastSeen(lastSeenRaw);
  const hasReceivedPush = !!lastSeenRaw;

  const ctLabel = ct === "app"
    ? t("settings.connection.app")
    : ct === "service"
    ? t("settings.connection.service")
    : ct === "source"
    ? t("settings.connection.source")
    : "";

  return (
    <>
      <PageHeader
        title={meta.label}
        description={meta.hint}
      />

      {/* Connection state */}
      <Card className="mb-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${cfg.enabled ? "bg-emerald-400" : "bg-zinc-500"}`}
            />
            <span className="text-sm font-medium">
              {cfg.enabled ? t("module.connection.active") : t("module.connection.inactive")}
            </span>
            {ct && (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
                {ctLabel}
              </span>
            )}
          </div>

          {/* app type: show ingest endpoint + lastSeen */}
          {(ct === "app" || (!ct && cfg.installed && !cfg.installPath)) && (
            <div className="mt-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${hasReceivedPush ? "bg-emerald-400" : "bg-amber-400"}`}
                />
                <span className="text-sm">
                  {hasReceivedPush
                    ? t("module.connection.awaitingPush", { lastSeen: lastSeenLabel })
                    : t("module.connection.firstResult")}
                </span>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs">
                <p className="mb-1 font-medium text-[var(--muted)]">{t("module.connection.ingestEndpoint")}</p>
                <code className="font-mono text-[var(--foreground)]">{ingestEndpoint}</code>
              </div>
              {cfg.dataDir && (
                <p className="text-xs text-[var(--muted)]">{t("module.connection.dataDir")}{cfg.dataDir}</p>
              )}
            </div>
          )}

          {/* service type: show baseUrl */}
          {ct === "service" && cfg.baseUrl && (
            <p className="text-xs text-[var(--muted)]">{t("module.connection.baseUrl")}{cfg.baseUrl}</p>
          )}

          {/* source type: show installPath */}
          {(ct === "source" || (!ct && cfg.installPath)) && cfg.installPath && (
            <p className="text-xs text-[var(--muted)]">{t("module.connection.sourcePath")}{cfg.installPath}</p>
          )}
        </div>
      </Card>

      {/* Sync button */}
      <div className="mb-8">
        <ModuleSyncButton moduleKey={moduleKey} />
      </div>

      {/* Scripts synced from this module */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">
          {t("module.scripts.title")} ({scripts.length})
        </h2>
        {scripts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {ct === "app"
              ? t("module.scripts.empty.app")
              : t("module.scripts.empty.default")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">{t("module.scripts.col.name")}</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">{t("module.scripts.col.path")}</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">{t("module.scripts.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {scripts.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-[var(--muted)]">
                      {s.specPath ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <ScriptStatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent runs */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("module.runs.title")} ({recentRuns.length})
        </h2>
        {recentRuns.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {ct === "app"
              ? t("module.runs.empty.app")
              : t("module.runs.empty.default")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">{t("module.runs.col.suite")}</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">{t("module.runs.col.source")}</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">{t("module.runs.col.started")}</th>
                  <th className="px-4 py-2 text-right font-medium text-[var(--muted)]">{t("module.runs.col.results")}</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => {
                  const pass = run.results.filter((r) => r.status === "pass").length;
                  const fail = run.results.filter((r) => r.status === "fail").length;
                  const total = run.results.length;
                  return (
                    <tr key={run.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{run.suiteName ?? run.id}</td>
                      <td className="px-4 py-2">
                        <SourceBadge source={run.source} />
                      </td>
                      <td className="px-4 py-2 text-xs text-[var(--muted)]">
                        {new Date(run.startedAt).toLocaleString(locale === "cs" ? "cs-CZ" : "en-GB")}
                      </td>
                      <td className="px-4 py-2 text-right text-xs">
                        <span className="text-emerald-400">{pass}P</span>
                        {" / "}
                        <span className="text-red-400">{fail}F</span>
                        {" / "}
                        <span className="text-[var(--muted)]">{total} {t("module.runs.total")}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
