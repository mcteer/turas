# Tasks: Eve runtime peer maintenance

## Phase 1 — Setup and Foundation

- [x] T001 Inventory PR56 and baseline in specs/023-eve-runtime-peers/research.md (FR-001).
- [x] T002 Specify capability adoption, exclusions and release constraints in specs/023-eve-runtime-peers/spec.md and plan.md (FR-001, FR-006).

## Phase 2 — US1: Private Diagnostics

Independent test: installed-SDK generation/stream/failure retains caller content while diagnostic channels omit it.

- [x] T003 [US1] Add installed-SDK telemetry privacy tests in tests/unit/runtime-peer-telemetry.test.ts (FR-003).
- [x] T004 [US1] Add shared policy in lib/server/models/telemetry.ts and use it in lib/server/research/specialists/solution-research/decision-workflow.ts, independent-search.ts and scripts/research-public-customers.ts (FR-002).

## Phase 3 — US2: Governed Runtime

Independent test: installed peer versions, existing budgets/cancellation, typecheck and both builds.

- [x] T005 [US2] Pin the two reviewed versions in package.json/package-lock.json without changing Eve/model (FR-004).
- [x] T006 [US2] Add heartbeat accounting regression to tests/unit/dependency-maintenance.test.ts; run existing budget/cancellation/privacy tests and unit/type/build checks, record results in specs/023-eve-runtime-peers/validation.md (FR-005).

## Phase 4 — Review and Release

- [x] T007 Update README.md and ROADMAP.md, run docs/credential inheritance checks and record source/evidence in specs/023-eve-runtime-peers/validation.md (FR-006).
- [x] T008 Prepare PR with complete CI, authenticated Preview profiles and inspected CLI WebKit captures; obtain maintainer review before merge (FR-006).
- [x] T009 Verify exact Production source/schema and changed research/conversation behavior after release, close superseded PR56 only after replacement is delivered, delete merged branch and verify main README (FR-006). Dependabot automatically closed PR56 after the replacement merge; final hosted acceptance and cleanup are recorded in validation.md.

## Dependencies and Strategy

T001→T002 precede implementation. T003 precedes T004, T005 precedes executing new SDK tests;
T004/T005 feed T006, then T007→T008→T009. US1 is the smallest privacy outcome; US2
qualifies its shared runtime. Independent read-only evidence gathering can run concurrently;
shared manifest installation and mutations stay sequential. No new agent runtime tasks.
