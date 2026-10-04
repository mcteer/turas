# Tasks: Weekly and Executive Reporting

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts](contracts/reporting-api.md) and [quickstart.md](quickstart.md).
**Status**: Local implementation and testing complete; T066 live Resend acceptance explicitly deferred by the user. Evidence is in validation.md.
**Authority**: mcteer-only decisions; the user confirmed approval for every send.
**Tests**: Required by FR-023 and SC-001–SC-008. Write meaningful contract/domain
cases first, observe expected failure, then implement. Do not substitute mocks for
real file rendering, provider evidence or hosted readiness.

**Resume checkpoint**: Implementation tasks T001–T062 are reconciled against the
domain/contract/UI/artifact tests and `validation.md`. T034/T036/T053 now include
before/after-intent withdrawal races, real subprocess-exit quarantine, exact known-ID
reconciliation, bounded unmatched events and audit minimization. Final-source gates
T063–T065 are recorded individually; a running/stale check is not completion.
T066 live-provider acceptance is explicitly deferred by the user's instruction
“Resend can come later.” Development review/setup is tested; actual live-provider
evidence is not substituted by fixtures. The later release prerequisite is recorded
in `validation.md`. Reviewable PR evidence is in `pr-evidence.md`. The user has
authorized merge once CI is green; hosted deployment remains out of scope.
**Format**: Every item has sequential ID, optional `[P]`, story label in story phases,
concrete repository paths and FR/SC traceability. `[P]` permits independent files
within the phase after its prerequisites; shared manifests/routes/worker edits stay serial.
C01–C12 quote the normative field constraints verbatim; other data-model transaction
and lifecycle rules also apply.

## Phase 1: Setup

**Goal**: Establish isolated implementation tooling and prove the renderer choice.
**Independent Check**: Owned fixture resources cannot target app/Preview/Production;
the renderer spike proves selectable PDF text and editable native slide objects.

- [X] T001 Read the routed installed Eve outbox/schedule and Next route-handler guides, record the current main/schema/model baseline and pending gates in `specs/009-weekly-executive-reporting/validation.md`; preserve the selected model and document that 009 invokes no model. (FR-021, FR-023)
- [X] T002 Pin reviewed Resend SDK/PptxGenJS dependencies in `package.json` and `package-lock.json`; build the early isolated renderer spike in `report-renderer/Dockerfile` and `report-renderer/spike.ts`, recording image/tool/font hashes, licenses and actual PDF/PPTX edit/render evidence in `specs/009-weekly-executive-reporting/validation.md`; fail before dependent work if the proposed stack cannot meet native chart/table/text or font requirements. (FR-013, FR-014, FR-024, SC-004)
- [X] T003 Create `scripts/reports-test-environment.ts` and `tests/fixtures/reports/environment.ts` with owned marked DB/roles/ports/store/container isolation, empty and schema-038 fixtures, no arbitrary destructive overrides, fake transport only at provider boundary and preservation of configured DB/artifact/Eve stores. (FR-022, SC-007)
- [X] T004 Add `scripts/test-reports.ts`, `tests/unit/report-test-manifest.test.ts` and planned command entries in `package.json`; discover all report suites and reject omitted/duplicate/skipped tests; keep private evidence source-bound outside Git. (FR-023)

## Phase 2: Foundational Prerequisites

**Goal**: Establish authority, source-safe snapshots, storage and durable jobs before any story.
**Independent Check**: Empty/038 upgrade, current policy, source eligibility, strict replay
and immutable-payload denial cases pass. New report configuration does not break older features.

