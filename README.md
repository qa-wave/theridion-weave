# Theridion Weave

**Test management** webová aplikace nad celou Theridion QA suite. Spravuje
manuální testovací scénáře (test cases), test plány/suites a sjednocuje běhy
z manuálního testování i z automatizovaných nástrojů **Theridion Eyes** (FE /
visual) a **Theridion Net** (BE / integration).

> Weave = *kde se testy plánují a spravují*. **Theridion Hub** = *kde se kvalita
> pozoruje nad celým SDLC*. Weave krmí Hub stejně jako Eyes a Net.

## Rodina Theridion

| Projekt | Typ | Role |
|---|---|---|
| [theridion-net](https://github.com/qa-wave/theridion-net) | Desktop (Tauri) | BE / integration / load / security / network testing |
| [theridion-eyes](https://github.com/qa-wave/theridion-eyes) | Desktop (Tauri) | Frontend / visual automation testing |
| [theridion-hub](https://github.com/qa-wave/theridion-hub) | Web (Next.js) | SDLC QA přehled / quality gates |
| [theridion-runner](https://github.com/qa-wave/theridion-runner) | CLI | Publikuje výsledky běhů do Hubu / Weave |
| **theridion-weave** | Web (Next.js) | **Test management** (tento projekt) |

## Stack

Next.js 16 (App Router, RSC, Turbopack) · React 19 · Tailwind 4 · zod ·
Neon serverless Postgres (s in-memory seed fallbackem) · jest · Playwright.
Region `fra1`. Doména `theridion-weave.qawave.ai`.

## Vývoj

```bash
cd apps/weave
pnpm install
pnpm dev          # http://localhost:3000
pnpm typecheck
pnpm test
pnpm build
```

Bez `DATABASE_URL` aplikace běží z in-memory seed dat (`src/data/store.ts`) —
nepotřebuje žádný provisioning.

## Aplikace

- `/` — přehled (pokrytí, výsledky podle zdroje, poslední běhy)
- `/cases` — správa manuálních test cases (filtr, detail, vytvoření)
- `/plans` — test plány / suites
- `/runs` — sjednocený pohled na manuální + Eyes + Net běhy

### Ingest běhů

Automatizované výsledky z Eyes/Net publikuje Runner na:

```
POST /api/runs/ingest
Authorization: Bearer <WEAVE_INGEST_TOKEN>
```

Payload odpovídá tvaru, který Runner posílá do Hubu (viz `src/lib/types.ts`
→ `RunnerIngestPayload`).
