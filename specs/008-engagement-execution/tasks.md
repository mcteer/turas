# Tasks: Engagement execution and delivery logs

**Input**: `specs/008-engagement-execution/` spec, plan, research, data model and contracts.
**Status**: Implementation in progress. Tasks are marked only with recorded evidence.
**Authority**: User confirmed canonical `mcteer` as the sole 008 reviewer; contributors submit.
**Tests**: Required by FR-024 and SC-001–SC-008. Author meaningful tests before the
corresponding behavior, observe the expected failure, then implement and validate.
**Format**: `- [ ] Tnnn [P?] [USn?] Description with exact file path`.
`[P]` means independent files within the phase after its prerequisites; it is not
permission to bypass dependencies. Shared route/schema/manifest edits are serial.
Paths are repository-relative. C01–C12 below quote the normative field constraints
verbatim; the remaining data-model state/transaction rules also apply.

## Phase 1: Setup

**Goal**: Prepare an isolated implementation and evidence environment.

**Independent verification**: Owned resources are distinct from app/Preview/Production; source-bound evidence is private.

- [X] T001 Re-read the routed installed Eve/Next docs and reviewed 006/007 seams from `research.md`; create the pending implementation evidence ledger in `specs/008-engagement-execution/validation.md`, recording Node 24, selected model preservation and unrun gates. (FR-023, FR-024)

- [X] T002 Build `scripts/execution-eval-environment.ts` and `tests/fixtures/execution/environment.ts` with owned DB/roles/artifact/Eve/ports/worker isolation, explicit manifest 034 fixture plus empty fixture, marker checks and cleanup; reject arbitrary DB/path overrides and preserve configured stores. (FR-023, SC-008)

- [X] T003 Add `scripts/test-execution.ts`, `tests/unit/execution-test-manifest.test.ts` and new command entries in `package.json`; discover all execution unit/contract/integration suites, verify no missing/duplicate/orphaned/skipped assertions and retain private source-bound reports. Extend the manifest as each story adds suites. (FR-024)

**Checkpoint**: Complete this phase’s relevant checks before advancing dependent work.

## Phase 2: Foundational prerequisites

**Goal**: Establish schema, authority, strict commands and source-safe projections before stories.

**Independent verification**: Empty/prior upgrades and policy/replay contract tests pass; new domain does not alter older feature readiness.

- [X] T004 [P] Write empty/034-upgrade and runtime/cleanup-role denial cases in `tests/integration/execution-schema.test.ts`; preserve 006/007 decisions, store/workflow pairing and current newer payload across recovery. (FR-023, SC-008)

- [X] T005 [P] Write current actor/customer/resource policy, partner/draft/time projection, strict command/preview/cursor/rate/replay contract tests in `tests/contracts/execution-policy.test.ts` and `tests/contracts/execution-command-api.test.ts`, including self-review authority and current denial after replay. (FR-001, FR-018, FR-022, SC-002)

- [X] T006 Create records/baseline/review/receipt tables, scoped composite keys, immutable metadata versus purgeable payloads and source indexes in `migrations/036-execution-records.cjs` using `data-model.md`. Add the exact checksum/version entry in `migrations/manifest.json`. (FR-002, FR-003, FR-017, FR-023)

- [X] T007 Create time/resource-day/contribution/effort/calculation tables and scoped unique constraints in `migrations/037-execution-time-effort.cjs`; create advice/dependency/step/usage/cleanup tables in `migrations/038-execution-advice-lifecycle.cjs`; update `migrations/manifest.json` without changing prior migration bytes. (FR-007, FR-012, FR-021, FR-023)

- [X] T008 Add narrow runtime/cleanup grants in `scripts/db-role-setup.sql`, explicit feature preparation in `scripts/prepare-execution.ts` and `.env.example` documentation for `TURAS_008_DISABLED`; gate only 008 on schema 038, retain reads/settlement/cleanup when disabled and never migrate on request. (FR-022, FR-023)

- [X] T009 Implement `lib/server/execution/policy.ts` and `lib/server/execution/actor.ts` using existing membership/session/customer/resource checks, confirmed canonical mcteer-only review, current grant/linked-resource partner access and identity-only reviewer selection of inactive subjects; never reuse the partner-denying staffing wrapper. (FR-001, FR-005, FR-018)

- [X] T010 Implement shared validators in `lib/server/execution/schema.ts` with boundary cases in `tests/unit/execution-contracts.test.ts`. C01: "All IDs are UUIDs except baseline item keys, which use the existing 006 key grammar; revision numbers and expected versions are positive integers, digests are 64 lowercase hex characters, request keys are UUIDs, and every mutation rejects unknown fields and requires an exact current version plus a 1–2000-character rationale for review decisions." (FR-001, FR-003, FR-022)

