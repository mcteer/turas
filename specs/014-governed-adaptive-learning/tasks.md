# Tasks: Governed Adaptive Learning

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md),
[data model](data-model.md), [contracts](contracts/) and [quickstart](quickstart.md).

**Tests**: Required by SC-001–007 and constitution for authorization, state,
calculations, agent behavior, migrations and UI. Task checkboxes record verified implementation progress. Release tasks require a separately authorized
merge/release; planning does not authorize paid calls or 014 hosted changes.

**Format**: `- [ ] TNNN [P]? [USn]? Action with exact paths`. `[P]` means independent
files after listed prerequisites; it is not automatic authorization to spawn agents.

## Phase 1 — Setup

- [X] T001 Confirm main/migration head and current feature in `specs/014-governed-adaptive-learning/handoff.md`; read installed Next route/client guides and eve context/lifecycle docs before authoring; preserve model hash, selected environment, workflow data and canonical checkout.
- [X] T002 Define strict versioned schemas and the C01–C14 bounds in `lib/contracts/learning.ts`; preserve `lib/contracts/knowledge.ts` reader compatibility and add publish evaluation/review bindings. C01: IDs are UUIDs; generations are integers 1–9007199254740991; digests are 64 lowercase hexadecimal characters; timestamps are UTC.
- [X] T003 [P] Define owned synthetic actors, exact source fixtures and canonical suite inventory in `tests/fixtures/learning/setup.ts` and `scripts/learning-suites.json`; include all mandatory acceptance classes and resource ownership/cleanup.

## Phase 2 — Foundation

- [X] T004 Add scoped immutable feedback, rights-review, dependency, request and purgeable payload records in `migrations/052-learning-governance.cjs`, following the data model and exact-target constraints.
- [X] T005 Add purpose-exclusive native binding, durable budgets, paired evaluation, exact release records, legacy-head snapshot and activation-aware publication guard in `migrations/053-learning-evaluation.cjs`; reject mixed/reassigned conversation bindings in both insertion orders.
- [X] T006 Add metric contributions, approvals, cross-version family uniqueness, refresh/cleanup jobs and earliest-deadline guards in `migrations/054-learning-metrics.cjs`.
- [X] T007 Update `migrations/manifest.json` and `scripts/db-role-setup.sql` for 052–054; add `lib/server/learning/schema.ts` and `scripts/learning-activate.ts` for explicit readiness/activation, immutable gate history and runtime least privilege; never run DDL in handlers.
- [X] T008 Implement current actor/target/original/rights authorization and closure hashing in `lib/server/learning/{policy,sources,eligibility,repository}.ts`; retain existing 005 contribution-authoring and publisher authority and separate source rights from feedback/engineering/training review.
- [X] T009 Implement versioned request HMAC receipts, shared admission locks, status/abandon reconciliation and quotas in `lib/server/learning/{commands,receipts,limits}.ts`; changed replay conflicts and late originals cannot race abandonment. C14: Admission allows 1 active draft per actor/customer, 1 active evaluation per workspace, 30 new learning writes per actor per minute and 120 per workspace per minute; retries/reconciliation do not consume new-work quota.
- [X] T010 Implement payload-only purge, earliest-deadline scheduling and metadata/tombstone retention helpers in `lib/server/learning/{retention,invalidation}.ts`; preserve stricter 005 deadlines and actor-only versus global loss distinctions. C13: Obsolete private payloads expire within 90 days, globally invalidated payloads within 24 hours or an earlier source deadline, and eligible audit metadata is minimized after 365 days; request tombstones last for the environment lifetime.

## Phase 3 — US1: Feedback to proposed improvement (P1)

**Independent checkpoint**: Authorized internal/partner feedback is private, triaged,
and optionally saved as a grounded candidate; no shared publication changes.

