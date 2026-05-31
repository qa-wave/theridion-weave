// ─── In-memory data store with seed fallback ─────────────────────────────────
//
// Weave's MVP persistence. When DATABASE_URL is set the same shapes can be
// served from Neon (see src/lib/db.ts); until then this in-memory store is the
// source of truth and is seeded with representative data so every screen has
// something to show. State lives for the lifetime of the server process.

import { randomUUID } from "node:crypto";
import type {
  CoverageSummary,
  RunSource,
  RunSummary,
  TestCase,
  TestPlan,
  TestRun,
} from "@/lib/types";
import type {
  CreateTestCaseInput,
  CreateTestPlanInput,
  CreateTestRunInput,
  RunnerIngestInput,
  UpdateTestCaseInput,
} from "@/lib/validation";
import { summariseRun } from "@/lib/utils";

interface Store {
  cases: TestCase[];
  plans: TestPlan[];
  runs: TestRun[];
}

// Deterministic seed timestamps (relative offsets from a fixed anchor) so the
// dashboard renders stable data without depending on wall-clock during build.
const DAY = 86_400_000;
const anchor = Date.UTC(2026, 4, 30, 9, 0, 0); // 2026-05-30T09:00:00Z
const at = (offsetDays: number, offsetMs = 0) =>
  new Date(anchor - offsetDays * DAY + offsetMs).toISOString();

