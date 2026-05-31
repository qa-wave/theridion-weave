import { describe, expect, it } from "@jest/globals";
import { formatDuration, formatPercent, summariseRun } from "@/lib/utils";
import type { TestRun } from "@/lib/types";

describe("formatDuration", () => {
  it("formats sub-second, seconds, minutes", () => {
    expect(formatDuration(500)).toBe("500 ms");
    expect(formatDuration(5_000)).toBe("5 s");
    expect(formatDuration(90_000)).toBe("1 min 30 s");
  });
});

describe("formatPercent", () => {
  it("uses comma decimal separator", () => {
    expect(formatPercent(66.666, 1)).toBe("66,7 %");
    expect(formatPercent(100, 0)).toBe("100 %");
  });
});

describe("summariseRun", () => {
  const run: TestRun = {
    id: "r1",
    source: "manual",
    startedAt: "2026-05-30T09:00:00.000Z",
    finishedAt: "2026-05-30T09:05:00.000Z",
    triggeredBy: "qa",
    results: [
      { testId: "a", title: "a", status: "pass", durationMs: 1000 },
      { testId: "b", title: "b", status: "fail", durationMs: 2000 },
      { testId: "c", title: "c", status: "skip", durationMs: 0 },
    ],
  };

  it("counts statuses and pass rate", () => {
    const s = summariseRun(run);
    expect(s.pass).toBe(1);
    expect(s.fail).toBe(1);
    expect(s.skip).toBe(1);
    expect(s.total).toBe(3);
    expect(Math.round(s.passRate)).toBe(33);
  });

  it("uses wall-clock when longer than summed durations", () => {
    const s = summariseRun(run);
    expect(s.durationMs).toBe(300_000);
  });
});
