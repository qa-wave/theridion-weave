"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

interface StepDraft {
  action: string;
  expectedResult: string;
}

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 block text-xs font-medium text-[var(--muted)]";

export function CaseForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("draft");
  const [tags, setTags] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [caseKey, setCaseKey] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([{ action: "", expectedResult: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setStep(i: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      title,
      description,
      owner,
      priority,
      status,
      type: "manual" as const,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      expectedResult,
      caseKey: caseKey.trim() || undefined,
      steps: steps
        .filter((s) => s.action.trim())
        .map((s, idx) => ({ order: idx + 1, action: s.action, expectedResult: s.expectedResult || undefined })),
    };
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Uložení selhalo");
      return;
    }
    const created = await res.json();
    router.push(`/cases/${created.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className={labelCls}>Název *</label>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <label className={labelCls}>Popis</label>
        <textarea className={input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Owner *</label>
          <input className={input} value={owner} onChange={(e) => setOwner(e.target.value)} required placeholder="qa@qawave.ai" />
        </div>
        <div>
          <label className={labelCls}>Tagy (čárkou)</label>
          <input className={input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="auth, smoke" />
        </div>
        <div>
          <label className={labelCls}>Priorita</label>
          <select className={input} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Stav</label>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="deprecated">deprecated</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>
            Case Key{" "}
            <span className="font-normal text-[var(--muted)]">
              (volitelný stabilní klíč pro párování s automatizovanými běhy)
            </span>
          </label>
          <input
            className={input}
            value={caseKey}
            onChange={(e) => setCaseKey(e.target.value)}
            placeholder="auth.login.happy-path"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelCls}>Kroky</label>
          <button
            type="button"
            onClick={() => setSteps((p) => [...p, { action: "", expectedResult: "" }])}
            className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
          >
            <Plus size={14} /> Přidat krok
          </button>
        </div>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 w-5 text-xs text-[var(--muted)]">{i + 1}.</span>
              <input
                className={input}
                placeholder="Akce"
                value={s.action}
                onChange={(e) => setStep(i, { action: e.target.value })}
              />
              <input
                className={input}
                placeholder="Očekávaný výsledek"
                value={s.expectedResult}
                onChange={(e) => setStep(i, { expectedResult: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))}
                className="mt-2 text-[var(--muted)] hover:text-red-400"
                aria-label="Smazat krok"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Očekávaný výsledek (celkový)</label>
        <input className={input} value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Ukládám…" : "Vytvořit test case"}
        </button>
      </div>
    </form>
  );
}