function seed(): Store {
  const cases: TestCase[] = [
    {
      id: "tc-login-happy",
      title: "Přihlášení platnými údaji",
      description: "Uživatel se přihlásí správným e-mailem a heslem.",
      steps: [
        { order: 1, action: "Otevři /login", expectedResult: "Zobrazí se formulář" },
        { order: 2, action: "Zadej platný e-mail a heslo" },
        { order: 3, action: "Klikni na Přihlásit", expectedResult: "Přesměrování na dashboard" },
      ],
      expectedResult: "Uživatel je přihlášen a vidí dashboard.",
      priority: "critical",
      tags: ["auth", "smoke"],
      status: "active",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(40),
      updatedAt: at(8),
    },
    {
      id: "tc-login-locked",
      title: "Zamčený účet po 5 pokusech",
      description: "Po pěti neúspěšných pokusech se účet dočasně zamkne.",
      steps: [
        { order: 1, action: "Pětkrát zadej špatné heslo" },
        { order: 2, action: "Zadej správné heslo", expectedResult: "Účet je zamčen, login odmítnut" },
      ],
      expectedResult: "Účet je zamčen na 15 minut.",
      priority: "high",
      tags: ["auth", "security"],
      status: "active",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(38),
      updatedAt: at(12),
    },
    {
      id: "tc-checkout-coupon",
      title: "Sleva kupónem v košíku",
      description: "Aplikace platného kupónu sníží cenu v košíku.",
      steps: [
        { order: 1, action: "Přidej položku do košíku" },
        { order: 2, action: "Zadej kupón SAVE10", expectedResult: "Cena snížena o 10 %" },
      ],
      expectedResult: "Mezisoučet snížen o 10 %.",
      priority: "medium",
      tags: ["checkout", "regression"],
      status: "active",
      type: "manual",
      owner: "po@qawave.ai",
      createdAt: at(30),
      updatedAt: at(6),
    },
    {
      id: "tc-export-csv",
      title: "Export reportu do CSV",
      description: "Report lze exportovat jako CSV se správnými sloupci.",
      steps: [{ order: 1, action: "Klikni na Export → CSV", expectedResult: "Stáhne se soubor .csv" }],
      expectedResult: "CSV obsahuje hlavičku a všechny řádky.",
      priority: "low",
      tags: ["reporting"],
      status: "draft",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(20),
      updatedAt: at(20),
    },
    {
      id: "tc-legacy-flash",
      title: "Flash upload (legacy)",
      description: "Starý Flash upload — vyřazeno.",
      steps: [],
      expectedResult: "—",
      priority: "low",
      tags: ["legacy"],
      status: "deprecated",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(120),
      updatedAt: at(60),
    },
  ];

  const plans: TestPlan[] = [
    {
      id: "tp-release-smoke",
      name: "Release smoke",
      description: "Kritické scénáře před každým releasem.",
      testCaseIds: ["tc-login-happy", "tc-login-locked", "tc-checkout-coupon"],
      createdAt: at(35),
      updatedAt: at(5),
    },
    {
      id: "tp-auth-regression",
      name: "Auth regrese",
      description: "Plná regrese přihlašování a zabezpečení.",
      testCaseIds: ["tc-login-happy", "tc-login-locked"],
      createdAt: at(25),
      updatedAt: at(10),
    },
  ];

  const runs: TestRun[] = [
    {
      id: "run-manual-1",
      planId: "tp-release-smoke",
      source: "manual",
      startedAt: at(2, 0),
      finishedAt: at(2, 38 * 60_000),
      triggeredBy: "qa@qawave.ai",
      label: "release-2.4.0",
      results: [
        { testId: "tc-login-happy", title: "Přihlášení platnými údaji", status: "pass", durationMs: 95_000 },
        { testId: "tc-login-locked", title: "Zamčený účet po 5 pokusech", status: "pass", durationMs: 120_000 },
        {
          testId: "tc-checkout-coupon",
          title: "Sleva kupónem v košíku",
          status: "fail",
          durationMs: 60_000,
          notes: "Kupón SAVE10 vrací 0% slevu na staging.",
        },
      ],
    },
    {
      id: "run-eyes-1",
      source: "eyes",
      suiteName: "playwright/auth.spec.ts",
      startedAt: at(1, 0),
      finishedAt: at(1, 4 * 60_000),
      triggeredBy: "ci/theridion-eyes",
      label: "main@a1b2c3d",
      results: [
        { testId: "auth › login renders", title: "auth › login renders", status: "pass", durationMs: 1_900 },
        { testId: "auth › invalid creds", title: "auth › invalid creds", status: "pass", durationMs: 2_400 },
        {
          testId: "auth › lockout banner",
          title: "auth › lockout banner",
          status: "fail",
          durationMs: 3_100,
          evidence: "https://theridion-hub.qawave.ai/artifacts/eyes/run-eyes-1/lockout.png",
          notes: "Banner se nezobrazil do 3 s.",
        },
      ],
    },
    {
      id: "run-net-1",
      source: "net",
      suiteName: "collections/auth-api",
      startedAt: at(1, 60_000),
      finishedAt: at(1, 2 * 60_000),
      triggeredBy: "ci/theridion-net",
      label: "main@a1b2c3d",
      results: [
        { testId: "POST /login 200", title: "POST /login 200", status: "pass", durationMs: 320 },
        { testId: "POST /login 401", title: "POST /login 401", status: "pass", durationMs: 280 },
        { testId: "GET /me 200", title: "GET /me 200", status: "pass", durationMs: 210 },
        { testId: "rate-limit 429", title: "rate-limit 429", status: "skip", durationMs: 0, notes: "Vyžaduje load profil." },
      ],
    },
  ];

  return { cases, plans, runs };
}

// Persist across hot-reloads in dev by stashing on globalThis.
const g = globalThis as unknown as { __weaveStore?: Store };
const store: Store = g.__weaveStore ?? (g.__weaveStore = seed());

// ─── Test cases ───────────────────────────────────────────────────────────────

export interface CaseFilter {
  tag?: string;
  priority?: string;
  status?: string;
  q?: string;
}

