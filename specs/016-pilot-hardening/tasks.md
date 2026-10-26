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
- [ ] T077 [US5] Verify a fresh actual backup and isolated restore ≤24h old, enable the stable recurring schedule, and verify current denied-state reconciliation/RTO plus all hosted maintenance classes; record two genuine scheduled captures ≥12h apart as an unobserved operational follow-up without blocking release under the explicit 2026-10-24 user directive through `scripts/pilot-backup.ts`, `scripts/pilot-recovery.ts` and `scripts/pilot-health.ts`; record actual cadence separately from local accelerated tests (FR-005, FR-007, FR-008, FR-018).
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


- [X] T117 Partition the actual120-minute expansion WebKit CI cancellation into
  four full-project jobs without changing any case assertion, retry policy or
  fixture/child/job bound. Preserve the required `expansion (webkit)` check as an
  always-running aggregate that requires every dependency to succeed and binds
  exact source/run/attempt, current independent discovery and each successful
  case report. Upload only bounded safe fields for one day; reject incomplete,
  changed, linked, skipped, flaky or retried evidence. Register the three integrity
  regressions in both predecessor and pilot catalogs. Independent review, focused
  integrity checks, types and actual84-case discovery pass; fresh committed full
  catalog/CI remains required. Retain the original cancellation.

- [X] T118 Correct profile proposal confirmation guidance after the actual003
  `assistant-pending-proposal` run2 printed an unsupported revision UUID before
  correcting it. Report the tool-confirmed review state, claim text and steward
  next step; include identifiers only on request and copy them exactly. Preserve
  the complete failed reply, unchanged citation hard gate, model, deadlines and
  original cumulative financial holds. Independent diagnosis confirms a genuine
  unsupported identifier. Fresh committed catalog, CI and complete model/hosted
  acceptance remain required under T069/T073–T079; no retry of an uncertain call.

- [X] T119 Preserve independent health-route outcomes and fixed startup phases
  after the actual CI artifact evaluation readiness failure. Keep raw startup
  output private, whitelist every published diagnostic field, retain the failed
  run, and preserve the original readiness assertions and all time limits.
  Independent review, privacy regressions and pilot types pass. This diagnostic
  correction does not establish the startup cause or replace fresh complete
  source-bound catalog, CI and hosted acceptance under T069/T073–T079.

- [X] T120 Add the exact recovery completion branch to the existing Vercel Git
  deployment suppression map, preserving main and all build/install/cron settings.
  Allow source-bound CI without an automatic Preview build. Keep separately
  funded exact-commit hosted acceptance mandatory before merge; confirm actual
  suppression after push and retain any unexpected deployment as unresolved.

- [X] T121 Preserve the fixed startup diagnostic through the actual JSON-only
  Vitest reporter using direct stderr, after the later CI readiness failure.
  Verify actual reporter transport and privacy, retain both failures, and keep
  the startup cause, full changed-source catalog and CI acceptance unresolved
  until their actual source-bound checks complete. Preserve all readiness and
  timeout assertions.

- [X] T122 Preserve passive report-preview network timing and report-control
  lifecycle in fixed-shape Product Gaps UI failure diagnostics after the actual
  mobile WebKit confirmation timeout. Retain the CI failure and88/88 local
  diagnostic nonreproduction, verify privacy and original journeys, and preserve
  handlers, responses, assertions, deadlines and retry policy. These observations
  do not establish an internal state transition or product correction.

- [X] T123 Distinguish disposable artifact-app port binding, actual auth-route
  execution, internal eve health and owned-database availability after the latest
  CI readiness timeout. Publish only bounded fixed fields, contain diagnostic
  errors and close the diagnostic socket at its own deadline. Require exact
  execution-marker lines rather than compiler excerpts. Preserve the original
  readiness assertions,60-second allowance and2-second probes; retain the failed
  CI and require fresh complete catalog, CI and hosted acceptance. The cause of
  the startup failure remains unproved.

- [ ] T124 Apply the existing leased evaluation-port invariant to the artifact
  fixture: preserve the lease during all asynchronous preparation, release just
  before the original development supervisor starts, and release in cleanup even
  if earlier cleanup fails. Preserve all cases, model limits, readiness checks
  and deadlines. Verify existing lease/privacy regressions and the original three
  owned-source cases. Retain c5a733e failures and require new committed catalog,
  CI and hosted evidence without claiming a demonstrated TCP collision.

- [x] T125 Diagnose the repeated committed-source artifact readiness failure
  with failure-only static fetch and fresh-socket HTTP observations. Seed only
  an owned static sentinel; retain the original 60-second admission predicate,
  2-second readiness probes, cases, model limits and all outer clocks. Bound
  additional probes to one second, run them alongside existing failure observations,
  close connections on every exit, and publish only fixed transport metadata.
  Verify lifecycle/privacy checks and record actual Linux CI observations before
  claiming a failing phase or selecting a behavioral fix.

- [ ] T126 Separate ordinary session admission from the full recovery/domain
  runtime import graph after the `15468da` CI observation: preserve the existing
  shared16017 SQL fence, OPEN-mode requirements, one cancellation WeakSet and all
  connection/revision/deadline-bound recovery capabilities. Verify the import
  boundary and existing real-database admission/logout/recovery/MCP regressions,
  root typechecking, fresh complete source-bound catalog and CI. Do not change
  readiness predicates, deadlines, model selection or release gates; no specific
  import is established as the CI cause until actual verification supports it.

- [ ] T127 Preserve actual `5124987` partner WebKit and pilot regression failures,
  and add fixed failure-only regression stage/process/current-schema-count and
  approved browser-location observations, including eight fixed steps in the partner
  absent-request journey. Retain every predecessor/current-schema/
  four-profile case, predicate, timeout and retry setting; rethrow the original
  error and keep arbitrary child/test/page content private. Verify focused privacy,
  types and inventory checks; record actual new CI phase before selecting a fix.
  The partner-only once executor must remain unexecuted while a second job fails.

