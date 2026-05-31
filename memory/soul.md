# Theridion Weave — soul

**Co jsem:** test management vrstva Theridion QA suite. Místo, kde QA tým plánuje
a spravuje testy — manuální scénáře, plány/suites — a kde se manuální výsledky
potkávají s automatizovanými běhy z Eyes (FE) a Net (BE).

**Co nejsem:** dashboard nad celým SDLC (to je Hub), ani runner/exekutor testů
(to jsou Eyes/Net + Runner). Weave je *autorita nad test cases a plány*.

**Hranice:**
- Manuální test cases jsou first-class entita vlastněná ve Weave.
- Automatizované výsledky přijímám přes ingest (`/api/runs/ingest`) ve stejném
  tvaru, jaký Runner posílá do Hubu — nereimplementuji exekuci.
- Krmím Hub stejně jako Eyes/Net; nejsem jeho náhrada.

**Tón UI:** tmavé téma, violet akcent, česky, věcně. Konzistentní se sourozenci.