- [X] T011 Implement ordered transaction helpers, normalized digests, exact-key receipts, atomic rates and two-retry DB-only limit in `lib/server/execution/commands.ts` and `lib/server/execution/locks.ts`; add receipt lookup in `app/api/execution/receipts/[requestKey]/route.ts`, current-authority replay and metadata-only errors/telemetry. (FR-001, FR-007, FR-022)

- [X] T012 Implement `lib/server/execution/sources.ts` and `lib/server/execution/projection.ts` with exact source lineage/review eligibility, author/reviewer pending isolation, partner delivery projection, no raw-other-time data and reverse dependency invalidation; authoritative reads must not rely on cleanup timing. (FR-017, FR-018, SC-002)

- [X] T013 Implement strict transport/error/preview/cursor infrastructure in `lib/server/execution/http.ts` and `lib/server/execution/previews.ts`, including all API rate buckets and no-store responses. C11: "List page size is 1–50, execution view periods are 1–91 inclusive dates, JSON command bodies are at most 128 KiB, read responses at most 256 KiB, record history at most 50 revisions per page, review previews expire after 5 minutes, cursor tokens expire after 10 minutes, and list/snapshot overflow returns an explicit error rather than silently omitting eligible data." (FR-019, FR-022)

**Checkpoint**: Complete this phase’s relevant checks before advancing dependent work.

## Phase 3: User Story 1 — Evidence-backed execution (P1, MVP)

**Goal**: Establish reviewed activities and explicit milestone decisions on an accepted plan.

**Independent verification**: Through governed 006 commands accept a plan, setup execution twice, review an activity and accept a milestone with exact evidence; withdraw its source and verify review-required projection.

- [X] T014 [P] [US1] Write setup/activity/review/state-transition/source-withdrawal races in `tests/integration/execution-records.test.ts` and `tests/integration/execution-milestones.test.ts`; pending corrections must leave old acceptance intact and stale exact reviews must roll back. (FR-002, FR-003, FR-004, FR-017)

- [X] T015 [P] [US1] Write role-filtered records/history/overview and contributor-versus-reviewer route contracts in `tests/contracts/execution-record-api.test.ts`; assert hidden IDs/counts/text never leak through errors or receipts. (FR-001, FR-003, FR-018, SC-002)

- [X] T016 [US1] Implement idempotent accepted-baseline setup, exact 006 string item keys and current-pointer mismatch detection in `lib/server/execution/baselines.ts`; materialize immutable identities with purgeable source-linked titles, no setup-on-GET. (FR-002)

- [X] T017 [US1] Implement immutable activity draft/revise/submit headers, payloads, source links and pending/accepted heads in `lib/server/execution/records.ts`. C02: "Record kind is activity, raid, decision, scope_change, effort_budget, estimate, handoff, closeout or outcome; title is 1–200 characters, narrative is 1–8000 characters, audience is internal or delivery, references are 0–20 exact eligible source revisions, optional work-package and 0–20 milestone links use keys from the same bound baseline, and record state is draft, submitted, accepted, rejected, superseded or retracted." C03: "Execution date strings are real ISO calendar dates; event timestamps are UTC instants; evidence event dates cannot be future dates in their declared IANA timezone; planned dates may be future; owner membership is nullable with a required 1–500-character unknown-owner reason, and any selected owner must be active in the same workspace with current access to the customer." (FR-003, FR-017)

- [X] T018 [US1] Implement exact preview-bound accept/reject/retract and revision supersession in `lib/server/execution/review.ts`; record actor/rationale/source snapshot, forbid broader audience than evidence, preserve profile approval separation and review self-submissions only as mcteer. (FR-003, FR-009, FR-017)

- [X] T019 [US1] Implement reviewed milestone transitions and date/owner/request-review activity subtypes in `lib/server/execution/milestones.ts`. C04: "Milestone identity is an exact accepted baseline plus milestone key; status is not_started, in_progress, blocked, ready_for_review, accepted or waived; decisions are start, block, resume, request_review, accept, waive or reopen; accept requires 1–20 eligible reviewed evidence references and waiver requires a 1–2000-character rationale; changing owner or planned date creates a reviewed execution revision without altering the plan baseline." Enforce the transition table and review_required overlay from `data-model.md`, including no hours-derived completion. (FR-004, FR-014)

- [X] T020 [US1] Implement execution metadata/record/review reads and setup/record/milestone adapters in `app/api/execution/engagements/[engagementId]/route.ts`, `app/api/execution/engagements/[engagementId]/records/route.ts`, `app/api/execution/engagements/[engagementId]/review/route.ts`, `app/api/execution/engagements/[engagementId]/preview/route.ts` and `app/api/execution/engagements/[engagementId]/commands/route.ts` using the shared domain. (FR-002, FR-003, FR-004)