- [X] T005 [P] Write empty/038 upgrade, scoped foreign-key/uniqueness, immutable payload and runtime/cleanup-role denial tests in `tests/integration/report-schema.test.ts`. (FR-001, FR-007, FR-022, SC-007)
- [X] T006 [P] Write the actor/audience/current-grant/preview/replay matrix and strict error/transport cases in `tests/contracts/report-policy.test.ts` and `tests/contracts/report-api.test.ts`; include hidden source counts and no fabricated partner sessions. (FR-001, FR-008, FR-015, FR-016, SC-002)
- [X] T007 Create scopes, revisions/payloads, dependencies, calculations, artifact/validation/brand/decision/receipt tables in `migrations/039-report-revisions.cjs`; update `migrations/manifest.json` without changing existing migration bytes. Use the full entity/invariant contract in `data-model.md`. (FR-002, FR-003, FR-007, FR-014, FR-022)
- [X] T008 Create publication/policy/recipient/schedule/delivery/event tables in `migrations/040-report-delivery.cjs` and jobs/heartbeat/exact-cleanup functions in `migrations/041-report-jobs-cleanup.cjs`; add manifest hashes, per-publication/address uniqueness across policy versions and fenced leases. (FR-009, FR-010, FR-011, FR-012, FR-017, FR-019, FR-022)
- [X] T009 Implement narrow runtime/cleanup grants in `scripts/db-role-setup.sql`, explicit preparation in `scripts/prepare-reports.ts`, report configuration in `lib/server/reports/config.ts` and readiness in `lib/server/reports/readiness.ts`; document variable names in `.env.example`, gate only 009, and preserve settlement/cleanup when disabled. (FR-019, FR-022, FR-024)
- [X] T010 Implement strict shared command validators and canonical digests in `lib/server/reports/schema.ts` and `lib/server/reports/commands.ts`, with `tests/unit/report-schema.test.ts`. C01: "All report, revision, publication, policy, job and request IDs are UUIDs; versions are positive integers; digests are 64 lowercase hex characters; decision rationale is 1–2000 characters; every mutation requires a request key and expected version, except create which requires expected version 0." Include exact-key current-authority receipts and two DB-only conflict retries without external-effect retries. (FR-007, FR-008, FR-012)
- [X] T011 Implement scope/period validation in `lib/reports/periods.ts` with `tests/unit/report-periods.test.ts`. C02: "Report kind is weekly, monthly or quarterly; audience is delivery, account_team or leadership; timezone is a valid IANA name; weekly scope has exactly one engagement; executive scope has 1–20 unique engagements and 0–20 unique accepted workload UUIDs belonging to one customer, with includeCustomerLevel=true required for engagements without an assigned workload." C03: "Period dates are real ISO dates; a weekly period is Monday–Sunday, monthly is a calendar month and quarterly is a calendar quarter; periods contain 7–92 inclusive dates; asOf is a server-owned UTC capture instant; future periods are rejected and a current incomplete period requires partial=true." Cover 92-day quarters, DST and leap/year boundaries without changing 008 limits. (FR-002, FR-006, SC-001, SC-004)
- [X] T012 Implement `lib/server/reports/policy.ts` and `lib/server/reports/actor.ts` with explicit audience intersection before selection, canonical mcteer review, internal recipient membership checks, partner published-delivery-only reads and dedicated durable job capabilities without borrowed browser sessions. (FR-001, FR-008, FR-015, FR-016)
- [X] T013 Implement report-specific source adapters and dependency closure in `lib/server/reports/sources.ts` and `lib/server/reports/projection.ts`; use the researched 003/005/006/008 eligibility/lock seams, exclude workforce/finance/private chat, and expose immediate current-source release checks for every consumer. (FR-003, FR-015, FR-017, SC-002)
- [X] T014 Implement a separate private report store/catalog in `lib/server/reports/store.ts` and `lib/server/reports/artifacts.ts`, with `tests/integration/report-store.test.ts`; verify opaque keys/digests, staged/finalized ownership, private permissions, report-aware orphan reconciliation and no overlap with upload-store cleanup. (FR-007, FR-017, FR-019, FR-022)
- [X] T015 Implement bounded jobs/leases/fencing in `lib/server/reports/jobs.ts`, with `tests/integration/report-jobs.test.ts`. C09: "Draft/render jobs have at most 3 attempts with delays of 10 and 60 seconds; draft deadline is 30 seconds and render deadline is 120 seconds; leases last 180 seconds with a heartbeat every 15 seconds; the renderer has at most 2 concurrent jobs, 2 CPUs and 2 GiB per job, with no network access." Reject stale completions and recheck durable authority/source inputs. (FR-019, FR-022, SC-007)
- [X] T016 Implement `lib/server/reports/http.ts`, `lib/server/reports/previews.ts` and `lib/server/reports/rates.ts`. C08: "Lists have page size 1–50 and cursors expire after 10 minutes; JSON command bodies are at most 128 KiB and ordinary read responses at most 1 MiB; review/send previews expire after 5 minutes; all authenticated responses use private, no-store." Enforce all delivery-contract rate/queue budgets and safe no-store errors; test replay quota and hostile unknown fields in `tests/contracts/report-limits.test.ts`. (FR-001, FR-008, FR-019)

