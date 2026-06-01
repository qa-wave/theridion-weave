// ─── Data store: durable (Neon) with in-memory seed fallback ──────────────────
//
// When DATABASE_URL is set, all reads/writes go to Neon Postgres (durable).
// Without it, the app runs in "demo mode" against an in-memory seed — data does
// not survive a restart. The facade is async in both modes so call sites are
// identical regardless of backend.

import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { defaultSettings } from "@/lib/integrations";
import type {
  CoverageSummary,
  Requirement,
  RequirementCoverageRow,
  RunSource,
  RunWorkflowStatus,
  RunSummary,
  ScriptProduct,
  ScriptStatus,
  TestCase,
  TestPlan,
  TestRun,
  TestScript,
} from "@/lib/types";
import { appendHistory } from "@/lib/workflow";
import type {
  CreateRequirementInput,
  CreateRunFromPlanInput,
  CreateTestCaseInput,
  CreateTestPlanInput,
  CreateTestRunInput,
  CreateTestScriptInput,
  RunnerIngestInput,
  UpdateRequirementInput,
  UpdateTestCaseInput,
  UpdateTestScriptInput,
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
    case_key text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  // Idempotent column addition for existing tables
  await q`alter table if exists test_cases add column if not exists case_key text`;
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
  await q`create table if not exists requirements (
    id text primary key,
    title text not null,
    description text not null default '',
    status text not null default 'open',
    priority text not null default 'medium',
    external_url text,
    case_ids jsonb not null default '[]',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await q`create table if not exists test_scripts (
    id text primary key,
    name text not null,
    product text not null,
    framework text not null,
    spec_path text,
    case_key text,
    status text not null default 'draft',
    owner text not null,
    jira_key text,
    status_history jsonb not null default '[]',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  // Idempotent column additions for existing tables
  await q`alter table if exists test_cases add column if not exists jira_key text`;
  await q`alter table if exists test_cases add column if not exists status_history jsonb not null default '[]'`;
  await q`alter table if exists test_runs add column if not exists run_status text not null default 'created'`;
  await q`alter table if exists test_runs add column if not exists jira_key text`;
  await q`alter table if exists test_runs add column if not exists status_history jsonb not null default '[]'`;
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
export async function seedDatabase(): Promise<{ cases: number; plans: number; runs: number; requirements: number; scripts: number }> {
  const q = sql();
  const data = seed();
  for (const c of data.cases) {
    await q`insert into test_cases
      (id, title, description, steps, expected_result, priority, tags, status, owner, case_key, jira_key, status_history, created_at, updated_at)
      values (${c.id}, ${c.title}, ${c.description}, ${JSON.stringify(c.steps)}, ${c.expectedResult},
              ${c.priority}, ${JSON.stringify(c.tags)}, ${c.status}, ${c.owner}, ${c.caseKey ?? null},
              ${c.jiraKey ?? null}, ${JSON.stringify(c.statusHistory)}, ${c.createdAt}, ${c.updatedAt})
      on conflict (id) do nothing`;
  }
  for (const p of data.plans) {
    await q`insert into test_plans (id, name, description, test_case_ids, created_at, updated_at)
      values (${p.id}, ${p.name}, ${p.description}, ${JSON.stringify(p.testCaseIds)}, ${p.createdAt}, ${p.updatedAt})
      on conflict (id) do nothing`;
  }
  for (const r of data.runs) {
    await q`insert into test_runs
      (id, plan_id, source, suite_name, label, triggered_by, started_at, finished_at, results, run_status, jira_key, status_history)
      values (${r.id}, ${r.planId ?? null}, ${r.source}, ${r.suiteName ?? null}, ${r.label ?? null},
              ${r.triggeredBy}, ${r.startedAt}, ${r.finishedAt}, ${JSON.stringify(r.results)},
              ${r.runStatus}, ${r.jiraKey ?? null}, ${JSON.stringify(r.statusHistory)})
      on conflict (id) do nothing`;
  }
  for (const req of data.requirements) {
    await q`insert into requirements
      (id, title, description, status, priority, external_url, case_ids, created_at, updated_at)
      values (${req.id}, ${req.title}, ${req.description}, ${req.status}, ${req.priority},
              ${req.externalUrl ?? null}, ${JSON.stringify(req.caseIds)}, ${req.createdAt}, ${req.updatedAt})
      on conflict (id) do nothing`;
  }
  for (const scr of data.scripts) {
    await q`insert into test_scripts
      (id, name, product, framework, spec_path, case_key, status, owner, jira_key, status_history, created_at, updated_at)
      values (${scr.id}, ${scr.name}, ${scr.product}, ${scr.framework}, ${scr.specPath ?? null},
              ${scr.caseKey ?? null}, ${scr.status}, ${scr.owner}, ${scr.jiraKey ?? null},
              ${JSON.stringify(scr.statusHistory)}, ${scr.createdAt}, ${scr.updatedAt})
      on conflict (id) do nothing`;
  }
  return { cases: data.cases.length, plans: data.plans.length, runs: data.runs.length, requirements: data.requirements.length, scripts: data.scripts.length };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToRequirement(r: any): Requirement {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    externalUrl: r.external_url ?? undefined,
    caseIds: r.case_ids ?? [],
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
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
    ...(r.case_key ? { caseKey: r.case_key } : {}),
    ...(r.jira_key ? { jiraKey: r.jira_key } : {}),
    statusHistory: r.status_history ?? [],
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function rowToScript(r: any): TestScript {
  return {
    id: r.id,
    name: r.name,
    product: r.product as ScriptProduct,
    framework: r.framework,
    specPath: r.spec_path ?? undefined,
    caseKey: r.case_key ?? undefined,
    status: r.status as ScriptStatus,
    owner: r.owner,
    ...(r.jira_key ? { jiraKey: r.jira_key } : {}),
    statusHistory: r.status_history ?? [],
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
    runStatus: (r.run_status ?? "created") as RunWorkflowStatus,
    ...(r.jira_key ? { jiraKey: r.jira_key } : {}),
    statusHistory: r.status_history ?? [],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── In-memory seed (demo mode) ───────────────────────────────────────────────

interface Store {
  cases: TestCase[];
  plans: TestPlan[];
  runs: TestRun[];
  requirements: Requirement[];
  scripts: TestScript[];
}

const DAY = 86_400_000;
const anchor = Date.UTC(2026, 4, 30, 9, 0, 0); // 2026-05-30T09:00:00Z
const at = (offsetDays: number, offsetMs = 0) =>
  new Date(anchor - offsetDays * DAY + offsetMs).toISOString();

function seed(): Store {
  const cases: TestCase[] = [
    // ── Auth ──────────────────────────────────────────────────────────────────
    {
      id: "tc-login-happy",
      title: "Login with valid credentials",
      description: "User logs in with a valid email and password and is redirected to the dashboard.",
      steps: [
        { order: 1, action: "Open /login", expectedResult: "Form is displayed" },
        { order: 2, action: "Enter valid email and password" },
        { order: 3, action: "Click Sign in", expectedResult: "Redirected to /dashboard" },
      ],
      expectedResult: "User is logged in and sees the dashboard.",
      priority: "critical",
      tags: ["auth", "smoke"],
      status: "active",
      caseKey: "auth › login happy path",
      jiraKey: "CEPS-101",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(40),
      updatedAt: at(8),
      statusHistory: [
        { from: "draft", to: "in_review", by: "qa@qawave.ai", at: at(30) },
        { from: "in_review", to: "active", by: "lead@qawave.ai", at: at(8) },
      ],
    },
    {
      id: "tc-login-invalid",
      title: "Login with invalid credentials",
      description: "User enters an incorrect password — system shows an error message without redirecting.",
      steps: [
        { order: 1, action: "Open /login" },
        { order: 2, action: "Enter valid email and wrong password" },
        { order: 3, action: "Click Sign in", expectedResult: "Error message 'Invalid credentials'" },
      ],
      expectedResult: "Form stays visible with error; no redirect.",
      priority: "high",
      tags: ["auth", "negative"],
      status: "active",
      caseKey: "auth › invalid creds",
      jiraKey: "CEPS-102",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(38),
      updatedAt: at(7),
      statusHistory: [
        { from: "draft", to: "active", by: "qa@qawave.ai", at: at(7) },
      ],
    },
    {
      id: "tc-login-locked",
      title: "Account locked after 5 attempts",
      description: "After five failed attempts, the account is temporarily locked and a lockout banner is shown.",
      steps: [
        { order: 1, action: "Enter wrong password five times in a row" },
        { order: 2, action: "Enter correct password", expectedResult: "Account is locked, login rejected" },
        { order: 3, action: "Check for lockout banner on the page", expectedResult: "Banner is visible" },
      ],
      expectedResult: "Account is locked for 15 minutes, lockout banner shown.",
      priority: "high",
      tags: ["auth", "security"],
      status: "active",
      caseKey: "auth › lockout banner",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(38),
      updatedAt: at(12),
      statusHistory: [
        { from: "draft", to: "active", by: "qa@qawave.ai", at: at(12) },
      ],
    },
    {
      id: "tc-password-reset",
      title: "Password reset via email",
      description: "User requests a password reset — receives an email with a link valid for 1 hour.",
      steps: [
        { order: 1, action: "Click 'Forgot your password?'" },
        { order: 2, action: "Enter registered email and submit form", expectedResult: "Toast 'Email sent'" },
        { order: 3, action: "Open link from email", expectedResult: "Page for setting new password" },
        { order: 4, action: "Set new password and confirm", expectedResult: "Redirected to /login" },
      ],
      expectedResult: "Password changed; old token is invalidated.",
      priority: "high",
      tags: ["auth", "email"],
      status: "in_review",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(15),
      updatedAt: at(3),
      statusHistory: [
        { from: "draft", to: "in_review", by: "qa@qawave.ai", at: at(3) },
      ],
    },
    // ── Checkout / Payments ───────────────────────────────────────────────────
    {
      id: "tc-checkout-coupon",
      title: "Coupon discount in cart",
      description: "Applying a valid coupon reduces the cart price by the declared percentage.",
      steps: [
        { order: 1, action: "Add any item to cart" },
        { order: 2, action: "Enter coupon SAVE10", expectedResult: "Price reduced by 10%" },
        { order: 3, action: "Proceed to checkout", expectedResult: "Total price reflects discount" },
      ],
      expectedResult: "Subtotal reduced by 10%.",
      priority: "medium",
      tags: ["checkout", "regression"],
      status: "active",
      caseKey: "checkout › apply coupon SAVE10",
      jiraKey: "CEPS-201",
      type: "manual",
      owner: "po@qawave.ai",
      createdAt: at(30),
      updatedAt: at(6),
      statusHistory: [
        { from: "draft", to: "active", by: "po@qawave.ai", at: at(6) },
      ],
    },
    {
      id: "tc-checkout-invalid-coupon",
      title: "Error message for invalid coupon",
      description: "System rejects an invalid or expired coupon with a descriptive error.",
      steps: [
        { order: 1, action: "Add item to cart" },
        { order: 2, action: "Enter coupon EXPIRED99", expectedResult: "Error message 'Coupon is invalid or expired'" },
      ],
      expectedResult: "Price unchanged; error is shown.",
      priority: "medium",
      tags: ["checkout", "negative"],
      status: "active",
      type: "manual",
      owner: "po@qawave.ai",
      createdAt: at(28),
      updatedAt: at(5),
      statusHistory: [
        { from: "draft", to: "active", by: "po@qawave.ai", at: at(5) },
      ],
    },
    {
      id: "tc-checkout-payment-fail",
      title: "Declined payment card",
      description: "System handles card decline and returns user to checkout with an error.",
      steps: [
        { order: 1, action: "Enter test card 4000 0000 0000 9995" },
        { order: 2, action: "Confirm payment", expectedResult: "Error message 'Payment declined'" },
      ],
      expectedResult: "Order not created; user stays in checkout.",
      priority: "high",
      tags: ["checkout", "payments", "regression"],
      status: "active",
      type: "manual",
      owner: "po@qawave.ai",
      createdAt: at(25),
      updatedAt: at(4),
      statusHistory: [
        { from: "draft", to: "in_review", by: "po@qawave.ai", at: at(10) },
        { from: "in_review", to: "active", by: "lead@qawave.ai", at: at(4) },
      ],
    },
    // ── Reporting / Export ────────────────────────────────────────────────────
    {
      id: "tc-export-csv",
      title: "Export report to CSV",
      description: "Report can be exported as CSV with correct columns and data.",
      steps: [
        { order: 1, action: "Navigate to /reports" },
        { order: 2, action: "Click Export → CSV", expectedResult: ".csv file downloads" },
        { order: 3, action: "Open file in spreadsheet editor", expectedResult: "Header and data rows are correct" },
      ],
      expectedResult: "CSV contains header and all rows without data loss.",
      priority: "low",
      tags: ["reporting"],
      status: "draft",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(20),
      updatedAt: at(20),
      statusHistory: [],
    },
    {
      id: "tc-report-filters",
      title: "Dashboard filtering by date range",
      description: "Dashboard correctly filters data for the given date range.",
      steps: [
        { order: 1, action: "Open /dashboard" },
        { order: 2, action: "Set filter to 'last 7 days'" },
        { order: 3, action: "Verify charts and tables show only data in the range", expectedResult: "Charts match the range" },
      ],
      expectedResult: "All visualizations match the selected range.",
      priority: "medium",
      tags: ["reporting", "dashboard"],
      status: "in_review",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(12),
      updatedAt: at(2),
      statusHistory: [
        { from: "draft", to: "in_review", by: "qa@qawave.ai", at: at(2) },
      ],
    },
    // ── API / Integration ─────────────────────────────────────────────────────
    {
      id: "tc-api-rate-limit",
      title: "Rate limiting on /api/search endpoint",
      description: "After 100 requests per minute, the API returns status 429.",
      steps: [
        { order: 1, action: "Send 101 GET /api/search requests within one minute" },
        { order: 2, action: "Check response #101", expectedResult: "HTTP 429 with Retry-After header" },
      ],
      expectedResult: "101st request returns 429 and Retry-After header.",
      priority: "medium",
      tags: ["api", "security", "regression"],
      status: "active",
      caseKey: "rate-limit 429",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(22),
      updatedAt: at(9),
      statusHistory: [
        { from: "draft", to: "active", by: "qa@qawave.ai", at: at(9) },
      ],
    },
    {
      id: "tc-api-pagination",
      title: "REST API result pagination",
      description: "Endpoint /api/cases returns correct cursor-based pagination.",
      steps: [
        { order: 1, action: "GET /api/cases?limit=10", expectedResult: "10 results + nextCursor" },
        { order: 2, action: "GET /api/cases?cursor=<nextCursor>", expectedResult: "Next page of 10 results" },
        { order: 3, action: "Paginate until nextCursor = null", expectedResult: "All records without duplicates" },
      ],
      expectedResult: "Pagination covers all records without duplicates or gaps.",
      priority: "medium",
      tags: ["api", "regression"],
      status: "active",
      type: "manual",
      owner: "dev@qawave.ai",
      createdAt: at(18),
      updatedAt: at(6),
      statusHistory: [
        { from: "draft", to: "active", by: "dev@qawave.ai", at: at(6) },
      ],
    },
    {
      id: "tc-api-webhook",
      title: "Webhook notification on order status change",
      description: "System sends a webhook to the registered URL on every order status change.",
      steps: [
        { order: 1, action: "Register a webhook endpoint" },
        { order: 2, action: "Change order status to 'shipped'" },
        { order: 3, action: "Verify POST received at webhook endpoint", expectedResult: "Payload contains orderId and new status" },
      ],
      expectedResult: "Webhook delivered within 5 s, HMAC signature valid.",
      priority: "high",
      tags: ["api", "webhooks", "integration"],
      status: "active",
      type: "manual",
      owner: "dev@qawave.ai",
      createdAt: at(17),
      updatedAt: at(5),
      statusHistory: [
        { from: "draft", to: "in_review", by: "dev@qawave.ai", at: at(10) },
        { from: "in_review", to: "active", by: "lead@qawave.ai", at: at(5) },
      ],
    },
    // ── Notifications / Email ─────────────────────────────────────────────────
    {
      id: "tc-email-welcome",
      title: "Welcome email after registration",
      description: "New user receives a welcome email within 2 minutes of registering.",
      steps: [
        { order: 1, action: "Register a new account" },
        { order: 2, action: "Wait up to 2 minutes and check inbox", expectedResult: "Welcome email received" },
        { order: 3, action: "Click CTA button in the email", expectedResult: "Redirected to onboarding flow" },
      ],
      expectedResult: "Email received, CTA link functional.",
      priority: "medium",
      tags: ["email", "notifications", "onboarding"],
      status: "active",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(16),
      updatedAt: at(4),
      statusHistory: [
        { from: "draft", to: "active", by: "qa@qawave.ai", at: at(4) },
      ],
    },
    // ── Accessibility ─────────────────────────────────────────────────────────
    {
      id: "tc-a11y-keyboard-nav",
      title: "Keyboard navigation in main menu",
      description: "All main menu items are accessible via keyboard only (WCAG 2.1 AA).",
      steps: [
        { order: 1, action: "Focus the first menu item with Tab key" },
        { order: 2, action: "Navigate items with Arrow/Tab keys", expectedResult: "No focus trap; every item is reachable" },
        { order: 3, action: "Activate item with Enter/Space key", expectedResult: "Navigation works correctly" },
      ],
      expectedResult: "All features accessible without mouse; visible focus indicator.",
      priority: "medium",
      tags: ["accessibility", "a11y", "smoke"],
      status: "active",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(14),
      updatedAt: at(3),
      statusHistory: [
        { from: "draft", to: "active", by: "qa@qawave.ai", at: at(3) },
      ],
    },
    // ── Deprecated ────────────────────────────────────────────────────────────
    {
      id: "tc-legacy-flash",
      title: "Flash upload (legacy)",
      description: "Legacy Flash upload — retired after migration to presigned S3 URLs.",
      steps: [],
      expectedResult: "—",
      priority: "low",
      tags: ["legacy"],
      status: "deprecated",
      type: "manual",
      owner: "qa@qawave.ai",
      createdAt: at(120),
      updatedAt: at(60),
      statusHistory: [
        { from: "active", to: "deprecated", by: "qa@qawave.ai", at: at(60) },
      ],
    },
    {
      id: "tc-legacy-xml-import",
      title: "XML bulk import (legacy)",
      description: "Legacy XML order import — replaced by JSON API v3.",
      steps: [],
      expectedResult: "—",
      priority: "low",
      tags: ["legacy"],
      status: "deprecated",
      type: "manual",
      owner: "dev@qawave.ai",
      createdAt: at(90),
      updatedAt: at(45),
      statusHistory: [
        { from: "active", to: "deprecated", by: "dev@qawave.ai", at: at(45) },
      ],
    },
  ];

  const plans: TestPlan[] = [
    {
      id: "tp-release-smoke",
      name: "Release smoke",
      description: "Critical smoke tests before every production release.",
      testCaseIds: [
        "tc-login-happy",
        "tc-login-locked",
        "tc-checkout-coupon",
        "tc-a11y-keyboard-nav",
      ],
      createdAt: at(35),
      updatedAt: at(5),
    },
    {
      id: "tp-auth-regression",
      name: "Auth regression",
      description: "Full regression of login, security, and password management.",
      testCaseIds: [
        "tc-login-happy",
        "tc-login-invalid",
        "tc-login-locked",
        "tc-password-reset",
      ],
      createdAt: at(25),
      updatedAt: at(10),
    },
    {
      id: "tp-checkout-regression",
      name: "Checkout regression",
      description: "Scenarios covering full checkout and payment flow.",
      testCaseIds: [
        "tc-checkout-coupon",
        "tc-checkout-invalid-coupon",
        "tc-checkout-payment-fail",
      ],
      createdAt: at(22),
      updatedAt: at(4),
    },
    {
      id: "tp-api-integration",
      name: "API integration tests",
      description: "Endpoints, rate limiting, webhooks, and pagination.",
      testCaseIds: [
        "tc-api-rate-limit",
        "tc-api-pagination",
        "tc-api-webhook",
      ],
      createdAt: at(18),
      updatedAt: at(3),
    },
    {
      id: "tp-sprint-48",
      name: "Sprint 48 — acceptance",
      description: "Acceptance tests for Sprint 48 (notifications + dashboard).",
      testCaseIds: [
        "tc-email-welcome",
        "tc-report-filters",
        "tc-export-csv",
      ],
      createdAt: at(8),
      updatedAt: at(1),
    },
  ];

  const runs: TestRun[] = [
    // ── Manual runs ───────────────────────────────────────────────────────────
    {
      id: "run-manual-1",
      planId: "tp-release-smoke",
      source: "manual",
      startedAt: at(21, 0),
      finishedAt: at(21, 52 * 60_000),
      triggeredBy: "qa@qawave.ai",
      label: "release-2.3.0",
      jiraKey: "CEPS-601",
      runStatus: "signed_off",
      statusHistory: [
        { from: "created", to: "in_progress", by: "qa@qawave.ai", at: at(21, 0) },
        { from: "in_progress", to: "completed", by: "qa@qawave.ai", at: at(21, 52 * 60_000) },
        { from: "completed", to: "signed_off", by: "lead@qawave.ai", at: at(21, 60 * 60_000) },
      ],
      results: [
        { testId: "tc-login-happy", title: "Login with valid credentials", status: "pass", durationMs: 88_000 },
        { testId: "tc-login-locked", title: "Account locked after 5 attempts", status: "pass", durationMs: 134_000 },
        { testId: "tc-checkout-coupon", title: "Coupon discount in cart", status: "pass", durationMs: 72_000 },
        { testId: "tc-a11y-keyboard-nav", title: "Keyboard navigation in main menu", status: "pass", durationMs: 45_000 },
      ],
    },
    {
      id: "run-manual-2",
      planId: "tp-auth-regression",
      source: "manual",
      startedAt: at(14, 0),
      finishedAt: at(14, 95 * 60_000),
      triggeredBy: "qa@qawave.ai",
      label: "release-2.3.5",
      jiraKey: "CEPS-602",
      runStatus: "signed_off",
      statusHistory: [
        { from: "created", to: "in_progress", by: "qa@qawave.ai", at: at(14, 0) },
        { from: "in_progress", to: "completed", by: "qa@qawave.ai", at: at(14, 95 * 60_000) },
        { from: "completed", to: "signed_off", by: "lead@qawave.ai", at: at(14, 100 * 60_000) },
      ],
      results: [
        { testId: "tc-login-happy", title: "Login with valid credentials", status: "pass", durationMs: 92_000 },
        { testId: "tc-login-invalid", title: "Login with invalid credentials", status: "pass", durationMs: 78_000 },
        { testId: "tc-login-locked", title: "Account locked after 5 attempts", status: "pass", durationMs: 141_000 },
        { testId: "tc-password-reset", title: "Password reset via email", status: "fail", durationMs: 230_000, notes: "Reset email not received within 2 min on staging SMTP." },
      ],
    },
    {
      id: "run-manual-3",
      planId: "tp-release-smoke",
      source: "manual",
      startedAt: at(7, 0),
      finishedAt: at(7, 48 * 60_000),
      triggeredBy: "qa@qawave.ai",
      label: "release-2.4.0",
      runStatus: "signed_off",
      statusHistory: [
        { from: "created", to: "in_progress", by: "qa@qawave.ai", at: at(7, 0) },
        { from: "in_progress", to: "completed", by: "qa@qawave.ai", at: at(7, 48 * 60_000) },
        { from: "completed", to: "signed_off", by: "lead@qawave.ai", at: at(7, 55 * 60_000) },
      ],
      results: [
        { testId: "tc-login-happy", title: "Login with valid credentials", status: "pass", durationMs: 91_000 },
        { testId: "tc-login-locked", title: "Account locked after 5 attempts", status: "pass", durationMs: 126_000 },
        { testId: "tc-checkout-coupon", title: "Coupon discount in cart", status: "fail", durationMs: 65_000, notes: "Coupon SAVE10 returns 0% discount on staging — regression from PR #312." },
        { testId: "tc-a11y-keyboard-nav", title: "Keyboard navigation in main menu", status: "pass", durationMs: 51_000 },
      ],
    },
    {
      id: "run-manual-4",
      planId: "tp-checkout-regression",
      source: "manual",
      startedAt: at(5, 0),
      finishedAt: at(5, 70 * 60_000),
      triggeredBy: "po@qawave.ai",
      label: "release-2.4.0",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "po@qawave.ai", at: at(5, 0) },
        { from: "in_progress", to: "completed", by: "po@qawave.ai", at: at(5, 70 * 60_000) },
      ],
      results: [
        { testId: "tc-checkout-coupon", title: "Coupon discount in cart", status: "fail", durationMs: 67_000, notes: "Still not fixed, bug #PRJ-312 open.", issueUrl: "https://github.com/qa-wave/theridion/issues/312" },
        { testId: "tc-checkout-invalid-coupon", title: "Error message for invalid coupon", status: "pass", durationMs: 55_000 },
        { testId: "tc-checkout-payment-fail", title: "Declined payment card", status: "pass", durationMs: 80_000 },
      ],
    },
    {
      id: "run-manual-5",
      planId: "tp-sprint-48",
      source: "manual",
      startedAt: at(0, 30 * 60_000),
      finishedAt: null,
      triggeredBy: "qa@qawave.ai",
      label: "sprint-48-demo",
      runStatus: "in_progress",
      statusHistory: [
        { from: "created", to: "in_progress", by: "qa@qawave.ai", at: at(0, 30 * 60_000) },
      ],
      results: [
        { testId: "tc-email-welcome", title: "Welcome email after registration", status: "pass", durationMs: 145_000 },
        { testId: "tc-report-filters", title: "Dashboard filtering by date range", status: "skip", durationMs: 0, notes: "Feature flag disabled on demo environment." },
        { testId: "tc-export-csv", title: "Export report to CSV", status: "skip", durationMs: 0, notes: "Waiting for backend to complete." },
      ],
    },
    // ── Eyes runs (Playwright visual/FE) ─────────────────────────────────────
    {
      id: "run-eyes-1",
      source: "eyes",
      suiteName: "playwright/auth.spec.ts",
      startedAt: at(21, 30 * 60_000),
      finishedAt: at(21, 34 * 60_000),
      triggeredBy: "ci/theridion-eyes",
      label: "main@3f7a1b2",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-eyes", at: at(21, 30 * 60_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-eyes", at: at(21, 34 * 60_000) },
      ],
      results: [
        { testId: "auth › login happy path", title: "auth › login happy path", status: "pass", durationMs: 1_850 },
        { testId: "auth › invalid creds", title: "auth › invalid creds", status: "pass", durationMs: 2_310 },
        { testId: "auth › lockout banner", title: "auth › lockout banner", status: "pass", durationMs: 3_050 },
      ],
    },
    {
      id: "run-eyes-2",
      source: "eyes",
      suiteName: "playwright/auth.spec.ts",
      startedAt: at(14, 30 * 60_000),
      finishedAt: at(14, 35 * 60_000),
      triggeredBy: "ci/theridion-eyes",
      label: "main@9c4d8e1",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-eyes", at: at(14, 30 * 60_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-eyes", at: at(14, 35 * 60_000) },
      ],
      results: [
        { testId: "auth › login happy path", title: "auth › login happy path", status: "pass", durationMs: 1_920 },
        { testId: "auth › invalid creds", title: "auth › invalid creds", status: "pass", durationMs: 2_180 },
        { testId: "auth › lockout banner", title: "auth › lockout banner", status: "fail", durationMs: 3_200, evidence: "https://theridion-hub.qawave.ai/artifacts/eyes/run-eyes-2/lockout.png", notes: "Banner se nezobrazil do 3 s — flaky, timeout race." },
      ],
    },
    {
      id: "run-eyes-3",
      source: "eyes",
      suiteName: "playwright/auth.spec.ts",
      startedAt: at(7, 30 * 60_000),
      finishedAt: at(7, 34 * 60_000),
      triggeredBy: "ci/theridion-eyes",
      label: "main@b2f5c8a",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-eyes", at: at(7, 30 * 60_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-eyes", at: at(7, 34 * 60_000) },
      ],
      results: [
        { testId: "auth › login happy path", title: "auth › login happy path", status: "pass", durationMs: 1_790 },
        { testId: "auth › invalid creds", title: "auth › invalid creds", status: "pass", durationMs: 2_050 },
        { testId: "auth › lockout banner", title: "auth › lockout banner", status: "pass", durationMs: 2_980 },
      ],
    },
    {
      id: "run-eyes-4",
      source: "eyes",
      suiteName: "playwright/checkout.spec.ts",
      startedAt: at(5, 45 * 60_000),
      finishedAt: at(5, 51 * 60_000),
      triggeredBy: "ci/theridion-eyes",
      label: "main@b2f5c8a",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-eyes", at: at(5, 45 * 60_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-eyes", at: at(5, 51 * 60_000) },
      ],
      results: [
        { testId: "checkout › apply coupon SAVE10", title: "checkout › apply coupon SAVE10", status: "fail", durationMs: 4_200, notes: "SAVE10 discount assertion failed: expected 10% got 0%.", evidence: "https://theridion-hub.qawave.ai/artifacts/eyes/run-eyes-4/coupon-fail.png" },
        { testId: "checkout › invalid coupon error", title: "checkout › invalid coupon error", status: "pass", durationMs: 2_800 },
        { testId: "checkout › payment decline", title: "checkout › payment decline", status: "pass", durationMs: 3_600 },
      ],
    },
    {
      id: "run-eyes-5",
      source: "eyes",
      suiteName: "playwright/checkout.spec.ts",
      startedAt: at(1, 45 * 60_000),
      finishedAt: at(1, 51 * 60_000),
      triggeredBy: "ci/theridion-eyes",
      label: "main@e9d1a4f",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-eyes", at: at(1, 45 * 60_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-eyes", at: at(1, 51 * 60_000) },
      ],
      results: [
        { testId: "checkout › apply coupon SAVE10", title: "checkout › apply coupon SAVE10", status: "pass", durationMs: 3_900 },
        { testId: "checkout › invalid coupon error", title: "checkout › invalid coupon error", status: "pass", durationMs: 2_650 },
        { testId: "checkout › payment decline", title: "checkout › payment decline", status: "pass", durationMs: 3_400 },
      ],
    },
    {
      id: "run-eyes-6",
      source: "eyes",
      suiteName: "playwright/a11y.spec.ts",
      startedAt: at(3, 30 * 60_000),
      finishedAt: at(3, 33 * 60_000),
      triggeredBy: "ci/theridion-eyes",
      label: "main@c3e7b9d",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-eyes", at: at(3, 30 * 60_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-eyes", at: at(3, 33 * 60_000) },
      ],
      results: [
        { testId: "a11y › keyboard nav main menu", title: "a11y › keyboard nav main menu", status: "pass", durationMs: 1_500 },
        { testId: "a11y › focus visible login", title: "a11y › focus visible login", status: "pass", durationMs: 1_200 },
        { testId: "a11y › skip-to-content link", title: "a11y › skip-to-content link", status: "pass", durationMs: 900 },
      ],
    },
    // ── Net runs (Bruno API) ──────────────────────────────────────────────────
    {
      id: "run-net-1",
      source: "net",
      suiteName: "collections/auth-api",
      startedAt: at(21, 60_000),
      finishedAt: at(21, 3 * 60_000),
      triggeredBy: "ci/theridion-net",
      label: "main@3f7a1b2",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-net", at: at(21, 60_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-net", at: at(21, 3 * 60_000) },
      ],
      results: [
        { testId: "POST /login 200", title: "POST /login 200", status: "pass", durationMs: 310 },
        { testId: "POST /login 401", title: "POST /login 401", status: "pass", durationMs: 275 },
        { testId: "GET /me 200", title: "GET /me 200", status: "pass", durationMs: 205 },
        { testId: "rate-limit 429", title: "rate-limit 429", status: "pass", durationMs: 420 },
      ],
    },
    {
      id: "run-net-2",
      source: "net",
      suiteName: "collections/auth-api",
      startedAt: at(14, 60_000),
      finishedAt: at(14, 3 * 60_000),
      triggeredBy: "ci/theridion-net",
      label: "main@9c4d8e1",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-net", at: at(14, 60_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-net", at: at(14, 3 * 60_000) },
      ],
      results: [
        { testId: "POST /login 200", title: "POST /login 200", status: "pass", durationMs: 295 },
        { testId: "POST /login 401", title: "POST /login 401", status: "pass", durationMs: 260 },
        { testId: "GET /me 200", title: "GET /me 200", status: "pass", durationMs: 215 },
        { testId: "rate-limit 429", title: "rate-limit 429", status: "skip", durationMs: 0, notes: "Requires load profile." },
      ],
    },
    {
      id: "run-net-3",
      source: "net",
      suiteName: "collections/checkout-api",
      startedAt: at(7, 90_000),
      finishedAt: at(7, 4 * 60_000),
      triggeredBy: "ci/theridion-net",
      label: "main@b2f5c8a",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-net", at: at(7, 90_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-net", at: at(7, 4 * 60_000) },
      ],
      results: [
        { testId: "POST /orders 201", title: "POST /orders 201", status: "pass", durationMs: 380 },
        { testId: "POST /coupons/validate 200", title: "POST /coupons/validate 200", status: "fail", durationMs: 310, notes: "Response body missing 'discountPct' field." },
        { testId: "POST /payments/intent 200", title: "POST /payments/intent 200", status: "pass", durationMs: 520 },
        { testId: "POST /payments/intent 402", title: "POST /payments/intent 402", status: "pass", durationMs: 490 },
      ],
    },
    {
      id: "run-net-4",
      source: "net",
      suiteName: "collections/checkout-api",
      startedAt: at(1, 90_000),
      finishedAt: at(1, 4 * 60_000),
      triggeredBy: "ci/theridion-net",
      label: "main@e9d1a4f",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/theridion-net", at: at(1, 90_000) },
        { from: "in_progress", to: "completed", by: "ci/theridion-net", at: at(1, 4 * 60_000) },
      ],
      results: [
        { testId: "POST /orders 201", title: "POST /orders 201", status: "pass", durationMs: 365 },
        { testId: "POST /coupons/validate 200", title: "POST /coupons/validate 200", status: "pass", durationMs: 290 },
        { testId: "POST /payments/intent 200", title: "POST /payments/intent 200", status: "pass", durationMs: 505 },
        { testId: "POST /payments/intent 402", title: "POST /payments/intent 402", status: "pass", durationMs: 470 },
      ],
    },
    // ── Runner run (CI test runner — generic) ─────────────────────────────────
    {
      id: "run-runner-1",
      source: "runner",
      suiteName: "jest/unit",
      startedAt: at(7, 15 * 60_000),
      finishedAt: at(7, 17 * 60_000),
      triggeredBy: "ci/github-actions",
      label: "main@b2f5c8a",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/github-actions", at: at(7, 15 * 60_000) },
        { from: "in_progress", to: "completed", by: "ci/github-actions", at: at(7, 17 * 60_000) },
      ],
      results: [
        { testId: "unit › auth service › generateToken", title: "unit › auth service › generateToken", status: "pass", durationMs: 12 },
        { testId: "unit › auth service › verifyToken expired", title: "unit › auth service › verifyToken expired", status: "pass", durationMs: 8 },
        { testId: "unit › coupon service › apply SAVE10", title: "unit › coupon service › apply SAVE10", status: "fail", durationMs: 15, notes: "Expected discount 0.1, received 0." },
        { testId: "unit › coupon service › reject EXPIRED99", title: "unit › coupon service › reject EXPIRED99", status: "pass", durationMs: 9 },
        { testId: "unit › order service › createOrder", title: "unit › order service › createOrder", status: "pass", durationMs: 22 },
      ],
    },
    {
      id: "run-runner-2",
      source: "runner",
      suiteName: "jest/unit",
      startedAt: at(1, 15 * 60_000),
      finishedAt: at(1, 17 * 60_000),
      triggeredBy: "ci/github-actions",
      label: "main@e9d1a4f",
      runStatus: "completed",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/github-actions", at: at(1, 15 * 60_000) },
        { from: "in_progress", to: "completed", by: "ci/github-actions", at: at(1, 17 * 60_000) },
      ],
      results: [
        { testId: "unit › auth service › generateToken", title: "unit › auth service › generateToken", status: "pass", durationMs: 11 },
        { testId: "unit › auth service › verifyToken expired", title: "unit › auth service › verifyToken expired", status: "pass", durationMs: 9 },
        { testId: "unit › coupon service › apply SAVE10", title: "unit › coupon service › apply SAVE10", status: "pass", durationMs: 14 },
        { testId: "unit › coupon service › reject EXPIRED99", title: "unit › coupon service › reject EXPIRED99", status: "pass", durationMs: 8 },
        { testId: "unit › order service › createOrder", title: "unit › order service › createOrder", status: "pass", durationMs: 19 },
      ],
    },
    {
      id: "run-runner-3",
      source: "runner",
      suiteName: "jest/unit",
      startedAt: at(0, 15 * 60_000),
      finishedAt: at(0, 17 * 60_000),
      triggeredBy: "ci/github-actions",
      label: "main@f1c3d7e",
      runStatus: "blocked",
      statusHistory: [
        { from: "created", to: "in_progress", by: "ci/github-actions", at: at(0, 15 * 60_000) },
        { from: "in_progress", to: "blocked", by: "ci/github-actions", at: at(0, 17 * 60_000) },
      ],
      results: [
        { testId: "unit › auth service › generateToken", title: "unit › auth service › generateToken", status: "pass", durationMs: 13 },
        { testId: "unit › auth service › verifyToken expired", title: "unit › auth service › verifyToken expired", status: "blocked", durationMs: 0, notes: "DB connection timeout in CI — infra incident #INC-77." },
        { testId: "unit › coupon service › apply SAVE10", title: "unit › coupon service › apply SAVE10", status: "blocked", durationMs: 0, notes: "Blocked by DB connection failure." },
        { testId: "unit › coupon service › reject EXPIRED99", title: "unit › coupon service › reject EXPIRED99", status: "blocked", durationMs: 0, notes: "Blocked by DB connection failure." },
        { testId: "unit › order service › createOrder", title: "unit › order service › createOrder", status: "blocked", durationMs: 0, notes: "Blocked by DB connection failure." },
      ],
    },
  ];

  const requirements: Requirement[] = [
    {
      id: "req-auth-001",
      title: "Login with valid credentials",
      description: "The system must allow a user to log in with valid credentials and redirect them to the dashboard.",
      status: "done",
      priority: "critical",
      externalUrl: "https://linear.app/qawave/issue/QA-101",
      caseIds: ["tc-login-happy", "tc-login-invalid"],
      createdAt: at(40),
      updatedAt: at(5),
    },
    {
      id: "req-auth-002",
      title: "Brute-force account protection",
      description: "After 5 failed attempts the account must be temporarily locked for 15 minutes. Lockout banner must be visible.",
      status: "done",
      priority: "high",
      externalUrl: "https://linear.app/qawave/issue/QA-102",
      caseIds: ["tc-login-locked", "tc-password-reset"],
      createdAt: at(38),
      updatedAt: at(5),
    },
    {
      id: "req-checkout-001",
      title: "Discount coupon support in cart",
      description: "A valid coupon must reduce the total order price by the declared percentage. An invalid coupon must be rejected with an error.",
      status: "in_progress",
      priority: "medium",
      externalUrl: "https://linear.app/qawave/issue/QA-201",
      caseIds: ["tc-checkout-coupon", "tc-checkout-invalid-coupon"],
      createdAt: at(30),
      updatedAt: at(3),
    },
    {
      id: "req-checkout-002",
      title: "Declined payment card handling",
      description: "The system must correctly handle payment rejection from the payment gateway and inform the user.",
      status: "done",
      priority: "high",
      externalUrl: undefined,
      caseIds: ["tc-checkout-payment-fail"],
      createdAt: at(25),
      updatedAt: at(4),
    },
    {
      id: "req-api-001",
      title: "Rate limiting on public API endpoints",
      description: "All public endpoints must enforce rate limit of 100 req/min/IP with HTTP 429 and Retry-After header.",
      status: "done",
      priority: "high",
      externalUrl: "https://linear.app/qawave/issue/QA-301",
      caseIds: ["tc-api-rate-limit", "tc-api-pagination"],
      createdAt: at(22),
      updatedAt: at(3),
    },
    {
      id: "req-notify-001",
      title: "Email notifications on key actions",
      description: "The system must send a welcome email on registration and notifications on order status changes.",
      status: "open",
      priority: "medium",
      externalUrl: undefined,
      caseIds: ["tc-email-welcome", "tc-api-webhook"],
      createdAt: at(16),
      updatedAt: at(1),
    },
  ];

  const scripts: TestScript[] = [
    {
      id: "scr-auth-login",
      name: "Auth login spec",
      product: "eyes",
      framework: "Playwright",
      specPath: "playwright/auth.spec.ts",
      caseKey: "auth › login happy path",
      jiraKey: "CEPS-501",
      status: "active",
      owner: "qa@qawave.ai",
      statusHistory: [
        { from: "draft", to: "active", by: "qa@qawave.ai", at: at(20) },
      ],
      createdAt: at(22),
      updatedAt: at(20),
    },
    {
      id: "scr-auth-lockout",
      name: "Auth lockout spec",
      product: "eyes",
      framework: "Playwright",
      specPath: "playwright/auth.spec.ts",
      caseKey: "auth › lockout banner",
      status: "flaky",
      owner: "qa@qawave.ai",
      statusHistory: [
        { from: "draft", to: "active", by: "qa@qawave.ai", at: at(20) },
        { from: "active", to: "flaky", by: "ci", at: at(5) },
      ],
      createdAt: at(22),
      updatedAt: at(5),
    },
    {
      id: "scr-checkout",
      name: "Checkout E2E spec",
      product: "eyes",
      framework: "Playwright",
      specPath: "playwright/checkout.spec.ts",
      caseKey: "checkout › apply coupon SAVE10",
      jiraKey: "CEPS-502",
      status: "active",
      owner: "po@qawave.ai",
      statusHistory: [
        { from: "draft", to: "active", by: "po@qawave.ai", at: at(18) },
      ],
      createdAt: at(20),
      updatedAt: at(18),
    },
    {
      id: "scr-a11y",
      name: "Accessibility spec",
      product: "eyes",
      framework: "Playwright",
      specPath: "playwright/a11y.spec.ts",
      status: "active",
      owner: "qa@qawave.ai",
      statusHistory: [
        { from: "draft", to: "active", by: "qa@qawave.ai", at: at(10) },
      ],
      createdAt: at(12),
      updatedAt: at(10),
    },
    {
      id: "scr-auth-api",
      name: "Auth API collection",
      product: "net",
      framework: "Bruno",
      specPath: "collections/auth-api",
      caseKey: "rate-limit 429",
      status: "active",
      owner: "qa@qawave.ai",
      statusHistory: [
        { from: "draft", to: "active", by: "qa@qawave.ai", at: at(19) },
      ],
      createdAt: at(22),
      updatedAt: at(19),
    },
    {
      id: "scr-checkout-api",
      name: "Checkout API collection",
      product: "net",
      framework: "Bruno",
      specPath: "collections/checkout-api",
      status: "flaky",
      owner: "dev@qawave.ai",
      statusHistory: [
        { from: "draft", to: "active", by: "dev@qawave.ai", at: at(16) },
        { from: "active", to: "flaky", by: "ci", at: at(4) },
      ],
      createdAt: at(18),
      updatedAt: at(4),
    },
    {
      id: "scr-webhooks-api",
      name: "Webhook API collection",
      product: "net",
      framework: "Bruno",
      specPath: "collections/webhooks-api",
      status: "draft",
      owner: "dev@qawave.ai",
      statusHistory: [],
      createdAt: at(5),
      updatedAt: at(5),
    },
    {
      id: "scr-legacy-soap",
      name: "Legacy SOAP import (deprecated)",
      product: "net",
      framework: "Bruno",
      specPath: "collections/legacy-soap",
      status: "deprecated",
      owner: "dev@qawave.ai",
      statusHistory: [
        { from: "active", to: "deprecated", by: "dev@qawave.ai", at: at(45) },
      ],
      createdAt: at(90),
      updatedAt: at(45),
    },
  ];

  return { cases, plans, runs, requirements, scripts };
}

