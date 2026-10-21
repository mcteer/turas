# Tasks: Pilot Hardening and Launch Readiness

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md),
[data model](data-model.md), [contracts](contracts/readiness.md), [quickstart](quickstart.md).

**Status**: Implementation in progress. Checked tasks have scoped evidence in validation.md.
Tests are required by this operational/access/storage change and its specification.
Use `SPECIFY_FEATURE_DIRECTORY=specs/016-pilot-hardening` in the canonical checkout.

**Format**: `- [ ] Tnnn [P?] [USn?] Action with exact paths`. Parallel markers mean
independent file work after listed prerequisites, not permission to spawn agents.

## Phase 1: Setup

- [X] T001 Reconfirm main/source/schema 055, free 056/057 numbers, clean canonical checkout and protected model/config/workflow hashes; initialize the private run and record baseline in `specs/016-pilot-hardening/validation.md` without private values (FR-001, FR-022).
- [X] T002 Read installed Next auth/route/upload guides and eve deployment/auth/sandbox pages; verify recorded registry findings and public Blob/Sandbox SDK limits, pin only the used packages in `package.json`/`package-lock.json`, and record licenses/version decisions in `specs/016-pilot-hardening/research.md` (FR-023, FR-024).
- [X] T003 Freeze G01–G22, J002–J015, role/method/class requirements and complete expected case inventories in `scripts/pilot-catalog.json` and `scripts/pilot-suites.json`; separate optional outbound-send capability (FR-001, FR-013, FR-017).
- [X] T004 Inventory actual local/hosted stores, workflow backend, keys by name, images, scheduler placement and existing feature retention policies in `docs/pilot-lifecycle.md` and `docs/pilot-operations.md`; report missing capabilities as blockers (FR-005, FR-009, FR-018, FR-023, FR-024).
- [X] T005 Add planned command/config wiring to `package.json` and `.env.example`, with explicit backend/target selection and private-value handling; no silent local fallback and no selected `.env.local` edits (FR-014, FR-016, FR-022, FR-023).

## Phase 2: Foundation

Complete this phase before story implementations. Schema files are prepared locally;
applying them to hosted targets belongs to the release tasks.

- [X] T006 Define strict catalog/run/receipt/feedback/recovery schemas in `lib/contracts/pilot-readiness.ts`: “Contract version is `pilot-readiness-v1`; run, attempt, job, feedback and recovery IDs are UUIDs, and digests are lowercase 64-character SHA-256 hex.” “Gate state is exactly `pass`, `fail`, `blocked` or `unverified`; missing evidence is never `pass`.” “A run contains at most 128 gates, 512 receipts and 1 MiB of JSON metadata; each gate has exactly one selected complete attempt.” “Provider/deployment IDs are opaque non-secret strings (1–256 characters); Git commits are full 40-character lowercase hex for this repository.” Validate fixed catalog enums; reject unknown fields and unsafe command/URL inputs (FR-001, FR-002).
- [X] T007 Implement safe evidence IO and attribution validation in `scripts/pilot-evidence.ts`: “Private evidence files are regular non-symlink files with mode 0600 under an owned mode-0700 run directory.” “Hosted receipts require deployment ID, deployed commit, canonical origin, environment marker, schema ledger digest and runtime-grant result.” “The checker returns technical eligibility only; human approval requires an attributable mcteer decision bound to the exact scope and bundle digest.” Reject owner-string authority (FR-002, FR-003, FR-020).
- [X] T008 Build `scripts/pilot-environment.ts` and `tests/fixtures/pilot/environment.ts` from current owned harness patterns: isolated loopback DB/runtime role, production app, private stores, stripped provider keys, owned cleanup and preserved root configuration/workflow/model (FR-014, FR-022).
- [X] T009 Add `migrations/078-pilot-workspace-sessions.cjs` and manifest entry: “Session membership, principal and workspace must match one active membership; absent selection means the existing primary workspace only.” “Pilot workspace classification is immutable after provisioning; synthetic pilot publications and outcomes cannot enter primary results.” Add compatible nullable binding pair, exact FK, safe legacy backfill/revocation and publication provenance; no guessed primary lineage (FR-004, FR-025).
- [X] T010 Add `migrations/079-pilot-operations.cjs` and manifest entry for control/transition receipts, per-class status and hosted-job leases: “At most two heavy jobs run per environment; each job has a durable lease, exact provider ID and a deadline no greater than 300 seconds.” “Operational samples retain no payloads, URLs, filenames or secrets and expire after 90 days; recovery and replay fences do not expire with samples.” “Recovery mode is `open`, `quiescing` or `locked`; only an explicit owner operation can unlock after integrity and authority reconciliation.” Enforce job state `admitted | starting | running | reconciling | succeeded | failed | cancelled`, all enum/FK/uniqueness/index constraints from `data-model.md` (FR-007, FR-018, FR-024).
- [X] T011 Update explicit runtime grants in `scripts/db-roles.ts`, supported schema checks in `lib/server/db/readiness.ts` and exact learning activation compatibility in `lib/server/learning/`; runtime may write bounded job/status rows but cannot unlock, alter environment identity or DDL (FR-012, FR-021).
- [X] T012 Implement the fixed class and operation manifests in `scripts/pilot-catalog.ts` and shared `lib/server/operations/maintenance.ts`; distinguish missing, disabled optional, due and failed classes with finite per-domain batch/deadline limits (FR-001, FR-018, FR-024).
- [X] T013 Add empty/055 migration, legacy-session ambiguity, publication provenance and runtime privilege checks in `tests/integration/pilot/migrations.test.ts`; validate exact ledger/grants and repeat-safe forward application (FR-004, FR-012, FR-021, FR-025).

## Phase 3: US1 — Current evidence and readiness (P1; first checkpoint)

**Independent test**: Current complete receipts produce eligibility; stale/missing/
failed/tampered receipts and a claimed owner string never produce approval.