- [X] T021 [US1] Implement `app/_components/execution/client.ts` and `tests/unit/execution-client.test.ts` for per-action request keys, unknown acknowledgement/receipt polling, stale-response suppression, five-second visible eligibility refresh, focus revalidation and authority/source clearing with safe dirty-draft preservation. (FR-019, FR-022)

- [X] T022 [US1] Add `app/(workspace)/customers/[customerId]/engagements/[engagementId]/execution/page.tsx`, link it from the existing engagement page and implement `app/_components/execution/overview.tsx`, `app/_components/execution/records.tsx`, `app/_components/execution/milestones.tsx` and `app/_components/execution/review.tsx` following role/state/accessibility contracts. (FR-019)

- [X] T023 [US1] Build the governed synthetic journey seed in `tests/fixtures/execution/journey.ts` using real reviewed source/artifact/profile and 006 acceptance paths; write CLI WebKit activity/milestone/denial/stale-preview/unknown-save cases in `tests/ui/execution-records.spec.ts` with keyboard/axe/screenshot evidence. (FR-024, SC-001, SC-002, SC-007)

- [X] T024 [US1] Add `scripts/check-execution-ui.ts` with strict four-project discovery/execution/digest completeness, private evidence and no skips/retries; isolate 008 from legacy selectors in `playwright.config.ts`. Run focused US1 domain/API/UI checks and record actual results in `specs/008-engagement-execution/validation.md`. (FR-024, SC-007)

**Checkpoint**: Complete this phase’s relevant checks before advancing dependent work.

## Phase 4: User Story 2 — Approved actual time (P1)

**Goal**: Count attributable daily effort exactly once without exposing private time.

**Independent verification**: A linked allocated resource submits time, mcteer approves/corrects/reverses it; concurrent cross-customer first approvals cannot exceed 1440 or partially commit.

- [X] T025 [P] [US2] Write author/subject/reviewer/partner time contracts and date/minute/exception boundaries in `tests/contracts/execution-time-api.test.ts`; future dates, unlinked contributors and raw-other-time reads fail, authorized on-behalf inactive-resource entry is attributable. (FR-005, FR-006, FR-018, SC-002)

- [X] T026 [P] [US2] Write atomic batch/first-write/correction/reversal/date-resource-move/source-change/replay races in `tests/integration/execution-time.test.ts` and `tests/integration/execution-time-races.test.ts`, including rollback after ledger writes, 1440 cross-customer ceiling and changed grant after approval. (FR-007, FR-008, SC-003)

- [X] T027 [US2] Implement strict time draft/revision/submission and captured resource/date timezone identity in `lib/server/execution/time.ts` and `lib/server/execution/time-schema.ts`. C05: "Time revision includes resource ID, author membership ID, exact baseline/work-package key, service date, resolved IANA timezone and timezone-data version, 1–1440 integer minutes, billable boolean, one activity revision ID, optional allocation revision ID, and a 1–2000-character private note; on-behalf entry and each unplanned, over-capacity, unknown-capacity, unavailable-source or post-closeout exception require separate 1–2000-character reviewer rationale." Enforce future-date rejection, immutable author/subject attribution and reviewer-only on-behalf exceptions. (FR-005, FR-006, FR-008)

- [X] T028 [US2] Implement actual contribution and stable resource/day lock union in `lib/server/execution/time-ledger.ts`. C06: "Time state is draft, submitted, approved, rejected, superseded or reversed; only one approved revision per entry counts; approval batches contain 1–25 distinct entry/revision pairs and are atomic; approved daily minutes across all customers cannot exceed 1440 for one resource and service-date key; an exact correction replaces the old counted revision in the same transaction." Preserve old counted approval during pending correction; reversal debits once and corrections update both resource/date and engagement generations atomically. (FR-007, SC-003)

- [X] T029 [US2] Implement exact atomic review and per-row unplanned/over-capacity/unknown-capacity/unavailable-source/post-closeout rationale in `lib/server/execution/time-review.ts`; reuse 007 allocation/calendar checks without erasing actuals or its 960 planned limit, enforce canonical day timezone, approved-calendar or reviewer-confirmed missing-calendar resolution, revised entry on timezone mismatch and numeric-only source exception. (FR-006, FR-007, FR-008)

- [X] T030 [US2] Add scoped time reads in `app/api/execution/engagements/[engagementId]/time/route.ts`, extend shared preview/command/review routes for time batches and safe receipt projections, and retain permitted numerical actuals after source/resource/grant changes in `lib/server/execution/projection.ts`. (FR-007, FR-008, FR-018)

