import { describe, expect, it } from "@jest/globals";
import { normalizeRunResult, runResultV2Schema } from "@/lib/run-result";

const sample = {
  schema_version: 2 as const,
  run_id: "11111111-2222-3333-4444-555555555555",
  product: "eyes" as const,
  suite_type: "e2e",
  collection_name: "auth.spec.ts",
  environment: "ci",
  branch: "main",
  started_at: "2026-05-31T10:00:00.000Z",
  finished_at: "2026-05-31T10:00:05.000Z",
  requests: [
    { name: "auth › login renders", status: "pass" as const, duration_ms: 1900, test_key: "auth.login.renders" },
    { name: "auth › lockout", status: "fail" as const, duration_ms: 3100, error: "banner missing", evidence: "https://x/y.png" },
  ],
  meta: { git_sha: "a1b2c3d4e5", report_url: "https://hub/report", triggered_by: "ci/eyes" },
};

describe("RunResult v2", () => {
  it("validates a well-formed payload", () => {
    expect(runResultV2Schema.safeParse(sample).success).toBe(true);
  });

  it("rejects wrong schema_version", () => {
    expect(runResultV2Schema.safeParse({ ...sample, schema_version: 1 }).success).toBe(false);
  });

  it("normalizes to a TestRun preserving run_id and mapping requests", () => {
    const run = normalizeRunResult(sample);
    expect(run.id).toBe(sample.run_id);
    expect(run.source).toBe("eyes");
    expect(run.label).toBe("main@a1b2c3d");
    expect(run.triggeredBy).toBe("ci/eyes");
    expect(run.results).toHaveLength(2);
    expect(run.results[0].testId).toBe("auth.login.renders");
    expect(run.results[1].status).toBe("fail");
    expect(run.results[1].evidence).toBe("https://x/y.png");
  });
});
