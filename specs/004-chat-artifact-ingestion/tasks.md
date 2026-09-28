# Tasks: Chat attachments and artifact ingestion

**Input:** [spec](spec.md), [plan](plan.md), [research](research.md),
[data model](data-model.md), [contracts](contracts/artifacts-api.md), [quickstart](quickstart.md).
**Status:** Local implementation and verification passed. PR review and CI remain; hosted release is deferred.
**Tests:** Required by FR-020 and the constitution. Write significant behavior tests
first and observe their failure before implementing the corresponding behavior.
**Format:** Sequential T IDs, [P] only for independent files after named prerequisites,
[US#] in story phases. Paths below are repository-relative; new paths are planned.

## Phase 1: Setup

Purpose: establish real isolated processing and safe synthetic validation inputs.

- [X] T001 Read routed installed eve/Next docs and audit/pin parser dependencies in packages/artifact-extractor/package.json and packages/artifact-extractor/package-lock.json; add its private Node24 build/test entry, choose the PDF native canvas adapter, and record actual dependency/license/image decisions in specs/004-chat-artifact-ingestion/validation.md. Preserve agent/agent.ts; install no eve integration. (FR-003, FR-006)
- [X] T002 Add pinned parser/scanner images and offline English OCR assets in infra/artifacts/parser.Dockerfile, infra/artifacts/scanner.Dockerfile, infra/artifacts/clamd.conf and infra/artifacts/images.json; add explicit signature/image preparation in scripts/prepare-artifacts.ts and package.json. Enforce network-free document processing, fresh signatures, non-root/read-only runtime and contract resource limits; preparation never links/deploys Vercel. (FR-006)
- [X] T003 [P] Add artifact config/ignored-store validation in lib/server/config.ts, .env.example and .gitignore; reject public/shared/unmarked roots, document separate synthetic test roots and preserve existing secret handling. (FR-005, FR-020)
- [X] T004 [P] Create valid synthetic corpus generators and expected-source manifest in tests/fixtures/artifacts/generate.ts and tests/fixtures/artifacts/manifest.json; cover every format, OCR/rotation, formulas/cache/merges/hidden cells, multiline CSV, corrupt/encrypted/spoofed/active files, expansion/path/XXE/network canaries and safely generated EICAR. No customer files or uncontrolled malware. (FR-003, FR-007, FR-020)

## Phase 2: Foundation

Purpose: shared scope, persistence, immutable references, bounded work and tombstones.
All stories depend on this phase. Schema changes remain explicit, not request-time.

- [X] T005 Add intake identity/version tables in migrations/014-artifact-ingestion.cjs with C01: “IDs are server-generated UUIDs; workspace, environment, customer, owner and origin conversation are required and immutable; workload is nullable and must belong to that customer.” C02: “Original version numbers and lifecycle generations are positive integers; verified SHA-256 digest, actual size and immutable object key are required when a version is created; digests are 64 lowercase hex characters; size is 1–10,485,760 bytes; filename is 1–255 characters, stripped of path/control characters and never a storage key.” C03: “Source publication/observation dates are nullable, never future dates; unknown stays null; rights note is required, 1–500 characters; classification reuses audience internal|delivery and dataCategory delivery_context|internal_operations|commercial|personnel|other_internal; upload origin is manual.” C05: “Version state is quarantined, processing, ready, partial, failed, cancelled, withdrawn, deleting or deleted; versions are created quarantined only at atomic intent completion; one published extraction per version; published content is immutable.” (FR-002, FR-005, FR-008, FR-013)
- [X] T006 Define versioned public/request/parser DTOs and safe error codes in lib/contracts/artifacts.ts; add failing boundary/unknown-field/Unicode-offset/locator tests in tests/unit/artifact-schemas.test.ts. Mirror C01–C12 and all three contracts, including strict projections, source metadata, intent receipts and published-manifest coverage. (FR-004, FR-007, FR-009, FR-011)
- [X] T007 Add batch/intent schema to migrations/014-artifact-ingestion.cjs and quota reservation service in lib/server/artifacts/intake.ts with C04: “Intent expires after 30 minutes; intent state is uploading, staged, completed, cancelled, expired or failed; version_id is null before completion and a required unique scoped reference once completed; expected file metadata remains on the intent until completion; batch has 1–5 files totaling at most 26,214,400 reserved bytes; idempotency key is 1–128 characters; same scoped key with a different canonical digest conflicts.” Enforce the completed-state/version-link equivalence and scoped unique FK; keep staged actual size/digest separate from expected metadata, and enforce per-principal/customer/workspace limits with one-time reservation release on intent expiry/cancellation. (FR-004, FR-009)
- [X] T008 Add extraction tables to migrations/014-artifact-ingestion.cjs and validation in lib/server/artifacts/extraction.ts with C07: “Units have a positive ordinal unique within an extraction; locator is a tagged format-specific object; text is at most 32,000 characters per unit; total extracted text is at most 500,000 characters per version.” C12: “Extraction coverage and scan receipts are required before ready/partial; OCR confidence is nullable 0–100 and never an evidence-quality score; public evidence projections omit original filename, storage key, owner and conversation IDs.” (FR-007, FR-013)
- [X] T009 Add selection/purgeable-payload/profile-support tables and constraints in migrations/015-artifact-evidence-context.cjs with C08: “Evidence selections contain 1–20 ordered unit ranges and at most 8,000 excerpt characters; offsets are Unicode code-point offsets with 0 ≤ start < end ≤ unit length; identity, range and digest are immutable.” C09: “Evidence links have exactly one non-null support target: profile revision, research source revision or artifact selection; all targets share workspace, environment and customer; partner proposals have delivery classification only.” Preserve old two-target records and immutable profile triggers. (FR-011, FR-012)
- [X] T010 Add durable run/lease schema in migrations/014-artifact-ingestion.cjs and claim/publication foundation in lib/server/artifacts/jobs.ts with C06: “Runs have a unique attempt token, 30-second renewable lease, heartbeat at most every 10 seconds and 120-second deadline; output publication requires the exact current token, policy, generation and digest.” Use short transactions, one published run/version and current-principal authority independent of login expiry. (FR-008, FR-009)
- [X] T011 Add references, draft receipts and monotonic conversation dependency tables to migrations/015-artifact-evidence-context.cjs with C10: “Conversation attachment references require the same owner, workspace, environment and customer; at most 5 selected versions per send; draft context is at most 20 units and 12,000 characters per send.” Keep native text digest separate from canonical attachment request digest. (FR-002, FR-014, FR-015)
- [X] T012 Add lifecycle/tombstone/cleanup schema and generation helpers in migrations/015-artifact-evidence-context.cjs and lib/server/artifacts/lifecycle.ts with C11: “Destructive version commands require an exact lifecycle generation and a 1–2,000 character reason; cleanup payloads contain only opaque object/session IDs and generations; lifecycle audit contains no source text or filename.” Establish late-publication denial before any story publishes data. (FR-009, FR-017)
- [X] T013 Implement shared scope/owner/submitted-source-reviewer policy and lock ordering in lib/server/artifacts/policy.ts, with failing authorization cases in tests/integration/artifact-policy.test.ts; reuse profiles/policy.ts and conversations/binding.ts, distinguish session-bound human commands from persisted ingestion consent, and support submitted-source steward replacement without private-chat access. (FR-001, FR-010, FR-011)
- [X] T014 Register migrations in migrations/manifest.json, update explicit role grants in scripts/db-role-setup.sql and add tests/integration/artifact-migrations.test.ts for fresh/013 upgrade, immutable scope, exclusive evidence target, app-role permissions, null version links before completion, completed-state/FK equivalence, required original byte metadata and duplicate publication prevention. Run foundation/schema tests before story work. (FR-005, FR-009, FR-020)

## Phase 3: US1 — Attach and inspect customer documents (P1, MVP)

Goal: upload, scan/extract, inspect exact source units and recover without duplication.
Independent check: each supported format works for its owner; wrong owner/customer
gets non-identifying denial; response loss/restart yields one durable publication.

### Tests first

- [X] T015 [P] [US1] Add HTTP contract/access/quota/idempotency tests in tests/contracts/artifact-upload.test.ts for intent/bytes/complete/status/units/download/reattach, including pre-completion intent status without a version, concurrent completion creating one version/run, cancellation/expiry winning against late completion, no queued run after failed completion commit, one-time quota conversion/release, same-origin enforcement, mismatched bytes/type, expired login/grant, generic denial, no-store headers, streamed-read revocation and multiple-batch send limits. (FR-001, FR-002, FR-004, FR-009, SC-001, SC-002)
- [X] T016 [P] [US1] Add real fixture integration expectations in tests/integration/artifact-extraction.test.ts for every format/locator, scan quarantine, missing/stale signatures, malicious/oversized/archive/remote relationship input, worker crash, invalid manifest and bounded partial output. (FR-003, FR-006, FR-007, SC-001, SC-003)

### Implementation

- [X] T017 [US1] Implement private ArtifactStore/local adapter in lib/server/artifacts/store.ts and lib/server/artifacts/local-store.ts with bounded streaming SHA-256, conditional finalize, permissions, traversal/symlink checks, opaque keys, digest reconciliation and orphan-safe deletion; complete intake service using staged IO plus one authority-checked transaction creating the quarantined version and first run, converting quota, linking the completed intent and recording its receipt; reconcile finalized objects after failed commits without duplicate versions. (FR-005, FR-009)
- [X] T018 [US1] Add intent creation in app/api/artifacts/intents/route.ts, GET status in app/api/artifacts/intents/[intentId]/route.ts, bytes upload in app/api/artifacts/intents/[intentId]/bytes/route.ts, completion in app/api/artifacts/intents/[intentId]/complete/route.ts and cancellation in app/api/artifacts/intents/[intentId]/cancel/route.ts; wire current creation authority, customer binding, batch reservations, expiry and safe protocol receipts; after completion return the stable version link and use version lifecycle commands. (FR-001, FR-002, FR-004, FR-008)
- [X] T019 [US1] Implement runner and digest-bound fail-closed scanning in lib/server/artifacts/runner.ts and lib/server/artifacts/scan.ts; enforce every container/resource/deadline/mount constraint in contracts/worker.md and validate host output before publication. Never expose Docker control to parser/model. (FR-006, FR-009)
- [X] T020 [US1] Implement strict type/OOXML/UTF-8 preflight and versioned manifest emission in packages/artifact-extractor/src/main.ts and packages/artifact-extractor/src/preflight.ts; bound actual decompression/output, reject active/external content and preserve explicit coverage failures. (FR-003, FR-004, FR-006)
- [X] T021 [P] [US1] Implement structured DOCX/PPTX adapters in packages/artifact-extractor/src/office.ts with part/paragraph/table and slide/shape/note locators and bounded omissions; use the shared manifest contract after T020. (FR-003, FR-007)
- [X] T022 [P] [US1] Implement PDF/native text/raster and imageOCR adapters in packages/artifact-extractor/src/pdf.ts and packages/artifact-extractor/src/ocr.ts after T020; package offline assets, retain bounds/orientation/confidence and enforce page/pixel/time limits without fabricated text. (FR-003, FR-004, FR-007)
- [X] T023 [P] [US1] Implement XLSX/CSV/TXT/MD adapters in packages/artifact-extractor/src/spreadsheet.ts and packages/artifact-extractor/src/text.ts after T020; retain hidden/merge metadata, raw formula/cache, multiline records and line/cell locators without computation or competency import. (FR-003, FR-007, FR-019)
- [X] T024 [US1] Integrate scan/parser publication and retry leases in scripts/artifact-worker.ts and lib/server/artifacts/jobs.ts; supervise it independently in scripts/dev.mjs, implement worker readiness in app/api/health/ready/route.ts and verify watchdog remains responsive during parsing. (FR-008, FR-009, SC-005, SC-006)
- [X] T025 [US1] Add authorized status/units/original routes in app/api/artifacts/[versionId]/route.ts, app/api/artifacts/[versionId]/units/route.ts and app/api/artifacts/[versionId]/original/route.ts; enforce scan/eligibility, pagination, generic denial, attachment-only response and pre-read/per-chunk revocation. (FR-001, FR-007, FR-010)
- [X] T026 [US1] Add same-owner/customer reference service in lib/server/artifacts/references.ts and GET/POST/DELETE routes under app/api/conversations/[conversationId]/attachments/; preserve origin and consumed dependencies, deny cross-owner reuse and never copy native history. (FR-002, FR-015)
- [X] T027 [US1] Build app/_components/attachments/composer-attachments.tsx and app/_components/attachments/source-viewer.tsx; integrate app/_components/agent-chat.tsx with explicit binding, accessible chips, escaped source tables, partial warnings, bounded selection, file-only draft prompt, two-second intent status polling before completion and version polling afterward, cancellation through the intent endpoint while no version exists, and independent next-draft preservation. (FR-007, FR-008, FR-016)
- [X] T028 [US1] Add and pass tests/ui/artifact-upload.spec.ts across four WebKit projects, then run T015/T016 tests with real local scan/parser fixtures; verify keyboard/mobile/theme/progress/error/reattach behavior and record exact-format evidence in specs/004-chat-artifact-ingestion/validation.md. (FR-020, SC-001, SC-002, SC-003, SC-006)

Checkpoint: US1 locally demonstrable; continue through all remaining authorized tasks.

## Phase 4: US2 — Review selected source evidence (P1)

Goal: exact Pending proposals and approved excerpts without whole-file exposure.
Independent check: accept internal uploader's delivery excerpt and view as assigned
partner; private original/hidden ranges and others' Pending/rejected remain denied.

### Tests first

- [X] T029 [P] [US2] Add exact-range/digest/manual-origin proposal/review contract tests in tests/contracts/artifact-evidence.test.ts, including selection correction, restricted citation projection and original access only after explicit submission. (FR-010, FR-011, FR-012, FR-013, SC-004)
- [X] T030 [P] [US2] Add concurrent proposal/approval/source-withdrawal and partner visibility cases in tests/integration/artifact-review.test.ts; include current steward/grant changes, own-only Pending/rejected and direct/transitive unsupported context. (FR-001, FR-011, FR-012, SC-002, SC-004)

### Implementation

- [X] T031 [US2] Implement immutable selection/range/digest/purgeable payload service in lib/server/artifacts/selections.ts and add artifact support DTOs in lib/contracts/profiles.ts; validate exact source generation/run, excerpt budget and claim metadata without copying private payloads into profile revisions. (FR-007, FR-012, FR-013)
- [X] T032 [US2] Extend lib/server/profiles/repository.ts, lib/server/profiles/evidence.ts and lib/server/profiles/eligibility.ts for the distinct artifact support target and artifact_share channel, preserving manual origin and existing independent research checks/quality dates. (FR-012, FR-013)
- [X] T033 [US2] Add atomic selection+Pending submission in lib/server/profiles/service.ts and app/api/artifacts/[versionId]/proposals/route.ts using existingClient; mark source submitted in the same transaction and replay exact idempotency receipts. (FR-009, FR-010, FR-012)
- [X] T034 [US2] Extend lib/server/profiles/review.ts and lib/server/profiles/retractions.ts to lock/check exact selection digest/generation and current reviewer authority; source withdrawal invalidates direct/transitive support, accepted history stays visibly unsupported and replacement support requires a reviewed revision. (FR-012, FR-015, FR-017, SC-004)
- [X] T035 [US2] Add approved-excerpt/attestation projections in lib/server/profiles/read.ts, lib/server/profiles/projection.ts and lib/server/profiles/context.ts; preserve partner accepted delivery visibility regardless of contributor and suppress original/private metadata and invalid support; keep raw artifact excerpts out of immutable customer-context-v1 snapshots, using source IDs/attestations while authorized UI projections read purgeable excerpts. (FR-010, FR-011, FR-013)
- [X] T036 [US2] Build exact proposal preview in app/_components/attachments/evidence-selection.tsx with classification, numeric citation, quality/date inputs and explicit original-sharing notice; wire source-viewer.tsx to existing profile review flows. (FR-012, FR-013, FR-016)
- [X] T037 [US2] Extend app/_components/profiles/review-queue.tsx, evidence-detail.tsx and own-submissions.tsx to show exact approved/pending source projections and current reviewer original inspection without opening chats or exposing hidden ranges. (FR-010, FR-011, FR-012)
- [X] T038 [US2] Add tests/ui/artifact-review.spec.ts and pass T029/T030 plus profile regressions; verify internal-origin delivery evidence as partner and stale exact-review races, recording results in specs/004-chat-artifact-ingestion/validation.md. (FR-020, SC-002, SC-004, SC-006)

## Phase 5: US3 — Discuss uploads truthfully in chat (P2)

Goal: bounded unverified discussion with citations and no approval bypass.
Independent check: summarize selected units, explicitly propose Pending, then revoke
a prior-turn dependency and block model/tool/stream/replay/history release.

### Tests first

- [X] T039 [P] [US3] Add send/context/tool contract tests in tests/contracts/artifact-context.test.ts for canonical send digest, exact native text, selection budget, injection receipt, repeated-read budget and Pending-only retain-context; native raw file/upload bypass remains denied. (FR-014, FR-015, SC-007)
- [X] T040 [P] [US3] Add tests/integration/artifact-context-fences.test.ts for turn-one invalidation during turn-two, compaction-like state, model-step/tool/chunk/reconnect/rewind/history/title denial, changed-selection retry conflicts and fresh-session same-customer reattachment. (FR-001, FR-009, FR-015, SC-005)

### Implementation

- [X] T041 [US3] Implement artifact-context-v1 envelope, bounded receipts and monotonic consumed dependency union in lib/server/artifacts/context.ts and lib/server/profiles/attempt-context.ts; store purgeable payloads outside submitted_messages.text and keep customer-context-v1 factual context separate. (FR-013, FR-014, FR-015)
- [X] T042 [US3] Extend lib/contracts/conversations.ts and lib/server/conversations/dispatch.ts for explicit attachment selections/canonical request digest and file-only visible prompt; retain exact native text digest and reconcile uncertain dispatch without duplicate turns. (FR-009, FR-014, FR-016)
- [X] T043 [US3] Extend lib/server/conversations/context-fence.ts, eve-routes.ts, repository.ts and projection.ts with artifact dependency validation at every read/output/replay/history/title boundary, including late native projections and immutable stale-session handling. (FR-001, FR-015)
- [X] T044 [US3] Add agent/instructions/artifact-context.ts and extend agent/hooks/guard-customer-context.ts plus lib/server/profiles/tool-actor.ts to verify both injection receipts before steps/tools; mark extracted instructions inert, require unverified labels/coverage and exact citations, preserve selected model. (FR-006, FR-014, FR-015)
- [X] T045 [US3] Add bounded agent/tools/artifact_context.ts and extend agent/tools/propose_customer_context.ts to call governed selected-unit/proposal services only; no approve action, arbitrary file path or research relabeling. (FR-012, FR-013, FR-014)
- [X] T046 [US3] Wire selection-aware sends/citations/stale-context recovery in app/_components/agent-chat.tsx and app/_components/attachments/context-citations.tsx; preserve owner text, prevent silent truncation and offer fresh-session explicit reattachment. (FR-014, FR-015, FR-016)
- [X] T047 [US3] Add evals/fixtures/004-artifact-governance.json and extend evals/driver.ts, scripts/eval-behavior-local.ts and scripts/verify-behavior-review.ts and tests/unit/behavior-dataset.test.ts for the eight quickstart cases, actual-response scoring≥7/8 each, bounded to 16 model steps/1,200 output tokens per step/120 seconds per case/20 minutes total and mandatory access/approval/source/action hard gates. (FR-020, SC-007)
- [X] T048 [US3] Add tests/ui/artifact-context.spec.ts; pass T039/T040, instruction/tool schema checks and bounded live 004 evaluation, then record actual outputs/review limitations in specs/004-chat-artifact-ingestion/validation.md. (FR-020, SC-005, SC-006, SC-007)

## Phase 6: US4 — Manage source revisions and deletion (P2)

Goal: retry/cancel/replace/withdraw/delete with immediate invalidation and durable cleanup.
Independent check: race each action with worker/model publication, restart and repeat
cleanup; no source resurrection or migrated approval, retained history is truthful.

### Tests first

- [X] T049 [P] [US4] Add lifecycle authority/version/idempotency tests in tests/contracts/artifact-lifecycle.test.ts for owner drafts versus submitted-source stewards, reasons, retry after failure, replacement scope and original approval preservation. (FR-001, FR-009, FR-017, FR-018)
- [X] T050 [P] [US4] Add tests/integration/artifact-cleanup.test.ts for late upload/scan/parser/projection races, failed physical purge/native retirement, revoked uploader, reentrant cleanup and app-owned payload redaction with separately submitted claim history retained. (FR-015, FR-017, SC-005)

### Implementation

- [X] T051 [US4] Complete lifecycle commands in lib/server/artifacts/lifecycle.ts and routes app/api/artifacts/[versionId]/actions/route.ts and app/api/artifacts/[versionId]/replacements/route.ts; retry only unpublished runs, enforce current steward after any submission, never overwrite bytes or transfer approvals, and make repeat receipts stable. (FR-009, FR-017, FR-018)
- [X] T052 [US4] Connect tombstone/withdrawal transitions to lib/server/profiles/eligibility.ts and lib/server/conversations/context-fence.ts under shared lock order; invalidate direct/transitive claims and all consumed session dependencies before returning a successful destructive command. (FR-012, FR-015, FR-017)
- [X] T053 [US4] Implement durable physical cleanup in lib/server/artifacts/cleanup.ts for original/staged files, extraction/selection/draft payloads and generated history/title projections; preserve exact owner text and separately submitted claims/IDs, and fence late writes against tombstones. (FR-017, SC-005)
- [X] T054 [US4] Add retryable documented native clear/reset retirement in lib/server/artifacts/native-retirement.ts with separate receipts; immediate output denial cannot depend on provider success, and UI/telemetry must not claim durable provider-event erasure. (FR-015, FR-017)
- [X] T055 [US4] Add orphan/expired-intent reconciliation and independent cleanup lane in scripts/artifact-worker.ts and lib/server/artifacts/cleanup.ts; preserve quota correctness, one-hour orphan safety age, bounded backoff and cleanup progress after login/owner revocation. (FR-008, FR-009, FR-017)
- [X] T056 [US4] Build app/_components/attachments/lifecycle-actions.tsx and wire source-viewer.tsx/review-queue.tsx with distinct remove/detach/withdraw/delete/replace, affected-claim preview, reason/version confirmation and cleanup states. (FR-008, FR-016, FR-017, FR-018)
- [X] T057 [US4] Add tests/ui/artifact-lifecycle.spec.ts and pass T049/T050 plus T040 release regressions with real storage; verify replacement and withdrawal are distinct and cleanup converges after restart. Record evidence in specs/004-chat-artifact-ingestion/validation.md. (FR-020, SC-004, SC-005, SC-006)

## Phase 7: Cross-cutting verification and handoff

- [X] T058 Add sanitized observability in lib/server/artifacts/telemetry.ts and tests/unit/artifact-telemetry.test.ts for queue age, scan freshness, durations, retries, lease reclaim and cleanup lag; verify no filenames, source text, credentials or storage paths reach logs. (FR-005, FR-008, FR-020)
- [X] T059 Add scripts/check-artifacts.ts and package.json test:artifacts to prove real scanner/parser isolation, every format/locator, offline OCR, malicious/limit/timeout/OOM/network behavior and 120-second fixture outcomes; record image/signature versions and separate queue time. Extend .github/workflows/ci.yml with prepared real artifact checks and 004 Spec Kit selection, keeping hosted deployment disabled. (FR-003, FR-004, FR-006, FR-007, FR-020, SC-001, SC-003, SC-006)
- [X] T060 Add guarded scripts/artifact-recovery-check.ts and package.json artifacts:recovery:check for schema 013 upgrade, matched disposable DB/store restore, worker kill/restart/lost completion/lease expiry, cancellation/deletion and watchdog responsiveness. Verify working DB/store/workflow state is untouched. (FR-009, FR-017, FR-020, SC-005)
- [X] T061 Run all four story UI suites plus full existing CLI WebKit regression, check keyboard/accessibility/mobile/theme and ≤5-second persisted-status visibility; inspect screenshots under ignored local-artifacts/004 and record results in specs/004-chat-artifact-ingestion/validation.md. (FR-016, FR-020, SC-002, SC-006)
- [X] T062 Run docs/types/unit/contracts/integration/build, actual-response004 eval/review and existing 002/003 context regression checks as required by quickstart.md; record failures/fixes and truthful local/CI/hosted distinctions in specs/004-chat-artifact-ingestion/validation.md. Do not substitute mocks or skipped prerequisites for real acceptance. (FR-020, SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007)
- [X] T063 Update README.md, ROADMAP.md, docs/architecture.md, docs/decisions.md, .env.example and specs/004-chat-artifact-ingestion/quickstart.md to actual implemented setup/limits/retention and deferred hosted/RAG scope; check task completion against evidence, not code presence alone. (FR-017, FR-019, FR-020)
- [X] T064 Reconcile specs/004-chat-artifact-ingestion/spec.md, plan.md, tasks.md and validation.md against final behavior, complete relevant CONTRIBUTING.md/.github/pull_request_template.md review evidence and prepare the implementation PR with checks/rollout/rollback/docs impact. No harness attribution, Vercel reconnection/deployment or merge without an authorized merge request; after successful merge close PR/delete branch per AGENTS.md. (FR-020)

## Dependencies and execution order

```text
Setup T001–T004 → Foundation T005–T014 → US1 T015–T028
  → US2 T029–T038 → US3 T039–T048 → US4 T049–T057
  → Verification T058–T064
```

Within each phase, follow listed order unless a [P] group is explicitly independent.
T003/T004 are independent after T002; all foundation migrations/contract changes are
sequential because they share files. T015/T016, T029/T030, T039/T040 and T049/T050
are independent test authoring pairs after prior phases. T021/T022/T023 can proceed
in separate adapter files after T020 establishes the shared manifest. Do not edit
shared schemas/manifests concurrently. This identifies opportunities, not a mandate
to spawn agents or parallelize user-story services.

US2 needs US1 source output; US3 needs US1 selections and US2 Pending proposal flow;
US4 tests both source-only and consumed/reviewed paths. Independent story tests use
synthetic setup/fixtures, never rely on another test's execution. Foundation
invalidation helpers are required before publication, even though lifecycle UX
arrives in US4. Validate each checkpoint, then continue the full authorized slice.

## Parallel examples

| Story | Independent work once prerequisites pass |
| --- | --- |
| US1 | T015 HTTP tests alongside T016 extraction tests; after T020, adapters T021/T022/T023 |
| US2 | T029 proposal/review contract tests alongside T030 race/projection integration tests |
| US3 | T039 send/tool contracts alongside T040 whole-conversation invalidation tests |
| US4 | T049 lifecycle commands alongside T050 physical-cleanup/race test authoring |

## Requirement and outcome coverage

| Key | Task IDs |
| --- | --- |
| FR-001 | T013, T015, T018, T025, T030, T040, T043, T049 |
| FR-002 | T005, T015, T018, T026 |
| FR-003 | T001, T004, T016, T020–T023, T059 |
| FR-004 | T006, T007, T015, T018, T020, T022, T059 |
| FR-005 | T003, T005, T014, T017, T058 |
| FR-006 | T001, T002, T016, T019, T020, T044, T059 |
| FR-007 | T004, T006, T008, T016, T021–T023, T025, T027, T031, T059 |
| FR-008 | T005, T010, T018, T024, T027, T055, T056, T058 |
| FR-009 | T006, T007, T010, T012, T014, T015, T017, T019, T024, T033, T040, T042, T049, T051, T055, T060 |
| FR-010 | T013, T025, T029, T033, T035, T037 |
| FR-011 | T006, T009, T013, T029, T030, T035, T037 |
| FR-012 | T009, T029–T034, T036, T037, T045, T052 |
| FR-013 | T005, T008, T029, T031, T032, T035, T036, T041, T045 |
| FR-014 | T011, T039, T041, T042, T044–T046 |
| FR-015 | T011, T026, T034, T039–T041, T043, T044, T046, T050, T052, T054 |
| FR-016 | T027, T036, T042, T046, T056, T061 |
| FR-017 | T012, T034, T049–T056, T060, T063 |
| FR-018 | T049, T051, T056 |
| FR-019 | T023, T063 |
| FR-020 | T003, T004, T014, T028, T038, T047, T048, T057–T064 |
| SC-001 | T015, T016, T028, T059, T062 |
| SC-002 | T015, T028, T030, T038, T061, T062 |
| SC-003 | T016, T028, T059, T062 |
| SC-004 | T029, T030, T034, T038, T057, T062 |
| SC-005 | T024, T040, T048, T050, T053, T057, T060, T062 |
| SC-006 | T024, T028, T038, T048, T057, T059, T061, T062 |
| SC-007 | T039, T047, T048, T062 |

## Implementation strategy

US1 is the smallest demoable increment, not full 004 completion. Add exact review,
then draft chat, then lifecycle/recovery. Finish all 64 tasks and required checks when
implementation is authorized; do not stop at the MVP or create artificial human
study gates. Keep local/CI proof separate from hosted readiness. Commit coherent
changes with plain authored messages; preserve model/config secrets and the user's
deployment restrictions. Mark tasks complete only with verified behavior/evidence.
