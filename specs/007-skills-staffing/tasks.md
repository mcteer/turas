# Tasks: Skills, staffing and services operations

**Input**: `specs/007-skills-staffing/spec.md`, `plan.md`, `research.md`, `data-model.md`, the four contracts and `quickstart.md`.

**Status**: Local implementation and validation complete through T076. Preview is at schema 034. PR 13 is open and review-head CI passed; see `validation.md`.

**Format**: `- [ ] Tnnn [P?] [USn?] action with exact paths`. `[P]` permits separate-file work only after the listed phase prerequisites; it is not permission to run unsafe database work concurrently. Tests are required by FR-023 and constitution VII. Read AGENTS.md and the installed relevant Next/eve docs before framework changes. Preserve existing work, the selected database/eve state, and `spacexai/grok-4.7` with reasoning `low`.

**Evidence rule**: Record actual checks in `specs/007-skills-staffing/validation.md` as they run. A passing focused check does not close the full suite, UI, live, load, recovery or Preview gate. Never connect to Production, link Vercel, deploy, or use the host browser. All destructive checks run through owned-clone/marked-test guards. Quoted C01–C14 clauses below are normative field constraints from `data-model.md`.

## Phase 1: Setup and disposable validation infrastructure

Goal: prepare safe implementation and reproducible evidence without touching configured Preview or Production. Complete T001 before using any new runner; T002 precedes clone-dependent work.

- [X] T001 Create the implementation evidence log at `specs/007-skills-staffing/validation.md`, record starting Git/code state and known schema boundary, and document the exact planned environment/check sequence from `specs/007-skills-staffing/quickstart.md`; record no unrun result as passing (FR-022, FR-023).

- [X] T002 Implement `scripts/staffing-eval-environment.ts` around `scripts/plan-eval-environment.ts` with marker-verified owned DB cleanup and isolated workforce/artifact roots, worker heartbeat, ports and eve data; add rejection/cleanup tests in `tests/integration/staffing-environment.test.ts` for Preview/Production targets, foreign markers and failed setup (FR-022, SC-008).

- [X] T003 Add `scripts/test-staffing.ts` and package scripts in `package.json`; enumerate every staffing unit/contract/integration test file, fail on an orphaned file, exclude clone-only staffing suites from generic integration/contract scripts, and wire the isolated suite into `.github/workflows/ci.yml` without live provider keys (FR-023, SC-008).

- [X] T004 Add synthetic factories in `tests/fixtures/staffing/seed.ts`, a real-review journey builder in `tests/fixtures/staffing/journey.ts`, and exact arithmetic vectors in `tests/fixtures/staffing/arithmetic.ts`; separate benchmark seeding from the journey that must use actual 003–006 approval/acceptance paths (FR-023, SC-001, SC-004, SC-005).

## Phase 2: Foundation and authority

Blocking prerequisites for every story. Storage and policy tests must cover the current canonical principal, not login-name equality or a broad admin role. Migrations are explicit and run only inside disposable scope here.

- [X] T005 [P] Write schema/role/readiness tests in `tests/integration/staffing-schema.test.ts` for empty and schema-031 upgrades, composite scope FKs, immutable revisions/decisions, restricted payload purge, stable resource/date locks and current-head uniqueness (FR-001, FR-022, SC-008).

- [X] T006 [P] Write policy/envelope tests in `tests/contracts/staffing-policy.test.ts` covering mcteer, panel, partner, second admin, disabled principal/member/session/workspace, cross-scope IDs, no delegation and safe errors before retrieval (FR-001, FR-014, FR-021, SC-002).

- [X] T007 Implement shared strict envelopes, authority projections and pagination/error limits in `lib/contracts/staffing.ts`; add boundary vectors to `tests/unit/staffing-contracts.test.ts` (FR-001, FR-021).

  C01 (verbatim): “IDs are UUIDs; environmentId and workspaceId are required; revision and aggregateVersion are positive safe integers; digests are lowercase 64-character SHA-256 hex; timestamps are ISO 8601 with offsets; business dates are valid YYYY-MM-DD in 2000–2100; requestKey is 8–128 ASCII letters/digits/underscores/hyphens; rationale is trimmed 1–2000 characters; unknown properties are rejected; revision payload is at most 131072 UTF-8 bytes; contractVersion is staffing-v1.”

  C02 (verbatim): “Staffing-manager and finance actions each require the canonical mcteer principal, a current active internal/admin membership in the same workspace, an active principal/workspace and a live owned login session; another admin is denied; no delegation endpoint or capability grant table exists in 007; internal members may propose customer demand and allocations; partners may only read confirmed delivery-safe assignments on currently granted delivery engagements.”

  C14 (verbatim): “Lists use pageSize 1–50 default 20 and an opaque scope-bound cursor; ordinary writes are limited to 30/minute per membership/workspace and imports to five starts/minute; batch operations are atomic within their explicit limits; error responses contain safe code/message/correlationId without private values or existence/count leaks; telemetry permits operation kind, outcome, duration, counts, scoped opaque IDs, conflict category and model usage, but excludes names, evidence, filenames, leave details, prompts, rates and money; API and agent reads return server projections and never unrestricted row JSON.”

- [X] T008 Add `migrations/032-workforce-competencies.cjs` for workforce/source/import/competency groups and scope/identity/immutable-history constraints in `specs/007-skills-staffing/data-model.md`; reserve distinct payload ownership and quota/lease indexes (FR-002, FR-003, FR-004, FR-005, FR-006, FR-022).

- [X] T009 Add `migrations/033-staffing-allocations.cjs` for approved calendars, exact baseline-bound demand, stable resource/date and demand/date rows, immutable allocation/preview/decision/receipt history and current lookup indexes (FR-008, FR-009, FR-011, FR-012, FR-013, FR-022).

- [X] T010 Add `migrations/034-staffing-economics-advisory.cjs` for finance inputs/policy/scenarios and bounded advisory bindings/attempts/dependencies/model receipts; register 032–034 in `migrations/manifest.json` and narrow grants in `scripts/db-role-setup.sql`, with no delegated capability tables (FR-016, FR-017, FR-019, FR-020, FR-022).