## Phase 3: User Story 1 — Review a Weekly Update (P1, MVP)

**Goal**: Prepare truthful weekly drafts and publish one exact reviewed version.
**Independent Check**: Real accepted 006/008 inputs produce reviewed weekly output;
empty/pending/late/corrected/baseline-changed cases remain truthful without email.

- [X] T017 [P] [US1] Write weekly lifecycle/approval/replay/source-change scenarios in `tests/integration/report-weekly.test.ts`, `tests/integration/report-publication-prerequisites.test.ts`, `tests/integration/report-lifecycle.test.ts` and `tests/contracts/report-publication-api.test.ts`, including a source change between render, preview and publish. (FR-003, FR-004, FR-007, FR-008, SC-001)
- [X] T018 [P] [US1] Create independent minute/variance/measurement oracles in `tests/fixtures/reports/oracles.ts` and `tests/unit/report-calculations.test.ts`; cover corrected/reversed time, missing/zero inputs, 92-day periods, non-comparable outcomes and hidden denominators. (FR-006, FR-015, SC-001, SC-002)
- [X] T019 [US1] Implement `lib/server/reports/snapshots.ts` and `lib/server/reports/calculation-inputs.ts` with consistent server capture, current accepted heads, exact time revision/decision identities and explicit audience selection before SQL; retain pending predecessor semantics, coverage manifest and limit+1 overflow. Do not backdate current ledger totals. (FR-002, FR-003, FR-006, FR-015)
- [X] T020 [US1] Implement `report-metrics-v1` pure arithmetic in `lib/reports/calculations.ts`: integer period/cumulative actuals, one closing forecast, scoped variance, reviewed measurement changes and unknown reasons; exclude resource utilization and finance. (FR-006, SC-001)
- [X] T021 [US1] Define `ReportDocument` and deterministic weekly composition in `lib/reports/document.ts` and `lib/server/reports/weekly.ts`. C04: "A structured report is at most 1 MiB of canonical JSON, with title 1–200 characters, annotation 1–2000 characters, at most 20 annotations, at most 1000 selected delivery records and at most 2000 exact source references; overflow returns scope_too_large without a partial publication." Preserve eight sections, cited facts and explicit gaps; annotations cannot approve facts or invoke a model. (FR-003, FR-004, FR-007, FR-021)
- [X] T022 [US1] Implement immutable draft/revise/cancel and exact correction-predecessor primitives in `lib/server/reports/revisions.ts`; store source-bound content/payloads separately from audit and never modify a published revision. (FR-007, FR-018, FR-019)
- [X] T023 [US1] Implement brand manifest validation and decisions in `lib/server/reports/brand.ts`, register fixture/real candidates through `scripts/prepare-reports.ts`, and author `report-templates/brand-manifest.json` with licenses/provenance. C11: "A brand profile contains versioned asset/font/template hashes, source provenance and approval state draft, approved or revoked; only bundled reviewed SVG/PNG logos and static TTF/OTF fonts are allowed; a missing approved font or unsupported glyph blocks release." Synthetic approval is confined to owned fixtures. (FR-008, FR-014, FR-024)
- [X] T024 [US1] Implement escaped weekly HTML/plain-text rendering in `lib/server/reports/mail-content.ts`; validate all sections/safe links/metadata and content digests, with no tracking pixels, remote assets or recipient list embedded in the body. (FR-004, FR-014, FR-016)
- [X] T025 [US1] Implement exact render/validation-bound publication/reject/withdraw decisions in `lib/server/reports/publication.ts`; bind source, template, brand, artifact/mail digests, rationale and preview, enforcing current locks and idempotency. (FR-007, FR-008, FR-014, FR-017)
- [X] T026 [US1] Add list/prepare/read/revise/render/preview/decision/receipt routes under `app/api/reports/customers/[customerId]/`, `app/api/reports/[reportId]/` and `app/api/reports/receipts/[requestKey]/route.ts` per `contracts/reporting-api.md`; use only shared domain methods. (FR-001, FR-004, FR-008)
- [X] T027 [US1] Build customer report list/detail and weekly review in `app/(workspace)/customers/[customerId]/reports/page.tsx`, `app/(workspace)/customers/[customerId]/reports/[reportId]/page.tsx` and `app/_components/reports/weekly-review.tsx`; add contextual entry links in `app/_components/app-shell.tsx` and existing execution components without changing the composer. (FR-020, SC-006)
- [X] T028 [US1] Add genuine weekly empty/populated/review-conflict/replay UI journeys in `tests/ui/report-weekly.spec.ts` and record the independent story check in `specs/009-weekly-executive-reporting/validation.md`. (FR-020, FR-023, SC-001, SC-006)

