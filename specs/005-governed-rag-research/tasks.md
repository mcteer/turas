# Tasks: Governed retrieval, research and evidence quality

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts](contracts/retrieval.md), [quickstart.md](quickstart.md).
**Status**: Implementation in progress. Checked tasks have focused evidence in
`validation.md`; integrated and live acceptance gates remain open.
**Tests**: Required by FR-023, SC-001–008 and constitution VII. Write the targeted
failing test before its behavior; reuse existing fixtures and checks where suitable.

## Format and execution rules

`- [ ] Tnnn [P?] [USn?] Description with repository path`.
`[P]` marks independent files within the specified phase, after prior prerequisites.
It identifies possible concurrent work, not permission to spawn agents. Story
labels occur only in story phases. Paths below are planned when they do not yet
exist. Each task includes requirement IDs; cross-cutting tasks may cover all stories.
Preserve existing model, selected DB/private store/native state and local-only
scope. Documentation/status travels in this feature PR. No hosted deployment.

## Phase 1: Setup

- [X] T001 Read current governance, installed Next.js routing/rendering docs and eve tools/workflows/security/durability docs before code; verify research decisions against installed APIs and record exact versions/setup prerequisites in `specs/005-governed-rag-research/validation.md`, with all not-yet-run checks pending (FR-021, FR-023).
- [X] T002 Pin the PG17/pgvector0.8.6 platform digest in `infra/retrieval/postgres.Dockerfile`, add readiness-only `scripts/prepare-retrieval.ts`, update `.github/workflows/ci.yml`, and add only a necessary inert HTML parser in `package.json`/`package-lock.json`; document server-only Context.dev configuration in `.env.example` without installing unused integrations or migrating the selected database (FR-015, FR-023).
- [X] T003 Define versioned schemas, errors, admission/rate/size limits and write envelopes in `lib/contracts/retrieval.ts`, `lib/contracts/knowledge.ts` and `lib/contracts/research.ts` from all four contracts; enforce C01 verbatim: "IDs are server-generated UUIDs; timestamps are UTC; revisions and generations are positive integers; digests are lowercase SHA-256 hex; writes require a 1–128 character idempotency key scoped to actor and operation, and reuse with a different payload is a conflict." (FR-001, FR-003, FR-009, FR-012, FR-016, FR-021).

## Phase 2: Foundation — blocks story implementation