- [X] T014 [P] [US1] Write receipt/attempt/attribution failure tests in `tests/contracts/pilot/readiness.test.ts`, covering duplicates, source/environment/method mismatch, partial counts, stale hosted proof and fabricated human approval (FR-002, FR-003).
- [X] T015 [US1] Add explicit 016 source identity in `scripts/pilot-source.ts` and `scripts/execution-source-digest.ts`; bind catalog/config/contracts and runtime/test sources while excluding only documented result artifacts and checkbox state, never relabel earlier receipts (FR-002).
- [X] T016 [US1] Implement `scripts/pilot-readiness.ts` with exact explicit-input receipt verification, dependency checks, G01–G22 completeness, required methods, freshness and exit codes; return only eligibility and real gate states (FR-001, FR-002, FR-003).
- [X] T017 [US1] Implement run/attempt/resume handling in `scripts/pilot-evidence.ts` with immutable prior attempts, complete gate reruns and input/source digest checks; failed cases cannot be replaced individually or selected from unrelated runs (FR-002, FR-022).
- [X] T018 [US1] Implement fixed child orchestration and receipt conversion in `scripts/test-pilot.ts`; preserve predecessor feature digests and actual expected suite counts instead of trusting a success exit code (FR-001, FR-002, FR-014).
- [X] T019 [US1] Add safe output and private-path abuse tests in `tests/unit/pilot/evidence.test.ts`, including symlink/traversal/size/mode denial and no prompt, credential, filename or customer prose in summaries (FR-002, FR-020, FR-022).
- [X] T020 [US1] Implement strict explicit artifact aggregation in `scripts/pilot-ci-evidence.ts`; reject skipped/flaky/incomplete cases and any wrong commit/run, keeping local/CI/hosted/actual-model/human proof distinct (FR-002, FR-021).
- [X] T021 [US1] Run the complete readiness contract/evidence tests and record the scoped US1 checkpoint in `specs/016-pilot-hardening/validation.md`; full pilot remains ineligible while other gates lack proof (FR-001, FR-002, FR-003).

## Phase 4: US3 — Workspace, storage, processing and lifecycle (P1)

This P1 story precedes the US2 full restore because restored components must first
have their final identity, storage and worker contracts.

**Independent test**: Correct primary/pilot/partner access and retained bytes survive
restart; all unauthorized paths and withdrawn content fail closed before cleanup.

