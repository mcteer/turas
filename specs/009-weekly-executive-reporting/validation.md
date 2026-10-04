# 009 Validation Record

Status: local implementation and all final-source checks are complete and recorded
below individually. Resend acceptance is explicitly deferred by the user. Hosted acceptance remains separate from development
validation. Historical continuation entries below are not current gate certificates.

## Final-source verification

Publication follow-up: the user authorized “merge once CI is green.” A dedicated
reporting CI matrix now covers deterministic tests, prior-feature regressions and
all four WebKit projects with owned disposable resources and live dispatch off.
Staging hygiene removed one trailing blank line in a test; the local source-bound
results below remain tied to their original digest, while CI must certify the
published review head. Unrelated Spec Kit/tooling edits are excluded from this PR.

Candidate source: `32fc7aaabc343f18e6a306570dcb394724ee21dbbfde73744a75d0ea6d10d735`.

| Gate | Current evidence |
| --- | --- |
| Deterministic reporting | Passed: 48 suites/160 tests, zero failures/skips |
| Actual artifacts | Passed: six pairs, 18 PDF pages/103 slides, 121 rasters; native LibreOffice text/table/chart edit-save-reopen rerun |
| Recovery | Passed: matched paired snapshot; seven suites/21 tests, no pending cases; hostedProof=false |
| Prior features 002–008 | Passed: 15 unit suites/75 tests and seven integration suites/30 tests, zero failures/skips |
| Production builds | Passed: Node-24 Eve and Next Webpack; pre-existing unsupported-directory/pg-native/dynamic-import/Temporal warnings remain |
| Four-project WebKit | Passed: 36 cases across desktop/mobile and light/dark, at this exact source |
| Representative load | Passed: required corpus, seven read/ack classes below two-second p95; 20 drafts and 12 actual pairs; quotas, overflow and fairness |
| Controlled provider delivery | Explicitly deferred by user: “Resend can come later.” Live dispatch stays off; not part of current local completion scope |

The actual artifact gate uses `local-artifacts/009/artifact-check-UfmiA5` and evidence
digest `4210d54a0b8464c25fd8254353a8115a05000557cf3fc840da9e54849244d44b`.
All raster path/digest pairs match the 121 individually inspected images from
`artifact-check-QUnvHZ`; every regenerated raster byte was rechecked. Structural
checks and native-object editing were rerun, not copied. PowerPoint remains untested.

The load attempt at prior source `009aedbd` failed during bulk fixture seeding,
before any acceptance measurement, on the application's five-second statement
timeout. Only the guarded reporting bulk-seed transaction now uses a bounded
60-second `SET LOCAL statement_timeout`. It ends at commit; production queries,
the two-second per-class p95 gate and draft/render deadlines are unchanged.

Final-source load measured maximum class p95 1,894.73 ms (history; maximum single
sample 2,014.21 ms, while the requirement is p95). Other class p95 values were
28.59/146.93/73.46/14.41/12.48/88.42 ms for list/detail/sources/policies/deliveries/
acknowledgement. Twenty draft preparations at concurrency two took at most
210.57 ms; twelve executive pairs at concurrency two took at most 2,034.72 ms,
with queue wait measured separately at at most 9,747.07 ms. The exact required
1,000-engagement/500-resource/50,000-time/20,000-delivery/5,000-history corpus,
five readers, ten warmups and 100 samples per class passed. Renderer limits remained
two CPUs/two GiB/no network per job. Draft-101 and delivery-501 queue overflow,
cross-customer fairness and scope overflow denial passed. This is local evidence.

Final-source Node-24 `npm run typecheck`, `npm run build:check`, `npm run check:docs`
(128 authored Markdown files and tracked-file hygiene) and `git diff --check`
passed. The earlier UI run completed its cases but correctly refused certification
because its source changed; the renewed source-bound four-project run passed all
36 cases. Evidence is `local-artifacts/009/ui-EVI4BT/completed.json`, with the
same final source digest above. No stale UI record was relabeled as current completion.

### T066 autonomous development handling

The latest user instruction, “Resend can come later,” explicitly defers real
Resend delivery/release acceptance. T066 remains a visible later release task,
not a blocker for completing the current local implementation/testing scope.

The user directed that T066 must not block development and asked for no additional
approval ceremony. All available brand samples were inspected, the exact-preview
brand/policy/publication/send flow was exercised through the normal domain in owned
synthetic environments, and controlled-send/release tooling is implemented and
tested. No further approval questionnaire is required for development work.

A presence-only local configuration check under Node 24 found the Resend API key,
webhook secret, sender address/ID/domain ID and recipient HMAC settings absent.
No secret values were printed, no account credentials were invented, and no real
mail or deployment was attempted. To execute the actual provider part of T066 the
environment needs those private settings, a provider-verified sending domain with
tracking disabled, and an exact synthetic test delivery from the completed normal
review flow. Fixture acceptance is not actual provider delivery. That external
acceptance portion is explicitly deferred rather than falsely marked passed.

### Implementation and handoff reconciliation

T001–T062 implementation is reconciled against the explicit reporting manifest,
the artifact gate and the story journeys. Added acceptance cases cover pending time
correction, approved replacement/reversal, accepted baseline replacement,
withdrawal before claim/after intent/after provider call, exact known-ID process-exit
reconciliation and lost-ack replay. Cleanup now minimizes decision attribution and
rationale proofs, obsolete revision author/watches, receipt results, provider IDs/
diagnostics/timestamps and expired previews; unmatched receipts have a 1,000-ID/
24-hour bound. Content-free replay/correction/suppression identities remain.