- [X] T004 Add disposable PG/vector migration, runtime-role, idempotency and generation test helpers in `tests/integration/retrieval-foundation.test.ts` and `tests/fixtures/retrieval.ts`; verify all C01–C10 constraints and deny runtime DDL before implementing migrations (FR-019, FR-023, SC-007).
- [X] T005 Add projection/vector/job schema and deduplication in `migrations/019-retrieval-projections.cjs`; enforce C02: "Source kind is accepted_profile, approved_excerpt, verified_research or published_shared; scope is customer or shared; customer scope requires environment/workspace/customer IDs, shared scope requires environment ID and no public customer/workspace IDs; passage text is 1–2,000 characters; embedding is 1,536 finite dimensions or absent with an explicit pending, unavailable or unconfirmed status." and C09: "Job kind is index, invalidate or cleanup; state is queued, leased, completed, failed or unconfirmed; each lease is at most 30 seconds with a current token; each generation permits at most three attempts; commit requires the same source generation, contract digest and lease token captured at admission." (FR-002, FR-003, FR-019, SC-007).
- [X] T006 Add private contribution, immutable sanitized revision, publication, restricted lineage and decision tables in `migrations/020-shared-knowledge.cjs`; enforce C04: "Contribution state is draft, submitted, rejected or closed; publication state is unpublished, published, suspended, superseded or withdrawn; title and product/version are 1–200 characters each; problem, prerequisites, solution, reasoning, applicability, limitations and validation are each 1–2,000 characters; sanitized revision JSON is at most 20 KiB." and C05: "Each candidate has 1–20 exact accepted-profile or verified-research lineage revisions; lineage may depend transitively on approved artifacts but never on another shared entry; publication requires exact revision/digest, current administrator authority, current access to every lineage source, rights attestation and a 1–2,000 character sanitization rationale." (FR-008, FR-009, FR-010, FR-011, SC-003).
- [X] T007 Add research admission/run/operation/observation/link tables and typed conflict targets in `migrations/021-research-runs.cjs`; enforce C06: "Mode is recon, practices or fit; request state is draft, admitted, consumed, expired or cancelled; run state is queued, running, completed, partial, failed, cancelled or unconfirmed; public identity/topic fields are 1–200 characters and each rendered query is 1–500 characters; the immutable admitted scope contains at most four queries, its digest, actor/session/customer/conversation binding and a deadline.", C07: "Operation state is reserved, dispatched, succeeded, failed or unconfirmed; operation keys are unique per run and step; URLs are HTTPS, at most 2,048 characters, have no credentials and use port 443; origin is independent_discovery or user_submission; normalized text is at most 100,000 characters per fetched document and retained passages are at most 2,000 characters each.", C08: "Quality uses evidence-quality-v1 with integer R/F/D/C components from 0 through 4 and Q = round(25 × (0.4R + 0.3F + 0.2D + 0.1C)); conflict endpoints bind exact accepted-profile, verified-research or published-shared revisions and a common scope/period; resolution requires current steward authority for customer scope or administrator authority for shared scope, exact endpoint versions and a 1–2,000 character rationale." and C10: "Refresh binds an exact research revision and admitted research request; unchanged content adds retrieval history without changing the claim date; interrupted raw bodies expire within 24 hours, retired derived payloads are removed within 60 seconds by a healthy worker, and content-free operational receipts expire after 30 days while decision audit remains." (FR-006, FR-012, FR-014, FR-016, FR-017, FR-018).
- [X] T008 Add retrieval receipts, monotonic session dependencies, generation indexes and runtime grants in `migrations/022-retrieval-context-fences.cjs` and `scripts/db-role-setup.sql`; enforce C03: "A citation binds source revision, passage digest, projection contract and every selected locator; locator kind is profile_field, artifact_unit, research_passage or shared_field, text spans use zero-based half-open offsets, and artifact locators retain the original 004 unit location; a receipt contains at most 10 citations, an as-of time and valid-until time, with no persisted raw query; consumed dependencies are an append-only union per native conversation session until retirement." (FR-004, FR-005, FR-019, FR-021, SC-007).
- [X] T009 Implement 005-specific schema022/vector/contract readiness in `lib/server/retrieval/policy.ts` and `scripts/prepare-retrieval.ts`; deny new routes/lanes when unavailable while preserving earlier 002–004 read-only paths, and make explicit preparation/migration commands distinguish disposable resources (FR-023).
- [X] T010 Extend current policy/source eligibility helpers in `lib/server/profiles/policy.ts`, `lib/server/profiles/eligibility.ts` and `lib/server/retrieval/policy.ts` for separately authorized customer/shared scopes, current audience projections and exact source generations; do not grant lineage access through publication (FR-001, FR-002, FR-005, FR-008, SC-002).
- [X] T011 Implement bounded leased indexing/invalidation/cleanup scheduling and compare-and-swap in `lib/server/retrieval/jobs.ts`, `scripts/retrieval-worker.ts` and `scripts/maintenance-worker.ts`; reserve operations, set paid-call ambiguity unconfirmed, and prevent a second research orchestrator (FR-016, FR-019, SC-007).
- [X] T012 Add content-free counters and restricted operational receipts in `lib/server/retrieval/telemetry.ts`; verify query/text/credential/customer-identifier exclusion in `tests/unit/retrieval-telemetry.test.ts` and expose failed/unconfirmed jobs through safe operator command output in `scripts/check-retrieval.ts` (FR-022).

**Checkpoint:** Explicit migrations and gates work on disposable resources;
current authority and job invariants are established without UI/tool exposure.

## Phase 3: US1 — Find evidence and inspect support (P1, first usable increment)

