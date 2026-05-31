// ─── Canonical RunResult v2 wire contract (Weave side) ────────────────────────
//
// Single cross-product contract: Runner/Eyes/Net publish RunResult v2; Weave's
// ingest normalizes it into the internal TestRun shape. Canonical JSON Schema:
// docs/contracts/run-result-v2.schema.json. Keep this in sync with Runner's
// pydantic model and Hub's zod (Phase 0 — avoid contract drift).

import { z } from "zod";
import type { ResultStatus, RunSource, TestRun } from "@/lib/types";

const statusEnum = z.enum(["pass", "fail", "skip", "blocked"]);

export const requestResultV2Schema = z
  .object({
    request_id: z.string().optional(),
    name: z.string(),
    method: z.string().optional(),
    url: z.string().optional(),
    status_code: z.number().int().optional(),
    status: statusEnum,
    duration_ms: z.number().min(0).default(0),
    /** stable test identifier; maps to Weave TestCase.caseKey for coverage */
    test_key: z.string().optional(),
    evidence: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export const runResultV2Schema = z
  .object({
    schema_version: z.literal(2),
    run_id: z.string().min(1),
    product: z.enum(["net", "eyes", "runner"]),
    suite_type: z.string().optional(),
    collection_id: z.string().optional(),
    collection_name: z.string().optional(),
    environment: z.string().optional(),
    branch: z.string().optional(),
    started_at: z.string(),
    finished_at: z.string().optional(),
    duration_ms: z.number().optional(),
    total: z.number().optional(),
    passed: z.number().optional(),
    failed: z.number().optional(),
    flaky: z.number().optional(),
    requests: z.array(requestResultV2Schema).default([]),
    meta: z
      .object({
        git_sha: z.string().optional(),
        report_url: z.string().optional(),
        weave_case_key: z.string().optional(),
        triggered_by: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type RunResultV2 = z.infer<typeof runResultV2Schema>;

/** Map a canonical RunResult v2 into Weave's internal TestRun. */
export function normalizeRunResult(rr: RunResultV2): TestRun {
  const source = rr.product as RunSource; // net|eyes|runner are valid RunSource values
  const startedAt = new Date(rr.started_at).toISOString();
  const finishedAt = rr.finished_at ? new Date(rr.finished_at).toISOString() : startedAt;
  const shortSha = rr.meta?.git_sha ? `@${rr.meta.git_sha.slice(0, 7)}` : "";
  const label = rr.branch ? `${rr.branch}${shortSha}` : (rr.environment ?? rr.collection_name);

  return {
    id: rr.run_id,
    source,
    suiteName: rr.collection_name ?? rr.collection_id ?? rr.suite_type,
    label: label ?? undefined,
    triggeredBy: rr.meta?.triggered_by ?? rr.product,
    startedAt,
    finishedAt,
    results: rr.requests.map((q) => ({
      testId: q.test_key ?? q.request_id ?? q.name,
      title: q.name,
      status: q.status as ResultStatus,
      durationMs: Math.round(q.duration_ms ?? 0),
      evidence: q.evidence ?? rr.meta?.report_url,
      notes:
        q.error ??
        (q.status_code ? `${q.method ?? ""} ${q.url ?? ""} → ${q.status_code}`.trim() : undefined),
    })),
  };
}
