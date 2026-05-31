"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, HardDrive, Monitor, Server, FolderCode, Unplug } from "lucide-react";
import type { ConnectionType, IntegrationKey, WeaveSettingsView } from "@/lib/integrations";
import { INTEGRATION_META, isLocalModule } from "@/lib/integrations";

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

/**
 * Wizard steps for local module install flow.
 *
 * idle         — no wizard open
 * ask          — "Do you have this module installed?"
 * choose-type  — select connection type (app / service / source)
 * enter-app    — enter token + optional dataDir (push-based, type=app)
 * enter-service — enter baseUrl + token (pull-based, type=service)
 * enter-path   — enter source-checkout path (type=source)
 * download     — module not yet installed; show download link
 */
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
  /** Connection type selected in choose-type step. */
  chosenType: ConnectionType | null;
  /** Input for source-checkout path. */
  pathInput: string;
  /** Input for base URL (service type). */
  urlInput: string;
  /** Input for token. */
  tokenInput: string;
  /** Input for optional dataDir (app type). */
  dataDirInput: string;
  verifying: boolean;
  verifyError: string | null;
  /** Copy-to-clipboard feedback. */
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
  /** Weave's own origin for building the ingest endpoint hint. */
  origin?: string;
}

const ALL_KEYS: IntegrationKey[] = [...STANDARD_KEYS, ...ATLASSIAN_KEYS];