**Goal:** One governed hybrid search/citation path for UI and Turi.
**Independent test:** Authorized synthetic profile/research/excerpt corpus returns
exact spans to internal/partner users, with zero hidden customer/field/count leaks.

### Tests first

- [X] T013 [P] [US1] Add route/tool contract and real-DB denial/ranking-invariance tests in `tests/contracts/retrieval.test.ts` and `tests/integration/retrieval-search.test.ts`, covering environment/workspace/customer/grant/session boundaries, no-count errors, hidden sentinel additions and citation revocation (FR-001, FR-002, FR-003, FR-004, FR-005, SC-002).
- [X] T014 [P] [US1] Add chunk/span/quality/fallback unit fixtures in `tests/unit/retrieval-projection.test.ts` and `tests/unit/retrieval-quality.test.ts`, covering disjoint pages/sheets, partial OCR, identical passages, unknown/future/overdue dates, copied corroboration, English-coverage caveats, inert injection-like queries and invalid/mismatched vectors (FR-003, FR-004, FR-006, FR-007, SC-005).

### Implementation

- [X] T015 [US1] Build only current accepted field/audience, approved excerpt and verified research projections in `lib/server/retrieval/projections.ts`; exclude private originals/chat/Pending and recursively validate support before both indexing and query selection (FR-002, FR-005, SC-002).
- [X] T016 [US1] Implement bounded chunking and full multi-unit locator/digest resolution in `lib/server/retrieval/chunker.ts`, `lib/server/retrieval/citations.ts` and `lib/server/profiles/artifact-excerpts.ts`; never include intervening/adjacent private content and preserve original location plus normalized offsets (FR-004, SC-001).
- [X] T017 [US1] Implement `embedding-v1` and durable batch receipts in `lib/server/retrieval/embeddings.ts`, with AI SDK provider retries explicitly disabled, exact model/dimensions, query/index deadlines, ≤32 passages/batch, two-call concurrency, synthetic/public scope and unconfirmed outcomes (FR-003, FR-016, FR-019).
- [X] T018 [US1] Implement materialized authorized/eligible relation, full-text plus exact cosine branches, RRF60, stable tie/deduplication, result/byte/per-source caps, rate limits and labeled lexical degradation in `lib/server/retrieval/search.ts`; no shared query-vector cache and no unauthorized candidate influence (FR-001, FR-003, FR-005, FR-022, SC-004).
- [X] T019 [US1] Implement discovery versus current_fact projection, as-of quality/validity and evidence-class/caveat/gap DTOs in `lib/server/retrieval/context.ts` and `lib/server/profiles/context.ts`, reusing `lib/server/profiles/quality.ts` with no rubric change (FR-006, FR-007, FR-021, SC-005).
- [X] T020 [US1] Record monotonic receipt dependencies and integrate current-policy fences in `lib/server/retrieval/fences.ts`, `lib/server/profiles/attempt-context.ts`, `lib/server/conversations/context-fence.ts`, `lib/server/conversations/stream.ts`, `lib/server/conversations/projection.ts`, `agent/hooks/guard-customer-context.ts` and `agent/hooks/persist-conversation.ts`; cover prior-turn context, model steps, chunks, titles, history, reconnect/resume and native quarantine (FR-005, FR-019, FR-021, SC-007).
- [X] T021 [US1] Add authenticated no-store search and citation routes in `app/api/retrieval/search/route.ts` and `app/api/retrieval/citations/[id]/route.ts`, mapping bounded DTOs/opaque errors to the same domain services (FR-004, FR-020, FR-021).
- [X] T022 [US1] Author `agent/tools/search_evidence.ts` and `agent/instructions/retrieval-context.ts`, integrate the existing customer-context instruction entry point, and preserve root model/disabled broad web tools while enforcing evidence labels, source-linked answers and explicit abstention (FR-007, FR-021, SC-006).
- [X] T023 [US1] Add customer search/locator/quality UI in `app/_components/profiles/evidence-search.tsx` and `app/_components/profiles/evidence-detail.tsx`, linked from `app/(workspace)/customers/[customerId]/page.tsx`, with keyboard/mobile/themes and loading/empty/denied/degraded/stale states (FR-020, SC-008).
- [X] T024 [US1] Run US1 targeted tests and add withdrawal-during-output/prior-turn replay coverage in `tests/integration/retrieval-fences.test.ts`; record exact results and remaining live relevance gates in `specs/005-governed-rag-research/validation.md` (SC-001, SC-002, SC-005, SC-007).

