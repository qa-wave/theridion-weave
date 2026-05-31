# ADR-001: Ingest kontrakt — kdo je source of truth pro výsledky testů

**Status:** Navrženo (proposed) — 2026-05-31
**Kontext rodiny:** Runner publikuje výsledky; Hub i Weave mají ingest endpoint.

## Problém

`theridion-runner` dnes posílá výsledky do **Hubu** (`/api/ingest`). **Weave** má
vlastní `/api/runs/ingest` s jiným tvarem payloadu. Hrozí dva nekompatibilní
formáty a zdvojení dat (stejný běh jako různé objekty v Hubu i Weave).

## Rozhodnutí (navržené)

1. **Weave = source of truth pro test výsledky.** Runner posílá běhy z Eyes/Net
   na `Weave /api/runs/ingest` (kanonický `RunnerIngestPayload`, viz
   `src/lib/types.ts`). Weave vlastní test cases, plány i runy.
2. **Hub konzumuje agregáty z Weave**, ne přímý ingest — Hub zůstává čisté SDLC
   observability (quality gate widget si bere data z Weave API / webhooku).
3. Do doby přepojení Runneru **zůstávají oba ingest endpointy funkční**
   (zpětná kompatibilita), aby se nic nerozbilo.

## Důsledky

- Runner dostane `--weave-url` + `--weave-token` (nebo nahradí stávající `--hub`),
  payload sjednocen na `RunnerIngestPayload`.
- Hub: přidat `GET` agregační API ve Weave + konzumaci v Hub quality gate.
- Eliminuje zdvojení a drift mezi dvěma formáty.

## Otevřené (vyžaduje potvrzení uživatele)

- Má Runner posílat do Weave, Hubu, nebo přechodně do obou?
- Single-tenant v1 potvrzeno (žádné organizace) — multi-tenancy je samostatné ADR.

> Toto ADR je záměrně bez kódové změny chování Runneru — popisuje cílový stav.
> Implementace přepojení je samostatný krok po schválení.
