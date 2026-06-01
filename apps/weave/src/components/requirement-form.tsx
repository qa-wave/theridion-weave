"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Requirement, TestCase } from "@/lib/types";
import { useT } from "@/lib/i18n/context";

interface Props {
  allCases: TestCase[];
  initial?: Partial<Requirement>;
}

export function RequirementForm({ allCases, initial }: Props) {
  const router = useRouter();
  const t = useT();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<Requirement["status"]>(initial?.status ?? "open");
  const [priority, setPriority] = useState<Requirement["priority"]>(initial?.priority ?? "medium");
  const [externalUrl, setExternalUrl] = useState(initial?.externalUrl ?? "");
  const [caseIds, setCaseIds] = useState<string[]>(initial?.caseIds ?? []);

  const toggleCase = (id: string) => {
    setCaseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const url = initial?.id ? `/api/requirements/${initial.id}` : "/api/requirements";
      const method = initial?.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, status, priority, externalUrl, caseIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      router.push("/requirements");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-2xl">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="req-title">{t("requirementForm.name")}</label>
        <input
          id="req-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={300}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder={t("requirementForm.name.placeholder")}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="req-desc">{t("requirementForm.description")}</label>
        <textarea
          id="req-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder={t("requirementForm.description.placeholder")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="req-priority">{t("requirementForm.priority")}</label>
          <select
            id="req-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Requirement["priority"])}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            {["critical", "high", "medium", "low"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="req-status">{t("requirementForm.status")}</label>
          <select
            id="req-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Requirement["status"])}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <option value="open">{t("requirementForm.status.open")}</option>
            <option value="in_progress">{t("requirementForm.status.in_progress")}</option>
            <option value="done">{t("requirementForm.status.done")}</option>
            <option value="deprecated">{t("requirementForm.status.deprecated")}</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="req-url">{t("requirementForm.trackerUrl")}</label>
        <input
          id="req-url"
          type="url"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder="https://..."
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("requirementForm.linkedCases")} ({caseIds.length} selected)</p>
        <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2">
          {allCases.length === 0 && (
            <p className="px-2 py-1 text-sm text-[var(--muted)]">{t("requirementForm.linkedCases.empty")}</p>
          )}
          {allCases.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--surface)] text-sm"
            >
              <input
                type="checkbox"
                checked={caseIds.includes(c.id)}
                onChange={() => toggleCase(c.id)}
                className="accent-[var(--accent)]"
              />
              <span className={c.status === "deprecated" ? "line-through text-[var(--muted)]" : ""}>{c.title}</span>
              <span className="ml-auto text-xs text-[var(--muted)]">{c.priority}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t("requirementForm.submitting") : initial?.id ? t("requirementForm.submit.save") : t("requirementForm.submit.create")}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]"
        >
          {t("requirementForm.cancel")}
        </button>
      </div>
    </form>
  );
}
