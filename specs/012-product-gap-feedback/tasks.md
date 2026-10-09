# Tasks: Product Gaps and Engineering Feedback

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts](contracts/domain.md) and [quickstart.md](quickstart.md).

**Status**: Implementation complete:52/52 tasks. Full local acceptance and all five012 CI gates passed on the final source fingerprint. Focused PR is prepared; broader legacy CI and hosted rollout remain separate. Hosted changes and paid model calls remain outside this authorization.

**Tests**: FR-020 and SC-001–SC-007 require targeted automated checks. Write the specified tests before behavior; demonstrate meaningful failure, then pass them. A test file that runs zero assertions is not evidence. Tasks use exact paths; braces denote the enumerated paths, not arbitrary new modules.

**Format**: `- [ ] Tnnn [P?] [USn?] description`. `[P]` permits independent test-authoring files within the named phase after its prerequisites; it does not authorize parallel agents or simultaneous edits to shared files. All other tasks are sequential unless the dependencies below establish independence.

## Phase 1: Setup

Confirm canonical checkout, existing stack and safe test ownership. No runtime setup against the selected environment.

- [X] T001 Read `AGENTS.md`, `CONTRIBUTING.md`, `.specify/memory/constitution.md` and all 012 artifacts; inspect the installed Next.js route/UI guides before coding, verify main dependency state and provisional migration numbers in `migrations/manifest.json`, and record implementation preflight in `specs/012-product-gap-feedback/validation.md`. Preserve `agent/agent.ts`, `.env.local` and `.eve/.workflow-data`; remain in the canonical checkout.

- [X] T002 Build owned synthetic setup/teardown in `scripts/gaps-eval-environment.ts` and `tests/fixtures/gaps/{environment,seed,evidence,expected-impact,ui}.ts`; include a reusable owned Next app lifecycle for the early story UI checkpoints, sanitize inherited endpoints/credentials, reject non-owned/non-loopback targets, seed exact role/evidence cases, preserve selected markers and clean only owned resources under `local-artifacts/012`. Reuse proven runner primitives without copying caches or creating sibling worktrees.

- [X] T003 Add the complete suite manifest and runner in `scripts/gaps-suites.json` and `scripts/test-gaps.ts`, plus `tsconfig.product-gaps.json` and `package.json` entries from quickstart; extend `scripts/execution-source-digest.ts` for 012 while preserving existing feature fingerprints. Add `tests/unit/gap-runner-coverage.test.ts` to reject missing/duplicate/orphan/zero/skipped suites and changed source digests. Manifest entries may be built in later tasks; do not claim full acceptance until all exist.

## Phase 2: Foundational

Blocks story behavior. Establish one governed domain, exact original-source closure and current release checks.

- [X] T004 Write runtime-grant, old-schema/disabled, exact-role, scoped discovery and authority-race tests in `tests/integration/gap-foundation.test.ts`; test other admins/stewards/account owners as denied reviewers and partners as denied readers.

- [X] T005 Add immutable gap/impact revisions, states, decisions, sources, canonical assignments, relation fences, previews, receipts/tombstones, admission and payload tables in provisional `migrations/048-product-gaps.cjs`; append exact digest in `migrations/manifest.json`, narrowly update `scripts/db-roles.ts`, and add scoped SQL helpers in `lib/server/gaps/repository.ts`. Enforce composite scope/identity constraints and separate deletable payload from immutable metadata; no request-time DDL.

- [X] T006 Define strict versioned schemas in `lib/contracts/product-gaps.ts`; implement exact internal/mcteer policy and stage-specific schema checks in `lib/server/gaps/{policy,schema}.ts`, safe HTTP parsing/errors in `lib/server/gaps/http.ts`, and content-free telemetry in `lib/server/gaps/telemetry.ts`. Use expectedVersion 0 only as the create precondition, with persisted versions starting at 1. C01: “All persisted identities are UUIDs scoped by environment and workspace; versions and generations are positive integers; each mutation requires a UUID requestKey, expectedVersion and contractVersion product-gaps-v1.”