const g = globalThis as unknown as { __weaveStore?: Store; __weaveKvSeeded?: boolean };
function ensureStore(s: Store): Store {
  if (!s.requirements) s.requirements = [];
  if (!s.scripts) s.scripts = [];
  // Ensure all cases/runs have statusHistory
  for (const c of s.cases) {
    if (!c.statusHistory) (c as TestCase).statusHistory = [];
  }
  for (const r of s.runs) {
    if (!r.statusHistory) (r as TestRun).statusHistory = [];
    if (!r.runStatus) (r as TestRun).runStatus = "created";
  }
  return s;
}
const mem: Store = ensureStore(g.__weaveStore ?? (g.__weaveStore = seed()));

// ─── Demo-mode settings seed ─────────────────────────────────────────────────
// In demo mode (no DATABASE_URL) pre-populate the kv store so the Eyes module
// page (/modules/eyes) resolves to a connected, data-populated view instead of
// 404ing because no settings have been persisted yet.
if (!USE_DB && !g.__weaveKvSeeded) {
  g.__weaveKvSeeded = true;
  const demoSettings = defaultSettings();
  // Mark Eyes as installed as an 'app' type so /modules/eyes resolves
  demoSettings.eyes = {
    ...demoSettings.eyes,
    enabled: true,
    installed: true,
    connectionType: "app",
    token: "demo-token",
  };
  // Mark Net as installed as well so /modules/net also has data
  demoSettings.net = {
    ...demoSettings.net,
    enabled: true,
    installed: true,
    connectionType: "app",
    token: "demo-token",
  };
  // Pre-populate — don't overwrite if already set (idempotent)
  if (!memKv.has("integrations")) {
    memKv.set("integrations", demoSettings);
  }
  // Seed lastSeen for eyes and net so the module page shows "last received" instead of "waiting"
  if (!memKv.has("lastSeen:eyes")) {
    memKv.set("lastSeen:eyes", at(1));
  }
  if (!memKv.has("lastSeen:net")) {
    memKv.set("lastSeen:net", at(1));
  }
}

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
    ...(input.caseKey ? { caseKey: input.caseKey } : {}),
    statusHistory: [],
    createdAt: now,
    updatedAt: now,
  };
  if (USE_DB) {
    await sql()`insert into test_cases
      (id, title, description, steps, expected_result, priority, tags, status, owner, case_key, jira_key, status_history, created_at, updated_at)
      values (${tc.id}, ${tc.title}, ${tc.description}, ${JSON.stringify(tc.steps)},
              ${tc.expectedResult}, ${tc.priority}, ${JSON.stringify(tc.tags)}, ${tc.status},
              ${tc.owner}, ${tc.caseKey ?? null}, ${tc.jiraKey ?? null},
              ${JSON.stringify(tc.statusHistory)}, ${tc.createdAt}, ${tc.updatedAt})`;
  } else {
    mem.cases.push(tc);
  }
  return tc;
}