- [ ] T128 Retain the actual `5124987` deterministic CI failure at recovery MCP
  HTTP suite154 and distinguish the owned watchdog, process signals and fixed
  child spawn/abort classes in the full catalog failure receipt. Preserve all
  cases, predicates, suite/outer deadlines and cleanup behavior. Verify privacy
  and types; require actual new source-bound full catalog/CI evidence. Timing
  alone is not proof of a watchdog or an MCP assertion failure.

- [ ] T129 Preserve the actual `4964417` mobile-dark public-research preview
  timeout at Prepare refresh. Add fixed failure-only phase timings, mocked refresh
  request/fulfillment counts and passive panel-state booleans, with bounded
  diagnostic waiting and unconditional original-error propagation. Preserve every
  original operation, assertion, case, retry setting and30-second test deadline.
  Keep arbitrary DOM, URLs, IDs and error prose private. Verify types and actual
  new source-bound CI observations before selecting any behavioral fix; response
  fulfillment and DOM presence alone do not prove consumption or visibility.

- [ ] T130 Close the owned pilot fixture's direct-parent-exit cleanup gap after
  the actual `4964417` unpaid native admission check left late trace files.
  Reuse genuine process-group retirement capabilities for worker, app/supervisor,
  native service and build; retain failed capabilities, attempt all retirements,
  reject stale concurrent startup and refuse temporary-root removal until verified.
  Preserve the helper's5-second escalation/10-second total verification policy
  and every case/outer deadline. Verify descendant/error/cancellation behavior,
  actual native denial preparation with zero dispatch and exact cleanup, then fresh
  complete source-bound catalog/CI. Retain original traces and failure evidence;
  do not identify an exact trace writer without proof.

- [ ] T131 Correct CI evidence publication after the actual `4964417` workflow
  passed all1019 catalog cases and MCP build but failed required artifact upload.
  Capture immutable parent CI provenance before owned-environment sanitization,
  keep it out of test children, and pin the pilot checkout and expected commit
  to the actual branch head. Preserve the complete catalog and original clocks.
  Verify types and actual fresh authenticated CI artifact retention/import against
  the exact source; a passing test command alone does not complete this task.


- [ ] T132 Correct CI catalog orchestration after the actual `1c34d96` outer
  watchdog abort at recovery MCP HTTP suite154. Explicitly amend only the CI
  batch90-minute preservation in T114/T128/T130/T131 to a fixed120-minute
  GitHub Actions controller; retain90 minutes locally, every case/file/domain/
  model/readiness deadline, cleanup escalation, financial/provider limits and
  all1,022 cases across185 suites. Keep the existing300-minute workflow ceiling.
  Emit fixed suite timing/remaining owned budget without private output. Preserve
  the original failed run. Verify focused controllers, types/docs and fresh
  exact-source full local/CI, artifact retention and owned cleanup; the amendment
  alone establishes no passing gate, model quality or hosted readiness.

- [ ] T133 Retain the five actual `eb15b39` native legacy startup failures and
  correct the shared readiness probe cleanup/observation gap: independently
  retain each same-iteration response status and cancel its body even when the
  sibling probe fails. Preserve the original401/2xx predicate,2-second probes,
  90-second readiness window and outer/model clocks. Publish only fixed transport
  classes, counts and passive startup booleans. Verify sibling-timeout response
  retirement, expired-budget denial and privacy, then exact committed full catalog,
  CI and owned cleanup. The response cleanup defect is demonstrated; its causal
  contribution to the original startup failures remains unproved.

- [ ] T134 Retain the failed `eb15b39` local catalog (591 passes before five
  isolated-restore failures) and add failure-only fixed recovery application
  listener/auth/callback/protected-warmup observations before child retirement,
  including exact module/Next-prepare/listen milestones after the actual narrowed
  artifact failure was observed before listener readiness.
  Preserve every request, original error,401/release predicates,30/5-second auth
  probes,60-second restricted runtime lease and every owned/case/file/batch clock.
  Publish only approved phases/surfaces, passive process/signal booleans, statuses
  and bounded timings. Retain the exact synthetic outer environment marker in the
  private catalog failure receipt for subsequent ownership/cleanup verification.
  Verify privacy and diagnostic transport; reproduce all five original restore
  cases before claiming an internal phase or selecting a behavioral fix, then
  require complete committed-source catalog/CI/cleanup and hosted gates.


- [ ] T135 Preserve the actual `eb15b39` CI result (43 successful jobs and seven
  failed jobs, with all seven full failed logs independently reviewed). Its pilot
  catalog passed 721 cases including all five restore cases, then failed an
  unauthenticated evaluation-source readiness request after auth-handler entry.
  Deny ordinary missing/empty-Cookie requests before database admission because
  they cannot carry a session token. Preserve purpose validation, every nonempty
  cookie's admission/session checks, special-purpose paths, the existing401
  predicate and all original clocks. Verify the old-code negative regression and
  authenticated/revocation boundaries, then fresh exact-source full catalog/CI
  and owned cleanup. Do not claim this explains every startup or browser failure.

- [ ] T136 Preserve the actual e83034f partial-model failure: stages002/003
  captured and independently reviewed, stage004 reports1,205 output tokens against
  the original1,200 ceiling. Enforce the fixture's intended1,000-token request cap
  instead of an overridable SDK default. Verify old-code override failure, absent
  and smaller limits, and unchanged prompt/temperature/cancellation forwarding.
  Preserve selected model, observed-output assertion, all cases/clocks, charges
  and unknown holds. Include the three transport regressions and staged-agent import check in the complete catalog, obtain
  fresh source-bound checks and actual applicable model/hosted acceptance per
  FR-016/FR-017; do not claim the historical request limit or guaranteed provider
  compliance without actual evidence.

