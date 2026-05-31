// ─── Entity state machine workflows ──────────────────────────────────────────
// Pure functions — no imports from store or server modules so this can be
// imported everywhere (client, server, tests).

export type TestCaseStatus = "draft" | "in_review" | "active" | "deprecated";
export type ScriptStatus = "draft" | "active" | "flaky" | "deprecated";
export type RunStatus = "created" | "in_progress" | "completed" | "signed_off" | "blocked";

// ─── Transition tables ────────────────────────────────────────────────────────

const TEST_TRANSITIONS: Record<TestCaseStatus, TestCaseStatus[]> = {
  draft:      ["in_review"],
  in_review:  ["active", "draft"],      // back to draft = reject
  active:     ["in_review", "deprecated"],
  deprecated: [],
};

const SCRIPT_TRANSITIONS: Record<ScriptStatus, ScriptStatus[]> = {
  draft:      ["active"],
  active:     ["flaky", "deprecated"],
  flaky:      ["active", "deprecated"],
  deprecated: [],
};

const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  created:     ["in_progress", "blocked"],
  in_progress: ["completed", "blocked"],
  completed:   ["signed_off", "blocked"],
  signed_off:  [],
  blocked:     ["in_progress"],
};

// ─── Generic helpers ──────────────────────────────────────────────────────────

export function canTransitionTest(from: TestCaseStatus, to: TestCaseStatus): boolean {
  return (TEST_TRANSITIONS[from] ?? []).includes(to);
}

export function nextTestStates(from: TestCaseStatus): TestCaseStatus[] {
  return TEST_TRANSITIONS[from] ?? [];
}

export function canTransitionScript(from: ScriptStatus, to: ScriptStatus): boolean {
  return (SCRIPT_TRANSITIONS[from] ?? []).includes(to);
}

export function nextScriptStates(from: ScriptStatus): ScriptStatus[] {
  return SCRIPT_TRANSITIONS[from] ?? [];
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return (RUN_TRANSITIONS[from] ?? []).includes(to);
}

export function nextRunStates(from: RunStatus): RunStatus[] {
  return RUN_TRANSITIONS[from] ?? [];
}

// ─── Status audit entry ───────────────────────────────────────────────────────

export interface StatusHistoryEntry {
  from: string;
  to: string;
  by: string;
  at: string; // ISO string
}

/** Append a new history entry (immutably). */
export function appendHistory(
  history: StatusHistoryEntry[],
  from: string,
  to: string,
  by: string,
): StatusHistoryEntry[] {
  return [
    ...history,
    { from, to, by, at: new Date().toISOString() },
  ];
}

// ─── Label helpers (for UI) ───────────────────────────────────────────────────

export const TEST_STATUS_LABELS: Record<TestCaseStatus, string> = {
  draft:      "Draft",
  in_review:  "In review",
  active:     "Active",
  deprecated: "Deprecated",
};

export const SCRIPT_STATUS_LABELS: Record<ScriptStatus, string> = {
  draft:      "Draft",
  active:     "Active",
  flaky:      "Flaky",
  deprecated: "Deprecated",
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  created:     "Created",
  in_progress: "In progress",
  completed:   "Completed",
  signed_off:  "Signed off",
  blocked:     "Blocked",
};
