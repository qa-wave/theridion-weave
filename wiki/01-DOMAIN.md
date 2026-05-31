# 01 — Doména

Theridion Weave řeší **správu a plánování testů** napříč celou QA suite.

## Problém
Tým má manuální testovací scénáře, k tomu automatizované běhy z Eyes (FE) a Net
(BE). Chybí jedno místo, kde se test cases udržují, skládají do plánů a kde se
manuální a automatizované výsledky vidí pohromadě.

## Řešení
- **Test cases** — manuální scénáře se strukturovanými kroky, prioritou, tagy a stavem.
- **Plány/suites** — pojmenované sady test cases (release smoke, regrese, …).
- **Běhy** — sjednocený pohled: manuální běhy + ingest z Eyes/Net přes Runner.
- **Pokrytí** — kolik aktivních test cases má passing běh.

## Vztah k rodině
Weave **plánuje a spravuje**, Hub **pozoruje** kvalitu nad SDLC. Weave je dalším
zdrojem dat pro Hub vedle Eyes a Net.