README, roadmap, decisions, template index, spec and plan were updated. Reviewable
handoff is [pr-evidence.md](pr-evidence.md), following the PR template. No commit,
push, PR publication, independent maintainer approval, merge or hosted acceptance
is claimed in this continuation.

## Latest continuation evidence

- Cache-disabled full CLI WebKit matrix passed all 36 cases across desktop/mobile
  light/dark at source digest
  `32fc7aaabc343f18e6a306570dcb394724ee21dbbfde73744a75d0ea6d10d735`.
  Private evidence: `local-artifacts/009/ui-9aV6Pn`. The strict start/end source
  check passed. This supersedes the changed-source matrix for UI behavior only;
  remaining audit minimization and download/rendered-metadata boundaries are not
  certified complete by this gate.

- Explicit `TSX_DISABLE_CACHE=1` focused CLI WebKit run emitted the current runner
  identity and passed five boundary cases at digest
  `58b058d0215c5a1c9f32bbbbcc28ffbfb4c15a3ab68fc9fbd2e08e988626ce67`.
  Evidence is `local-artifacts/009/ui-xLiM2f`. Previous runs returned old line numbers
  and omitted newly authored diagnostics. This controlled rerun points to stale
  transform execution; it does not retrospectively certify every earlier failure.
  The UI npm gate now disables the transform cache and propagates that setting to
  its children. Full cache-disabled matrix acceptance is still required. No migration
  checksum, source-digest or authorization guard was relaxed.

- Fresh foreground focused WebKit boundary run passed five desktop-light cases at
  digest `b7fa574275c46786fc2b4c152e1a2a6cf85a615260df44d5f9c33cc24b64d8fc`.
  Verified both new per-file manifests exist, cover 1,105 files, and have matching
  start/end digests. The previous reported failure lacked these manifests and used
  the older runner line; it cannot diagnose changed paths under the updated runner.
  Full matrix acceptance remains pending, not inferred from this focused pass.

- Full CLI WebKit gate passed 36 cases across desktop/mobile and light/dark
  projects, covering weekly, executive, boundaries and delivery journeys, at
  source `40e0eadf683b4884ef549e5b0a2baeab40667f8a43dce2d9941ed9d730daac9e`.
- Completed individual visual inspection of all 121 rasters (18 PDF pages and
  103 slides across six pairs), including long-continuations slides 21–40.
  No clipping, overlap or unreadable labels were observed. The source-bound
  `reports:artifacts:check -- --verify-review local-artifacts/009/artifact-check-QUnvHZ`
  gate passed for source `40e0eadf683b4884ef549e5b0a2baeab40667f8a43dce2d9941ed9d730daac9e`
  and evidence `262a00d3b9ed639e79f4d7e518119b0ba9d6b4c8f48f538848763207184cd8c5`.
  Native edit/save/reopen evidence is LibreOffice-specific; PowerPoint portability
  remains untested. This visual review does not impersonate a brand-owner decision.
- Representative local load passed at source digest
  `40e0eadf683b4884ef549e5b0a2baeab40667f8a43dce2d9941ed9d730daac9e`:
  all seven read/acknowledgement classes below 2-second p95 (maximum 1,358.84 ms),
  20 weekly preparations at concurrency two at most 182.84 ms, and 12 actual
  executive pairs at concurrency two at most 1,771.47 ms; queue wait is separately
  recorded at maximum 8,236.10 ms. Required 1,000-engagement/50,000-time/20,000-
  delivery/5,000-history corpus, arithmetic/privacy sentinels, quota/queue overflow
  and cross-customer fairness passed. No provider dispatch or hosted proof occurred.
- Supported Node-24 Eve and Next production builds passed at this source with
  existing bundler/discovery/staffing warnings. Actual six-pair generation produced
  18 PDF pages and 103 slides with structural and native edit/save/reopen receipts
  in private `local-artifacts/009/artifact-check-QUnvHZ`. Individual visual review
  has inspected all 30 rasters for monthly-multi and quarter-q3-92 with no clipping,
  overlap or illegible labels. The remaining 91 rasters are not yet certified.

- The stable-source desktop-dark CLI WebKit rerun passed all nine cases at digest
  `40e0eadf683b4884ef549e5b0a2baeab40667f8a43dce2d9941ed9d730daac9e`.
  This is a focused project pass, not the required 36-case four-project gate.
  The earlier setup/source-change failures remain superseded only for this project;
  a fresh full matrix is required before UI acceptance can be claimed.

- Owned recovery passed at digest
  `40e0eadf683b4884ef549e5b0a2baeab40667f8a43dce2d9941ed9d730daac9e`:
  matched paired snapshot and seven suites / 17 tests, including empty/038 upgrade,
  store/payload/file cleanup, missing files and subprocess-exit dispatch recovery.
  T003/T004 are reconciled against owned environment and full manifest evidence.
- Node-24 prior-feature regressions passed at the same digest: 15 unit suites /
  75 tests and seven integration suites / 30 tests, zero failures/skips. T059 is
  complete. The earlier host-Node-26 run failed pinned timezone prerequisites and
  is superseded by this supported-runtime pass; no application timezone rule changed.

- Full deterministic reporting passed at source digest
  `40e0eadf683b4884ef549e5b0a2baeab40667f8a43dce2d9941ed9d730daac9e`:
  48 suites / 151 tests, zero failures or skips. Fresh recovery, prior-feature
  regressions and full WebKit checks are running at this source; no result from
  those pending checks is claimed yet.