- [X] T011 [P] [US1] Add contract/domain authorization, peer denial, immutable target, disposition, edit/replay and feedback-as-unverified tests in `tests/contracts/learning-feedback.test.ts` and `tests/integration/learning-feedback.test.ts`.
- [X] T012 [US1] Implement feedback create/revise/read/disposition with safe author status in `lib/server/learning/feedback.ts`; expose no private linked candidate or reviewer discussion to partners. C02: Feedback text is 1–2000 characters, disposition rationale is 1–2000 characters, and a feedback request is at most 16 KiB with exactly one typed target.
- [X] T013 [US1] Implement exact practice/report/gap-observation/guide/own-checkpoint adapters in `lib/server/learning/targets.ts` using their current domains; resolve original lineage separately and deny private chat mining.
- [X] T014 [US1] Implement selected same-customer draft preparation/context/tool actor in `lib/server/learning/{advisory,context,tool-actor}.ts`, including at most 10 selected feedback IDs, a 1–2000 character question and immutable owner/purpose bindings. C05: A draft has at most 6 paid steps, 6 evidence reads, 200 dependencies, 24576 cumulative input bytes, 4096 requested output tokens per step, 8192 cumulative observed output tokens including reasoning, a 120-second dispatch deadline and a 5-minute preparation TTL.
- [X] T015 [US1] Implement server-side durable USD reservation/actual-or-bound settlement in `lib/server/learning/{budget,model-budget}.ts`; validate current price-contract evidence, reserve before I/O, fail closed without a finite justified ceiling and hold unknown cost without hidden retries. C07: USD budgets are positive decimal strings with at most 6 fractional digits and a maximum of 25 USD per operation; reservations and usage use integer micro-USD and never treat unknown cost as zero.
- [X] T016 [US1] Integrate learning dispatch/admission/release/reconcile/cancel/history/retirement in `lib/server/learning/native*.ts`, `lib/server/conversations/{feature,model-admission,dispatch,projection,release-preflight,native-release,context-fence,reconcile,cancel,repository,eve-routes}.ts`, `lib/server/staffing/{native-context,context,model-budget}.ts` and `agent/channels/eve.ts`; preserve all existing native modes and model selection/admission in `agent/agent.ts`; set documented finished-run retention to zero and verify governed captures survive native retirement.
- [X] T017 [US1] Add `agent/instructions/learning-context.ts`, `agent/tools/{learning_summary,learning_evidence}.ts` and `agent/skills/governed-learning/SKILL.md`; extend `agent/hooks/guard-customer-context.ts`, `agent/tools/load_skill.ts` and generic instruction/tool exclusions with purpose-specific default-deny guards.
- [X] T018 [US1] Implement exact-output explicit proposal save in `lib/server/learning/drafts.ts` through `lib/server/knowledge/service.ts`; preserve selected original lineage, require new evidence for edited facts and deny invalid/uncertain/other-owner attempts. C03: Existing candidate payload limits remain 20 KiB total, title/product version 1–200 characters, seven narrative fields 1–2000 characters, and 1–20 distinct eligible originals from one customer.
- [X] T019 [US1] Add strict feedback/draft/request adapters under `app/api/learning/{_shared.ts,feedback,drafts,requests}` using `contracts/learning-api.md`; enforce CSRF, no-store, opaque denial and bounded page bodies. C04: List limit is 1–20, opaque cursor at most 512 characters, search at most 200 characters, and private response at most 128 KiB; reject oversized work without silent truncation.
- [X] T020 [US1] Add protected feedback/queue/draft UI in `app/(workspace)/learning/` and `app/_components/learning/{feedback,queue,draft,client}.tsx`; add feedback triggers to eligible knowledge/report/gap/partner views and a role-aware shell link in `app/_components/app-shell.tsx`.
- [X] T021 [US1] Verify real native binding/allowlist/budget/usage/stop/unknown-cost/source-loss/history/reconnect/retirement behavior in `tests/integration/learning-native-draft.test.ts`, including provider overrun and one-invocation generate/stream guards.
- [X] T022 [US1] Add CLI WebKit feedback/draft/peer-denial/stale-response/reconciliation and accessible dialog tests in `tests/ui/learning-feedback.spec.ts` and `tests/ui/learning-draft.spec.ts` for all four configurations.

## Phase 4 — US2: Evaluated publication and rollback (P1)

