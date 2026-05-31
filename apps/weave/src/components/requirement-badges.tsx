import { cn } from "@/lib/utils";
import type { RequirementPriority, RequirementStatus } from "@/lib/types";

const statusColors: Record<RequirementStatus, string> = {
  open: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  in_progress: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  deprecated: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30",
};

const statusLabels: Record<RequirementStatus, string> = {
  open: "Otevřeno",
  in_progress: "Probíhá",
  done: "Hotovo",
  deprecated: "Zastaralé",
};

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  return (
    <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", statusColors[status])}>
      {statusLabels[status]}
    </span>
  );
}

const priorityColors: Record<RequirementPriority, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  medium: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  low: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

export function RequirementPriorityBadge({ priority }: { priority: RequirementPriority }) {
  return (
    <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", priorityColors[priority])}>
      {priority}
    </span>
  );
}