- Exact delivery-audit minimization passed the owned outbox suite (4 tests, zero
  failures/skips) at source digest
  `40e0eadf683b4884ef549e5b0a2baeab40667f8a43dce2d9941ed9d730daac9e`.
  After 730 days, lease/environment/scope/digest-bound cleanup clears provider IDs
  and failure diagnostics, minimizes attempt results and replaces provider event
  identifiers with content-free local tombstones. Publication/recipient/provider-key
  uniqueness and suppression links survive. Wrong environment/token/digest, direct
  audit expiry and diagnostic restoration are refused; repeated cleanup is inert.
  The worker invokes this cleanup even with new reporting disabled. Typecheck passed.
  T053 remains incomplete: other non-technical audit metadata needs reconciliation.
- The expanded audience suite passed current-session revocation across every read
  adapter and artifact download, plus unassigned-customer denials. The attempted
  full UI run failed disposable migration setup while sources changed; it is not
  accepted evidence and requires rerun. A fresh full deterministic run is underway.
- The user requested completion of development without additional approval ceremony.
  Local work continues; live mail remains disabled and unavailable T066 inputs are
  recorded separately, not inferred as authorization or marked accepted.

- The expanded 36-case WebKit run failed during disposable database migration;
  it is not accepted. Its retained failure did not include subprocess status, so
  the underlying setup cause is not yet established. Guarded setup errors now
  report only bounded process status/signal/error code, never private child output.
  A fresh schema/upgrade suite passed all four assertions at digest
  `7e4336af6d746402cc03b1bf073aa7ba33ca1bb959ac265f6d24378f9d754d63`.
  A desktop-dark UI rerun is underway to isolate setup from behavioral failures;
  this narrow schema pass does not certify the full WebKit matrix.

- Added unassigned-partner and correction-history UI journeys. All five boundary
  journeys passed in CLI desktop-light WebKit at digest
  `60ec9f6a7cc5848949100d8476240450b7227d8aad3a0b454919f66d3ebcc128`.
  Unassigned partners receive 404 across detail/history/source/delivery reads;
  unpublished correction identity and recommendation text remain absent from
  assigned-partner response bodies and UI, while internal readers see the comparison.
  Axe checks and private captures passed. Release tooling now requires 36 matrix
  cases. The previous 28-case matrix failed and is not accepted as final evidence.
  T056 remains unchecked pending full-matrix and download/rendered-metadata coverage.

- The full deterministic gate passed at digest
  `8f0e5e7334ef83b458ea478dfc234716e43ce4c45dcde704b405645796a9da4c`:
  48 suites / 150 assertions, zero failures or skips, including calculation cleanup
  and runtime-role receipt minimization. The expanded 28-case WebKit matrix is
  still running; its result is not yet claimed.

- Execution restored; the lifecycle cleanup suite passed at digest
  `1f61593b166fb06f5e762110f2eb56a260abbdbcddb7c040b9df9e4d545c0c8d`.
  Retracted revision calculations are deleted while the earlier revision survives.
- Added CLI WebKit grant-revocation and retention-expiry journeys. The first run
  exposed receipt selection using a row lock that required forbidden runtime update
  privileges; selection now relies on immutable receipt identity and exact leased
  cleanup jobs instead. The cleanup regression explicitly runs under turas_runtime
  and passes. Focused desktop-light WebKit passed all three boundary journeys at
  `f0a71d5c0b1fb9c4112e72244ca54b13832f548ec69ea92c829cfda828958467`,
  including axe, revoked detail/history/source denial and expiry content removal.
  The domain expiry is checked independently; UI receives the intentional generic
  withheld projection. The full UI matrix now requires 28 cases. T056 remains
  unchecked: unassigned-partner/correction and artifact metadata coverage still need
  reconciliation. No complete UI acceptance is inferred from this focused pass.

- Calculation payload cleanup now passes the focused withdrawal/expiry suite at
  digest `15eb8625ff7ebc06f241e7a9dc4506c2793dcd44a526cfed763f635fa0d5ee78`.
  The test first failed with retained calculation rows. Exact leased cleanup now
  removes inputs/results only for the bound revision, digest, environment and
  current generation; stale causes and unrelated revisions preserve calculations.
  Calculation updates/direct deletes remain immutable outside the privileged
  exact cleanup path. Migration 041 checksum is now
  `b88ec8ba9b6da7dfaca417b40c061f069ca2be5938e2a862b698d80efad809b4`.
  The full deterministic gate is rerunning; T053 remains incomplete.

- The fresh full deterministic gate passed at source digest
  `407622e50fd266dab8ead9e31f14a80a4c04a09d3b32deba533313b181aabf66`:
  48 suites / 150 assertions, zero failures or skips. This includes the receipt
  audit minimization, privilege and expired-replay regression. Typecheck, docs
  (127 authored Markdown files) and diff checks also passed. Other audit metadata
  minimization and final-source UI/artifact/load/recovery acceptance remain pending;
  this result does not complete T053 or feature 009.

- The 730-day receipt minimization/replay regression passed at digest
  `407622e50fd266dab8ead9e31f14a80a4c04a09d3b32deba533313b181aabf66`.
  Exact leased cleanup replaces expired receipt action/result data with a technical
  tombstone; identity, namespace and canonical input digest remain immutable.
  Wrong environment, lease and digest cannot authorize cleanup. Direct owner
  mutation and runtime-role updates are refused. Repeated cleanup is idempotent,
  and both receipt lookup and command replay refuse expired results without invoking
  the mutation or projection. Typecheck passed before the added privilege assertions;
  the fresh full deterministic gate is running. T053 remains unchecked because
  receipt minimization alone does not purge other non-technical audit metadata.
  Migration 041 checksum is now
  `9076dfeebc8dc9e1a8bbf6787a3ae196baaf5d1b153127d43a74ed50b5e1ae2a`;
  only owned disposable databases have received this revised unmerged migration.

