// ─── Generic importers: JUnit XML + Playwright JSON → RunResult v2 ────────────
//
// POST /api/runs/import accepts either format, normalizes to RunResult v2, and
// delegates to the standard ingest pipeline (saveIngestedRun).

import { randomUUID } from "node:crypto";
import type { TestRun } from "@/lib/types";

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Map a timing attribute (seconds or ms string) to milliseconds. */
function parseTime(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  // JUnit uses seconds; if value >= 1000 assume it's already ms
  return n < 1000 ? Math.round(n * 1000) : Math.round(n);
}

/** Find the first attribute value from an XML attribute map string (exact attribute name match). */
function attr(tag: string, name: string): string | undefined {
  // Use word boundary equivalent: preceded by whitespace or start, followed by =
  const re = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "i");
  return re.exec(tag)?.[1];
}

// ─── JUnit XML parser (zero-dependency, handles standard Maven Surefire format) ─

interface JUnitTestCase {
  name: string;
  classname?: string;
  time?: string;
  failure?: string;
  error?: string;
  skipped?: boolean;
}

interface JUnitTestSuite {
  name: string;
  timestamp?: string;
  time?: string;
  testcases: JUnitTestCase[];
}

/**
 * Extract all occurrences of a tag, handling both self-closing and with-body forms.
 * Strategy: find each opening tag, check if self-closing or paired with closing tag.
 * Returns array of { attrs: string (content of opening tag, excl. <tag and >), body: string }.
 */
