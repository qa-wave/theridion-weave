"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TestPlan } from "@/lib/types";
import { useT } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 block text-xs font-medium text-[var(--muted)]";

interface Props {
  plans: TestPlan[];
}

export function NewRunForm({ plans }: Props) {
  const router = useRouter();
  const t = useT();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [triggeredBy, setTriggeredBy] = useState("qa@qawave.ai");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = plans.find((p) => p.id === planId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch("/api/runs/from-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, triggeredBy, label: label || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? t("newRunForm.error.default"));
      return;
    }
    const created = await res.json();
    router.push(`/runs/${(created as { id: string }).id}/execute`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className={labelCls}>{t("newRunForm.plan")}</label>
        <select
          className={input}
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          required
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {selectedPlan?.description && (
          <p className="mt-1 text-xs text-[var(--muted)]">{selectedPlan.description}</p>
        )}
        {selectedPlan && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {selectedPlan.testCaseIds.length} {t("plans.caseCount")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t("newRunForm.triggeredBy")}</label>
          <input
            className={input}
            value={triggeredBy}
            onChange={(e) => setTriggeredBy(e.target.value)}
            required
            placeholder="qa@qawave.ai"
          />
        </div>
        <div>
          <label className={labelCls}>{t("newRunForm.label")}</label>
          <input
            className={input}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("newRunForm.label.placeholder")}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || !planId}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t("newRunForm.submitting") : t("newRunForm.submit")}
        </button>
      </div>
    </form>
  );
}
