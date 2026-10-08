# Tasks: TAM and Support Guidance

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md), [data model](data-model.md), [contracts](contracts/support-api.md).
**Status**: Implementation and local acceptance complete; published-head CI guards merge. Evidence is recorded in validation.md.
**Tests**: Required by FR-022 and the constitution for authorization, source lifecycle, state, native behavior, migrations and UI. Write meaningful failure cases before the corresponding behavior; avoid assertions that merely mirror implementation.
**Format**: `- [ ] Tnnn [P?] [USn?] Action with concrete path`. `[P]` means separate files and no dependency on unfinished tasks in the stated group, not permission to skip prerequisites.

## Phase 1 — Setup

- [X] T001 Preserve the current dirty main checkout; create `010-tam-support-guidance` from current committed main in an isolated worktree, check number availability, copy the staged planning directory into `specs/010-tam-support-guidance/`, set `SPECIFY_FEATURE_DIRECTORY`, run repository prerequisite/docs/analyze checks and follow `specs/010-tam-support-guidance/handoff.md` before code. Do not import uncommitted reporting or tooling changes. (FR-021, FR-024)
- [X] T002 Establish the owned synthetic environment in `scripts/support-eval-environment.ts` and `tests/fixtures/support/environment.ts` using shared clone primitives, pinned Node 24 and guarded markers; add feature 010 typing to `scripts/plan-eval-environment.ts` and capture the unchanged root `agent/agent.ts` digest. Add fixture builders in `tests/fixtures/support/seed.ts`; database operations remain blocked until migration setup is present. (FR-021, FR-022)

## Phase 2 — Foundation

- [X] T003 Define versioned strict types in `lib/contracts/support.ts` and `lib/server/support/schema.ts`: C02 "Trimmed titles are 1–200 characters; rationale and desired outcome are 1–2,000; validation criterion is 1–2,000; owner/role labels are 1–200; unknown reasons are 1–500; requests are at most 65,536 UTF-8 bytes and reject unknown fields." C03 "Observation/completion dates are valid ISO dates no later than today in a valid IANA timezone; next-review/revisit dates are valid ISO dates after observation; handoff timestamps cannot be future dated." C05 "Select 0–10 distinct same-customer engagements, 0–20 distinct direct source revisions and at most 200 transitive dependencies; list limits are integers 1–50, default 20." (FR-005, FR-008, FR-014, FR-018)
- [X] T004 Create additive `migrations/042-support-guidance.cjs`, update `migrations/manifest.json` and `scripts/db-role-setup.sql`, and enforce C01 "Scope and record IDs are UUIDs; scope uniqueness is environment/workspace/customer/workload with null workloads equal; audience is immutable internal or delivery." Include immutable revisions, purgeable content/decision payloads, source edges, command receipts, constrained heads, indexed fanout and exact-lease cleanup functions. Recheck migration number availability; never modify 001–041. (FR-001, FR-014, FR-019, FR-021)
- [X] T005 Implement `lib/server/support/policy.ts` and `commands.ts` with live actor/customer authority, canonical mcteer review, panel own-draft proposals, partner accepted-delivery reads and actor-scoped transaction/replay receipts. Enforce C10 "Commands require UUID requestKey and integer expectedVersion ≥0; review additionally requires exact revisionId and sourceDigest; same key/different digest conflicts." Follow the existing authority/source/engagement/support lock order. (FR-002, FR-003, FR-014)
- [X] T006 Implement `lib/server/support/sources.ts` as adapters over current profile/plan/retrieval/execution eligibility, exact locators and bounded original-source closure; support zero engagements, same-customer selected engagement sets, workload restrictions, maturity profile references, audience-first retrieval and source/collection generations. Keep pending user claims on the existing review path. (FR-004, FR-007, FR-012, FR-013, FR-018)
- [X] T007 Implement `lib/server/support/repository.ts`, core revision/receipt helpers and empty-scope reads; keep titles/rationale/owner labels/URLs in purgeable payloads and immutable-audience records, with separate accepted/working heads and source-qualified permitted history. Scope creation occurs only inside an explicit save/prepare command. (FR-001, FR-004, FR-014, FR-019)
- [X] T008 Verify foundation behavior in `tests/contracts/support-schema.test.ts` and `tests/integration/support-policy.test.ts`: all C01/C02/C03/C05/C10 boundaries, alternate admin denied review, cross-workspace/environment/customer/owner denial, audience leakage, pending-source refusal, duplicate key, concurrency and runtime-role payload mutation denial. Execute against the owned fixture. (FR-002, FR-003, FR-004, FR-012, FR-014, FR-018, FR-022; SC-002, SC-003)

