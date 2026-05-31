// ─── Core domain types for Theridion Weave ───────────────────────────────────

export type TestCaseStatus = "draft" | "in_review" | "active" | "deprecated";
export type TestCasePriority = "low" | "medium" | "high" | "critical";
export type TestCaseType = "manual";

// ─── Script entity ────────────────────────────────────────────────────────────

export type ScriptProduct = "eyes" | "net";
export type ScriptStatus = "draft" | "active" | "flaky" | "deprecated";

export interface TestScript {
  id: string;
  name: string;
  product: ScriptProduct;
  framework: string;
  specPath?: string;
  /** Optional link to a manual TestCase */
  caseKey?: string;
  status: ScriptStatus;
  owner: string;
  createdAt: string;
  updatedAt: string;
  /** Jira issue key (e.g. "CEPS-42") set after mirror sync */
  jiraKey?: string;
  /** Status-change audit trail */
  statusHistory: import("./workflow").StatusHistoryEntry[];
}

export interface TestStep {
  order: number;
  action: string;
  expectedResult?: string;
}

export interface TestCase {
  id: string;
  title: string;
  description: string;
  steps: TestStep[];
  expectedResult: string;
  priority: TestCasePriority;
  tags: string[];
  status: TestCaseStatus;
  type: TestCaseType;
  owner: string;
  /**
   * Optional stable identifier matching automated run results via
   * RunResult v2 `test_key` / `meta.weave_case_key`. Used for coverage
   * cross-matching between manual cases and automated runs.
   */
  caseKey?: string;
  createdAt: string;
  updatedAt: string;
  /** Jira issue key set after mirror sync */
  jiraKey?: string;
  /** Status-change audit trail */
  statusHistory: import("./workflow").StatusHistoryEntry[];
}

// ─── Test Plans / Suites ──────────────────────────────────────────────────────

export interface TestPlan {
  id: string;
  name: string;
  description: string;
  testCaseIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Test Runs ────────────────────────────────────────────────────────────────

export type RunSource = "manual" | "eyes" | "net" | "runner";
export type RunWorkflowStatus = "created" | "in_progress" | "completed" | "signed_off" | "blocked";
export type ResultStatus = "pass" | "fail" | "skip" | "blocked";

export interface TestResult {
  /** test case ID (manual) or automated test identifier (eyes/net) */
  testId: string;
  title: string;
  status: ResultStatus;
  durationMs: number;
  /** URL, screenshot path, or log reference */
  evidence?: string;
  /** Failure message or notes */
  notes?: string;
  /** GitHub / Jira / Linear issue URL for a failed test (defect linking) */
  issueUrl?: string;
}

export interface TestRun {
  id: string;
  /** Linked test plan (optional — automated runs may not have one) */
  planId?: string;
  source: RunSource;
  startedAt: string;
  finishedAt: string | null;
  results: TestResult[];
  triggeredBy: string;
  /** For eyes/net runs — name of the suite or spec file */
  suiteName?: string;
  /** Branch or environment label */
  label?: string;
  /** Optional milestone tag (e.g. "v2.4.0") for aggregation grouping */
  milestone?: string;
  /** Workflow status (separate from completion) */
  runStatus: RunWorkflowStatus;
  /** Jira issue key set after mirror sync */
  jiraKey?: string;
  /** Status-change audit trail */
  statusHistory: import("./workflow").StatusHistoryEntry[];
}

// ─── Ingest payload (mirrors what Runner publishes to Hub) ────────────────────

/**
 * Shape produced by theridion-runner when pushing results to an aggregator.
 * Weave accepts the same shape on POST /api/runs/ingest.
 */
export interface RunnerIngestPayload {
  source: RunSource;
  suiteName: string;
  label?: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string;
  results: Array<{
    testId: string;
    title: string;
    status: ResultStatus;
    durationMs: number;
    evidence?: string;
    notes?: string;
  }>;
}

// ─── Summary / aggregation ────────────────────────────────────────────────────

export interface RunSummary {
  id: string;
  source: RunSource;
  label: string;
  startedAt: string;
  pass: number;
  fail: number;
  skip: number;
  blocked: number;
  total: number;
  passRate: number;
  durationMs: number;
}

export interface CoverageSummary {
  total: number;
  active: number;
  covered: number;
  /** percentage of active test cases that have a passing run */
  coveragePct: number;
}

// ─── Requirements ─────────────────────────────────────────────────────────────

export type RequirementStatus = "open" | "in_progress" | "done" | "deprecated";
export type RequirementPriority = "low" | "medium" | "high" | "critical";

export interface Requirement {
  id: string;
  title: string;
  description: string;
  status: RequirementStatus;
  priority: RequirementPriority;
  /** External tracker URL (Jira, Linear, GitHub issue…) */
  externalUrl?: string;
  /** Test case IDs linked to this requirement */
  caseIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** One row of the coverage matrix: requirement + how many of its cases pass */
export interface RequirementCoverageRow {
  requirement: Requirement;
  totalCases: number;
  coveredCases: number;
  coveragePct: number;
}