- [X] T007 Implement canonical input hashing, operation-scoped request locks/receipts, current-authorized replay/reconciliation, lifetime tombstones/key rotation, persisted admission and cancellation bypass in `lib/server/gaps/commands.ts`; cover concurrent identical requests, changed input, expired-preview successful replay and revoked receipt projection in `tests/integration/gap-foundation.test.ts`. C16: “Per actor, admission allows 120 reads, 30 mutations/previews and five report preparations per rolling minute; mutation bodies are at most 256 KiB and report selection bodies at most 64 KiB; cleanup leases last 180 seconds and claim at most 100 records per transaction.”

- [X] T008 Implement bounded whole-operation original dependency union and globally ordered authority/customer/source/execution locks in `lib/server/gaps/{sources,dependencies,eligibility}.ts`, adapting existing governed source readers. Reject conflicting generations/digests, unaccepted/contradictory/expired sources and planned-as-actual evidence; retain locators/dates/classifications and enforce every critical confirmation source independently. C05: “Each revision has at most 50 selected original sources and 200 transitive original dependencies; a source binds kind, original revision UUID, positive generation, SHA256 content digest and exact original locator; supported kinds are accepted_profile, approved_excerpt, verified_research, shared_knowledge, execution_record and milestone_baseline.”

- [X] T009 Implement safe working/reviewed/history projections and synchronous dependency invalidation in `lib/server/gaps/{projection,invalidation}.ts`; integrate scoped hooks into existing `lib/server/{profiles,artifacts,research,retrieval,plans,execution}` mutation paths identified during preflight. Recheck current original headers/time expiry before prose/count release with worker stopped; prove no source-writer lock inversion or cross-actor global purge in `tests/integration/gap-evidence-races.test.ts`.

## Phase 3: US1 — Capture and Review Gap Impact (P1, MVP)

Goal: a complete proposal → reviewed gap/impact journey. Independent test: mcteer reviews exact synthetic gap/impact with citations; panel proposes, forbidden roles fail, and accepted customer profiles remain unchanged.

- [X] T010 [P] [US1] Write field-boundary, classification, canonical product/unknown and no-implicit-fact-promotion tests in `tests/unit/gap-content.test.ts`; exercise every C02–C07 boundary and invalid cross-customer workload/engagement.

- [X] T011 [P] [US1] Write proposal/revision/accept/reject/defer/dismiss/reopen/retire/self-review, confirmed→suspected, resolved correction/recurrence and lost-ack tests in `tests/integration/gap-authoring-review.test.ts`; extend evidence races only after T009 with accept/head/product-reclassification barriers.

- [X] T012 [US1] Implement canonical products and immutable narrative proposal service in `lib/product-gaps/{products,content}.ts` and `lib/server/gaps/service.ts`; keep common gap narrative customer-independent and prohibit raw private passages/identifiers in it through explicit authoring checks and reviewer acknowledgment, not an assertion that automated detection proves disclosure safety. C02: “Gap kind is product_gap, defect, documentation or enablement; title is 1–200 characters, productKey is a current canonical product key or unknown, capability is 1–200 characters, and productVersion is null or 1–100 characters.” C03: “Problem, workflow, desiredOutcome, reproduction, constraints, workaround, workaroundLimitations, proposedCapability, alternatives, unknowns and requestedDecision are each 1–4000 characters; triageTeam is 1–200 characters; acceptanceCriteria has 1–20 strings of 1–1000 characters; severity is critical, high, medium, low or unknown with a 1–2000-character rationale; workaroundFeasibility is none, limited, feasible or unknown.”

- [X] T013 [US1] Implement impact proposal/revision/episode relationships in `lib/server/gaps/impacts.ts` and governed contracts in `lib/contracts/product-gaps.ts`; keep customer identity immutable, require separate retirement/replacement for correction, preserve accepted_fact/attributed_research/estimate/unknown and attach exact original assertion sources. C04: “An impact observation names one canonical customer, optional same-customer workload and engagement, a non-future observedAt timestamp or null, 1–4000-character consequences and workaroundBurden, severity critical, high, medium, low or unknown with a 1–2000-character rationale, and up to 20 assertions; each assertion has 1–2000-character text, classification accepted_fact, attributed_research, estimate or unknown, and 0–20 local source keys.” C06: “Impact classification is suspected, confirmed or resolved; confirmed requires a known non-future observedAt, accepted customer need/impact and current direct product evidence; resolved requires a known non-future observedAt and known non-future resolution time at or after observedAt plus accepted customer-resolution evidence; recurrence creates a new observation linked to the prior resolved observation.”