- [X] T022 [P] [US3] Add exact membership/default/revocation/legacy and cross-workspace session tests in `tests/integration/pilot/sessions.test.ts`, including primary sessions unchanged when a second membership appears (FR-004, FR-012, FR-025).
- [X] T023 [P] [US3] Add pilot-to-primary publication/search/citation/metrics/native/job/MCP denial fixtures and tests in `tests/integration/pilot/isolation.test.ts`; ensure primary sanitized shared knowledge remains usable in pilot (FR-010, FR-012, FR-025).
- [X] T024 [US3] Bind authentication/session creation/resolution to selected membership in `lib/server/auth/credentials.ts`, `lib/server/auth/sessions.ts` and `app/api/auth/login/route.ts`; preserve canonical reviewer identity and default primary selection, reject unresolved legacy sessions (FR-004, FR-025).
- [X] T025 [US3] Add accessible explicit pilot login selection and visible synthetic workspace context in `app/login/login-form.tsx`, `app/login/page.tsx` and `app/_components/app-shell.tsx`; selection cannot create a membership or move a conversation (FR-004, FR-025).
- [X] T026 [US3] Implement shared pilot eligibility in `lib/server/access/policy.ts` and apply before/after retrieval in `lib/server/{knowledge,retrieval,learning,gaps,staffing,mcp}/` and relevant domain reads/jobs; preserve shared-primary policy while excluding synthetic primary outcomes (FR-010, FR-012, FR-025).
- [X] T027 [US3] Add idempotent operator provisioning validation in `scripts/provision-pilot-workspace.ts` and `tests/integration/pilot/provisioning.test.ts`; bind exact target and approved existing-principal memberships/grants, label synthetic records and create no accepted facts (FR-013, FR-014, FR-025).
- [X] T028 [P] [US3] Define/test private stream/stat/immutable-put/delete/list interfaces in `lib/server/storage/private-objects.ts` and `tests/contracts/pilot/private-objects.test.ts`: “Object keys contain opaque environment, namespace and object identities; immutable bytes must match expected size and SHA-256 digest.” Preserve domain limits (FR-009, FR-010, FR-023).
- [X] T029 [US3] Implement explicit local and uncached private Blob backends in `lib/server/storage/local-objects.ts` and `lib/server/storage/blob-objects.ts`, including bounded pagination, immutable conflict reconciliation, exact deletion and no public read URL/fallback (FR-009, FR-010, FR-023).
- [X] T030 [US3] Replace persistent-path assumptions through factories in `lib/server/artifacts/{store,upload,read,runner,cleanup}.ts`, `lib/server/staffing/store.ts`, `lib/server/reports/store.ts` and `lib/server/gaps/store.ts`; retain current source fences, private streaming and digest/size checks (FR-010, FR-023).
- [X] T031 [US3] Implement authorized direct staging-upload routes in `app/api/artifacts/intents/[intentId]/upload/route.ts` and `app/api/staffing/imports/[importId]/upload/route.ts`: “Upload capability is restricted to one staging path, declared size and at most ten minutes; it grants no read or overwrite permission.” Preserve existing >4.5 MiB/max-size support and server-verified completion (FR-012, FR-023).
- [X] T032 [US3] Adapt artifact/workforce upload UI and completion/reconciliation in `app/_components/` and existing `app/api/{artifacts/intents,staffing/imports}/` routes; add exact-byte replay, foreign/expired callback, cancelled intent, oversized content and stream-revocation tests in `tests/integration/pilot/uploads.test.ts` (FR-010, FR-012, FR-023).
- [X] T033 [US3] Implement fixed executor/local adapter contracts in `lib/server/jobs/executor.ts` and `lib/server/jobs/local-executor.ts`, materializing temporary private paths only for owned local commands; retain current parser/scanner/renderer output contracts (FR-024).
- [X] T034 [US3] Prepare versioned hosted scanner/parser/renderer build manifests under `infra/pilot/` reusing `infra/artifacts/` and `report-renderer/`; bind actual OCI/image, scanner signature and OCR asset versions and explicit command paths (FR-023, FR-024).
- [X] T035 [US3] Implement `lib/server/jobs/sandbox-executor.ts`: “Hosted jobs use nonpersistent isolated execution, denied network, no exposed ports and no application/provider credentials.” Transfer only verified bytes, cap resources/output/deadlines, validate results and stop owned sandbox in finally (FR-012, FR-016, FR-024).
- [X] T036 [US3] Implement admission, lease/provider creation-tag reconciliation, cancellation and orphan stop in `lib/server/operations/hosted-jobs.ts`; enforce two jobs/environment and original deadline, preserve unknown-cost hold and current generation before publication (FR-007, FR-016, FR-024).
- [X] T037 [US3] Route existing artifact/workforce/report jobs through the executor in `lib/server/artifacts/runner.ts`, `lib/server/staffing/runner.ts` and `lib/server/reports/render-jobs.ts`; validate actual PDF/PPTX in isolated execution and preserve existing approval/send boundaries (FR-023, FR-024).
- [X] T038 [US3] Add protected bounded `/eve/v1/turas/jobs` dispatch in `agent/channels/maintenance.ts`, `lib/server/operations/hosted-jobs.ts` and `vercel.json`; exact scheduler bearer, fixed catalog, no arbitrary command inputs or implicit research/model/email dispatch (FR-012, FR-016, FR-024).
- [X] T039 [US3] Refactor local and hosted finite ticks through the shared class registry in `scripts/maintenance-worker.ts`, `scripts/artifact-worker.ts`, `scripts/reports-worker.ts` and `lib/server/conversations/hosted-watchdog.ts`; keep short cleanup independent of heavy jobs and disabled authoring (FR-011, FR-018, FR-024).
- [X] T040 [US3] Add executor/lease/registry failure tests in `tests/integration/pilot/hosted-jobs.test.ts` and `tests/unit/pilot/maintenance.test.ts`: denied network, timeout, interrupted creation, lost lease, stale source, missing object, failure isolation and orphan cleanup (FR-007, FR-011, FR-012, FR-024).
- [X] T041 [US3] Implement content lifecycle inventory execution in `scripts/pilot-lifecycle.ts` using `docs/pilot-lifecycle.md` and existing cleanup functions; preserve every prior TTL, tighter batch limit and permanent receipt key, with separate active-store/backup outcomes (FR-009, FR-010, FR-011).
- [X] T042 [US3] Add cross-feature withdrawal-before-cleanup and interrupted-expiry tests in `tests/integration/pilot/lifecycle.test.ts`, covering original/derived/index/native/report/knowledge/MCP content, Blob failures and permanent replay tombstones (FR-009, FR-010, FR-011, FR-012).
- [X] T043 [US3] Add the malicious-file, untrusted-claim/injection, source-eligibility and role/workspace matrix in `tests/integration/pilot/access.test.ts`; correct failures only in their governed `lib/server/` services with exact regressions (FR-004, FR-010, FR-012, FR-025).
- [X] T044 [US3] Implement four-project UI catalog in `tests/ui/pilot-workspace.spec.ts`, `tests/ui/pilot-uploads.spec.ts` and `scripts/check-pilot-ui.ts`; verify keyboard/focus/empty/error/denied/responsive states, synthetic visual evidence and serious/critical accessibility (FR-004, FR-012, FR-023, FR-025).
- [ ] T045 [US3] Implement verified store inventory/copy/cutover procedure in `scripts/pilot-storage-migrate.ts` and `docs/pilot-operations.md`, requiring fenced writes, exact digest parity and retained old-store reconciliation; no unapproved original deletion or empty-local rollback (FR-005, FR-009, FR-023).
- [X] T046 [US3] Run the complete owned workspace/storage/executor/lifecycle/access and four-project UI catalogs; inspect safe screenshots and record counts/remaining actual-provider gaps in `specs/016-pilot-hardening/validation.md` (FR-012, FR-013, FR-023, FR-024, FR-025).
- [X] T047 [US3] Audit tracked outputs and safe diagnostics for private data and dependency exposure; record the bounded engineering security review and any unresolved blockers in `specs/016-pilot-hardening/validation.md` (FR-012, FR-020, FR-022).

## Phase 5: US2 — Matched recovery without revived authority (P1)

**Independent test**: Interrupted owned restore preserves reviewed history/bytes and
newer denials, meets the measured objectives and never repeats uncertain effects.