## Phase 4: User Story 2 — Deliver Reviewed Reports (P1)

**Goal**: Prepare scheduled drafts and deliver exact approved mail with truthful receipts.
**Independent Check**: A controlled provider boundary proves one durable identity per
recipient across duplicate sends, partial failures and crash/restart uncertainty.

- [X] T029 [P] [US2] Write schedule DST/missed-period, policy revision/revocation, send authorization and crash/race/idempotency state tests in `tests/integration/report-send-outbox.test.ts`, `tests/integration/report-dispatch-recovery.test.ts` and `tests/integration/report-schedules.test.ts`. (FR-009, FR-010, FR-011, FR-012, SC-003)
- [X] T030 [P] [US2] Write provider contract tests in `tests/contracts/report-provider.test.ts` and controlled fake transport in `tests/fixtures/reports/transport.ts`; include signature/raw-body/timestamp failures, duplicate/out-of-order events, response/event races, partial recipients and 23-hour cutoff. (FR-011, FR-012, FR-016, SC-003)
- [X] T031 [US2] Implement policy/sender/recipient approval and immutable payloads in `lib/server/reports/recipients.ts` and `lib/server/reports/senders.ts`. C05: "Recipient policy contains 1–20 unique normalized addresses of at most 254 characters, no display-name/header syntax or control characters, one configured sender ID, one report scope and audience; internal recipients require active internal membership IDs and delivery recipients require an explicit customer-entitlement rationale of 1–500 characters." Enforce private HMAC identities, key rotation without new send identity, active membership checks and renewed approval on material changes. (FR-008, FR-009, FR-015, FR-016)
- [X] T032 [US2] Implement schedule CRUD/due-period derivation in `lib/server/reports/schedules.ts`. C06: "A schedule is weekly only, with one approved policy, IANA timezone and local time HH:mm; default is Monday 09:00 for the preceding complete week; state is active, paused or revoked; there is at most one active schedule per scope, audience and timezone." Handle DST gaps/folds, latest-only recovery, missed-period records and no unattended sends. (FR-002, FR-010, FR-019)
- [X] T033 [US2] Implement send preview/authorization in `lib/server/reports/send-review.ts`, atomically binding exact publication/mail/artifact/sender/policy/recipient digests and creating all recipient delivery intents or none; policy approval and publication are insufficient by themselves. (FR-008, FR-009, FR-011)
- [X] T034 [US2] Implement dispatch-intent/retry/cancel/uncertain transitions in `lib/server/reports/outbox.ts`. C10: "One delivery row identifies one publication and normalized recipient address; transport timeout is 15 seconds; at most 3 send attempts use the same provider key and identical request bytes; no retry starts 23 hours or more after first dispatch; uncertain outcomes after this boundary require operator reconciliation and are never automatically resent." Enforce current-policy/source fence before intent, unique cross-policy recipient delivery, fixed first-dispatch clock and no network in DB transactions. (FR-001, FR-011, FR-012, FR-017, FR-019, SC-003)
- [X] T035 [US2] Implement exact one-recipient Resend transport in `lib/server/reports/resend.ts`, disable SDK auto-retries and tracking, use private attachment bytes and sanitized failure classes; never install a conversational channel or expose an agent send tool. (FR-011, FR-012, FR-016, FR-021)
- [X] T036 [US2] Implement raw signed event verification, minimal event storage, monotonic status folding and bounded known-ID reconciliation in `lib/server/reports/webhooks.ts`, `lib/server/reports/delivery-commands.ts` and `app/api/webhooks/reports/resend/route.ts`; quarantine only bounded unmatched metadata, preserve bounce/complaint suppression and never infer delivery from acceptance. (FR-011, FR-012, FR-016, FR-019, SC-003)
- [X] T037 [US2] Add `scripts/reports-worker.ts` and supervision in `scripts/dev.mjs`, with separate bounded job-kind concurrency, heartbeat/readiness, fair atomic rates/queue limits, graceful stop and current durable authority; no dependency on an expired login session and no model invocation. (FR-001, FR-010, FR-019, FR-021, FR-022)
- [X] T038 [US2] Add recipient policy/schedule/decision/send/delivery/reconcile/readiness adapters under `app/api/reports/policies/[policyId]/`, `app/api/reports/deliveries/[deliveryId]/` and `app/api/reports/readiness/route.ts`, completing relevant customer commands and report send previews per API contract. (FR-008, FR-009, FR-010, FR-011, FR-012)
- [X] T039 [US2] Build exact-recipient policy, Prepare Weekly Draft schedule, Send Review and per-recipient Delivery History in `app/_components/reports/recipient-policy.tsx`, `app/_components/reports/schedule.tsx` and `app/_components/reports/delivery.tsx`; distinguish provider acceptance, delivery and uncertainty and hide restricted controls/addresses from panel/partners. (FR-016, FR-020)
- [X] T040 [US2] Add policy/schedule/send/partial-failure/uncertain/reconcile/pause journeys in `tests/ui/report-delivery.spec.ts`; verify same-key lost-ack recovery and no retry-successful-recipient behavior. Keep live send disabled until full lifecycle gates pass. (FR-020, FR-023, SC-003, SC-006)

