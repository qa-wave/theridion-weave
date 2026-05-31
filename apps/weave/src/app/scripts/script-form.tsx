"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 block text-xs font-medium text-[var(--muted)]";

export function ScriptForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [product, setProduct] = useState("eyes");
  const [framework, setFramework] = useState("");
  const [specPath, setSpecPath] = useState("");
  const [caseKey, setCaseKey] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("draft");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      name,
      product,
      framework,
      specPath: specPath.trim() || undefined,
      caseKey: caseKey.trim() || undefined,
      owner,
      status,
    };
    const res = await fetch("/api/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Uložení selhalo");
      return;
    }
    const created = (await res.json()) as { id: string };
    router.push(`/scripts/${created.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className={labelCls}>Název *</label>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Auth login spec" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Produkt *</label>
          <select className={input} value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="eyes">Eyes (FE)</option>
            <option value="net">Net (BE)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Framework *</label>
          <input className={input} value={framework} onChange={(e) => setFramework(e.target.value)} required placeholder="Playwright" />
        </div>
        <div>
          <label className={labelCls}>Spec path</label>
          <input className={input} value={specPath} onChange={(e) => setSpecPath(e.target.value)} placeholder="playwright/auth.spec.ts" />
        </div>
        <div>
          <label className={labelCls}>Case key</label>
          <input className={input} value={caseKey} onChange={(e) => setCaseKey(e.target.value)} placeholder="auth.login.happy-path" />
        </div>
        <div>
          <label className={labelCls}>Owner *</label>
          <input className={input} value={owner} onChange={(e) => setOwner(e.target.value)} required placeholder="qa@qawave.ai" />
        </div>
        <div>
          <label className={labelCls}>Stav</label>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="flaky">flaky</option>
            <option value="deprecated">deprecated</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Ukládám…" : "Vytvořit skript"}
        </button>
      </div>
    </form>
  );
}