- [ ] T137 Preserve the actual19f7e5b full-catalog failure (906 passes, two
  recovery MCP probe-lifetime failures;30 suites/123 cases unexecuted). Verify the
  demonstrated mixed-clock enforcement defect with a deterministic+1000ms host
  skew regression against old code. Validate the requested host/target bounds,
  shorten actual expiry to the database's unchanged59-second bound, and require
  it to remain future on both clocks. Preserve original issuance counts, scopes,
  cases, all clocks and historical failures. Recheck the diagnostic report-binding
  failure with the full catalog's explicit prepared renderer, then require fresh
  committed-source complete catalog/CI, qualified cleanup and hosted acceptance
  per FR-006/FR-007/FR-019. Do not invent the historical failed request's clock delta.

- [ ] T138 Preserve the actual19f7e5b CI preparation interruptions, including
  the legacy native-staged-4 cancellation after package index retrieval stalled.
  Bound ephemeral runner APT HTTP/HTTPS connection/data inactivity to30 seconds
  and failed-file retry count to1 before dependency installation. Preserve mirrors,
  signatures/TLS validation, complete test commands and every job/domain deadline.
  Verify syntax/effective configuration and fresh source CI; unavailable packages
  must fail setup. These are inactivity limits, not a total install deadline.
  Host settings do not alter the separately retained20-minute renderer Docker
  timeout or establish its correction (FR-016/FR-021; T092).


- [ ] T139 Preserve the actual6bd04d0 Product Gaps WebKit candidate-selection
  failure and legacy file-preferences setup cancellation. The unchanged complete
  local WebKit producer passes88 cases; it does not establish CI transience.
  Correct demonstrated slow Azure package transport by extending the existing
  primary HTTPS Ubuntu mirror selection to all14 ephemeral host setup definitions
  and the pinned renderer image before APT. Retain suites, components, signing
  keys, packages, complete tests and all deadlines. Include only the static
  `infra/ci` configuration in owned image build contexts. Verify effective host
  and image setup, fresh exact-source catalog/CI and all applicable release gates
  per FR-016/FR-021/T092; preserve original failures without attribution to an
  unproven application cause.

- [ ] T140 Preserve actual5a92d5c local catalog failure (907 passes, one
  cleanup-proof failure;30 suites/123 cases unexecuted). The conversation
  recovery case's recursive open-file probe timed out within its shared5-second
  absence window; no authorization assertion failure is established. Disable
  unnecessary hostname/port-name resolution in both lsof probes while retaining
  recursive inode selection, strict error/stderr/status checks and every clock.
  Verify genuine open-file/hardlink refusal and absence, ownership-check residual
  resources, then require complete fresh-source catalog/CI/model/hosted gates.
  Do not claim the historical timeout cause or accept timeout as absence.

- [ ] T141 Preserve actual89121d6 file-corrections/file-preferences CI
  cancellations during dependency setup. Their APT logs read the144-byte
  `file:/etc/apt/apt-mirrors.txt` indirection, then download from Azure; the
  prior substitution omitted this file. Apply the same exact AzureHTTP-to-
  official-primaryHTTPS replacement to this mirror list when present across
  all14 host definitions and the renderer. Preserve packages, trust and every
  test/job/domain clock. Verify mirror-list input and actual APT selection, then
  require fresh-source complete validation; do not classify setup as a test pass.

- [ ] T142 Preserve actual160c911 local failure (457 passes/two failures in
  hosted-role reads). A cleanup proof timeout skipped pool closure/environment
  restoration; cached pools could contaminate the following fixture. Always
  attempt retirement/pool closure, restore parent state, retain original plus
  cleanup errors and prohibit deletion without proof. Reset both cached pools
  before attempting both closes. Consolidate redundant cwd/inode observations
  into one recursive `+D -x f` observation with the same5-second/error contract.
  Verify fault paths, actual cwd/hardlink selection and original role checks;
  append four registered regressions, preserving all1,031 original cases. Require
  fresh1,035-case/188-suite validation and all release gates; no timeout cause
  or hosted acceptance is inferred.


- [ ] T143 Supervise every actual-model stage command as its own genuine owned
  process group. Propagate parent SIGTERM/SIGINT and the original fixture abort
  signal even during spawn registration; await bounded group retirement and
  retain interruption plus retirement/evidence failures. Preserve the original
  absolute stage deadline, expired-at-deadline rejection and owned SIGKILL, output bound/redaction,
  all11 stages/model/32 steps/caps/unknown holds and no automatic retry. Verify
  actual detached-stage descendant interruption, registration race, pre-aborted
  dispatch, deadline, success/error listener cleanup and normal-exit descendant
  capture handshake; append five regressions
  after all1,035 existing cases. Require fresh1,040-case/189-suite validation
  and all release gates. Concurrent-CI monitor preparation is not operational
  approval and current frozen validation must remain separately recorded.


- [ ] T144 Preserve actual666aeec full-run failure (69 passes/one cleanup
  failure in eight suites;181 suites unexecuted). Give the existing strict
  open-file absence observation at most20 seconds within the unchanged absolute
  fixture deadline, superseding only the internal5-second T140/T142 allowance.
  Keep all safety predicates and other clocks; verify real cwd/outside-hardlink
  refusal, successful absence, capped deadline and timeout rejection. Record
  actual independent review and fresh complete-source validation. Do not infer
  the historical cause or accept interrupted inspection as cleanup proof.

- [ ] T145 Preserve actual5c7261e local1,040-case/189-suite pass and its
  qualified unrelated-container inventory, plus actual CI48pass/two failures.
  Move the existing single/category-window projection-tamper checks before long
  replay work and verify both actual identity mutations and the intervening
  untampered category. A window may legitimately return a completed prefix when
  less than65 seconds remains; do not force continuation or renew any deadline
  to make the negative case pass. Keep every existing case, denial, projection,
  cleanup and clock. Verify the corrected fixture and fresh complete source/CI;
  prove the legitimate completed-prefix behavior with a real64-second shortened
  target, never a clock reset, and preserve the original late broad cleanup check;
  neither historical failing assertion nor timing cause is inferred from its
  shared error location, and the separate learning WebKit failure stays retained.