export async function updateTestCase(input: UpdateTestCaseInput): Promise<TestCase | undefined> {
  const existing = await getTestCase(input.id);
  if (!existing) return undefined;
  // caseKey: explicit undefined means "keep existing"; null/empty means "clear"
  const caseKey = "caseKey" in input ? (input.caseKey || undefined) : existing.caseKey;
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
    caseKey,
    updatedAt: new Date().toISOString(),
  };
  if (USE_DB) {
    await sql()`update test_cases set
      title = ${next.title}, description = ${next.description}, steps = ${JSON.stringify(next.steps)},
      expected_result = ${next.expectedResult}, priority = ${next.priority}, tags = ${JSON.stringify(next.tags)},
      status = ${next.status}, owner = ${next.owner}, case_key = ${next.caseKey ?? null},
      jira_key = ${next.jiraKey ?? null}, status_history = ${JSON.stringify(next.statusHistory)},
      updated_at = ${next.updatedAt}
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

/** Transition a TestCase status (enforces workflow — see workflow.ts). */
export async function patchTestCaseStatus(
  id: string,
  toStatus: TestCase["status"],
  by: string,
): Promise<TestCase | undefined> {
  const existing = await getTestCase(id);
  if (!existing) return undefined;
  const history = appendHistory(existing.statusHistory ?? [], existing.status, toStatus, by);
  const next: TestCase = { ...existing, status: toStatus, statusHistory: history, updatedAt: new Date().toISOString() };
  if (USE_DB) {
    await sql()`update test_cases set
      status = ${next.status}, status_history = ${JSON.stringify(next.statusHistory)},
      updated_at = ${next.updatedAt}
      where id = ${next.id}`;
  } else {
    const i = mem.cases.findIndex((c) => c.id === next.id);
    if (i !== -1) mem.cases[i] = next;
  }
  return next;
}

/** Patch jiraKey on a test case. */
export async function setTestCaseJiraKey(id: string, jiraKey: string): Promise<TestCase | undefined> {
  const existing = await getTestCase(id);
  if (!existing) return undefined;
  const next: TestCase = { ...existing, jiraKey, updatedAt: new Date().toISOString() };
  if (USE_DB) {
    await sql()`update test_cases set jira_key = ${jiraKey}, updated_at = ${next.updatedAt} where id = ${id}`;
  } else {
    const i = mem.cases.findIndex((c) => c.id === id);
    if (i !== -1) mem.cases[i] = next;
  }
  return next;
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

export async function getTestRun(id: string): Promise<TestRun | undefined> {
  if (USE_DB) {
    const rows = (await sql()`select * from test_runs where id = ${id}`) as unknown[];
    return rows[0] ? rowToRun(rows[0]) : undefined;
  }
  return mem.runs.find((r) => r.id === id);
}

async function insertRun(run: TestRun): Promise<TestRun> {
  if (USE_DB) {
    await sql()`insert into test_runs
      (id, plan_id, source, suite_name, label, triggered_by, started_at, finished_at, results, run_status, jira_key, status_history)
      values (${run.id}, ${run.planId ?? null}, ${run.source}, ${run.suiteName ?? null}, ${run.label ?? null},
              ${run.triggeredBy}, ${run.startedAt}, ${run.finishedAt}, ${JSON.stringify(run.results)},
              ${run.runStatus}, ${run.jiraKey ?? null}, ${JSON.stringify(run.statusHistory)})`;
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
    runStatus: "created",
    statusHistory: [],
  });
}

/** Idempotently persist a normalized run (id = canonical run_id). */
export async function saveIngestedRun(run: TestRun): Promise<{ created: boolean; run: TestRun }> {
  const existing = await getTestRun(run.id);
  if (existing) return { created: false, run: existing };
  await insertRun(run);
  return { created: true, run };
}

/**
 * Scaffold a manual run from a test plan — creates a TestRun with one pending
 * result per case in the plan. The run is immediately persisted as source='manual'
 * with finishedAt=null (in-progress).
 */
export async function createRunFromPlan(input: CreateRunFromPlanInput): Promise<TestRun | null> {
  const plan = await getTestPlan(input.planId);
  if (!plan) return null;
  const cases = await Promise.all(plan.testCaseIds.map((id) => getTestCase(id)));
  const validCases = cases.filter((c): c is TestCase => c !== undefined);
  const now = new Date().toISOString();
  return insertRun({
    id: `run-${randomUUID().slice(0, 8)}`,
    planId: plan.id,
    source: "manual",
    startedAt: now,
    finishedAt: null,
    triggeredBy: input.triggeredBy,
    label: input.label,
    runStatus: "in_progress",
    statusHistory: [{ from: "created", to: "in_progress", by: input.triggeredBy, at: now }],
    results: validCases.map((c) => ({
      testId: c.id,
      title: c.title,
      status: "skip" as const, // default — tester will update each result
      durationMs: 0,
    })),
  });
}

/**
 * Patch a single result inside an existing run.
 * Also marks finishedAt when all results are no longer "skip" (i.e. reviewed).
 */
export async function patchRunResult(
  runId: string,
  testId: string,
  patch: { status: "pass" | "fail" | "skip" | "blocked"; notes?: string; evidence?: string; issueUrl?: string },
): Promise<TestRun | null> {
  const run = await getTestRun(runId);
  if (!run) return null;
  const results = run.results.map((r) =>
    r.testId === testId
      ? { ...r, status: patch.status, notes: patch.notes, evidence: patch.evidence || undefined, issueUrl: patch.issueUrl || r.issueUrl }
      : r,
  );
  const allReviewed = results.every((r) => r.status !== "skip");
  const finishedAt = allReviewed ? (run.finishedAt ?? new Date().toISOString()) : null;
  const updated: TestRun = { ...run, results, finishedAt };

  if (USE_DB) {
    await sql()`update test_runs set results = ${JSON.stringify(results)},
      finished_at = ${finishedAt}
      where id = ${runId}`;
  } else {
    const i = mem.runs.findIndex((r) => r.id === runId);
    if (i !== -1) mem.runs[i] = updated;
  }
  return updated;
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
    runStatus: "completed",
    statusHistory: [],
  });
}

/** Transition a run's workflow status. */
export async function patchRunStatus(
  runId: string,
  toStatus: RunWorkflowStatus,
  by: string,
): Promise<TestRun | null> {
  const run = await getTestRun(runId);
  if (!run) return null;
  const history = appendHistory(run.statusHistory ?? [], run.runStatus, toStatus, by);
  const updated: TestRun = { ...run, runStatus: toStatus, statusHistory: history };
  if (USE_DB) {
    await sql()`update test_runs set
      run_status = ${toStatus}, status_history = ${JSON.stringify(history)}
      where id = ${runId}`;
  } else {
    const i = mem.runs.findIndex((r) => r.id === runId);
    if (i !== -1) mem.runs[i] = updated;
  }
  return updated;
}

/** Patch jiraKey on a run. */
export async function setRunJiraKey(runId: string, jiraKey: string): Promise<TestRun | null> {
  const run = await getTestRun(runId);
  if (!run) return null;
  const updated: TestRun = { ...run, jiraKey };
  if (USE_DB) {
    await sql()`update test_runs set jira_key = ${jiraKey} where id = ${runId}`;
  } else {
    const i = mem.runs.findIndex((r) => r.id === runId);
    if (i !== -1) mem.runs[i] = updated;
  }
  return updated;
}

// ─── Scripts ─────────────────────────────────────────────────────────────────

export interface ScriptFilter {
  product?: string;
  status?: string;
  q?: string;
}

function applyScriptFilter(rows: TestScript[], filter: ScriptFilter): TestScript[] {
  return rows
    .filter((s) => (filter.product ? s.product === filter.product : true))
    .filter((s) => (filter.status ? s.status === filter.status : true))
    .filter((s) => (filter.q ? s.name.toLowerCase().includes(filter.q.toLowerCase()) : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listTestScripts(filter: ScriptFilter = {}): Promise<TestScript[]> {
  if (USE_DB) {
    const rows = (await sql()`select * from test_scripts`) as unknown[];
    return applyScriptFilter(rows.map(rowToScript), filter);
  }
  return applyScriptFilter(mem.scripts, filter);
}

export async function getTestScript(id: string): Promise<TestScript | undefined> {
  if (USE_DB) {
    const rows = (await sql()`select * from test_scripts where id = ${id}`) as unknown[];
    return rows[0] ? rowToScript(rows[0]) : undefined;
  }
  return mem.scripts.find((s) => s.id === id);
}

export async function createTestScript(input: CreateTestScriptInput): Promise<TestScript> {
  const now = new Date().toISOString();
  const scr: TestScript = {
    id: `scr-${randomUUID().slice(0, 8)}`,
    name: input.name,
    product: input.product,
    framework: input.framework,
    specPath: input.specPath,
    caseKey: input.caseKey,
    status: input.status,
    owner: input.owner,
    statusHistory: [],
    createdAt: now,
    updatedAt: now,
  };
  if (USE_DB) {
    await sql()`insert into test_scripts
      (id, name, product, framework, spec_path, case_key, status, owner, jira_key, status_history, created_at, updated_at)
      values (${scr.id}, ${scr.name}, ${scr.product}, ${scr.framework}, ${scr.specPath ?? null},
              ${scr.caseKey ?? null}, ${scr.status}, ${scr.owner}, null, ${JSON.stringify(scr.statusHistory)},
              ${scr.createdAt}, ${scr.updatedAt})`;
  } else {
    mem.scripts.push(scr);
  }
  return scr;
}

export async function updateTestScript(input: UpdateTestScriptInput): Promise<TestScript | undefined> {
  const existing = await getTestScript(input.id);
  if (!existing) return undefined;
  const next: TestScript = {
    ...existing,
    name: input.name ?? existing.name,
    product: input.product ?? existing.product,
    framework: input.framework ?? existing.framework,
    specPath: "specPath" in input ? (input.specPath ?? undefined) : existing.specPath,
    caseKey: "caseKey" in input ? (input.caseKey ?? undefined) : existing.caseKey,
    status: input.status ?? existing.status,
    owner: input.owner ?? existing.owner,
    updatedAt: new Date().toISOString(),
  };
  if (USE_DB) {
    await sql()`update test_scripts set
      name = ${next.name}, product = ${next.product}, framework = ${next.framework},
      spec_path = ${next.specPath ?? null}, case_key = ${next.caseKey ?? null},
      status = ${next.status}, owner = ${next.owner}, updated_at = ${next.updatedAt}
      where id = ${next.id}`;
  } else {
    const i = mem.scripts.findIndex((s) => s.id === next.id);
    if (i !== -1) mem.scripts[i] = next;
  }
  return next;
}

export async function deleteTestScript(id: string): Promise<boolean> {
  if (USE_DB) {
    const rows = (await sql()`delete from test_scripts where id = ${id} returning id`) as unknown[];
    return rows.length > 0;
  }
  const i = mem.scripts.findIndex((s) => s.id === id);
  if (i === -1) return false;
  mem.scripts.splice(i, 1);
  return true;
}

export async function patchScriptStatus(
  id: string,
  toStatus: ScriptStatus,
  by: string,
): Promise<TestScript | undefined> {
  const existing = await getTestScript(id);
  if (!existing) return undefined;
  const history = appendHistory(existing.statusHistory ?? [], existing.status, toStatus, by);
  const next: TestScript = { ...existing, status: toStatus, statusHistory: history, updatedAt: new Date().toISOString() };
  if (USE_DB) {
    await sql()`update test_scripts set
      status = ${toStatus}, status_history = ${JSON.stringify(history)}, updated_at = ${next.updatedAt}
      where id = ${id}`;
  } else {
    const i = mem.scripts.findIndex((s) => s.id === id);
    if (i !== -1) mem.scripts[i] = next;
  }
  return next;
}

export async function setScriptJiraKey(id: string, jiraKey: string): Promise<TestScript | undefined> {
  const existing = await getTestScript(id);
  if (!existing) return undefined;
  const next: TestScript = { ...existing, jiraKey, updatedAt: new Date().toISOString() };
  if (USE_DB) {
    await sql()`update test_scripts set jira_key = ${jiraKey}, updated_at = ${next.updatedAt} where id = ${id}`;
  } else {
    const i = mem.scripts.findIndex((s) => s.id === id);
    if (i !== -1) mem.scripts[i] = next;
  }
  return next;
}

// ─── Source health (lastSeen) ─────────────────────────────────────────────────

/** Record the current timestamp as lastSeen for a given integration source. */
export async function recordLastSeen(source: "eyes" | "net" | "runner"): Promise<void> {
  await kvSet(`lastSeen:${source}`, new Date().toISOString());
}

/** Retrieve lastSeen ISO timestamp for a source, or null if never seen. */
export async function getLastSeen(source: "eyes" | "net" | "runner"): Promise<string | null> {
  return kvGet<string>(`lastSeen:${source}`);
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export async function recentRunSummaries(limit = 10): Promise<RunSummary[]> {
  const runs = await listTestRuns();
  return runs.slice(0, limit).map(summariseRun);
}

export async function coverage(): Promise<CoverageSummary> {
  const [cases, allRuns] = await Promise.all([listTestCases(), listTestRuns()]);
  const active = cases.filter((c) => c.status === "active");

  // Collect all passing testIds across ALL sources (manual + automated)
  const passedTestIds = new Set(
    allRuns.flatMap((r) => r.results.filter((res) => res.status === "pass").map((res) => res.testId)),
  );

  // Build a caseKey index for automated coverage matching
  const passedCaseKeys = new Set(
    allRuns
      .filter((r) => r.source !== "manual")
      .flatMap((r) => r.results.filter((res) => res.status === "pass").map((res) => res.testId)),
  );

  const covered = active.filter(
    (c) =>
      // Direct match: manual run testId = case id
      passedTestIds.has(c.id) ||
      // Automated match: automated run test_key = case.caseKey
      (c.caseKey != null && c.caseKey !== "" && passedCaseKeys.has(c.caseKey)),
  ).length;

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
  const sources: RunSource[] = ["manual", "eyes", "net", "runner"];
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

// ─── Aggregate API ────────────────────────────────────────────────────────────

export interface AggregateBySource {
  source: RunSource;
  passRate: number;
  pass: number;
  fail: number;
  skip: number;
  blocked: number;
  total: number;
  runCount: number;
}

export interface AggregateByMilestone {
  milestone: string;
  passRate: number;
  pass: number;
  fail: number;
  skip: number;
  blocked: number;
  total: number;
  runCount: number;
}

export interface AggregateResult {
  coverage: CoverageSummary;
  bySource: AggregateBySource[];
  byMilestone: AggregateByMilestone[];
  generatedAt: string;
}

export async function aggregate(): Promise<AggregateResult> {
  const [cov, allRuns] = await Promise.all([coverage(), listTestRuns()]);
  const sources: RunSource[] = ["manual", "eyes", "net", "runner"];

  const bySource: AggregateBySource[] = sources.map((source) => {
    const sourceRuns = allRuns.filter((r) => r.source === source);
    const results = sourceRuns.flatMap((r) => r.results);
    const pass = results.filter((r) => r.status === "pass").length;
    const fail = results.filter((r) => r.status === "fail").length;
    const skip = results.filter((r) => r.status === "skip").length;
    const blocked = results.filter((r) => r.status === "blocked").length;
    const total = results.length;
    return { source, passRate: total === 0 ? 100 : (pass / total) * 100, pass, fail, skip, blocked, total, runCount: sourceRuns.length };
  });

  // Group by milestone (label or suiteName or "unlabeled")
  const milestoneMap = new Map<string, { pass: number; fail: number; skip: number; blocked: number; total: number; runs: number }>();
  for (const run of allRuns) {
    const key = run.milestone ?? run.label ?? "unlabeled";
    const entry = milestoneMap.get(key) ?? { pass: 0, fail: 0, skip: 0, blocked: 0, total: 0, runs: 0 };
    for (const r of run.results) {
      entry[r.status] += 1;
      entry.total += 1;
    }
    entry.runs += 1;
    milestoneMap.set(key, entry);
  }
  const byMilestone: AggregateByMilestone[] = [...milestoneMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([milestone, s]) => ({
      milestone,
      passRate: s.total === 0 ? 100 : (s.pass / s.total) * 100,
      pass: s.pass,
      fail: s.fail,
      skip: s.skip,
      blocked: s.blocked,
      total: s.total,
      runCount: s.runs,
    }));

  return { coverage: cov, bySource, byMilestone, generatedAt: new Date().toISOString() };
}

// ─── Requirements ─────────────────────────────────────────────────────────────

export async function listRequirements(): Promise<Requirement[]> {
  if (USE_DB) {
    const rows = (await sql()`select * from requirements order by updated_at desc`) as unknown[];
    return rows.map(rowToRequirement);
  }
  return [...mem.requirements].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRequirement(id: string): Promise<Requirement | undefined> {
  if (USE_DB) {
    const rows = (await sql()`select * from requirements where id = ${id}`) as unknown[];
    return rows[0] ? rowToRequirement(rows[0]) : undefined;
  }
  return mem.requirements.find((r) => r.id === id);
}

export async function createRequirement(input: CreateRequirementInput): Promise<Requirement> {
  const now = new Date().toISOString();
  const req: Requirement = {
    id: `req-${randomUUID().slice(0, 8)}`,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    externalUrl: input.externalUrl,
    caseIds: input.caseIds,
    createdAt: now,
    updatedAt: now,
  };
  if (USE_DB) {
    await sql()`insert into requirements
      (id, title, description, status, priority, external_url, case_ids, created_at, updated_at)
      values (${req.id}, ${req.title}, ${req.description}, ${req.status}, ${req.priority},
              ${req.externalUrl ?? null}, ${JSON.stringify(req.caseIds)}, ${req.createdAt}, ${req.updatedAt})`;
  } else {
    mem.requirements.push(req);
  }
  return req;
}

export async function updateRequirement(input: UpdateRequirementInput): Promise<Requirement | undefined> {
  const existing = await getRequirement(input.id);
  if (!existing) return undefined;
  const next: Requirement = {
    ...existing,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    status: input.status ?? existing.status,
    priority: input.priority ?? existing.priority,
    externalUrl: "externalUrl" in input ? (input.externalUrl || undefined) : existing.externalUrl,
    caseIds: input.caseIds ?? existing.caseIds,
    updatedAt: new Date().toISOString(),
  };
  if (USE_DB) {
    await sql()`update requirements set
      title = ${next.title}, description = ${next.description}, status = ${next.status},
      priority = ${next.priority}, external_url = ${next.externalUrl ?? null},
      case_ids = ${JSON.stringify(next.caseIds)}, updated_at = ${next.updatedAt}
      where id = ${next.id}`;
  } else {
    const i = mem.requirements.findIndex((r) => r.id === next.id);
    if (i !== -1) mem.requirements[i] = next;
  }
  return next;
}

export async function deleteRequirement(id: string): Promise<boolean> {
  if (USE_DB) {
    const rows = (await sql()`delete from requirements where id = ${id} returning id`) as unknown[];
    return rows.length > 0;
  }
  const i = mem.requirements.findIndex((r) => r.id === id);
  if (i === -1) return false;
  mem.requirements.splice(i, 1);
  return true;
}

/** Build the coverage matrix: for each requirement, how many of its cases pass. */
export async function requirementCoverageMatrix(): Promise<RequirementCoverageRow[]> {
  const [reqs, allRuns, allCases] = await Promise.all([listRequirements(), listTestRuns(), listTestCases()]);

  // Build the set of covered case IDs (same logic as coverage())
  const passedTestIds = new Set(
    allRuns.flatMap((r) => r.results.filter((res) => res.status === "pass").map((res) => res.testId)),
  );
  const passedCaseKeys = new Set(
    allRuns
      .filter((r) => r.source !== "manual")
      .flatMap((r) => r.results.filter((res) => res.status === "pass").map((res) => res.testId)),
  );
  const caseKeyIndex = new Map(allCases.filter((c) => c.caseKey).map((c) => [c.caseKey!, c.id]));

  const isCovered = (caseId: string): boolean => {
    if (passedTestIds.has(caseId)) return true;
    // Look up by caseKey
    for (const [key, id] of caseKeyIndex) {
      if (id === caseId && passedCaseKeys.has(key)) return true;
    }
    return false;
  };

  return reqs.map((req) => {
    const totalCases = req.caseIds.length;
    const coveredCases = req.caseIds.filter((id) => isCovered(id)).length;
    return {
      requirement: req,
      totalCases,
      coveredCases,
      coveragePct: totalCases === 0 ? 0 : (coveredCases / totalCases) * 100,
    };
  });
}
