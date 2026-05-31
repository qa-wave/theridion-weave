"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  apiPath: string; // e.g. "/api/scripts/scr-123"
  currentStatus?: string; // for display only, not used in the PATCH
  nextStates: string[];
  statusField?: string; // default "status", use "runStatus" for runs
  by?: string;
  label?: string;
}

export function WorkflowControl({
  apiPath,
  currentStatus,
  nextStates,
  statusField = "status",
  by = "user",
  label = "Přejít na",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (nextStates.length === 0) return null;

  async function transition(toStatus: string) {
    setError(null);
    setBusy(true);
    const res = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [statusField]: toStatus, by }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Přechod stavu selhal");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-[var(--muted)]">{label}:</span>
      {nextStates.map((s) => (
        <button
          key={s}
          type="button"
          disabled={busy}
          onClick={() => transition(s)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-50 transition-colors"
        >
          {s.replace(/_/g, " ")}
        </button>
      ))}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