**Checkpoint:** US1 can be demonstrated with approved synthetic/public fixtures.
This is the MVP increment, not permission to stop the authorized full feature.

## Phase 4: US2 — Publish and reuse sanitized learning (P1)

**Goal:** Private authoring and exact admin publication with global shared reading.
**Independent test:** Cedar partner and another workspace receive the same public
Juniper-derived payload as internal readers, without Juniper identity/lineage.

### Tests first

- [X] T025 [P] [US2] Add publication authority, sanitization, rights, stale-version, replay and source-race tests in `tests/integration/knowledge-publication.test.ts` using private identity/link/count sentinels and revoked publisher/source grants (FR-009, FR-010, FR-011, SC-003, SC-007).
- [X] T026 [P] [US2] Add global same-environment shared reading, private candidate/lineage denial and identical reader DTO contracts in `tests/contracts/knowledge.test.ts`, including a different workspace and draft/rejected/suspended/withdrawn revisions (FR-008, FR-010, SC-002, SC-003).

### Implementation

- [X] T027 [US2] Implement source-authorized draft/edit/submit/reject flows and immutable payload validators in `lib/server/knowledge/service.ts` and `lib/server/knowledge/policy.ts`, applying C04/C05 and exact current candidate/idempotency checks (FR-008, FR-009, FR-011).
- [X] T028 [US2] Implement atomic admin publish/correct/withdraw decisions, direct-identifier blockers, rights attestation and explicit indirect-identifier checklist in `lib/server/knowledge/service.ts`; bind every decision to reviewed digest/current lineage, including honest self-review (FR-009, FR-010, FR-011, SC-007).
- [X] T029 [US2] Implement restricted lineage access and immediate transitive eligibility/suspension in `lib/server/knowledge/lineage.ts` and `lib/server/retrieval/fences.ts`, including source corrections while workers are paused and no shared-to-shared dependency cycles (FR-005, FR-011, FR-019, SC-003, SC-007).
- [X] T030 [US2] Implement public-safe shared reader/quality projection in `lib/server/knowledge/read.ts` and integrate published revisions into `lib/server/retrieval/projections.ts`, `lib/server/retrieval/search.ts` and `lib/server/retrieval/citations.ts` without private source pointers or counts (FR-008, FR-010, SC-003).
- [X] T031 [US2] Add the read/list/candidate/revision/submit/decision/withdraw/lineage routes enumerated in `contracts/shared-knowledge.md` under `app/api/knowledge/`, using session/CSRF, exact preconditions and opaque errors (FR-008, FR-009, FR-011, FR-021).
- [X] T032 [US2] Build library/detail/contribution/admin-review screens in `app/(workspace)/knowledge/page.tsx` and `app/_components/knowledge/`, with authorized navigation in `app/_components/app-shell.tsx`, sanitization checklist, lineage only for reviewers, and draft/rejected/stale/withdrawn states (FR-010, FR-020, SC-008).
- [X] T033 [US2] Run independent cross-workspace/publication/suspension scenarios from `tests/contracts/knowledge.test.ts` and `tests/integration/knowledge-publication.test.ts`; record public-payload equivalence and all sentinel denials in `specs/005-governed-rag-research/validation.md` (SC-002, SC-003, SC-007).

## Phase 5: US3 — Bounded public research and fit (P2)

**Goal:** User-visible public scope and durable recon/practices/fit capabilities.
**Independent test:** Three modes run on synthetic/public inputs with exact
outbound scope, quotations/origin, bounded usage and accurate cancellation/failure.

