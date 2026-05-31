# Theridion Ecosystem — Roadmap k finálním produktům

> Vygenerováno z competitive research + gap analýzy (6 agentů, 2026-05-31). Single source of truth pro dotažení 5 produktů do finální podoby.

## Souhrn

Theridion is a 5-product, local-first/git-friendly QA platform that splits cleanly into AUTHORING (Eyes = Tauri FE/Playwright desktop; Net = Tauri BE/API+Load+Security+Network desktop), EXECUTION (Runner = Python CLI + GitHub Action that runs both Eyes and Net specs headlessly in CI), MANAGEMENT (Weave = Next.js 16 TMS that owns test cases/plans/requirements and is source-of-truth for results per ADR-001), and OBSERVABILITY (Hub = Next.js 16 dashboard that aggregates SDLC quality signals). The whole value proposition is interoperability: one git-native .thr/.spec authoring format, one canonical RunResult wire contract, one per-app token model, and one event bus (~/.theridion). Today each product is individually strong but they DRIFT at the seams: Runner's RunResult (Python pydantic: request+assertion level, meta.git_sha) does not match Weave's RunnerIngestPayload (testId/status level) which does not match Hub's zod RunResult (JSONB, no suite/browser/test_key/flaky). Eyes and Net cannot yet publish directly; Runner has no Eyes execution path; Weave has zero integration-settings surface; Hub analytics are mock because the wire contract is too thin. The highest-leverage work is therefore NOT per-product features but ratifying ONE versioned RunResult v2 contract + ONE token model first, then wiring Runner -> (Hub + Weave) dual-publish, then the Weave settings toggles, then Hub analytics that finally have real data to compute over. Sequence connective plumbing before depth so every later feature lands on a stable shared substrate instead of compounding drift.

## Sdílené datové kontrakty (Phase 0 — keystone)

### RunResult v2 (canonical wire contract)

**Shape:** { schema_version:2, run_id:str(uuid, used as Idempotency-Key), product:'net'|'eyes'|'runner', suite_type:'unit'|'integration'|'e2e'|'smoke'|'load'|'security'|'visual', collection_id, collection_name, environment, branch?:str, started_at:ISO8601, duration_ms, total, passed, failed, flaky:int, requests:RequestResult[], meta:RunMeta }. RequestResult v2 = { request_id, name, method, url, status_code?, duration_ms, retries:int, flaky:bool, test_key:str (stable hash of collection_id+name, the cross-run identity), browser?:'chromium'|'firefox'|'webkit', assertions:AssertionResult[], error?, artifacts?:{trace_url?,video_url?,screenshot_url?,har_url?,report_url?} }. RunMeta = { runner_version, git_sha?, trigger:'cli'|'ci'|'desktop'|'schedule', report_url?, weave_case_key?:str }. All v2 fields beyond v1 are OPTIONAL so v1 payloads still validate (additive migration). Defined ONCE in Runner models.py (pydantic, source of truth) and mirrored by Hub zod and Weave zod, kept in lockstep by a shared JSON Schema checked in CI.

**Producers:** Runner (executor for Net + Eyes), Eyes (direct desktop publish), Net (direct desktop publish)  
**Consumers:** Hub /api/ingest, Weave /api/runs/ingest (normalizer maps RunResult->TestRun), Runner JSON/JUnit/HTML reporters

### NetworkProbeResult (synthetic monitoring)

**Shape:** { schema_version:1, probe_id, target, kind:'dns'|'tcp'|'tls'|'http', ok:bool, latency_ms, detail:{...kind-specific: resolved_ips|connect_ms|cert_expiry_days|status_code}, observed_at:ISO8601, source:'runner-watch'|'net', git_sha?, environment? }

**Producers:** Runner --watch --network (watch.py/network.py), Net Network mode  
**Consumers:** Hub /api/network/ingest

### IngestToken (per-app auth)

**Shape:** Bearer token, SHA-256 hashed at rest in Hub.ingest_tokens (app_id, token_hash, scopes) and in Weave app_settings under key 'integrations' (per-source token). Each ecosystem product authenticates with its OWN per-app token (product=net|eyes|runner) NOT a single shared secret. Idempotency-Key header = RunResult.run_id on every POST so 5xx-then-retry never duplicates. Replaces legacy single HUB_INGEST_TOKEN (Hub network ingest) and WEAVE_INGEST_TOKEN (Weave).