- [X] T031 [US2] Implement owned time editor/history and reviewer on-behalf/batch/exception/correction/reversal flows in `app/_components/execution/time.tsx` and `app/_components/execution/review.tsx`; no approved-entry delete, no other-contributor raw detail. (FR-005, FR-007, FR-018, FR-019)

- [X] T032 [US2] Extend governed journey fixtures with 007 reviewed resource/calendar/confirmed allocation and write `tests/ui/execution-time.spec.ts` for submission→review→correction/reversal, lost acknowledgement, partner/subject privacy and rendered revocation. Run US2 focused checks and log results in `specs/008-engagement-execution/validation.md`. (FR-024, SC-001, SC-002, SC-003, SC-007)

**Checkpoint**: Complete this phase’s relevant checks before advancing dependent work.

## Phase 5: User Story 3 — Reviewed registers and changes (P1)

**Goal**: Keep concerns and decisions current while preserving exact historical baselines.

**Independent verification**: Review a RAID item and decision, approve a change for planning, accept a replacement through 006 and reconcile every key without copying completion or actuals.

- [ ] T033 [P] [US3] Write RAID lifecycle/decision supersession/change review API cases in `tests/contracts/execution-register-api.test.ts` and baseline replacement/mapping/source-head races in `tests/integration/execution-reconciliation.test.ts`; pending change never edits 006/007 decisions. (FR-009, FR-010, FR-017)

- [ ] T034 [US3] Implement strict RAID and decision payloads/reviewed open-close-reopen/supersession in `lib/server/execution/registers.ts`. C07: "RAID type is risk, assumption, issue or dependency; status is open, monitoring, resolved or accepted_exception; severity is low, medium, high or critical; each item has a due/review date or explicit unknown-date reason, an owner or unknown-owner reason, and closure requires reviewed evidence or an explicit accepted-exception rationale; decision records contain decision date, decider, rationale and optional 1–20 superseded decision IDs." Retain assumption uncertainty and forbid silent profile-claim acceptance. (FR-009)

- [ ] T035 [US3] Implement scope-change proposals and exact implemented-state validation in `lib/server/execution/change-schema.ts` and `lib/server/execution/registers.ts`. C08: "Scope-change state is proposed, approved_for_planning, rejected, implemented or withdrawn; its exact old baseline is mandatory, replacement baseline is optional until implementation, and reconciliation maps each old work-package/milestone key once to one new key or retired while each new key is mapped once or added; many-to-one and one-to-many mappings are rejected in version 1." approved_for_planning cannot change baseline, allocations or commercial commitments. (FR-010)

- [ ] T036 [US3] Implement complete one-to-one/retired/added reconciliation and historical mapping chains in `lib/server/execution/reconciliation.ts`; lock both baseline/source unions, retain original minutes, invalidate carried milestone acceptance/ETC/closeout and refuse unmapped or multiply mapped keys. (FR-002, FR-010, FR-012)

- [ ] T037 [US3] Connect typed register review and baseline.reconcile to `lib/server/execution/review.ts` and `app/api/execution/engagements/[engagementId]/commands/route.ts`; expose safe exact mapping previews and current-pointer review-required projection. (FR-009, FR-010, FR-017)

- [ ] T038 [US3] Implement RAID/decision/scope proposal and explicit mapping views in `app/_components/execution/changes.tsx`, linking existing 006 plan acceptance and showing retired/unmapped history without implied completion. (FR-009, FR-010, FR-019)

- [ ] T039 [US3] Write `tests/ui/execution-changes.spec.ts` for reviewed registers, replacement/reconciliation, stale previews and partner projection; run US3 contract/integration/browser checks and record actual evidence in `specs/008-engagement-execution/validation.md`. (FR-024, SC-002, SC-007)

**Checkpoint**: Complete this phase’s relevant checks before advancing dependent work.

## Phase 6: User Story 4 — Forecast, handoff and outcomes (P2)

**Goal**: Produce exact approved effort summaries and an evidence-backed closeout.

**Independent verification**: Independent oracle matches actual/ETC/forecast/variance/utilization; missing acknowledgement or pending time blocks closeout; accepted late corrections require new review.

- [ ] T040 [P] [US4] Create independent hand-calculated vectors in `tests/fixtures/execution/arithmetic.ts` and `tests/unit/execution-calculations.test.ts` for every calculations-contract boundary, including period versus lifetime, BigInt serialization, day 7/day 8 freshness, new actuals, mapped/retired history and DST/timezone/zero/missing/rounding. (FR-011, FR-012, FR-013, SC-004)