- [X] T011 Implement current canonical mcteer and scoped internal/partner checks in `lib/server/staffing/policy.ts`; add feature-specific schema-034 readiness and `TURAS_007_DISABLED` handling in `lib/server/staffing/repository.ts` without changing the global schema minimum; preserve eligible reads, cancellation, reconciliation and cleanup while disabled (FR-001, FR-014, FR-022).

- [X] T012 Implement digest-bound commands, rate reservations, authorized terminal receipt replay and bounded transaction handling in `lib/server/staffing/commands.ts`; expose actor-only reconciliation in `app/api/staffing/commands/[requestKey]/route.ts`; follow `specs/007-skills-staffing/contracts/staffing-api.md` lock order and never hold DB locks across external IO (FR-012, FR-021).

- [X] T013 Run the disposable schema/policy/environment suites from `scripts/test-staffing.ts`, including immutable-role denial and feature readiness/write-disable checks, and record exact target/counts/cleanup in `specs/007-skills-staffing/validation.md` before starting story implementation (FR-001, FR-022, FR-023, SC-002, SC-008).

## Phase 3: User Story 1 — Reviewed competency roster (P1)

Goal: mcteer can create resources/skills, import private structured evidence and decide exact candidates. Independent test: a real synthetic two-sheet workbook resolves ambiguous identities and accepts selected rows with original cell lineage; unaccepted or withdrawn rows never become eligible. Depends on Phase 2.

- [X] T014 [P] [US1] Write real CSV/XLSX import fixtures and scanner/parser tests in `tests/integration/staffing-imports.test.ts`, including hidden/merged/shared-formula cells, 1900/1904 dates, locale correction, duplicate identities, malicious text, oversized/partial extraction, failed scan and no customer-RAG publication (FR-004, FR-005, FR-023, SC-001, SC-002).

- [X] T015 [P] [US1] Write exact review/source race tests in `tests/integration/staffing-competencies.test.ts` for manual/imported candidates, changed digest/head, atomic bulk rollback, replay after revocation, correction/supersession, fresh approval of old evidence, withdrawal with cleanup paused and old cleanup after replacement (FR-003, FR-005, FR-006, FR-007, SC-002).

- [X] T016 [US1] Implement resource/taxonomy contracts and canonical registry services in `lib/contracts/staffing.ts`, `lib/server/staffing/resources.ts` and `lib/server/staffing/skills.ts`; verify optional member identity is unique even when inactive and partner eligibility is explicit and dated (FR-002, FR-003, FR-014).

  C03 (verbatim): “A resource has displayName 1–160 characters, externalKey 1–100 ASCII letters/digits/underscores/hyphens unique per workspace, kind internal or partner, state active or inactive, nullable unique membershipId, IANA timezone, and regionCode 1–32 ASCII letters/digits/hyphens; partner resources require an active same-workspace partnerOrganizationId and explicit dated customer eligibility, plus any linked member's current customer grant; skill key matches [a-z][a-z0-9_-]{0,63}, name is 1–160 characters, definition is 1–2000 characters, and state is active or retired; levels are 0 unassessed, 1 assisted, 2 independent, 3 advanced, 4 mentor.”

- [X] T017 [US1] Implement strict upload/map/candidate contracts in `lib/contracts/staffing-imports.ts` and `tests/unit/staffing-import-contracts.test.ts`, including explicit mapping, literal correction and bounds that cannot be bypassed by multipart/chunked bodies (FR-004, FR-021).

  C04 (verbatim): “A workforce import accepts one UTF-8 CSV or XLSX original of at most 10485760 bytes, 20 sheets, 50000 cells, 5000 candidate rows and 500000 extracted code points; scan timeout is 30 seconds, parse timeout 90 seconds and attempt deadline 120 seconds; at most two open imports per manager and ten queued/running imports per workspace; original storage quota is 1 GiB per workspace; mapping covers one explicitly selected table range per sheet with fixed header and mapped columns; hidden/merged/formula cells and partial coverage are explicit; partial extraction cannot be approved; formula or cached-result identity/level/date inputs require a corrected literal candidate; CSV date convention is ISO, DMY or MDY selected explicitly, and XLSX serial dates retain the 1900/1904 date system with impossible dates rejected.”

  C05 (verbatim): “A candidate binds exact resourceId, skillId, sourceVersionId or manualEvidenceId, extractionRunId when imported, mappingRevisionId when imported, rowKey, contentDigest and locators; level is an integer 0–4; assessmentDate is not future-dated; evidence text is 1–4000 characters; nextReviewDate is required and not before assessmentDate; states are pending, accepted, rejected, superseded or retracted; only one current accepted competency per resource/skill exists; manual evidence is a dated accountable assessment note with no remote fetch; approval binds the exact candidate revision and source generation; one bulk decision covers 1–100 rows atomically and duplicate resource/skill rows in that decision are rejected.”

- [X] T018 [US1] Add versioned structured-table mode in `packages/artifact-extractor/src/main.ts`, `packages/artifact-extractor/src/spreadsheet.ts`, `packages/artifact-extractor/src/text.ts`, `packages/artifact-extractor/src/types.ts` and additive `lib/contracts/artifacts.ts`; retain typed/raw cells, hidden/merged/formula flags, date system, exact locators and complete coverage without changing existing 004 outputs (FR-004, FR-005).

- [X] T019 [US1] Implement the separate private workforce original/result store in `lib/server/staffing/store.ts` and intent/upload/finalization in `lib/server/staffing/imports.ts`; reserve quota atomically, verify actual digest/scan/MIME, return reconcilable receipts and deny original reads until clean/current (FR-001, FR-004, FR-006, FR-021).

- [X] T020 [US1] Implement leased scan/parse/publication and cancellation in `lib/server/staffing/jobs.ts`; use existing isolated images outside transactions and recheck authority, source generation and lease token at publication; add the separate workload/heartbeat to `scripts/maintenance-worker.ts` and `scripts/dev.mjs` (FR-004, FR-006, FR-021).