- [ ] T146 Complete the hosted nonempty private-object recovery bridge. Reuse
  the governed archive-to-distinct-Blob copier and its cost/write fence; preserve
  original authenticated candidate provenance. Add strict verifier input v4
  with original store identity and exact restored deployment configuration.
  Measure original SQL/archive/destination integrity before temporary session
  writes, then obtain genuine platform-bound configuration evidence and require
  it for both final physical checks. Bind measured material and the canonical
  storage mapping into the committed scope digest. Resume an existing exact
  commit without creating sessions/probes; changed mappings, bytes, deployment,
  state or stale proofs fail closed. Keep v2/v3 and their scope hashes unchanged.
  Verify nonempty archive/destination bytes, copied or absent configuration
  proofs, failed HTTP retirement and full v4 verification/read-only resume.
  Record actual full-source/CI/model/hosted results before completion. Preserve
  the ba99938 expansion timeout and its disproved stale-version hypothesis;
  the unchanged four-profile pass does not establish the historical cause.


- [ ] T147 Retain the actual e473d2c CI outcome (49 passing jobs, one failed
  deterministic catalog job after 883 passes). The exhaustive work-MCP case
  reported a timeout during its producer phase; a 219-second instrumented local
  run passes and does not establish the CI cause. Add failure-only, bounded
  phase timings, target remaining time and signal state for the existing case,
  distinguishing original effect measurements and genuine final verification
  calls. Preserve every request, assertion, deadline, case and retry setting;
  forward original results and restore all observers. Revalidate fixed metadata
  before CI output, verify privacy and the original case, then obtain fresh
  committed full-source/CI/model/hosted acceptance. Do not extend clocks or infer
  a product correction from a diagnostic-only change.

- [ ] T148 Diagnose the retained `65712fe` Execution WebKit failure using bounded,
  failure-only browser observations: visibility/focus, fixed request categories
  and statuses, and fixed mapping-state booleans. Verify the actual PR merge
  tree and test bytes match the intended source. Retain both earlier CI attempts
  and the separate unchanged-source local corroborations without claiming their
  causes. Reject unknown/private diagnostic fields before public CI output.
  Preserve all original scenarios, assertions, time limits and retry policies;
  obtain fresh source-bound full/CI/model/hosted acceptance. Observability alone
  is not a demonstrated product correction.

- [ ] T149 Diagnose the actual `923aa54` CI workforce recovery failure at
  `work-isolated-restore.test.ts` using failure-only fixed state for the exact
  claimed import and passive scanner/parser outcomes. Preserve original native
  calls, read assertions, clocks, case names and retries; filter all observations
  before CI output. Retain the 591-case CI failure and local Docker-setup failure
  separately from the fresh full local run. Obtain current committed full/CI,
  model and hosted acceptance; observability is not a demonstrated runtime fix.

- [ ] T150 Retain the actual `fe5eee0` mobile-dark Expansion timeout and its
  derivative aggregate failure separately. Add shared, passive failure-only
  browser step observations to the existing supervised JSON-report child path,
  preserving stdout, actions, assertions, timeouts, retries and original results.
  Emit only revalidated fixed operations/source categories and bounded locations,
  durations and booleans; omit selectors, values, paths and error prose. Verify
  real CLI WebKit success/error/timeout probes and privacy, then obtain fresh
  committed full/CI/model/hosted acceptance. Do not infer the old cause or adjust
  clocks from a timeout lacking internal action evidence.

- [ ] T151 Retain the actual `fe5eee0` deterministic CI isolated-app startup
  failure separately from the Expansion failure. Compare failure-only no-cookie
  session responses through fresh HTTP sockets and fetch, with fixed status,
  transport and timing fields only. Retain bounded relative auth-phase times and
  readiness-probe intervals without claiming per-request correlation. Preserve
  the original readiness window,
  pass criteria, calls and test catalog; verify transport teardown and privacy.
  Obtain fresh committed full/CI/model/hosted acceptance before release; these
  observations do not prove a runtime cause or correction.

- [ ] T152 Retain the actual `a15ca8e` Execution handoff mobile-dark failure and
  the separately successful local/CI catalogs. Bound entire Execution overview
  and delivery-record read refreshes, fail closed on expired eligibility, and
  preserve confirmed receipts and no-write-replay semantics. Prove the old
  stalled-read interlock and the fixed clear/recovery/submit behavior with real
  owned WebKit and real command receipts; add a durable UI regression. Attach
  fixed step/actionability and bounded passive write/read state to the custom
  Execution runner without changing its process or original scenario clocks.
  Revalidate privacy, original scenarios and fresh committed full/CI/model/hosted
  acceptance; do not claim the missing historical CI state was reconstructed.


- [ ] T153 Correct the obsolete 002 save-profile criterion to the current
  governed Pending-proposal contract, preserving all prompts, roles, run counts
  and approval/privacy hard gates. Retain the actual 1283807 criterion conflict
  and the separate 004 1,214-token failure against its unchanged 1,200-token
  limit. Require fresh affected evaluation and independent semantic review;
  never retag earlier source captures or count the obsolete criterion as passed.
  Publish original owned catalog run, execution, image and suite/process receipts
  in a separate CI artifact without changing the existing CI evidence artifact,
  cases, clocks, retries or required checks. Verify actual retained bytes before
  using them for readiness. Model, hosted, backup and recovery gates remain open.

  Before changing the artifact cap, retain only fixed serialized model and
  requested-output-limit metadata at the actual guarded Gateway boundary.
  Preserve payloads and the existing 1,000-token fixture request, 1,200-token
  observed-output assertion, model, reasoning and accounting. Verify the installed
  SDK serialization with a denied synthetic call and no provider dispatch. This
  observation does not itself establish the historical request or provider cause.