- The fresh full `reports-load` gate passed at source digest
  `104d05fec442b90a7a3fa37167a76fb1b4eecedc0496a1dc365a1585bbd88991`,
  matching the 46-suite deterministic pass. All seven classes remained below
  2-second p95; the slowest was history at 1,342.89 ms. Twenty weekly preparations
  at concurrency two took at most 169.56 ms; 12 actual executive pairs at concurrency
  two took at most 1,697.10 ms, with maximum queue time 7,832.67 ms recorded separately.
  Draft job 101, delivery intent 501 and preparation 21 were rejected; cross-customer
  progress, selected-scope overflow, arithmetic/privacy sentinels and exact validated
  file reads passed. The earlier changed-source load run is superseded by this pass.

- `npm run test:reports` passed all 46 suites / 148 assertions, zero failures/skips,
  at source digest
  `104d05fec442b90a7a3fa37167a76fb1b4eecedc0496a1dc365a1585bbd88991`.
  The withdrawal cleanup regression now explicitly checks three payloads, including
  review rationale, and verifies a stale cause preserves that rationale. The earlier
  full-suite count mismatch is superseded by this completed pass. The concurrent
  load run rejected changed-source evidence rather than a behavioral failure and
  is rerunning; its earlier measurements are not a current-source acceptance gate.

- The latest `npm run build:check` passed both Eve and Next production builds
  after the decision-rationale cleanup changes. Existing Eve bundler/discovery
  and staffing createRequire warnings remain visible; no hosted behavior is
  inferred. Fresh deterministic, WebKit and load runs are still pending.

- The user resolved the audit-horizon/lineage ambiguity on 2026-10-04 by selecting
  technical tombstones. Spec/data-model/C12/plan now identify `report-retention-v2`:
  purge non-technical audit metadata after 730 days, retaining only content-free
  technical identities/links for replay protection and correction lineage. Full
  audit minimization remains T053, explicitly unchecked; no retention exclusion
  or complete cleanup acceptance is inferred from this clarification.
- A new rationale-expiry test exposed decision payloads not being queued for
  deletion. Disabled-feature cleanup now selects exact expired decision payloads
  and queues rationale cleanup on exact revision withdrawal. The focused outbox
  suite passed 3 assertions at digest
  `b93861079033acbb46c7d3f8c1c1a089c5e3a7ed3952355a5b4334f82f86a64a`,
  verifying rationale bytes are removed while approval/delivered identities survive.

- Fresh `npm run test:reports` passed all 46 suites / 147 assertions with zero
  failures or skips at source digest
  `6f776153e57789d0d2742756f984af7d490cd98de0cc878e231ffc69083ea7c8`.
  `npm run reports:recovery:check -- --disposable` passed the matched paired snapshot
  and seven explicit suites / 15 assertions at that same digest. This includes
  empty/038 upgrades, scoped runtime denial, stale jobs, exact store/orphan/scratch
  cleanup, missing approved files, disabled recipient/request cleanup and actual
  process exit after simulated provider acceptance. All resources were owned and
  disposable; hosted/provider-live behavior is not inferred.
  T058 is complete. T061/T062 implementation and refusal/evidence-validator tests
  are complete, but their actual controlled-release acceptance remains T066 and
  has not occurred. Full remaining lifecycle/audience/retention tasks are unchecked.

- Controlled-delivery tooling is now implemented and tested without a live call.
  It requires --live/--synthetic-test and exact delivery/request/recipient identities,
  refuses fixture mode, claims only that first attempt and never replaces or retries
  an interrupted send. Known provider IDs permit read-only evidence lookup; actual
  delivery is required, not acceptance. Parser and exact-claim/process-exit cases pass.
  Running the command without opt-in arguments refused with exit 1 before any send.
- Release aggregation now requires explicit current private completion records and
  refuses missing, stale, duplicate, partial, mock-live and acceptance-only evidence.
  It rechecks live provider evidence and current store/font/brand/sender/worker
  readiness; it never sends or deploys. Focused evidence-validator tests pass.
  Real credentials and actual operator approvals remain unavailable; T066 is pending.
- The new governed audience matrix caught unpublished history returning an empty
  success to an assigned partner. History now checks actual publication eligibility,
  and the focused matrix passes across detail/list/history/sources, management,
  draft file download, grant revocation and membership/session invalidation.
- A missing-exact-artifact test failed because publication checked only catalog
  metadata. Publication preview and decision now read/hash both finalized validated
  executive files; the passing regression verifies missing bytes block both paths
  and leave no publication or command receipt. The full recovery runner now combines
  paired snapshot restoration with seven explicit behavioral suites. Fresh full
  deterministic/recovery runs are underway; these results are not yet claimed.