- [X] T021 [US1] Implement exact table mapping, identity correction, manual assessments, atomic accept/reject/retract and one current competency in `lib/server/staffing/competencies.ts`; no fuzzy name matching, formula execution, automatic acceptance or partial-batch approval (FR-003, FR-004, FR-005, FR-007).

- [X] T022 [US1] Implement immediate eligibility/withholding and exact-generation retention in `lib/server/staffing/lifecycle.ts` and `lib/server/staffing/cleanup.ts`; hook bounded worker cleanup without letting artifact orphan cleanup own workforce files (FR-006, FR-021, FR-022).

  C13 (verbatim): “Source, revision, decision, request-digest and lineage identities are immutable; personnel prose, filenames, cells and extracted payloads are separately purgeable; withdrawal disables current reads and dependent staffing/advisory eligibility synchronously, while cleanup deletes only exact retired generations; pending/cancelled/rejected import payloads expire after 30 days and withdrawn payloads are purged within 24 hours of the next healthy worker run; accepted evidence is retained until withdrawn; audit metadata/decision IDs survive without original text; worker lease is 30 seconds with heartbeat every 10 seconds, at most three automatic pre-publication scan/parse retries for transient infrastructure failure, and no retry of a cancelled/withdrawn source; cleanup claims at most 20 jobs per tick; import authority is rechecked at claim and publication, while retention cleanup uses scoped maintenance authority and exact source ownership/generation and continues after uploader revocation.”

- [X] T023 [US1] Implement manager and operational resource/skill/competency DTOs in `lib/server/staffing/read.ts`; test hidden evidence, filenames, private source errors and role changes in `tests/contracts/staffing-projections.test.ts`, including non-disclosing pagination/counts (FR-001, FR-006, FR-014, SC-002).

- [X] T024 [US1] Add thin registry/review routes at `app/api/staffing/resources/route.ts`, `app/api/staffing/resources/[resourceId]/route.ts`, `app/api/staffing/resources/[resourceId]/eligibility/route.ts`, `app/api/staffing/skills/route.ts`, `app/api/staffing/skills/[skillId]/route.ts`, `app/api/staffing/competencies/route.ts`, `app/api/staffing/competencies/[competencyId]/revisions/route.ts` and `app/api/staffing/competency-decisions/route.ts` per the API contract (FR-002, FR-003, FR-005, FR-014).

- [X] T025 [US1] Add thin import routes at `app/api/staffing/imports/route.ts`, `app/api/staffing/imports/[importId]/route.ts`, `app/api/staffing/imports/[importId]/content/route.ts`, `app/api/staffing/imports/[importId]/complete/route.ts`, `app/api/staffing/imports/[importId]/cancel/route.ts`, `app/api/staffing/imports/[importId]/mappings/route.ts` and `app/api/staffing/imports/[importId]/rows/route.ts`; expose exact source withdrawal through the contracted import action (FR-004, FR-005, FR-006, FR-021).

- [X] T026 [US1] Build roster/resource/skill review UI in `app/_components/staffing/roster.tsx`, `app/_components/staffing/resource-detail.tsx`, `app/(workspace)/staffing/resources/page.tsx` and `app/(workspace)/staffing/resources/[resourceId]/page.tsx`; show approved summary versus manager-only evidence with explicit identity and freshness (FR-002, FR-003, FR-014, FR-018).

- [X] T027 [US1] Build upload/mapping/correction/exact-row review and cancel UI in `app/_components/staffing/import-review.tsx`, `app/(workspace)/staffing/imports/page.tsx` and `app/(workspace)/staffing/imports/[importId]/page.tsx`; preserve dirty input, show partial coverage and reconcile uncertain writes without persisting personnel in browser storage (FR-004, FR-005, FR-018, FR-021).

- [X] T028 [US1] Add real HTTP/UI import tests in `tests/contracts/staffing-import-api.test.ts` and `tests/ui/staffing-imports.spec.ts`; run focused US1 tests and affected 004 parser/cleanup regressions through owned scope and record evidence in `specs/007-skills-staffing/validation.md` (FR-023, SC-001, SC-002, SC-007).

## Phase 4: User Story 2 — Dated demand and explained matches (P1)

Goal: an internal lead qualifies exact accepted-baseline demand and compares current resource feasibility. Independent test: reviewed roster/calendar matches change deterministically after skill, leave and review-date changes. Depends on US1; calculation fixtures can be authored in parallel after Phase 2.

- [X] T029 [P] [US2] Write calendar/freshness vectors in `tests/unit/staffing-calendar.test.ts` and `tests/unit/staffing-freshness.test.ts` for unions/deductions, DST gap/fold/straddle, cross-zone overlap, month/leap boundaries, future certified coverage, 7/14 and 90/180-day edges, explicit review dates, missing/zero/negative time and approval not refreshing evidence age (FR-007, FR-008, FR-015, SC-004).

- [X] T030 [P] [US2] Write demand/matching domain tests in `tests/integration/staffing-matching.test.ts` for exact baseline/work-package checks, hidden/ineligible sources, hard-constraint reasons, partner grants, whole-period skill validity, stale cursor/result expiry, deterministic tie breaks and no cost/protected-attribute influence (FR-009, FR-010, FR-014, SC-002).