### Tests first

- [X] T034 [P] [US3] Add admission/dispatch/idempotency/mode/scope/ownership/provider-budget contracts in `tests/contracts/research.test.ts` and `tests/integration/research-workflow.test.ts`, including tampered model input, late consume, session/grant loss, ambiguous paid dispatch and cancellation races (FR-012, FR-013, FR-016, FR-021, SC-007).
- [X] T035 [P] [US3] Add SSRF/DNS pinning/redirect/decompression/parser and origin/identity/exact-support fixtures in `tests/unit/research-fetch.test.ts` and `tests/unit/research-evidence.test.ts`, capturing outgoing requests without live calls and preserving the existing synthetic ingest tests (FR-014, FR-015, SC-002, SC-005).

### Implementation

- [X] T036 [US3] Implement preview templates/public-field validation, exact scope admission, rate/concurrency reservations and atomic owned-turn outbox binding in `lib/server/research/requests.ts`, `lib/server/research/policy.ts` and `lib/server/conversations/dispatch.ts`; confirmation authorizes public egress only, and a model proposal sends nothing (FR-012, FR-013, FR-016, FR-021).
- [X] T037 [US3] Implement bounded durable run/operation reservation, consumption/expiry, checkpoints, cancellation and unconfirmed replay behavior in `lib/server/research/execution.ts`, using eve for orchestration and Postgres for authoritative receipts; enforce the 120-second and call/content budgets before dispatch (FR-016, SC-007).
- [X] T038 [US3] Implement exact-query Context.dev discovery and pinned public HTTPS fetching in `lib/server/research/discovery.ts` and `lib/server/research/fetch.ts`, with no automatic paid retries, no caller auth/cookies, all-address/redirect checks, decompression limits and safe unavailable/blocked errors (FR-013, FR-015, FR-016).
- [X] T039 [US3] Implement inert normalization, origin/alias and normalized-content tracking, conservative unknown-syndication treatment, claim-specific authority rules and checked server ingest in `lib/server/research/normalize.ts`, `lib/server/research/execution.ts` and `lib/server/research/ingest.ts`; add a separate verified receipt path beside `lib/server/profiles/research.ts`, preserving its synthetic-only boundary and keeping supplied/paraphrased content Pending (FR-006, FR-007, FR-014, SC-005).
- [X] T040 [US3] Author replay-safe `agent/tools/research.ts`, `agent/tools/propose_research.ts` and `agent/instructions/research-context.ts`, bind admitted IDs to the active owned turn, separate recon/practices/fit capabilities, fence retained output and require a new user-started request for fit gaps (FR-012, FR-013, FR-016, FR-021, SC-006).
- [X] T041 [US3] Add the preview/revision/start/status/cancel routes in `app/api/research/` from `contracts/research.md`, with owner-only responses, same domain services and safe progress/usage/terminal codes (FR-016, FR-020, FR-021).
- [X] T042 [US3] Build public-field/query preview, start/progress/cancel/retry and cited findings UI in `app/_components/research/` and integrate the owned-turn request action in `app/_components/agent-chat.tsx`; display unavailable/partial/failed/cancelled/unconfirmed states without claiming full completion (FR-013, FR-016, FR-020, SC-008).
- [X] T043 [US3] Run deterministic three-mode/query-capture/origin/cancellation/replay scenarios in `tests/integration/research-workflow.test.ts` and `tests/contracts/research.test.ts`, recording budget/receipt evidence and distinct unrun live gates in `specs/005-governed-rag-research/validation.md` (SC-002, SC-005, SC-006, SC-007).

## Phase 6: US4 — Refresh, conflicts and revocation (P2)

**Goal:** Current dates/conflicts and immediate invalidation survive worker failure.
**Independent test:** Pause workers, refresh/revise/withdraw/revoke, resume stale
work, and prove current denial plus one new eligible revision after renewed review.

### Tests first