- [X] T048 [P] [US2] Add recovery manifest/encryption/key-availability/identity/partial-inventory contract tests in `tests/contracts/pilot/recovery.test.ts`; a database-only or snapshot-derived denial manifest cannot pass (FR-005, FR-006, FR-007).
- [X] T049 [US2] Implement owner compare-and-swap recovery control in `lib/server/operations/control.ts` and `scripts/pilot-control.ts`, with open→quiescing→locked→verified-open, finite drain and immutable transition receipts; runtime cannot unlock (FR-006, FR-007).
- [X] T050 [US2] Enforce recovery admission in `lib/server/access/service.ts`, `lib/server/auth/sessions.ts`, `lib/server/mcp/policy.ts`, `agent/channels/eve.ts` and governed worker/provider dispatch paths; explicitly permit only protected health/cancellation/cleanup/reconciliation while locked (FR-004, FR-006, FR-007, FR-012).
- [ ] T051 [US2] Implement matched database/private-object/workflow capability manifests and encrypted backup/verify commands in `scripts/pilot-backup.ts`; require separate key availability, source marker/ledger/grants, digests, consistent capture and outside-failure-domain copy (FR-005, FR-006, FR-008).
- [ ] T052 [US2] Implement exact private current-denial/replay reconciliation in `scripts/pilot-recovery-authority.ts`, covering newer session/MCP/grant/source/expiry/permanent receipts and uncertain send/paid attempts; absent current proof revokes/quarantines instead of replaying (FR-007, FR-010, FR-011).
- [ ] T053 [US2] Implement isolated restore/forward-migrate/grants/resume in `scripts/pilot-recovery.ts`; lock before app start, refuse in-place/unowned/mismatched targets, verify accepted history and byte inventories, reconcile actual hosted Workflow semantics and never auto-promote (FR-005, FR-006, FR-007, FR-021).
- [X] T054 [US2] Add schedule/age/expiry validation and operator scheduling manifest in `scripts/pilot-backup.ts` and `infra/pilot/backup-schedule.json`: “New managed backups run every 12 hours, must be no older than 24 hours, and expire after seven days; existing operator archives are not auto-deleted.” Preserve independent denial/replay data beyond backup expiry (FR-008, FR-009, FR-011).
- [X] T055 [US2] Add post-snapshot grant/session/MCP revocation, source deletion/publication invalidation and permanent replay cases in `tests/integration/pilot/recovery-authority.test.ts`; require denied access before cleanup and prohibit old deployment/session bypass (FR-007, FR-010, FR-012, FR-025).
- [X] T056 [US2] Add interrupted capture/restore/unlock/cleanup, missing key/object, wrong marker/schema and uncertain provider/send cases in `tests/integration/pilot/recovery.test.ts`, including locked UI/native/MCP/job denial and runtime unlock denial (FR-005, FR-006, FR-007, FR-012).
- [ ] T057 [US2] Measure RPO accepted-work boundary and RTO incident-to-verified-service in `scripts/pilot-recovery.ts`, record excluded quarantined scopes and fail full readiness if required scope remains unavailable (FR-008).
- [ ] T058 [US2] Exercise full owned encrypted restore and interruption catalog, verify original hashes/resources preserved, and record exact timing/coverage in `specs/016-pilot-hardening/validation.md`; keep hosted cadence proof separate (FR-005, FR-006, FR-007, FR-008, FR-022).
- [ ] T059 [US2] Write executable capture/restore/quarantine/unlock/forward-recovery and backup-expiry runbooks in `docs/pilot-operations.md`, including key recovery and managed-workflow limitations (FR-005, FR-007, FR-008, FR-019).

## Phase 6: US4 — Measured operating limits (P2)

**Independent test**: Fixed load passes per-class limits; outages cause safe bounded
failures, observable class health and a successful operator runbook drill.

- [X] T060 [P] [US4] Add health/status authorization, stopped-class and safe-output tests in `tests/integration/pilot/health.test.ts`, distinguishing a successful tick from a scheduler/chat heartbeat (FR-012, FR-018).
- [X] T061 [US4] Implement per-class status/backlog/freshness and exact schema/grant/store/image readiness in `lib/server/operations/health.ts`, `app/api/health/ready/route.ts` and canonical-admin-only `app/api/operations/status/route.ts`; public response stays minimal, failed readiness is 503 (FR-018, FR-021, FR-024).
- [X] T062 [US4] Implement safe health monitoring/90-day sample cleanup and outage observation in `scripts/pilot-health.ts` and `lib/server/operations/maintenance.ts`; detect stale class within five minutes without disabling other cleanup (FR-011, FR-018, FR-019).
- [X] T063 [US4] Implement fixed 25-session/250-customer/10,000-passage per-class benchmark in `scripts/benchmark-pilot.ts` and `tests/fixtures/pilot/load.ts`; two-minute warmup/ten-minute measurement, ≥100 samples/class, natural quota pacing/60-minute bound, p95 ≤2s ordinary/≤1s MCP and <1% failures per class and overall (FR-015).
- [X] T064 [US4] Implement separate infrastructure/model/email cost admission and reconciliation records in `scripts/pilot-cost.ts` and tests in `tests/contracts/pilot/cost.test.ts`; finite bounds/reservations, exact authorization, estimates labeled, unknown dispatch held, no reused feature budget (FR-016).
- [X] T065 [US4] Implement the quality applicability index in `scripts/pilot-quality.ts` and `specs/016-pilot-hardening/validation.md`, mapping current native/retrieval/source/owner boundaries to existing full verifiers and clearly separating historical from required fresh actual-model review (FR-017).
- [X] T066 [US4] Run complete owned load and fault catalogs for DB/store/worker/executor/budget/unknown-cost failures and record per-class timings, counts, natural quota waits and zero deterministic paid calls in `specs/016-pilot-hardening/validation.md` (FR-015, FR-016, FR-018).
- [X] T067 [US4] Complete incident/withdrawal/revocation/worker/budget/uncertain-send/release runbooks in `docs/pilot-operations.md`; include owner, exact evidence, safe actions, verification and stop conditions (FR-019).
- [ ] T068 [US4] Obtain an actual independent operator/reviewer runbook exercise using `scripts/pilot-feedback.ts` and private `local-artifacts/016/` observations; record timing and corrections in `specs/016-pilot-hardening/validation.md` without inventing participant feedback (FR-019, FR-020).
- [ ] T069 [US4] Complete any fresh actual-model evaluations required by the applicability index using governing feature commands, existing model and explicitly admitted budget/independent review; validate exact captures with their verifiers and record outcomes in `specs/016-pilot-hardening/validation.md` (FR-016, FR-017).

## Phase 7: US5 — Hosted pilot, feedback and release (P2)

**Independent test**: Actual hosted linked journeys and assigned-partner reads pass,
participants supply feedback, blockers are corrected, and mcteer decides on exact proof.