- [X] T014 [US1] Implement exact gap/impact previews and mcteer decision transitions in `lib/server/gaps/{previews,review}.ts`; preserve reviewed heads on reject or proposed edits, enforce source-qualified confirmation and customer-resolution evidence, invalidate dependent projections on review changes and permit only metadata disposition after withdrawal. C07: “Gap disposition is open, deferred or dismissed; every review/reclassification/retraction has a 1–2000-character rationale; defer requires a future UTC revisitDate within 366 days; only canonical active internal administrator mcteer may decide; self-authored approval requires an explicit selfReview acknowledgment.” C08: “Decision and canonicalization previews belong to one actor/session, expire after five minutes and bind exact revisions, generations, original-source closure and requested action; an exact successful replay may return a minimal authorized receipt after preview expiry but may never repeat the mutation.”

- [X] T015 [US1] Add registry/detail/customer-filter service queries in `lib/server/gaps/service.ts` using `projection.ts`; return proposed/reviewed distinctions, eligible citations/unknowns, safe history and canonical aliases under current authorization. Limit the US1 view to reviewed single-gap impact until T022 supplies portfolio counts; never invent provisional totals.

- [X] T016 [US1] Implement registry/detail, revisions, impact, preview/decision and request-reconciliation routes under `app/api/product-gaps/` exactly as `contracts/http-ui.md`; add strict-origin/body/error coverage for these routes in `tests/contracts/gap-http.test.ts` and scope/withheld projection checks in `tests/contracts/gap-projection.test.ts`.

- [X] T017 [US1] Build opaque pending request handling in `app/_components/product-gaps/{client,pending}.ts`, forms/detail/review/history in `app/_components/product-gaps/{registry,detail,editor,impact,review,history}.tsx`, workspace/customer pages from plan and internal-only links in `app/_components/app-shell.tsx` plus the existing customer navigation. Add URL redaction for the new routes; clear private form/DOM state on scope/auth/source changes and revalidate visible pages per HTTP/UI contract.

- [X] T018 [US1] Complete `tests/ui/gap-authoring.spec.ts` against owned fixtures, exercising exact review, proposal edits, missing evidence, self-review, keyboard/error states and unchanged profiles across all four WebKit configurations; inspect synthetic screenshots and record the US1 checkpoint in `specs/012-product-gap-feedback/validation.md`.

## Phase 4: US2 — Canonicalize and Explain Impact (P2)

Goal: explicit merge/split and transparent distinct-customer ordering. Independent test: repeated observations for two customers merge/split without inflated counts or lost lineage, including concurrent/withdrawn-source cases. Depends on US1 author/review services.

- [X] T019 [P] [US2] Write atomic exhaustive assignment, alias flattening, split original survivor, stale-preview/new-observation/overlap/cycle/source race and rollback tests in `tests/integration/gap-canonicalization.test.ts` using independently authored expected assignments.

- [X] T020 [P] [US2] Write pure set/ordering tests in `tests/unit/gap-impact.test.ts` and set-based/current-header parity tests in `tests/integration/gap-counts.test.ts`; cover repeated workloads, confirmed suppression, retired/resolved/recurrence, separate kinds, cutoff/history unavailable, partial eligibility, time expiry, cursor invalidation and C10 overflow.

- [X] T021 [US2] Implement preview/commit canonical merge/split in `lib/product-gaps/canonical.ts` and `lib/server/gaps/canonicalization.ts`; use the workspace relation fence, exact reviewed survivor or split output bindings, immutable assignments/lineage and one atomic decision/receipt. Reject changed kind/product and do not silently reapprove existing impacts after reclassification. C09: “One merge selects 2–20 active canonical gaps of the same kind and productKey and one survivor; one split selects one canonical gap and 2–10 results including the original identity and fresh additional gaps; either operation covers at most 1000 observations and requires every existing observation to have exactly one explicit resulting canonical assignment.”