## Phase 5: User Story 3 — Executive PDF and Editable QBR (P2)

**Goal**: Produce six-section monthly/quarterly executive artifacts with validated branding.
**Independent Check**: Every page/slide of six synthetic pairs is inspected, has semantic
parity, and native slide text/table/chart edits survive save/reopen.

- [X] T041 [P] [US3] Create six structured fixture pairs and negative layout/font/link/size cases in `tests/fixtures/reports/executive.ts`, with semantic/OOXML/PDF checks in `tests/integration/report-artifacts.test.ts`; include both 92-day quarters and future/partial-period handling. (FR-005, FR-013, FR-014, SC-004)
- [X] T042 [US3] Implement deterministic executive composition in `lib/server/reports/executive.ts`; include scoped maturity, measured value/adoption, selected delivery portfolio, risks and next actions, with unavailable later-feature sections and no invented ROI or finance. (FR-003, FR-005, FR-006, FR-015, FR-021)
- [X] T043 [US3] Complete PDF/PPTX renderers in `report-renderer/render.ts` and bounded continuation layout in `report-renderer/layout.ts`. C07: "PDF and PPTX files are each at most 10 MiB and together at most 15 MiB; PDF has at most 40 pages and PPTX at most 40 slides; PPTX ratio is 16:9; weekly HTML and plain text are each at most 256 KiB; total encoded email request is at most 22 MiB." Produce tagged/selectable PDF and native PPTX text/tables/charts with approved Geist, defined font minima, safe continuations and no remote fetching. Apply weekly/email bounds to `lib/server/reports/mail-content.ts` too. (FR-013, FR-014, FR-019)
- [X] T044 [US3] Implement structural/content/layout/font/link/metadata validators and immutable receipts in `lib/server/reports/validation.ts` and `report-renderer/validate.py`; inspect notes, hidden slides, embedded chart workbooks and safe citation descriptions, and block publication on any failure. (FR-005, FR-013, FR-014, FR-016)
- [X] T045 [US3] Implement render-job finalization and exact-file streaming in `lib/server/reports/render-jobs.ts`, `lib/server/reports/artifacts.ts` and `app/api/reports/artifacts/[artifactId]/route.ts`; fence current sources/digests before promotion and each 64 KiB chunk, never expose file paths or regenerate bytes under an old approval. (FR-001, FR-007, FR-013, FR-017)
- [X] T046 [US3] Add actual-sample brand review/read/decision routes under `app/api/reports/brands/` and executive validation samples to `report-templates/brand-manifest.json`; show exact font/asset/master hashes and record mcteer approval without claiming a corporate master or portable embedded PPTX fonts. (FR-008, FR-014, FR-024)
- [X] T047 [US3] Build monthly/quarterly scope, artifact preview/download and brand review in `app/_components/reports/executive-review.tsx` and `app/_components/reports/brand-review.tsx`; preserve professional layout, missing-input states and explicit editing-font requirement. (FR-013, FR-014, FR-020)
- [X] T048 [US3] Implement `scripts/check-report-artifacts.ts` to extract content, inspect OOXML/native charts, rasterize every PDF page/slide, verify edit/save/reopen in the supported office environment and require a source-bound visual review record; distinguish LibreOffice evidence from untested PowerPoint portability. (FR-013, FR-014, FR-023, SC-004)
- [X] T049 [US3] Add month/quarter/partial/overflow/font/brand/artifact-download journeys in `tests/ui/report-executive.spec.ts` with real renderer output and governed fixture approvals; document the independent artifact story result in `specs/009-weekly-executive-reporting/validation.md`. (FR-020, FR-023, SC-004, SC-006)