- [X] T070 [US5] Implement private scope/participant/feedback recording in `scripts/pilot-feedback.ts`: “A feedback item has a UUID, one journey, a named participant reference, severity `blocker`, `major` or `minor`, and a disposition with an owner.” Enforce feedback state `recorded → triaged → resolved | deferred`; bind at least one internal and one assigned-partner participant, actual observations and fixed scope (FR-020).
- [ ] T071 [US5] Implement `scripts/pilot-hosted.ts` for exact deployment/schema/grant/config checks and scoped authenticated HTTP/CLI WebKit/actual SDK/file-job catalog; preserve private logs and prohibit implicit paid research/model/send/load or primary-customer mutations (FR-013, FR-014, FR-021, FR-023, FR-024).
- [ ] T072 [US5] Prepare concrete target provisioning/store/image/worker/cost manifests under private `local-artifacts/016/` and operational instructions in `infra/pilot/`/`docs/pilot-operations.md`; reuse applicable authorization, obtain only missing concrete infrastructure/budget authority before external changes (FR-014, FR-016, FR-023, FR-024).
- [ ] T073 [US5] Provision/validate the authorized private backend and hosted images/workers in Preview, apply required schema/grants, test actual maximum-size uploads/scan/parse/render/restart/cross-instance/cleanup/denied-network paths, and record deployment-bound proof in `specs/016-pilot-hardening/validation.md` (FR-013, FR-021, FR-023, FR-024).
- [ ] T074 [US5] Perform the authorized Production compatibility sequence from `docs/pilot-operations.md`: current-release snapshot-bound preservation/rehearsal under an external maintenance perimeter, 078/079/grants before dependent code, then079 matched-service backup/recovery acceptance before readiness, old-deployment protection, disabled adapters, verified exact target and explicit enablement; record actual versions in `specs/016-pilot-hardening/validation.md` (FR-006, FR-021, FR-022, FR-025).
- [ ] T075 [US5] Execute the explicit Production pilot provisioner and ordinary J002–J015 proposals/reviews/assignments using `scripts/pilot-hosted.ts`; prove linked accepted profile/evidence/plan/delivery/report records, genuine file outputs, training verification and appropriate learning rejection/publication gates (FR-013, FR-014, FR-020, FR-025).
- [ ] T076 [US5] Prove positive five-category actual SDK reads/citations, current-source denial and owner/admin revoke plus Product Gaps refresh and role/workspace browser boundaries after merge via `scripts/pilot-hosted.ts`; record exact deployed commit/schema in `specs/016-pilot-hardening/validation.md` (FR-010, FR-012, FR-013, FR-021).
- [ ] T077 [US5] Observe two actual scheduled backups ≥12h apart, restore one ≤24h old and verify current denied-state reconciliation/RTO plus all hosted maintenance classes through `scripts/pilot-backup.ts`, `scripts/pilot-recovery.ts` and `scripts/pilot-health.ts`; record actual cadence separately from local accelerated tests (FR-005, FR-007, FR-008, FR-018).
- [ ] T078 [US5] Collect actual hosted automated internal/assigned-partner observations per the 2026-10-19 directive with `scripts/pilot-feedback.ts`, correct/recheck all blockers in the affected source/tests, assign every other disposition and record G21 in `specs/016-pilot-hardening/validation.md`; label observations automated and retain independent capture review; do not impersonate absent participants (FR-019, FR-020).
- [ ] T079 [US5] Reconcile cost/quality/private evidence, run fresh `scripts/pilot-readiness.ts` and record the actual mcteer scoped decision in `specs/016-pilot-hardening/validation.md`; incomplete mandatory gates remain pending and JSON owner labels cannot approve (FR-002, FR-003, FR-016, FR-017, FR-020, FR-022).
- [ ] T080 [US5] Revoke owned test credentials, stop owned compute and remove unnecessary owned OrbStack containers/volumes, unused owned images and temporary copied environments, lifecycle-retire approved pilot payloads after capture, preserve permanent receipts and selected local state, then record final identity/role/worker checks and exact cleanup inventory in `specs/016-pilot-hardening/validation.md` (FR-009, FR-011, FR-021, FR-022).

## Phase 8: Cross-cutting completion

T081/T082 gate every merge that precedes T073–T080; their final completion is recorded
after the last code change. Do not execute hosted release first because of task numbering.

- [x] T081 Implement and run complete affected predecessor regression composition in `scripts/check-pilot-regressions.ts`, including browser/native/MCP/session, store, extraction/rendering, retirement and source-policy catalogs; correct failures with their feature regression tests (FR-004, FR-010, FR-012, FR-017, FR-023, FR-024, FR-025).
- [x] T082 Wire `scripts/pilot-ci-evidence.ts` and complete deterministic/UI/recovery/lifecycle/load/regression/build gates into `.github/workflows/ci.yml`; run `npm run check:docs`, typecheck, web/eve builds and exact required CI with zero skips/flaky acceptance before each authorized merge (FR-002, FR-021).
- [ ] T083 Update `README.md`, `ROADMAP.md`, `docs/pilot-operations.md` and `specs/016-pilot-hardening/{spec,validation,handoff}.md` with actual local/CI/provider/hosted/human status, schema/grants, configuration, rollback and unresolved limits; never call intermediate implementation a ready pilot (FR-001, FR-019, FR-021, FR-022).
- [ ] T084 After each authorized green merge, leave PR closed, remove its local/remote branch, verify README on main, and confirm exact-version Production behavior from T074–T080; record closeout in `specs/016-pilot-hardening/validation.md` (FR-021, FR-022).

## Dependencies and independent checkpoints

Setup T001–T005 → foundation T006–T013 → US1 T014–T021 → US3 T022–T047 →
US2 T048–T059 → US4 T060–T069 → US5 T070–T080. T081/T082 run before every
release/merge; T083/T084 accompany each release and final closeout. US2 contract
tests/runbooks can be authored earlier, but full restore depends on final US3 stores.
US4 health tests can be authored after foundation; measurements require real ticks.
T072–T080 require actual runtime authorization/credentials/participants as described,
not a new speculative approval for already-authorized actions.

US1 is the first useful checkpoint: a trustworthy blocked/ready evidence report.
US3 yields independently testable isolation and hosted byte handling. US2 validates
restoration of those components. US4 proves bounded operation. US5 proves actual
hosted workflows and participant response. All stories and mandatory gates are
required for full 016 acceptance; smaller merged stages retain their limitations.

Parallel examples after prerequisites: T014 vs T019 contract/privacy tests once
shared schemas exist; T022 vs T023 session/isolation fixtures; T028 interface tests
vs T034 immutable-image manifests after dependency review; T048 recovery contracts
vs T059 runbook draft; T060 health tests vs T064 cost-contract tests; T070 feedback
schema vs T071 hosted-runner authoring after final contracts. Shared migrations,
policy files, source digests, environment operations and paid admission stay sequential.

## Requirement coverage

