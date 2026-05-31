# Changelog

Všechny významné změny tohoto projektu jsou dokumentovány v tomto souboru.
Formát vychází z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
projekt používá [sémantické verzování](https://semver.org/lang/cs/).

## [0.1.0] — 2026-05-31

### Added — initial test management app

- **Theridion Weave** (`apps/weave`) — nová web aplikace (Next.js 16) pro test
  management nad celou Theridion QA suite.
- Doménový model: `TestCase` (manuální scénáře se steps), `TestPlan`/suite,
  `TestRun` se zdrojem `manual` | `eyes` | `net`, agregace pokrytí a výsledků.
- Stránky: přehled (`/`), test cases (`/cases`, `/cases/new`, `/cases/[id]`),
  plány (`/plans`), sjednocené běhy (`/runs`).
- API: CRUD pro cases/plans/runs + `POST /api/runs/ingest` přijímající stejný
  payload, jaký Runner publikuje z Eyes/Net do Hubu.
- Datová vrstva s Neon serverless napojením a in-memory seed fallbackem, aby
  appka běžela bez provisioningu DB.
- jest testy datové vrstvy a utilit; CI (typecheck + lint + jest).
- Vznik jako součást konsolidace Theridion rodiny pod umbrellu `theridion/`
  (theridion-net, theridion-eyes, theridion-hub, theridion-runner, theridion-weave).