## Phase 6: User Story 4 — Audience, Withdrawal and Corrections (P2)

**Goal**: Finish source mutation propagation, exact cleanup and truthful correction history.
**Independent Check**: Revocation/withdrawal withholds content synchronously on every
release path and cleanup never deletes a newer correction; sent history stays accurate.

- [X] T050 [P] [US4] Write source-kind correction/retraction/time reversal/baseline replacement, retention expiry and stale-cleanup-lease races in `tests/integration/report-lifecycle.test.ts`, `tests/integration/report-cleanup.test.ts` and `tests/integration/report-send-outbox.test.ts`; include withdrawal between download chunks and before/after dispatch intent. (FR-017, FR-018, FR-019, SC-002, SC-007)
- [X] T051 [P] [US4] Complete the route/job/file/metadata audience matrix in `tests/contracts/report-audience.test.ts`, including address/provider-ID hiding, no private notes in OOXML/PDF, malicious source instructions and revoked member/session/customer/brand/policy. (FR-001, FR-003, FR-015, FR-016, FR-021, SC-002)
- [X] T052 [US4] Implement reverse dependencies in `lib/server/reports/invalidation.ts` and transaction hooks in `lib/server/retrieval/projections.ts`, `lib/server/plans/baselines.ts`, `lib/server/execution/review.ts`, `lib/server/execution/time-review.ts`, `lib/server/execution/registers.ts`, `lib/server/execution/milestones.ts`, `lib/server/execution/reconciliation.ts` and `lib/server/execution/invalidation.ts`; target exact revision/source identities and changed numeric contributions, track new eligible period entries through scope-generation watches, mark affected publications review_required/withheld, and safely tolerate pre-009 schema/disabled state. (FR-003, FR-017, FR-018, FR-022)
- [X] T053 [US4] Implement `lib/server/reports/cleanup.ts` and worker integration with exact leased payload/file deletion. C12: "Unpublished report payloads expire after 30 days without a new revision, published payloads and recipient addresses expire after 365 days, render scratch files expire after 1 hour, and non-technical audit metadata expires after 730 days; minimal content-free identity/link tombstones survive solely for replay protection and correction lineage; withdrawal queues immediate ineligibility and cleanup within 24 hours; cleanup batches contain at most 100 exact payload/file identities." Apply expiry without resurrecting content on replay; preserve minimal correction/send identity and validate stale causes before delete. (FR-017, FR-019, FR-022)
- [X] T054 [US4] Implement correction comparison, publication predecessor lineage and current-source-safe history in `lib/server/reports/corrections.ts`, `lib/server/reports/history.ts` and report history/source routes; changes require a new review/send, never mutate already-sent bytes or claim recall. (FR-007, FR-017, FR-018)
- [X] T055 [US4] Build source-change/correction history and withheld/expired states in `app/_components/reports/history.tsx` and `app/_components/reports/sources.tsx`; hide unavailable titles/counts and private lineage from external projections while keeping useful correction status. (FR-016, FR-017, FR-018, FR-020)
- [X] T056 [US4] Add assigned/unassigned partner, grant revocation, source withdrawal, correction and retention UI journeys in `tests/ui/report-boundaries.spec.ts`; verify restricted content is absent from response payloads, downloads and rendered document metadata. (FR-020, FR-023, SC-002, SC-006)

## Phase 7: Cross-Cutting Validation and Handoff