| Requirements | Tasks |
| --- | --- |
| FR-001 | T001, T003, T006, T012, T016, T018, T021, T083 |
| FR-002 | T006, T007, T014–T021, T079, T082 |
| FR-003 | T007, T014, T016, T021, T079 |
| FR-004 | T009, T013, T022, T024–T025, T043–T044, T050, T081 |
| FR-005 | T004, T045, T048, T051, T053, T056, T058–T059, T077 |
| FR-006 | T048–T051, T053, T056, T058, T074 |
| FR-007 | T010, T036, T040, T048–T050, T052–T053, T055–T056, T058–T059, T077 |
| FR-008 | T051, T054, T057–T059, T077 |
| FR-009 | T004, T028–T029, T041–T042, T045, T054, T080 |
| FR-010 | T023, T026, T028–T030, T032, T041–T043, T052, T055, T076, T081 |
| FR-011 | T039–T042, T052, T054, T062, T080 |
| FR-012 | T011, T013, T022–T024, T026, T031–T032, T035, T038, T040, T042–T044, T047, T050, T055–T056, T060, T076, T081 |
| FR-013 | T003, T027, T046, T071, T073, T075–T076 |
| FR-014 | T005, T008, T018, T027, T071–T072, T075 |
| FR-015 | T063, T066 |
| FR-016 | T005, T035–T036, T038, T064, T066, T069, T072, T079 |
| FR-017 | T003, T065, T069, T079, T081 |
| FR-018 | T004, T010, T012, T039, T060–T062, T066, T077 |
| FR-019 | T059, T062, T067–T068, T078, T083 |
| FR-020 | T007, T019, T047, T068, T070, T075, T078–T079 |
| FR-021 | T011, T013, T020, T053, T061, T071, T073–T074, T076, T080, T082–T084 |
| FR-022 | T001, T005, T008, T017, T019, T047, T058, T074, T079–T080, T083–T084 |
| FR-023 | T002, T004–T005, T028–T032, T034, T037, T044–T046, T071–T073, T081 |
| FR-024 | T002, T004, T010, T012, T033–T040, T046, T061, T071–T073, T081 |
| FR-025 | T009, T013, T022–T027, T043–T044, T046, T055, T074–T075, T081 |
| SC-001 | T014–T021, T079, T082 |
| SC-002 | T048–T059, T077 |
| SC-003 | T022–T023, T026, T040–T043, T052, T055, T076, T081 |
| SC-004 | T063, T066 |
| SC-005 | T039–T040, T060–T062, T066–T068, T077 |
| SC-006 | T071–T078 |
| SC-007 | T068, T070, T078–T079 |
| SC-008 | T007, T011, T013, T019, T047, T071–T074, T076, T080, T082–T084 |
| SC-009 | T028–T040, T045–T046, T073–T077 |
| SC-010 | T009, T022–T027, T043–T044, T055, T074–T076, T081 |


## Phase 9: Convergence

These tasks refine the remaining authoring within T045, T051–T059 and T071–T072.
They do not replace their original acceptance gates, add a new delivery feature,
waive external authority, or manufacture actual-model/operator/participant proof.

- [ ] T085 Complete the admitted hosted store inventory/copy/cutover path in `scripts/pilot-storage-migrate.ts`, `lib/server/storage/inventory.ts` and `docs/pilot-operations.md`: bind exact source/destination/backend/budget, hold the existing write fence, cold-read byte/digest parity, verify configuration readback and retain the original store with a nonempty rollback procedure; preserve all current size/access/deletion rules per FR-005, FR-009, FR-023 and T045 (partial).
- [ ] T086 Complete matched work-controlled capture and schedule integration in `scripts/pilot-backup.ts`, `lib/server/operations/{workflow-checkpoint,work-capture-read,work-backup-objects}.ts` and the existing backup scheduler: bind actual database ledger/grants/accepted history, exact private object inventory, actual configured Workflow capability and separate key availability, verify independent retained encrypted bytes and reject missing required components before recording a complete backup per FR-005, FR-006, FR-008 and T051/T054 (partial).
- [ ] T087 Complete one protected, interruption-resumable reconciliation path in `scripts/pilot-recovery-authority.ts` and `lib/server/operations/` that applies independently current credential/grant/source/publication/expiry denials, audits permanent request fences and reconciles actual uncertain paid/native/send effects against original provider identities; preserve quarantine/history and prohibit replay or unlock with absent current proof per FR-007, FR-010, FR-011 and T052 (partial).
- [ ] T088 Complete the isolated recovery verification path in `scripts/pilot-recovery.ts`, `lib/server/operations/{isolated-restore,work-isolated-restore,recovery-timing}.ts` and `docs/pilot-operations.md`: explicitly forward-migrate/grant, reconcile the actual managed Workflow semantics, preserve original identities without rerunning initial paid delivery, verify authenticated required service and current denials before explicit owner unlock, then measure actual accepted-work RPO and incident-to-verified-service RTO; required quarantined scope must still block full readiness per FR-005, FR-006, FR-007, FR-008, FR-019 and T053/T057–T059 (partial).
- [ ] T089 Complete the fixed J002–J015 normal-record/role catalog in `scripts/pilot-hosted.ts` and its existing governed helpers: streaming/resume/stop and membership boundaries, approved source/retrieval/knowledge, cited plan/design and accepted delivery/report chain, reviewed workforce/allocation, assigned-partner guide/demonstration, actual scoped learning evaluation with appropriate no-benefit rejection/publication and current-source SDK revocation; emit complete exact-source/deployment/role/case receipts only after every required positive and boundary case, while recording actual hosted automated role observations per the 2026-10-19 directive and keeping release decisions separate per FR-002, FR-013, FR-014, FR-017, FR-020, FR-021 and T071/T075–T076 (partial).
- [ ] T090 Complete the actual hosted file-job catalog in `scripts/pilot-hosted.ts` and the existing Blob/Sandbox adapters: explicitly admitted maximum-size upload/scan/parse/render, malicious/malformed input, cancellation/deadline/lost-lease/network denial, cold restart/cross-instance reads, source withholding and verified owned cleanup, with actual immutable image/signature/OCR/program/provider identities and unchanged per-job concurrency/deadline/domain bounds per FR-016, FR-023, FR-024 and T071/T073 (partial).
- [ ] T091 Complete private target/provisioning/store/image/worker/cost manifests and exact configuration readback before hosted writes in `scripts/pilot-hosted.ts`, `infra/pilot/` and `docs/pilot-operations.md`: bind the intended Preview/Production project/team/deployment/marker/schema/grants/backend/executor/health and finite service envelopes, reuse only applicable existing authority, retain the original model-evaluation journal/cap/expiry and disabled automatic billing, and obtain only missing concrete infrastructure/release authority before external changes per FR-014, FR-016, FR-021, FR-022, FR-023, FR-024 and T072–T074 (partial).


