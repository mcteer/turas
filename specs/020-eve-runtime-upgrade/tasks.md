# Tasks: Eve Runtime Upgrade and Specialist Continuity

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md),
[data model](data-model.md), [contracts](contracts/specialist-discussions.md).
**Branch / PR**: `chore/eve-dependabot-composer` / #52.

Tests are required by the spec for authorization, accounting, recovery and UI.
All implementation tasks start unchecked. Some compatibility/UI changes already
exist; inspect and verify them rather than rewriting or treating their presence
as completion. Planning completion does not mark implementation tasks complete.
Planning was handed off for the requested model switch; implementation is now authorized.

## Phase 1: Setup

- [x] T001 Reconcile the existing branch changes and prior check evidence against this list; record current failures and exact source in `specs/020-eve-runtime-upgrade/validation.md`, preserving uncommitted work and existing private runtime state (FR-001, SC-005).
- [x] T002 Verify exact Eve/AI SDK/connect/local-sandbox pins and reproducible install/build in `package.json` and `package-lock.json`; prove no package install occurs during a turn or shutdown (FR-017, FR-018).

## Phase 2: Foundation

- [x] T003 Add `migrations/084-specialist-discussions.cjs`, update `migrations/manifest.json`, `lib/contracts/current-schema.ts` and `scripts/db-roles.ts` / `scripts/db-role-setup.sql`; test immutable scope/bindings, unique calls/idempotency and one active assignment in `tests/integration/specialist-discussions.test.ts` (FR-006, FR-007, FR-015).
- [x] T004 Define bounded status/cancel schemas and safe reason codes in `lib/contracts/specialist-discussions.ts`, with rejection/privacy contract cases in `tests/contracts/specialist-discussions.test.ts` (FR-007, FR-009).

**Dependency**: New specialist behavior depends on T003–T004. Existing US1
compatibility and US4 composer verification may proceed independently of that
new schema in an environment running their currently required schema.

## Phase 3: US1 — Existing Conversations Remain Reliable (P1)

**Independent Test**: Actual native text/files/questions, failure/restart/reload,
governed regressions and saved-history checks preserve input, authority and usage.

- [x] T005 [US1] Verify and finish complete v27 commit/fact identity, replay ordering and usage settlement in `lib/server/conversations/eve-events.ts`, `replay-window.ts`, `projection-position.ts` and all governed projectors; cover duplicate/multiple/partial facts in `tests/integration/native-input-replay.test.ts` (FR-001, FR-002, FR-005, SC-005).
- [x] T006 [US1] Verify protocol-25 retained history and immutable native bindings in `lib/server/conversations/repository.ts`, `app/_components/retained-chat.tsx` and `tests/unit/retained-chat-history.test.ts`; historical decisions must confer no new authority (FR-003, FR-015).
- [x] T007 [US1] Verify deferred pre-provider admission in `lib/server/models/deferred.ts`, `agent/agent.ts` and governed model adapters; add representative approval/source/unknown-usage regressions to `tests/unit/pilot/native-model-routing.test.ts` and existing governed integration suites (FR-004, FR-005, FR-018, SC-005).
- [x] T008 [US1] Finish and verify owned-question replacement in `lib/server/conversations/question-steering.ts`, `input-responses.ts`, `eve-routes.ts`, `tests/unit/question-steering.test.ts` and `scripts/check-ordinary-questions-native.ts`; require real old-turn settlement and stale-answer denial (FR-001, FR-011, SC-005).
- [x] T009 [US1] Diagnose and fix the staged 10 MiB process-restart failure in `scripts/check-ordinary-native-files.ts` and the affected native-file/runtime recovery path; preserve canonical input/delivery, authority expiry and unknown usage; pass the real restart fixture without weakening assertions (FR-001, FR-005, FR-017, SC-005).
- [x] T010 [US1] Verify session retirement and memory/file recovery through `lib/server/conversations/ordinary-retirement.ts`, `retirement-confirmation.ts` and existing native fixtures; distinguish accepted end, released execution and retained accounting (FR-001, FR-005, FR-017).
- [x] T011 [US1] Run the ordinary questions and staged-4/staged-10 native fixtures sequentially through `scripts/check-legacy-parity-disposable.mjs`; record actual outcomes and cleanup in `specs/020-eve-runtime-upgrade/validation.md` (FR-001, FR-011, SC-005).
- [ ] T012 [US1] Run affected ordinary/customer/partner and governed workflow suites from `.github/workflows/ci.yml` and `.github/workflows/legacy-backend-parity.yml` on the frozen source; record coverage/failures in `specs/020-eve-runtime-upgrade/validation.md` (FR-001, FR-004, SC-005).