- [X] T031 [US2] Pin `@js-temporal/polyfill` 0.5.1 in `package.json` and `package-lock.json` after license review; implement exact interval conversion, capacity arithmetic and freshness in `lib/staffing/calendar.ts` and `lib/staffing/freshness.ts` with the project Node24 runtime and all quoted calendar constraints (FR-007, FR-008, SC-004).

  C06 (verbatim): “Calendar revisions cover 1–91 inclusive resource-local dates and contain at most 8 contracted intervals per date with minute-resolution half-open endpoints; cross-midnight inputs are split into local dates; local endpoints require a valid IANA timezone and reject ambiguous/nonexistent times unless a valid explicit offset resolves ambiguity; resolved UTC endpoints and runtime timezone-data version are retained; daily contracted elapsed time is at most 960 minutes; holidays, approved leave and protected time are interval sets with at most 16 entries per date; leave reason is an optional manager-only category, never medical free text; observedAt is not future-dated and certification covers an explicit date interval; availability is recent through 7 days and aging through 14 days at decision time, shortened by a required nextReviewAt not before observedAt; competencies are recent through 90 days and aging through 180 days, shortened by nextReviewDate, and must be eligible through the work interval; later unavailability creates visible needs-review state without deleting confirmed time.”

  C10 (verbatim): “Formula version is staffing-capacity-v1; contracted minutes measure the union of resolved working intervals; available minutes subtract the union of holiday and approved-leave intersections; protected minutes measure protected intervals intersected with remaining availability; schedulable remaining equals available minus protected minus confirmed minutes; tentative minutes are separate; negative remaining is retained; planned billable allocation ratio is confirmed billable minutes divided by available minutes, rounded half up to two percentage decimals, and is null with reason zero_available when the denominator is zero; actual utilization is unavailable; every result includes period, resource timezone, asOf and input revision IDs.”

- [X] T032 [US2] Implement approved calendar revisions/current per-date selection in `lib/server/staffing/calendars.ts` and `app/api/staffing/resources/[resourceId]/calendar/route.ts`; preserve confirmed history, retain resolved timezone identity and expose later reductions as needs-review/overload under the shared lock order (FR-007, FR-008, FR-013).

- [X] T033 [US2] Implement exact-baseline demand lifecycle in `lib/server/staffing/demands.ts` and strict demand contracts in `lib/contracts/staffing.ts`; distinguish a changed working draft from baseline replacement and retain old allocation bindings on demand edits (FR-009, FR-011, FR-013).

  C07 (verbatim): “Demand binds customerId, nullable workloadId, engagementId, baselineId, planRevisionId, baselineDigest and one workPackageKey; title is 1–160 characters and role is 1–100 characters; required and desired skill lists each contain at most 20 unique active skill IDs with minimumLevel 1–4 and no skill duplicated across lists; required skills contain at least one entry; a demand covers 1–91 dates and has 1–960 requiredMinutes on each working date with at most 87360 total minutes; service dates are labels interpreted in each candidate resource timezone, not fixed UTC appointments; overlap constraint is absent or one explicitly zoned IANA demand-time interval per service date plus minimumOverlapMinutes 1–960 measured against that resource day, and allowedRegions contains at most 20 region codes; billable is boolean; states are draft, qualified, fulfilled or cancelled; qualification requires the current readable accepted baseline without reviewRequired; confirmation dates cannot precede today in the resource timezone; editing demand creates a draft revision while existing allocations retain the previous binding.”

- [X] T034 [US2] Implement batched authorized matching in `lib/server/staffing/matching.ts` and pure ranking in `lib/staffing/matching.ts`; bind results/cursors to current input generations, show every unknown/failing constraint and refuse unsupported overflow rather than silently rank an incomplete pool (FR-006, FR-007, FR-010, FR-021).

  C08 (verbatim): “Matching evaluates at most 500 active visible resources for one exact demand revision over at most 91 dates and returns at most 50 rows per page; status is eligible, needs_review or ineligible with typed reasons for every hard constraint; eligible candidates cover the full requested daily minutes, required skill levels, explicit region/overlap constraint and current partner eligibility; sort eligible rows by desired-skill count descending, minimum daily remaining minutes after the request descending, then resourceId ascending; needs_review and ineligible groups follow in that order and sort by resourceId; no cost, protected attribute or model score enters ranking; result identity binds demand, input versions, formula version and asOf, and expires after 10 minutes or any dependency change, whichever occurs first.”

- [X] T035 [US2] Add demand routes at `app/api/staffing/demands/route.ts`, `app/api/staffing/demands/[demandId]/route.ts`, `app/api/staffing/demands/[demandId]/qualify/route.ts`, `app/api/staffing/demands/[demandId]/cancel/route.ts` and `app/api/staffing/demands/[demandId]/matches/route.ts`; verify strict scope/version/status contracts in `tests/contracts/staffing-demand-api.test.ts` (FR-009, FR-010, FR-011).

- [X] T036 [US2] Build `app/_components/staffing/calendar-editor.tsx`, `app/_components/staffing/demand-editor.tsx`, `app/_components/staffing/matches.tsx` and `app/(workspace)/customers/[customerId]/engagements/[engagementId]/staffing/page.tsx`; label resource-local service dates and separately zoned overlap, all constraint reasons and current baseline/source warnings (FR-007, FR-008, FR-009, FR-010, FR-018).

- [X] T037 [US2] Add keyboard/calendar/demand/match tests in `tests/ui/staffing-matching.spec.ts`, run focused US2 domain/HTTP/WebKit checks on owned scope, and record exact arithmetic and eligibility evidence in `specs/007-skills-staffing/validation.md` (FR-023, SC-002, SC-004, SC-007).

## Phase 5: User Story 3 — Human-confirmed allocation (P1)

Goal: proposals and expiring reservations become current commitments only through exact mcteer review. Independent test: competing confirmations consume capacity once, replay is idempotent and cancel/baseline changes preserve history. Depends on US2; this is the first end-to-end staffing commitment checkpoint.

- [X] T038 [P] [US3] Write decision race tests in `tests/integration/staffing-decisions.test.ts` for competing first resource/date and demand/date writes, cross-resource amendment/cancel, old/new ledger union, same-key/different-input replay, expired preview and post-ledger rollback (FR-011, FR-012, FR-013, SC-003).

- [X] T039 [P] [US3] Write ordered lifecycle race tests in `tests/integration/staffing-lifecycle.test.ts` for confirmation versus calendar/source/competency/baseline/grant change, authority revoke before replay, changed pointer discovered after locking, canceled/reduced demand still counting old revisions, release after withdrawal and already-confirmed needs-review capacity (FR-001, FR-006, FR-007, FR-012, FR-013, SC-002, SC-003).

