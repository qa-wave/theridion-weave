# Data model — Theridion Weave

Kanonické typy: `apps/weave/src/lib/types.ts`. Validace: `src/lib/validation.ts`
(zod). MVP persistence: `src/data/store.ts` (in-memory seed). Pro produkci lze
namapovat na Neon Postgres (`src/lib/db.ts`).

## Entity

### TestCase (manuální scénář)
`id, title, description, steps[] (order, action, expectedResult?), expectedResult,
priority (low|medium|high|critical), tags[], status (draft|active|deprecated),
type ('manual'), owner, createdAt, updatedAt`

### TestPlan / Suite
`id, name, description, testCaseIds[], createdAt, updatedAt`

### TestRun
`id, planId?, source (manual|eyes|net), startedAt, finishedAt|null,
results[] (testId, title, status pass|fail|skip|blocked, durationMs, evidence?, notes?),
triggeredBy, suiteName?, label?`

### RunnerIngestPayload
Tvar přijímaný na `POST /api/runs/ingest` — odpovídá tomu, co `theridion-runner`
publikuje do Hubu: `{ source, suiteName, label?, triggeredBy, startedAt,
finishedAt, results[] }`.

## Navrhované SQL schéma (Neon)

```sql
create table test_cases (
  id text primary key,
  title text not null,
  description text not null default '',
  steps jsonb not null default '[]',
  expected_result text not null default '',
  priority text not null default 'medium',
  tags text[] not null default '{}',
  status text not null default 'draft',
  owner text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table test_plans (
  id text primary key,
  name text not null,
  description text not null default '',
  test_case_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table test_runs (
  id text primary key,
  plan_id text references test_plans(id),
  source text not null,
  suite_name text,
  label text,
  triggered_by text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  results jsonb not null default '[]'
);

create index on test_runs (source, started_at desc);
```