## Phase 4: US2 — Continue Specialist Work (P1)

**Independent Test**: Each specialist completes one request and two refinements,
with same-child identity across restart and no cross-scope access or budget reset.

- [x] T013 [P] [US2] Add failing ownership, context-withdrawal, expiry, idempotency and concurrent-admission cases in `tests/integration/specialist-discussions.test.ts` after T003 (FR-004, FR-006, FR-007, SC-002).
- [x] T014 [P] [US2] Add failing cumulative-spend/held-usage and no-idle-dispatch cases in `tests/unit/specialist-discussions.test.ts` after T004 (FR-005, FR-008).
- [x] T015 [US2] Implement discussion admission/read/closure and immutable assignment binding in `lib/server/research/specialists/discussions.ts`; recheck environment, owner, customer, purpose, original expiry and cumulative retained-source eligibility, including validated own-result baseline updates (FR-004, FR-006, FR-007).
- [x] T016 [US2] Implement aggregate reservations over existing operation receipts in `lib/server/research/specialists/discussion-budget.ts`; wire `agent/lib/authorize-specialist.ts` and research I/O admission so every paid operation respects original worker/conversation limits and unknown holds (FR-004, FR-005, FR-008).
- [x] T017 [US2] Adapt `lib/server/research/specialists/runtime-authority.ts`, `research-cache/requests.ts` and `agent/lib/legacy-research/workflow-progress.ts` for current-call authority on the same child; preserve original assignment leases and reject ambiguous pending reservations (FR-004, FR-006, FR-007).
- [x] T018 [US2] Convert all three wrappers in `agent/tools/customer-recon.ts`, `implementation-research.ts`, `vercel-best-practices.ts` and `agent/lib/legacy-research/specialist-workflows.ts` to sequential `serve` workflows with one child handle, call abort signals, persisted run identity, durable fixed expiry and validated `ctx.reply` (FR-006, FR-008, FR-010).
- [x] T019 [US2] Update `agent/skills/solution-research/SKILL.md` and relevant authored research instructions to select eligible task IDs for requested refinements, remove unused `agentId`, allow separately admitted concurrent specialist types, and reject silent replacement/restart (FR-006, FR-007, FR-008, FR-018).
- [x] T020 [US2] Integrate idempotent result-reference delivery in `agent/lib/legacy-research/research-handoff.ts` and specialist workflows, removing polling only for owned native tasks while retaining necessary non-native cache joins; test replay/output-sharing and five-second controlled result availability (FR-010, SC-004).
- [x] T021 [US2] Add `scripts/check-specialist-continuity.ts` and `--native-specialists` in `scripts/check-legacy-parity-disposable.mjs`; exercise all three specialists through initial request plus two follow-ups and process restart using real native workflows with deterministic provider fixtures (FR-006, FR-008, FR-010, SC-001, SC-002, SC-004).
- [x] T022 [US2] Run the native continuity harness and adversarial access/source/budget cases, capturing unchanged identities, no duplicate dispatch and held accounting in `specs/020-eve-runtime-upgrade/validation.md` (FR-004, FR-005, FR-007, SC-001, SC-002).

## Phase 5: US3 — Observe and Stop Individual Tasks (P1)

**Independent Test**: Stop one of two active tasks, prove its terminal outcome and
the other's completion; repeat after reload and under denied-owner/partner access.

