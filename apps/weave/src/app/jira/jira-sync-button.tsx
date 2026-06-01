"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/context";

type MirrorEntity = "test" | "script" | "run";

interface Props {
  entity: MirrorEntity;
  id: string;
}

export function JiraSyncButton({ entity, id }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ jiraKey?: string; error?: string } | null>(null);

  async function sync() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/jira/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setResult({ error: (body as { error?: string }).error ?? t("jiraSyncButton.error.default") });
    } else {
      setResult({ jiraKey: (body as { jiraKey?: string }).jiraKey });
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={sync}
        className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs hover:border-[var(--accent)] disabled:opacity-50"
      >
        <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
        {t("jiraSyncButton.sync")}
      </button>
      {result?.jiraKey && <span className="text-xs text-emerald-400">{result.jiraKey}</span>}
      {result?.error && <span className="text-xs text-red-400">{result.error}</span>}
    </span>
  );
}
