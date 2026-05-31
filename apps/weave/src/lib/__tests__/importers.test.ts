import { describe, expect, it } from "@jest/globals";
import { importJUnit, importPlaywright } from "@/lib/importers";

// ─── JUnit XML ─────────────────────────────────────────────────────────────────

const JUNIT_SIMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="auth-suite" tests="3" failures="1" time="1.234">
  <testcase classname="AuthTest" name="login success" time="0.4"/>
  <testcase classname="AuthTest" name="login failure" time="0.6">
    <failure message="Expected 200 but got 401">Expected 200 but got 401 at line 42</failure>
  </testcase>
  <testcase classname="AuthTest" name="logout" time="0.3">
    <skipped/>
  </testcase>
</testsuite>`;

const JUNIT_TESTSUITES_WRAPPER = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="api" tests="2" time="0.5">
    <testcase name="GET /health" time="0.2"/>
    <testcase name="POST /login" time="0.3"/>
  </testsuite>
</testsuites>`;

describe("importJUnit", () => {
  it("parses a simple testsuite", () => {
    const run = importJUnit(JUNIT_SIMPLE);
    expect(run.results).toHaveLength(3);
    expect(run.results[0].status).toBe("pass");
    expect(run.results[1].status).toBe("fail");
    expect(run.results[2].status).toBe("skip");
  });

  it("maps classname + name to title", () => {
    const run = importJUnit(JUNIT_SIMPLE);
    expect(run.results[0].title).toBe("AuthTest > login success");
    expect(run.results[0].testId).toBe("AuthTest.login success");
  });

  it("captures failure message as notes", () => {
    const run = importJUnit(JUNIT_SIMPLE);
    expect(run.results[1].notes).toContain("Expected 200");
  });

  it("converts time (seconds) to durationMs", () => {
    const run = importJUnit(JUNIT_SIMPLE);
    expect(run.results[0].durationMs).toBe(400);
    expect(run.results[1].durationMs).toBe(600);
  });

  it("sets source to runner", () => {
    const run = importJUnit(JUNIT_SIMPLE);
    expect(run.source).toBe("runner");
  });

  it("accepts label and triggeredBy opts", () => {
    const run = importJUnit(JUNIT_SIMPLE, { label: "main@abc", triggeredBy: "ci/junit" });
    expect(run.label).toBe("main@abc");
    expect(run.triggeredBy).toBe("ci/junit");
  });

  it("handles testsuites wrapper", () => {
    const run = importJUnit(JUNIT_TESTSUITES_WRAPPER, { suiteName: "api-tests" });
    expect(run.results).toHaveLength(2);
    expect(run.suiteName).toBe("api-tests");
  });

  it("throws on empty XML", () => {
    expect(() => importJUnit("<foo/>")).toThrow("No <testsuite>");
  });
});

// ─── Playwright JSON ───────────────────────────────────────────────────────────

const PLAYWRIGHT_REPORT = {
  stats: { startTime: "2026-05-31T10:00:00.000Z", duration: 5000 },
  suites: [
    {
      title: "auth.spec.ts",
      suites: [
        {
          title: "Auth",
          specs: [
            {
              title: "login renders",
              ok: true,
              tests: [{ results: [{ status: "passed", duration: 1900 }] }],
            },
            {
              title: "lockout banner",
              ok: false,
              tests: [
                {
                  results: [
                    {
                      status: "failed",
                      duration: 3100,
                      error: { message: "Timeout 3000ms exceeded" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "smoke.spec.ts",
      specs: [
        {
          title: "homepage loads",
          ok: true,
          tests: [{ results: [{ status: "passed", duration: 800 }] }],
        },
        {
          title: "404 page",
          ok: false,
          tests: [{ results: [{ status: "skipped", duration: 0 }] }],
        },
      ],
    },
  ],
};

describe("importPlaywright", () => {
  it("parses a two-file report", () => {
    const run = importPlaywright(PLAYWRIGHT_REPORT);
    expect(run.results).toHaveLength(4);
  });

  it("maps passed → pass", () => {
    const run = importPlaywright(PLAYWRIGHT_REPORT);
    const loginResult = run.results.find((r) => r.title.includes("login renders"));
    expect(loginResult?.status).toBe("pass");
  });

  it("maps failed → fail with error notes", () => {
    const run = importPlaywright(PLAYWRIGHT_REPORT);
    const lockout = run.results.find((r) => r.title.includes("lockout"));
    expect(lockout?.status).toBe("fail");
    expect(lockout?.notes).toContain("Timeout");
  });

  it("maps skipped → skip", () => {
    const run = importPlaywright(PLAYWRIGHT_REPORT);
    const skip = run.results.find((r) => r.title.includes("404 page"));
    expect(skip?.status).toBe("skip");
  });

  it("builds hierarchical title from suite path", () => {
    const run = importPlaywright(PLAYWRIGHT_REPORT);
    const r = run.results.find((r) => r.title.includes("login renders"));
    // should be: "auth.spec.ts > Auth > login renders"
    expect(r?.title).toMatch(/auth\.spec\.ts.+Auth.+login renders/);
  });

  it("captures startedAt from stats", () => {
    const run = importPlaywright(PLAYWRIGHT_REPORT);
    expect(run.startedAt).toBe("2026-05-31T10:00:00.000Z");
  });

  it("sets source to runner", () => {
    expect(importPlaywright(PLAYWRIGHT_REPORT).source).toBe("runner");
  });

  it("throws on non-Playwright JSON", () => {
    expect(() => importPlaywright({ foo: 1 })).toThrow("Invalid Playwright JSON");
  });
});