## Phase 3 — US1: Support Readiness (P1, MVP)

**Goal**: Useful reviewed customer/workload readiness without a model call.
**Independent test**: Six checks, exact mcteer acceptance, panel denial, partner assigned delivery projection, no-engagement and withdrawn-source cases.

- [X] T009 [P] [US1] Add independent precedence/date/missing-input vectors in `tests/unit/support-readiness.test.ts`, including C04 "Each assessment contains exactly the six distinct readiness keys; status is ready, gap, unknown or not_applicable; ready/gap require at least one eligible supporting reference." Cover all-not-applicable, overdue, changed sources and no accepted assessment. (FR-005, FR-006)
- [X] T010 [US1] Implement `lib/support/readiness.ts`, `lib/server/support/service.ts`, `review.ts` and `projection.ts`: deterministic effective readiness, exact source-digest review, separate accepted/draft views and maturity/engagement context; rejection/withdrawal remain possible with a fresh unavailable-source metadata preview. (FR-001, FR-005, FR-006, FR-007, FR-013, FR-014)
- [X] T011 [US1] Implement authenticated no-store handlers at `app/api/support/customers/[customerId]/route.ts`, `preview/route.ts`, `commands/route.ts` and `app/api/support/receipts/[requestKey]/route.ts`, with shared `lib/server/support/http.ts`; cover bounded body/query parsing, signed scope/filter/generation cursors, error categories and current-authorized receipt lookup. (FR-002, FR-014, FR-017, FR-018)
- [X] T012 [US1] Add `app/(workspace)/customers/[customerId]/support/page.tsx` and `app/_components/support/workspace.tsx` plus `readiness.tsx`; add a customer-detail navigation link using the existing customer component, audience-specific source selection, missing-context states and exact review UI following `contracts/support-ui.md`. (FR-001, FR-003, FR-004, FR-005, FR-006, FR-007, FR-017)
- [X] T013 [US1] Execute readiness HTTP/domain and browser cases in `tests/integration/support-readiness.test.ts`, `tests/contracts/support-http.test.ts` and `tests/ui/support-readiness.spec.ts`; verify scope independence, mature customer with readiness gaps, no engagement, stale acceptance, internal/delivery split and assigned/revoked partner behavior. (FR-001–FR-007, FR-012, FR-013, FR-017; SC-001, SC-002, SC-006)

## Phase 4 — US2: Owned Actions and Dispositions (P1)

**Goal**: Evidence-backed accepted actions whose changes have accountable human review.
**Independent test**: Seed accepted readiness, propose/accept action changes, reconcile lost response, complete with evidence and reopen.

- [X] T014 [P] [US2] Define transition/receipt boundary tests in `tests/integration/support-actions.test.ts`: proposed completed versus accepted open, invalid owner, defer/revisit, evidence-free completion, blocked/dismissed/reopen rationale, simultaneous review and source changes. (FR-008, FR-009, FR-014; SC-003)
- [X] T015 [US2] Implement action revision validation in `lib/server/support/actions.ts`: C06 "Owner is exactly one of eligible membership, evidenced customer role or unassigned with a reason; an owner selection never grants authority." C07 "Disposition is open, in_progress, blocked, deferred, completed or dismissed; deferred requires revisitDate; blocked/dismissed/reopening require rationale; completed requires completedDate and at least one eligible dated outcome source." Preserve original source lineage and accepted head until review. (FR-008, FR-009, FR-012, FR-014)
- [X] T016 [US2] Add proposed action/detail/history and disposition forms in `app/_components/support/actions.tsx`; connect `save_action` and review through the existing support command handler, explicit review-date/source controls, and same-key receipt reconciliation for unknown saves. (FR-008, FR-009, FR-014, FR-017)
- [X] T017 [US2] Extend `lib/server/support/service.ts` and `projection.ts` for overdue/priority/stable ordering, inactive-owner review flags, scope-bound pagination and API read/write quotas; test these in `tests/unit/support-ordering.test.ts` and `tests/contracts/support-limits.test.ts`. (FR-008, FR-018, FR-023)
- [X] T018 [US2] Execute `tests/ui/support-actions.spec.ts` and the completed action domain suite across accepted/draft, deferred/completed/reopen, keyboard/mobile and lost-ack states; assert no changes to external tickets, staffing, maturity or execution acceptance. (FR-007, FR-009, FR-014, FR-017, FR-023; SC-001, SC-003, SC-006)

