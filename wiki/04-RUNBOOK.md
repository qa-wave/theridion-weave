# 04 — Runbook

## Lokální vývoj
```bash
git clone git@github.com:qa-wave/theridion-weave.git
cd theridion-weave/apps/weave
pnpm install
pnpm dev            # http://localhost:3000
```

## Kontroly před PR
```bash
cd apps/weave
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Env
- `DATABASE_URL` — Neon (volitelné; bez něj in-memory seed)
- `WEAVE_INGEST_TOKEN` — povinný token pro `/api/runs/ingest` (pokud nastaven)
- `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL` — viz `.env.example`

## Ingest běhu (smoke)
```bash
curl -X POST http://localhost:3000/api/runs/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WEAVE_INGEST_TOKEN" \
  -d '{"source":"eyes","suiteName":"smoke.spec.ts","triggeredBy":"manual",
       "startedAt":"2026-05-31T08:00:00.000Z","finishedAt":"2026-05-31T08:01:00.000Z",
       "results":[{"testId":"ok","title":"ok","status":"pass","durationMs":1200}]}'
```

## Příbuzné runbooky
- [theridion-hub](../../theridion-hub/wiki/04-RUNBOOK.md)
- [theridion-eyes](../../theridion-eyes/wiki/04-RUNBOOK.md)
- [theridion-net](../../theridion-net/wiki/04-RUNBOOK.md)
