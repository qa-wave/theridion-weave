import { describe, expect, it } from "@jest/globals";
import { buildHubPayload } from "@/lib/hub-webhook";
import type { TestRun } from "@/lib/types";

const sampleRun: TestRun = {
  id: "run-abc12345",
  source: "eyes",
  suiteName: "auth.spec.ts",
  label: "main@a1b2c3d",
  triggeredBy: "ci/eyes",
  startedAt: "2026-05-31T10:00:00.000Z",
  finishedAt: "2026-05-31T10:00:05.000Z",
  results: [
    { testId: "t1", title: "login renders", status: "pass", durationMs: 1900 },
    { testId: "t2", title: "lockout", status: "fail", durationMs: 3100, notes: "banner missing", issueUrl: "https://github.com/issues/1" },
  ],
};

describe("buildHubPayload", () => {
  it("produces schema_version=2 and product=weave", () => {
    const p = buildHubPayload(sampleRun, "https://weave.example.com");
    expect(p.schema_version).toBe(2);
    expect(p.product).toBe("weave");
  });

  it("maps run_id correctly", () => {
    expect(buildHubPayload(sampleRun, "https://weave.example.com").run_id).toBe("run-abc12345");
  });

  it("counts passed/failed correctly", () => {
    const p = buildHubPayload(sampleRun, "https://weave.example.com");
    expect(p.passed).toBe(1);
    expect(p.failed).toBe(1);
    expect(p.total).toBe(2);
  });

  it("includes issue_url in failed request", () => {
    const p = buildHubPayload(sampleRun, "https://weave.example.com");
    expect(p.requests[1].issue_url).toBe("https://github.com/issues/1");
  });

  it("includes weave_run_url in meta", () => {
    const p = buildHubPayload(sampleRun, "https://weave.example.com");
    expect(p.meta.weave_run_url).toContain("run-abc12345");
  });
});
