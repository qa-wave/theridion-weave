## Project metadata

| Klíč | Hodnota |
|---|---|
| **Name** | `theridion-weave` |
| **Group** | `qa-tooling` |
| **GitHub** | [qa-wave/theridion-weave](https://github.com/qa-wave/theridion-weave) |
| **Type** | Web (Next.js 16) — `theridion-weave.qawave.ai` |

## Session start

1. `memory/soul.md` — identita projektu
2. `memory/memory.md` — index paměti
3. `apps/weave/src/lib/types.ts` — doménový model
4. `CHANGELOG.md`

---

# Theridion Weave — kontext

**Test management** vrstva Theridion QA suite. Spravuje manuální test cases,
test plány a sjednocuje běhy z manuálního testování + automatizace z **Eyes**
(FE) a **Net** (BE). Weave plány/spravuje, **Hub** pozoruje kvalitu nad SDLC.

## Stack

Next.js 16 (App Router, RSC, Turbopack), React 19, Tailwind 4, zod, Neon
serverless (in-memory seed fallback), jest + Playwright. Region `fra1`.
Next 16 konvence: middleware = `proxy.ts` (NE `middleware.ts`). Žádné Edge funkce.

## Layout

```
theridion-weave/
├── apps/
│   └── weave/             Next.js 16 web app
│       ├── src/
│       │   ├── app/       stránky (/, /cases, /plans, /runs) + app/api route handlers
│       │   ├── components/ Nav + UI primitiva (badges, karty)
│       │   ├── data/      store.ts — in-memory seed + CRUD + agregace
│       │   ├── lib/        types.ts, validation.ts (zod), utils.ts, db.ts (Neon)
│       │   └── proxy.ts    Next 16 request proxy (hardening headers)
│       └── tests/e2e/
├── docs/                  data-model.md
├── memory/  wiki/
└── .github/workflows/ci.yml
```

## Časté příkazy

```bash
cd apps/weave && pnpm dev
cd apps/weave && pnpm typecheck && pnpm test && pnpm build
```

## Příbuzné projekty

- **theridion-net** — desktop (BE/integration); publikuje run results
- **theridion-eyes** — desktop (FE/visual); publikuje Silk run results
- **theridion-hub** — SDLC QA přehled; Weave i Eyes/Net do něj krmí data
- **theridion-runner** — CLI publisher; posílá výsledky na `/api/runs/ingest`

---

Pokud potřebuješ upravit, edituj přímo `CLAUDE.md`.