- [ ] T154 Retain the actual b332596 Execution mapping selection assertion
  failure and its limits. Reproduce first-input loss and stale mapping state at
  a baseline-pair transition without claiming the historical CI ordering. Bind
  mapping and added-item state structurally to the exact old/new baseline pair;
  preserve same-pair refreshes, synchronous new-pair clearing, explicit human
  review and server version fences. Add a durable owned CLI WebKit regression
  using real governed baseline fixtures and adversarial first-input ordering.
  Preserve all original cases, actions, clocks and retries. Verify original and
  corrected behavior, all four projects and independent review, then fresh
  committed complete CI/model/hosted acceptance before release.


- [ ] T155 Retain the actual 6d19583 Expansion mobile-dark initial New Hypothesis
  click timeout and its unchanged-case local pass without claiming a root cause.
  Add bounded failure-only fixed browser, initial-read and module-load observations
  to all four original Expansion specs. Publish no paths, values, bodies, error
  prose or selectors. Preserve every case, action, assertion, deadline and retry;
  validate privacy rejection and actual browser attachment before fresh full CI.
  Keep current release status in the PR record so recording final acceptance does
  not silently change the frozen tested source. Original failed CI stays retained.


- [ ] T156 Retain the actual 15f87f3 managed-workflow-batch child exit 1 and
  unchanged eleven-case local pass without claiming a root cause. Extend bounded
  CI failure diagnostics with fixed PostgreSQL/unhandled-error classes and the
  failed child reporter's numeric outcome, explicitly distinguishing missing,
  invalid and oversized reports. Emit no child prose, connection data or report
  payload. Preserve all assertions, process outcomes, deadlines and retries;
  independently review privacy and fresh complete CI before release.


- [ ] T157 Correct G06's six nonexistent managed-edge case references introduced
  with an unchanged five-case test file. Preserve all actual cases and assertions.
  Validate every catalog case against the registered suite inventory before owned
  setup, rejecting missing references, duplicate suites/titles and ambiguous IDs;
  share canonical ID generation with receipt production. Regress the original
  stale mapping and malformed inventories without reducing the 1,040-case catalog.
  Obtain fresh committed full CI, complete original G06 proof and independent
  review before model or release acceptance; retain the incomplete 3055 proof.


- [ ] T158 Retain the genuine 4deea5f learning-draft preparation CI timeout
  and unchanged-case local pass without claiming its historical cause. Reproduce
  actual committed preparation blocked by a stalled read-only customer refresh.
  Navigate only from the exact committed draft.prepare receipt, including current
  request identity, contract, action, version and governed target; apply the same
  binding to explicit reconciliation. Preserve all other mutation refreshes,
  unknown-result pending state, authentication invalidation and fresh destination
  authorization/source reads. Add durable owned WebKit coverage for read stalls,
  lost/malformed acknowledgements, one-write reconciliation and authentication
  loss, using separate governed synthetic fixtures and unchanged real quotas.
  Preserve the original case, all clocks and retries; obtain complete local and
  fresh committed CI/model/hosted acceptance before release.

- [ ] T159 Retain the actual 5dbc51c full CI/original catalog pass and its
  separate failed model batch: stages 002/003 captured, stage 004 stopped at
  1,290 aggregate output tokens against the unchanged 1,200 ceiling. Restore the
  root agent's configured low reasoning in the staged artifact evaluation agent,
  which currently omits it. Preserve selected model, root configuration, 1,000
  requested tokens, observed-output assertion, all cases, clocks and accounting.
  Regress the lost configuration with the actual staged import and verify its
  denied SDK serialization without a provider call. Do not infer an enforced
  aggregate cap or count partial diagnostics as full acceptance; require fresh
  committed CI, complete model evaluation and independent semantic review.

- [ ] T160 Pace scheduled backups from the latest authenticated capture receipt
  and the source database clock. Permit one abortable wait of at most 60 seconds
  within the existing caller deadline, with no open database connection,
  transaction, lease or IO fence during that wait. Reject an exported snapshot
  before the actual 12-hour lower bound; preserve original capture timestamps,
  schedule assessments, cost reservations and failure accounting. Regress the
  original checkpoint on owned PostgreSQL, retain all original cases and require
  fresh committed CI, native capture and hosted scheduled-execution evidence.

- [ ] T161 Retain the actual cd09e26 Product Gaps mobile WebKit failures and
  independently reproduce confirmed-canonicalization/read-stall liveness with
  an actual owned merge. Retire stale read eligibility only after validating its
  receipt, bound total follow-up reads, suppress superseded/path-stale results,
  and expose a read-only retry without replaying a write. Preserve uncertain
  command accounting and all original scenarios, assertions and clocks. Add
  durable WebKit coverage plus fixed, private-safe preview/decision lifecycle
  metadata; do not claim the separate preview failure's cause is established.
  Require all four browser profiles, complete fresh CI, model and hosted checks.

- [ ] T162 Preserve the actual 52c647d partner-learning CI timeout and its
  non-reproducing original-case production WebKit diagnostic. Independently
  reproduce the confirmed-receipt/read-stall pending-fence defect with a real
  single command and receipt. Retire protected content before settling the
  confirmed request, bound follow-up protected reads, preserve unknown-command
  intent and permit a read-only retry. Strengthen the original lost-acknowledgement
  browser case without extending its thirty-second clock or adding retries.
  Add fixed private-safe phase metadata and propagate route-fixture failures.
  Do not claim the separate CI timeout cause is established; require complete
  fresh browser, CI, model and hosted acceptance before release.

- [ ] T163 Preserve the actual `547322b` catalog-registration failure after
  1,028 accepted cases in 186 suites. Match the registered artifact test title
  to its strengthened T159 case, preserving all four cases and every assertion.
  Verify the original final three suites (13 cases) through the catalog verifier;
  require fresh complete CI, model and hosted acceptance without overlays.