- [x] T023 [US3] Add native targeted-cancel, completion-race, lost-acknowledgement and parent/child-settlement scenarios to `scripts/check-specialist-continuity.ts`; prove public workflow cancellation before wiring the UI (FR-009, FR-011, FR-012, SC-003).
- [x] T024 [US3] Implement complete-fact task/call/interaction projection in `lib/server/research/specialists/discussion-events.ts` and connect the existing native observation path; test replay before/after binding, waiting questions and private-field exclusion (FR-002, FR-009, FR-010, FR-011).
- [x] T025 [US3] Implement authenticated bounded GET in `app/api/conversations/[id]/specialists/route.ts` and idempotent POST in `app/api/conversations/[id]/specialists/[discussionId]/cancel/route.ts`, backed by the domain service and public `eve/workflow/api`; test origin, owner and cross-scope denial in `tests/contracts/specialist-discussions.test.ts` (FR-007, FR-009, FR-011).
- [x] T026 [US3] Integrate global Stop, conversation retirement and reconciliation in `lib/server/conversations/cancel.ts`, `ordinary-retirement.ts` and `reconcile.ts`; fence active and idle discussion admission and reconcile uncertain control without redispatching paid work (FR-005, FR-011, FR-012, SC-003).
- [x] T027 [US3] Integrate discussion metadata/result retention with conversation cleanup in `lib/server/research/specialists/discussions.ts` and the existing maintenance path; preserve permitted audit and cost holds while withholding invalid/private content (FR-004, FR-005, FR-009).
- [x] T028 [US3] Add `app/_components/specialist-tasks.tsx` to `app/_components/agent-chat.tsx` with safe labels, keyboard-accessible targeted Stop, true stopping/waiting/completed states and draft-preserving updates (FR-009, FR-012, SC-006).
- [x] T029 [US3] Extend `scripts/check-chat-interaction-ui.ts` for task controls, pending questions, targeted/global Stop, reload, accessibility and both themes at desktop/mobile sizes (FR-009, FR-011, FR-012, SC-006).
- [x] T030 [US3] Run two-task cancellation and terminal-race fixtures plus task UI checks; retain actual results and separate usage settlement evidence in `specs/020-eve-runtime-upgrade/validation.md` (FR-009, FR-011, FR-012, SC-003, SC-004, SC-006).

## Phase 6: US4 — Composer and Reviewable Preview (P1)

**Independent Test**: Requested layout, attachments and drafts work in desktop/
mobile themes; the exact Preview inherits and accepts the established account.

- [x] T031 [US4] Reconcile `app/_components/agent-chat.tsx`, `composer-attachment-menu.tsx` and `docs/design-reference.md` against the screenshots: Turi above, + left, Customer inside right, arrow far right and no microphone/standalone paperclip/link (FR-013).
- [x] T032 [US4] Run existing attachment, link/source, keyboard, multiline, draft, reload and recovery coverage in `scripts/check-chat-interaction-ui.ts`; retain screenshots and actual results in `specs/020-eve-runtime-upgrade/validation.md` (FR-013, SC-006).
- [x] T033 [US4] Verify `scripts/check-preview-credentials.mjs` and Preview configuration inherit the existing sensitive production `mcteer` record with no local override; preserve production values and default firewall behavior (FR-014).
- [x] T034 [US4] Publish the reviewed commit to isolated Preview after migrations/grants are ready, verify deployment SHA and resource identity, and record authenticated HTTP/WebKit sign-in and changed behaviors in `specs/020-eve-runtime-upgrade/validation.md`; distinguish metadata-only from actual login evidence (FR-014, FR-015, SC-007, SC-008).
- [x] T035 [US4] Perform a bounded representative real hosted specialist/refinement/cancellation check using allowed Gateway models and existing admission controls; record outcome/accounting separately from fixture evidence in `specs/020-eve-runtime-upgrade/validation.md` (FR-004, FR-006, FR-009, FR-018, SC-007).

## Phase 7: US5 — Maintain and Release the Upgrade (P2)

**Independent Test**: Reviewed dependency configuration, accurate docs, rehearsed
migrations/grants and environment-specific release evidence are available.

- [x] T036 [P] [US5] Verify `.github/dependabot.yml` covers root npm, maintained package/operator manifests and Actions with reviewed update groups; confirm no unreviewed auto-merge and large-upgrade spec/adoption rules in `AGENTS.md`, `CONTRIBUTING.md` and `.specify/memory/constitution.md` (FR-016).
- [x] T037 [P] [US5] Update `README.md`, `ROADMAP.md` and the spec adoption assessment to match implemented behavior, keep README headings Title Case and document exclusions with reasons (FR-016, FR-018, FR-019).
- [x] T038 [US5] Rehearse migrations 082–085 and grants from schema 081 plus Preview 084 using `scripts/db-migrate.ts` and `scripts/db-roles.ts`; prove target/backup identity and compatible code/schema recovery, preserving old bindings and usage in `specs/020-eve-runtime-upgrade/validation.md` (FR-003, FR-005, FR-015, SC-008).
- [x] T039 [US5] Audit the final diff against scope boundaries in `specs/020-eve-runtime-upgrade/spec.md`: unchanged selected models, no unused integrations, private/synthetic pilot restoration or custom firewall rules; update PR #52's description from `specs/020-eve-runtime-upgrade/validation.md` (FR-018, FR-019).
- [x] T040 [US5] Prepare release/rollback and model-switch handoff evidence in `specs/020-eve-runtime-upgrade/validation.md`; distinguish implemented, locally checked, CI, Preview and Production states and any unresolved checks (FR-015, SC-007, SC-008).