**Independent checkpoint**: One exact reviewed candidate executes all paired cases,
receives a human assessment and publishes through 005; invalid cases block it and
withdrawal works with newer drafts. No aggregate/refresh UI dependency.

- [X] T023 [P] [US2] Add review/closure-change/legacy-route bypass/publication-race/withdraw-with-draft/rollback tests in `tests/integration/learning-publication.test.ts` and `tests/contracts/learning-evaluation.test.ts`.
- [X] T024 [US2] Implement exact-revision rights/sanitization review and revocation in `lib/server/learning/reviews.ts`, binding wording, closure, rights and reviewer authority without promoting pending facts.
- [X] T025 [P] [US2] Define fixed eight-case inputs and separate expected behaviors in `lib/learning/evaluation-cases.ts`, versioned rubric in `lib/learning/evaluation-rubric.ts` and independent fixtures in `tests/fixtures/learning/evaluation.ts`; no candidate/model-selected cases or expected answers in model context.
- [X] T026 [US2] Implement frozen paired evaluation admission/orchestration and private captures in `lib/server/learning/{evaluation,evaluation-context,evaluation-captures}.ts`; use fresh purpose-bound sessions, identical contexts except practice, explicit no-baseline and strict 64 KiB arm output schema from the native contract. C06: An evaluation has exactly 8 ordered cases and 2 arms per case, at most 16 paid calls, one step and zero tools per arm, 24576 input bytes and 8192 observed output tokens per arm, and a 40-minute batch deadline with one active arm at a time.
- [X] T027 [US2] Implement human per-case review and deterministic verdict in `lib/server/learning/evaluation-review.ts`; reject client/model pass status, bind capture/manifest digests and retain every failed/missing arm and prior full-run outcome. C08: Each case review has four integer scores 0–2 and explicit safety, citation and authority pass flags; every candidate total is at least 7/8, no case score regresses and at least one intended-improvement case increases.
- [X] T028 [US2] Enforce exact current evaluation/review/baseline and human release in `lib/server/learning/releases.ts` and `lib/server/knowledge/service.ts`; update `app/api/knowledge/contributions/[id]/decisions/route.ts`, preserve exact pre-014 heads and exercise the database guard against old writers after activation.
- [X] T029 [US2] Fix withdrawal to lock actual published revision/generation and implement reviewed rollback candidate creation in `lib/server/knowledge/service.ts` and `lib/server/learning/rollback.ts`; never reactivate withdrawn authority or wait on evaluation for withdrawal.
- [X] T030 [US2] Extend shared knowledge/retrieval/citation/model/history fences in `lib/server/knowledge/{read,suspension,impact}.ts`, `lib/server/profiles/eligibility.ts` and `lib/server/retrieval/{projections,search,citations,fences,cleanup}.ts` for current rights/release dependencies with workers stopped; preserve ordinary shared projection across roles.
- [X] T031 [US2] Add private candidate/evaluation/case-capture/budget-settlement/rollback routes under `app/api/learning/{candidates,evaluations,budgets}`; return summary metadata separately from one-arm capture reads and require current authority on every replay.
- [X] T032 [US2] Add review, paired-case, settlement, publish/withdraw/rollback interactions in `app/_components/learning/{candidate,evaluation,case-review,release}.tsx` and their routes under `app/(workspace)/learning/`; start all review fields unapproved and clear stale protected bodies.
- [X] T033 [US2] Add native paired-arm/source-loss/unknown-accounting/timeout/cancel/authority fence tests in `tests/integration/learning-native-evaluation.test.ts`; prove full-run reruns require a new budget and failed arms cannot be replaced selectively.
- [X] T034 [US2] Add four-configuration accessible review, failure gate, withdrawal-with-draft and rollback WebKit flows in `tests/ui/learning-publication.spec.ts`.

## Phase 5 — US3: Internal comparable outcome metrics (P2)

**Independent checkpoint**: Fixed accepted synthetic measurements release one
quarterly aggregate; duplicates/small cohorts fail and revocation withholds forever
for that family. Does not depend on a real published candidate or model call.