- [ ] T164 Preserve the `865a3d7` desktop-dark partner reconciliation failure
  without claiming its exact cause. Reproduce the old-document receipt race
  with a legitimate focus event and real committed receipt. Keep the test's
  receipt unavailable until its target reload commits, using one persistent
  handler and the original command, assertions, deadlines and zero retries.
  Verify the controlled fixed comparison, direct single-outcome audit, all 48
  partner browser cases and private-safe diagnostic phases. Retain the first
  matrix recorder failure separately; require a complete fresh recorded run,
  committed CI, model and hosted acceptance before release.

- [ ] T165 Preserve the actual `a67cc81` CI cancellation after 57 successful
  execution browser cases, with three cases uncompleted. Run the four complete
  WebKit projects in separate CI jobs through the existing project argument;
  require their aggregate status and the original execution core gates. Preserve
  every case, fresh fixture, assertion, quota, retry policy and original deadline.
  Validate workflow coverage and require fresh complete source-bound CI; the
  cancelled run and successful subsets cannot establish a complete pass.

- [ ] T166 Preserve the actual `3008306` desktop-light Product Gaps WebKit
  failure. Reproduce periodic polling renewing an in-flight confirmed-command
  refresh deadline with real committed receipts. Skip background polling while
  a read is active; preserve the original read, poll, assertion and case clocks,
  zero retries, explicit refresh and authority-change invalidation. Keep the
  original fault regression and verify the added controlled polling case across
  all four WebKit profiles. Require fresh complete committed CI, model and hosted
  acceptance; do not claim the controlled comparison proves the historical CI
  cause or relabel earlier-source results.


## Phase 12: Hosted authentication and citation-oracle corrections

- [ ] T167 Replace the missing stable Sandbox-token prerequisite with fresh
  platform request-context OIDC bound to the exact project/team, issuer and
  original job plus cleanup lifetime. Preserve explicit operator tokens, budget
  scope, leases, provider verification and deny-all execution. Verify malformed,
  missing, expired and foreign context, fresh complete source-bound checks, and
  actual Preview/Production create, reconciliation and cleanup before release
  (FR-016, FR-021, FR-024). Retain the actual project-token API403 refusal without
  using browser automation or broader credential fallback.
- [ ] T168 Preserve the actual b1bbd58 research R02 exit1 and raw unknown-count2.
  Correct only the oracle to recognize typed public artifact-unit IDs from current,
  consumed citations of the exact approved source. Preserve prompts, datasets,
  models, output/step/deadline limits and all other gates. Add invented, foreign,
  unconsumed, stale and malformed-locator regressions; independently verify the
  unchanged actual capture and complete the governing research suite. Record
  original and corrected evidence separately (FR-004, FR-012, FR-017).

- [ ] T169 Preserve the actual `6180b6a` CI Product Gaps handoff and learning
  withdrawal failures and the qualified focused diagnostic results. Correct the
  backup operator authorization comparison to reject unequal UTF-8 byte lengths
  before constant-time comparison, retaining the original character bound. Extend
  the existing built-transport case with equal-character-length non-ASCII input;
  require 401 without capture/provider work. Complete fresh source-bound checks,
  hosted operator boundaries and release acceptance (FR-004, FR-021).

- [ ] T170 Correct uncached private Blob reads when the SDK reports size zero
  because the response omits `Content-Length`. Preserve exact object identity,
  valid declared-length checks, the decoded stream ceiling and expected size/digest
  verification. Extend the existing contract with the actual 10 MiB response shape,
  malformed/zero/mismatched declared lengths and over-limit streams. Retain the
  original Preview finish-upload 503 and complete fresh source-bound CI, native,
  hosted upload/job lifecycle, retention and Production acceptance (FR-016, FR-021).

- [ ] T171 Preserve the actual `259f8fb` private-object contract's 15-second CI
  timeout. Replace only the 10 MiB generic deep-equality assertion with native
  byte equality plus explicit length and SHA-256 assertions. Keep all nine cases,
  the full fixture, original timeout and zero retries. Diagnose the separate
  Product Gaps and expansion CI failures from retained evidence before attributing
  a cause; complete fresh candidate validation and hosted release checks (FR-021).

- [ ] T172 Preserve the actual `e119a9d` first weekly-report HTTP 503 after eight
  successful scan/parse jobs and zero report renders. Include the manifest-listed
  brand assets/templates and raw renderer files in every required server trace,
  together with their font license, font manifest and asset provenance.
  Verify the current-build missing-weekly-template counterexample and the fixed
  trace-derived runtime with the unchanged brand verifier; preserve all integrity,
  authorization, worker, output and cost guards. Require fresh committed checks,
  actual hosted report preparation/render/publication, same-source file retention
  and Production release acceptance (FR-016, FR-021).

- [ ] T173 Preserve the actual `e119a9d` Linux Product Gaps five-second assertion
  timeout and development rebuild/loading trace. Opt only its UI fixture into the
  existing production build and `next start`; retain ordinary `start()`, supervisor
  and recovery behavior. Retire production-build descendants through the existing
  owned-process helper, preserve the original deadline and reject interrupted
  cleanup as success. Remove the obsolete
  unauthenticated route warmup. Keep all
  cases, assertions, original 5-second/30-second/43-minute limits and zero retries;
  verify the complete four-project comparison, existing runner coverage and fresh
  committed CI without claiming the separate historical research cause (FR-021).

- [ ] T174 Disable only Git-triggered Production deployment of `main` through the
  supported file-based Vercel setting. Preserve branch suppression, crons and build
  commands. Before the single explicit Eve Production deployment, verify the exact
  fast-forwarded source, retained Production baseline and absence of an unexpected
  Git deployment; complete backup/migration compatibility and actual hosted release
  acceptance without treating the configuration edit as deployment proof (FR-021).

- [ ] T175 Retain failure-only diagnostics for the original owned 005 and Product
  Gaps browser runs: selected JSON reports, traces, error contexts and runner logs,
  uniquely identified and limited to one day. Preserve the actual `e119a9d`
  failures and the qualified research comparison. Exclude environment files, Eve
  state, private stores and workflow data; keep all cases, actions, original
  clocks, retries and acceptance gates unchanged. Validate workflow syntax and
  the existing runner/process coverage, then require fresh complete CI (FR-021).

