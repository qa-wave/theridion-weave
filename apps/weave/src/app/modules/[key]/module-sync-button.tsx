"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/context";

interface SyncResult {
  scriptsSynced: number;
  runsSynced: number;
}

export function ModuleSyncButton({ moduleKey }: { moduleKey: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/modules/${moduleKey}/sync`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
      } else {
        const data = (await res.json()) as SyncResult;
        setResult(data);
      }
    } catch {
      setError(t("moduleSyncButton.error.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleSync}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        {busy ? t("moduleSyncButton.syncing") : t("moduleSyncButton.sync")}
      </button>
      {result && (
        <span className="text-sm text-emerald-400">
          {t("moduleSyncButton.done", { scripts: result.scriptsSynced, runs: result.runsSynced })}
        </span>
      )}
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
