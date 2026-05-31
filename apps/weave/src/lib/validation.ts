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
  status: z.enum(["draft", "active", "deprecated"]).default("draft"),
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
});

export type CreateTestCaseInput = z.infer<typeof createTestCaseSchema>;
export type UpdateTestCaseInput = z.infer<typeof updateTestCaseSchema>;
export type CreateTestPlanInput = z.infer<typeof createTestPlanSchema>;
export type UpdateTestPlanInput = z.infer<typeof updateTestPlanSchema>;
export type CreateTestRunInput = z.infer<typeof createTestRunSchema>;
export type RunnerIngestInput = z.infer<typeof runnerIngestSchema>;
export type CreateRunFromPlanInput = z.infer<typeof createRunFromPlanSchema>;
export type PatchRunResultInput = z.infer<typeof patchRunResultSchema>;