- [X] T044 [P] [US4] Add lineage fan-out/stale lease/cleanup/restart/prior-turn withdrawal checks in `tests/integration/knowledge-publication.test.ts`, `tests/integration/retrieval-jobs.test.ts`, `tests/integration/retrieval-fences.test.ts`, `tests/integration/research-workflow.test.ts` and `scripts/retrieval-recovery-check.ts`, including authorization loss between research fetch/ingest and publication preview/commit (FR-011, FR-016, FR-019, SC-007).
- [X] T045 [P] [US4] Add due/unchanged/changed/future-date/copied-source refresh and typed conflict tests in `tests/integration/research-workflow.test.ts`, `tests/integration/knowledge-publication.test.ts`, `tests/unit/research-refresh.test.ts` and `tests/unit/evidence-conflicts.test.ts`, including customer/shared versus global shared conflict authority (FR-006, FR-017, FR-018, SC-005).

### Implementation

- [X] T046 [US4] Implement due tracking and explicit admitted refresh in `lib/server/research/refresh.ts`, extend `scripts/maintenance-worker.ts` for due marking without external calls, and preserve claim-age/origin with unchanged retrieval history or new checked revision (FR-017, SC-005).
- [X] T047 [US4] Extend exact typed conflict flag/confirm/resolve services in `lib/server/profiles/conflicts.ts`, current_fact eligibility in `lib/server/retrieval/context.ts` and shared caveat projection in `lib/server/knowledge/read.ts`, enforcing steward/admin scope, endpoint versions and visible material-conflict abstention (FR-006, FR-007, FR-018, SC-005, SC-006).
- [X] T048 [US4] Wire source correction/retraction/withdrawal/delete, publication changes and authority revocation into generation/tombstone invalidation in `lib/server/retrieval/fences.ts`, `lib/server/profiles/eligibility.ts`, `lib/server/knowledge/lineage.ts` and existing `lib/server/artifacts/` lifecycle services; deny synchronously before asynchronous cleanup (FR-005, FR-011, FR-019, SC-007).
- [X] T049 [US4] Implement bounded cleanup and retention in `lib/server/retrieval/cleanup.ts` and `lib/server/retrieval/jobs.ts`, including embedding/text/snapshot/raw-body removal, safe minimal audit, retry exhaustion visibility and operator retry without restoring withdrawn eligibility (FR-019, FR-022, SC-004, SC-007).
- [X] T050 [US4] Add due/refresh/conflict/impact screens and routes in `app/_components/profiles/conflict-review.tsx`, `app/_components/research/refresh-panel.tsx`, `app/_components/knowledge/` and `app/api/research/refresh/route.ts`, using current server authority and exact source versions (FR-017, FR-018, FR-020, SC-008).
- [X] T051 [US4] Run the paused-worker, refresh, conflict and stale-replay checks in `tests/integration/knowledge-publication.test.ts`, `tests/integration/retrieval-jobs.test.ts`, `tests/integration/retrieval-fences.test.ts`, `tests/integration/research-workflow.test.ts` and the disposable live workflow; record immediate denial and healthy cleanup/convergence timings in `specs/005-governed-rag-research/validation.md` (SC-002, SC-005, SC-007).

## Phase 7: Integrated validation and documentation

