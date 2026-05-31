import { describe, expect, it } from "@jest/globals";
import {
  coverage,
  createTestCase,
  ingestRun,
  listTestCases,
  listTestRuns,
  totalsBySource,
} from "@/data/store";

describe("store — test cases (in-memory mode)", () => {
  it("seeds with cases and filters by status", async () => {
    const active = await listTestCases({ status: "active" });
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((c) => c.status === "active")).toBe(true);
  });

  it("creates a case with generated id and timestamps", async () => {
    const before = (await listTestCases()).length;
    const created = await createTestCase({
      title: "Nový",
      description: "",
      steps: [],
      expectedResult: "",
      priority: "medium",
      tags: ["x"],
      status: "draft",
      type: "manual",
      owner: "t@q.ai",
    });
    expect(created.id).toMatch(/^tc-/);
    expect((await listTestCases()).length).toBe(before + 1);
    expect((await listTestCases({ tag: "x" })).some((c) => c.id === created.id)).toBe(true);
  });
});

describe("store — ingest", () => {
  it("accepts an Eyes run via ingest and exposes it", async () => {
    const run = await ingestRun({
      source: "eyes",
      suiteName: "playwright/smoke.spec.ts",
      triggeredBy: "ci",
      startedAt: "2026-05-30T10:00:00.000Z",
      finishedAt: "2026-05-30T10:01:00.000Z",
      results: [{ testId: "smoke › ok", title: "smoke › ok", status: "pass", durationMs: 1200 }],
    });
    expect(run.id).toMatch(/^run-/);
    expect((await listTestRuns("eyes")).some((r) => r.id === run.id)).toBe(true);
  });
});

describe("store — aggregation", () => {
  it("computes coverage within bounds", async () => {
    const c = await coverage();
    expect(c.covered).toBeLessThanOrEqual(c.active);
    expect(c.coveragePct).toBeGreaterThanOrEqual(0);
    expect(c.coveragePct).toBeLessThanOrEqual(100);
  });

  it("totals cover all three sources", async () => {
    const t = await totalsBySource();
    expect(t.map((x) => x.source).sort()).toEqual(["eyes", "manual", "net"]);
  });
});