function extractTags(src: string, tag: string): Array<{ attrs: string; body: string }> {
  const out: Array<{ attrs: string; body: string }> = [];
  // opening tag pattern — captures everything between <tag and >
  // [^>]* may include a trailing / from self-closing tags; detect that from the capture
  const openRe = new RegExp(`<${tag}([^>]*)>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(src)) !== null) {
    const attrRaw = m[1] ?? "";
    const isSelfClosing = attrRaw.endsWith("/");
    const rawAttrs = isSelfClosing ? attrRaw.slice(0, -1).trimEnd() : attrRaw.trim();

    if (isSelfClosing) {
      out.push({ attrs: rawAttrs, body: "" });
    } else {
      // opening tag — find matching closing tag (simple non-nested approach, sufficient for JUnit)
      const closeTag = `</${tag}>`;
      const bodyStart = m.index + m[0].length;
      const closeIdx = src.indexOf(closeTag, bodyStart);
      if (closeIdx !== -1) {
        out.push({ attrs: rawAttrs, body: src.slice(bodyStart, closeIdx) });
        // advance regex past closing tag to avoid re-matching its content
        openRe.lastIndex = closeIdx + closeTag.length;
      } else {
        out.push({ attrs: rawAttrs, body: "" });
      }
    }
  }
  return out;
}

/** Minimal JUnit XML parser — no external deps, covers 99% of CI output. */
function parseJUnit(xml: string): JUnitTestSuite[] {
  const suites: JUnitTestSuite[] = [];

  // Normalize line endings
  const src = xml.replace(/\r\n?/g, "\n");

  // Unwrap optional <testsuites> wrapper so we can process all testsuites uniformly
  const wrapMatch = /<testsuites[^>]*>([\s\S]*)<\/testsuites>/i.exec(src);
  const searchIn = wrapMatch ? wrapMatch[1] : src;

  for (const { attrs, body } of extractTags(searchIn, "testsuite")) {
    const suite: JUnitTestSuite = {
      name: attr(attrs, "name") ?? "unnamed",
      timestamp: attr(attrs, "timestamp"),
      time: attr(attrs, "time"),
      testcases: [],
    };

    // Parse testcases from body
    for (const { attrs: cAttrs, body: cBody } of extractTags(body, "testcase")) {
      const tc: JUnitTestCase = {
        name: attr(cAttrs, "name") ?? "unnamed",
        classname: attr(cAttrs, "classname"),
        time: attr(cAttrs, "time"),
        skipped: /<skipped/i.test(cBody),
      };
      // Extract failure message: prefer message attribute, fallback to body text
      const failureTags = extractTags(cBody, "failure");
      if (failureTags.length > 0) {
        const ft = failureTags[0];
        tc.failure = (attr(ft.attrs, "message") ?? ft.body.trim()).slice(0, 500) || "failure";
      }
      const errorTags = extractTags(cBody, "error");
      if (errorTags.length > 0) {
        const et = errorTags[0];
        tc.error = (attr(et.attrs, "message") ?? et.body.trim()).slice(0, 500) || "error";
      }
      suite.testcases.push(tc);
    }
    suites.push(suite);
  }

  return suites;
}

export interface ImportResult {
  run: TestRun;
  format: "junit" | "playwright";
}

/**
 * Parse JUnit XML and produce a TestRun.
 * Multiple <testsuite> blocks are flattened into one run (standard CI behavior).
 */
export function importJUnit(
  xml: string,
  opts: { triggeredBy?: string; label?: string; suiteName?: string } = {},
): TestRun {
  const suites = parseJUnit(xml);
  if (suites.length === 0) throw new Error("No <testsuite> elements found in JUnit XML");

  const now = new Date().toISOString();
  const suiteName = opts.suiteName ?? suites.map((s) => s.name).join(", ");
  const results = suites.flatMap((suite) =>
    suite.testcases.map((tc) => {
      const title = tc.classname ? `${tc.classname} > ${tc.name}` : tc.name;
      const durationMs = parseTime(tc.time);
      let status: "pass" | "fail" | "skip" | "blocked";
      if (tc.skipped) status = "skip";
      else if (tc.failure || tc.error) status = "fail";
      else status = "pass";
      return {
        testId: tc.classname ? `${tc.classname}.${tc.name}` : tc.name,
        title,
        status,
        durationMs,
        notes: tc.failure ?? tc.error,
      };
    }),
  );

  return {
    id: `run-${randomUUID().slice(0, 8)}`,
    source: "runner" as const,
    suiteName,
    label: opts.label,
    triggeredBy: opts.triggeredBy ?? "import/junit",
    startedAt: now,
    finishedAt: now,
    results,
    runStatus: "completed" as const,
    statusHistory: [],
  };
}

// ─── Playwright JSON reporter format ──────────────────────────────────────────
//
// Shape: { config?, suites: [ { title, suites?, specs: [ { title, ok, tests: [{ results: [{status,duration}] }] } ] } ] }
// Playwright status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted' | 'unexpected' | 'flaky'

interface PlaywrightResult {
  status: string;
  duration?: number;
  error?: { message?: string };
  attachments?: Array<{ name: string; path?: string; body?: string; contentType?: string }>;
}

interface PlaywrightSpec {
  title: string;
  ok?: boolean;
  tests?: Array<{ results?: PlaywrightResult[] }>;
}

interface PlaywrightSuite {
  title?: string;
  file?: string;
  suites?: PlaywrightSuite[];
  specs?: PlaywrightSpec[];
}

interface PlaywrightReport {
  suites?: PlaywrightSuite[];
  stats?: { startTime?: string; duration?: number };
}

function flattenSpecs(suite: PlaywrightSuite, path: string[]): Array<{ path: string[]; spec: PlaywrightSpec }> {
  const out: Array<{ path: string[]; spec: PlaywrightSpec }> = [];
  const title = suite.title ?? suite.file ?? "";
  const newPath = title ? [...path, title] : path;
  for (const spec of suite.specs ?? []) {
    out.push({ path: newPath, spec });
  }
  for (const child of suite.suites ?? []) {
    out.push(...flattenSpecs(child, newPath));
  }
  return out;
}

function mapPlaywrightStatus(s: string): "pass" | "fail" | "skip" | "blocked" {
  if (s === "passed") return "pass";
  if (s === "skipped") return "skip";
  if (s === "interrupted") return "blocked";
  return "fail"; // failed | timedOut | unexpected | flaky → fail
}

/**
 * Parse Playwright JSON report and produce a TestRun.
 */
export function importPlaywright(
  json: unknown,
  opts: { triggeredBy?: string; label?: string; suiteName?: string } = {},
): TestRun {
  const report = json as PlaywrightReport;
  if (!report.suites && !report.stats) {
    throw new Error("Invalid Playwright JSON report: missing 'suites' key");
  }

  const startedAt = report.stats?.startTime
    ? new Date(report.stats.startTime).toISOString()
    : new Date().toISOString();
  const durationMs = report.stats?.duration ?? 0;
  const finishedAt = new Date(new Date(startedAt).getTime() + durationMs).toISOString();

  const allSpecs = (report.suites ?? []).flatMap((s) => flattenSpecs(s, []));
  const derivedSuiteName =
    [...new Set(allSpecs.map(({ path }) => path[0]).filter(Boolean))].join(", ") || "playwright";
  const suiteName = opts.suiteName ?? derivedSuiteName;

  const results = allSpecs.map(({ path, spec }) => {
    const prefix = path.join(" > ");
    const title = prefix ? `${prefix} > ${spec.title}` : spec.title;
    // Use the last (most recent) test result
    const testResult = spec.tests?.[0]?.results?.at(-1);
    const status = testResult ? mapPlaywrightStatus(testResult.status) : (spec.ok ? "pass" : "fail");
    const dur = testResult?.duration ?? 0;
    const notes = testResult?.error?.message?.slice(0, 500);
    const evidence = testResult?.attachments
      ?.find((a) => a.name === "screenshot" || a.contentType?.startsWith("image/"))
      ?.path;

    return {
      testId: title,
      title,
      status,
      durationMs: dur,
      notes,
      evidence,
    };
  });

  return {
    id: `run-${randomUUID().slice(0, 8)}`,
    source: "runner" as const,
    suiteName,
    label: opts.label,
    triggeredBy: opts.triggeredBy ?? "import/playwright",
    startedAt,
    finishedAt,
    results,
    runStatus: "completed" as const,
    statusHistory: [],
  };
}
