# 005 implementation and validation guide

**Implementation in progress:** deterministic 005 services, routes and UI have
local checks. The 40-query live relevance, hybrid load, twelve-case actual
research/Turi review and disposable paired recovery drill passed locally.
See [validation](validation.md) for checks actually run.

## Resume implementation

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
export SPECIFY_FEATURE_DIRECTORY=specs/005-governed-rag-research
git status --short --branch
```

Branch is `005-governed-rag-research`. Read [spec](spec.md), [plan](plan.md), [tasks](tasks.md),
[data model](data-model.md) and [contracts](contracts/retrieval.md). Administrator
publication was confirmed by the user during clarification.
Read current AGENTS/governance, installed Next.js guides and the routed installed
eve docs before code. Preserve `agent/agent.ts` model and existing approved scope.

## Prerequisites and explicit setup (during implementation)

Use Node24, locked npm dependencies, Docker, CLI Playwright/WebKit and separate
disposable PG17/pgvector0.8.6 resources. The container image and parser version
are pinned. Server-only `CONTEXT_API_KEY` is documented in `.env.example`; it is
needed only for live public discovery and the actual research evaluation. The
existing Gateway configuration supplies embeddings. Keep keys in ignored local
configuration.

`npm run retrieval:prepare` verifies/pulls pinned local prerequisites
and reports readiness without migrating or replacing the selected DB. Explicit
migrations/role grants use the existing commands and operator-selected disposable
configuration. Never default an upgrade/restore drill to the selected application
database. New 005 gates require schema028 while 002–004 read-only paths remain
available with their earlier schema prerequisites.

Keep database/private artifact snapshots paired. Do not remove or reset selected
`.eve/.workflow-data`, change the application database, link Vercel or deploy.
For a 005 rollback, set `TURAS_005_DISABLED=1` and restart the app and
maintenance worker with that setting. This closes 005 routes and tool intake,
stops retrieval worker dispatch, and fences conversations that consumed 005
evidence. Existing 002–004 routes keep their own schema gate. Preserve the
database, private store and native workflow state as a matched set; restore a
matched snapshot only if forward recovery is insufficient. Clear the flag only
after verifying the restored schema and source generations. Never drop populated
005 tables as rollback.

The user supplied ignored `NEON_PREVIEW_DB` and `NEON_PROD_DB` references and
selected Preview for fresh-app development. Read-only inspection found 16
legacy tables in the original Preview database, which remain untouched. The
new `turas_preview_005` database in that branch has schema 028, pgvector 0.8.6
and marker `preview-neon-005`. The pooled runtime uses a separate login. A
second database, `turas_test_005_neon`, is marked disposable for tests; it is
never the app database. The two named OrbStack Postgres containers were
removed with volumes retained. See the [environment handoff](../../docs/environment-handoff.md).
The legacy Production site continues to use Production Neon. The recovery
drill, public-workflow smoke and isolated actual-output evaluator
use separate temporary Neon databases or clones. The full paired native-state
restart with a synthetic private-store file passed locally; a hosted restore of
real customer data remains outside this slice.

## Command status

| Command | Status and expected outcome |
| --- | --- |
| `npm run retrieval:prepare` | Vector/parser/container readiness; no implicit DDL |
| `npm run test:retrieval` | Passed 24 isolated 005 unit/DB/contract files against the separate marked Neon test database. It requires a disposable `TURAS_TEST_DATABASE_URL` and `TURAS_TEST_ENVIRONMENT_ID`; the runner gives Neon round trips a 120-second per-file timeout. |
| `npm run research:discovery:check -- --live --fetch` | Available: one bounded Context.dev public URL discovery call, an independently pinned public documentation fetch and exact normalized quote; passed locally without persisting evidence |
| `npm run research:workflow:live:check -- --live --disposable [--mode recon\|practices]` | Neon Preview test database: practices passed bounded Context.dev discovery, pinned fetch, attribution, projection convergence and immediate withdrawal denial on a temporary clone. The earlier local-container path remains available; fit and cancellation races remain separate gates. |
| `npm run retrieval:recovery:check -- --disposable` | Passed on Neon at schema 028: empty 018→028/vector/role upgrade, matched synthetic database/store pair, bound native session through isolated app restart, expired lease and ambiguous paid-dispatch replay. Temporary databases were removed. Local containers still use `--container`. |
| `npm run retrieval:benchmark` | Available: disposable 5,000-passage, five-reader, 100-measurement post-embedding ranking check with fake vectors; full hybrid/convergence gate pending |
| `npm run retrieval:benchmark -- --live` | Available with the Gateway key: 100 capped live query embeddings and hybrid reads on the disposable corpus, reporting embedding, retrieval and end-to-end p95 plus errors/degraded counts; projection convergence is checked separately by the live research workflow command |
| `npm run retrieval:eval:environment:check -- --disposable` | Passed on a temporary Neon clone: private app, Eve workflow state and artifact store reached auth/eve readiness; clone removed afterward |
| `npm run eval:research -- --case R01 --live` | Bounded actual-output probes support R01–R12 on isolated Neon clones. All twelve retained actual outputs passed objective gates under the selected model and low reasoning setting; see the review and earlier failed attempts in validation.md. |
| `npm run retrieval:check -- --retry-job <UUID>` | Local operator retry of a failed job only while its original source, generation, three-attempt budget and paid-operation state permit it; prints no source content |
| `npm run eval:retrieval -- --live --max-embedding-calls 64 --max-input-characters 1000000` | Available: 40 fixed judged queries, real embeddings, exact citations and partner denials on disposable synthetic data; local gate passed in validation.md |
| `npm run eval:research -- --case R11 --live` | Cancelled-run probe: one completed checked public fetch, retained finding and a later authorized Turi status answer. Each case uses the `--case RNN --live` surface. |
| `npm run eval:research:verify` | Passed 12/12 retained actual-output reviews, every hard gate and each score ≥7/8; total model-turn time 674 seconds. The verifier rejects missing artifacts, usage mismatch or the 20-minute suite budget. |
| `npm run retrieval:ui:check` | Passed 28/28 command-line WebKit journeys across desktop/mobile and light/dark projects on a temporary clone of the marked disposable Neon test database. Runs keyboard and axe checks, and saves ignored synthetic screenshots for visual review. |

The two live suites must separate provider execution from reviewer scoring, keep
synthetic/private captures ignored and emit only safe summarized evidence for
the PR. A missing key or live failure is an incomplete gate. Tests using provider
fixtures remain valuable but cannot replace these live checks.

## Scenario walkthroughs

1. **Search (US1):** seed authorized synthetic profiles, accepted disjoint artifact
   excerpts and verified public quotes. Search a paraphrase as internal member and
   Cedar-only partner; inspect every locator. Verify Juniper/internal sentinels do
   not affect results. Exercise stale evidence, no evidence and lexical degradation.
2. **Publication (US2):** propose a Juniper learning, remove direct and indirect
   identifiers, submit and publish exact revision as admin. Cedar partner and a
   different active workspace receive identical public payloads; no lineage. Race
   candidate edit/review and revoke source access; stale decisions fail atomically.
3. **Research (US3):** preview public identity/topic, start from an owned turn, run
   recon/practices/fit. Capture outbound request in fixtures to prove exact scope;
   submit a URL and verify Pending origin. Cancel during fetch; replay a paid-call
   timeout; assert no new dispatch and accurate partial/unconfirmed status.
4. **Lifecycle (US4):** refresh unchanged evidence without changing claim age;
   confirm and resolve a material conflict. Pause workers, withdraw a source after
   one Turi turn, then try continuation/history/citation and resume stale jobs.
   Immediate denial and eventual bounded cleanup must both hold.

Use [lifecycle and evaluation criteria](contracts/lifecycle-validation.md) for
the exact acceptance thresholds, budgets and recovery matrix. Run UI journeys
with command-line WebKit in all four existing projects, keyboard and axe; inspect
screenshots against `docs/design-reference.md`. Do not operate the host browser.

## Existing finishing checks

After implementation, run the applicable unit/integration/contracts/UI suites,
`npm run typecheck`, `npm run build:check` and `npm run check:docs`. Record actual
commands, exit status, measurements, rubric results and limits in
`validation.md`; mark tasks complete only with evidence. README, ROADMAP and final
spec status belong in the same feature PR. Do not claim hosted validation.

Runtime acceptance is incomplete until all required local and live gates pass.
