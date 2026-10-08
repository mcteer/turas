# 011 Planning Handoff

Historical planning record. Implementation is now active; see [tasks.md](tasks.md) and [validation.md](validation.md) for current status.

**Date**: 2026-10-08
**Branch**: `011-product-expansion`
**Worktree**: `/Users/mcteer/Projects/turas-011`
**Base**: main `187b05731bcf83f96826a544dee5a59d3c95ec18`
**Scope**: Specify → clarify → plan → tasks → read-only analyze, then stop for model switch.

## Resume here

```sh
cd /Users/mcteer/Projects/turas-011
export SPECIFY_FEATURE_DIRECTORY=specs/011-product-expansion
```

Read [spec.md](spec.md), [plan.md](plan.md), [tasks.md](tasks.md) and the linked
contracts, then use `$speckit-implement` when the user starts implementation.
Do not start from the original dirty `/Users/mcteer/Projects/turas` checkout or copy
its unrelated changes. The older 010/archiving worktrees are references, not this branch.
The ignored `.specify/feature.json` points here locally; the explicit environment
variable above is the portable feature selector.

## Decisions and readiness

- One clarification answered: the designated internal account owner makes qualify,
  defer, dismiss and reopen decisions; mcteer manages per-customer assignments.
- No owner backfill or administrator override. Owner reassignment invalidates pending
  reviews and requires the new owner to review earlier qualifications.
- Internal-only 011; partners continue using separately governed delivery features.
- Public research supports attributed discovery. Qualified hypotheses require reviewed
  customer need and current product evidence; no inferred adoption, intent or sales.
- Proposed edits never inherit an older qualification. Deferred/dismissed state survives
  new evidence and text cleanup until explicit owner action.
- Transparent categorical ranking, exact sources, opaque duplicate suppression and
  bounded native advice reuse current domain policy. Root model file remains unchanged.
- 51 unchecked tasks: setup/foundation 9; US1 8; US2 7; US3 6; US4 11; cross-cutting 10.
  Four test-definition tasks have explicit parallel opportunities. US1 is the MVP
  demonstration; all four stories and their acceptance gates are required for 011.

## Validation boundary

Specification quality: 16/16 checklist items, no unresolved markers. Exact C01–C16
constraints appear in tasks, IDs are sequential and every task names implementation
or validation paths. `npm run check:docs` and `git diff --check` are the planning checks.
The final read-only analysis report is returned in the conversation after all artifacts
are frozen; it does not rewrite these files or imply implementation has passed.

No application code, dependency, schema, selected database, live model, customer
record or deployment was changed. Planned validation commands are explicitly future
interfaces in [quickstart.md](quickstart.md); none is claimed to have passed yet.
Reconfirm provisional migration numbers 046/047 against main before implementation.
Live actual-output review requires explicit live-evaluation authorization and budget;
Preview/Production rollout and hosted evidence remain separate later work.

## Requirement-to-task map

| Requirement | Primary tasks |
| --- | --- |
| FR-001 Scope | T004–T006, T014–T017 |
| FR-002 Authorization | T006–T009, T018–T024, T032–T041, T048 |
| FR-003 Owner authority | T005–T006, T018–T019, T023–T024 |
| FR-004 Complete hypothesis | T010–T014, T016–T017 |
| FR-005 Provenance and unknowns | T008, T010, T012–T017, T021, T033–T034, T039, T044 |
| FR-006 Product identity | T010–T012, T016–T017 |
| FR-007 Immutable revisions | T004–T005, T009, T014, T018, T020, T022–T024 |
| FR-008 Qualification | T013, T018, T020–T024 |
| FR-009 Dispositions | T018, T020, T022–T026, T034, T041 |
| FR-010 Ranking | T025–T026, T030 |
| FR-011 Duplicates | T005, T011, T014, T025, T027, T030, T039, T041 |
| FR-012 Source lifecycle | T008, T014, T017, T019, T021–T022, T025–T030, T033, T036–T038, T047–T048 |
| FR-013 Delivery links | T028, T030, T048 |
| FR-014 Replay/concurrency | T004–T005, T007, T009, T015, T017–T020, T022–T024, T027, T039, T041, T047 |
| FR-015 Advice | T031–T035, T037, T040–T042, T044 |
| FR-016 Limits/recovery | T031–T033, T035–T038, T040–T042, T044, T047 |
| FR-017 Human save | T039–T041 |
| FR-018 UI | T003, T016–T017, T023–T024, T030, T040–T041, T049 |
| FR-019 Bounds | T007–T010, T014–T015, T026, T030–T031, T033, T046 |
| FR-020 Retention | T005, T009, T025, T027, T029, T032, T037–T038, T047 |
| FR-021 Telemetry | T007, T009, T015, T029, T036–T038, T044 |
| FR-022 Migration/disable | T002, T005–T007, T009, T029, T032, T038, T043, T047, T050 |
| FR-023 Verification | T001–T003, T009, T042–T051 |
| FR-024 Exclusions/model | T001, T034–T036, T041–T042, T048, T050–T051 |
| SC-001 Human journey | T017, T024, T049 |
| SC-002 Denial/source | T006, T008–T009, T017–T018, T024–T025, T028, T030, T041, T048–T049 |
| SC-003 Ordering | T025–T026, T030, T049 |
| SC-004 Exactly-once/recovery | T007, T009, T018, T024, T041–T042, T047–T049 |
| SC-005 Performance | T046, T049 |
| SC-006 Actual output | T041–T042, T044–T045, T049 |
| SC-007 Browser acceptance | T003, T017, T024, T030, T041, T043, T049 |
| SC-008 Persistence/isolation | T001–T003, T009, T025, T029, T043, T047–T049 |