- [X] T040 [US3] Implement proposal/reservation/expiry/revision state in `lib/server/staffing/allocations.ts` and allocation contracts in `lib/contracts/staffing.ts`; keep tentative contention separate, allow same-day direct confirmation via preview, and keep old commitments counted across demand revisions (FR-011, FR-012, FR-013).

  C09 (verbatim): “An allocation proposal binds one resource, one demand revision and 1–91 resource-local dates with integer minutes 1–960 per date; states are proposed, tentative, confirmed, released, cancelled or expired; tentative expires at the earlier of creation plus seven days or the first work date's local midnight; a reservation whose expiry is already reached is rejected; confirmed remains capacity-consuming when needsReview is true; confirmation, amendment, release and cancellation require mcteer, an exact revisionId/contentDigest/expectedAggregateVersion, rationale, requestKey and a reviewPreviewId valid for ten minutes; preview binds actor session, demand/baseline, source/calendar/capacity generations and the union of old/new resources/dates for amendment; confirmed time may not exceed either resource schedulable time or remaining demand minutes; the demand/date ledger counts confirmed time across all revisions of the stable demand identity until explicit release or replacement; release/cancel may remove today-or-later commitments using authorized identity-only history even if source/baseline eligibility is lost, without requiring renewed feasibility; past ledger dates are immutable; no overload override or retroactive confirmation exists; cancelling an unconfirmed own proposal is allowed to its internal author.”

- [X] T041 [US3] Implement exact review previews and confirmation/amendment/release/cancel in `lib/server/staffing/decisions.ts` using the complete ordered transaction in `specs/007-skills-staffing/contracts/staffing-api.md`; recheck all authority/lineage/calendar/baseline inputs and both daily limits for new/replacement commitments, allow authorized identity-only release after lost eligibility, credit replacements only inside the transaction and reconcile unknown commit outcomes (FR-001, FR-006, FR-007, FR-012, FR-013, SC-003).

- [X] T042 [US3] Extend `lib/server/staffing/lifecycle.ts`, `lib/server/staffing/read.ts` and `scripts/maintenance-worker.ts` with current allocation needs-review projection and reservation expiry; source or calendar changes never rely on a worker to block invalid new commitments or erase existing capacity (FR-006, FR-011, FR-013, FR-021).

- [X] T043 [US3] Add thin allocation routes at `app/api/staffing/allocations/route.ts`, `app/api/staffing/allocations/[allocationId]/revisions/route.ts`, `app/api/staffing/allocations/[allocationId]/reserve/route.ts`, `app/api/staffing/allocations/[allocationId]/cancel-proposal/route.ts`, `app/api/staffing/allocations/[allocationId]/review-preview/route.ts` and `app/api/staffing/allocations/[allocationId]/decisions/route.ts`; test all action/receipt states in `tests/contracts/staffing-allocation-api.test.ts` (FR-011, FR-012, FR-013, FR-021).

- [X] T044 [US3] Add confirmed delivery-safe assignment projection to `lib/server/engagements/read.ts` and `app/_components/plans/engagement-detail.tsx`; verify current partner grant, hidden baseline/source and no roster/evidence/other-customer/cost/count leaks in `tests/contracts/staffing-partner.test.ts` (FR-001, FR-006, FR-014, SC-002).

- [X] T045 [US3] Build exact preview/propose/reserve/confirm/amend/release/cancel UI in `app/_components/staffing/allocation-review.tsx`; show old/new daily effects, tentative expiry and needs-review, require rationale, reload on conflict and reconcile unknown saves without blind retry (FR-011, FR-012, FR-013, FR-018).

- [X] T046 [US3] Add concurrency/partner/source-withdrawal UI tests in `tests/ui/staffing-allocations.spec.ts`, run the full focused decision/lifecycle/HTTP cases and initial trusted-plan-to-confirmation path, and record counts/race outcomes in `specs/007-skills-staffing/validation.md` (FR-023, SC-001, SC-002, SC-003, SC-007).

## Phase 6: User Story 4 — Planned operations and restricted economics (P2)

Goal: reproducible planned capacity and finance-only scenarios with explicit missing inputs and policy approval. Independent test: exact synthetic values remain reproducible across rate/month changes, missing cost and split-allocation rounding. Depends on confirmed allocations from US3; pure arithmetic tests can be authored after Phase 2.

- [X] T047 [US4] Write independent expected-value vectors in `tests/unit/staffing-economics.test.ts` for currency exponents, rate boundaries, split/merge rounding invariance, numeric bounds, negative contribution, zero margin denominator and missing/mixed inputs; extend `tests/unit/staffing-calendar.test.ts` with the planned ratio denominator (FR-015, FR-016, FR-017, SC-004).

- [X] T048 [P] [US4] Write finance policy/snapshot/privacy tests in `tests/integration/staffing-economics.test.ts` for second-admin/panel denial, exact policy digest approval, incomplete/stale inputs and current source withholding; assert operational errors/counts cannot disclose finance (FR-001, FR-014, FR-016, FR-017, SC-002).

- [X] T049 [US4] Implement versioned capacity summaries in `lib/server/staffing/operations.ts` using `lib/staffing/calendar.ts` and expose `app/api/staffing/operations/route.ts`; keep planned/tentative/actual distinctions and all as-of/denominator/input identities (FR-015, FR-014, SC-004).

- [X] T050 [US4] Implement strict economics contracts in `lib/contracts/staffing-economics.ts` and pure bounded BigInt calculation in `lib/staffing/economics.ts`; snapshot grouped rounding inputs and keep service-rate revenue separate from contracted contribution (FR-016, FR-017, SC-004).

  C11 (verbatim): “Formula version is staffing-economics-v1; supported currencies are USD/EUR/GBP/CAD/AUD with exponent 2 and JPY with exponent 0; all money is a nonnegative integer minor-unit decimal string up to 1000000000000 and rates are minor units per hour up to 100000000; intermediate arithmetic uses BigInt and derived signed totals are bounded to absolute 1000000000000000; rate periods are [fromDate,toDate) by resource-local date with no overlap per resource/rate-kind/currency; rate kinds are loaded_cost or service; a scenario covers one engagement baseline and 1–91 dates, stores exact confirmed allocation/rate/revenue/nonlabor revisions and has status complete, incomplete or stale plus policyApproval approved or unvalidated; group minute-times-rate numerators by resource/local-date/rate-revision, divide by 60 and round half away from zero once per group before summing; contribution equals entered contracted revenue minus delivery cost minus entered nonlabor cost; margin is contribution divided by entered revenue rounded half up to two percentage decimals and is null for zero revenue; mixed currencies or missing rates/revenue/nonlabor inputs yield incomplete results; service-rate revenue is a separate hypothetical estimate; mcteer's policy approval binds the exact formula/input-policy digest and never approves a quote or actual profit.”