## Phase 5 — US3: Escalation and Human-Reported Handoff (P2)

**Goal**: Concrete next human steps with honest external-state boundaries.
**Independent test**: Known and unknown routes; accepted human-reported handoff; no outbound calls or ticket-resolution state.

- [X] T019 [P] [US3] Add `tests/contracts/support-escalation.test.ts` and `tests/integration/support-escalation.test.ts` for evidence-backed claims, unknown route/entitlement, malformed/credential-bearing URLs, user-supplied link factual review, internal-only references and a denied outbound-call spy. (FR-010, FR-011, FR-012, FR-024)
- [X] T020 [US3] Implement `lib/server/support/escalation.ts` and the action schema extensions: C08 "Escalation requires trigger, impact, accountable role, evidence checklist and checkpoint; provide exactly one of known route or unknown-route reason; route/checklist text is at most 2,000 characters each." C09 "External references are HTTPS URLs of at most 2,048 characters, without credentials, query or fragment; never fetch or unfurl them; external acknowledgement and resolution remain unknown." Human-reported provenance is distinct from external verification. (FR-010, FR-011, FR-012, FR-024)
- [X] T021 [US3] Add `app/_components/support/escalation.tsx` and execute `tests/ui/support-escalation.spec.ts` for trigger/owner/route/checkpoint guidance, unknown entitlement and human-reported handoff labels, accessible errors, hidden internal details and no send controls. (FR-004, FR-010, FR-011, FR-017; SC-002, SC-006)

## Phase 6 — US4: Bounded Turi Guidance (P2)

**Goal**: On-demand private explanation and explicit human save as a proposal.
**Independent test**: Native prepared scope, read-only tools, validated cited output, stop/replay/source loss, then save one suggestion with accepted state unchanged.

