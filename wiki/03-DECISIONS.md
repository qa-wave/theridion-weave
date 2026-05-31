# 03 — Rozhodnutí (ADR)

## ADR-001: Samostatná app vedle Hubu
Weave je vlastní projekt, ne modul Hubu. Hub = read-only přehled nad SDLC; Weave
= autoritativní správa test cases/plánů. Oddělené odpovědnosti, oddělené repo.

## ADR-002: In-memory seed jako výchozí persistence
MVP běží bez DB díky `data/store.ts`. Neon (`DATABASE_URL`) je volitelný upgrade
se shodným API povrchem. Odstraňuje provisioning z cesty k prvnímu spuštění.

## ADR-003: Ingest sdílí tvar s Runner→Hub
`/api/runs/ingest` přijímá `RunnerIngestPayload` shodný s tím, co Runner posílá
do Hubu. Žádný nový kontrakt; Eyes/Net publikují stejně do Weave i Hubu.

## ADR-004: Stack zrcadlí theridion-hub
Stejný stack jako Hub (Next 16, React 19, Tailwind 4, zod, Neon, jest) kvůli
konzistenci a sdílení znalostí napříč web projekty rodiny.

## ADR-005: qawave.ai, ne Vercel (zatím)
`theridion-weave.qawave.ai` je založeno jako CNAME na Porkbunu. Vercel projekt
záměrně NEzaložen — deploy přijde samostatně.