## Phase 8: Final Verification and Release

- [ ] T041 Run required CI/type/build/unit/integration/contract/native/UI checks from `.github/workflows/ci.yml` and `.github/workflows/legacy-backend-parity.yml` on the final source, resolve failures and record independent review in `specs/020-eve-runtime-upgrade/validation.md` (FR-001, SC-005, SC-006, SC-007).
- [x] T042 Run Spec Kit convergence against `specs/020-eve-runtime-upgrade/spec.md`, `plan.md` and `tasks.md`; append any uncovered work and complete it before declaring the implementation ready (FR-001–019, SC-001–008).
- [ ] T043 After Preview review and the authorized release decision, merge only with green CI/review, coordinate explicit Production schema/grants/code release, verify deployed commit and authenticated behavior, then remove the merged feature branches and verify `README.md` on main; record actual outcomes in `specs/020-eve-runtime-upgrade/validation.md` (FR-015, SC-007, SC-008).
- [ ] T044 Remove verified-unneeded task-owned test apps, private scratch artifacts, containers/images and temporary Preview resources after review/recovery no longer needs them; preserve `turas-back` and selected runtime state, and record custody/accounting exceptions in `specs/020-eve-runtime-upgrade/validation.md` (FR-005, FR-019).

## Dependencies and Parallel Work

Setup → foundation → US2 → US3. US1 is the compatibility baseline and must pass
before native specialist acceptance. US4 layout checks can run alongside backend
work, but its final Preview depends on US1–US3 and migration rehearsal T038.
US5 configuration/docs can proceed independently; release gates follow every
story. T041–T044 are final acceptance, not permission to skip Preview review.

Within each story, safe parallel examples are: US1 retained-history verification
T006 versus upload investigation T009; US2 test files T013/T014; US3 route contract
tests in T025 versus UI work T028 after their dependencies; US4 credential audit
T033 versus local visual checks T032; US5 Dependabot T036 versus README T037.
Never run staged-4 and staged-10 fixtures together or simultaneous Eve/Next builds.
Parallel task labels do not authorize new subagents by themselves.

## Delivery Strategy

First establish US1 as the compatibility baseline; then complete continuity and
targeted control before claiming useful feature adoption. Deliver all five stories
in the existing PR; US1 alone is not completion of this spec. Each task is checked
only after its described behavior and relevant verification are complete. No
production change occurs as part of the planning/model-switch handoff.

## Phase 9: Convergence

- [x] T045 Align the cancellation decision and baseline-status wording in `plan.md` and `research.md` with the implemented public durable Stop hook and actual native/hosted evidence, preserving admission fencing and terminal confirmation per FR-009, FR-011 and plan: progress/control decision (contradicts).

- [x] T046 Preserve authenticated pre-083 whole-line replay denials on the fact-indexed schema; verify valid ready indexes and enabled guards, including inherited fences (FR-005, FR-015).
- [x] T047 Extend existing recovery snapshots, typed holds, quarantine and specialist allowance accounting to preserve post-backup specialist spending and deny old dispatch identities; explicit migration and restore regressions (FR-005, FR-015).

- [x] T048 Move specialist embedding reservation after prerequisite admissions and record a confirmed validated response before rejecting cancelled downstream use; preserve unknown dispatched holds, with provider-boundary and cancellation regressions (FR-004, FR-005, FR-015).

- [x] T049 Use a verified direct runtime connection for Neon's session-level private-I/O fence; preserve runtime credentials/options, reject routing mismatches/query overrides and verify live session lock release without provider calls (FR-005, FR-015).
