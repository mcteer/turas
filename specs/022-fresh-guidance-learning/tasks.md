# Tasks: Fresh guidance and retained learning

## Phase 1 — Setup

- [X] T001 Record clarified seven-day/automatic-research scope and research decisions in `specs/022-fresh-guidance-learning/{spec,plan,research}.md`.

## Phase 2 — Foundations

- [X] T002 Add seven-day, invalid-date and earlier-deadline tests in `tests/unit/retrieval-guidance-freshness.test.ts`; retain the original quality rubric.

## Phase 3 — US1: Current guidance

Independent test: recent support is reusable, older/unknown support requires research,
and expired public references cannot enter current guidance.

- [X] T003 [US1] Add optional UTC timestamp-or-null `guidanceRefreshAfter` in `lib/contracts/retrieval.ts` and compute/enforce it in `lib/server/retrieval/{context,quality-read,search}.ts`; filter current eligibility before ranking.
- [X] T004 [US1] Pass current/history intent through `agent/tools/search_evidence.ts` and `lib/server/conversations/practice-evidence.ts`; filter snapshot deadlines before limits in `lib/server/research/specialists/research-cache/practice-library.ts` and recheck at disclosure.
- [X] T005 [US1] Add old/future/unknown/current/history reference and default-mode coverage in `tests/integration/specialist-profile-persistence.test.ts` and `tests/contracts/retrieval-guidance-tool.test.ts`.
- [X] T006 [US1] Wire the automatic seven-day research behavior through `agent/instructions.md`, `agent/tools/search_evidence.ts`, research instructions/skills and `lib/server/research/specialists/solution-research/freshness.ts`; preserve admission, reuse/join and failure limits.

## Phase 4 — US2: Learning and history

Independent test: accepted historical evidence remains readable, shared learning
inherits current original-source deadlines, and existing checked research persists.

- [X] T007 [US2] Propagate original-source guidance deadlines in `lib/server/knowledge/quality.ts`, preserving conservative shared quality and review authority.
- [X] T008 [US2] Verify historical retrieval, source persistence and research reuse using `tests/integration/{retrieval-service,specialist-profile-persistence,legacy-research-cache-lifecycle}.test.ts`; document distinct claim age/check time in `docs/evidence-policy.md`.

## Phase 5 — US3: Physical cleanup

Independent test: 101 retired sources clear in two bounded passes, with current and
grace-period controls unchanged and source audit identities retained.

- [X] T009 [US3] Add a real runtime-role multi-batch regression in `tests/integration/retrieval-retention.test.ts`, then repair the selector in `lib/server/retrieval/cleanup.ts` to skip sources with no remaining passages.

## Phase 6 — Verification and release record

- [X] T010 Run narrow unit/contract/integration checks and typecheck under Node24; record results and representative agent cases in `specs/022-fresh-guidance-learning/validation.md`.
- [X] T011 Update `README.md`, `ROADMAP.md` and `docs/evidence-policy.md` with implemented behavior and limits.
- [ ] T012 Complete representative actual-agent evaluation, required CI/Preview and subsequent authorized Production verification; record exact source/deployment evidence in `specs/022-fresh-guidance-learning/validation.md` before claiming release completion.

## Dependencies and implementation strategy

T001 → T002 → T003/T004/T006 → T005/T007/T008; T009 is independent after setup.
T010/T011 follow all implementation; T012 is the separate release acceptance gate.
US1 is the first useful checkpoint. US2 retains existing governance; US3 can be
verified independently. Separate files allow unit-test preparation and cleanup
research in parallel, but edits to common quality/search files stay sequential.

## Requirement coverage

FR-001: T003–T005; FR-002: T002/T003/T006/T007; FR-003: T006/T008/T010/T012;
FR-004: T004/T005; FR-005: T007/T008; FR-006: T008/T009;
FR-007: T009; FR-008 and SC-001–004: T002/T005/T008–T012.

## Review follow-up — temporal consumption and compatibility

- [X] T013 [US1] Add `migrations/086-practice-guidance-expiry.cjs`, manifest/runtime grants and exact schema86; persist current-only deadlines in `lib/server/conversations/practice-guidance.ts`, fence expired output and retire it through the next `current-knowledge.ts` packet. Verify restart-independent reads and explicit history separately.
- [X] T014 [US2] Preserve MCP v1 strict quality and private shared lineage in `lib/server/{mcp,knowledge,retrieval}` projections; use `profileSourceDates` consistently in shared/plan quality and run their integration suites.
- [X] T015 Rehearse populated85→86 migration, grants and restore in an owned database and record rollout constraints in `validation.md`.

T013–T015 resolve review findings before T010/T012 completion. Automatic research
orchestration is model-driven and must be demonstrated in T012; the instruction
change in T006 alone does not establish FR-003/SC-002 acceptance.

- [X] T016 Repair CI regressions without changing production limits: concise root
  research instructions, legacy partner quality-shape compatibility and a fixed
  test clock for rate-limit bursts. Verify native, recovery, specialist and types.
- [X] T017 Preserve schema85 as an explicit historical recovery reader while86 is
  current; verify recovery contracts, future-schema denial and the pre-migration
  safety boundary in the populated migration rehearsal.