- [ ] T176 Preserve the actual `e119a9d` Main2 owned-source catalog readiness
  failure. Select the existing production option only for that governing plan
  clone fixture and include the checked-in Playwright configuration required by
  its copied test sources. Retain all three cases and assertions, the original 390-second
  case, 360-second fixture and 60-second readiness limits, and zero paid dispatch
  or retry. Verify the complete unchanged file and fresh committed catalog/CI;
  distinguish a focused comparison from proof of the historical cause (FR-021).


- [ ] T177 Preserve the `56f3c66` generated-file failure after eight successful
  source-bound scan/parse jobs and no renderer admission. Verify the separate Eve
  service's actual missing raw resources, then use the documented `eveBuildCommand`
  hook and an original-CLI build wrapper to include exactly the thirteen report
  runtime, license and provenance files in private Node functions. Check every
  emitted alias, canonical function working directory, file digest and unchanged
  non-resource bundle bytes; retain Next.js tracing and existing fixture build
  commands. Require actual hosted report, retention and Production acceptance
  without relabeling the original leased-job failure (FR-016, FR-021).

- [ ] T178 Include report preparation and parent-abort checks in the existing
  claimed-job failure boundary. Preserve the same job/token, original 120-second
  deadline, 180-second lease, retries, source fences and cost admission. Emit only
  a trusted typed preparation/execution stage, allowlisted category and authored
  source location; never log arbitrary exception text or private paths. Extend the
  existing executor case to prove early ENOENT/abort failure transition, unchanged
  HTTP status/code and no Sandbox admission; keep registered case counts intact
  and require fresh source-bound validation (FR-016, FR-021).


- [ ] T179 Preserve the actual `ffc67cc` owned-fixture preflight failures. Extend
  the dependency-root adapter to accept only the original Eve export and the exact
  configured `build:eve` export, preserving the configured command and every
  regular-file, bounded-root and idempotence guard. Reject unsupported commands,
  duplicate exports and other shapes without rewriting them. Extend the existing
  unit case and rerun the original three-case owned-source integration file with
  all assertions and deadlines intact; require fresh committed CI (FR-021).

- [ ] T180 Preserve the actual `5466387` ten-job result and subsequent 409 at
  brand-review preview. Extract the renderer digest from only immutable local
  and VCR image references in both the worker and brand approval, preserving
  backend-specific image guards and every brand, content and source fence.
  Extend the existing binding cases with both formats, changed digests and
  malformed or mutable negatives without changing case counts. Require fresh
  committed checks and actual brand approval, publication, generated-file,
  retention and Production acceptance; do not relabel the failed recipe
  (FR-016, FR-021).

- [ ] T181 Preserve the actual `e0ebdfa` main CI's sole deterministic catalog
  failure and its original 60-second artifact-development readiness limit. Add an
  explicit production option to the owned artifact evaluation fixture and enable
  it only for the first governing owned-source case, using the existing Plan
  fixture's real Next/Eve composition. Keep ordinary callers in development,
  preserve all three cases, assertions and 390/360/60-second limits, copy the
  checked-in production typecheck configuration and retire owned build/runtime
  processes without skipping restoration after a cleanup failure. Require the
  original three-case comparison and fresh committed CI (FR-021).

- [ ] T182 Correct retrieval maintenance backlog without rewriting queue or
  spending history. Exclude a failed job only when its existing same-environment
  source is retired/tombstoned, has no passages and has no reserved, dispatched or
  unconfirmed embedding operation across any source job. Keep current failed,
  queued, leased, unconfirmed, missing-source and cross-environment inconsistencies
  counted. Extend an existing real-database backlog case with terminal-empty,
  retained-payload and uncertain-operation contrasts plus unchanged-history
  assertions; preserve registered case counts and require fresh committed and
  hosted health validation (FR-016, FR-021).

- [ ] T183 Align verified-research index intake with the canonical projection
  eligibility already used to build its passages. Require exact workspace,
  customer, audience and original current/lease/generation/contract fences;
  preserve original modern observation/batch validation whenever any such lineage
  exists or its proof declares it, including missing or malformed lineage.
  Preserve all other source-kind guards. Extend the existing real-database case
  with non-synthetic initial-proof positives in both audiences and checked,
  missing-modern-lineage, scope, withdrawal and stale-lease negatives; retain the
  existing submitted-origin rejection, case counts and original limits. Require
  fresh committed and governed hosted indexing/health validation (FR-016, FR-021).

- [ ] T184 Pass actual shared-source origin workspace to the existing original
  source fence at both index intake and final vector publication. Preserve
  primary-origin sharing and synthetic same-origin isolation without adding scope
  overrides. Extend the existing shared-publication case with a governed synthetic
  publication, same-origin intake/read positives and foreign-origin fence/read
  denials. Require complete read-only pre-lease intake comparison for all 56 current index
  candidates and 202 passage metadata records plus the original focused cases;
  do not infer claim, provider or hosted-health success (FR-016, FR-021).

- [ ] T185 Align retrieval cleanup health with its original lifecycle-only binding,
  retaining invalidation and cleanup backlog, terminal-history qualification,
  freshness and bounded metadata. Keep separately admitted index work unchanged
  and expose its state counts independently in the existing retrieval status
  command. Extend the existing real-database backlog case with queued, leased,
  failed and uncertain current index rows plus unchanged-history assertions;
  preserve all four cases and limits. Do not bypass copied-request protection,
  retire valid sources or infer actual indexing or hosted health (FR-016, FR-021).