- [X] T035 [P] [US3] Author independent expected arithmetic, window, denominator, missingness and privacy fixtures in `tests/unit/learning-metrics.test.ts` and `tests/fixtures/learning/measurements.ts`, including negative/unchanged/zero and fractional rounding boundaries.
- [X] T036 [US3] Implement the two fixed metric protocols and exact rational equal-customer calculations in `lib/learning/{metric-protocols,calculations}.ts`; enforce completed UTC quarter, first/last 14 days, failure attribution lag and final-only two-decimal halves-away rounding. C09: Measurement values are unsigned decimal strings 0–1000000000 with at most 6 fractional digits; rate numerators/denominators are integers 0–1000000000 with denominator greater than zero and numerator no greater than denominator.
- [X] T037 [US3] Implement accepted observed outcome/original field-locator/population adapters in `lib/server/learning/measurement-sources.ts`; every contributed value must be supported by accepted originals, not supplied as an unreviewed factual annotation. C10: A measurement contribution has exactly one customer, one metric protocol, one completed UTC quarter and two 14-day windows; at most 20 accepted outcome/source references and 100 predeclared workload identifiers support the whole population.
- [X] T038 [US3] Implement proposed measurement revisions, separate administrator reuse review, duplicate/conflict treatment and withdrawal in `lib/server/learning/measurements.ts`; one canonical customer contribution, no best-workload selection.
- [X] T039 [US3] Implement serialized first-release capture and stable private manifest/public projection in `lib/server/learning/cohorts.ts`; enforce family uniqueness across protocol versions and the 30-second/5-second statement/2-second lock deadlines with atomic rollback before disclosure. C11: A cohort requires at least 5 independent eligible customers and at most 10000 contributions examined; one immutable release family per workspace/metric/quarter spans all protocol versions, with no exact counts or replacement subset output.
- [X] T040 [US3] Implement synchronous whole-family withholding and immutable no-replacement tombstones in `lib/server/learning/cohort-eligibility.ts`; check current accepted outcomes/originals/reuse rights before every aggregate read, including stopped cleanup workers.
- [X] T041 [US3] Add strict internal measurement/review/withdraw/release/read routes under `app/api/learning/{measurements,cohorts}`; deny arbitrary filters, partner access, exact counts, drilldown and complementary disclosures.
- [X] T042 [US3] Add private measurement review and fixed Outcome Trends UI in `app/_components/learning/{measurements,cohorts}.tsx` and `app/(workspace)/learning/`; separate reviewer details from aggregates and present missing measurements honestly.
- [X] T043 [US3] Add concurrency/replay/revocation/cross-version/differencing/partner-denial tests in `tests/integration/learning-cohorts.test.ts`, including five versus four customers and release followed by corrected subsets.
- [X] T044 [US3] Add four-configuration metric unit/window/suppression/denial and stale-response UI checks in `tests/ui/learning-metrics.spec.ts`.

## Phase 6 — US4: Refresh, quality and operations (P2)

**Independent checkpoint**: Time/source changes produce bounded review work and
separate quality views; disable/restart never resets age, bypasses approval or stops
protective cleanup. Uses synthetic source/publication records without paid calls.

- [X] T045 [P] [US4] Add due-work, authority-loss, no-auto-acceptance, retention, disabled-state and worker-retry tests in `tests/integration/learning-maintenance.test.ts` with an injectable clock and stopped-worker scenarios.
- [X] T046 [US4] Implement deduplicated due review work and existing admitted research-refresh handoff in `lib/server/learning/refresh.ts` and `lib/server/research/refresh.ts`; preserve original dates and require explicit external scope/budget and separate drafting admission.
- [X] T047 [US4] Integrate learning settlement, earliest-deadline purge and native reset retry in `lib/server/learning/maintenance.ts` and `scripts/maintenance-worker.ts`; keep cleanup/withdrawal alive when new work is disabled and distinguish actor loss from global invalidation. C12: Maintenance handles at most 100 records or 10 seconds per tick, runs at least every 60 seconds, and retries transient failures after 1, 5 and 15 minutes before requiring operator review.
- [X] T048 [US4] Implement current authorized evidence/evaluation/operational projections in `lib/server/learning/dashboard.ts`, reusing `lib/server/knowledge/quality.ts` without publishing private source identities/counts or redefining evidence-quality-v1.
- [X] T049 [US4] Add bounded no-store dashboard route `app/api/learning/dashboard/route.ts`, safe content-free metrics and disabled/unavailable diagnostics in `lib/server/learning/observability.ts`.
- [X] T050 [US4] Add separate Learning Health panels and due-review actions in `app/_components/learning/health.tsx` and `app/(workspace)/learning/`; show original age, evaluation coverage and operations without an invented overall truth score.
- [X] T051 [US4] Verify maintenance deadlines/restart and four-configuration dashboard denial/disabled/error states in `tests/integration/learning-maintenance.test.ts` and `tests/ui/learning-health.spec.ts`.

