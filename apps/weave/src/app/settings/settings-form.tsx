"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { IntegrationKey, WeaveSettingsView } from "@/lib/integrations";
import { INTEGRATION_META } from "@/lib/integrations";

const STANDARD_KEYS: IntegrationKey[] = ["eyes", "net", "runner"];
const ATLASSIAN_KEYS: IntegrationKey[] = ["jira", "confluence"];
const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-40";

interface RowState {
  enabled: boolean;
  baseUrl: string;
  token: string;
  tokenSet: boolean;
  email?: string;
  projectKey?: string;
  spaceKey?: string;
  statusTransitionMap?: string;
}

/** Format an ISO timestamp as a short relative/absolute label. */
function formatLastSeen(iso: string | null): { label: string; healthy: boolean } {
  if (!iso) return { label: "Nikdy", healthy: false };
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  let label: string;
  if (diffMin < 2) label = "právě teď";
  else if (diffMin < 60) label = `před ${diffMin} min`;
  else if (diffHour < 24) label = `před ${diffHour} h`;
  else if (diffDay === 1) label = "včera";
  else label = `před ${diffDay} dny`;
  // Healthy = seen within 24 hours
  return { label, healthy: diffMs < 24 * 60 * 60_000 };
}

interface Props {
  initial: WeaveSettingsView;
  lastSeen: Record<IntegrationKey, string | null>;
}

const ALL_KEYS: IntegrationKey[] = [...STANDARD_KEYS, ...ATLASSIAN_KEYS];

export function SettingsForm({ initial, lastSeen }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<IntegrationKey, RowState>>(() => {
    const r = {} as Record<IntegrationKey, RowState>;
    for (const k of ALL_KEYS) r[k] = { ...initial[k], token: "" };
    return r;
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function patch(k: IntegrationKey, p: Partial<RowState>) {
    setSaved(false);
    setRows((prev) => ({ ...prev, [k]: { ...prev[k], ...p } }));
  }

  async function save() {
    setBusy(true);
    const payload: Record<string, object> = {};
    for (const k of ALL_KEYS) {
      const row = rows[k];
      const entry: Record<string, unknown> = { enabled: row.enabled, baseUrl: row.baseUrl };
      if (row.token) entry.token = row.token;
      if (row.email !== undefined) entry.email = row.email;
      if (row.projectKey !== undefined) entry.projectKey = row.projectKey;
      if (row.spaceKey !== undefined) entry.spaceKey = row.spaceKey;
      if (row.statusTransitionMap !== undefined) entry.statusTransitionMap = row.statusTransitionMap;
      payload[k] = entry;
    }
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) {
      const next = (await res.json()) as WeaveSettingsView;
      setRows((prev) => {
        const r = { ...prev };
        for (const k of ALL_KEYS) r[k] = { ...next[k], token: "" };
        return r;
      });
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {ALL_KEYS.map((k) => {
        const meta = INTEGRATION_META[k];
        const row = rows[k];
        const ls = formatLastSeen(lastSeen[k] ?? null);
        const isAtlassian = k === "jira" || k === "confluence";
        return (
          <div
            key={k}
            className={`rounded-xl border bg-[var(--surface)] p-5 ${row.enabled ? "border-[var(--accent)]/40" : "border-[var(--border)]"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{meta.label}</span>
                  {!isAtlassian && (
                    <>
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${ls.healthy ? "bg-emerald-400" : "bg-zinc-500"}`}
                        title={ls.healthy ? "Aktivní" : "Žádná data"}
                      />
                      <span className="text-xs text-[var(--muted)]">Naposledy: {ls.label}</span>
                    </>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{meta.hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={row.enabled}
                onClick={() => patch(k, { enabled: !row.enabled })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${row.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-2)] border border-[var(--border)]"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${row.enabled ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Base URL</label>
                <input
                  className={input}
                  disabled={!row.enabled}
                  value={row.baseUrl}
                  onChange={(e) => patch(k, { baseUrl: e.target.value })}
                  placeholder={meta.defaultUrl}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                  Token {row.tokenSet && <span className="text-emerald-400">(nastaven)</span>}
                </label>
                <input
                  className={input}
                  type="password"
                  disabled={!row.enabled}
                  value={row.token}
                  onChange={(e) => patch(k, { token: e.target.value })}
                  placeholder={row.tokenSet ? "•••••••• (ponech prázdné = beze změny)" : "vlož token"}
                />
              </div>
              {isAtlassian && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">E-mail (Basic auth)</label>
                    <input
                      className={input}
                      disabled={!row.enabled}
                      value={row.email ?? ""}
                      onChange={(e) => patch(k, { email: e.target.value })}
                      placeholder="you@example.com"
                    />
                  </div>
                  {k === "jira" && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Project key</label>
                        <input
                          className={input}
                          disabled={!row.enabled}
                          value={row.projectKey ?? ""}
                          onChange={(e) => patch(k, { projectKey: e.target.value })}
                          placeholder="CEPS"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                          Status → Jira transition map (JSON, e.g. {'{'}&#34;active&#34;:&#34;Start Progress&#34;{'}'})
                        </label>
                        <textarea
                          className={input}
                          disabled={!row.enabled}
                          rows={2}
                          value={row.statusTransitionMap ?? "{}"}
                          onChange={(e) => patch(k, { statusTransitionMap: e.target.value })}
                          placeholder="{}"
                        />
                      </div>
                    </>
                  )}
                  {k === "confluence" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Space key</label>
                      <input
                        className={input}
                        disabled={!row.enabled}
                        value={row.spaceKey ?? ""}
                        onChange={(e) => patch(k, { spaceKey: e.target.value })}
                        placeholder="CEPS"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Ukládám…" : "Uložit nastavení"}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <Check size={16} /> Uloženo
          </span>
        )}
      </div>
    </div>
  );
}