- [ ] T041 [P] [US4] Write strict forecast/handoff/outcome API and closure/late-change/source-withdrawal tests in `tests/contracts/execution-summary-api.test.ts` and `tests/integration/execution-handoff.test.ts`; missing receiver evidence, unresolved blockers or submitted time cannot be bypassed. (FR-014, FR-015, FR-016, FR-017)

- [ ] T042 [US4] Implement reviewed point-budget and remaining-estimate schemas/heads in `lib/server/execution/effort.ts`. C09: "Effort budgets and estimates are whole integer minutes from 0 to 6000000 per work package; budgets bind an exact baseline/work-package key, estimates add an as-of UTC instant and explicit zero-remaining assertion when zero; estimates older than 7 UTC calendar days or preceding a current baseline reconciliation are stale; missing or stale inputs yield incomplete forecast values." Also invalidate estimates on newly approved actual mutation after their entered as-of instant, preserve 006 ranges as provenance and never infer a point or zero. (FR-011, FR-012)

- [ ] T043 [US4] Implement integer-minute actual/planned/remaining/forecast/variance and reviewer-only actual utilization in `lib/execution/calculations.ts` with governed input selection in `lib/server/execution/calculations.ts` using `execution-effort-v1`; enforce complete snapshot/generation scope, independent actual ledger, coverage/null semantics and no double subtraction of protected time. (FR-012, FR-013, SC-004)

- [ ] T044 [US4] Implement reviewed status/counts/blockers/overdue/evidence-age/latest-activity in `lib/server/execution/summary.ts`, with source/baseline review_required overlays, explicit unknowns and no percentage/maturity inference. (FR-014, FR-017)

- [ ] T045 [US4] Implement strict handoff/closeout/outcome schemas and record review in `lib/server/execution/handoff.ts`. C10: "Handoff/closeout records contain 1–50 deliverable/criterion references, receiver kind internal or external, a 1–200-character receiver label in private payload, acknowledgement state not_recorded or recorded with an event date and eligible evidence when recorded, 0–50 open-obligation IDs; outcome records have status observed, not_measured or inconclusive, and outcome decimal values are signed strings with at most 12 integral and 6 fractional digits, measure/unit are 1–80 characters, and measurement start is not after end. Observed outcomes require a current measured value, measure/unit, ordered measurement window and 1–20 eligible evidence references; baseline/comparison values may be null only with a 1–2000-character unknown reason; not_measured/inconclusive outcomes require a 1–2000-character limitation reason and must not invent values or dates." Outcomes preserve comparison/baseline unknowns, limitations and owner; no maturity/commercial/shared-knowledge side effects. (FR-015, FR-016)

- [ ] T046 [US4] Implement closeout exact-input preview and gate/reclose invalidation in `lib/server/execution/closeout.ts`: accepted/waived milestones, resolved/accepted-exception high/critical concerns, zero pending submitted time/corrections and accepted evidenced acknowledgement; later accepted execution/time/source changes require new review. (FR-015, FR-017)

- [ ] T047 [US4] Expose `app/api/execution/engagements/[engagementId]/summary/route.ts` and `app/api/execution/utilization/route.ts`, extend common typed record commands/reviews and add consistent input-version/calculation receipts in `lib/server/execution/summary.ts`; enforce reviewer-only resource utilization and projection-safe engagement totals. (FR-011, FR-012, FR-013, FR-018)

- [ ] T048 [US4] Implement `app/_components/execution/forecast.tsx` and `app/_components/execution/handoff.tsx` with exact units/as-of/coverage, missing/stale/unmapped states, receiver record versus signature distinction, closeout blockers and measured/unknown outcomes. (FR-019)

- [ ] T049 [US4] Write full governed journey in `tests/integration/execution-journey.test.ts` and browser forecast/handoff/closeout/late-change cases in `tests/ui/execution-handoff.spec.ts`; run US4 oracle/domain/API/browser checks and record results in `specs/008-engagement-execution/validation.md`. (FR-024, SC-001, SC-004, SC-007)

**Checkpoint**: Complete this phase’s relevant checks before advancing dependent work.

## Phase 7: User Story 5 — Governed Turi explanations (P2)

**Goal**: Explain one reviewed engagement with bounded read-only native execution.

**Independent verification**: Eight synthetic native lifecycle cases enforce isolation/fences/budgets; later live captured outputs meet the rubric without automatic paid retry.

- [ ] T050 [P] [US5] Write mutual binding race/tool catalog/strict allowlist and admitted context quota tests in `tests/contracts/execution-advice-api.test.ts` and `tests/unit/execution-tool-contracts.test.ts`, covering generic-tool fallthrough, populated/research conversations and mixed features in both directions. (FR-020, FR-021)