**Producers:** Hub settings (mint/rotate per-app tokens), Weave /settings/integrations (per-source tokens)  
**Consumers:** Runner hub_client + weave_client, Eyes publisher, Net publisher, Hub /api/ingest + /api/network/ingest, Weave /api/runs/ingest

### TestCase + caseKey mapping

**Shape:** Weave TestCase gains caseKey?:str (stable human key, e.g. 'auth.login.renders'). RunResult.meta.weave_case_key and RequestResult.test_key let Weave's ingest normalizer match an automated result to a documented case so eyes/net runs count toward coverage(). Eyes/Net store the case key in spec frontmatter; Runner passes it through unchanged.

**Producers:** Weave (owns TestCase + caseKey), Eyes/Net (stamp weave_case_key in spec frontmatter)  
**Consumers:** Weave ingest normalizer + coverage(), Hub test-case-level history (test_key timeline)

### .thr / .spec git-native authoring format

**Shape:** Net authors api/*.thr, chain/*.thr, load/*.thr, security/*.yaml, gates/*.yaml; Eyes authors *.spec.ts (Playwright) with frontmatter {weave_case_key, suite_type, browsers[], ignore_regions[]}. All plain-text, diffable, in-repo. Runner consumes both; engine (theridion-sidecar) imported directly per ADR-002 (no port handshake).

**Producers:** Net (authoring), Eyes (authoring)  
**Consumers:** Runner executor (Net path + new Eyes/Silk path), git/PR review

### gates/*.yaml (gates-as-code)

**Shape:** { version:1, gates:[{ id, metric:'pass_rate'|'flaky_count'|'coverage'|'p95_ms'|'vuln_severity', op:'>='|'<='|'=='|'<'|'>', threshold, scope?:{app,suite,env} }] } — single spec evaluated IDENTICALLY by Runner (CI exit code) and Hub (dashboard verdict + release readiness).

**Producers:** user repo (committed)  
**Consumers:** Runner gate evaluator (drives exit code), Hub quality-gate engine (drives verdict/badge/alert)

### Cross-module event bus (~/.theridion)

**Shape:** { version, type:'silk.failed'|'silk.passed'|'silk.healed'|'net.failed'|..., source:'eyes'|'net'|'runner', timestamp, context:{...} } appended via api/events.py. Local-machine only; bridges Net-failure -> Eyes auto-spec and surfaces desktop activity to Hub overview.

**Producers:** Eyes (silk.* events), Net (net.* events)  
**Consumers:** Eyes auto-spec bridge, Hub overview (desktop activity), Runner (optional local pickup)

## Weave integrační model

Weave gains a /settings/integrations page (the headline requirement, currently entirely absent) backed by an IntegrationConfig persisted via the existing kvSet/kvGet helper under app_settings key 'integrations'. Shape: { sources: { eyes:{enabled,label,token,lastSeen,health}, net:{...}, runner:{...}, hub:{...} } }.

TOGGLE SEMANTICS — what turning each ON enables and the config it needs:
1) RUNNER toggle (the transport for ALL automation): enabling it mints a per-source ingest token (shown once, SHA-256 hashed at rest). Config Runner side: `theridion test --weave-url https://theridion-weave.qawave.ai --weave-token <tok>` (or theridion.config.json weave.url/weave.token). Effect: Weave starts accepting POST /api/runs/ingest authenticated by that token; ingest is REJECTED (or silently dropped) if the toggle is off or the token mismatches. Per ADR-001 Runner is re-pointed from Hub to Weave as the primary results sink (Weave = source of truth) and Weave forwards aggregates to Hub.
2) EYES toggle: enables RunSource 'eyes' in the typed source registry. Config: per-source token; Eyes desktop (or Runner with product=eyes) publishes RunResult v2 with product='eyes', browser, and visual-diff artifact URLs. Effect: 'eyes' appears in /runs filters and the dashboard 'Zdroje běhů' tile; screenshot/diff evidence URLs render inline on failed results.
3) NET toggle: enables RunSource 'net' likewise; config per-source token; Net publishes product='net' API/load/security results. Effect: 'net' source visible in filters + dashboard; protocol/load/security results land as runs.
4) HUB toggle (outbound): enables Weave -> Hub aggregate feed. Config: Hub base URL + Hub-issued token. Effect: on each run completion Weave fires an outbound webhook and exposes GET /api/aggregate (coverage + pass-rate by source/milestone) that Hub quality gates consume — closing the bi-directional loop (Weave source-of-truth, Hub observes).

DATA FLOW: Author in Eyes/Net -> Runner executes in CI -> Runner POSTs RunResult v2 to Weave /api/runs/ingest (per enabled toggle + token) with Idempotency-Key=run_id -> Weave normalizer maps RunResult.requests[] to TestResult[] and matches RequestResult.test_key / meta.weave_case_key to TestCase.caseKey so automated passes count toward coverage() -> Weave records lastSeen/health per source on every ingest (replacing the single WEAVE_INGEST_TOKEN env) -> Weave forwards aggregates to Hub via the Hub toggle. Generalizing RunSource from the hardcoded manual|eyes|net enum to a typed registry keyed by enabled integrations, and gating ingest on the source being enabled, are the two code changes that make the toggles real. A generic POST /api/runs/import (JUnit XML / Playwright JSON normalized to RunResult v2) lets non-Theridion automation feed Weave too, de-risking sole dependence on Runner.

## Runner CI model

Runner is the single suite-wide execution surface invoked in CI via the GitHub Action qa-wave/theridion-runner/run@v1 (Docker, pinned to immutable digest) or `pip install theridion-runner && theridion test`.

EXECUTION: `theridion test <glob>` discovers both Net specs (.thr API/load/security) and Eyes specs (*.spec.ts Playwright). The Net path imports theridion-sidecar directly (ADR-002, asyncio.run, no port handshake). A NEW Eyes/Silk executor adapter shells out to the Eyes Playwright runner (npx playwright test per browser), parses json_report + trace attachments, and normalizes BOTH into the SAME RunResult v2 (product=net|eyes, suite_type, per-request test_key, retries, flaky, browser, artifact URLs). One `theridion test` => one combined RunResult + one HTML/JUnit report spanning FE+BE — the key differentiator no single-domain competitor matches.

HONEST CLI CONTRACT (fix false-green holes first): --filter TAG must actually filter (today executor runs ALL requests with only a stderr warning) or fail-fast exit 2; --workers>1 must run real parallelism (ThreadPoolExecutor, each thread its own asyncio loop, per-file reports) or be removed from action.yml until real; --watch must run a file-watch/cron loop or fail-fast. Unify exit codes: 0 pass, 1 test failures, 2 bad args/config (wrap load_config to catch JSONDecodeError/ValidationError), 3 runtime; empty shard => 0, missing path => 2. --shard N/M plus a new `theridion merge` subcommand recombine sharded report.xml (Playwright merge-reports parity) instead of overwriting.

GATES: Runner evaluates gates/*.yaml (pass_rate, flaky_count, p95_ms, vuln_severity) server-side-equivalently and lets gate verdicts drive the exit code (k6-style thresholds), so the SAME spec gates CI here and renders a verdict in Hub.

PUBLISH (dual-sink, per ADR-001): hub_client POSTs RunResult v2 to Hub /api/ingest AND weave_client POSTs to Weave /api/runs/ingest, both with Authorization: Bearer <per-app token> and Idempotency-Key: <run_id> (fixing the non-idempotent duplicate-on-retry bug), tenacity retry (3x exp backoff, retry 5xx+network, not 4xx). --require-hub / --require-weave make upload failure affect exit code; otherwise best-effort. Synthetic monitoring: `theridion --watch --network` runs DNS/TCP/TLS/HTTP probes (new network.py driven by the existing APScheduler) POSTing NetworkProbeResult to /api/network/ingest. GitHub ergonomics: reporters/github.py emits ::error annotations + a $GITHUB_STEP_SUMMARY table; action.yml exposes outputs {total,passed,failed,flaky,exit-code,report-path} for downstream steps. Add a PR/main ci.yml so regressions are guarded (tests run only on tags today).

## Hub monitoring model

Hub is the team-facing SDLC quality fabric aggregating across the whole lifecycle. It already has real auth (bcrypt), RBAC (viewer/operator/qa-engineer/admin), per-app SHA-256 ingest tokens, branding/white-label, and DB-backed /api/ingest + /api/network/ingest; the gap is that ANALYTICS pages are mock because the wire contract was too thin to compute over.

WHAT IT AGGREGATES, AND FROM WHOM:
- Test runs (RunResult v2) from Runner /api/ingest — the live primary feed; product=net|eyes distinguishes BE vs FE; suite_type + test_key + flaky + retries + branch are the new fields that unlock all analytics.
- Direct desktop runs: Eyes and Net may opt-in POST RunResult v2 to /api/ingest for ad-hoc runs (their own per-app token) so desktop activity appears without CI.
- Aggregates from Weave (per ADR-001 Weave is source-of-truth for results; Hub consumes Weave GET /api/aggregate + outbound webhook for coverage + pass-rate by source/milestone, NOT raw re-ingest) — feeds release-readiness and quality gates.
- Network probes (NetworkProbeResult) from Runner --watch and Net Network mode via /api/network/ingest (migrated off legacy HUB_INGEST_TOKEN onto per-app ingest_tokens with app_id scoping).
- Deployments/incidents/errors via existing webhooks (github/sentry/pagerduty/vercel) + integrations registry.

WHAT IT COMPUTES (replacing mock src/data/*):
1) Historical trends: time-bucketed pass-rate/duration/failure series per app/suite/env/branch, with filter bar + pagination (replace flat 100-row cap).
2) Flaky detection (lib/ingest/flaky.ts): per test_key, status flip-flops on same git_sha and across reruns in a window -> flakiness rate + flaky table (replaces mock TestRun.flaky).
3) Quality-gate engine (lib/gates/): evaluates the SAME gates/*.yaml as Runner against ingested data on each run/release, persists gate_evaluations, renders verdict badges.
4) Failure triage: SHA-1 error fingerprint groups identical failures across runs (count, first/last seen, affected branches) with defect tagging (product/test/infra) + deep-link to Runner HTML trace/Eyes visual-diff artifacts via RequestResult.artifacts/meta.report_url.
5) Release-readiness scorecard on /releases/[id]: fuses latest gate verdict + pass-rate + coverage (from Weave aggregate) + open vuln severity + active incidents + flaky trend into one promote/block verdict — the cross-surface story no competitor has.
6) Network-state correlation: overlay probe degradation on the same timeline as test failures to separate real bug from environment flake.
7) Alerting: hook alerts-engine.ts into the ingest path so gate-fail / new-flaky / pass-rate regression fire pagerduty/sentry/slack/webhook.
8) Product-aware matrices: /tests/fe browser matrix (chromium/firefox/webkit from RequestResult.browser) and /tests/be protocol grid from real product=net ingest. Plus read API + CSV export (/api/runs, /api/metrics).

## Build order

1. PHASE 0 — Ratify the substrate (do first; everything depends on it): 1) Define RunResult v2 ONCE in Runner models.py (pydantic, additive/optional fields: schema_version, product, suite_type, branch, test_key, retries, flaky, browser, artifacts, meta.report_url, meta.weave_case_key) and check in a shared JSON Schema. 2) Mirror it in Hub zod + add nullable run_results columns/index. 3) Mirror it in Weave zod + add columns. 4) Standardize the per-app IngestToken model + Idempotency-Key=run_id across Hub, Weave, Runner (retire single HUB_INGEST_TOKEN / WEAVE_INGEST_TOKEN).

2. PHASE 1 — Make Runner an honest, trustworthy CI tool (it is the spine): 5) Fix --filter/--workers/--watch (honest or fail-fast). 6) Unify exit codes + config-error handling. 7) Add PR/main ci.yml + shard/config tests. 8) Single-source version + fix release race/build-arg.

3. PHASE 2 — Wire the dual-publish loop (connectivity over depth): 9) Runner idempotent dual-publish to Hub /api/ingest AND Weave /api/runs/ingest. 10) Weave /settings/integrations page + IntegrationConfig (kvSet/kvGet) + typed RunSource registry + per-source tokens + health/last-seen + ingest gated on enabled source (THE headline Weave requirement). 11) Hub: run history + trend API/charts now that v2 data flows.

4. PHASE 3 — Turn data into analytics (high leverage once data is real): 12) Hub flaky detection engine. 13) Hub + Runner quality-gate engine sharing gates/*.yaml (gate verdict drives Runner exit code AND Hub badge). 14) Weave automated->manual coverage via test_key/weave_case_key -> caseKey. 15) Weave manual execution UI (/runs/new + /runs/[id]/execute).

5. PHASE 4 — Eyes core fixes + first publish (make the FE authoring real): 16) Eyes async non-blocking runner. 17) record->run loop (fetch-SSE bridge). 18) real axe a11y. 19) trace-attachment parsing + tabs. 20) baseline approve workflow. 21) Eyes direct RunResult v2 publish to Hub+Weave. 22) Runner Eyes/Silk execution path (so CI runs FE+BE in one report).

6. PHASE 5 — Net category buildout (complete the BE pillars): 23) Promote Load/Security/Network to first-class ActivityBar modes. 24) Intercepting proxy. 25) Passive scanner. 26) Net emits RunResult v2 (Load/Security/Network) into pipeline. 27) Real Locust load engine + live SSE. 28) Fuzzer. 29) Port scan + capture.

7. PHASE 6 — Triage, readiness, alerting, monitoring (close the SDLC loop): 30) Hub run-detail v2 + failure fingerprint/grouping + defect tagging. 31) Hub release-readiness scorecard (consumes Weave GET /api/aggregate). 32) Runner synthetic monitoring (--watch --network -> /api/network/ingest) + Hub network-state correlation + unify network ingest auth. 33) Hub alert-on-event wiring.

8. PHASE 7 — Depth + parity polish: 34) Eyes self-healing locators + perceptual/ignore-region diff + suites/tags + embedded trace viewer. 35) Runner GitHubReporter + real --workers + shard merge + flaky markers + slim non-root Docker + SARIF. 36) Weave requirements/traceability + RBAC + custom fields + generic importers + defect linking + trends/export + milestones. 37) Hub product-aware FE/BE matrices + ingest-derived coverage + read API/CSV export + MCP/marketplace extension points.

## Per-product plán

### Eyes

_A local-first, git-friendly Tauri desktop app for frontend/visual testing: record once in Playwright and transpile to Cypress/Selenium/WDIO, run async multi-browser with an embedded time-travel trace viewer, real axe a11y audits, self-healing multi-candidate locators, offline perceptual-aware visual diff with a persisted human approve workflow, privacy-first local-Ollama suggestions, and first-class publishing of RunResult v2 to both Hub and Weave (mapped to Weave test cases)._

- P0: Make multi-browser run async + non-blocking (asyncio.create_subprocess_exec, concurrent browsers) — foundation for everything
- P0: Close the record->run loop (fetch-based SSE for /record/stream under Tauri + 'Open in editor'/'Run now' bridge that routes recorded spec into spec/save + /run)
- P0: Implement the axe-core a11y audit for real (AxeBuilder().analyze() afterEach, attach to JSON report, parse into A11yViolation[])
- P0: Parse and surface trace attachments (Network + Screenshots + on-failure) from json_report and trace zip into the existing tabs
- P0: Real baseline approve workflow (POST /api/silk/baseline/approve promoting screenshot to baseline, persisting who/when/diff_ratio)
- P1: Ignore-regions + anti-alias tolerance for visual diff to kill false positives before perceptual diff
- P1: Self-healing locator candidates (capture 3-6 ranked candidates per element, runtime fallback + healing event, local Ollama for ambiguous re-derivation)
- P1: Direct RunResult v2 publish to Hub AND Weave from Eyes (product=eyes, browser, artifact URLs, Idempotency-Key, weave_case_key)
- P1: Suites/tags/data-driven runs (--grep + data table aggregated per case) and embedded in-app trace viewer
- P2: Link specs/runs to Weave test cases via caseKey frontmatter; reusable storageState auth + {{secret:NAME}} injection; video capture + retention; resolve/remove dead 'monitors' mode

### Net

_One local desktop binary unifying four first-class testing categories — Integration (already best-in-class: 9+ protocols, scripts/assertions/self-healing, universal import, codegen, mock/record-replay, contract guard), Load (real engine via embedded Locust/multi-worker with live SSE progress), Security (intercepting MITM proxy + passive scanner + Burp-Intruder-class fuzzer), and Network (port scan + traffic capture beside TLS/DNS) — each a top-level ActivityBar workspace reusing the active collection, all emitting RunResult v2 into the Runner/Hub/Weave pipeline._

- P0: Promote Load, Security, Network to first-class ActivityBar modes with dedicated workspaces ('Run as Load Test'/'Run as Security Scan' reusing active collection)
- P0: Real intercepting proxy with request/response breakpoints (interceptor.py + InterceptModal, SSE flows, edit-and-forward, send-to-request) — credibility-critical for Security pillar
- P0: Passive scanner over intercepted + collection traffic (reuse security_audit/sensitive_data/cors detectors as auto-flags)
- P1: Fuzzer with payload positions + attack modes (Sniper/Pitchfork/Cluster-Bomb) composing with existing request model
- P1: Replace in-process load engine with embedded Locust (or multi-worker pool) + live SSE progress + ramp/stages UI (make README true)
- P1: Port scanner + traffic capture for Network mode (async connect-scan + HAR/pcap capture)
- P1: Emit Load/Security/Network results in RunResult v2 so they are CI-gated by Runner and rendered in Hub /tests/be + publish to Weave
- P2: Data-driven collection runner as a headline feature (CSV/JSON iterations surfaced in UI + CLI)
- P2: Reconcile README/branding (Surge/Mesh/'embedded Locust') with shipped reality; extend MCP v2 to cover load/security/network

### Weave

_The Next.js 16 test-management source-of-truth that owns manual test cases, plans, requirements and runs, with the headline /settings/integrations surface that toggles Eyes/Net/Runner/Hub as data/execution sources (per-source tokens + health/last-seen), a real manual execution UI, automated-to-manual coverage mapping, requirements traceability, RBAC, and an outbound aggregate feed to Hub._

- P0: /settings/integrations page + IntegrationConfig persisted via kvSet/kvGet (per-source toggle, label, token, lastSeen, health for eyes/net/runner/hub)
- P0: Generalize RunSource from hardcoded enum to a typed registry keyed by enabled integrations; gate POST /api/runs/ingest on source being enabled (RunResult v2 normalizer -> TestRun)
- P0: Manual execution UI — /runs/new (pick plan -> create run) and /runs/[id]/execute step-through with pass/fail/blocked/skip + notes/evidence
- P0: Per-source ingest tokens + health/last-seen written on every ingest, surfaced on /settings and dashboard 'Zdroje běhů' tile (replace single WEAVE_INGEST_TOKEN)
- P1: Map automated test_key/weave_case_key -> TestCase.caseKey so Eyes/Net passes count toward coverage()
- P1: Requirements entity + requirement<->case links + coverage matrix /requirements
- P1: Generic importers POST /api/runs/import (JUnit XML + Playwright JSON normalized to RunResult v2)
- P1: Custom fields + RBAC (users/roles, per-user sessions replacing single-password, gate mutations)
- P2: Defect linking (Jira/GitHub Issues from failed results, issueUrl on TestResult); trend dashboards + CSV export; milestones/releases + folders/sections; GET /api/aggregate + outbound webhook to Hub

### Runner

_A single Python CLI + GitHub Action that runs BOTH Net (.thr) and Eyes (Playwright) specs in CI into one RunResult v2 + one HTML/JUnit report, with an honest exit-code/flag contract, real parallelism + sharded merge, gates-as-code driving exit code, idempotent dual-publish to Hub and Weave, and built-in synthetic monitoring._

- P0: Make --filter/--workers/--watch honest (real filter or fail-fast exit 2; drop fake flags from action.yml)
- P0: Unify exit-code semantics + handle config errors (load_config catches JSONDecodeError/ValidationError -> exit 2; empty shard 0; missing path 2; documented table)
- P0: Add PR/main ci.yml + tests for _apply_shard/load_config (regressions land unguarded today)
- P0: Single source of truth for version + fix release race/build-arg bug (importlib.metadata, build Docker from wheel, assert tag==pyproject)
- P1: GitHubReporter — ::error annotations + $GITHUB_STEP_SUMMARY + action.yml outputs block
- P1: Real --workers parallelism (ThreadPoolExecutor, per-file reports) + `theridion merge` JUnit shard merge
- P1: Idempotent dual-publish (Idempotency-Key=run_id) to Hub /api/ingest AND Weave /api/runs/ingest + structured json logging
- P1: Eyes/Silk execution path — drive Eyes Playwright runner, normalize to RunResult v2, upload via same client
- P1: Synthetic monitoring (network.py DNS/TCP/TLS/HTTP probes via scheduler -> /api/network/ingest)
- P2: gates/*.yaml threshold engine driving exit code + flaky markers in reports; slim non-root multi-stage Docker + SARIF reporter + digest-pinned action

### Hub

_The self-hostable, multi-tenant SDLC quality dashboard that ingests RunResult v2 + network probes, computes real historical trends/flaky/quality-gate verdicts/failure triage, fuses test+coverage+vuln+incident signals into a release-readiness scorecard, and alerts on regressions — replacing today's mock analytics with ingest-derived data._

- P0: RunResult schema v2 (additive) across Runner models.py + Hub zod + run_results columns (suite_type, branch, product, test_key index, retries, flaky) — unlocks ALL analytics
- P0: Run history + trend API and charts on /runs (time-bucketed pass-rate/duration/failure; filter bar app/env/branch/suite/time; paginate off 100-row cap)
- P0: Flaky detection engine over run history (lib/ingest/flaky.ts; flip-flop on same git_sha + reruns; wire /quality flaky card)
- P0: Quality-gate engine + gates/*.yaml schema (lib/gates/) evaluated server-side, persist gate_evaluations, verdict badges (same spec as Runner)
- P1: Run detail v2 — per-request failure list + artifact links + SHA-1 error fingerprint
- P1: Failure grouping + defect tagging /quality/failures (fingerprint, occurrences, first/last seen, defect category)
- P1: Release-readiness scorecard on /releases/[id] (gate + pass-rate + coverage + vuln + incidents -> promote/block)
- P1: Unify network ingest auth onto ingest_tokens + tenant scoping; alert-on-event wiring (gate-fail/new-flaky/regression)
- P2: Replace mock /quality coverage + dashboard overview with ingest-derived data; product-aware FE/BE matrices from real ingest; read API + CSV export

## Rizika

- Contract drift is the #1 systemic risk: Runner pydantic, Hub zod, and Weave TS RunResult definitions can diverge silently. Mitigate by making Runner models.py the single source, generating/checking a shared JSON Schema in CI for all three repos, and versioning schema_version with a compatibility test (v1 payloads must still validate).
- ADR-001 ambiguity: Runner dual-publishing to BOTH Hub and Weave can create two sources of truth. The ADR says Weave is source-of-truth and Hub consumes Weave aggregates — but the simplest path (Runner -> Hub direct) contradicts it. Decide explicitly: either Runner->Weave->Hub(aggregate) OR Runner->both with Hub treating Weave aggregates as authoritative for coverage; otherwise pass-rate/coverage numbers will disagree between surfaces.
- False-green CI holes in Runner (--filter runs all requests, --workers no-op, --watch no-op) are actively dangerous — teams may ship believing tests ran. These must be fixed (Phase 1) before any further adoption or the platform loses trust.
- Thin wire contract blocks analytics: Hub flaky/trend/gate features are impossible until test_key/suite/branch/flaky land in v2. Sequencing any Hub analytics before Phase 0 wastes effort on mock data.
- Eyes has multiple foundational bugs (sync blocking runner, SSE never connects under Tauri, no-op a11y, placeholder tabs). Building self-healing/perceptual-diff before the async runner + record->run loop are fixed compounds instability.
- Net's Security pillar is not credible without a real intercepting proxy; shipping fuzzer/passive-scan claims before the interceptor exists risks evaluation credibility loss. Same for the README 'embedded Locust' claim vs the shipped in-process engine.
- Token model migration (single shared secret -> per-app tokens) touches Hub, Weave, Runner, Eyes, Net simultaneously; a botched rollout breaks all ingest. Ship with backward-compatible acceptance of the legacy token during a deprecation window.
- Weave RunSource is a hardcoded enum wired through validation, UI filters, and dashboard tiles; generalizing it to a registry is broader than it looks and must update all consumers atomically or filters/tiles silently drop sources.
- Idempotency gap (no Idempotency-Key today) means 5xx-then-retry duplicates runs in Hub, corrupting trend/flaky math; fix in the same change that introduces dual-publish.
- Coverage-mapping correctness: matching automated test_key/weave_case_key to manual TestCase.caseKey is fuzzy; a wrong match inflates coverage and undermines the headline 'unified real coverage' number. Require explicit caseKey opt-in rather than heuristic name-matching for v1.
- Resourcing/scope: 5 products x ~10 features each is large; the buildOrder front-loads connective plumbing so partial delivery still yields an interoperable (if shallow) platform rather than 5 disconnected deep tools.