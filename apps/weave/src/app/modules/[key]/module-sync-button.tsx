"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface SyncResult {
  scriptsSynced: number;
  runsSynced: number;
}

export function ModuleSyncButton({ moduleKey }: { moduleKey: string }) {
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
      setError("Síťová chyba — synchronizace selhala.");
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
        {busy ? "Synchronizuji…" : "Synchronizovat vše"}
      </button>
      {result && (
        <span className="text-sm text-emerald-400">
          Hotovo — skripty: {result.scriptsSynced}, běhy: {result.runsSynced}
        </span>
      )}
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