- [ ] T051 [P] [US5] Write native dispatch/chunk/history/reconnect/replay/dependency/rate/cancel/disable/restart/unknown-usage cases in `tests/integration/execution-native.test.ts` using `tests/fixtures/execution/native.ts`; instrument actual native provider IO bounds and no second paid turn, not only wrapper mocks. (FR-021, FR-022, SC-008)

- [ ] T052 [US5] Implement shared server-owned discriminator in `lib/server/conversations/feature.ts`, exact fresh binding/admission in `lib/server/execution/advisory.ts` and `migrations/038-execution-advice-lifecycle.cjs` mutual guards; update existing planning/staffing/research binders to reject execution under the same conversation lock. C12: "Advice binds one fresh internal conversation to one engagement and active baseline, one 1–91-date period and one execution generation; limits are 6 provider steps, 6 tool reads, 4096 output tokens per step, 120 seconds, 24576 cumulative UTF-8 bytes across initial context, tools and procedure loads, 200 dependency identities and 5 admissions per hour per membership; settlement remains available after cancellation, revocation and disable without releasing content." (FR-020, FR-021, FR-022)

- [ ] T053 [US5] Implement bounded accepted initial context/dependency closure in `lib/server/execution/initial-context.ts` and `lib/server/execution/dependencies.ts`, including collection/absence generations, exact source reviews, baseline/reconciliation, actual/ETC/calendar inputs and procedure version. (FR-017, FR-020, FR-021)

- [ ] T054 [US5] Implement three bound execution reads and budgets in `lib/server/execution/tools.ts` and `lib/server/execution/read-budget.ts`; integrate the internal admitted context path with `lib/server/profiles/attempt-context.ts`, `lib/server/profiles/tool-actor.ts`, `lib/server/profiles/context.ts` and `lib/server/profiles/read.ts` without caller-controlled bypass or unrelated profile quota exhaustion. (FR-020, FR-021, FR-022)

- [ ] T055 [US5] Add `agent/tools/execution_summary.ts`, `agent/tools/execution_records.ts`, `agent/tools/execution_effort.ts`, `agent/instructions/execution-context.ts` and `agent/skills/execution-explanation/SKILL.md`; use feature-aware hook/instruction/tool selection in `agent/hooks/guard-customer-context.ts`, `agent/instructions/customer-context.ts`, `agent/instructions/staffing-context.ts` and all existing dynamic tool catalogs including `agent/tools/load_skill.ts`, retain model selection and deny all generic/write/research/file paths. (FR-020, FR-021)

- [ ] T056 [US5] Implement durable native admission/dispatch/step-budget checks in `lib/server/execution/native-admission.ts` and `lib/server/execution/native-dispatch.ts`; implement the tagged shared dispatcher in `lib/server/conversations/model-admission.ts` and narrow existing staffing-named adapters in `lib/server/staffing/native-context.ts`, `lib/server/staffing/native-admission.ts`, `lib/server/staffing/model-budget.ts` and `lib/server/staffing/context.ts` per research R06, preserving `agent/agent.ts` unchanged; route via the discriminator in `lib/server/conversations/dispatch.ts`, reserve actual provider steps and enforce120 seconds/4096 output/6 steps with no paid retry. (FR-021, FR-022)

- [ ] T057 [US5] Implement native release/settlement in `lib/server/execution/native-release.ts` and `lib/server/execution/native-reconcile.ts`; wire current authority/dependency fences through `lib/server/conversations/context-fence.ts`, `lib/server/conversations/eve-routes.ts`, `lib/server/conversations/projection.ts`, `lib/server/conversations/repository.ts` and `lib/server/conversations/reconcile.ts`, including metadata-only finalization after denial and null unknown usage. (FR-017, FR-021, FR-022)

- [ ] T058 [US5] Add `app/api/execution/engagements/[engagementId]/advice/route.ts` and `app/_components/execution/advisory.tsx`, integrate existing owned conversation cancel/history/reconnect without redispatch and write `tests/ui/execution-advisory.spec.ts` for withdrawal, cancel, denied replay and pending/unconfirmed states. (FR-019, FR-020, FR-021, SC-007)

- [ ] T059 [US5] Implement exact leased payload cleanup/source invalidation/advice maintenance in `lib/server/execution/maintenance.ts`, wire bounded 100-job ticks into `scripts/maintenance-worker.ts` and existing conversation maintenance; enforce 30-day ineligible payload retention without purging numeric audit or newer revisions. Test paused cleanup/lease replacement in `tests/integration/execution-lifecycle.test.ts`. (FR-017, FR-022, SC-008)

