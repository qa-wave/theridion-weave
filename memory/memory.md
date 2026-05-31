# Memory index — Theridion Weave

## Historie

- 2026-05-31 — Projekt založen jako 4. (resp. 5.) člen Theridion rodiny při
  konsolidaci pod umbrellu `theridion/` (vedle net/eyes/hub/runner). Web app
  (Next.js 16), test management. GitHub: qa-wave/theridion-weave. Doména:
  theridion-weave.qawave.ai (CNAME na Porkbunu, zatím bez Vercel projektu).

## Klíčová fakta

- Datová vrstva je in-memory seed (`apps/weave/src/data/store.ts`); Neon je
  připravený přes `DATABASE_URL`, ale není povinný.
- Ingest tvar (`RunnerIngestPayload` v `src/lib/types.ts`) musí zůstat
  kompatibilní s tím, co Runner posílá do Hubu — při změně synchronizovat.
- Next 16: middleware = `proxy.ts`. Build = Turbopack.