## Phase 7 — Acceptance, operations and handoff

- [X] T052 Wire canonical owned suite commands in `scripts/{test-learning,learning-suites}.ts`, `scripts/learning-suites.json`, `package.json` and `.github/workflows/ci.yml`; fail on skipped/empty/missing registered checks and isolate quotas/resources without sibling checkouts.
- [X] T053 Implement owned empty→054/populated051→054/activation/old-writer/runtime-grant/restart/disable/earliest-retention/SIGTERM checks in `scripts/learning-recovery-check.ts`, retaining the same private database and workflow identity across restart.
- [X] T054 Implement real eve deterministic native runner in `scripts/check-learning-native.ts` and synthetic fixtures under `tests/fixtures/learning/`; prove budgets/allowlists/context/history/retirement without paid calls or changing root model configuration.
- [X] T055 Implement production-build four-configuration CLI WebKit runner in `scripts/check-learning-ui.ts`; capture and visually inspect only synthetic screenshots and verify keyboard/focus/overflow/source-loss paths.
- [X] T056 Register and run knowledge/retrieval/conversation/009/010/011/012/013 regressions through `scripts/check-learning-regression.ts`, preserving existing authorities, private conversations and model configuration.
- [X] T057 Implement seven-class production-quota benchmark in `scripts/benchmark-learning.ts`; ≥100 operations/class, p95 <1000ms, no rate-window resets, and explicit fixture/pacing/external-latency reporting.
- [X] T058 Implement actual-model paired capture and independent review verification in `scripts/{eval-learning,learning-review-contract,verify-learning-review}.ts` and `scripts/execution-source-digest.ts`; require fresh explicit budget, exact model/source/fixture/capture hashes and reviewed actual/bounded accounting.
- [X] T059 Run all registered contracts/unit/domain tests and record counts, zero skips and source fingerprint in `specs/014-governed-adaptive-learning/validation.md`; fix behavior until mandatory checks pass.
- [X] T060 Run native, four-configuration WebKit and regression commands; review synthetic visual evidence and record actual results in `specs/014-governed-adaptive-learning/validation.md` without substituting fixture success for model fidelity.
- [X] T061 Run recovery and seven-class performance checks under production quotas; verify cleanup of only owned resources and record actual outcomes in `specs/014-governed-adaptive-learning/validation.md`.
- [x] T062 Within explicit operator budget authorization, admit a fresh complete evaluation, capture all eight actual-model baseline/candidate pairs and obtain independent review; verify feature quality separately from unchanged publication eligibility and exact captures/accounting through `scripts/verify-learning-review.ts` and record only nonprivate evidence in `specs/014-governed-adaptive-learning/validation.md`.
- [X] T063 Run root/feature typechecks, actual eve and Next builds and documentation checks via `package.json`; verify unchanged model selection/admission in `agent/agent.ts`, `.env.local` and selected workflow data, and record results in `specs/014-governed-adaptive-learning/validation.md`.
- [X] T064 Document explicit migration/grants/activation/pricing/disable/forward-recovery and hosted smoke procedures in `docs/learning-operations.md`; update `README.md`, `ROADMAP.md`, `docs/evidence-policy.md`, `.env.example` and feature handoff with delivered behavior, limitations and content-free configuration names.
- [x] T065 Prepare the reviewable PR using `.github/pull_request_template.md` with all local/actual-model evidence, schema compatibility order, current target readiness and post-merge Production check plan; leave hosted acceptance pending until T066 and merge only when authorized and CI is green.
- [x] T066 On an authorized merge/release, perform private backup/rehearsal, explicit target migrations/grants/activation and authenticated Production HTTP/CLI WebKit checks from `docs/learning-operations.md`; record deployed revision/schema and actual outcomes in the feature validation record, verify README on main and delete only the merged feature branch after successful completion.

