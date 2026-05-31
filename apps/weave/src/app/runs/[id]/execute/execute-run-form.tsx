"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ResultStatus } from "@/lib/types";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-40";
const labelCls = "mb-1 block text-xs font-medium text-[var(--muted)]";

const STATUS_OPTIONS: { value: ResultStatus; label: string; cls: string }[] = [
  { value: "pass", label: "Pass", cls: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" },
  { value: "fail", label: "Fail", cls: "border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/25" },
  { value: "blocked", label: "Blocked", cls: "border-violet-500/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25" },
  { value: "skip", label: "Skip", cls: "border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25" },
];

interface Props {
  runId: string;
  testId: string;
  currentStatus: ResultStatus;
  currentNotes: string;
  currentEvidence: string;
  disabled?: boolean;
}

export function ExecuteRunForm({ runId, testId, currentStatus, currentNotes, currentEvidence, disabled }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<ResultStatus>(currentStatus);
  const [notes, setNotes] = useState(currentNotes);
  const [evidence, setEvidence] = useState(currentEvidence);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextStatus?: ResultStatus) {
    const s = nextStatus ?? status;
    setError(null);
    const res = await fetch(`/api/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testId, status: s, notes: notes || undefined, evidence: evidence || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Uložení selhalo");
      return;
    }
    if (nextStatus) setStatus(nextStatus);
    setSaved(true);
    startTransition(() => {
      router.refresh();
    });
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled || isPending}
            onClick={() => save(opt.value)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              status === opt.value
                ? `${opt.cls} ring-1 ring-inset ring-current`
                : `border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)]`
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Poznámka</label>
          <input
            className={input}
            disabled={disabled}
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
            onBlur={() => save()}
            placeholder="Volitelná poznámka k výsledku"
          />
        </div>
        <div>
          <label className={labelCls}>Evidence URL</label>
          <input
            className={input}
            disabled={disabled}
            value={evidence}
            onChange={(e) => { setEvidence(e.target.value); setSaved(false); }}
            onBlur={() => save()}
            placeholder="https://…"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {saved && <p className="text-xs text-emerald-400">Uloženo</p>}
    </div>
  );
}