## Phase10: Current-release integration and remaining evidence

- [ ] T092 Reconcile PR32 with released mainf8d196f in shared runtime/domain/UI/CI files; preserve001–077, add078/079, exact current guards, ordinary native retirement/upload backlog, Preview readiness and separate admitted indexing; verify targeted regressions and complete current-source catalog before release (FR-004, FR-006, FR-010, FR-012, FR-021, FR-023–FR-025).
- [X] T093 Extend current denial/replay and paid-effect capture/reconciliation in `lib/server/operations/recovery-denial-snapshot.ts` and consumers to include released ordinary/provider/reservation/replay state; test unknown holds and exact request fences without replay or manufactured settlement (FR-005, FR-007, FR-010, FR-016).
- [X] T094 Verify exact released-schema077 safety capture and owned forward restore through079 in `scripts/pilot-database-safety-copy.ts`, `lib/server/operations/legacy-safety-restore.ts` and governing tests; preserve historical receipt identities, require full installed ledger/digest/runtime fence and retain original failure evidence (FR-005–FR-008, FR-021).

## Phase 11: Convergence

These findings refine T052–T059/T074/T087–T088. A real-target verification
producer and fixed-transport command now exist with owned composition evidence;
the complete CLI lifecycle passed on an owned target; fresh complete-source
validation and actual hosted acceptance remain pending.
No hosted target may be locked for release before its measured reopen path exists.

- [X] T095 Implement the exact-target hosted current-denial reconciliation path in `scripts/pilot-recovery-authority.ts` and `lib/server/operations/recovery-credential-denials.ts`, sharing the existing deny-only domain logic while requiring independently verified platform/owner/locked079 bindings and authenticated retained current v7 bytes; preserve owned Docker checks on their existing entry point, unknown holds, original provider identities and permanent replay fences per FR-005–FR-007, FR-010–FR-011 and Constitution IV/VIII (missing; CRITICAL).
- [ ] T096 Implement measured required-service and managed-Workflow/external-effect verification for real Preview/Production recovery in `scripts/pilot-recovery.ts` and `lib/server/operations/`, covering every required accepted-content/authorization/SDK scope, retiring all temporary probes and retaining unresolved effects/quarantines; no JSON healthy flags or five-path owned-only check may establish full hosted service per FR-006–FR-008, FR-019, SC-002 and T053/T057–T059 (partial; HIGH).
- [X] T097 Implement the authoritative recovery verification producer in `lib/server/operations/` and `scripts/pilot-recovery-authority.ts`: consume genuine exact-target integrity/current-denial/replay/Workflow/service measurements, compose under16020→16017 decision fences, derive the final state digest after probe retirement, insert the immutable verification and use existing quarantine resolution/control commands; preserve all existing unlock guards and test missing, stale, forged, changed-state and interrupted measurements before any real-target lock per FR-006–FR-008, FR-010, SC-002 and Constitution IV/VIII (implemented; owned full CLI lifecycle verified; actual hosted acceptance remains separate).


- [X] T098 Correct gate dependency evidence composition with versioned actual
  verification observations in `scripts/pilot-gate-verification.ts`, the readiness
  contract/checker and six regression cases; retain immutable original execution
  intervals/digests, original hosted freshness, complete attempt selection and
  operation-specific ordering. Actual hosted readiness remains unverified.

- [X] T099 Author the normal generated-file preparation/restart resume path and
  40-slide content-boundary exercise, preserving original job/image/cost identities,
  original-author revisions and separate normal review/publication. Verify eight
  adapter/layout regressions and the actual owned HTTP/render/read/withdrawal
  journey. Actual cloud/restart and exact-byte boundary remain in T090.

- [X] T100 Add exact private report-wrapper/common-Blob byte-boundary components
  and the explicitly documented hosted shared-adapter composer. Bind original
  retention identities, selected current component run/cases and hashed complete
  suite/result/process index. Four owned component cases pass; actual hosted
  composition and full current-catalog acceptance remain part of T090.

- [X] T101 Author separately scoped release-bundle aggregation and typed original
  workload/four-project UI verification. Retain original execution attribution,
  freshness, selected attempts and final-operation ordering; require private
  validation provenance, bijective input inventory and repeated final hosted
  identity checks. Sixteen focused regressions, pilot typecheck and docs pass;
  independent scoped review found no remaining blocker. Actual complete current
  runs, hosted release and final eligibility remain required by T089–T092/T096.

- [X] T102 Preserve actual per-program deadline classification in the hosted
  executor while keeping output retrieval under the original domain deadline;
  add the fail-closed normal-parser SIGSTOP operator exercise without changing
  source bytes, programs, original deadlines or cost holds. Seventeen focused
  executor/observer cases pass and independent review found no scoped blocker.
  Actual cloud suspension/timeout/cleanup remains required by T090; the local
  emulated-image attempt is retained as unverified.

- [X] T103 Produce and verify separately scoped canonical G19 receipts from actual
  SDK role captures; exercise normal assigned-partner grant revocation, preserve
  original capture/preflight digests and times, require exact named inventories,
  distinct connection identities and verified retirement, and reject forged
  validation provenance. Seven owned SDK cases and fifteen producer/bundle cases
  pass. Actual hosted G19 execution and remaining core/partner/release receipts
  remain within T089/T092; full readiness is not established.