## Dependencies and parallel opportunities

Setup T001–T003 precedes foundation T004–T010. Migrations are authored/applied in
order; T007 follows all three, T008–T010 follow schemas/contracts. No story bypasses
foundation. US1 precedes US2's native integration. US3 may progress after foundation
independently of US1/US2; US4 depends on the relevant domain records and invalidation
interfaces. Final acceptance follows all stories. T058 precedes T062, which requires
a new operator budget and reviewer; T066 follows an authorized merge, never planning.

Parallel examples after prerequisites: US1 feedback tests T011 and adapter discovery
T013; US2 tests T023 and case catalog T025; US3 arithmetic fixtures T035 and private
review UI skeleton T042 after API contract; US4 maintenance tests T045 and health UI
T050 after projection contract. Coordinate shared files; tasks touching the same
native/knowledge/migration files remain sequential.

## Implementation strategy

Complete foundation and US1 as the first reviewable MVP; publication remains closed
until US2 passes. Add US2's evaluated release and immediate withdrawal. US3 and US4
complete metrics/operations with independent fixtures. Run focused checks while
building, then the canonical acceptance once; expand reruns only for changes or
failures. Keep local, actual-model, CI and hosted evidence distinct. No task is
complete merely because its command exists or a fixture was reviewed.

## Requirement coverage

| Requirement | Tasks |
| --- | --- |
| FR-001 | T008, T011, T020, T023, T030, T041 |
| FR-002 | T011–T013, T019–T020 |
| FR-003 | T009, T011–T012, T019–T022 |
| FR-004 | T008, T013–T014, T018, T024 |
| FR-005 | T002, T004, T008, T018 |
| FR-006 | T014–T022 |
| FR-007 | T023–T024, T031–T032 |
| FR-008 | T025–T026, T033, T058, T062 |
| FR-009 | T025, T027–T028, T033–T034, T062 |
| FR-010 | T005, T007, T023, T028, T030–T034 |
| FR-011 | T023, T029–T030, T034 |
| FR-012 | T008, T020, T030–T034 |
| FR-013 | T008, T010, T016, T021, T030, T033, T040, T045–T047 |
| FR-014 | T005, T009, T014–T016, T021, T026, T033, T054, T058, T062 |
| FR-015 | T008, T035, T037–T038, T041–T043 |
| FR-016 | T035–T037, T043–T044 |
| FR-017 | T035–T036, T039, T043–T044 |
| FR-018 | T006, T039, T041–T044 |
| FR-019 | T006, T039–T043 |
| FR-020 | T048–T051 |
| FR-021 | T045–T047, T050–T051 |
| FR-022 | T004–T009, T012, T015, T023, T038–T039, T043, T046 |
| FR-023 | T010, T016, T030, T040, T045–T047, T053–T054 |
| FR-024 | T019–T022, T031–T034, T041–T044, T049–T051, T055 |
| FR-025 | T001, T008, T017, T035–T038, T056, T063 |
| FR-026 | T004–T007, T053, T061, T064–T066 |
| SC-001 | T011, T021, T023, T033, T043, T051, T056, T059–T060 |
| SC-002 | T025–T027, T058, T062 |
| SC-003 | T023–T030, T033–T034, T059–T060 |
| SC-004 | T035–T044, T059–T060 |
| SC-005 | T010, T021, T030, T033, T040, T045–T047, T051, T053–T054, T061 |
| SC-006 | T057, T061 |
| SC-007 | T022, T034, T044, T051, T055, T060, T064–T066 |