- [X] T022 [P] [US4] Define `lib/support/advice.ts` and boundary tests in `tests/contracts/support-advice.test.ts`: C11 "Advice permits six steps, six reads, 4,096 output tokens per step, 24,576 context bytes, 200 dependencies, five admissions per rolling hour/user, one active scope/user attempt and a 120-second deadline." Encode strict three-read/one-skill schemas, structured final output with at most five suggestions and exact output/source-map save identity. (FR-015, FR-016, FR-018)
- [X] T023 [US4] Add `migrations/043-support-advice.cjs`, exact manifest digest and runtime grants for advice binding/attempt/dependency/purgeable payload/paid-step receipts; extend the one-feature-per-conversation database guard atomically. Confirm migration number availability. (FR-002, FR-015, FR-016, FR-019, FR-021)
- [X] T024 [US4] Implement `lib/server/support/advisory.ts` and `context.ts`, add `support` to `lib/server/conversations/feature.ts`, and add `app/api/support/customers/[customerId]/advice/route.ts`: fresh owner/session/customer binding, exact audience/selection, one-active/rolling admission mutexes, initial charged snapshot and source/collection generations, including no-engagement inputs. (FR-002, FR-004, FR-007, FR-013, FR-015, FR-016)
- [X] T025 [US4] Implement `lib/server/support/tools.ts`, `agent/tools/support_summary.ts`, `support_actions.ts`, `support_evidence.ts`, `agent/instructions/support-context.ts` and `agent/skills/tam-support-guidance/SKILL.md` with the strict allowlist and current-source read fences; extend current instruction/catalog consumers so generic tools and research do not fall through. (FR-002, FR-004, FR-007, FR-012, FR-013, FR-015, FR-024)
- [X] T026 [US4] Implement support admission/provider wrappers in `lib/server/support/native.ts` and extend `lib/server/conversations/model-admission.ts`, `lib/server/staffing/native-context.ts`, `context.ts` and `model-budget.ts` compatibility dispatch. Persist admission once, enforce all budgets before calls, pass deadline/cancel signals, reject unbridged support and prevent SDK paid retries; keep `agent/agent.ts` byte-identical. (FR-002, FR-016, FR-024)
- [X] T027 [US4] Integrate `lib/server/support/native.ts` with current conversation dispatch, projection/history/reconnect and terminal settlement consumers: validate final schema/citations, recheck sources/authority before content release, withhold invalidated output and settle metadata after stop/revocation without content restoration or repeat provider work. (FR-002, FR-013, FR-015, FR-016, FR-020)
- [X] T028 [US4] Add `app/_components/support/advice.tsx` using existing conversation controls and implement human `save_suggestion` in `lib/server/support/commands.ts`; exact own completed retained attempt/output, same audience and eligible sources are required; output only becomes a pending action. (FR-014, FR-015, FR-017)
- [X] T029 [US4] Execute `tests/integration/support-native.test.ts`, `tests/integration/support-advice-lifecycle.test.ts` and `tests/ui/support-advice.spec.ts` in owned app copies: mixed binding, raw native fallback, no forbidden tool, all quota/timeout edges, cancellation, revoked session, changed sources, lost-ack/replay, malformed final output, audience-safe save and unchanged root model. (FR-002, FR-004, FR-013–FR-017, FR-024; SC-002, SC-003, SC-005, SC-006)
- [X] T030 [US4] Implement the eight actual-output case definitions in `tests/fixtures/support/evaluation.ts`, capture runner `scripts/eval-support.ts` and review verifier `scripts/verify-support-review.ts`; bind evidence to source/model/prompt versions and measure bounded usage/cost/latency, with no selective pass-only capture. (FR-007, FR-010, FR-015, FR-016, FR-020, FR-022; SC-005)

## Phase 7 — Lifecycle, Verification and Documentation