- [X] T051 [US4] Implement effective finance inputs, human formula-policy approval, exact scenario snapshots and current stale/withheld reads in `lib/server/staffing/economics.ts`; no automatic policy approval, zero defaults, foreign exchange or model estimation (FR-006, FR-016, FR-017).

- [X] T052 [US4] Add finance routes at `app/api/staffing/finance/inputs/route.ts`, `app/api/staffing/finance/policy-decisions/route.ts`, `app/api/staffing/finance/scenarios/route.ts` and `app/api/staffing/finance/scenarios/[scenarioId]/route.ts`; test runtime and response isolation in `tests/contracts/staffing-finance-api.test.ts` (FR-001, FR-016, FR-017).

- [X] T053 [US4] Build `app/_components/staffing/operations.tsx`, `app/_components/staffing/finance.tsx`, `app/(workspace)/staffing/page.tsx` and `app/(workspace)/staffing/finance/page.tsx`; add server-projected navigation in `app/_components/app-shell.tsx`, explicit planned/incomplete/zero states and mcteer-only finance/policy controls (FR-014, FR-015, FR-016, FR-017, FR-018).

- [X] T054 [US4] Add operations/finance keyboard and denied-payload tests in `tests/ui/staffing-operations.spec.ts`, run focused arithmetic/domain/HTTP/WebKit checks, and record exact totals and projection results in `specs/007-skills-staffing/validation.md` (FR-023, SC-002, SC-004, SC-007).

## Phase 7: User Story 5 — Governed read-only Turi advice (P2)

Goal: fresh private demand-bound conversations explain authorized domain values, with native cancellation/output/replay fences and no staffing mutations. Independent test: current/stale/missing/restricted/changed synthetic questions agree with domain values and deny revoked output. Depends on US2–US4 and their current projection/lifecycle contracts.

- [X] T055 [P] [US5] Write advisory scope/tool/privacy tests in `tests/integration/staffing-advisory.test.ts` and fake-provider step/output-budget tests in `tests/unit/staffing-model-budget.test.ts`; prove a seventh step never invokes the provider, both generate/stream are clamped, denied generic tools cannot bypass binding and no paid retry occurs (FR-019, FR-020, FR-021, SC-002, SC-006).

- [X] T056 [P] [US5] Write native context/history/quiet-active-stream/replay/cancel/restart tests in `tests/integration/staffing-native.test.ts`, including dependency changes after context consumption, provider uncertainty, authority-store outage, finance sentinel and suppressed output after cancellation (FR-019, FR-020, FR-021, SC-002, SC-008).

- [X] T057 [US5] Implement immutable fresh staffing bindings, request admission and domain context in `lib/server/staffing/context.ts` and `lib/server/staffing/advisory.ts`, extending `lib/server/conversations/repository.ts`, `lib/server/conversations/binding.ts` and `lib/server/profiles/attempt-context.ts` before any first snapshot; reject populated/rebound/mixed planning/research conversations (FR-019, FR-020, FR-021).

  C12 (verbatim): “A staffing conversation is fresh, owner-private and immutably bound to one customer/demand revision, operational or finance mode, and an optional same-engagement scenario in finance mode; finance mode requires mcteer; at most one native response attempt is admitted per advisory request with five requests/hour per membership, 8000 instruction characters, six model steps, six domain read calls, 24576 context bytes, 200 dependency identities and 4096 output tokens/step; deadline is 120 seconds from dispatch and unresolved attempts settle unconfirmed within five minutes; model is spacexai/grok-4.7 and reasoning is low; only staffing read tools and the staffing skill are available, all mutation/research/file/sandbox tools are denied, and no paid retry is automatic.”

- [X] T058 [US5] Implement the staffing delivery-only customer projection and strict tool actor in `lib/server/profiles/context.ts` and `lib/server/profiles/tool-actor.ts`; persist the consumed resource/source/calendar/capacity/finance dependency union before releasing any domain content to the model (FR-001, FR-006, FR-019, FR-020).

- [X] T059 [US5] Implement bounded read-only tools in `agent/tools/read_staffing_demand.ts`, `agent/tools/match_staffing_resources.ts`, `agent/tools/read_staffing_capacity.ts` and `agent/tools/read_staffing_scenario.ts`, with durable six-read/byte/dependency limits, exact bound inputs and current reauthorization on result replay (FR-019, FR-020, FR-021).

- [X] T060 [US5] Add explicit staffing-binding denial to `agent/tools/customer_context.ts`, `agent/tools/read_delivery_plan.ts`, `agent/tools/save_delivery_plan_draft.ts`, `agent/tools/search_evidence.ts`, `agent/tools/read_research.ts`, `agent/tools/propose_customer_context.ts`, `agent/tools/propose_artifact_claim.ts` and `agent/tools/propose_research.ts`; verify all registered tools including file/sandbox/research paths are denied outside the four staffing reads and allowed skill (FR-001, FR-019, FR-020).

- [X] T061 [US5] Implement provider step/deadline admission in `lib/server/staffing/model-budget.ts` and the existing bounded model resolver in `agent/agent.ts`; preserve model `spacexai/grok-4.7` and reasoning `low`, actual usage events, one dispatch and no automatic paid retry (FR-020, FR-021, SC-006).

- [X] T062 [US5] Implement current dependency/authority release fences in `lib/server/staffing/fences.ts`, `lib/server/conversations/context-fence.ts`, `lib/server/conversations/projection.ts` and `lib/server/conversations/dispatch.ts`; protect every native chunk/history/reconnect/replay surface and enforce the quiet-stream 10s poll/15s check/30s close bounds (FR-001, FR-006, FR-020, SC-002).

