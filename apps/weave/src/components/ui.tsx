import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ResultStatus, RunSource, TestCasePriority, TestCaseStatus } from "@/lib/types";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5", className)}>
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className={cn(accent && "border-[var(--accent)]/40")}>
      <div className="text-sm text-[var(--muted)]">{label}</div>
      <div className={cn("mt-1 text-3xl font-semibold tabular-nums", accent && "text-[var(--accent)]")}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
    </Card>
  );
}

const statusColors: Record<ResultStatus, string> = {
  pass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  fail: "bg-red-500/15 text-red-300 border-red-500/30",
  skip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  blocked: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

export function ResultBadge({ status }: { status: ResultStatus }) {
  return (
    <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", statusColors[status])}>
      {status}
    </span>
  );
}

const caseStatusColors: Record<TestCaseStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  deprecated: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30",
};

export function CaseStatusBadge({ status }: { status: TestCaseStatus }) {
  return (
    <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", caseStatusColors[status])}>
      {status}
    </span>
  );
}

const priorityColors: Record<TestCasePriority, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  medium: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  low: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

export function PriorityBadge({ priority }: { priority: TestCasePriority }) {
  return (
    <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", priorityColors[priority])}>
      {priority}
    </span>
  );
}

const sourceMeta: Record<RunSource, { label: string; cls: string }> = {
  manual: { label: "Manual", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  eyes: { label: "Eyes", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  net: { label: "Net", cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  runner: { label: "Runner", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

export function SourceBadge({ source }: { source: RunSource }) {
  const m = sourceMeta[source];
  return (
    <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", m.cls)}>{m.label}</span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--muted)]">
      {children}
    </span>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