- [X] T022 [US2] Implement `gap-impact-v1` pure customer sets in `lib/product-gaps/impact.ts` and set-based batched authorized queries/cursors in `lib/server/gaps/counts.ts`; count before disposition filtering, apply source eligibility at cutoff and now, suppress suspected-only when confirmed, label nonadditive resolved history and return unavailable for incomparable history. C10: “List pages contain 1–50 rows; search text is 0–200 characters; cursors bind actor, workspace, filter and ordering generation; count projections cover at most 2000 gaps, 10000 observations and 20000 dependency headers, failing explicitly rather than returning partial totals.”

- [X] T023 [US2] Implement the exact `gap-order-v1` tuple in `lib/product-gaps/ranking.ts` and `lib/server/gaps/ranking.ts`; display factors/freshness, use reviewed severity only and stable UUID tie-breaks, and add no commercial/ARR score.

- [X] T024 [US2] Add canonicalization routes from `contracts/http-ui.md` and `app/_components/product-gaps/duplicates.tsx`; integrate filters, counts, ordering and comparable deltas into `registry.tsx`, `detail.tsx` and the customer page. Make assignment review keyboard accessible and distinguish proposed candidates from accepted relations.

- [X] T025 [US2] Complete `tests/ui/gap-canonicalization.spec.ts` with merge/split, stale mapping, history and count assertions across all four projects, then record the US2 independent checkpoint in `specs/012-product-gap-feedback/validation.md`.

## Phase 5: US3 — Reviewed Engineering Reports (P2)

Goal: both deterministic templates with exact customer/audience approval and private release. Independent test: prepare/approve/export synthetic detail and portfolio, then change source/audience and deny further release. Depends on US1 and US2 for trusted heads, relations and counts.

- [X] T026 [P] [US3] Write section/unknown/citation/count/URL/serialization tests in `tests/unit/gap-report-document.test.ts`, using independent expected detail and portfolio documents including zero-gap and maximum selection.

- [X] T027 [P] [US3] Write admission/deadline/concurrency/cancel/crash/disk/finalization tests in `tests/integration/gap-report-lifecycle.test.ts` and exact disclosure/draft/changed-audience/stream revocation/tamper tests in `tests/integration/gap-report-release.test.ts`; use barriers between chunks and before final commit, asserting zero post-revocation bytes.

- [X] T028 [US3] Add independent report/revision/state/job/review/disclosure/export/handoff/catalog/cleanup tables in provisional `migrations/049-gap-engineering-reports.cjs`; append the digest to `migrations/manifest.json` and narrow runtime/maintenance grants in `scripts/db-role-setup.sql`. Do not extend 009 single-customer report identities or its review-ready download policy.

- [X] T029 [US3] Implement immutable report selection/audience/source/relation bindings and snapshot service in `lib/server/gaps/reports.ts`; unknown/inaccessible selected IDs fail the whole request, changed input creates a new revision, and portfolio rejects non-product kinds. Resolve optional history under the comparable-current-access rule. C11: “A report is detail or portfolio, selects 1 gap for detail or 0–100 explicit canonical gaps for portfolio, contains at most 200 customers and 2000 original dependencies, and has an asOf timestamp plus an optional earlier comparisonAt no more than 90 days before asOf; future timestamps are rejected.” C12: “A report audience has a 1–200-character team, 1–25 named recipients of 1–200 characters each and a 1–2000-character purpose; every included canonical customer requires an explicit disclosure acknowledgment bound to that report revision and audience digest.”

- [X] T030 [US3] Implement the complete template composers and safe identical recipient projections in `lib/product-gaps/{report-document,report-markdown,report-manifest}.ts`; preserve all seven detail/five portfolio sections, unknowns, exact counts/locators and disclosed scope. Use the designated-reviewer label plus separately verified approval receipt to avoid circular approval digests. C13: “Each report revision is at most 2 MiB of canonical structured content; exports are UTF-8 Markdown and JSON, each at most 5 MiB; private files use opaque UUID keys, SHA256 digests and exact byte lengths; report preparation has a 30-second deadline, one active job per actor and five per workspace, and no automatic preparation retry.”

- [X] T031 [US3] Implement the separate 012 private object adapter/catalog in `lib/server/gaps/store.ts` and explicit helper-only `scripts/prepare-gap-store.ts`; reuse environment-marked low-level store checks and exact object keys, enforce lower 012 limits, stage before write and validate exact digest/size. No renderer/brand/send initialization or request-time directory creation.