**Goal**: Prove the complete slice and record external prerequisites honestly.
**Independent Check**: Gates A–H are individually recorded; local and hosted proof
remain distinct. No unfinished gate is hidden by a broad green test summary.

- [X] T057 [P] Implement `scripts/benchmark-reports.ts` with `tests/fixtures/reports/load.ts`, independent correctness sentinels and the exact quickstart workload, per-class p95 and render/draft deadlines; include queue/rate/overflow/fairness checks. (FR-006, FR-019, FR-023, SC-005)
- [X] T058 [P] Implement `scripts/reports-recovery-check.ts` for empty/038 upgrades, paired DB/report-store/Eve preservation, staged orphans, missing approved files, stale cleanup, feature-disable operation and post-dispatch quarantine; use owned disposable resources only. (FR-012, FR-017, FR-022, FR-023, SC-007)
- [X] T059 [P] Implement `scripts/test-reports-regressions.ts` with an explicit 002–008 suite manifest and `tests/unit/report-regression-manifest.test.ts`; prove source hooks do not change previous source/review/arithmetic/privacy/worker behavior and report paths make zero model calls. (FR-021, FR-022, FR-023)
- [X] T060 Implement `scripts/check-reports-ui.ts` and report projects in `playwright.config.ts` with real owned fixtures/worker/store, four WebKit viewport/theme combinations, axe and reviewed sanitized captures; prevent a second managed dev server when the runner already owns it. (FR-020, FR-023, SC-006)
- [X] T061 Implement opt-in `scripts/check-report-delivery.ts` requiring exact approved synthetic publication, configured verified sender and explicitly authorized test recipient; retain actual provider acceptance/delivery evidence privately, distinguish receipts and prohibit automatic replacement sends. (FR-011, FR-012, FR-023, FR-024, SC-008)
- [X] T062 Implement `scripts/check-reports-release.ts` and write `docs/reporting-operations.md` for brand/font/sender/store/worker readiness, private config, suppression, uncertainty reconciliation, restore and hosted limitations; aggregate source-bound evidence without treating mocks as provider/hosted proof. (FR-019, FR-022, FR-023, FR-024, SC-008)
- [X] T063 Run the full deterministic reporting suite, six-pair actual artifact/edit/visual gate and four-project WebKit gate; record commands/counts/source digest and all inspected artifacts in `specs/009-weekly-executive-reporting/validation.md`, fixing concrete failures before proceeding. (FR-023, SC-001, SC-002, SC-003, SC-004, SC-006)
- [X] T064 Run disposable upgrade/recovery and representative performance gates and record measured results/limits in `specs/009-weekly-executive-reporting/validation.md`; do not substitute earlier-feature evidence. (FR-022, FR-023, SC-005, SC-007)
- [X] T065 Run 002–008 regressions, typecheck, Eve/Next production build, docs and diff checks against the final source; record exact results in `specs/009-weekly-executive-reporting/validation.md` and resolve any failures without broadening scope. (FR-021, FR-022, FR-023)
- [ ] T066 **Deferred by user: “Resend can come later.” Not part of current local completion scope.** Obtain actual brand-sample and test-recipient/sender decisions through the completed review flow, run the controlled real email/release gate and record evidence in `specs/009-weekly-executive-reporting/validation.md`; if external inputs are unavailable leave this task explicitly pending, with the exact prerequisite, rather than claim completed acceptance. No Production mail or hosted deployment is implied. (FR-008, FR-014, FR-023, FR-024, SC-008)
- [X] T067 Update `README.md`, `ROADMAP.md`, `docs/decisions.md`, `docs/templates/README.md`, this feature's `spec.md` and `plan.md` with actual implementation/gate status and remaining hosted/private-data limits; retain user-confirmed approval for every send unless the user changes it. (FR-023, FR-024)
- [X] T068 Prepare reviewable PR evidence using `.github/pull_request_template.md` and `specs/009-weekly-executive-reporting/validation.md`, including exact checks, rollout/rollback, unresolved external prerequisites and README freshness; never self-claim independent maintainer review or add harness attribution, and merge only when authorized. (FR-022, FR-023, FR-024)

## Dependencies and Execution Order

```text
Setup T001–T004
  → Foundation T005–T016
    → US1 T017–T028
      → US2 T029–T040
      → US3 T041–T049
      → US4 T050–T056
        → Cross-cutting gates T057–T068 (all stories required)
```