- Full local representative load gate passed at digest
  `75839c1ac29cef3e47c9949f0401ebdf50e2b49e11b61e7a1f6425b164ccf285`
  using `npm run benchmark:reports -- --disposable`. Baseline corpus: exactly
  1,000 engagements, 500 resources, 50,000 time revisions, 20,000 delivery
  revisions and 5,000 report histories. After 10 warmups, 100 samples/class
  at five concurrent requests yielded p95 ms: list 5.93, detail 45.53,
  history 719.26, sources 40.00, policies 4.06, deliveries 4.44, review
  acknowledgement 42.74. Policy/delivery reads cover one canonical mcteer and
  four contributors with intentionally restricted projections; acknowledgement
  concurrency uses current mcteer authority, not fabricated approver identities.
  Independent approved-minute and private-note sentinels passed.
  Twenty weekly preparations at concurrency two finished in at most 89.94 ms;
  12 actual monthly/quarterly PDF/PPTX pairs at concurrency two finished in at
  most 1,121.14 ms, with maximum queue time separately recorded as 5,179.93 ms.
  Exact file/digest/validation checks passed under 2 CPU/2 GiB/network-none jobs.
  Fixture-only setup quotas are cleared before separate measured phases; actual
  production limits remain enforced: preparation 21, draft job 101 and delivery
  intent 501 are refused. Selected record overflow returns scope_too_large.
  A failing fairness test exposed first-customer backlog draining; customer-ranked
  claims now give the second customer progress, and the focused job suite passes.
  Bulk historical/overflow/queue rows are marked load, not approval/send evidence.
  Brand/publication/send-intent setup used actual reviewed synthetic samples and
  the normal domain flow. No provider dispatch occurred. T057 is complete;
  T064 still requires the complete recovery gate as well as a final-source rerun.

- At stabilized source digest
  `683613d923b523dc5b1697205dcd712256d8b487bc549436adc33b69ab38ebd7`,
  `npm run build:check` passed both Eve and Next production compilation;
  `npm run reports:recovery:check -- --disposable` passed matched snapshots;
  `npm run test:reports:regressions` passed 15 unit suites/75 assertions and
  7 integration suites/30 assertions. Docs (127 authored Markdown files) and
  `git diff --check` passed. The full 42-suite deterministic reporting gate
  passed at this same digest. The fresh four-project CLI WebKit gate also passed
  all 20 cases across desktop/mobile and light/dark at this same digest, with
  zero skipped cases or retries. This does not complete the outstanding broader
  acceptance scenarios or external release prerequisites.
- Complete acceptance is blocked by unavailable live release prerequisites:
  actual brand-sample approval, configured verified sender/domain, private
  Resend API/webhook credentials, configured report store/renderer/HMAC key,
  and an explicitly authorized exact synthetic test recipient/publication.
  No blanket send permission is inferred. T066 remains pending. Local unfinished
  load, retention/audience/recovery and release-tooling tasks also remain unchecked;
  this blocker does not certify those tasks or any complete feature acceptance.

- Representative reader-layer benchmark passed at source digest
  `683613d923b523dc5b1697205dcd712256d8b487bc549436adc33b69ab38ebd7`:
  exactly 1,000 engagements, 500 resources, 50,000 time revisions, 20,000 delivery
  revisions and 5,000 report histories; 10 warmups and 100 samples per class at
  five concurrent readers. p95 milliseconds: list 6.91, detail 46.66, history
  729.72, sources 41.73. Independent five-minute approved-effort and private-note
  sentinels passed. Initial history runs exceeded 2 seconds; transaction-local
  deduplication of exact revision release checks resolved that failure without
  caching authorization across requests. The governed history suite and typecheck
  passed again at the same digest; T054 is reconciled as complete.
  This is explicitly the reader layer, not complete SC-005: policy/delivery reads,
  review acknowledgements, preparation/render and capacity/fairness remain pending.
- The latest UI run finished its cases without a behavioral failure but rejected
  its final evidence because sources changed during execution. It is not a passing
  source-bound gate; rerun against stabilized sources is required.

- The full deterministic gate passed 41 suites at source digest
  `d05dc1d3faa2bff287229d14e408e383a06ef533d2c5af0eb89bb2e1d4da04bf`
  after aligning the empty snapshot assertion with the specified “no validated
  update available” wording. Typecheck, docs and diff checks also passed.
- A new real subprocess-exit test passed at source digest
  `a0d6b732534ada4c0ecef24d799f089f60281cbc4513a8f4befa09dc55e417d7`.
  Two concurrent workers claimed distinct recipients. One provider-boundary
  simulation succeeded; the other process exited after recording simulated
  acceptance, before response settlement. Advancing its owned fixture beyond
  the 23-hour boundary preserved uncertainty, rejected the stale dispatch and
  made no further provider call across repeated claims. This is actual local
  process-exit evidence with fake provider transport, not live-provider proof.
  The complete reporting manifest now contains 42 suites.

- Focused cleanup now additionally passes expired staged-object and old marked
  render-scratch reconciliation. Unrelated objects and foreign-environment scratch
  survive; reporting remains disabled during this part of the test.
- Profile-admission watch propagation passes a database-state assertion: hidden and
  pending profiles leave delivery revisions current, while an approved delivery
  profile marks review required even without a retrieval index.
- Correction comparison/history has passing pure and governed integration checks.
  It returns changed authorized section/measure labels, never protected prose, and
  suppresses comparisons whose predecessor is unavailable. Partners do not receive
  unpublished correction IDs or recommendation text.
- The paired-snapshot recovery script passed actual database snapshot restoration
  to an independently owned target with exact report/upload/workflow byte digests.
  This is one recovery layer, not the remaining supervisor/crash/uncertainty drill.
- Prior-feature regressions expanded successfully to 15 unit suites (75 assertions)
  plus 7 integration suites (30 assertions). Production `npm run build:check` passed
  with the explicit Webpack compiler and existing warnings recorded above.
- Current local configuration has none of the required report sender/domain IDs,
  provider API/webhook keys, report HMAC key, store root or renderer image configured.
  Values were not printed. Real brand/sender/test-recipient approval and SC-008 live
  delivery evidence remain external prerequisites, not fixture-derived acceptance.
  No live provider call, application migration, deployment or send was performed.
- Fresh full deterministic (41 suites) and four-project UI gates are running after
  the latest changes. Prior source-bound evidence is historical until those finish.

