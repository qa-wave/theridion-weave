import { notFound } from "next/navigation";
import { loadSettings } from "@/lib/integrations.server";
import { INTEGRATION_META, isLocalModule } from "@/lib/integrations";
import type { IntegrationKey } from "@/lib/integrations";
import { listTestScripts, listTestRuns } from "@/data/store";
import { PageHeader, Card, ScriptStatusBadge, SourceBadge } from "@/components/ui";
import { ModuleSyncButton } from "./module-sync-button";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ key: string }>;
}

export default async function ModulePage({ params }: Props) {
  const { key } = await params;

  if (!isLocalModule(key as IntegrationKey)) notFound();

  const moduleKey = key as IntegrationKey;
  const settings = await loadSettings();
  const cfg = settings[moduleKey];

  if (!cfg.installed) notFound();

  const meta = INTEGRATION_META[moduleKey];

  // Load scripts and runs for this module.
  const [scripts, runs] = await Promise.all([
    listTestScripts({ product: moduleKey === "runner" ? "net" : (moduleKey as "eyes" | "net") }),
    listTestRuns(moduleKey as import("@/lib/types").RunSource),
  ]);

  const recentRuns = runs.slice(0, 10);

  return (
    <>
      <PageHeader
        title={meta.label}
        description={meta.hint}
      />

      {/* Connection state */}
      <Card className="mb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${cfg.enabled ? "bg-emerald-400" : "bg-zinc-500"}`}
            />
            <span className="text-sm font-medium">
              {cfg.enabled ? "Aktivní" : "Neaktivní"}
            </span>
          </div>
          {cfg.installPath && (
            <p className="text-xs text-[var(--muted)]">Instalační cesta: {cfg.installPath}</p>
          )}
          {cfg.baseUrl && (
            <p className="text-xs text-[var(--muted)]">Base URL: {cfg.baseUrl}</p>
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
          Synchronizované skripty ({scripts.length})
        </h2>
        {scripts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Žádné skripty. Spusť &quot;Synchronizovat vše&quot; pro import spec souborů z modulu.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Název</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Cesta</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Status</th>
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
          Poslední běhy z modulu ({recentRuns.length})
        </h2>
        {recentRuns.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Žádné záznamy o běhu.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Suite</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Zdroj</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Spuštěno</th>
                  <th className="px-4 py-2 text-right font-medium text-[var(--muted)]">Výsledky</th>
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
                        {new Date(run.startedAt).toLocaleString("cs-CZ")}
                      </td>
                      <td className="px-4 py-2 text-right text-xs">
                        <span className="text-emerald-400">{pass}P</span>
                        {" / "}
                        <span className="text-red-400">{fail}F</span>
                        {" / "}
                        <span className="text-[var(--muted)]">{total} celkem</span>
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