- [ ] T060 [US5] Implement synthetic E01–E08 live fixture scenarios in `tests/fixtures/execution/advisory.ts`, actual native output capture/preflight verification/20-minute/eight-turn limits in `scripts/eval-execution.ts`, and a digest-bound independently reviewed rubric verifier in `scripts/verify-execution-review.ts`; retain failed/pending evidence and no automatic retry. (FR-024, SC-006)

- [ ] T061 [US5] Add budget/capture/verifier/redacted telemetry boundary tests in `tests/unit/execution-evaluation.test.ts` and `tests/integration/execution-telemetry.test.ts`; run complete fake-provider US5 checks and record native request/settlement evidence in `specs/008-engagement-execution/validation.md` before any paid evaluation. (FR-021, FR-022, FR-024, SC-006, SC-008)

**Checkpoint**: Complete this phase’s relevant checks before advancing dependent work.

## Phase 8: Cross-cutting validation and delivery

**Goal**: Complete every mandatory gate and report scope accurately.

**Independent verification**: All discovered suites/cases pass, live captures are reviewed, representative p95 gates and recovery pass, and no hosted claim is inferred.

- [ ] T062 [P] Implement owned affected 002–007 regression command in `scripts/test-execution-regressions.ts`; update exclusions and scripts in `package.json` and CI in `.github/workflows/ci.yml` so every execution suite is owned and existing access/source/plan/staffing/native suites still run with correct schema fixtures. (FR-023, FR-024, SC-002, SC-008)

- [ ] T063 [P] Implement representative eight-class load runner in `scripts/benchmark-execution.ts` using the exact quickstart dataset/sample/concurrency/warmup/rate-preserving workload; assert per-class p95≤2s and zero correctness failures, with complete query results and redacted private evidence. (FR-022, FR-024, SC-005)

- [ ] T064 [P] Implement paired DB/artifact/Eve interruption/restore drill in `scripts/execution-recovery-check.ts` and `tests/integration/execution-recovery.test.ts`; cover lost acknowledgement, moved-time correction, newer payload versus leased purge, source/baseline changes, dispatch/cancel/disable and unknown settlement without redispatch. (FR-017, FR-022, FR-023, SC-008)

- [ ] T065 Run `npm run test:execution` and `npm run test:execution:regressions`; verify complete manifest/report counts, strict source digest and empty/034 role gates; resolve failures and record actual results in `specs/008-engagement-execution/validation.md`. (FR-024, SC-001, SC-002, SC-003, SC-004, SC-008)

- [ ] T066 Run the complete `npm run execution:ui:check`, inspect four-project visual captures, keyboard/axe/revocation and390 px cases, resolve failures and record matrix completion evidence in `specs/008-engagement-execution/validation.md`. (FR-019, FR-024, SC-007)

- [ ] T067 Run `npm run benchmark:execution` and `npm run execution:recovery:check`; record actual per-class p95/sample/dataset and matched-state cleanup evidence in `specs/008-engagement-execution/validation.md`; failures cannot be replaced by narrow passing subsets. (FR-023, FR-024, SC-005, SC-008)

- [ ] T068 Run typecheck, Eve/web builds, docs consistency and diff checks per `quickstart.md`; bind passing deterministic/UI/recovery/load evidence to the same source digest in `specs/008-engagement-execution/validation.md` before live admission. (FR-024)

- [ ] T069 Explicitly run E01–E08 via `npm run eval:execution -- --live` with the live opt-in, inspect every actual capture against independent evidence/numbers, complete and verify the separate private digest-bound review, and record results/limitations in `specs/008-engagement-execution/validation.md`; no fabricated scores or automatic paid retry. (FR-024, SC-006)

- [ ] T070 After all disposable gates pass, inspect Preview fresh using `scripts/inspect-preview-db.mjs`; only for the confirmed expected marker/schema explicitly apply 036–038 and roles, reinspect and run non-destructive local readiness smoke; stop on mismatch, exclude Production/Vercel deployment and record actual versions in `specs/008-engagement-execution/validation.md`. (FR-023)

- [ ] T071 Update `README.md`, `ROADMAP.md`, `specs/008-engagement-execution/spec.md`, `specs/008-engagement-execution/tasks.md` and `specs/008-engagement-execution/validation.md` with implemented scope, actual checks, remaining limits and rollback/disable guidance; check off only proven tasks and prepare the reviewable implementation PR without merging. (FR-024)

**Checkpoint**: Complete this phase’s relevant checks before advancing dependent work.

## Dependencies and execution order

```text
Setup → Foundation → US1 → US2 → US3 → US4 → US5 → Cross-cutting gates
```