- The documented Webpack production compiler passed after removing the shared
  browser contract's Node-only crypto import. `build:web:check` now explicitly uses
  Webpack; Turbopack development remains unchanged. Trace exclusions keep private
  artifacts, environment files and Eve workflow data out of production traces.
  Existing staffing `createRequire` compilation warnings remain visible.
- The new recipient/request retention regression exposed unreachable SQL branches
  nested beneath decision cleanup. They are now independent branches; the focused
  outbox suite passes and confirms delivered audit status survives payload expiry.
- `node --import tsx scripts/test-reports-regressions.ts` passed 15 explicit
  prior-feature unit suites / 75 assertions at digest
  `54a48f16cc5b239609bda1bd010abd36d1b5f5018d2d11c5781d03f3a396543b`.
  This is the unit regression layer only, not integration/recovery acceptance.
  The full reporting manifest now contains 39 suites and is being rerun.

- Production build remains failing: Eve compilation passed, but Turbopack traced
  ignored `local-artifacts/009/qa-venv/bin/python`, whose symlink leaves its root.
  Narrowing report brand reads to validated template/renderer directories removed
  the brand-module trigger; the subsequent failure originates in existing staffing
  store tracing. Private artifacts were preserved. This is an unresolved local
  build gate, not evidence of hosted readiness. Focused brand-binding tests passed
  at `371bc26e04029511c2f48911399649dbf6809e0146cb4aa781ff348ef1ec8cab`;
  prior full/UI/artifact digests are historical after this source change.

- A subsequent focused cleanup regression passed at source digest
  `f4bab3a22c1bdca0852360c4ca1a4d327ea36905d17d853d9f5cbd916883af00`.
  It now proves withdrawal prevents the next download chunk, stale generation
  causes preserve exact file bytes, current cleanup removes the targeted files
  with reporting disabled, and an unrelated object survives. The full deterministic
  suite subsequently passed all 38 suites at this digest; the prior full gate remains
  historical evidence for its recorded digest.

- `npm run test:reports` passed all 38 registered suites, with final source digest
  `e63212ead9e60b64898722a4c75aad330223a2b296511b720cf778507623b326`.
  This is a complete deterministic run, not the earlier interrupted remote run.
- The runners now provision uniquely owned local Postgres containers and per-suite
  clones; UI apps use a disposable narrowly granted runtime login. No application
  database was migrated. Source digests invalidate this evidence after code changes.
- The focused WebKit desktop-light weekly suite passed both real browser journeys:
  empty draft preparation and exact reviewed correction publication. Earlier focused
  runs also passed partner withdrawal, policy/schedule pause and actual PDF/PPTX
  downloads. The complete four-project run subsequently passed all 20 cases across
  desktop/mobile and light/dark WebKit at source digest
  `e63212ead9e60b64898722a4c75aad330223a2b296511b720cf778507623b326`.
- `npm run reports:artifacts:check` produced six actual artifact pairs, 18 PDF pages
  and 103 slides, with structural/font and LibreOffice edit/save/reopen checks.
  Private evidence: `local-artifacts/009/artifact-check-zKRP3q/`;
  evidence digest `ff12f753dece202b695df9c2b0f80b2731ccd0ba57cbf7ea85aa0fe1d34a12bd`.
  All 121 page/slide rasters were inspected in per-case contact sheets, with the
  long-continuation slide 17 and dense PDF page 8 additionally inspected at full
  size. No clipping/overlap was observed; native text/table/chart edit-save-reopen
  receipts passed. `npm run reports:artifacts:check -- --verify-review
  local-artifacts/009/artifact-check-zKRP3q` passed at the same source digest.
  This does not constitute maintainer brand approval; PowerPoint is untested.
- `npm run typecheck` passed at this source. New lifecycle coverage proves hidden
  and pending work does not alter a delivery report, eligible accepted work requires
  review, and exact activity retraction withholds its revision and queues cleanup.
- Broader source-kind/download/cleanup races, retention audit/scratch cleanup,
  representative load, recovery, prior-feature regressions, build and final release
  aggregation remain unfinished. No actual brand approval or live email occurred.
  `TURAS_REPORT_DELIVERY_ENABLED` defaults off separately from report preparation.

## Baseline

- Planning commit: `620fa8e`; main dependency: `8a8b079` (008 merged).
- Migration manifest ends at 038; new migrations are explicit and disposable-first.
- Node 24.21.0 selected through `/opt/homebrew/opt/node@24/bin`.
- Root agent model remains `spacexai/grok-4.7`, reasoning low. Reporting makes no new model calls.
- Specification checklist: 16/16 passing; no extension hooks configured.
- Read installed Eve README, schedules/outbox patterns and Next route-handler guide, constitution, README/CONTRIBUTING and 009 design/contracts.
- Existing ignore rules cover dependencies, builds, secrets and private outputs; no npm publication is planned.
- Existing application, Preview/Production databases, artifact stores and Eve workflow data are preserved.

## Task Evidence

- T001: baseline and applicable installed documentation reviewed; runtime checks remain unrun.

## Acceptance Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| A Domain/weekly | Pending | — |
| B Audience/policy | Pending | — |
| C Durable delivery | Pending | — |
| D Actual artifacts | Pending | — |
| E Representative load | Pending | — |
| F CLI WebKit | Pending | — |
| G Upgrade/recovery | Pending | — |
| H Controlled real release | Pending | Brand approval, verified sender and authorized test recipient required |

Hosted worker/storage/delivery readiness is not established by local checks.

### T002 — Renderer feasibility