- [X] T052 Author judged ≥40-query relevance/denial/citation and 12 actual-output case definitions in `evals/fixtures/005-retrieval-governance.json` and public/synthetic source fixtures in `tests/fixtures/retrieval/`, with expected relevance sets fixed before running and exact scoring/hard gates from `contracts/lifecycle-validation.md` (SC-001, SC-002, SC-003, SC-006).
- [x] T053 Implement bounded live embedding/research evaluators and review verifier in `scripts/eval-retrieval.ts`, `scripts/eval-research.ts`, `scripts/verify-research-review.ts` and isolated `scripts/retrieval-eval-environment.ts`; add quickstart command surfaces in `package.json`, preserve selected model/DB/native state, fail missing live evidence, and record provider usage rather than asserting fixture proof (FR-016, FR-023, SC-001, SC-006).
- [X] T054 Implement/run disposable empty/018→022/vector-role/matched restore/restart/lease/replay drill in `scripts/retrieval-recovery-check.ts` and extend `scripts/check-retrieval.ts`; prove selected DB/store and `.eve/.workflow-data` are unchanged, and record forward recovery/disable-intake rollback evidence in `specs/005-governed-rag-research/validation.md` (FR-023, SC-007).
- [X] T055 Implement/run the 5,000-passage, five-reader, 100-measurement performance and convergence gate in `scripts/benchmark-retrieval.ts`, add `retrieval:benchmark` in `package.json`, and record p95 plus embedding/end-to-end/degraded/failure measurements in `specs/005-governed-rag-research/validation.md` (FR-022, SC-004).
- [X] T056 Add/run affected search/source/publication/research-cancel/refresh/conflict keyboard and axe journeys in `tests/ui/retrieval.spec.ts`, `tests/ui/knowledge.spec.ts` and `tests/ui/research.spec.ts` under all four CLI Playwright/WebKit projects; inspect screenshots against `docs/design-reference.md` and record results in `specs/005-governed-rag-research/validation.md` (FR-020, SC-008).
- [X] T057 Run types/build, applicable existing identity/profile/artifact authorization regressions and new deterministic unit/integration/contracts suites configured in `package.json`; record commands/results and inspect the diff for secret/model/scope changes in `specs/005-governed-rag-research/validation.md`, broadening tests only for failures or a concrete uncovered gate (FR-021, FR-023, SC-002, SC-007).
- [X] T058 Run the bounded real-embedding judged relevance/citation suite via `scripts/eval-retrieval.ts` using synthetic/public data; record ≥0.85 recall@5, all exact citations, provider contract/usage and separate fake-vector benchmark evidence in `specs/005-governed-rag-research/validation.md`; missing credentials or failed live checks leave this task open (SC-001).
- [x] T059 Run and review all 12 actual research/Turi cases via `scripts/eval-research.ts` and `scripts/verify-research-review.ts`, require every hard gate and each score ≥7/8 within call/time/output caps, and record safe case/usage summaries in `specs/005-governed-rag-research/validation.md`; do not replace failed live behavior with fixture output (FR-023, SC-006).
- [X] T060 Update `README.md`, `ROADMAP.md`, `docs/architecture.md`, `docs/decisions.md`, `specs/005-governed-rag-research/spec.md`, `specs/005-governed-rag-research/quickstart.md` and `specs/005-governed-rag-research/validation.md` with actual capability/setup/rollback/limits in the same feature PR; run docs/link/whitespace checks and reconcile every completed task against evidence, without claiming hosted release (FR-023).

## Dependencies and execution order

Setup T001–T003 → foundation T004–T012 → US1 T013–T024 → US2 T025–T033 →
US3 T034–T043 → US4 T044–T051 → integrated gates T052–T060.
Migrations serialize 019→020→021→022. T004 tests first; T009 gates before exposure.
US2 public retrieval needs US1; US3 fit consumes US1/US2; US4 integrates all three.
Each story is independently testable with fixtures at its checkpoint, not a
claim that it has no prerequisite. Do not release an incomplete dependent slice.

Within a phase, tests precede implementation; schema/contract precede services,
then HTTP/eve/UI integration, then targeted checks. Shared policy/fence/projection
files have one writer at a time. Later tasks naming those files extend earlier
work sequentially. Integrated live checks follow deterministic authority gates.
Missing live configuration leaves those tasks explicitly pending.

### Parallel examples

| Story | Independent work after prior phase | Shared writes that must serialize |
| --- | --- | --- |
| US1 | T013 contract/DB fixtures and T014 unit fixtures | T015–T020 projection/search/context/fences |
| US2 | T025 mutation/race tests and T026 reader contracts | T027–T030 service/lineage/projection |
| US3 | T034 admission/workflow tests and T035 fetch/trust fixtures | T036–T040 dispatch/execution/ingest/tools |
| US4 | T044 lifecycle races and T045 date/conflict fixtures | T046–T049 refresh/conflict/fences/cleanup |