- [X] T104 Produce and verify canonical partial G18 evidence from original normal
  partner exercises, complete scored paired captures, original settled budget/
  provider identities, server-derived publication/rejection, native retirement
  and current role denials. Preserve capture bytes, actual intervals and automated
  attribution; require typed immutable provenance in composed release checks.
  Nineteen focused partner/SDK/bundle cases and the actual owned normal HTTP
  training case pass. Actual hosted/model G18 execution remains part of T089.

- [X] T105 Author canonical G21 evidence from original automated role observations,
  independent capture review, complete immutable feedback dispositions and typed
  passing rechecks; enforce current deferral deadlines on final consumption and
  preserve historical partner scope after deliberate revocation without restoring
  authority. Fifteen producer/bundle cases and five owned scope cases pass. Actual
  hosted G21 execution remains part of T078/T089.

- [X] T106 Fix the reproduced bounded evidence eligibility-scan refusal without
  weakening source checks or increasing the 100-candidate request limit. Continue
  through an opaque actor/scope/snapshot-bound cursor, preserve the unscanned
  candidate and reserve empty/no-cursor for exhaustion. Five evidence integration
  cases and exact matched-dump local diagnosis pass; root typecheck passes.
  Fresh committed full catalog/CI and genuine hosted recovery remain T089/T090
  release requirements.

- [X] T107 Forward the effective root output-token limit used by admission to
  the provider request, including the existing 8,192-token fallback. Extend the
  existing synthetic generate/stream case to check fallback, explicit limit and
  unrelated dispatch without changing the selected model or case inventory.
  Six owned root-budget cases and root typecheck pass. Provider accounting and
  the shared worst-case reservation remain independently required.

- [X] T108 Keep exhaustive canonical MCP batches within the original short-lived
  credential by reducing each batch to 20 customers. Preserve the 59-second
  lifetime, complete scope and original 32-probe bound; verify all 1,479 owned
  selections and retirement. The focused owned case, typecheck, documentation and
  independent review pass. Retain the failed actual
  60-customer regional run and require fresh committed/hosted verification.

- [X] T109 Remove the executor deadline fixture's real-clock scheduling race
  without changing runtime deadlines or cleanup. Use a controlled clock, wait
  for actual synthetic command admission, and check the same 30-millisecond
  deadline plus transfer-phase expiry in the existing case. Preserve the original
  CI failure. All 14 executor cases, typecheck, documentation checks and independent
  review pass; fresh committed complete checks remain required.

- [X] T110 Own idle database transport errors in the actual denial capture/read
  and Production peer recovery paths. Abort the affected step, check cancellation
  before publishing proof, preserve independent cleanup, and verify a real idle
  backend termination. The focused owned case, pilot typecheck, documentation
  checks and independent source review pass. Retain the failed regional guard
  observation and require fresh complete committed and hosted verification.

- [X] T111 Reduce exhaustive recovery measurement latency with at most four
  independently owned lanes and one enforced32-slot lifetime registry. Reconcile
  authenticated denials before any group probe exists, retain all per-read,
  credential, owner, command and freshness bounds, withhold measurement brands
  until every final check/cleanup passes, and quarantine undrained writers.
  Bind conversation HTTP freshness to the original fenced final transaction and
  avoid repeated whole-maintenance inventory scans there. Verify actual mixed
  SQL/HTTP/MCP composition, neighbor credential survival, cancellation, permanent
  slot consumption and rejected copied/reused proof capabilities before fresh
  committed catalog/CI/hosted checks (FR-006–FR-008, FR-019; T096). Four cancellation
  cases and the extended genuine32-probe, mixed full recovery command and
  conversation transaction-binding cases pass. Pilot typecheck, documentation
  checks and independent source review pass; fresh committed/hosted checks remain
  required and original failures are retained.

- [X] T112 Give the synthetic research-cancellation UI fixture an exact idle
  native stream and deny its native delivery without a provider call. Check that
  the stream was read and the real start guard becomes enabled before exercising
  keyboard cancellation. Preserve research, checked-finding and accessibility
  assertions, all existing deadlines and the original CI failure. The corrected
  four-project WebKit matrix passes24 cases with four existing skips and no
  retries; refresh committed-source catalog, CI and hosted proof before release.

- [X] T113 Preserve the deliberate never-draining cancellation callback in the
  owned locked-target fixture and assert both its controlled cancellation and
  bounded-drain failure, then independently verify actual credential retirement.
  Retain the original full-catalog failure, preserve production drain guards and
  all deadlines. All16 affected owned cases pass; require fresh committed
  catalog, CI and hosted checks.

- [X] T114 Keep owned-suite cancellation connected to fixture cleanup before and
  after publishing its handle, and retain the health suite's pending initialization
  for teardown. Preserve the120-second complete owned lifecycle; declare120-second
  setup and30-second cleanup hooks within a240-second outer file bound and the
  existing90-minute catalog bound. Register three lifecycle unit cases and retain
  the original setup-hook failure. The12 focused cases and pilot types pass; fresh
  committed catalog, CI and hosted verification remain required.


- [X] T115 Prepare authenticated canonical MCP denials once per genuine owner
  decision transaction, binding the original client, target, transaction and
  retained capability. Exclude concurrent credential issuance during preparation;
  keep every per-probe snapshot, authorization and59-second expiry check. Reuse
  preparation in final verification only after its lost-COMMIT acknowledgement
  check. Preserve the original hosted SQL23514 failure and all prior financial
  holds; verify copied/expired capabilities, overlap, full canonical scope and
  fresh committed catalog/CI/hosted behavior without changing any clocks. The two
  focused cases, pilot types, docs and independent review pass; the fresh complete
  committed catalog, CI and hosted verification remain pending.


- [X] T116 Remove the native execution cleanup test's worker-ownership race: retain
  its manual cleanup tick but assert eventual exact-attempt payload removal,
  retirement and completed-job provenance. Preserve immutable usage and all
  history/reconnect/replay/provider-call assertions, retention and runtime clocks.
  Independent source review, the focused native case and pilot types pass;
  fresh committed complete catalog and CI checks remain required. Retain the
  original CI assertion failure.
