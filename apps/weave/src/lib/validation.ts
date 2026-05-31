import { z } from "zod";

export const testStepSchema = z.object({
  order: z.number().int().min(1),
  action: z.string().min(1, "Action is required"),
  expectedResult: z.string().optional(),
});

export const createTestCaseSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().default(""),
  steps: z.array(testStepSchema).default([]),
  expectedResult: z.string().default(""),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  tags: z.array(z.string()).default([]),
  status: z.enum(["draft", "in_review", "active", "deprecated"]).default("draft"),
  type: z.literal("manual").default("manual"),
  owner: z.string().min(1, "Owner is required"),
  /** Stable key for automated coverage cross-matching (test_key / weave_case_key). */
  caseKey: z.string().max(200).optional(),
});

export const updateTestCaseSchema = createTestCaseSchema.partial().extend({
  id: z.string(),
});

export const createTestPlanSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().default(""),
  testCaseIds: z.array(z.string()).default([]),
});

export const updateTestPlanSchema = createTestPlanSchema.partial().extend({
  id: z.string(),
});

export const testResultSchema = z.object({
  testId: z.string(),
  title: z.string(),
  status: z.enum(["pass", "fail", "skip", "blocked"]),
  durationMs: z.number().int().min(0),
  evidence: z.string().optional(),
  notes: z.string().optional(),
});

export const createTestRunSchema = z.object({
  planId: z.string().optional(),
  source: z.enum(["manual", "eyes", "net"]).default("manual"),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().default(null),
  results: z.array(testResultSchema),
  triggeredBy: z.string().min(1),
  suiteName: z.string().optional(),
  label: z.string().optional(),
});

export const runnerIngestSchema = z.object({
  source: z.enum(["manual", "eyes", "net", "runner"]),
  suiteName: z.string(),
  label: z.string().optional(),
  triggeredBy: z.string(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  results: z.array(testResultSchema),
});

/** Payload for scaffolding a manual run from a test plan. */
export const createRunFromPlanSchema = z.object({
  planId: z.string().min(1),
  triggeredBy: z.string().min(1).default("manual"),
  label: z.string().optional(),
});

/** Payload for PATCH /api/runs/[id]/result — update a single test result inside a run. */
export const patchRunResultSchema = z.object({
  testId: z.string().min(1),
  status: z.enum(["pass", "fail", "skip", "blocked"]),
  notes: z.string().optional(),
  evidence: z.string().url("Evidence must be a valid URL").optional().or(z.literal("")),
  issueUrl: z.string().url("issueUrl must be a valid URL").optional().or(z.literal("")),
});

/** Patch issueUrl on a single test result (defect linking). */
export const patchRunResultIssueSchema = z.object({
  testId: z.string().min(1),
  issueUrl: z.string().url("issueUrl must be a valid URL").optional().or(z.literal("")),
});

// ─── Requirements ─────────────────────────────────────────────────────────────

export const createRequirementSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  description: z.string().default(""),
  status: z.enum(["open", "in_progress", "done", "deprecated"]).default("open"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  externalUrl: z.string().url("externalUrl must be a valid URL").optional().or(z.literal("")).transform((v) => v || undefined),
  caseIds: z.array(z.string()).default([]),
});

export const updateRequirementSchema = createRequirementSchema.partial().extend({
  id: z.string(),
});

// ─── Scripts ──────────────────────────────────────────────────────────────────

export const createTestScriptSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  product: z.enum(["eyes", "net"]),
  framework: z.string().min(1, "Framework is required").max(100),
  specPath: z.string().max(500).optional(),
  caseKey: z.string().max(200).optional(),
  status: z.enum(["draft", "active", "flaky", "deprecated"]).default("draft"),
  owner: z.string().min(1, "Owner is required"),
});

export const updateTestScriptSchema = createTestScriptSchema.partial().extend({
  id: z.string(),
});

export const patchScriptStatusSchema = z.object({
  status: z.enum(["draft", "active", "flaky", "deprecated"]),
  by: z.string().default("system"),
});

// ─── Workflow status patches ───────────────────────────────────────────────────

export const patchTestCaseStatusSchema = z.object({
  status: z.enum(["draft", "in_review", "active", "deprecated"]),
  by: z.string().default("system"),
});

export const patchRunStatusSchema = z.object({
  runStatus: z.enum(["created", "in_progress", "completed", "signed_off", "blocked"]),
  by: z.string().default("system"),
});

// ─── Import ───────────────────────────────────────────────────────────────────

/** Accepted import format for POST /api/runs/import */
export const importFormatSchema = z.enum(["junit", "playwright"]);

export type CreateTestCaseInput = z.infer<typeof createTestCaseSchema>;
export type UpdateTestCaseInput = z.infer<typeof updateTestCaseSchema>;
export type CreateTestPlanInput = z.infer<typeof createTestPlanSchema>;
export type UpdateTestPlanInput = z.infer<typeof updateTestPlanSchema>;
export type CreateTestRunInput = z.infer<typeof createTestRunSchema>;
export type RunnerIngestInput = z.infer<typeof runnerIngestSchema>;
export type CreateRunFromPlanInput = z.infer<typeof createRunFromPlanSchema>;
export type PatchRunResultInput = z.infer<typeof patchRunResultSchema>;
export type PatchRunResultIssueInput = z.infer<typeof patchRunResultIssueSchema>;
export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;
export type CreateTestScriptInput = z.infer<typeof createTestScriptSchema>;
export type UpdateTestScriptInput = z.infer<typeof updateTestScriptSchema>;
export type PatchScriptStatusInput = z.infer<typeof patchScriptStatusSchema>;
export type PatchTestCaseStatusInput = z.infer<typeof patchTestCaseStatusSchema>;
export type PatchRunStatusInput = z.infer<typeof patchRunStatusSchema>;
