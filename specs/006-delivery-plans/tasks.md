# Tasks: Delivery plans and technical designs

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md) and contracts.
**Status**: Implementation and local/Preview validation complete; reviewable PR
[#11](https://github.com/mcteer/turas/pull/11) is open. Checked tasks have
recorded evidence. Hosted behavior and CI remain separate review gates.
**Tests**: Required by FR-023, SC-001–SC-008 and the constitution. Write focused tests before their behavior, then run the narrow relevant gate. Use disposable data only.
**Policy**: Administrator-only plan decisions are an explicit planning default, not a recorded user confirmation. Follow the current spec if the user revises that choice.

`[P]` means independent files within the same phase, after its prerequisites.
Story labels identify independently verifiable outcomes, not permission to skip dependencies.
New commands and files below are implementation work, not existing completed capabilities.

## Phase 1: Setup

**Goal**: Prepare isolated validation and the existing app extension points.

**Independent test/checkpoint**: No runtime/schema changes occur on the app database during setup.

- [X] T001 Confirm installed versions, used eve/Next.js docs and disabled tools; record environment boundaries and implementation evidence headings in `specs/006-delivery-plans/validation.md` without reading or printing credentials. (FR-022, FR-023)
- [X] T002 Implement `scripts/plan-eval-environment.ts` using the existing Neon/CI disposable clone pattern and `tests/fixtures/database.ts` guard; accept a marked schema-028-or-newer test source, explicitly migrate only the created clone, isolate app/store/eve state and clean up only owned resources. (FR-022, SC-008)
- [X] T003 Add guarded `test:plans` orchestration in `scripts/test-plans.ts`, `package.json` and `.github/workflows/ci.yml`; prevent Preview/Production aliases and use a separate ephemeral CI app/database for 006 checks. (FR-022, FR-023)
- [X] T004 Create synthetic internal/partner/customer/workload, eligible/withdrawn source and draft fixtures in `tests/fixtures/plans/seed.ts`; keep the real review-transition journey separate in `tests/fixtures/plans/journey.ts`. (FR-023, SC-001, SC-002)

## Phase 2: Foundation

**Goal**: Establish strict contracts, scoped persistence and source checks before story work.

**Independent test/checkpoint**: Contracts reject invalid input; runtime roles cannot rewrite history; source and audience checks work with maintenance paused.

- [X] T005 [P] Write boundary and semantic validation cases for C01–C12 in `tests/contracts/plan-content.test.ts`, including incomplete drafts versus submit/accept gates. (FR-003, FR-005, FR-008, FR-009)
- [X] T006 [P] Write schema/readiness, runtime immutability, cross-scope FK, source projection and same-key/different-request tests in `tests/integration/plan-foundation.test.ts`. (FR-001, FR-004, FR-007, FR-014, FR-020)
- [X] T007 Implement identity, text and revision envelopes in `lib/contracts/plans.ts`: "IDs are UUIDs; customerId and workspaceId are required; workloadId is nullable and, at creation/mutation, references an active accepted workload in the same customer/workspace; audience is internal or delivery and is immutable; ownerMembershipId is an active same-workspace member with current customer access." "Title is trimmed 1–160 characters; narrative is 1–4,000 characters when present; rationale/changeReason is 1–2,000 characters; stable element keys match [a-z][a-z0-9_-]{0,63}; revision payload is at most 131,072 UTF-8 bytes; unknown object properties are rejected." "Revision numbers and aggregateVersion are positive safe integers; digests are lowercase 64-character SHA-256 hex; timestamps are ISO 8601 with offsets; asOf is not in the future; planned dates are YYYY-MM-DD or null with a reason; start date cannot follow target date." (FR-001, FR-003, FR-004)
- [X] T008 Implement section/assertion contracts in `lib/contracts/plan-content.ts`: "Exactly twelve distinct section keys are required: charter, current_state, scope_acceptance, options, technical_design, work_plan, staffing, raid, handoff, measurement, evidence, decision; content sections use content, unknown or not_applicable; unknown requires an owner role and discovery action, and not_applicable requires a reason; evidence and decision are server-derived sections." "At most 100 assertions and 40 durable source dependencies per revision; assertion kind is accepted_fact, attributed_research, shared_practice, proposal, estimate or assumption; each factual assertion has 1–10 source dependency IDs; assumptions/estimates have an owner role and validation action; decisionCritical is boolean; critical facts require current adequate support and critical unresolved assumptions block acceptance." (FR-003, FR-005, FR-006)
- [X] T009 Extend `lib/contracts/plan-content.ts` with design/work/fit contracts: "At most 3 diagrams, each with 1–40 uniquely keyed nodes and 0–80 uniquely keyed edges; edge endpoints reference existing nodes; diagram kind is context or container; labels are plain text 1–160 characters and textEquivalent is 1–4,000 characters; at most 20 design decisions; no HTML, arbitrary SVG, scripts, embedded resources or executable diagram syntax; links are governed artifact references or HTTPS URLs without credentials." "At most 50 work packages and 50 milestones with distinct stable keys; each has title, ownerRole, exitEvidence and track value, production or both; milestone dependencies reference existing milestone keys and form a directed acyclic graph; effort is either unknown with reason or hours with 0 <= minimum <= maximum <= 100000; each milestone has a planned date or unknown reason and customerValidation text." "At most 10 reused solutions; each references a durable shared-practice dependency and exactly one assessment for technology, security, delivery, process, adoption and effort_capacity; fit state is compatible, adaptation_required, unknown or incompatible; each assessment has rationale and validation action; recommendation-critical unknown/incompatible fit blocks acceptance." (FR-008, FR-009, FR-010)
- [X] T010 Complete command/drafting/lifecycle contracts in `lib/contracts/plans.ts`: "Decision action is accept, request_changes or reject; decision requires exact revisionId, contentDigest, expectedAggregateVersion, reviewPreviewId and rationale; delivery acceptance requires deliverySuitabilityConfirmed=true; requestKey is 8–128 ASCII letters/digits/underscores/hyphens; a review preview expires after 10 minutes and binds actor session, revision and current source-state digest." "Drafting state is prepared, running, saved, failed, cancelled, expired or unconfirmed; exactly one response attempt and at most one saved revision per drafting attempt; deadline is 120 seconds after dispatch; at most 6 model steps, 4096 output tokens per step, 4 retrieval calls, 24,576 total evidence-context bytes and 40 consumed source dependencies; user instructions are at most 8,000 characters; no automatic paid retry." "Revision review state is draft, in_review, changes_requested, rejected, accepted or superseded; only a current draft can be submitted; a content edit creates a new draft; only the current in_review revision can receive a first decision; accepted revisions can only become superseded through replacement acceptance; accepted and working pointers are separate." "List/history page size is 1–50 with default 20 and an opaque scope-bound cursor; plan writes are limited to 30/minute per membership/customer; drafting admission is limited to 5/hour per membership with at most one active attempt per plan; existing conversation concurrency and send limits also apply." (FR-011, FR-012, FR-014, FR-017, FR-021)
- [X] T011 Create `migrations/029-delivery-plans.cjs` with scoped plan/revision/payload/dependency/event storage, parent/base same-plan constraints and immutable digests; implement `origin` as `manual` or `agent`, require an attempt for agent origin, and keep title/narrative in purgeable payloads. (FR-001, FR-004, FR-005, FR-007, FR-020)
- [X] T012 Create `migrations/030-plan-decisions-baselines.cjs` for exact previews/decisions and canonical engagements/baselines; enforce unique engagement per plan, plan per engagement, accepted revision per baseline and same customer/workload/audience links without converting `engagement_reference` records. (FR-012, FR-013, FR-014, FR-015)
- [X] T013 Create `migrations/031-plan-drafting-lifecycle.cjs` for immutable planning bindings, attempt/step receipts, scoped command receipts and exact-revision cleanup jobs; one result per attempt, durable request-key digest tombstones and no full response prose in receipts. (FR-014, FR-016, FR-017, FR-020)
- [X] T014 Extend `scripts/db-role-setup.sql` with narrow runtime grants and immutable-row/controlled-payload-deletion permissions, and verify empty/028 upgrades on disposable targets in `tests/integration/plan-foundation.test.ts`. (FR-004, FR-020, FR-022)
- [X] T015 Implement `lib/server/plans/policy.ts`: current actor/customer/workload/owner checks, immutable audience, partner-own-draft versus accepted-delivery visibility, dedicated administrator review capability, schema-031 readiness and `TURAS_006_DISABLED` intake gate documented in `.env.example`; leave global schema minimum unchanged. (FR-001, FR-002, FR-012, FR-022)
- [X] T016 Implement scoped immutable repository and command receipt primitives in `lib/server/plans/repository.ts` and `lib/server/plans/commands.ts`, with current scope and operation-capability authorization before replay, canonical request digests, optimistic version checks and no memory fallback. (FR-004, FR-011, FR-014)
- [X] T017 Implement durable original-source identity/locator resolution and restricted transitive closure in `lib/server/plans/sources.ts`; source kind is `accepted_profile`, `approved_excerpt`, `verified_research` or `shared_knowledge`; convert current ephemeral citations at save and never depend on their expiry for plan reads. (FR-005, FR-006, FR-007)
- [X] T018 Implement `lib/server/plans/read.ts` projections with `readable`, `historical_warning`, `withheld` and `purged` availability, current reader authority, generic withheld titles and no private lineage/count leaks; distinguish freshness-only warnings from prohibited content. (FR-001, FR-002, FR-007, FR-020, SC-002, SC-004)
- [X] T019 Add shared original-source header locking in `lib/server/plans/sources.ts` and corresponding source-write paths in `lib/server/profiles/review.ts`, `lib/server/profiles/retractions.ts`, `lib/server/knowledge/service.ts` and `lib/server/research/ingest.ts`; acceptance and source event/generation mutations must serialize in the documented order. (FR-006, FR-007, FR-014, SC-004)

## Phase 3: US1 — Author and inspect a plan (P1, MVP)

**Goal**: Deliver manual structured plans and safe technical designs without a model call.

**Independent test/checkpoint**: Create/save/reload/submit a complete synthetic plan; inspect exact citations and diagram; reject stale edits, unsafe content and unauthorized reads.

- [X] T020 [P] [US1] Write manual authoring, incomplete-save, stale-edit, owner/workload and partner-own-draft scenarios in `tests/integration/plan-authoring.test.ts`. (FR-001, FR-002, FR-003, FR-004, SC-001)
- [X] T021 [P] [US1] Write create/save/list/detail/history/source/submit HTTP parity and error-envelope checks in `tests/contracts/plans-api.test.ts`. (FR-001, FR-003, FR-004, FR-005, FR-011, FR-019)
- [X] T022 [P] [US1] Write safe diagram/text-equivalent, DAG, range/date and solution-fit validator checks in `tests/unit/plan-design.test.ts`. (FR-008, FR-009, FR-010)
- [X] T023 [P] [US1] Write manual plan/design keyboard and persisted-reload WebKit journeys in `tests/ui/plans-authoring.spec.ts`. (FR-019, SC-001, SC-007)
- [X] T024 [US1] Implement two-level draft versus submit/accept readiness in `lib/server/plans/validation.ts`: twelve sections, source-backed facts, explicit critical dependencies, unknown owner/actions, two tracks, design alternative/rollback and no staffing/financial commitments. (FR-003, FR-005, FR-006, FR-008, FR-009, FR-010)
- [X] T025 [US1] Implement create/save/submit and append-only revision transitions in `lib/server/plans/commands.ts`; new content invalidates old pending review, accepted pointer remains separate, and persisted decision metadata is server-owned. (FR-003, FR-004, FR-011, FR-014)
- [X] T026 [US1] Add thin scoped routes in `app/api/plans/route.ts`, `app/api/plans/[planId]/route.ts`, `app/api/plans/[planId]/revisions/route.ts`, `app/api/plans/[planId]/submit/route.ts`, `app/api/plans/[planId]/revisions/[revisionId]/sources/[dependencyId]/route.ts` and `app/api/plans/commands/[requestKey]/route.ts`, sharing `app/api/plans/_shared.ts`. (FR-001, FR-003, FR-004, FR-005, FR-011, FR-014)
- [X] T027 [US1] Build progressive section/source/milestone editor and scoped create/edit pages in `app/_components/plans/plan-editor.tsx` and `app/(workspace)/customers/[customerId]/plans/new/page.tsx`; preserve incomplete work and warn before navigation loss without localStorage. (FR-003, FR-005, FR-009, FR-010, FR-019)
- [X] T028 [US1] Implement deterministic allowlisted diagram layout in `lib/server/plans/diagrams.ts` and `app/_components/plans/plan-diagram.tsx`, with form-based node/edge editing, fixed SVG primitives and matching accessible flow table. (FR-008, FR-019)
- [X] T029 [US1] Build list/detail/history/source-readiness views in `app/_components/plans/plan-list.tsx`, `plan-detail.tsx`, `plan-history.tsx` and `app/(workspace)/customers/[customerId]/plans/page.tsx` and `app/(workspace)/customers/[customerId]/plans/[planId]/page.tsx`; apply withheld/historical/purged behavior to every title/snippet. (FR-002, FR-004, FR-005, FR-007, FR-019)
- [X] T030 [US1] Add customer-context navigation in `app/_components/profiles/profile-overview.tsx` and `app/(workspace)/customers/[customerId]/page.tsx` without inactive later-feature links. (FR-019)
- [X] T031 [US1] Run focused US1 contract/domain/WebKit checks and record persisted outcomes and synthetic screenshots in `specs/006-delivery-plans/validation.md`. (FR-023, SC-001, SC-002, SC-007)

## Phase 4: US2 — Turi drafts from governed context (P1)

**Goal**: Persist bounded proposals from a fresh audience-bound planning conversation.

**Independent test/checkpoint**: Save a cited synthetic proposal, prove internal-to-delivery sentinel exclusion, and reconcile cancellation/uncertain completion without another paid turn.

- [X] T032 [P] [US2] Write first-context and every-tool audience/workload sentinel tests in `tests/integration/plan-context.test.ts`, including an internal author of a delivery plan, other workloads and rejected unverified selections. (FR-001, FR-002, FR-016, SC-002)
- [X] T033 [P] [US2] Write fake-provider proof that step seven never reaches the provider, larger output settings are clamped and ambiguous calls never retry in `tests/unit/plan-model-budget.test.ts`. (FR-017, FR-021, SC-006)
- [X] T034 [P] [US2] Write drafting admission/save/cancel/status/tool-replay contract and lifecycle cases in `tests/contracts/plan-drafting.test.ts` and `tests/integration/plan-drafting.test.ts`. (FR-014, FR-016, FR-017, SC-006)
- [X] T035 [US2] Implement immutable fresh planning-conversation binding in `lib/server/plans/context.ts` and `lib/server/conversations/repository.ts`; bind effective audience/workload before native context capture, never relabel a populated session. (FR-001, FR-002, FR-016)
- [X] T036 [US2] Thread server-derived audience/workload through `lib/server/profiles/context.ts`, `attempt-context.ts`, `read.ts`, `tool-actor.ts`, `lib/server/retrieval/policy.ts`, `search.ts`, `citations.ts` and `lib/server/research/read.ts`; preserve normal-chat behavior and deny any broader planning context. (FR-001, FR-002, FR-005, FR-006, FR-016)
- [X] T037 [US2] Implement persisted step/provider admission and usage limits in `lib/server/plans/model-budget.ts`; wire a documented dynamic resolver plus hard output clamp in `agent/agent.ts`, preserving its exact selected model and reasoning for ordinary and planning turns. (FR-017, FR-021, SC-006)
- [X] T038 [US2] Implement user admission, 120-second deadline, rate limits, dependency union, one-save result and no paid retry in `lib/server/plans/drafting.ts` over `lib/server/conversations/dispatch.ts`; reject concurrent head changes and cancelled/expired saves under the attempt lock. (FR-007, FR-014, FR-016, FR-017)
- [X] T039 [US2] Add `agent/tools/read_delivery_plan.ts` and `agent/tools/save_delivery_plan_draft.ts` using server-bound attempts and current domain checks; deny planning-session use of unrelated mutation tools in `agent/tools/propose_customer_context.ts` and `agent/tools/propose_artifact_claim.ts`. (FR-005, FR-014, FR-016, FR-018)
- [X] T040 [US2] Author the used `agent/skills/delivery-planning/SKILL.md` and `agent/instructions/plan-context.ts`, and route intent in `agent/instructions.md`; adapt only researched legacy planning behavior, preserve unknowns and require separate existing research admission. (FR-005, FR-006, FR-008, FR-010, FR-016, FR-018)
- [X] T041 [US2] Add admission/status/cancel routes in `app/api/plan-drafting/route.ts`, `app/api/plan-drafting/[attemptId]/route.ts` and `app/api/plan-drafting/[attemptId]/cancel/route.ts` through shared domain/CSRF guards. (FR-016, FR-017, FR-019)
- [X] T042 [US2] Build `app/_components/plans/plan-drafting.tsx` and the fresh-plan action link in `app/_components/agent-chat.tsx`; show exact scope/base, budgets, cancel, saved receipt and useful failed/unconfirmed recovery. (FR-016, FR-017, FR-019)
- [X] T043 [US2] Integrate draft outcome/usage reconciliation with `lib/server/conversations/projection.ts`, `cancel.ts`, `watchdog.ts`, `reconcile.ts` and `agent/hooks/persist-conversation.ts`; saved result survives a lost chat acknowledgement and duplicate native events. (FR-014, FR-017, FR-021, SC-006)
- [X] T044 [US2] Implement `lib/server/plans/fences.ts` and connect plan/source dependencies to `lib/server/conversations/context-fence.ts`, `repository.ts`, `projection.ts` and dynamic model admission; stop subsequent context/stream/title/history/replay after source or authority change. (FR-007, FR-016, FR-020, SC-002, SC-004)
- [X] T045 [US2] Run the deterministic US2 cases and native replay/cancel probes, preserving disabled shell/file/web/delegation surfaces; record results in `specs/006-delivery-plans/validation.md` without claiming the later live-output gate. (FR-017, FR-018, FR-023, SC-006)

## Phase 5: US3 — Review and accept an exact revision (P1)

**Goal**: Create one canonical engagement and immutable baseline from an explicit human decision.

**Independent test/checkpoint**: Twenty races/retries create one engagement/baseline/decision; changed source/version, wrong scope or non-reviewer cannot commit.

- [X] T046 [P] [US3] Write review-preview/decision/receipt and reviewer denial HTTP cases in `tests/contracts/plan-decisions.test.ts`, including CSRF, exact digest, expiry and reviewer-role revocation before decision replay. (FR-006, FR-012, FR-014)
- [X] T047 [P] [US3] Write twenty-key/same-key races, source mutation races, rollback, lost response and engagement-link tests in `tests/integration/plan-acceptance.test.ts`. (FR-006, FR-013, FR-014, SC-003)
- [X] T048 [P] [US3] Write exact-preview, accept/request-changes/reject and partner accepted-baseline journeys in `tests/ui/plans-review.spec.ts`. (FR-002, FR-012, FR-013, FR-019, SC-007)
- [X] T049 [US3] Implement authorized exact review previews and acceptance readiness in `lib/server/plans/decisions.ts`, with ten-minute actor-session binding, source-state digest and delivery-suitability attestation. (FR-002, FR-006, FR-012)
- [X] T050 [US3] Implement canonical engagement and immutable baseline persistence in `lib/server/engagements/repository.ts` and `lib/server/plans/baselines.ts`; allow same-scope baseline-free linkage, retain descriptive profile references and never infer execution progress. (FR-009, FR-013, FR-015)
- [X] T051 [US3] Complete atomic accept/request-changes/reject in `lib/server/plans/decisions.ts`: lock/recheck preview, exact head and source closure, write decision/engagement/baseline/pointers/receipt once, and return conflicts for competing new keys. (FR-006, FR-011, FR-012, FR-013, FR-014)
- [X] T052 [US3] Add decision routes in `app/api/plans/[planId]/review-preview/route.ts` and `app/api/plans/[planId]/decisions/route.ts`, exposing no acceptance tool or client-settable review state. (FR-011, FR-012, FR-014)
- [X] T053 [US3] Implement current-authorized engagement reads in `lib/server/engagements/read.ts`, `app/api/engagements/route.ts` and `app/api/engagements/[engagementId]/route.ts`, and integrate canonical summaries into `lib/server/profiles/read.ts` without creating accepted profile claims. (FR-001, FR-002, FR-007, FR-013)
- [X] T054 [US3] Build exact human review and stale-preview recovery in `app/_components/plans/plan-review.tsx`, with rationale, readiness blockers, explicit audience attestation and no automatic/default acceptance. (FR-006, FR-012, FR-019)
- [X] T055 [US3] Build `app/(workspace)/customers/[customerId]/engagements/[engagementId]/page.tsx` and accepted-baseline links in `app/_components/profiles/profile-overview.tsx`; show planned exit evidence without staffing/progress/commercial claims. (FR-009, FR-010, FR-013, FR-019)
- [X] T056 [US3] Verify same-scope partner visibility and absence of implicit context approval, publication, staffing or customer sign-off in `tests/integration/plan-acceptance.test.ts` and `tests/contracts/plan-decisions.test.ts`. (FR-002, FR-005, FR-010, FR-012, FR-013)
- [X] T057 [US3] Run US3 domain/HTTP/WebKit gates, inspect database identity counts after races and record evidence in `specs/006-delivery-plans/validation.md`. (FR-023, SC-003, SC-007)

## Phase 6: US4 — Revise baselines and handle source change (P2)

**Goal**: Preserve old decisions while accepting explicit replacement baselines and withholding invalid derived content.

**Independent test/checkpoint**: Revise, compare and replace one baseline on the same engagement; source withdrawal immediately fences current reads/replay while history identity survives.

- [X] T058 [P] [US4] Write stable-key/structured-diff and milestone replacement cases in `tests/unit/plan-diff.test.ts`. (FR-009, FR-015)
- [X] T059 [P] [US4] Write source/hidden-lineage withdrawal, freshness-only warnings, revoked grants, purged payloads and stale cleanup cases in `tests/integration/plan-lifecycle.test.ts`, with maintenance paused. (FR-007, FR-020, SC-002, SC-004)
- [X] T060 [P] [US4] Write replacement decision/diff HTTP coverage in `tests/contracts/plan-revisions.test.ts` and WebKit revision/source-warning journeys in `tests/ui/plans-revisions.spec.ts` and `tests/ui/plans-sources.spec.ts`. (FR-004, FR-015, FR-019)
- [X] T061 [US4] Implement deterministic `plan-diff-v1` in `lib/server/plans/diff.ts` for scope, designs, work/milestones, effort and evidence, with both-revision authorization and no hidden-body snippets. (FR-004, FR-007, FR-015)
- [X] T062 [US4] Implement accepted-plan revision and replacement acceptance in `lib/server/plans/commands.ts`, `decisions.ts` and `baselines.ts`; retain same engagement, base version, explicit change reason and immutable historical milestone sets. (FR-004, FR-011, FR-013, FR-014, FR-015)
- [X] T063 [US4] Connect plan dependency invalidation/cleanup enqueueing to `lib/server/profiles/retractions.ts`, `lib/server/knowledge/service.ts`, `lib/server/research/refresh.ts` and `lib/server/artifacts/lifecycle.ts`; recheck shared private lineage and source closure synchronously at plan reads/decisions. (FR-007, FR-020, SC-004)
- [X] T064 [US4] Implement exact-revision payload/rationale/baseline cleanup and attempt/preview pruning in `lib/server/plans/cleanup.ts`, integrated with `scripts/maintenance-worker.ts`; use batches of 100, preview prune after 24 hours, terminal instruction purge after 30 days and persistent idempotency tombstones. (FR-017, FR-020, FR-021)
- [X] T065 [US4] Add comparison route `app/api/plans/[planId]/diff/route.ts` and `app/_components/plans/plan-diff.tsx`; extend `plan-history.tsx` and `plan-detail.tsx` with accepted-versus-working comparison, safe withheld/purged states and explicit replacement review. (FR-004, FR-007, FR-015, FR-019)
- [X] T066 [US4] Verify whole-body source fences across list title, detail, diagram, decision rationale, diff, engagement baseline, tool/stream/history and expired search-receipt cases in `tests/integration/plan-lifecycle.test.ts`. (FR-002, FR-005, FR-007, FR-020, SC-002, SC-004)
- [X] T067 [US4] Run focused US4 replacement/lifecycle/cleanup and WebKit checks; record preserved baseline identity and immediate-denial evidence in `specs/006-delivery-plans/validation.md`. (FR-023, SC-004, SC-007)

## Phase 7: Cross-cutting validation and handoff

**Goal**: Establish every required acceptance gate and document actual results.

**Independent test/checkpoint**: All four stories, representative Turi outputs, isolated recovery, performance and M1 journey pass before completion is claimed.

- [X] T068 [P] Add safe transition/conflict/invalidation/latency/usage metrics in `lib/server/plans/telemetry.ts` and content-redaction tests in `tests/unit/plan-telemetry.test.ts`; no customer prose, URL, title or credential labels. (FR-021)
- [X] T069 [P] Implement and run `scripts/benchmark-plans.ts` and `plans:benchmark` in `package.json` with the specified 1,000-plan/20-revision corpus, five clients, ten warmups and 100 measured operations per class; record all failures and p95 results. (FR-021, SC-005)
- [X] T070 Implement and run `scripts/plans-recovery-check.ts` and `plans:recovery:check` in `package.json`: disposable empty setup and 028→031, disable intake, paired DB/store/eve restart, cancelled/unconfirmed work and preserved baseline/receipt identity. (FR-017, FR-020, FR-022, SC-008)
- [X] T071 Implement `scripts/check-plans-ui.ts` and `plans:ui:check` in `package.json`; run the full four-project CLI WebKit/keyboard/axe matrix with isolated app/test DB and synthetic screenshots. (FR-019, FR-023, SC-001, SC-007)
- [X] T072 Create `evals/fixtures/006-plan-cases.json`, `scripts/eval-plans.ts` and `scripts/verify-plan-review.ts`, reusing actual-event measurement from `evals/driver.ts`; add `eval:plans` and `eval:plans:verify` commands and enforce eight-case model/reasoning/usage/deadline and actual-output review gates. (FR-005, FR-006, FR-016, FR-017, FR-018, FR-023, SC-006)
- [X] T073 Run the opt-in disposable live eight-case suite, review each captured response and saved proposal under the rubric, and record sanitized results in `specs/006-delivery-plans/validation.md`; unavailable or over-budget cases remain incomplete, never mocked green. (FR-023, SC-006)
- [X] T074 Complete the real review→retrieval→plan→acceptance→engagement journey in `tests/fixtures/plans/journey.ts` and `tests/ui/plans-trusted-context.spec.ts`; verify stored source/decision/engagement identity, not only rendered text. (FR-023, SC-001, SC-002, SC-003)
- [X] T075 Align the implemented versioned template and architecture docs in `docs/templates/delivery-plan.md`, `docs/templates/README.md`, `docs/architecture.md` and `docs/decisions.md`, preserving the distinction between internal baseline acceptance and customer/staffing/commercial approval. (FR-003, FR-010, FR-012, FR-013)
- [X] T076 Run relevant 002–005 authorization/context/retrieval regressions once plus typecheck, both build targets, docs and diff checks; verify `agent/agent.ts` model/reasoning preservation and record exact commands/results in `specs/006-delivery-plans/validation.md`. (FR-016, FR-022, FR-023)
- [X] T077 After disposable gates, run `scripts/inspect-preview-db.mjs` via `npm run db:inspect-preview`; only with matching fresh Preview identity explicitly upgrade through `scripts/db-migrate.ts` and `scripts/db-roles.ts`, inspect again and record non-destructive local app smoke in `specs/006-delivery-plans/validation.md`; never test destructively there or access Production/Vercel. (FR-022)
- [X] T078 Reconcile completed tasks and actual local/CI/live/Preview evidence in `specs/006-delivery-plans/tasks.md`, `validation.md`, `quickstart.md`, `README.md` and `ROADMAP.md`; leave incomplete gates unchecked and create a reviewable PR without deployment or an unrequested merge. (FR-023, SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007, SC-008)

## Dependencies and execution order

Setup T001–T004 → Foundation T005–T019 → US1 T020–T031.
US2 T032–T045 and US3 T046–T057 can follow US1 independently, with coordinated
ownership for shared `commands.ts`, `read.ts` and contract files. US4 T058–T067
requires US3; its output/replay checks also require US2. Cross-cutting T068–T078
requires the relevant implemented stories; final completion requires every gate.
Do not parallelize mutations to the same module or shared disposable database.

Within each phase, tests precede behavior, contracts/schema precede repositories,
domain policy precedes routes/tools, and UI follows stable service DTOs. T011–T014
schema work is sequential. T050 baseline primitives precede T051 atomic decisions.
T072 creates live evaluation tooling before T073 runs it. T070 recovery and all
applicable disposable gates precede T077 Preview upgrade. T074 can run after all
story checkpoints; it does not depend on live provider availability.

## Parallel examples

- **US1**: T020 authoring integration, T021 HTTP contract, T022 diagram unit and
  T023 UI test authoring touch different files. UI execution waits for its domain.
- **US2**: T032 context integration, T033 fake-provider budget and T034 drafting
  contract/lifecycle tests can be authored together. Runtime context changes remain
  sequential because they share authorization and conversation modules.
- **US3**: T046 decision HTTP, T047 acceptance races and T048 WebKit journeys are
  independent test files. Run database-mutating suites serially unless each owns
  a distinct disposable clone.
- **US4**: T058 diff unit, T059 lifecycle integration and T060 revision/UI coverage
  can be authored in parallel. T062 and T063 share source/lifecycle integration
  with other phases and require coordinated edits.

## Implementation strategy

The smallest useful increment is US1: a durable manual plan and technical design.
US3 can then demonstrate human acceptance without waiting for a model service.
US2 adds bounded assistance; US4 adds controlled replacement and source lifecycle.
These are verification checkpoints, not permission to stop the authorized feature
with required tasks unfinished. Do not deploy at a checkpoint. The user requested
this planning-only handoff and will explicitly start implementation after changing
models. During implementation, record evidence as work completes; a checkbox is
not proof of runtime or hosted behavior.

## Requirement coverage

This authoring-time map supports the subsequent read-only analysis. It maps buildable
functional requirements and all measurable success gates; no runtime pass is claimed.

| Requirement | Tasks |
| --- | --- |
| FR-001 | T006, T007, T011, T015, T018, T020, T021, T026, T032, T035, T036, T053 |
| FR-002 | T015, T018, T020, T029, T032, T035, T036, T048, T049, T053, T056, T066 |
| FR-003 | T005, T007, T008, T020, T021, T024, T025, T026, T027, T075 |
| FR-004 | T006, T007, T011, T014, T016, T020, T021, T025, T026, T029, T060, T061, T062, T065 |
| FR-005 | T005, T008, T011, T017, T021, T024, T026, T027, T029, T036, T039, T040, T056, T066, T072 |
| FR-006 | T008, T017, T019, T024, T036, T040, T046, T047, T049, T051, T054, T072 |
| FR-007 | T006, T011, T017, T018, T019, T029, T038, T044, T053, T059, T061, T063, T065, T066 |
| FR-008 | T005, T009, T022, T024, T028, T040 |
| FR-009 | T005, T009, T022, T024, T027, T050, T055, T058 |
| FR-010 | T009, T022, T024, T027, T040, T055, T056, T075 |
| FR-011 | T010, T016, T021, T025, T026, T051, T052, T062 |
| FR-012 | T010, T012, T015, T046, T048, T049, T051, T052, T054, T056, T075 |
| FR-013 | T012, T047, T048, T050, T051, T053, T055, T056, T062, T075 |
| FR-014 | T006, T010, T012, T013, T016, T019, T025, T026, T034, T038, T039, T043, T046, T047, T051, T052, T062 |
| FR-015 | T012, T050, T058, T060, T061, T062, T065 |
| FR-016 | T013, T032, T034, T035, T036, T038, T039, T040, T041, T042, T044, T072, T076 |
| FR-017 | T010, T013, T033, T034, T037, T038, T041, T042, T043, T045, T064, T070, T072 |
| FR-018 | T039, T040, T045, T072 |
| FR-019 | T021, T023, T027, T028, T029, T030, T041, T042, T048, T054, T055, T060, T065, T071 |
| FR-020 | T006, T011, T013, T014, T018, T044, T059, T063, T064, T066, T070 |
| FR-021 | T010, T033, T037, T043, T064, T068, T069 |
| FR-022 | T001, T002, T003, T014, T015, T070, T076, T077 |
| FR-023 | T001, T003, T004, T031, T045, T057, T067, T071, T072, T073, T074, T076, T078 |
| SC-001 | T004, T020, T023, T031, T071, T074, T078 |
| SC-002 | T004, T018, T031, T032, T044, T059, T066, T074, T078 |
| SC-003 | T047, T057, T074, T078 |
| SC-004 | T018, T019, T044, T059, T063, T066, T067, T078 |
| SC-005 | T069, T078 |
| SC-006 | T033, T034, T037, T043, T045, T072, T073, T078 |
| SC-007 | T023, T031, T048, T057, T067, T071, T078 |
| SC-008 | T002, T070, T078 |

**Task count**: 78. **Breakdown**: Phase 1: 4, Phase 2: 15, US1: 12, US2: 14, US3: 12, US4: 10, Phase 7: 11.