export function listTestCases(filter: CaseFilter = {}): TestCase[] {
  return store.cases
    .filter((c) => (filter.status ? c.status === filter.status : true))
    .filter((c) => (filter.priority ? c.priority === filter.priority : true))
    .filter((c) => (filter.tag ? c.tags.includes(filter.tag) : true))
    .filter((c) =>
      filter.q ? c.title.toLowerCase().includes(filter.q.toLowerCase()) : true,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getTestCase(id: string): TestCase | undefined {
  return store.cases.find((c) => c.id === id);
}

export function createTestCase(input: CreateTestCaseInput): TestCase {
  const now = new Date().toISOString();
  const tc: TestCase = {
    id: `tc-${randomUUID().slice(0, 8)}`,
    title: input.title,
    description: input.description,
    steps: input.steps,
    expectedResult: input.expectedResult,
    priority: input.priority,
    tags: input.tags,
    status: input.status,
    type: "manual",
    owner: input.owner,
    createdAt: now,
    updatedAt: now,
  };
  store.cases.push(tc);
  return tc;
}

export function updateTestCase(input: UpdateTestCaseInput): TestCase | undefined {
  const tc = getTestCase(input.id);
  if (!tc) return undefined;
  Object.assign(tc, {
    title: input.title ?? tc.title,
    description: input.description ?? tc.description,
    steps: input.steps ?? tc.steps,
    expectedResult: input.expectedResult ?? tc.expectedResult,
    priority: input.priority ?? tc.priority,
    tags: input.tags ?? tc.tags,
    status: input.status ?? tc.status,
    owner: input.owner ?? tc.owner,
    updatedAt: new Date().toISOString(),
  });
  return tc;
}

export function deleteTestCase(id: string): boolean {
  const i = store.cases.findIndex((c) => c.id === id);
  if (i === -1) return false;
  store.cases.splice(i, 1);
  return true;
}

export function allTags(): string[] {
  return [...new Set(store.cases.flatMap((c) => c.tags))].sort();
}

// ─── Plans ──────────────────────────────────────────────────────────────────

export function listTestPlans(): TestPlan[] {
  return [...store.plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getTestPlan(id: string): TestPlan | undefined {
  return store.plans.find((p) => p.id === id);
}

export function createTestPlan(input: CreateTestPlanInput): TestPlan {
  const now = new Date().toISOString();
  const tp: TestPlan = {
    id: `tp-${randomUUID().slice(0, 8)}`,
    name: input.name,
    description: input.description,
    testCaseIds: input.testCaseIds,
    createdAt: now,
    updatedAt: now,
  };
  store.plans.push(tp);
  return tp;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export function listTestRuns(source?: RunSource): TestRun[] {
  return store.runs
    .filter((r) => (source ? r.source === source : true))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getTestRun(id: string): TestRun | undefined {
  return store.runs.find((r) => r.id === id);
}

export function createTestRun(input: CreateTestRunInput): TestRun {
  const run: TestRun = {
    id: `run-${randomUUID().slice(0, 8)}`,
    planId: input.planId,
    source: input.source,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    results: input.results,
    triggeredBy: input.triggeredBy,
    suiteName: input.suiteName,
    label: input.label,
  };
  store.runs.push(run);
  return run;
}

/** Accept a run published by Eyes/Net via Runner (same payload shape). */
export function ingestRun(input: RunnerIngestInput): TestRun {
  const run: TestRun = {
    id: `run-${randomUUID().slice(0, 8)}`,
    source: input.source,
    suiteName: input.suiteName,
    label: input.label,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    results: input.results,
    triggeredBy: input.triggeredBy,
  };
  store.runs.push(run);
  return run;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function recentRunSummaries(limit = 10): RunSummary[] {
  return listTestRuns()
    .slice(0, limit)
    .map(summariseRun);
}

export function coverage(): CoverageSummary {
  const active = store.cases.filter((c) => c.status === "active");
  // a case is "covered" if any manual run has a passing result for it
  const passedCaseIds = new Set(
    store.runs
      .filter((r) => r.source === "manual")
      .flatMap((r) => r.results.filter((res) => res.status === "pass").map((res) => res.testId)),
  );
  const covered = active.filter((c) => passedCaseIds.has(c.id)).length;
  return {
    total: store.cases.length,
    active: active.length,
    covered,
    coveragePct: active.length === 0 ? 0 : (covered / active.length) * 100,
  };
}

export interface SourceTotals {
  source: RunSource;
  pass: number;
  fail: number;
  skip: number;
  blocked: number;
  total: number;
}

export function totalsBySource(): SourceTotals[] {
  const sources: RunSource[] = ["manual", "eyes", "net"];
  return sources.map((source) => {
    const results = store.runs.filter((r) => r.source === source).flatMap((r) => r.results);
    return {
      source,
      pass: results.filter((r) => r.status === "pass").length,
      fail: results.filter((r) => r.status === "fail").length,
      skip: results.filter((r) => r.status === "skip").length,
      blocked: results.filter((r) => r.status === "blocked").length,
      total: results.length,
    };
  });
}