- [X] T032 [US3] Implement actor/session-bound queued/running/prepared/failed/cancelled jobs in `lib/server/gaps/report-jobs.ts` with absolute admission+30s deadline, bounded claim lease, staged artifact parity checks, final source/head/authority/cancel fence and durable exact reconciliation. Fail abandoned runs without auto retry; connect `lib/server/gaps/worker.ts` to an independent gated timer in `scripts/reports-worker.ts` with bounded shutdown.

- [X] T033 [US3] Implement mcteer-only exact report preview/approval/rejection and per-customer disclosure in `lib/server/gaps/report-review.ts`; bind content, both artifact digests/lengths, all scopes/generations, audience/purpose, template/method and self-review. Changing any material binding requires new preparation/review; approval cannot bypass source permission.

- [X] T034 [US3] Implement export admission/reconciliation/cancellation and current-fenced chunk release in `lib/server/gaps/{report-release,report-artifacts}.ts`; require approved eligible unexpired report and exact current mcteer before headers and each chunk, verify file identity/bytes, keep minimal receipts, stop on disable/revocation, and prohibit raw metadata/public file URLs.

- [X] T035 [US3] Add report preparation/poll/cancel/preview/decision/export routes from `contracts/http-ui.md`, `app/(workspace)/product-gaps/reports/[reportId]/page.tsx` and `app/_components/product-gaps/{report,disclosure}.tsx`; render the approval envelope, complete sections and audience controls, poll current projections, and expose precise failure/cancel/expired states.

- [X] T036 [US3] Complete `tests/ui/gap-reports.spec.ts` for detail/portfolio/zero result, exact disclosure review, Markdown/JSON download and invalidated source/audience across four projects; inspect artifacts and screenshots and record the US3 checkpoint in `specs/012-product-gap-feedback/validation.md`.

## Phase 6: US4 — Manual Handoff and Follow-up (P3)

Goal: attributable manual handoff with immutable follow-up/correction and no automatic external action. Independent test: record/replay one report/audience handoff, append correction and verify no external send or impact/maturity change. Depends on US3 approval/artifact identity.

- [X] T037 [US4] Write exact audience/review/time/predecessor, one-initial-handoff, replay/correction, expired metadata-only follow-up and inert-reference/no-outbound/no-impact-change tests in `tests/integration/gap-handoff.test.ts`; test current authority/source revocation and report invalidation flags.

- [X] T038 [US4] Implement manual handoff/follow-up/correction in `lib/server/gaps/handoffs.ts` using exact report/review/artifact/audience identity, explicit full-payload versus metadata-only variants, append-only lineage and idempotent receipts. Attribute evidence/claims; reject cycles/backdated predecessors and flag human follow-up after invalidation. C14: “Handoff kind is handed_off, acknowledged, investigating, resolution_reported or correction; eventAt is non-future, a first handoff is no earlier than report approval, recipient/team must match the approved audience, full-payload note is 1–4000 characters and reference is null or an HTTPS URL of at most 2000 characters with no embedded credentials; after report expiry/withdrawal only metadata-only follow-up/correction with no note, reference or evidence payload is permitted.”

- [X] T039 [US4] Add the handoff route from `contracts/http-ui.md` and `app/_components/product-gaps/handoff.tsx`; integrate report/history views with clearly human-reported states, chronological correction links, safe inert HTTPS references, exact audience and separate customer-resolution links. Never fetch/unfurl/send on save or view.

- [X] T040 [US4] Complete `tests/ui/gap-handoff.spec.ts` across four projects for manual initial receipt, lost acknowledgment, follow-up/correction, expired metadata-only state and human-follow-up flags; record the US4 checkpoint in `specs/012-product-gap-feedback/validation.md`.

## Phase 7: Retention, Acceptance and Handoff

All four stories are required for 012 completion. Run acceptance only after their behavior and the complete test manifest exist; local success is not hosted acceptance.

- [X] T041 Write boundary/lease/crash/disabled/stopped-worker tests in `tests/integration/gap-retention-recovery.test.ts`; test exact 5-minute/24-hour/30-day/90-day/365-day schedules, lifetime tombstones, current-head retention, separate payload/metadata rights, no cross-actor purge, no 009 object deletion and no resurrection.

