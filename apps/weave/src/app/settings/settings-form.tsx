"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, HardDrive, Monitor, Server, FolderCode, Unplug } from "lucide-react";
import type { ConnectionType, IntegrationKey, WeaveSettingsView } from "@/lib/integrations";
import { INTEGRATION_META, isLocalModule } from "@/lib/integrations";
import { useT } from "@/lib/i18n/context";

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
  installed?: boolean;
  installPath?: string;
  connectionType?: ConnectionType;
  dataDir?: string;
}

type WizardStep =
  | "idle"
  | "ask"
  | "choose-type"
  | "enter-app"
  | "enter-service"
  | "enter-path"
  | "download";

interface WizardState {
  step: WizardStep;
  chosenType: ConnectionType | null;
  pathInput: string;
  urlInput: string;
  tokenInput: string;
  dataDirInput: string;
  verifying: boolean;
  verifyError: string | null;
  copied: string | null;
}

const DEFAULT_WIZARD: WizardState = {
  step: "idle",
  chosenType: null,
  pathInput: "",
  urlInput: "",
  tokenInput: "",
  dataDirInput: "",
  verifying: false,
  verifyError: null,
  copied: null,
};

interface Props {
  initial: WeaveSettingsView;
  lastSeen: Record<IntegrationKey, string | null>;
  origin?: string;
}

const ALL_KEYS: IntegrationKey[] = [...STANDARD_KEYS, ...ATLASSIAN_KEYS];

type LastSeenResult = { label: string; healthy: boolean };

function computeLastSeen(
  iso: string | null,
  labels: {
    never: string;
    justNow: string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    yesterday: string;
    daysAgo: (n: number) => string;
  },
): LastSeenResult {
  if (!iso) return { label: labels.never, healthy: false };
  const d = new Date(iso);
  const nowMs = new Date().getTime();
  const diffMs = nowMs - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  let label: string;
  if (diffMin < 2) label = labels.justNow;
  else if (diffMin < 60) label = labels.minutesAgo(diffMin);
  else if (diffHour < 24) label = labels.hoursAgo(diffHour);
  else if (diffDay === 1) label = labels.yesterday;
  else label = labels.daysAgo(diffDay);
  return { label, healthy: diffMs < 24 * 60 * 60_000 };
}