Pinned PptxGenJS 4.0.1 (MIT), Resend 6.32.0 (MIT), Geist 1.7.2
(SIL Open Font License; preserved license and SHA-256 manifest). Scoped
`image-size` override 2.0.4 removes the newly introduced vulnerable parser;
the isolated renderer dependency audit reports zero vulnerabilities. Existing
application dependency findings are outside this renderer change.

Base image: `mcr.microsoft.com/playwright@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`.
Built local image manifest: `sha256:abce9b91cc33e0e8c2bf358bd712c518d8752ca86cc4977dcb03842d2674176c`.
The synthetic spike ran with network disabled, read-only root, dropped capabilities,
no-new-privileges, 2 CPUs, 2 GiB and bounded temporary storage/processes.

Actual PDF text extraction preserved the title, table values and source footer;
`pdffonts` confirmed embedded, Unicode Geist Regular/Bold subsets. Actual native
slide text, table cell and chart values were edited through LibreOffice UNO,
saved as PPTX, reopened and verified; edited output rendered to PDF. Both
rasterized outputs were visually inspected: readable text, labels and complete
objects, with no clipping. Evidence is in ignored `local-artifacts/009/renderer-spike/`.
This proves the selected stack's feasibility in LibreOffice, not PowerPoint
portability or complete report acceptance. PPTX editing requires installed Geist.

### Test scaffolding progress

The owned 009 environment initialized an empty marked clone explicitly at schema
038, verified its unique database name and ownership comment, then cleaned up the
owned database/tree. Application database, existing artifact root and Eve state
were preserved. The runner's initial manifest test passes (3 assertions); it rejects
omitted/duplicate suites and skipped/empty/failed results. Foundational schema,
policy and transport tests were added before implementation and observed failing
against absent report schema/modules. They remain pending until the foundation passes.

### Foundation checks to date

`npm run test:reports` passed six registered suites (schema upgrade/grants plus
strict transport/actor/calendar/digest/manifest checks). Additional private-store
checks passed: wrong namespace markers, upload-root reuse, traversal, changed digest
and exact read/delete behavior. Durable job tests passed lease replacement/stale
completion, retry delay and revoked-membership cancellation using real database
transactions. The calendar tests include both 92-day quarter shapes, DST, leap days,
partial current periods and future-period rejection. TypeScript check passed.

These are intermediate checks. Full audience/source lifecycle, concurrency,
renderer, UI, load, recovery and real-send gates remain pending.

### Governed source integration progress

A real 006 planning review and 008 setup/record review fixture passed through the
report-specific selector and composer. The delivery audience returned only its
accepted record (no internal or pending prose/counts), while the internal leadership
projection included its accepted internal record. Email escaped accepted script-like
markup. A separate real baseline fixture produced all eight weekly sections with
truthful empty/missing quantity states and no internal membership/baseline IDs in
external document content. Publication, corrections and release races remain pending.

Bundled Vercel logo bytes were retrieved unchanged from the official brand archive;
provenance and per-file hashes are checked. The profile remains **draft**: no live
brand approval or corporate presentation master is asserted.

The persisted weekly revision test passed: exact dependency/calculation/mail identities
are stored, validation produces a receipt, and publication remains blocked while
the actual brand profile is unapproved. No approval was synthesized in a live
configuration. New report integration suites are routed through the owned 009
runner rather than the older generic selected-database runners.

Retention expiry is held in mutable revision-state metadata, separate from immutable
content rows. This allows publication to establish the 365-day retention deadline
without modifying approved document or mail bytes. Release checks use that exact
state deadline and return withheld metadata when a payload has been purged.
The 039–041 migration files remain new, unapplied application migrations; only owned
fixtures have been initialized/upgraded while implementation is in progress.

The real HTTP test passed using issued session tokens and CSRF checks: exact prepare
replay returns the original revision; panel can read the draft; partners cannot read
or list it; panel cannot open publication review; another actor cannot read the
receipt; malformed duplicate queries and missing CSRF are rejected; session
revocation blocks receipt replay. Further publication and delivery matrices remain
pending. Current TypeScript checks pass.

### Recipient policy and draft scheduling progress