- [X] T031 Connect original-source correction/withdrawal/conflict and selected baseline/support head changes to indexed support invalidation in `lib/server/support/sources.ts` and existing source lifecycle callers; prove synchronous current reads and final release fail closed even before fanout maintenance runs. (FR-004, FR-013, FR-019)
- [X] T032 Implement exact leased cleanup and draft/advice/audit minimization in `lib/server/support/maintenance.ts`: C12 "Withhold invalid content immediately; purge invalidated payloads within 24 hours, abandoned/rejected drafts after 90 days and advice content after 30 days; retain content-free audit/receipt identities for 365 days." Apply the data-model's narrow retained-record referential exception and earliest-deadline rule; never retain prose/URLs in terminal jobs or receipts. (FR-019, FR-021)
- [X] T033 Wire metadata settlement/cleanup into the existing maintenance supervisor, implement `lib/server/support/telemetry.ts`, and document `TURAS_010_DISABLED` in `lib/server/config.ts` and `.env.example`; verify new-work denial with eligible reads/receipts/stop/settlement/retention still available. (FR-016, FR-020, FR-021)
- [X] T034 Add and execute `tests/integration/support-lifecycle.test.ts` for original withdrawal/supersession, assessment-context changes, quality/overdue flags, generation races, exact cleanup leases, late terminal events, all retention clocks and content-free history/receipt/telemetry checks. (FR-006, FR-013, FR-019–FR-021; SC-002, SC-007)
- [X] T035 Validate committed 041→current and empty migrations, manifest integrity, runtime grants and preserved earlier record identities in `tests/integration/support-schema.test.ts`; assert current manifest version rather than hardcoding the final schema in old feature tests. (FR-014, FR-021, FR-022; SC-007)
- [X] T036 [P] Implement `scripts/support-recovery-check.ts` and `tests/fixtures/support/recovery.ts` for owned preserved-database/workflow restart, command-ack loss, uncertain native dispatch reconciliation and withheld/purged dependent content; no selected database reset. (FR-014, FR-016, FR-019, FR-021; SC-003, SC-007)
- [X] T037 [P] Implement `scripts/benchmark-support.ts` and `tests/fixtures/support/load.ts` with SC-004's exact corpus, four read/preview/ack classes, five users, ten warmups and 100 measured calls per class, quota-compliant pacing, separate quota/overflow tests and per-class p95 ≤2 seconds. Record source/corpus identities and zero correctness failures. (FR-018, FR-020, FR-023; SC-004)
- [X] T038 Implement exhaustive suite discovery in `scripts/test-support.ts` and register planned support commands in `package.json`; route `support-*` suites to owned support setup and update prior-feature/legacy selectors in `scripts/test-execution-regressions.ts`, `scripts/test-staffing-regressions.ts`, `scripts/test-reports-regressions.ts` and any other actual discovery callers found. Fail zero/missing/skipped results; preserve earlier coverage. (FR-022; SC-002, SC-003, SC-005, SC-007)
- [X] T039 Implement `scripts/check-support-ui.ts` with the existing four projects, owned fixture setup, full discovery/result reconciliation and at least 28 cases; update `playwright.config.ts` legacy-only exclusion for `support-*.spec.ts`. Check owned source copies include all imported dependencies and isolate transforms consistently with current runners. (FR-017, FR-022; SC-006)
- [X] T040 Add dedicated deterministic and four-project support WebKit jobs to `.github/workflows/ci.yml`; retain existing checks, Node 24, required owned runtime prerequisites, safe suite-path/error-category diagnostics and no private artifacts in public output. (FR-020, FR-022; SC-002–SC-007)
- [X] T041 Run `npm run test:support`, relevant existing retrieval/plan/execution/native and reporting regressions, `npm run typecheck`, `npm run build:check` and `npm run check:docs`; record exact source-bound results in `specs/010-tam-support-guidance/validation.md`. Resolve failures without bypassing cohort or assertion coverage. (FR-022; SC-002, SC-003)
- [X] T042 Run `npm run support:ui:check`, inspect synthetic desktop/mobile light/dark captures and execute the timed manual-to-reviewed-readiness journey; record all discovered/passed counts, keyboard/axe review and SC-001 timing in `specs/010-tam-support-guidance/validation.md`. (FR-017, FR-022; SC-001, SC-006)
- [X] T043 Run `npm run benchmark:support -- --disposable` and `npm run support:recovery:check -- --disposable`; record per-class metrics, retry identities, preserved state and lifecycle results in `specs/010-tam-support-guidance/validation.md`. (FR-018, FR-019, FR-021–FR-023; SC-003, SC-004, SC-007)
- [X] T044 Run `npm run eval:support -- --live` (always owned disposable setup) and `npm run eval:support:verify`; review all eight actual outputs against `specs/010-tam-support-guidance/contracts/advisory-context.md`, record failures/limits/cost/latency and source-bound evidence in `specs/010-tam-support-guidance/validation.md`. An unavailable required live check is a reported remaining gate, not a passing fixture result. (FR-007, FR-010, FR-015, FR-016, FR-022; SC-005)
- [X] T045 Update `README.md`, `ROADMAP.md`, `docs/support-operations.md` and `specs/010-tam-support-guidance/validation.md` with actual implemented scope, commands, disable/retention/forward-recovery instructions and local/CI/hosted distinctions; correct 009's merged status using PR17 without importing uncommitted follow-up claims. Re-run docs/diff checks and require green published-head CI before any later authorized merge. (FR-019–FR-024)

Expired-retry requirement for T004/T005/T032/T034: implement `support_expired_command_keys` as the content-free keyed-hash fence in data-model retention details, admit commands under the same lock as receipt cleanup, preserve lookup across hash-key rotation, and test a late retry and a cleanup/admission race. No expired key may create another action.

## Dependencies and Execution Order

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 is the foundation. Within a story, execute listed order; a test design task precedes its behavior and its assertions must pass before the story is complete.