US2, US3 and US4 use US1's common revision/publication identity but are independently
testable with its fixtures. US4 source mutation propagation is a release dependency
for external sends in US2 and downloaded publications in US3; synchronous eligibility
checks exist from foundation onward. Keep live delivery disabled until all lifecycle
gates pass. T037 worker integration is shared; merge its changes before dependent
render/cleanup worker integrations. T057–T059 may be authored after contracts stabilize,
but final execution T063–T066 waits for all stories. T066 is an external-input gate,
not permission to skip development or claim live acceptance.

Within each story, tests precede dependent behavior; domain precedes route/UI adapters.
Do not parallelize edits to schema, migration manifest, package manifest, shared
route files or worker supervision. `[P]` does not authorize independent agents by itself.

## Parallel Examples

| Story | Safe Independent Work after Prerequisites |
| --- | --- |
| US1 | T017 weekly contract/integration tests and T018 independent arithmetic oracle |
| US2 | T029 delivery/schedule state tests and T030 provider/signature fixtures |
| US3 | T041 fixture tests and UI layout design after the ReportDocument contract is frozen; serialize shared renderer/brand integration |
| US4 | T050 lifecycle races and T051 audience/metadata matrix |
| Cross-cutting | T057 load runner, T058 recovery runner and T059 prior-feature regression runner |

## Implementation Strategy

US1 is the smallest useful increment: trustworthy weekly drafts with exact review,
without requiring live email. Complete it and validate, then add durable delivery,
executive artifacts and lifecycle/correction flows. All four stories and recorded
acceptance gates are the scope of 009; an early MVP is not feature completion.
Use the existing installed docs and researched seams, not speculative framework or
provider integrations. Preserve all uncommitted user work and current model choice.

## Requirement Coverage

The explicit FR/SC references on tasks are authoritative. The table summarizes the
primary implementation and verification path for each requirement.

| Requirement | Primary Tasks |
| --- | --- |
| FR-001 | T006, T012, T016, T034, T045, T051 |
| FR-002 | T007, T011, T019, T032 |
| FR-003 | T013, T017, T019, T021, T042, T052 |
| FR-004 | T017, T021, T024, T026 |
| FR-005 | T041, T042, T044 |
| FR-006 | T011, T018–T020, T042, T057 |
| FR-007 | T007, T010, T014, T022, T025, T045, T054 |
| FR-008 | T006, T010, T012, T023, T025, T031, T033, T046 |
| FR-009 | T008, T029, T031, T033, T038 |
| FR-010 | T008, T029, T032, T037, T038 |
| FR-011 | T029, T033–T036, T038, T061 |
| FR-012 | T008, T029, T030, T034–T036, T058, T061 |
| FR-013 | T002, T041, T043–T045, T047, T048 |
| FR-014 | T002, T023–T025, T041, T043, T044, T046–T048 |
| FR-015 | T006, T012, T013, T018, T019, T031, T042, T051 |
| FR-016 | T006, T012, T024, T030, T031, T035, T036, T039, T044, T051, T055 |
| FR-017 | T013, T014, T025, T034, T045, T050, T052–T055 |
| FR-018 | T022, T050, T052, T054, T055 |
| FR-019 | T008, T009, T015, T016, T022, T032, T034, T036, T037, T043, T050, T053, T057, T062 |
| FR-020 | T027, T028, T039, T040, T047, T049, T055, T056, T060 |
| FR-021 | T001, T021, T035, T037, T042, T051, T059, T065 |
| FR-022 | T003, T005, T007–T009, T014, T015, T037, T052, T053, T058, T059, T064, T065, T068 |
| FR-023 | T001, T004, T028, T040, T048, T049, T056–T068 |
| FR-024 | T002, T009, T023, T046, T061, T062, T066–T068 |
| SC-001 | T011, T017, T018, T020, T028, T063 |
| SC-002 | T006, T013, T018, T050, T051, T056, T063 |
| SC-003 | T029, T030, T034, T036, T040, T063 |
| SC-004 | T002, T011, T041, T048, T049, T063 |
| SC-005 | T057, T064 |
| SC-006 | T027, T028, T040, T049, T056, T060, T063 |
| SC-007 | T003, T005, T015, T050, T058, T064 |
| SC-008 | T061, T062, T066 |