The provider boundary passed 14 controlled-fetch tests. It uses the pinned Resend
SDK with the official API endpoint, one fetch, a 15-second abort signal and no raw
provider-error logging. Tests cover exact frozen request bytes/key, one recipient,
inline attachment bytes, permanent rejection, rate-limit advice bounded to one hour,
ambiguous responses and lost acknowledgement. Read-only domain verification requires
matching sender domain, verified sending, and explicitly disabled open/click tracking.
Provider configuration evidence comes from the installed SDK and [Resend's official
tracking documentation](https://resend.com/blog/open-and-click-tracking) and
[idempotency documentation](https://resend.com/changelog/idempotency-keys).
These controlled tests did not contact Resend or send email.

An owned-clone integration test passed exact recipient-policy approval, panel-user
denial, stale version rejection, pause, and stable recipient identity when an active
HMAC key is rotated while retaining its predecessor. Key removal/migration, complete
policy HTTP/UI coverage and send authorization remain pending.

Ten schedule-calendar checks passed gap resolution at the first valid instant,
earlier-only repeated time, local-time stability across DST, and latest-week recovery.
An owned-clone schedule integration test passed: a draft policy cannot schedule;
approved recovery records four missed weeks and queues one latest complete-week
draft; a duplicate tick queues nothing; no delivery is created. Schedule mutation
API/UI, worker execution and full recovery/race matrices remain pending.

Thirteen pure delivery-state tests passed the strict 23-hour recovery boundary,
three-attempt limit, missing-history quarantine rules, bounded delay calculation,
and order-independent acceptance/delivery/bounce/complaint projection. The actual
persisted outbox, webhook and reconciliation consumers are still pending.

Private-store and job checks passed five tests after the storage change, including
multiple immutable object writes, exact-digest deletion, traversal/namespace denial,
symlink files/directories, stale leases and revoked job authority. Static OpenType
coverage tests passed for both bundled Geist fonts; unsupported glyphs and hidden
control characters block validation/release rather than silently using fallback.
The font parser reads Unicode cmap tables from the hashed bundled files. These checks
do not replace the pending actual-render, all-page/slide and office-edit gates.

### Scope, Recipient Lifecycle, and Executive Artifact Progress

T011 passed 16 focused period/schema/contract checks and the owned database scope
integration case. The latter creates and accepts a real 003 workload, rejects
pending and wrong-scope records, requires explicit inclusion of customer-level
engagements, and denies the old scope dependency after governed retraction. Scope
identity uses accepted workload metadata without exposing private workload purpose
text or requiring model-backed retrieval indexing. A workload identity cannot be
reused as an audience-approved profile fact.

Owned recipient-policy checks now reject removal of a retained identity key and
reuse of its key ID with different bytes. Rotation retains the canonical recipient
identity. The owned schedule lifecycle check also passed pause while reporting is
disabled, exact command replay/receipt, job cancellation, refusal to resume while
disabled, and authorized resume after re-enabling. These are local checks, not
provider or hosted deployment evidence.

Six actual synthetic executive pairs passed nine isolated artifact integration
cases, including all fixture renders, native Office text/table/chart edits saved
and reopened, unsupported-glyph rejection, excessive-layout rejection, and changed
artifact bytes. LibreOffice exports contain only embedded Geist Regular/Bold.
PowerPoint portability remains untested. An early visual check found the white
logo variant on white pages and paragraph spacing colliding with a slide footer;
both were corrected. The official unchanged black logo is now sourced from
`Vercel/logotype/light/vercel-logotype-light.{svg,png}` in the same official archive.
Four layout tests include the spacing regression and explicit overflow rejection.

Final all-image/source-bound artifact review, persisted publication validation,
brand sample approval, consumer download fencing and Gates A–H remain pending.
No actual email has been sent, no application database was migrated, and no hosted
behavior is claimed.

### Governed Executive Workflow Progress

The interim artifact review inspected every raster image: 18 PDF pages and 103
slides across six actual synthetic fixture pairs. Source-bound verification passed
for source `b0b23b714253db8a217aedc320be2d2419617dd4e2c504d121fcbe705cb6b07f`
and evidence `78ceb931e986d2c583ba0a81df9b18fa83fa6fc8bffc799fb10b23b392dd0049`.
Later implementation changes make that historical evidence unsuitable as the final
release gate; the final run must regenerate and review current evidence.

Four executive composition checks passed explicit maturity/adoption semantics,
required sections, correction/partial identity, unknown values and separation of
reviewer annotations. An owned profile-input/weekly integration run passed original
accepted delivery inputs, internal audience union, pending exclusion, customer-level
scope exclusion and rejection after governed withdrawal. Accepted maturity is never
inferred from engagement stage, planned product use remains a proposal, and private
assessor metadata is absent from report content.

Two owned render-job cases passed persisted authority, exact input/file validation,
private-store promotion and authorized download, plus stale-lease refusal before
protected payload reads. A further actual brand review/publication case passed:
validated weekly/monthly/quarterly samples are required; panel cannot approve;
incomplete samples and unapproved publication are denied; exact mcteer approval and
command replay permit publication. Renderer image and renderer code now contribute
to the immutable versioned brand profile, so changing them requires a new review.
Controlled domain tests do not approve the real application's brand or send email.

### Reboot Resume — Outbox Transaction Boundary

Resumed feature 009 from the preserved working tree; feature 008 is already merged.
The initial full reporting run timed out after recording 30 suite results and is
not a completed gate. A subsequent background run began before the outbox change;
its source-binding check cannot establish final-source acceptance if code changes
during that run.

The provider POST now runs outside database transactions. Preparation verifies the
persisted dispatch intent and exact private request bytes; settlement fences the
attempt and records the outcome in a separate transaction. Concurrent signed
delivery evidence is folded after settlement so acknowledgement cannot downgrade
delivery. The owned disposable `report-send-outbox.test.ts` check passed, including
receipt projection completing while the provider request remains in flight, exact
command replay, one logical dispatch identity and refusal to redispatch a settled
claim. Typecheck passed. The transport was controlled; no real email was sent.
Full delivery races, source lifecycle and acceptance Gates A–H remain pending.

### Exact Revision Cleanup Progress

Added lease/generation/digest-bound revision and mail payload cleanup, queued in
the publication-withdrawal transaction and run by the worker even when new report
work is disabled. Expired payloads are marked ineligible before exact deletion;
immutable publication audit remains. The new cleanup regression first failed
against the missing module, then passed on an owned disposable clone. It proves
stale-generation refusal, disabled-feature cleanup, retention expiry and preservation
of an unrelated newer revision. A combined two-suite check against one clone hit
the real generation rate limit; rerunning cleanup in its own clone passed, matching
the full runner's per-suite isolation. This does not complete T053: file, recipient,
delivery and audit cleanup plus source-invalidation propagation remain pending.

The raw signed-webhook limit now matches the 256 KiB delivery contract, rather
than the 128 KiB ordinary command limit. A new above-command-limit receipt test
failed before the change, then all four webhook tests passed; extra provider
metadata is discarded. The report-suite manifest checks also passed (three tests),
with the new cleanup suite registered. Final source-bound suite evidence is pending.