All stories require the foundation. US2 uses reviewed US1 activities; US3 validates
history with US2 actuals; US4 needs the actual/reconciliation inputs; US5 explains
US1–US4. A story is independently testable using the earlier governed fixture; it
does not require a later story. Common review dispatch must reject not-yet-implemented
record kinds, never silently accept an incomplete handler. Foundation schema may
include later tables while routes remain unavailable until their story passes.

Within each phase: independent test authoring can overlap, then schema/model,
domain/review, routes, UI, integration and evidence. Only phase-local `[P]` tasks
may overlap after prior phases finish. Migration manifest, shared command/review
routers, fixture lifecycle and package/CI edits must be serialized. Cross-cutting
runner authoring may overlap after all stories; gate execution is ordered, and
live admission requires all prior gates at the same source digest. If code changes,
refresh affected evidence and the complete required live preflight binding.

## Parallel examples per story

- US1: records/milestone integration tests and role/projection API tests use different
  files and can be authored together after foundation.
- US2: subject/privacy API cases and ledger race integration cases can be authored
  together after US1; ledger and review implementations remain sequential.
- US3: no implementation tasks are marked parallel because register/change/review
  paths are shared. A future split may author register API and reconciliation tests
  in the two distinct files of its first task, before changing either service.
- US4: independent arithmetic corpus and handoff/API cases can be authored together
  after US3; closeout implementation waits for summary and handoff semantics.
- US5: feature/tool contract cases and native lifecycle cases can be authored together
  after US4; shared discriminator/binders must land before dispatch/release work.

## Implementation strategy

The smallest demonstrable increment is setup + foundation + US1. Validate that
increment locally, then add each remaining story in order. This is not an 008
completion claim: all five stories, representative load, actual-output evaluation,
recovery and required rollout evidence must pass before marking 008 implemented.
No deployment is part of the increment or the completed slice. The user requested
this planning handoff specifically to switch models before `$speckit-implement`.

## Requirement coverage index

This table maps planned work, not completed checks. Every buildable FR/SC has an
implementation or verification task; each task names at least one requirement.

| Requirement | Task IDs |
| --- | --- |
| FR-001 | T005, T009, T010, T011, T015 |
| FR-002 | T006, T014, T016, T020, T036 |
| FR-003 | T006, T010, T014, T015, T017, T018, T020 |
| FR-004 | T014, T019, T020 |
| FR-005 | T009, T025, T027, T031 |
| FR-006 | T025, T027, T029 |
| FR-007 | T007, T011, T026, T028, T029, T030, T031 |
| FR-008 | T026, T027, T029, T030 |
| FR-009 | T018, T033, T034, T037, T038 |
| FR-010 | T033, T035, T036, T037, T038 |
| FR-011 | T040, T042, T047 |
| FR-012 | T007, T036, T040, T042, T043, T047 |
| FR-013 | T040, T043, T047 |
| FR-014 | T019, T041, T044 |
| FR-015 | T041, T045, T046 |
| FR-016 | T041, T045 |
| FR-017 | T006, T012, T014, T017, T018, T033, T037, T041, T044, T046, T053, T057, T059, T064 |
| FR-018 | T005, T009, T012, T015, T025, T030, T031, T047 |
| FR-019 | T013, T021, T022, T031, T038, T048, T058, T066 |
| FR-020 | T050, T052, T053, T054, T055, T058 |
| FR-021 | T007, T050, T051, T052, T053, T054, T055, T056, T057, T058, T061 |
| FR-022 | T005, T008, T010, T011, T013, T021, T051, T052, T054, T056, T057, T059, T061, T063, T064 |
| FR-023 | T001, T002, T004, T006, T007, T008, T062, T064, T067, T070 |
| FR-024 | T001, T003, T023, T024, T032, T039, T049, T060, T061, T062, T063, T065, T066, T067, T068, T069, T071 |
| SC-001 | T023, T032, T049, T065 |
| SC-002 | T005, T012, T015, T023, T025, T032, T039, T062, T065 |
| SC-003 | T026, T028, T032, T065 |
| SC-004 | T040, T043, T049, T065 |
| SC-005 | T063, T067 |
| SC-006 | T060, T061, T069 |
| SC-007 | T023, T024, T032, T039, T049, T058, T066 |
| SC-008 | T002, T004, T051, T059, T061, T062, T064, T065, T067 |

## Planning totals

71 tasks; Shared: 23, US1: 11, US2: 8, US3: 7, US4: 10, US5: 12. 14 tasks permit phase-local parallel authoring.
All task IDs are sequential; every story task has its story label and every task names concrete file paths. No runtime check was run during task generation.