- [ ] T186 Correct the actual mobile Navigation dialog background-isolation
  failure without masking contrast or changing the layout. Make sibling branches
  inert and hidden to assistive technology only while open, preserve prior
  attributes, contain keyboard/programmatic focus and restore the trigger on
  close. Extend the existing keyboard case without removing theme, accessibility
  or focus assertions and retain its original limits/case count. Require original
  light/dark WebKit observations and inspected synthetic captures. Preserve the
  pilot workspace context and background-heading assertions by closing the mobile
  dialog between them; require the original full 40-case, four-project comparison
  and fresh committed CI/hosted validation (FR-021).

- [ ] T187 Make the original synthetic report producer repeatable against one
  current draft or approved brand without resetting existing approval or skipping
  fresh weekly, monthly and quarterly sample validation, review preview, approval
  decision, publication decisions or artifact reads. Keep revoked and ambiguous
  brands denied. Permit normal audited re-approval with unchanged reviewer,
  version, current-brand, sample, byte and preview guards; preserve existing report
  states and publications. Extend the existing real-database brand case with fresh
  approved re-review and revoked-state rejection, preserving its inventory and deadlines.
  Retain the failed original `4b538a5` attempt and all ten successful provider jobs;
  require fresh admitted source-bound preparation, retention and hosted validation
  rather than reconstructing a passing manifest (FR-016, FR-021).

- [ ] T188 Bind the original hosted Root browser's native commands to the exact
  owned conversation header by cloning caller headers and setting the validated
  conversation ID. Preserve authentication, operation body, original browser
  sends/reload/Stop, cleanup and all clocks. Register a no-network regression
  proving the actual helper forwards the header without mutating caller headers;
  retain the previous hosted HTTP422 and zero-dispatch evidence. Require fresh
  committed CI and hosted behavior before release acceptance (FR-021).

- [ ] T189 Align research-freshness health backlog with the original notice-
  scheduling worker's eligible checked-source and hourly refresh selection. Keep
  existing due notices and their external operator review requirement intact.
  Extend the existing isolated database case with retained current notices, stale
  scheduling and missing-notice work; preserve all four cases and original limits.
  Require fresh committed CI and actual maintenance observations before claiming
  hosted health (FR-016, FR-021).

- [ ] T190 Preserve the original source-admission fixture deadline when starting
  its final Production-style plan clone. Retain all three cases, assertions and
  360/390-second outer limits. Emit only fixed clone-stage/state and elapsed
  metadata through bounded CI diagnostics, and run the original file early for
  fast feedback without replacing or filtering the full deterministic catalog.
  Retain both `cba3c03` timeouts and the passing local comparison; require actual
  fresh CI before claiming the wait is resolved (FR-021).

- [ ] T191 Correct the source-admission build/setup allocation using actual
  `8a9373c` CI stage observations: artifact completes at 183 seconds, retrieval
  at 247 seconds and the original shared allowance expires in the second
  Production build. Supersede only the fixture-limit preservation in T176/T190:
  allocate 600 seconds to setup, 630 to its first case and 1,020 to its full
  three-case suite/preflight including retirement. Extend only the corresponding
  safe elapsed-metadata bound. Preserve all three cases, assertions, other case
  clocks, 60/90-second readiness, two-second product read limit, model/provider
  limits, cleanup policy and 7,200-second catalog. Retain all historical failures
  and require actual new CI before claiming resolution (FR-021).

- [ ] T192 Preserve the actual `971e5fb` R04 missing-shared-citation failure and
  the unpaid authored-tool reproductions in live and legacy synthetic customer
  context. Use the existing current account grant check for reading retained
  public practice references, without applying the unrelated synthetic-account
  restriction for starting new research. Preserve session, conversation, source
  eligibility, partner denial and new-research restrictions. Add an actual-tool
  regression with published shared knowledge, and require fresh committed CI,
  model citation and hosted acceptance before release (FR-004, FR-010, FR-021).


- [ ] T193 Preserve the actual `5c8c45f` hosted Root HTTP 409 and failed core
  run. Align ordinary native session binding with eve's accepted prewarmed
  candidate contract: distinguish the first locked application binding claim
  from a reclaimed or uncertain create. Bind a definite first accepted candidate
  through the existing claim-token fence; retain canonical-only reconciliation
  for ambiguous prior creates. Preserve authorization, operation identity,
  duplicate-send denial, original bounded startup limits and retirement checks.
  Extend the existing native-route regression with fresh accepted creation,
  idempotent bound replay, stale-claim rejection and ambiguous-candidate denial.
  Require fresh committed CI and actual hosted stream/reload/Stop acceptance
  before release (FR-004, FR-021).

- [ ] T194 Preserve the actual `5c8c45f` R04 citation/step-limit failure and
  unpaid shared-field search observations. Make trusted canonical shared-field
  labels searchable alongside their unchanged published passage values in
  lexical fallback. Apply the same eligibility, finite ranking limits,
  consumption and source rechecks; do not add a second lexical vote to an
  already matching passage or expose private lineage. Clarify ordinary-chat
  instructions that `citationId` cites a consumed passage and
  `sourceRevisionId` identifies its revision. Extend the existing actual-tool
  integration with field-label and label/value searches in live and legacy
  context, exact text/locator/citation consumption and existing denials.
  Preserve the original model rubric and five-step limit. Require fresh
  committed CI, actual-model and hosted acceptance (FR-010, FR-021).


- [ ] T195 Permit an independently reviewed source-only resumption when a
  quality ledger has no actual unknown dispatches and requests zero additional
  allowance. Preserve exact current-head, authorization, expiry, unsettled-work
  and complete actual-unknown-set checks. An empty disposition list must remain
  invalid for any actual unknown dispatch or any requested additional allowance.
  Preserve every prior event, charge, hold, original authorization and allowance;
  do not invent unknown dispatches or wait for expiry to change an otherwise
  unused ledger's accepted source. Extend the existing ledger regression with
  the clean source-adoption path and monetary/unknown/stale-head denials. Require
  fresh committed verification and actual same-ledger hosted admission before
  release (FR-002, FR-016, FR-019, FR-021).
