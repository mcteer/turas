# Tasks: Complete legacy backend parity

Input: spec.md, plan.md, research.md, data-model.md and contracts/backend-parity.md. All four P1 stories are required. A task is checked only after its stated work and verification complete.

## Phase 1: Setup

- [X] T001 Pin reference commit and author complete scope/design in specs/018-legacy-backend-parity/spec.md and plan.md (FR-001,FR-003,FR-009).
- [X] T002 Collect research/runtime/account source audits with hashes and current entry chains in ignored release artifacts (FR-001,FR-002).

## Phase 2: Foundation

- [X] T003 Reconcile every tracked legacy backend and consuming page/config/test into specs/018-legacy-backend-parity/inventory.json; classify pure presentation/data/test references explicitly, record exact current consumers and task links (FR-001,FR-002,FR-010).
- [X] T004 Trace root configuration, connections, policies and framework removals against installed docs; implement supported task-state equivalent and record connector disposition in docs/legacy-backend-parity-audit.md (FR-006,FR-009,FR-010).

## Phase 3: US1 — Consistent account knowledge

Independent test: identical retained sources produce original bounded selection and consistent profile/later tool results, with eligibility and dates preserved.

- [X] T005 [US1] Add failing integration replay covering8-source ordering,1600-character boundary, incidental later names, withdrawal and later reads in tests/integration/legacy-profile-products.test.ts (FR-004,FR-011).
- [X] T006 [US1] Restore shared recallPublicLearning consumer in lib/server/profiles/read.ts and source-reference mapping; preserve current authority and full-document storage (FR-004).
- [ ] T007 [US1] Verify actual retained DoorDash evidence before/after shared-reader port with profile/reload/account reader and record exact result in specs/018-legacy-backend-parity/validation.md (FR-004,FR-011).

## Phase 4: US2 — Research and reusable knowledge

Independent test: source library pages actual eligible metadata; research reuse/handoff/decision lifecycle retains original effects and authority.

- [X] T008 [US2] Add source-library pagination/latest-per-key/owner masking/withdrawal regressions in tests/integration/legacy-source-library.test.ts (FR-005,FR-011).
- [X] T009 [US2] Restore authorized library service and collection route app/api/customers/[id]/sources/route.ts with eligibility recheck in lib/server/research/specialists/research-cache/library.ts (FR-005).
- [X] T010 [US2] Restore current-themed library page and consumer under app/(app)/customers/[id]/sources and app/_components; add profile navigation and CLI WebKit checks (FR-005,FR-011).
- [X] T011 [US2] Execute existing specialist/cache/source-integrity/reuse/concurrent admission and maintenance suites; repair every discovered divergence in lib/server/research and agent/subagents (FR-005).
- [X] T012 [US2] Prove ordinary solution publication/application and account learning approval/invalidation/idempotency contracts, including5+4 suppression and5+5 means, through current integration and native consumers (FR-007,FR-011).

## Phase 5: US3 — Ordinary work

Independent test: original ordinary operations and private/runtime/context workflows execute with authorized real records, original bounds, exact retry and recovery semantics.

- [X] T013 [P] [US3] Add and fix live-customer title-search fresh-login/generation regression in lib/server/conversations/repository.ts and tests/integration; retain revoked-grant and stale-governed exclusions (FR-006,FR-011).
- [X] T014 [P] [US3] Restore ordinary get_portfolio_summary/get_capacity/get_engagement_brief/calculate_engagement_scenario adapters using lib/server staffing/execution/reporting repositories and deterministic legacy formulas; add real-domain permission/unknown/no-write regressions (FR-008,FR-011).
- [X] T015 [US3] Restore record_engagement_intervention adapter with explicit human exact decision, immutable scoped receipt and replay/conflict checks; add explicit migration/grants if existing records cannot represent it (FR-008,FR-009).
- [X] T016 [US3] Restore workspace context approvals queue/count/includeDenied via canonical profile authorization and reviewed revision commands; add API/page under app and integration/browser checks (FR-007,FR-011).
- [X] T017 [US3] Restore structured journey create/revise/retract/resubmit/history/share controls using lib/server/profiles canonical revisions; preserve private/internal/partner audiences and exact idempotency (FR-007).
- [X] T018 [US3] Verify journey long-source/tail match, later-than50 records, semantic failure lexical fallback, no-hit recent fallback and stale indexing cancellation; repair lib/server/profiles and retrieval lifecycle (FR-007,FR-011).
- [X] T019 [US3] Implement supported owner-bound staged native-file transport preserving10MiB/file without oversized base64 request, byte/digest retry and cleanup; test bounds, aggregate, cancellation and reload in lib/server/conversations and attachments UI (FR-006,FR-011).
- [ ] T020 [US3] Verify and enable supported hosted ordinary image/raw/parser-failed fallback through existing native-file policy with explicit deployment prerequisites; no fake extraction success (FR-006).
- [ ] T021 [US3] Execute native questions/corrections/Stop/reconnect/preferences/extraction owner and recovery suites, repairing every discovered legacy divergence (FR-006,FR-011).

## Phase 6: US4 — Exhaustive acceptance and release

- [X] T022 [US4] Reconcile all inventory dispositions and every finding to implemented source and actual evidence; zero actionable missing/partial mechanisms remain in docs/legacy-backend-parity-audit.md (FR-010).
- [ ] T023 [US4] Update README.md, ROADMAP.md and feature validation with actual status; run typecheck/docs/targeted domains/build and full exact-head CI, retaining failures and fixes (FR-011,FR-012).
- [ ] T024 [US4] Exercise changed workflows with authenticated real Preview HTTP and CLI WebKit desktop/mobile/reload, actual ordinary native consumers and independent review; preserve prior model charges/holds and bounded scope (FR-011).
- [ ] T025 [US4] Back up and rehearse explicit schema/grants if required, verify target and old/new compatibility, merge green exact head, verify actual Production commit/schema/authenticated behavior, clean merged branch and verify README on main (FR-012).

- [X] T026 [US4] Restore any remaining backend consumer gaps discovered by complete root-page/config audit, including customer-directory signal filtering and operating-plan/portfolio consumers, with current-themed authorized UI and original calculations (FR-001,FR-003,FR-008,FR-010).

- [X] T027 [US3] Restore native POST login fallback in app/login/login-form.tsx and app/api/auth/login/route.ts so pre-hydration submission never places credentials in URLs; verify invalid/valid JavaScript-disabled form login and current origin/safe return path through tests/ui/legacy-login-native.spec.ts (FR-006,FR-009,FR-011).

## Dependencies and execution

T001–T002 complete. T003–T004 foundation feeds all stories; source comparison may continue while focused regressions are prepared. T005 precedes T006 then T007. T008 precedes T009 then T010. T011–T012 require original contracts and complete before hosted acceptance. T013 and T014 can run independently in different files; T015 follows ordinary adapter contracts. T016 precedes T017 then T018. T019 precedes T020. T021 runs after relevant runtime changes. T022 gates T023–T025. Never parallelize edits to same files or mutate hosted environments concurrently.

Parallel example: conversation repository search regression and ordinary delivery read adapters use independent source/tests; research source-library work can proceed separately after shared product-reader changes settle. Implement each original mechanism then validate its observable effects. Partial story completion is progress only, never completion of the user request.

- [X] T028 [US3] Restore inspectable native approval action inputs in lib/chat-inputs.ts and app/_components/chat-input-request.tsx; retain exact authenticated responder session, durable approval continuation, actual original tool execution and current-theme desktop/mobile/reloaded review. Verify actual operations and reusable-knowledge native controls (FR-007,FR-009,FR-011).
