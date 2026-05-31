// ─── Data store: durable (Neon) with in-memory seed fallback ──────────────────
//
// When DATABASE_URL is set, all reads/writes go to Neon Postgres (durable).
// Without it, the app runs in "demo mode" against an in-memory seed — data does
// not survive a restart. The facade is async in both modes so call sites are
// identical regardless of backend.

import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
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

const USE_DB = !!process.env.DATABASE_URL;

export function isDurable(): boolean {
  return USE_DB;
}

// ─── Neon client (lazy) ───────────────────────────────────────────────────────

let _sql: ReturnType<typeof neon> | null = null;
function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

/** CREATE TABLE IF NOT EXISTS — idempotent schema bootstrap. */
export async function migrate(): Promise<void> {
  const q = sql();
  await q`create table if not exists test_cases (
    id text primary key,
    title text not null,
    description text not null default '',
    steps jsonb not null default '[]',
    expected_result text not null default '',
    priority text not null default 'medium',
    tags jsonb not null default '[]',
    status text not null default 'draft',
    owner text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await q`create table if not exists test_plans (
    id text primary key,
    name text not null,
    description text not null default '',
    test_case_ids jsonb not null default '[]',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await q`create table if not exists test_runs (
    id text primary key,
    plan_id text,
    source text not null,
    suite_name text,
    label text,
    triggered_by text not null,
    started_at timestamptz not null,
    finished_at timestamptz,
    results jsonb not null default '[]'
  )`;
  await q`create index if not exists test_runs_source_started_idx on test_runs (source, started_at desc)`;
  await q`create table if not exists app_settings (
    key text primary key,
    value jsonb not null
  )`;
}

// ─── Generic key/value (settings) ─────────────────────────────────────────────

const memKv = ((globalThis as unknown as { __weaveKv?: Map<string, unknown> }).__weaveKv ??=
  new Map<string, unknown>());

export async function kvGet<T>(key: string): Promise<T | null> {
  if (USE_DB) {
    const rows = (await sql()`select value from app_settings where key = ${key}`) as { value: T }[];
    return rows[0] ? rows[0].value : null;
  }
  return (memKv.get(key) as T) ?? null;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (USE_DB) {
    await sql()`insert into app_settings (key, value) values (${key}, ${JSON.stringify(value)}::jsonb)
      on conflict (key) do update set value = excluded.value`;
  } else {
    memKv.set(key, value);
  }
}

/** Insert the demo dataset into Neon (idempotent — skips existing IDs). */
export async function seedDatabase(): Promise<{ cases: number; plans: number; runs: number }> {
  const q = sql();
  const data = seed();
  for (const c of data.cases) {
    await q`insert into test_cases
      (id, title, description, steps, expected_result, priority, tags, status, owner, created_at, updated_at)
      values (${c.id}, ${c.title}, ${c.description}, ${JSON.stringify(c.steps)}, ${c.expectedResult},
              ${c.priority}, ${JSON.stringify(c.tags)}, ${c.status}, ${c.owner}, ${c.createdAt}, ${c.updatedAt})
      on conflict (id) do nothing`;
  }
  for (const p of data.plans) {
    await q`insert into test_plans (id, name, description, test_case_ids, created_at, updated_at)
      values (${p.id}, ${p.name}, ${p.description}, ${JSON.stringify(p.testCaseIds)}, ${p.createdAt}, ${p.updatedAt})
      on conflict (id) do nothing`;
  }
  for (const r of data.runs) {
    await q`insert into test_runs
      (id, plan_id, source, suite_name, label, triggered_by, started_at, finished_at, results)
      values (${r.id}, ${r.planId ?? null}, ${r.source}, ${r.suiteName ?? null}, ${r.label ?? null},
              ${r.triggeredBy}, ${r.startedAt}, ${r.finishedAt}, ${JSON.stringify(r.results)})
      on conflict (id) do nothing`;
  }
  return { cases: data.cases.length, plans: data.plans.length, runs: data.runs.length };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToCase(r: any): TestCase {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    steps: r.steps ?? [],
    expectedResult: r.expected_result,
    priority: r.priority,
    tags: r.tags ?? [],
    status: r.status,
    type: "manual",
    owner: r.owner,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
function rowToPlan(r: any): TestPlan {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    testCaseIds: r.test_case_ids ?? [],
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
function rowToRun(r: any): TestRun {
  return {
    id: r.id,
    planId: r.plan_id ?? undefined,
    source: r.source,
    suiteName: r.suite_name ?? undefined,
    label: r.label ?? undefined,
    triggeredBy: r.triggered_by,
    startedAt: new Date(r.started_at).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    results: r.results ?? [],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── In-memory seed (demo mode) ───────────────────────────────────────────────

interface Store {
  cases: TestCase[];
  plans: TestPlan[];
  runs: TestRun[];
}

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

const g = globalThis as unknown as { __weaveStore?: Store };
const mem: Store = g.__weaveStore ?? (g.__weaveStore = seed());

/** Exported for the seed script — returns the canonical demo dataset. */
export function seedData(): Store {
  return seed();
}

// ─── Test cases ───────────────────────────────────────────────────────────────

export interface CaseFilter {
  tag?: string;
  priority?: string;
  status?: string;
  q?: string;
}

function applyCaseFilter(rows: TestCase[], filter: CaseFilter): TestCase[] {
  return rows
    .filter((c) => (filter.status ? c.status === filter.status : true))
    .filter((c) => (filter.priority ? c.priority === filter.priority : true))
    .filter((c) => (filter.tag ? c.tags.includes(filter.tag) : true))
    .filter((c) => (filter.q ? c.title.toLowerCase().includes(filter.q.toLowerCase()) : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listTestCases(filter: CaseFilter = {}): Promise<TestCase[]> {
  if (USE_DB) {
    const rows = (await sql()`select * from test_cases`) as unknown[];
    return applyCaseFilter(rows.map(rowToCase), filter);
  }
  return applyCaseFilter(mem.cases, filter);
}

export async function getTestCase(id: string): Promise<TestCase | undefined> {
  if (USE_DB) {
    const rows = (await sql()`select * from test_cases where id = ${id}`) as unknown[];
    return rows[0] ? rowToCase(rows[0]) : undefined;
  }
  return mem.cases.find((c) => c.id === id);
}

export async function createTestCase(input: CreateTestCaseInput): Promise<TestCase> {
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
  if (USE_DB) {
    await sql()`insert into test_cases
      (id, title, description, steps, expected_result, priority, tags, status, owner, created_at, updated_at)
      values (${tc.id}, ${tc.title}, ${tc.description}, ${JSON.stringify(tc.steps)},
              ${tc.expectedResult}, ${tc.priority}, ${JSON.stringify(tc.tags)}, ${tc.status},
              ${tc.owner}, ${tc.createdAt}, ${tc.updatedAt})`;
  } else {
    mem.cases.push(tc);
  }
  return tc;
}

export async function updateTestCase(input: UpdateTestCaseInput): Promise<TestCase | undefined> {
  const existing = await getTestCase(input.id);
  if (!existing) return undefined;
  const next: TestCase = {
    ...existing,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    steps: input.steps ?? existing.steps,
    expectedResult: input.expectedResult ?? existing.expectedResult,
    priority: input.priority ?? existing.priority,
    tags: input.tags ?? existing.tags,
    status: input.status ?? existing.status,
    owner: input.owner ?? existing.owner,
    updatedAt: new Date().toISOString(),
  };
  if (USE_DB) {
    await sql()`update test_cases set
      title = ${next.title}, description = ${next.description}, steps = ${JSON.stringify(next.steps)},
      expected_result = ${next.expectedResult}, priority = ${next.priority}, tags = ${JSON.stringify(next.tags)},
      status = ${next.status}, owner = ${next.owner}, updated_at = ${next.updatedAt}
      where id = ${next.id}`;
  } else {
    const i = mem.cases.findIndex((c) => c.id === next.id);
    if (i !== -1) mem.cases[i] = next;
  }
  return next;
}

export async function deleteTestCase(id: string): Promise<boolean> {
  if (USE_DB) {
    const rows = (await sql()`delete from test_cases where id = ${id} returning id`) as unknown[];
    return rows.length > 0;
  }
  const i = mem.cases.findIndex((c) => c.id === id);
  if (i === -1) return false;
  mem.cases.splice(i, 1);
  return true;
}

export async function allTags(): Promise<string[]> {
  const cases = await listTestCases();
  return [...new Set(cases.flatMap((c) => c.tags))].sort();
}

// ─── Plans ──────────────────────────────────────────────────────────────────

export async function listTestPlans(): Promise<TestPlan[]> {
  if (USE_DB) {
    const rows = (await sql()`select * from test_plans order by updated_at desc`) as unknown[];
    return rows.map(rowToPlan);
  }
  return [...mem.plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTestPlan(id: string): Promise<TestPlan | undefined> {
  if (USE_DB) {
    const rows = (await sql()`select * from test_plans where id = ${id}`) as unknown[];
    return rows[0] ? rowToPlan(rows[0]) : undefined;
  }
  return mem.plans.find((p) => p.id === id);
}

export async function createTestPlan(input: CreateTestPlanInput): Promise<TestPlan> {
  const now = new Date().toISOString();
  const tp: TestPlan = {
    id: `tp-${randomUUID().slice(0, 8)}`,
    name: input.name,
    description: input.description,
    testCaseIds: input.testCaseIds,
    createdAt: now,
    updatedAt: now,
  };
  if (USE_DB) {
    await sql()`insert into test_plans (id, name, description, test_case_ids, created_at, updated_at)
      values (${tp.id}, ${tp.name}, ${tp.description}, ${JSON.stringify(tp.testCaseIds)}, ${tp.createdAt}, ${tp.updatedAt})`;
  } else {
    mem.plans.push(tp);
  }
  return tp;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function listTestRuns(source?: RunSource): Promise<TestRun[]> {
  if (USE_DB) {
    const rows = source
      ? ((await sql()`select * from test_runs where source = ${source} order by started_at desc`) as unknown[])
      : ((await sql()`select * from test_runs order by started_at desc`) as unknown[]);
    return rows.map(rowToRun);
  }
  return mem.runs
    .filter((r) => (source ? r.source === source : true))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function insertRun(run: TestRun): Promise<TestRun> {
  if (USE_DB) {
    await sql()`insert into test_runs
      (id, plan_id, source, suite_name, label, triggered_by, started_at, finished_at, results)
      values (${run.id}, ${run.planId ?? null}, ${run.source}, ${run.suiteName ?? null}, ${run.label ?? null},
              ${run.triggeredBy}, ${run.startedAt}, ${run.finishedAt}, ${JSON.stringify(run.results)})`;
  } else {
    mem.runs.push(run);
  }
  return run;
}

export async function createTestRun(input: CreateTestRunInput): Promise<TestRun> {
  return insertRun({
    id: `run-${randomUUID().slice(0, 8)}`,
    planId: input.planId,
    source: input.source,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    results: input.results,
    triggeredBy: input.triggeredBy,
    suiteName: input.suiteName,
    label: input.label,
  });
}

/** Accept a run published by Eyes/Net via Runner (same payload shape). */
export async function ingestRun(input: RunnerIngestInput): Promise<TestRun> {
  return insertRun({
    id: `run-${randomUUID().slice(0, 8)}`,
    source: input.source,
    suiteName: input.suiteName,
    label: input.label,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    results: input.results,
    triggeredBy: input.triggeredBy,
  });
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export async function recentRunSummaries(limit = 10): Promise<RunSummary[]> {
  const runs = await listTestRuns();
  return runs.slice(0, limit).map(summariseRun);
}

export async function coverage(): Promise<CoverageSummary> {
  const [cases, runs] = await Promise.all([listTestCases(), listTestRuns("manual")]);
  const active = cases.filter((c) => c.status === "active");
  const passedCaseIds = new Set(
    runs.flatMap((r) => r.results.filter((res) => res.status === "pass").map((res) => res.testId)),
  );
  const covered = active.filter((c) => passedCaseIds.has(c.id)).length;
  return {
    total: cases.length,
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

export async function totalsBySource(): Promise<SourceTotals[]> {
  const runs = await listTestRuns();
  const sources: RunSource[] = ["manual", "eyes", "net"];
  return sources.map((source) => {
    const results = runs.filter((r) => r.source === source).flatMap((r) => r.results);
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