- [X] T042 Implement retention calculations in `lib/product-gaps/retention.ts` and exact generation/lease/catalog cleanup in `lib/server/gaps/maintenance.ts`; wire it into the independent 012 worker tick, verify catalog/environment before delete, reconcile missing files safely and expire safe diagnostics. Preserve referential identities and key verification through tombstone lifetime. C15: “Original request receipts retain minimal authorized results for 365 days; thereafter an environment-lifetime keyed tombstone prevents key reuse; previews expire in five minutes; obsolete revision payloads expire after 90 days; report content and exports expire after 30 days; globally invalidated payloads and artifacts are purged within 24 hours while access is withheld immediately.”

- [X] T043 Finish worker/schema/disable/readiness integration in `lib/server/gaps/{worker,schema}.ts`, `scripts/reports-worker.ts`, `.env.example` and `package.json`; document `TURAS_012_DISABLED`, `TURAS_012_RECEIPT_HASH_KEYS`, private store preparation and independent 009/012 enablement. Exercise the existing root supervisor with old schemas and feature-disabled cleanup; add no new daemon or hosted cron.

- [X] T044 Complete every endpoint/method/body/error/access and projection contract in `tests/contracts/{gap-http,gap-projection}.test.ts`; cover all new routes, negative scope matrix, rate/cursor boundaries, exact replay, safe logs/redaction and no hidden count/existence hints. Assert no new agent/model/connector/MCP surface.

- [X] T045 Build `tests/ui/gap-revocation.spec.ts` for scope/session/source change, hidden-tab/focus refresh, stale-result suppression, browser persistence inspection, pending identity reconciliation and cancelled downloads across every project; assert private prose is never persisted and denied DOM is cleared.

- [X] T046 Build `tests/ui/gap-accessibility.spec.ts`, `scripts/gaps-ui-journeys.json` and `scripts/gaps-ui-check.ts`; use T002’s owned app lifecycle, require all six journeys × four WebKit projects with zero skips, capture/inspect synthetic screenshots and assert keyboard/focus/no-overflow/zero serious-critical axe failures. Update `playwright.config.ts` for owned 012 server readiness and legacy-suite isolation without changing earlier feature viewports; extend runner-coverage tests to detect missing journey/project evidence.

- [X] T047 Implement and run `scripts/gaps-benchmark.ts` with the exact independently checked 200-customer/2000-gap/10000-observation/40000-revision fixture and dependency bounds from quickstart; measure at least 100 operations per class under five readers plus reviewer, nearest-rank p95 ≤2s, 100-gap admission-to-prepared ≤30s, query counts and complete output. Record safe source/environment/machine/cardinality evidence; optimize only measured failures.

- [X] T048 Implement and run `scripts/gaps-recovery-check.ts` for empty→049 and 047→049 with seeded predecessor state, least-privilege grants and selected marker preservation; kill/restart jobs/staged files/receipts/tombstones, rotate retained keys, disable while cancelling/cleaning, and verify no auto preparation retry or restored withdrawn bytes. Record bounded forward-recovery evidence.

- [X] T049 Implement and run `scripts/gaps-regressions.ts` for relevant 003–011 profile/source/research/plan/execution/report/private-store/expansion authority and shell behavior in owned deterministic environments; do not rerun paid evaluations for unchanged agent behavior. Isolate new gap suites from legacy aggregate commands in `package.json` and preserve their coverage.

- [X] T050 Wire complete deterministic, browser, benchmark/recovery and build/docs gates into `.github/workflows/ci.yml` using owned resources; require canonical suite/journey counts and matching source digests, not filtered paths or all-skipped checks. Keep hosted deployment/migration and paid evaluation outside CI for this feature.

- [X] T051 Run the full quickstart acceptance commands from the canonical checkout, inspect synthetic UI/artifact evidence, verify `agent/agent.ts` and authored instructions remain unchanged, and record exact executed counts/source/environment/results in `specs/012-product-gap-feedback/validation.md`. Run `git diff --check`; a local or CI result cannot be recorded as Preview/Production evidence.