No broad parallel story implementation is assumed. The eight `[P]` tasks share
stable fixture contracts and can be authored separately after setup; run DB tests
with isolation, not concurrently against the selected app database.

## Requirement coverage

| Requirement | Primary tasks |
| --- | --- |
| FR-001 | T003, T010, T013, T018 |
| FR-002 | T005, T010, T013, T015 |
| FR-003 | T003, T005, T014, T017, T018 |
| FR-004 | T008, T013, T016, T021 |
| FR-005 | T008, T010, T013, T015, T018, T020, T029, T048 |
| FR-006 | T007, T014, T019, T039, T045, T047 |
| FR-007 | T014, T019, T022, T039, T047 |
| FR-008 | T006, T010, T026, T027, T030, T031 |
| FR-009 | T003, T006, T025, T027, T028, T031 |
| FR-010 | T006, T025, T026, T028, T030, T032 |
| FR-011 | T006, T025, T027, T028, T029, T031, T044, T048 |
| FR-012 | T003, T007, T034, T036, T040 |
| FR-013 | T034, T036, T038, T040, T042 |
| FR-014 | T007, T035, T039 |
| FR-015 | T002, T035, T038 |
| FR-016 | T003, T007, T011, T017, T034, T036, T037, T038, T040, T041, T042, T044, T053 |
| FR-017 | T007, T045, T046, T050 |
| FR-018 | T007, T045, T047, T050 |
| FR-019 | T004, T005, T008, T011, T017, T020, T029, T044, T048, T049 |
| FR-020 | T021, T023, T032, T041, T042, T050, T056 |
| FR-021 | T001, T003, T008, T019, T020, T021, T022, T031, T034, T036, T040, T041, T057 |
| FR-022 | T012, T018, T049, T055 |
| FR-023 | T001, T002, T004, T009, T053, T054, T057, T059, T060 |
| SC-001 | T016, T024, T052, T053, T058 |
| SC-002 | T010, T013, T015, T024, T026, T033, T035, T043, T051, T052, T057 |
| SC-003 | T006, T025, T026, T029, T030, T033, T052 |
| SC-004 | T018, T049, T055 |
| SC-005 | T014, T019, T024, T035, T039, T043, T045, T046, T047, T051 |
| SC-006 | T022, T040, T043, T047, T052, T053, T059 |
| SC-007 | T004, T005, T008, T011, T020, T024, T025, T028, T029, T033, T034, T037, T043, T044, T048, T049, T051, T054, T057 |
| SC-008 | T023, T032, T042, T050, T056 |

## Implementation strategy

Start with setup and shared authority infrastructure, then deliver US1 as the
first usable increment. Validate each story before integrating the next. Complete
all four stories and acceptance gates for feature completion. Keep evidence in
`validation.md` and all behavior/status documentation in the same feature PR.
No implementation, dependency installation, live provider call, database migration,
commit/PR/merge or deployment is performed by this task-generation pass.

**Counts:** 60 tasks: setup 3, foundation 9, US1 12, US2 9, US3 10, US4 8,
integrated validation/documentation 9. Eight tasks have `[P]`. Implementation
progress: 44 checked, 16 open; live research and full acceptance remain open.

## Public research remediation (authorized 2026-10-08)

- [x] T061 Capture and verify the current official directory and all archive pages, reconcile identity aliases and compare aggregate legacy/Production coverage.
- [x] T062 Implement bounded, checkpointed public research with shared checked-source policy, authenticated admin writes, source lineage and idempotent customer anchors.
- [x] T063 Restore broad discovery and multi-source interactive recon without changing user-origin or scope/authorization boundaries; add regression checks.
- [x] T064 Verify batch denial, replay, source integrity, attribution and generated citation contracts in disposable tests; run types/build and focused research checks.
- [x] T065 Execute and review real public research for every captured account, save to Production with explicit authorization, record citations, per-area gaps, provider usage and terminal coverage.
- [x] T066 Update README and validation with exact released behavior and actual run results; keep 011 a proposal.