- [X] T063 [US5] Integrate owned cancellation and durable uncertainty settlement into `lib/server/conversations/cancel.ts`, `lib/server/conversations/watchdog.ts`, `lib/server/conversations/reconcile.ts` and `scripts/maintenance-worker.ts`; preserve matched DB/eve identity, settle within five minutes and never redispatch an uncertain paid turn (FR-020, FR-021, SC-008).

- [X] T064 [US5] Author `agent/skill-procedures/staffing-advice/SKILL.md`, `agent/skills/staffing-advice.ts` and `agent/instructions/staffing-context.ts` using the installed eve docs: exact citations and domain numbers, visible unknown/stale/tentative states, no personnel inference, no cost/protected ranking and no decision claims or staffing writes (FR-019, FR-020, SC-006).

- [X] T065 [US5] Add fresh advisory/status/cancel routes at `app/api/staffing/advisory/route.ts`, `app/api/staffing/advisory/[attemptId]/route.ts` and `app/api/staffing/advisory/[attemptId]/cancel/route.ts`; build `app/_components/staffing/advisory.tsx` with explicit mode/binding, stop/uncertain/fenced state and deterministic results available during provider failure (FR-018, FR-019, FR-020, FR-021).

- [X] T066 [US5] Add native UI tests in `tests/ui/staffing-advisory.spec.ts`, run all focused scope/provider/native tests with actual native transport and fake bounded provider where appropriate, and record source withdrawal/cancel/replay proof in `specs/007-skills-staffing/validation.md`; these tests do not satisfy the live-output gate (FR-023, SC-002, SC-006, SC-007, SC-008).

## Phase 8: Cross-cutting verification, rollout and reconciliation

All five stories precede final feature gates. Implement each runner before invoking it. Keep the full feature incomplete until every required gate has actual evidence; no partial matrix or mock substitutes for a live gate.

- [X] T067 Implement redacted operation/conflict/import/source-exclusion/model-usage instrumentation in `lib/server/staffing/telemetry.ts` and verify no private payloads, names, prompts, leave details or monetary values reach logs in `tests/integration/staffing-telemetry.test.ts`; connect the feature domain entry points to these events (FR-021, SC-002).

- [X] T068 Complete retention/disable/recovery tests in `tests/integration/staffing-recovery.test.ts` and implement `scripts/staffing-recovery-check.ts`; verify partial import leases, delayed cleanup against newer sources, allocation receipts and native cancellation/reconciliation across a paired DB/workforce/artifact/eve restart; run and record the owned recovery drill (FR-006, FR-020, FR-021, FR-022, SC-008).

- [X] T069 Implement `scripts/benchmark-staffing.ts` and its package script using `tests/fixtures/staffing/seed.ts`: 500 resources, 50 skills, 20000 competency revisions, 10000 dated allocations, 91 days, source-bound/hidden/stale cases, ten warmups and 100 measured calls/class with five clients; report p50/p95/p99/query counts/failures for roster/detail/match/operations/confirmation and meet every p95≤2000ms with zero correctness failures (FR-023, SC-005).

- [X] T070 Implement and run the real complete trusted-context journey in `tests/integration/staffing-journey.test.ts` via `tests/fixtures/staffing/journey.ts`: actual 003/004/005 review and 006 acceptance, workforce scan/import/review, qualified demand, match, confirmation and finance scenario; compare persisted source/baseline/resource/decision IDs and exact totals without seeded acceptance shortcuts (FR-023, SC-001, SC-002, SC-003, SC-004).

- [X] T071 Implement `scripts/check-staffing-ui.ts`, the `staffing:ui:check` package script and `tests/ui/staffing-journey.spec.ts`; run every staffing UI case in desktop/mobile light/dark CLI WebKit with keyboard flow, axe zero serious/critical, 390px overflow checks and only synthetic screenshots; prove restricted fields absent from responses and DOM (FR-018, FR-023, SC-002, SC-007).

- [X] T072 Create the eight fixed cases in `evals/fixtures/007-staffing-cases.json`, the bounded owned-environment runner `scripts/eval-staffing.ts`, review verifier `scripts/verify-staffing-review.ts` and package scripts `eval:staffing`/`eval:staffing:verify`; enforce the 20-minute/eight-turn run budget and exact actual-output digest/rubric binding from `specs/007-skills-staffing/contracts/advisory-context.md` (FR-019, FR-020, FR-021, FR-023, SC-006).

- [X] T073 Run `npm run eval:staffing -- --live` only after deterministic advisory gates, inspect every actual S01–S08 context/tool/output and durable result, record four rubric scores and hard-gate evidence per case, then run the review verifier; retain private artifacts ignored and report sanitized usage/results in `specs/007-skills-staffing/validation.md`; unavailable or failed cases remain unchecked (FR-023, SC-006).

- [X] T074 Run the complete `npm run test:staffing`, affected 002–006 auth/context/artifact/retrieval/plan/native regressions, typecheck, eve/web builds, `npm run check:docs` and `git diff --check`; verify `.github/workflows/ci.yml` enumerates every isolated staffing suite and record exact counts and failures/fixes in `specs/007-skills-staffing/validation.md` (FR-023, SC-001, SC-002, SC-003, SC-004, SC-008).

- [X] T075 After every disposable deterministic/UI/live/load/recovery gate passes, run `npm run db:inspect-preview` read-only, verify the configured Preview marker and expected source schema, perform the explicit migration/role upgrade with `scripts/db-migrate.ts` and `scripts/db-roles.ts`, reinspect and run non-destructive local app readiness/auth smoke; record pre/post evidence in `specs/007-skills-staffing/validation.md` without seeding Preview or touching Production (FR-022, SC-008).

- [X] T076 Reconcile every FR/SC and checkbox against code and actual evidence in `specs/007-skills-staffing/tasks.md` and `specs/007-skills-staffing/validation.md`; append concrete tasks for discovered gaps instead of claiming completion from focused checks; update `README.md`, `ROADMAP.md`, `docs/architecture.md`, `docs/evidence-policy.md` and `.env.example` with truthful behavior/setup, private store ownership, disable/recovery and approved boundaries (FR-023, FR-022).