- [X] T052 Update `README.md`, `ROADMAP.md`, `specs/012-product-gap-feedback/{spec,plan,tasks,handoff,validation}.md` and relevant operational docs with final implementation/verification and explicit hosted rollout/forward-recovery prerequisites; prepare a focused PR with actual checks and risks. Keep the canonical checkout clean of scratch/resources. Merge only when authorized and CI is green, then delete that PR’s local/remote branch and verify README on main; do not start 013.

## Dependencies and execution order

```text
T001 → T002 → T003 → Foundation T004–T009
  → US1 T010–T018
  → US2 T019–T025
  → US3 T026–T036
  → US4 T037–T040
  → Cross-cutting T041–T052
```

Tests precede the behavior they exercise. T004 can describe post-048 behavior before that migration exists; T005–T009 must make its foundation assertions pass before US1. Test manifest completeness is a final gate, not an excuse to add placeholder passing tests. T008/T009 source/race adapters are prerequisites for every review and report. T021 canonicalization and T022 counts precede portfolio composition. T028 report tables precede store/jobs/review; T031 store and T030 composers precede T032 jobs; T033 approval precedes T034 release. T042 retention precedes recovery/disable acceptance. T047 load, T048 recovery and T049 regressions precede final CI/acceptance recording.

Within each phase, marked independent test files can be authored together after the prior phase is complete: US1 T010/T011, US2 T019/T020, US3 T026/T027. Do not edit shared fixture/contracts/migration manifests concurrently. US4 has no useful parallel task split because its small sequence shares the same handoff contract; test preparation can use the finished US3 fixtures before service work. Cross-story parallel implementation is not assumed.

## Implementation strategy

Deliver US1 as the first complete local demonstration, then canonical counts, reports and manual handoff. This MVP checkpoint does not complete 012: all four stories and cross-cutting acceptance remain required. Build only the interfaces/files used by each task; no speculative agent tools, providers or background infrastructure. Mark a task complete only after its behavior and meaningful narrow checks pass; record aggregate acceptance separately once all prescribed suites/journeys execute. Keep evidence private and synthetic, with safe source-bound summaries. Runtime/hosted authority does not follow from this planning document.

## Requirement coverage

| Requirement | Tasks |
| --- | --- |
| FR-001 | T004, T006, T008–T009, T015–T018, T044–T046 |
| FR-002 | T005, T012–T015, T021, T028–T029, T038 |
| FR-003 | T004, T006, T014, T021, T033–T034, T037–T039 |
| FR-004 | T010, T012, T017–T018 |
| FR-005 | T010–T013, T017–T018 |
| FR-006 | T008–T009, T011, T013–T014, T022, T027, T032–T034 |
| FR-007 | T007, T011, T014, T018, T033 |
| FR-008 | T019, T021, T024–T025 |
| FR-009 | T020, T022, T025, T029–T030 |
| FR-010 | T004, T008–T009, T020, T022, T029–T030, T044 |
| FR-011 | T020, T023–T025, T030 |
| FR-012 | T026, T028–T032, T035–T036 |
| FR-013 | T027–T036 |
| FR-014 | T037–T040 |
| FR-015 | T005–T009, T011, T014, T019–T021, T027, T032–T034, T037–T038, T044–T045 |
| FR-016 | T009, T020, T022, T027, T032–T034, T038, T041–T045, T048 |
| FR-017 | T017–T018, T024–T025, T035–T036, T039–T040, T045–T046 |
| FR-018 | T006–T008, T022, T029–T032, T034, T044, T047 |
| FR-019 | T002, T005, T028, T031–T032, T041–T044, T048, T052 |
| FR-020 | T002–T004, T010–T011, T018–T020, T025–T027, T036–T037, T040–T052 |
| FR-021 | T001, T030, T037–T039, T044, T049, T051–T052 |
| FR-022 | T001, T018, T025, T036, T040, T050–T052 |
| SC-001 | T010–T018 |
| SC-002 | T004, T008–T009, T020, T027, T034, T044–T046 |
| SC-003 | T019–T025, T047 |
| SC-004 | T026–T036, T037–T040 |
| SC-005 | T022, T032, T047 |
| SC-006 | T018, T025, T036, T040, T045–T046 |
| SC-007 | T002, T005, T028, T041–T042, T048 |