export function SettingsForm({ initial, lastSeen, origin = "" }: Props) {
  const router = useRouter();
  const t = useT();
  const [rows, setRows] = useState<Record<IntegrationKey, RowState>>(() => {
    const r = {} as Record<IntegrationKey, RowState>;
    for (const k of ALL_KEYS) r[k] = { ...initial[k], token: "" };
    return r;
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [wizards, setWizards] = useState<Record<string, WizardState>>({});

  function getWizard(k: IntegrationKey): WizardState {
    return wizards[k] ?? DEFAULT_WIZARD;
  }

  function patchWizard(k: IntegrationKey, p: Partial<WizardState>) {
    setWizards((prev) => ({ ...prev, [k]: { ...(prev[k] ?? DEFAULT_WIZARD), ...p } }));
  }

  function patch(k: IntegrationKey, p: Partial<RowState>) {
    setSaved(false);
    setRows((prev) => ({ ...prev, [k]: { ...prev[k], ...p } }));
  }

  async function copyToClipboard(text: string, label: string, k: IntegrationKey) {
    try {
      await navigator.clipboard.writeText(text);
      patchWizard(k, { copied: label });
      setTimeout(() => patchWizard(k, { copied: null }), 2000);
    } catch {
      // Clipboard not available.
    }
  }

  function buildPayload(overrides?: Partial<Record<IntegrationKey, Partial<RowState>>>): Record<string, object> {
    const payload: Record<string, object> = {};
    for (const k of ALL_KEYS) {
      const row = { ...rows[k], ...(overrides?.[k] ?? {}) };
      const entry: Record<string, unknown> = {
        enabled: row.enabled,
        baseUrl: row.baseUrl,
      };
      if (row.token) entry.token = row.token;
      if (row.email !== undefined) entry.email = row.email;
      if (row.projectKey !== undefined) entry.projectKey = row.projectKey;
      if (row.spaceKey !== undefined) entry.spaceKey = row.spaceKey;
      if (row.statusTransitionMap !== undefined) entry.statusTransitionMap = row.statusTransitionMap;
      if (row.installed !== undefined) entry.installed = row.installed;
      if (row.installPath !== undefined) entry.installPath = row.installPath;
      if (row.connectionType !== undefined) entry.connectionType = row.connectionType;
      if (row.dataDir !== undefined) entry.dataDir = row.dataDir;
      payload[k] = entry;
    }
    return payload;
  }

  async function save() {
    setBusy(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
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

  async function persistConnection(k: IntegrationKey, overrides: Partial<RowState>) {
    patch(k, overrides);
    setBusy(true);
    const payload = buildPayload({ [k]: overrides });
    const saveRes = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (saveRes.ok) {
      const next = (await saveRes.json()) as WeaveSettingsView;
      setRows((prev) => {
        const r = { ...prev };
        for (const key of ALL_KEYS) r[key] = { ...next[key], token: "" };
        return r;
      });
      router.refresh();
    }
  }

  async function verifyAndConnectSource(k: IntegrationKey) {
    const wizard = getWizard(k);
    const pathVal = wizard.pathInput.trim();
    if (!pathVal) {
      patchWizard(k, { verifyError: t("wizard.verify.pathEmpty") });
      return;
    }
    patchWizard(k, { verifying: true, verifyError: null });

    const res = await fetch("/api/modules/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k, connectionType: "source", path: pathVal }),
    });
    const body = (await res.json()) as { ok?: boolean; detail?: string; error?: string };
    patchWizard(k, { verifying: false });

    if (!res.ok || !body.ok) {
      patchWizard(k, { verifyError: body.detail ?? body.error ?? t("wizard.verify.failed", { status: res.status }) });
      return;
    }

    patchWizard(k, { step: "idle", pathInput: "", verifyError: null });
    await persistConnection(k, {
      installed: true,
      installPath: pathVal,
      connectionType: "source",
      token: wizard.tokenInput || undefined,
    });
  }

  async function verifyAndConnectService(k: IntegrationKey) {
    const wizard = getWizard(k);
    const urlVal = wizard.urlInput.trim();
    if (!urlVal) {
      patchWizard(k, { verifyError: t("wizard.verify.urlEmpty") });
      return;
    }
    patchWizard(k, { verifying: true, verifyError: null });

    const res = await fetch("/api/modules/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k, connectionType: "service", baseUrl: urlVal }),
    });
    const body = (await res.json()) as { ok?: boolean; detail?: string; error?: string };
    patchWizard(k, { verifying: false });

    if (!res.ok || !body.ok) {
      patchWizard(k, { verifyError: body.detail ?? body.error ?? t("wizard.verify.failed", { status: res.status }) });
      return;
    }

    patchWizard(k, { step: "idle", urlInput: "", verifyError: null });
    await persistConnection(k, {
      installed: true,
      baseUrl: urlVal,
      connectionType: "service",
      enabled: true,
      token: wizard.tokenInput || undefined,
    });
  }

  async function connectApp(k: IntegrationKey) {
    const wizard = getWizard(k);
    const dataDirVal = wizard.dataDirInput.trim();

    if (dataDirVal) {
      patchWizard(k, { verifying: true, verifyError: null });
      const res = await fetch("/api/modules/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, connectionType: "app", dataDir: dataDirVal }),
      });
      const body = (await res.json()) as { ok?: boolean; detail?: string; error?: string };
      patchWizard(k, { verifying: false });

      if (!res.ok || !body.ok) {
        patchWizard(k, { verifyError: body.detail ?? body.error ?? t("wizard.verify.failed", { status: res.status }) });
        return;
      }
    }

    patchWizard(k, { step: "idle", dataDirInput: "", tokenInput: "", verifyError: null });
    await persistConnection(k, {
      installed: true,
      connectionType: "app",
      enabled: true,
      token: wizard.tokenInput || undefined,
      dataDir: dataDirVal || undefined,
    });
  }

  async function disconnect(k: IntegrationKey) {
    patchWizard(k, DEFAULT_WIZARD);
    await persistConnection(k, {
      installed: false,
      installPath: undefined,
      connectionType: undefined,
      dataDir: undefined,
    });
  }

  function connectionLabel(row: RowState): string {
    if (row.connectionType === "app") return t("settings.connection.app");
    if (row.connectionType === "service") return t("settings.connection.service");
    if (row.connectionType === "source") return t("settings.connection.source");
    return "";
  }

  function connectionDetail(row: RowState): string | null {
    if (row.connectionType === "source") return row.installPath ?? null;
    if (row.connectionType === "service") return row.baseUrl ?? null;
    return null;
  }

  const ingestEndpoint = `${origin}/api/runs/ingest`;

  return (
    <div className="space-y-4">
      {ALL_KEYS.map((k) => {
        const meta = INTEGRATION_META[k];
        const row = rows[k];
        const ls = computeLastSeen(lastSeen[k] ?? null, {
          never: t("settings.lastSeen.never"),
          justNow: t("settings.lastSeen.justNow"),
          minutesAgo: (n) => t("settings.lastSeen.minutesAgo", { n }),
          hoursAgo: (n) => t("settings.lastSeen.hoursAgo", { n }),
          yesterday: t("settings.lastSeen.yesterday"),
          daysAgo: (n) => t("settings.lastSeen.daysAgo", { n }),
        });
        const isAtlassian = k === "jira" || k === "confluence";
        const local = isLocalModule(k);
        const wizard = getWizard(k);
        const defaultCt: ConnectionType = meta.defaultConnectionType ?? "app";

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
                        title={ls.healthy ? t("settings.connection.healthy") : t("settings.connection.noData")}
                      />
                      <span className="text-xs text-[var(--muted)]">{t("settings.lastSeen.label")}{ls.label}</span>
                    </>
                  )}
                  {local && row.installed && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                      <HardDrive size={10} /> {connectionLabel(row) || t("settings.connection.installed")}
                    </span>
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

            {/* ── Local module install wizard ── */}
            {local && (
              <div className="mt-4">
                {row.installed ? (
                  /* Connected state */
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                    <Check size={14} className="shrink-0 text-emerald-400" />
                    <span className="text-sm text-emerald-300">
                      {connectionLabel(row) || t("settings.connection.installed")}
                      {connectionDetail(row) && (
                        <>: <span className="font-mono text-xs">{connectionDetail(row)}</span></>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void disconnect(k)}
                      disabled={busy}
                      className="ml-auto inline-flex items-center gap-1 rounded text-xs text-[var(--muted)] hover:text-red-400 disabled:opacity-50"
                    >
                      <Unplug size={12} /> {t("wizard.connected.disconnect")}
                    </button>
                  </div>
                ) : wizard.step === "idle" ? (
                  /* Trigger button */
                  <button
                    type="button"
                    onClick={() => patchWizard(k, { step: "ask" })}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
                  >
                    {t("wizard.integrate")}
                  </button>
                ) : wizard.step === "ask" ? (
                  /* Step 1: installed? */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">{t("wizard.ask.title")}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "choose-type", chosenType: defaultCt })}
                        className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm text-white hover:opacity-90"
                      >
                        {t("wizard.ask.yes")}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "download" })}
                        className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
                      >
                        {t("wizard.ask.no")}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, DEFAULT_WIZARD)}
                        className="ml-auto text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        {t("wizard.ask.cancel")}
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "choose-type" ? (
                  /* Step 2: choose connection type */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">{t("wizard.chooseType.title")}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "enter-app", chosenType: "app" })}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors hover:bg-[var(--surface)] ${
                          wizard.chosenType === "app"
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <Monitor size={18} />
                        <span className="font-medium">{t("wizard.chooseType.app.title")}</span>
                        <span className="text-center text-[var(--muted)]">
                          {t("wizard.chooseType.app.hint")}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "enter-service", chosenType: "service" })}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors hover:bg-[var(--surface)] ${
                          wizard.chosenType === "service"
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <Server size={18} />
                        <span className="font-medium">{t("wizard.chooseType.service.title")}</span>
                        <span className="text-center text-[var(--muted)]">
                          {t("wizard.chooseType.service.hint")}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "enter-path", chosenType: "source" })}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors hover:bg-[var(--surface)] ${
                          wizard.chosenType === "source"
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <FolderCode size={18} />
                        <span className="font-medium">{t("wizard.chooseType.source.title")}</span>
                        <span className="text-center text-[var(--muted)]">
                          {t("wizard.chooseType.source.hint")}
                        </span>
                      </button>
                    </div>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "ask" })}
                        className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        {t("wizard.chooseType.back")}
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "enter-app" ? (
                  /* Step 3a: app (push) */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">{t("wizard.enterApp.title")}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {t("wizard.enterApp.description", { label: meta.label })}
                    </p>

                    {/* Ingest URL */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        {t("wizard.enterApp.ingestUrl")}
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs">
                          {ingestEndpoint}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(ingestEndpoint, "url", k)}
                          title="Copy"
                          className="rounded p-1.5 hover:bg-[var(--surface)] text-[var(--muted)]"
                        >
                          {wizard.copied === "url" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Token */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        {t("settings.token")} {row.tokenSet && <span className="text-emerald-400">({t("settings.tokenSet")})</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          className={`${input} flex-1`}
                          type="text"
                          value={wizard.tokenInput}
                          onChange={(e) => patchWizard(k, { tokenInput: e.target.value })}
                          placeholder={row.tokenSet ? t("settings.token.placeholder.set") : t("settings.token.placeholder.empty")}
                        />
                        {wizard.tokenInput && (
                          <button
                            type="button"
                            onClick={() => void copyToClipboard(wizard.tokenInput, "token", k)}
                            title="Copy"
                            className="rounded p-1.5 hover:bg-[var(--surface)] text-[var(--muted)]"
                          >
                            {wizard.copied === "token" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Optional dataDir */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        {t("wizard.enterApp.dataDir")}{" "}
                        <span className="font-normal text-[var(--muted)]">({t("wizard.enterApp.dataDir.hint")})</span>
                      </label>
                      <input
                        className={input}
                        type="text"
                        value={wizard.dataDirInput}
                        onChange={(e) => patchWizard(k, { dataDirInput: e.target.value, verifyError: null })}
                        placeholder="/Users/user/Library/Application Support/theridion-eyes"
                      />
                    </div>

                    {wizard.verifyError && (
                      <p className="text-xs text-red-400">{wizard.verifyError}</p>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void connectApp(k)}
                        disabled={wizard.verifying}
                        className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {wizard.verifying ? t("wizard.enterApp.connecting") : t("wizard.enterApp.connect")}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "choose-type", verifyError: null })}
                        className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
                      >
                        {t("wizard.enterApp.back")}
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "enter-service" ? (
                  /* Step 3b: service (URL) */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">{t("wizard.enterService.title")}</p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{t("settings.baseUrl")}</label>
                      <input
                        className={input}
                        type="text"
                        placeholder="https://theridion-eyes.example.com"
                        value={wizard.urlInput}
                        onChange={(e) => patchWizard(k, { urlInput: e.target.value, verifyError: null })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void verifyAndConnectService(k);
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        {t("settings.token")} {row.tokenSet && <span className="text-emerald-400">({t("settings.tokenSet")})</span>}
                      </label>
                      <input
                        className={input}
                        type="password"
                        value={wizard.tokenInput}
                        onChange={(e) => patchWizard(k, { tokenInput: e.target.value })}
                        placeholder={row.tokenSet ? t("settings.token.placeholder.set") : t("settings.token.placeholder.empty")}
                      />
                    </div>
                    {wizard.verifyError && (
                      <p className="text-xs text-red-400">{wizard.verifyError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void verifyAndConnectService(k)}
                        disabled={wizard.verifying}
                        className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {wizard.verifying ? t("wizard.enterService.connecting") : t("wizard.enterService.connect")}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "choose-type", verifyError: null })}
                        className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
                      >
                        {t("wizard.enterService.back")}
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "enter-path" ? (
                  /* Step 3c: source checkout path */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">{t("wizard.enterPath.title")}</p>
                    <input
                      className={input}
                      type="text"
                      placeholder="/home/user/theridion-eyes"
                      value={wizard.pathInput}
                      onChange={(e) => patchWizard(k, { pathInput: e.target.value, verifyError: null })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void verifyAndConnectSource(k);
                      }}
                    />
                    {wizard.verifyError && (
                      <p className="text-xs text-red-400">{wizard.verifyError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void verifyAndConnectSource(k)}
                        disabled={wizard.verifying}
                        className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {wizard.verifying ? t("wizard.enterPath.connecting") : t("wizard.enterPath.connect")}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "choose-type", verifyError: null })}
                        className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
                      >
                        {t("wizard.enterPath.back")}
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "download" ? (
                  /* Step: download panel */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">{t("wizard.download.title")}</p>
                    {meta.downloadUrl && (
                      <a
                        href={meta.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm text-white hover:opacity-90"
                      >
                        <Download size={14} /> {t("wizard.download.button")}
                      </a>
                    )}
                    {meta.installHint && (
                      <p className="text-xs text-[var(--muted)]">{meta.installHint}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => patchWizard(k, { step: "choose-type", chosenType: defaultCt, verifyError: null })}
                      className="text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      {t("wizard.download.alreadyHave")}
                    </button>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => patchWizard(k, DEFAULT_WIZARD)}
                        className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        {t("wizard.download.cancel")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(!local || !row.installed || row.connectionType === "service" || !row.connectionType) && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{t("settings.baseUrl")}</label>
                  <input
                    className={input}
                    disabled={!row.enabled}
                    value={row.baseUrl}
                    onChange={(e) => patch(k, { baseUrl: e.target.value })}
                    placeholder={meta.defaultUrl}
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                  {t("settings.token")} {row.tokenSet && <span className="text-emerald-400">({t("settings.tokenSet")})</span>}
                </label>
                <input
                  className={input}
                  type="password"
                  disabled={!row.enabled}
                  value={row.token}
                  onChange={(e) => patch(k, { token: e.target.value })}
                  placeholder={row.tokenSet ? t("settings.token.placeholder.set") : t("settings.token.placeholder.empty")}
                />
              </div>
              {isAtlassian && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{t("settings.email")}</label>
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
                        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{t("settings.projectKey")}</label>
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
                          {t("settings.statusMap")}
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
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{t("settings.spaceKey")}</label>
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
          {busy ? t("settings.saving") : t("settings.save")}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <Check size={16} /> {t("settings.saved")}
          </span>
        )}
      </div>
    </div>
  );
}
