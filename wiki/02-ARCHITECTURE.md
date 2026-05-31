# 02 — Architektura

```
┌─────────────────────────────────────────────┐
│  Theridion Weave (Next.js 16, fra1)          │
│                                              │
│  app/ (RSC stránky)   app/api/ (handlers)    │
│   /  /cases  /plans    cases  plans  runs     │
│   /runs                runs/ingest ◄── Runner │
│         │                    │                │
│         ▼                    ▼                │
│   data/store.ts  ◄── lib/validation (zod)     │
│   (in-memory seed │ Neon přes lib/db.ts)      │
└─────────────────────────────────────────────┘
        │ krmí (jako Eyes/Net)
        ▼
   Theridion Hub (SDLC přehled)
```

## Vrstvy
- **app/** — App Router, RSC. Stránky čtou přímo z `data/store`. Mutace přes API.
- **app/api/** — route handlers, zod validace, JSON. `runs/ingest` přijímá Runner payload.
- **data/store.ts** — jediný zdroj pravdy MVP (in-memory, seedováno). Swap na Neon beze změny API.
- **lib/** — `types` (doména), `validation` (zod schémata + odvozené typy), `utils` (formátování, `summariseRun`), `db` (Neon klient).
- **proxy.ts** — Next 16 request proxy, hardening hlavičky.

## Rozhodnutí kompatibility
Ingest tvar = co Runner posílá do Hubu. Drží Weave i Hub konzistentní bez
duplicitní exekuční logiky.