- US1: T009–T013 after foundation; T009 precedes T010; API precedes UI integration. This is the smallest useful manual MVP.
- US2: T014–T018 after US1's service/review/API foundation; can be independently verified using a seeded accepted readiness assessment.
- US3: T019–T021 after US2's generic action revision path; adds escalation fields without a new external side-effect engine.
- US4: T022–T030 after US1/US2 contracts and source services. T022 precedes T023–T029; T023 precedes binding/native work; T024–T027 precede T028/T029. T030 requires settled advice schema and the eight case definitions, not a new provider/model.
- Lifecycle T031–T035 follows all record/native shapes; can be brought forward when those shapes stabilize but must finish before acceptance. T036/T037 are independent once all shared domain/fixture dependencies exist. T038–T040 follow stable suites/configuration. T041–T044 execute the gates; T045 records their actual outcome.

### Parallel Opportunities

After foundation, T009, T014, T019 and T022 can prepare independent test/contract files concurrently, but their story's implementation dependencies still apply. This is the meaning of their `[P]` marker. US1 test vectors and US2 transition tests do not edit shared domain files; US3 escalation tests and US4 advice contracts are separate. T036 recovery tooling and T037 benchmark tooling can run as separate implementation work after lifecycle/fixtures stabilize. Shared source/policy/native dispatcher files must be edited serially or explicitly coordinated.

### Incremental Delivery

Demonstrate US1 manually first, then US2/US3 without a model, then US4. Each story may be reviewed as a focused increment. Completion of 010 requires all four stories, lifecycle and the seven success criteria; the MVP label does not reduce the authorized scope.

## Requirement Coverage

| Requirement | Task coverage |
| --- | --- |
| FR-001 | T004, T007, T010–T013 |
| FR-002 | T005, T008, T011, T024–T029 |
| FR-003 | T005, T008, T012, T013 |
| FR-004 | T006–T008, T012, T013, T021, T024, T025, T029, T031 |
| FR-005 | T003, T009, T010, T012, T013 |
| FR-006 | T009, T010, T012, T013, T034 |
| FR-007 | T006, T010, T012, T013, T018, T024, T025, T030, T044 |
| FR-008 | T003, T014–T018 |
| FR-009 | T014–T016, T018 |
| FR-010 | T019–T021, T030, T044 |
| FR-011 | T019–T021 |
| FR-012 | T006, T008, T013, T015, T019, T020, T025 |
| FR-013 | T006, T010, T013, T024, T025, T027, T029, T031, T034 |
| FR-014 | T003–T005, T007, T008, T010, T011, T014–T016, T018, T028, T029, T035, T036 |
| FR-015 | T022–T025, T027–T030, T044 |
| FR-016 | T022–T024, T026, T027, T029, T030, T033, T036, T044 |
| FR-017 | T011–T013, T016, T018, T021, T028, T029, T039, T042 |
| FR-018 | T003, T006, T008, T011, T017, T022, T037, T043 |
| FR-019 | T004, T007, T023, T031, T032, T034, T036, T043, T045 |
| FR-020 | T027, T030, T033, T034, T037, T040, T045 |
| FR-021 | T001, T002, T004, T023, T032–T036, T043, T045 |
| FR-022 | T002, T008, T030, T035, T038–T045 |
| FR-023 | T017, T018, T037, T043, T045 |
| FR-024 | T001, T019, T020, T025, T026, T029, T045 |
| SC-001 | T013, T018, T042 |
| SC-002 | T008, T013, T021, T029, T034, T038, T040, T041 |
| SC-003 | T008, T014, T018, T029, T036, T038, T040, T041, T043 |
| SC-004 | T037, T040, T043 |
| SC-005 | T029, T030, T038, T040, T044 |
| SC-006 | T013, T018, T021, T029, T039, T040, T042 |
| SC-007 | T034–T036, T038, T040, T043 |

Story task counts: US1 5; US2 5; US3 3; US4 9; shared setup/foundation/lifecycle/verification 23. Total 45. Completion is recorded only after implementation and acceptance evidence in validation.md.