- [X] T077 Prepare a reviewable feature PR only after implementation and required validation are complete; summarize behavior, checked evidence, Preview state, disable/forward-repair and remaining hosted-release exclusion from `specs/007-skills-staffing/validation.md`; verify CI against the exact review head and leave merge for user instruction (FR-023, FR-022).

## Dependencies and execution order

- Setup → foundation → US1 → US2 → US3 → US4 → US5 → final feature gates → fresh Preview inspection/upgrade → evidence reconciliation and PR.
- US1 is the smallest useful MVP checkpoint: a governed reviewed roster. It is not feature completion; the authorized implementation scope includes all five stories and final gates.
- US2 matching requires US1 current competency/source reads; US3 requires US2 exact demand/calendar results; US4 requires US3 confirmed ledgers; US5 consumes current demand, operations and optional finance projections.
- Source/authority and immutable-schema primitives are shared foundations. Every writer follows the API lock order; later additions must not introduce a reverse lock acquisition.
- Contract clauses are quoted at their earliest implementing task and apply to all later persistence, API, UI and agent work. Same-file work is sequential even when nearby independent test tasks carry `[P]`.
- Live evaluation requires completed fake-provider and native-surface tests. Preview work requires all disposable gates, including real output review and the representative benchmark. A missing prerequisite leaves dependent tasks open.

## Parallel execution examples

| Story | Safe separate-file work after prerequisites | Join before |
| --- | --- | --- |
| US1 | `staffing-imports.test.ts` and `staffing-competencies.test.ts` | Import/review implementation and focused execution |
| US2 | `staffing-calendar.test.ts`/`staffing-freshness.test.ts` and `staffing-matching.test.ts` | Calendar/matching implementation |
| US3 | `staffing-decisions.test.ts` and `staffing-lifecycle.test.ts` | Decision transaction implementation |
| US4 | Pure arithmetic vectors and `staffing-economics.test.ts` integration contracts, with separate files | Economics domain implementation |
| US5 | `staffing-advisory.test.ts`/model-budget tests and `staffing-native.test.ts` | Native binding/output integration |

## Implementation strategy

Deliver each story through domain tests, strict contracts/persistence, shared services, thin routes and accessible UI, then its focused independent check. Keep the branch reviewable through small coherent changes while preserving existing uncommitted work. Run broader tests when shared boundaries change and again at the final gate; never edit a task to hide an unbuilt acceptance criterion. Implementation has started. Resume from the first unchecked task and consult `validation.md` for completed checks and outstanding gates.

## Requirement coverage index

| Requirement | Planned task IDs |
| --- | --- |
| FR-001 | T005, T006, T007, T011, T013, T019, T023, T039, T041, T044, T048, T052, T058, T060, T062 |
| FR-002 | T008, T016, T024, T026 |
| FR-003 | T008, T015, T016, T021, T024, T026 |
| FR-004 | T008, T014, T017, T018, T019, T020, T021, T025, T027 |
| FR-005 | T008, T014, T015, T018, T021, T024, T025, T027 |
| FR-006 | T008, T015, T019, T020, T022, T023, T025, T034, T039, T041, T042, T044, T051, T058, T062, T068 |
| FR-007 | T015, T021, T029, T031, T032, T034, T036, T039, T041 |
| FR-008 | T009, T029, T031, T032, T036 |
| FR-009 | T009, T030, T033, T035, T036 |
| FR-010 | T030, T034, T035, T036 |
| FR-011 | T009, T033, T035, T038, T040, T042, T043, T045 |
| FR-012 | T009, T012, T038, T039, T040, T041, T043, T045 |
| FR-013 | T009, T032, T033, T038, T039, T040, T041, T042, T043, T045 |
| FR-014 | T006, T011, T016, T023, T024, T026, T030, T044, T048, T049, T053 |
| FR-015 | T029, T047, T049, T053 |
| FR-016 | T010, T047, T048, T050, T051, T052, T053 |
| FR-017 | T010, T047, T048, T050, T051, T052, T053 |
| FR-018 | T026, T027, T036, T045, T053, T065, T071 |
| FR-019 | T010, T055, T056, T057, T058, T059, T060, T064, T065, T072 |
| FR-020 | T010, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T068, T072 |
| FR-021 | T006, T007, T012, T017, T019, T020, T022, T025, T027, T034, T042, T043, T055, T056, T057, T059, T061, T063, T065, T067, T068, T072 |
| FR-022 | T001, T002, T005, T008, T009, T010, T011, T013, T022, T068, T075, T076, T077 |
| FR-023 | T001, T003, T004, T013, T014, T028, T037, T046, T054, T066, T069, T070, T071, T072, T073, T074, T076, T077 |
| SC-001 | T004, T014, T028, T046, T070, T074 |
| SC-002 | T006, T013, T014, T015, T023, T028, T030, T037, T039, T044, T046, T048, T054, T055, T056, T062, T066, T067, T070, T071, T074 |
| SC-003 | T038, T039, T041, T046, T070, T074 |
| SC-004 | T004, T029, T031, T037, T047, T049, T050, T054, T070, T074 |
| SC-005 | T004, T069 |
| SC-006 | T055, T061, T064, T066, T072, T073 |
| SC-007 | T028, T037, T046, T054, T066, T071 |
| SC-008 | T002, T003, T005, T013, T056, T063, T066, T068, T074, T075 |

**Task totals**: 77 total; setup/foundation/cross-cutting 24, US1 15, US2 9, US3 9, US4 8, US5 12. T001–T076 have code and passing local evidence recorded in `validation.md`. This includes the previously reopened schema/receipt/lifecycle tasks and the actual partner-grant, demand-history and pointer race cases. T077 is complete with PR 13 open and exact review-head CI passing; merge remains a separate instruction. Earlier failed attempts remain in the append-only validation history; its final owned validation section supersedes their gate status.