export function SettingsForm({ initial, lastSeen, origin = "" }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<IntegrationKey, RowState>>(() => {
    const r = {} as Record<IntegrationKey, RowState>;
    for (const k of ALL_KEYS) r[k] = { ...initial[k], token: "" };
    return r;
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Per-module install wizard state.
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

  /** Build the full settings payload for the PUT /api/settings call. */
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

  /** Persist connection state immediately after wizard completion. */
  async function persistConnection(
    k: IntegrationKey,
    overrides: Partial<RowState>,
  ) {
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

  /** Verify path with the server (source type) and, on success, persist. */
  async function verifyAndConnectSource(k: IntegrationKey) {
    const wizard = getWizard(k);
    const pathVal = wizard.pathInput.trim();
    if (!pathVal) {
      patchWizard(k, { verifyError: "Zadej cestu ke zdrojáku." });
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
      patchWizard(k, { verifyError: body.detail ?? body.error ?? `Ověření selhalo (HTTP ${res.status})` });
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

  /** Verify service URL and, on success, persist. */
  async function verifyAndConnectService(k: IntegrationKey) {
    const wizard = getWizard(k);
    const urlVal = wizard.urlInput.trim();
    if (!urlVal) {
      patchWizard(k, { verifyError: "Zadej Base URL služby." });
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
      patchWizard(k, { verifyError: body.detail ?? body.error ?? `Ověření selhalo (HTTP ${res.status})` });
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

  /** Connect app (push-based) — optionally verify dataDir. */
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
        patchWizard(k, { verifyError: body.detail ?? body.error ?? `Ověření selhalo (HTTP ${res.status})` });
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

  /** Disconnect (clear installed + connection fields), persist. */
  async function disconnect(k: IntegrationKey) {
    patchWizard(k, DEFAULT_WIZARD);
    await persistConnection(k, {
      installed: false,
      installPath: undefined,
      connectionType: undefined,
      dataDir: undefined,
    });
  }

  /** Derive connection label from row state. */
  function connectionLabel(row: RowState): string {
    if (row.connectionType === "app") return "Desktop aplikace (push)";
    if (row.connectionType === "service") return "Služba (URL)";
    if (row.connectionType === "source") return "Ze zdrojáku";
    return "";
  }

  /** Derive connected path/url label shown in the "connected" badge area. */
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
        const ls = formatLastSeen(lastSeen[k] ?? null);
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
                        title={ls.healthy ? "Aktivní" : "Žádná data"}
                      />
                      <span className="text-xs text-[var(--muted)]">Naposledy: {ls.label}</span>
                    </>
                  )}
                  {local && row.installed && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                      <HardDrive size={10} /> {connectionLabel(row) || "Nainstalováno"}
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
                      {connectionLabel(row) || "Nainstalováno"}
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
                      <Unplug size={12} /> Odpojit
                    </button>
                  </div>
                ) : wizard.step === "idle" ? (
                  /* Trigger button */
                  <button
                    type="button"
                    onClick={() => patchWizard(k, { step: "ask" })}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
                  >
                    Integrovat modul
                  </button>
                ) : wizard.step === "ask" ? (
                  /* Step 1: installed? */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">Máš tento modul nainstalovaný?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "choose-type", chosenType: defaultCt })}
                        className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm text-white hover:opacity-90"
                      >
                        Mám
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "download" })}
                        className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
                      >
                        Nemám
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, DEFAULT_WIZARD)}
                        className="ml-auto text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        Zrušit
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "choose-type" ? (
                  /* Step 2: choose connection type */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">Jak chceš modul připojit?</p>
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
                        <span className="font-medium">Desktop aplikace</span>
                        <span className="text-center text-[var(--muted)]">
                          Aplikace posílá výsledky sem (push)
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
                        <span className="font-medium">Jako služba (URL)</span>
                        <span className="text-center text-[var(--muted)]">
                          Self-hosted — Weave tahá z URL
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
                        <span className="font-medium">Ze zdrojáku</span>
                        <span className="text-center text-[var(--muted)]">
                          Cesta ke git repozitáři
                        </span>
                      </button>
                    </div>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "ask" })}
                        className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        Zpět
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "enter-app" ? (
                  /* Step 3a: app (push) — show ingest endpoint + token */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">Připojení jako desktop aplikace (push)</p>
                    <p className="text-xs text-[var(--muted)]">
                      Vlož tuto URL a token do nastavení publikování v{" "}
                      <span className="font-medium">{meta.label}</span> — aplikace bude
                      posílat výsledky sem automaticky.
                    </p>

                    {/* Ingest URL */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        Ingest URL
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs">
                          {ingestEndpoint}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(ingestEndpoint, "url", k)}
                          title="Kopírovat"
                          className="rounded p-1.5 hover:bg-[var(--surface)] text-[var(--muted)]"
                        >
                          {wizard.copied === "url" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Token */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        Token {row.tokenSet && <span className="text-emerald-400">(nastaven)</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          className={`${input} flex-1`}
                          type="text"
                          value={wizard.tokenInput}
                          onChange={(e) => patchWizard(k, { tokenInput: e.target.value })}
                          placeholder={row.tokenSet ? "•••• (ponech prázdné = beze změny)" : "vlož nebo vygeneruj token"}
                        />
                        {wizard.tokenInput && (
                          <button
                            type="button"
                            onClick={() => void copyToClipboard(wizard.tokenInput, "token", k)}
                            title="Kopírovat"
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
                        Datová složka aplikace{" "}
                        <span className="font-normal text-[var(--muted)]">(volitelné — pro offline sken specifikací)</span>
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
                        {wizard.verifying ? "Ověřuji…" : "Připojit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "choose-type", verifyError: null })}
                        className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
                      >
                        Zpět
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "enter-service" ? (
                  /* Step 3b: service (URL) */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">Připojení jako self-hosted služba</p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Base URL</label>
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
                        Token {row.tokenSet && <span className="text-emerald-400">(nastaven)</span>}
                      </label>
                      <input
                        className={input}
                        type="password"
                        value={wizard.tokenInput}
                        onChange={(e) => patchWizard(k, { tokenInput: e.target.value })}
                        placeholder={row.tokenSet ? "•••• (ponech prázdné = beze změny)" : "vlož token"}
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
                        {wizard.verifying ? "Ověřuji…" : "Ověřit a připojit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "choose-type", verifyError: null })}
                        className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
                      >
                        Zpět
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "enter-path" ? (
                  /* Step 3c: source checkout path */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">Cesta ke zdrojovému kódu modulu</p>
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
                        {wizard.verifying ? "Ověřuji…" : "Ověřit a připojit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchWizard(k, { step: "choose-type", verifyError: null })}
                        className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
                      >
                        Zpět
                      </button>
                    </div>
                  </div>
                ) : wizard.step === "download" ? (
                  /* Step: download panel */
                  <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-medium">Stáhni a nainstaluj modul</p>
                    {meta.downloadUrl && (
                      <a
                        href={meta.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm text-white hover:opacity-90"
                      >
                        <Download size={14} /> Stáhnout
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
                      Už mám — vybrat způsob připojení
                    </button>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => patchWizard(k, DEFAULT_WIZARD)}
                        className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        Zrušit
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {/* For local modules connected as 'app' or 'source', hide the Base URL field
                  (they don't use it; the UI would be confusing). For 'service' and non-local, show it. */}
              {(!local || !row.installed || row.connectionType === "service" || !row.connectionType) && (
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
              )}
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
