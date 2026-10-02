# 007 implementation and validation evidence

Implementation started 2026-09-30 on `007-skills-staffing`, based on
`ef145a9b133dce49cd63eb18010b5dabec1ac1af`. The starting working tree contained
uncommitted 007 planning artifacts and README/ROADMAP planning updates; preserved.

## Environment boundaries

Production is live and excluded from all connections and mutations. Preview was
last verified at schema 031 during 006; no 007 inspection or upgrade has run.
Destructive tests use the separately marked test source and owned disposable clones
through the 007 wrapper around `scripts/plan-eval-environment.ts`. Every clone owns
its database, workforce/artifact stores, app ports, worker state and eve workflow
data. Credentials and private outputs remain outside this record and Git.

Canonical `mcteer` alone has staffing-manager and finance authority; delegation is
deferred. The existing model remains `spacexai/grok-4.7`, reasoning `low`.
The shell initially selects Node 26.8.2; project checks will use the installed
Node 24.21.0 at `/opt/homebrew/opt/node@24/bin/node`.

## Starting checks

- `git status --short --branch`: branch `007-skills-staffing`; README/ROADMAP
  modifications and untracked 007 documents only.
- `SPECIFY_FEATURE_DIRECTORY=specs/007-skills-staffing
  .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`:
  selected the intended feature and found all design artifacts.
- Read-only checklist scan: `requirements.md` 16 total, 16 checked, 0 unchecked.
  This is specification quality, not implementation evidence.
- No `.specify/extensions.yml` exists; no before/after hooks are registered.
- Existing Git/Docker ignore rules cover secrets, private artifacts, dependencies,
  generated output and local runtime state. No package publishing, lint, formatting,
  Terraform or Helm configuration requires another ignore file.

## Planned check sequence

1. Environment guard/ownership tests; empty and schema-031 disposable upgrades,
   immutable/runtime-role checks and current authority/envelope tests.
2. Focused US1–US5 domain, real-parser, HTTP, native transport and CLI WebKit checks.
3. Complete synthetic trusted-context journey, source/acceptance/lifecycle races,
   exact arithmetic, full four-project WebKit, representative performance and
   paired recovery.
4. Eight bounded actual-output advisory cases and digest-bound human output review.
5. Complete staffing and affected 002–006 regressions, typecheck, builds, docs and
   diff checks, followed by CI against the actual review head.
6. Only after disposable gates pass: fresh read-only Preview inspection, explicit
   upgrade/roles, reinspection and non-destructive local health/readiness smoke.

No runtime gate has passed at initialization. Record actual commands, owned target
markers, code state, counts, failures/fixes, timings, live usage/rubric and cleanup
proof below as checks run. Unavailable/failed gates stay incomplete; focused checks
cannot replace the complete feature gates.

## Setup checkpoint — T001–T004

Code state: uncommitted environment wrapper, runner/CI, synthetic fixtures and
evidence log additions on the baseline above. No migrations have been added yet.

- Node 24 owned-wrapper invocation running
  `vitest run tests/integration/staffing-environment.test.ts --reporter=verbose
  --silent=true`: **3/3 passed**, including rejected non-owned identities, retained
  foreign store content and a failed callback's nested-clone cleanup. The selected
  database/workforce configuration was restored; the nested database and store were
  absent afterward; outer owned cleanup completed. Target names used
  `turas_test_007_eval_<owned suffix>` with the separately marked test environment.
  Test duration 12.69 seconds; no Preview or Production data was queried.
- An earlier invocation's output was not retained; no result is claimed for it.
  The recorded result is the completed rerun above.
- Node 24 `vitest run tests/unit/staffing-test-manifest.test.ts --reporter=verbose`:
  **1/1 passed**. Missing, orphaned and duplicate entries fail before DB work.
  The runner declares all 27 planned unit/contract/integration suites and intentionally
  refuses a full run while future suites are still missing.
- Node 24 `node_modules/typescript/bin/tsc`: passed after correcting the trusted
  journey builder to parse the existing plan fixture through its strict schema.
  Fixtures contain synthetic data and no inserted approval state. The trusted
  baseline helper requires an actual reviewed-artifact callback and uses existing
  003/005 review/publication and 006 acceptance APIs. The complete journey remains
  a later unrun gate.
- `npm run check:docs`: **101 authored Markdown files passed**.
- `git diff --check`: passed.

T001–T004 are setup completion only. Schema/authority, import, staffing, native
advisory, complete journey/UI/live/load/recovery and Preview gates remain open.

## Foundation development — T005–T013

Added explicit 032–034 migrations, strict envelopes, canonical current authority,
feature-local readiness, scoped ID-only receipts, admission limits and thin receipt
HTTP handling. Existing 001–031 migration identities remain unchanged.

- Initial schema/policy import check failed before tests ran because the planned
  domain modules did not yet exist. No runtime success was inferred.
- Node 24 owned-clone run of schema, policy and strict-contract suites:
  **13/13 passed in three files**, 50.39 seconds. Empty schema-034 initialization
  and a disposable schema-031 upgrade both passed; the prior migration ledger was
  unchanged. Current singleton authority, cross-scope denial and readiness/disable
  checks passed. Outer owned cleanup completed.
- After adding immutable binding guards and command concurrency checks, the next
  owned run was **18 passed, 1 failed** in four files, 63.76 seconds. All four
  command tests passed, including concurrent identical creates yielding one
  resource/receipt, changed-input conflict, revoked replay, private-result rollback
  and exact five-import admission. The schema test's attempted `SET ROLE` failed:
  this test owner cannot assume `turas_runtime`. No cluster-wide role grant was
  added. The test now executes immutable-history rejection as the owner and
  separately checks PostgreSQL's actual runtime privilege catalog for payload
  deletion denial; it does not claim a runtime-login execution check.
- Further schema hardening binds source/import/resource/competency identities,
  prevents mutation of exact preview inputs and rejects retroactive or mutable past
  allocation ledger rows using the persisted resource-local timezone. Purge now
  retains a newer generation's intent filename.
- The runner now has a fixed `--foundation` subset for T013; arbitrary database or
  test-path overrides remain rejected. The complete manifest declares 28 suites and
  still fails if any planned suite is missing. Foundation rerun is in progress;
  no task completion is inferred from that pending run.
- Node 24 TypeScript check after command/receipt route additions: passed.

Preview remains schema 031 as last known; no 007 Preview or Production connection
has occurred. Story and final feature gates remain open.

- Fixed `scripts/test-staffing.ts --foundation` under Node 24 on an owned 007
  clone: **6 files, 23/23 passed**, 77.60 seconds. This includes empty/031 upgrades,
  immutable-history execution, runtime privilege inspection, four domain command
  cases, five current-authority cases, five envelope cases, three ownership cases
  and the manifest gate. The runner exited 0 after owned cleanup. T005–T011 and
  T013 are complete on this evidence. A receipt HTTP test added while Vitest was
  already running was not included in this count; T012 remains unchecked pending
  its actual execution. Complete story/final gates remain unchecked.

## US1 registry and structured import development

- Owned-clone focused `staffing-command-api` and `staffing-projections` run:
  **2 files, 8/8 passed**, 27.90 seconds; outer cleanup completed. Authenticated
  receipt HTTP succeeds with no-store and returns no IDs after revocation.
  Registry tests cover inactive identity uniqueness, identity reassignment denial,
  stale exact revisions, mcteer-only mutations, explicit dated partner eligibility
  and immutable skill keys/versioned retirement. T012 and T016 are complete.
  The projections suite will gain actual read/privacy cases under T023.
- Strict import contract vectors: **4/4 passed**, 98 milliseconds, covering unsafe
  filenames/type/size claims, manual evidence/date bounds, explicit unique mapping
  rows/columns and exact bounded bulk review. Actual streamed upload enforcement is
  still unbuilt; T017 remains open.
- Structured parser tests initially failed **5/5** because the new entry point did
  not exist. After implementation, **4 passed, 1 failed**: the 50,004-cell CSV
  exposed a too-small whole-manifest cap. The parser now uses the existing isolated
  container's 50 MiB output bound; publication must store bounded manifest metadata
  separately from each located cell payload. No partial source may be approved.
  Parser rerun and scanner/publication/competency lifecycle tests remain pending.

- Structured parser plus strict coverage contract: **5/5 passed**, 416 milliseconds;
  extractor-package TypeScript build passed. Existing 004 entry point remains
  additive and its contract has no workforce cells. Actual scanner/image and full
  affected 004 regressions remain pending; T014/T018 remain open until those checks.
- Owned manual competency/parser/import-contract check: **3 files, 12/12 passed**,
  29.39 seconds; cleanup completed. Exact pending/accept/replay, unchanged old
  assessment dates, stale-row atomic rollback, correction and accepted-head
  supersession passed. Imported candidates, withdrawal/races and cleanup are not
  covered yet; T015/T021 remain open.
- Owned streamed-original/store check: **1 file, 2/2 passed**, 12.78 seconds;
  cleanup completed. Chunked excess leaves no staged bytes, foreign environment
  store markers are rejected, operational admission is denied, actual digest/size
  finalization is replayable and unscanned reads are denied. HTTP upload routes,
  cancellation/recovery/quota exhaustion and scan/publication remain pending.
- Added explicit private-store/image preparation with a separate
  `turas-artifact-parser:007-v1` tag. The existing 004 parser tag/attestation is
  preserved; the 007 parser uses the same restricted container policy and scanner.
  No preparation/build result is claimed yet. New uncommitted 032 fields retain
  staged digest/object ownership and durable claimed image identities; their
  manifest hash was refreshed without changing any 001–031 migration identity.

- Leased scan development: first two owned runs each had **6 passed, 1 failed**
  because neither test nor ordinary artifact runtime assets were configured. The
  007 image built successfully; the source remained unreadable. Added explicit
  `TURAS_STAFFING_RUNTIME_ASSET_ROOT` support to copy only signatures/assets/image
  attestations from a read-only local source into the owned store. No originals are
  copied from the ordinary store, and no private configuration was changed.
- A following run had **4 passed, 3 failed** because the clone had copied the prior
  migration before the immutable object-ownership field was added, while Vitest
  read the newer domain source. This mixed-state run is not accepted as validation.
  Subsequent schema-dependent runs freeze those files until completion.
- Matching owned image/schema run with the explicit known local runtime asset
  source: **2 files, 7/7 passed**, 38.82 seconds; owned cleanup completed. Actual
  ClamAV and offline container parsing published a clean CSV; withdrawal withheld
  originals before cleanup; cleanup after uploader-session revocation removed file
  and prose while preserving source-version identity. Revoked publication was denied.
- Extended reviewed-import run on the same guarded source convention:
  **5 files, 23/23 passed**, 123.02 seconds; owned cleanup completed. Six private
  import cases include actual clean scanning, actual EICAR rejection without any
  extraction, feature-disabled cancellation, late-publication rejection and current
  authority checks. Four competency cases include a real two-sheet 1904 workbook,
  hidden duplicate name, a formula requiring a literal correction, explicit per-row
  resource identity, six original cell IDs per candidate, exact acceptance and
  withdrawal/purge preserving decision IDs. Five parser, five strict/date contract
  and three affected container-policy cases also passed.
- Pure freshness vectors: **3/3 passed**, 91 milliseconds, covering 90/180-day and
  7/14-day edges, earlier explicit review cutoffs, missing/future observations and
  competency validity through work dates. Availability age is evaluated at current
  decision time; future calendar coverage is a separate check. Full calendar/DST
  vectors under T029/T031 are still unbuilt.
- Node 24 typecheck after import/jobs/mapping/cleanup and supervision additions:
  passed. Worker supervision and HTTP/UI integration still need their own proof.

No full US1, feature, UI, live advisory, load/recovery, CI or Preview gate is closed
by these focused results.

### Continued implementation — current managed session

- The preceding owned roster projection run completed: **1 file, 5/5 passed**,
  31.67 seconds, with owned cleanup confirmed. This predates the new manager
  history/import projections and UI; it does not validate those additions.
- Added explicit scope-bound approved-skill continuation instead of silent
  truncation, competency summary/history GETs, source-eligible historical payload
  retrieval, and cross-receipt-table request-key fencing. New history/continuation
  and cross-table replay assertions are written but have not passed an owned run.
- Two attempts to run the extended projection suite failed before cloning on
  database DNS resolution (**ENOTFOUND**) in the restricted managed session.
  No new database gate is accepted. Command escalation is unavailable under this
  session's approval policy. No Preview migration or Production connection ran.
- Local checks after these additions: **3 unit files, 13/13 passed**, 269 ms
  (strict shared/import contracts and freshness). Node 24 typecheck passed.
- Initial roster/resource/import mapping and exact-review screens are implemented;
  typecheck passes, but HTTP and four-project WebKit validation remain unrun.
  UI implementation and accessibility tasks remain unchecked.
- Added bounded old-file orphan nomination with current database ownership checks
  and restricted retry classification. Their lifecycle/owned-worker tests remain
  required; no cleanup/recovery task is closed by typecheck.

- Orphan nomination development: first **3 failed / 1 passed** across the new
  store and manifest suites because the macOS temp path was not canonical. The
  fixture now resolves its own temporary root; **2 files, 4/4 passed**, 210 ms.
  Checks prove old-private-UUID-only nomination, bounded continuation, no deletion
  on nomination and denial after a changed marker. Database ownership/deletion and
  delayed-generation races still need owned database validation.
- An attempted owned local PostgreSQL fallback used the cached pgvector/pg17 image,
  a random ownership label and generated ephemeral credentials. Docker denied
  container creation (**permission denied**) on two attempts. No container was
  created, no database initialized, and no existing container was altered.
- Expanded actual CSV/XLSX library parsing: **1 file, 7/7 passed**, 636 ms,
  including 300,000 Unicode characters without shortening, code-point overflow
  exclusion, a twenty-first omitted sheet, hidden/merged/shared-formula lineage,
  both date systems and preserved 004 output shape. T018 now has direct evidence.
  This library check does not replace scanning, HTTP, worker or UI validation.
- Pure arithmetic development began with missing-module failures, then exposed a
  refined-Zod-schema composition error; corrected it without weakening validation.
  Final focused run: **2 files, 12/12 passed**, 170 ms. Eight economics vectors
  cover exact maximum bounds, signed/percentage rounding, currency exponents,
  half-open rate periods, overlap denial, split/merge grouping, missing/mixed inputs
  and separate hypothetical service revenue. Four capacity vectors cover union,
  intersected deductions, planned available denominator, zero and retained overload.
  T047 is checked; T029/T031 remain open for actual timezone/DST conversion.
  T050/T051 remain open for the complete finance snapshot/policy/domain integration.
- Node 24 typecheck, authored documentation check (101 files) and diff whitespace
  check passed during this continuation. No hosted, full-feature or Preview gate
  follows from these local checks. No PR, commit or merge was performed.

- Final available local check batch: **8 files, 36/36 passed**, 1.06 seconds
  (shared/import contracts, freshness, store nomination, runner manifest, resolved
  capacity/economics arithmetic and actual spreadsheet-library parsing).
- Temporal 0.5.1 prerequisite lookup also failed at npm registry DNS resolution
  (**ENOTFOUND**); no dependency or lockfile was changed. The exact pinned
  timezone implementation remains unbuilt. External DB, package registry and
  owned local container creation are unavailable in this managed session, while
  command escalation is prohibited by its approval policy. Required database,
  native/UI/live/load/recovery gates cannot proceed in this environment.

### Continued implementation after the incomplete checkpoint — 2026-09-30

- Continued independent implementation while the previously recorded database,
  container-creation and package-registry blocks remained unresolved. No new
  Production or Preview connection, migration, deploy, branch merge or PR occurred.
- Added browser-memory command admission and receipt reconciliation, with six
  direct tests for immediate double-click exclusion, exact captured request,
  uncertain receipt reads without another POST, malformed/server failures,
  one-time form acknowledgement and confirmed saves whose refresh fails.
  Dirty generations now distinguish registry, manual, mapping, review and
  retirement forms and preserve edits made after a command was submitted.
- Added fail-closed staffing navigation and page access, scoped history/withdrawal
  controls, a manual-evidence withdrawal endpoint, and manager resource/taxonomy
  revision, dated partner eligibility and exact competency correction editors.
  Editors retain the revision captured when opened rather than silently rebasing
  unsaved fields when a background projection changes.
- Added pending manual-evidence retention nomination after 30 days, retaining any
  historically accepted evidence until withdrawal and continuing maintenance
  after author revocation. Accepted imports are excluded before the nomination
  page limit. New database assertions for these behaviors are authored, **unrun**.
- Added strict demand/local-window contracts and pure explained matching. Matching
  considers the complete supplied pool (maximum 500), rejects duplicate/overflow
  identities and extraneous ranking inputs, evaluates every requested date,
  distinguishes unknown/stale evidence, retains negative capacity and ranks by
  desired coverage, worst remaining day and resource identity. This does not prove
  authorized batched retrieval, resolved timezone overlap, result expiry or races.
- Added demand create/revise/qualify/cancel domain code with explicit accepted
  revision reads, plan/source/engagement lock order, exact head checks, identity-only
  disabled cancellation and stable demand/date rows that retain older commitments.
  New owned-scope demand integration cases are **unrun**. T030/T033/T034 stay open.
- Extended the uninstalled 033 migration with immutable demand lifecycle events
  and separate rationale payloads; updated its manifest digest and runtime grants.
  **T009 reopened** until empty/031-upgrade and role checks validate this changed
  schema. Earlier foundation results describe the prior schema, not this extension.
- Actual Node 24 local check: **10 files, 45/45 passed**, 880 ms (shared/import
  contracts, store, client commands, demand contracts, matching, resolved capacity,
  freshness, economics, suite manifest). Matching initially failed for the missing
  implementation, then its six vectors passed in 108 ms. Demand contract vectors
  passed four tests; browser command vectors passed six tests.
- Node 24 typecheck and documentation hygiene passed (101 authored Markdown files).
  `git diff --check` passed. These are local checks only.
- Command-line Playwright `--list` discovered **32 tests, one file**, eight US1
  cases across desktop/mobile and light/dark WebKit projects. **No UI test executed**;
  keyboard, accessibility, real scanner/worker mapping, withdrawal and transport-fault
  cases are authored but unproven. The owned CLI runner refuses missing full-feature
  suites and requires real execution without skipped/flaky/unexpected results.
- Full integration/HTTP/WebKit, native replay/cancel/live output, trusted journey,
  telemetry, load, recovery, eight-case live evaluation and Preview gates remain
  unchecked. Temporal 0.5.1 is still not installed; DST resolution is not claimed.

- Continued with thin demand collection/detail/qualify/cancel routes and new
  authenticated HTTP assertions. Collection reads require explicit customer scope
  and return identity/state only; detail source failures withhold demand/rationale.
  Added a real-domain synthetic accepted-plan fixture for these tests, explicitly
  excluding any claim that it establishes the trusted-context journey. Integration
  and HTTP cases remain **unrun**. Typecheck passed after these additions.
- Read the installed eve documentation router plus tools, context control, skills
  and authored instructions pages. Added the staffing provider wrapper and explicit
  pre-admission validation: both generate/stream clamp to 4096 tokens (or a tighter
  valid value); invalid/exhausted step values and exact deadline fail before provider
  invocation; actual usage missing/invalid values stay unknown. Actual local run:
  **2 files, 10/10 passed**, 212 ms (four model-budget cases plus six matching cases).
  This does **not** establish durable native admission, context/output fences or live
  model behavior; T055–T066 remain open. `agent/agent.ts` was not changed.
- Added a strict telemetry allowlist and fixed action/category mapping. Command
  instrumentation emits bounded durations and outcomes; commands within an outer
  transaction are labelled `validated`, avoiding a false committed claim. Sink
  failures do not change domain results. Three pure redaction/unknown-usage/sink
  cases passed in **90 ms** after the expected missing-module failure. Domain-level
  private sentinel and authorized replay tests are authored but **unrun**; import
  worker, exclusions, reads and actual native usage still need instrumentation and
  validation. T067 remains open.

- Added full calendar input syntax/certified coverage and allocation input/action
  contracts. Calendar tests cover explicit empty nonworking dates, whole coverage,
  eight contracted/sixteen combined deduction bounds, fixed leave categories,
  cross-midnight/repeated-clock syntax, leap/year endpoints and invalid/future dates.
  Local UTC and timezone-data retention/DST approval remain unimplemented; these
  contract checks are not a substitute for T029/T031/T032.
- Added allocation proposal/revision domain code and owned assertions for exact
  qualified demand, author rights and unchanged resource/demand confirmed ledgers.
  Proposed amendments retain the old confirmed binding and carry an explicit
  unconfirmed warning. **Database assertions are unrun**. No reservation, expiry,
  preview, commitment, amendment/release/cancel decision or race is claimed complete.
  T038–T046 remain open. Zoned-overlap demand qualification now fails closed with
  a safe unavailable response until the pinned resolver exists.
- Extended import/cleanup telemetry with bounded outcome/count/duration records.
  Cleanup counts completed DB retirements and exact orphan removal, rather than
  claiming success for a stale lease. No filename, job error or personnel enters
  these events. Worker and privacy integration checks remain unrun.
- Actual expanded Node 24 local batch: **14 files, 61/61 passed**, 1.21 seconds.
  Allocation/calendar contract development began with missing schema/module
  failures, then nine focused vectors passed in 181 ms. Typecheck passed.
- Added complete entered finance input provenance/period and exact policy/scenario
  request contracts; **2 files, 12/12 passed**, 191 ms (four finance contract cases
  plus eight arithmetic cases) after initial missing-contract failures.
- Added canonical finance create/revise/read, scoped identity collection and explicit
  formula/input-policy human approval services and thin HTTP routes. Resource locks
  serialize competing first rates; baseline/kind mutexes serialize entered-total
  periods; immutable old input revisions are retained. Added owned role, overlap,
  competing-rate, policy-digest and HTTP private-sentinel assertions, **all unrun**.
  Exact finance scenario snapshot/stale/source fences and finance UI remain unbuilt.
  T048/T050–T054 stay open.
- Added an immutable finance input kind/resource/customer/engagement/baseline/author
  binding guard to uninstalled 034 and updated its manifest digest. **T010 reopened**
  for disposable schema/role validation; the earlier schema checks predate this guard.
  Production/Preview remain untouched. No PR, commit or merge occurred.

### Continued implementation after the premature checkpoint

- The previous local `build:check` completed with exit 0 using an inert
  `127.0.0.1:9` database target and a synthetic environment marker. It compiled
  eve and Next locally; it did not validate a running database, deploy or link
  Vercel. That build predates the finance page and allocation routes added next.
- Added the canonical finance page/navigation, blank entered input/provenance
  forms, exact revision editor and explicit planning-only policy approval. Dirty
  revisions keep their captured head during refresh and block switching editors
  until closed. Finance remains absent from operational navigation and guarded
  on the server. Three owned WebKit finance cases are authored, **unexecuted**.
- CLI Playwright `--list` discovered **44 cases in two files** across desktop/mobile
  light/dark WebKit (32 import/roster and 12 finance cases). This establishes test
  discovery only. Full operations/scenario, matching, decisions, advisory and
  journey UI coverage is still incomplete; T054/T071 remain open.
- Added scoped operational allocation identity lists/detail, exact proposal
  cancellation and thin proposal/revision/cancel/read routes. Payload reads recheck
  demand source eligibility and both sorted resource heads for an amendment.
  Unconfirmed cancellation uses scoped identities without source prose, continues
  while disabled, and cannot cancel an allocation with confirmed time. Confirmed
  amendment and other-author manager cancellation receipt replay now recheck the
  required current manager capability before returning a prior receipt.
- Added immutable allocation proposal/revision/cancellation events and separately
  owned rationale payloads to uninstalled 033, narrowed runtime event grants and
  updated the migration manifest digest. **T009 remains open** for fresh disposable
  schema/role gates; earlier foundation results do not validate this extension.
- Added owned HTTP/domain assertions for scoped reads, private sentinel exclusion,
  exact cancellation/replay, inactivation withholding, disabled cancellation,
  retained audit events, unchanged ledgers and manager downgrade replay denial.
  **These database/HTTP assertions are unrun.** Reservation, expiry, previews,
  human confirmation, release and commitment races remain unimplemented/open.
- Focused local allocation-contract/telemetry check: **2 files, 8/8 passed**,
  172 ms, after the new list-contract test first failed for the missing schema.
  Corrected a test syntax error, then Node 24 typecheck and `git diff --check`
  passed. Production/Preview remain untouched; no PR, commit or merge occurred.

- Reviewed the pinned Temporal 0.5.1 [upstream package declaration](https://github.com/js-temporal/temporal-polyfill/blob/v0.5.1/package.json)
  and [license](https://github.com/js-temporal/temporal-polyfill/blob/v0.5.1/LICENSE).
  The package declares **ISC**, with ECMA copyright/permission notices to preserve;
  its runtime dependency is `jsbi`. This is license review only. Registry metadata
  was unavailable through browsing as well as the previously recorded shell DNS
  failure. No polyfill dependency or fabricated lockfile integrity was installed;
  T031 stays open. No alternate timezone implementation is claimed equivalent.
- Added minimal current accepted-engagement work-package choices through the shared
  source-checked plan domain, with explicit customer scope and internal authority.
  Added the engagement demand page, named work-package/skill controls, explicit
  resource-local daily effort, exact revision/qualification/cancellation actions
  and conditional engagement navigation from that authorized projection.
  Open forms retain their original head/baseline and unsaved inputs; historical
  demand edits retain their old baseline, and a stale action must be reviewed
  before it can run. No matching or commitment controls are presented as ready.
- Added owned work-package projection HTTP assertions and three WebKit demand cases
  for keyboard creation/qualification, a real competing revision with preserved
  dirty input and partner denial. **All remain unexecuted.** Optional overlap
  authoring, matching, calendar and allocation decision UI are still missing;
  T035/T036/T037 remain open. Node 24 typecheck passed after correcting the plan
  projection's unknown-content typing through its versioned content schema.

- Expanded pure contract/arithmetic/client batch before timezone authoring:
  **15 files, 66/66 passed**, 1.42 seconds. CLI discovery then found **56 cases in
  three files** across the four WebKit projects; no UI execution is implied.
- Authored a lazy, exact-version Temporal resolver with explicit endpoint
  disambiguation, offset/round-trip checks, resource-local midnight splitting,
  per-day union/deduction limits and retained Node/ICU/timezone-data identity.
  It has no alternate timezone fallback. The version pin/lockfile remains pending.
- Authored real pinned-resolver DST gap/fold/elapsed/split/overlap vectors in the
  required suite manifest. After correcting a test syntax error, the initial
  missing-module failure was followed by **5/5 failing tests** with the safe
  `staffing_calendar_unavailable` response because the required package is absent.
  **This is an open failed gate**, not a DST or calendar pass; T029/T031 remain open.
- Added calendar authority preflight, resolution outside DB locks, final exact
  resource/head recheck, immutable revision publication and explicit per-date
  current selection. Calendar replacement does not alter confirmed allocation
  ledgers. Added operational daily totals without leave categories or other
  customer assignment identities, and standalone approval/read routes. These
  services remain **database-unvalidated** and approval fails closed without the
  dependency. T032 stays open; no Production/Preview changes occurred.

- Updated local eve/Next build: **exit 0** with all database targets overridden to
  the inert synthetic `127.0.0.1:9` target, after the demand/calendar/receipt route
  changes. This is compilation only. Authored owned calendar tests cover narrow
  replacement selection, preserved old revisions, category-free operational
  responses, exact replay/stale heads, two competing first certifications and
  zero-versus-unknown capacity. **These assertions remain unrun.**
- Reviewed receipt reconciliation separately from mutation replay. Added current
  manager checks for calendar approval, confirmed amendment and another author's
  cancellation receipts, plus an owned HTTP downgrade assertion for the GET
  receipt path. That assertion is **unrun**. Generic lookup still returns only
  actor-scoped safe identity/state receipts and never personnel or finance prose.
- Calendar SQL now returns business dates as text, avoiding runtime-local PG date
  conversion changing their labels. Focused explicit calendar-read contract,
  client command and telemetry check: **3 files, 15/15 passed**, 251 ms. Typecheck,
  docs hygiene (101 authored files) and `git diff --check` passed. The five real
  timezone-resolution tests remain failed because the pinned package is missing.

- Added exact matching request/page contracts and a batched server projection:
  whole active pool capped at 500 with explicit overflow refusal; scoped source,
  taxonomy, competency, partner grant, calendar and resource/date checks; UTC
  overlap and aggregate remaining capacity; actor/input-bound result identity and
  cursor; recomputed dependency digest at every page read; ten-minute expiry.
  No personnel prose, financial inputs or other-customer assignment identities are
  queried for ranking. Added current work-package/skill names for operational UI.
  **Database behavior and representative performance remain unvalidated**; T034
  remains open, including remaining race/overflow/grant/expiry evidence.
- A new pure vector exposed an eligible result when the assessment date followed
  the first requested service date. Fixed required/desired skill validity across
  both period boundaries. Focused matching contracts/ranking: **2 files, 9/9
  passed**, 191 ms, after the vector failed with an erroneously eligible result.
- Added comparison UI with every returned constraint reason, resource timezone,
  as-of/expiry and explicit feasibility-only labels. A changed demand scope clears
  prior results; guarded reads prevent late responses restoring an obsolete
  result, and failed/expired reads stop polling and refresh authority/context.
  No automatic computation retry, allocation reservation or commitment is made.
  Owned domain/HTTP and keyboard matching assertions are authored, **unrun**.
- README, roadmap, architecture and evidence policy now describe implementation
  in progress, distinct workforce storage and the remaining gates. No feature
  completion markers were added. Typecheck, docs hygiene and diff checks passed
  after the matching additions; final build and full validation are still pending.

- Continued after the premature implementation checkpoint. Added a resource-local
  calendar editor with explicit certified coverage, empty-date versus missing-date
  states, contracted/holiday/approved-leave/protected interval controls, optional
  endpoint offsets, fixed leave categories and exact captured calendar heads.
  A refresh never rebases dirty approval inputs; a current authorization downgrade
  removes the manager editor. Operational reads omit manager-authored intervals,
  rationale and leave categories. Added manager approval/privacy and concurrent-head
  WebKit assertions: **authored, unrun**. CLI discovery now finds **64 cases in
  three files across four WebKit projects**, which is discovery only.
- Zoned demand qualification now resolves overlap outside database transactions
  and rechecks its exact input digest before publication. The pinned package
  prerequisite remains unmet; no alternate timezone resolver was introduced.
  Calendar/qualification standalone replay now checks current authority and an
  exact committed request digest before performing local resolution.
- Added tentative reservation and a thin route, with expiry bounded by immutable
  proposal creation plus seven days and the first resource-local midnight. Expiry
  is rechecked at commit; tentative interest never changes confirmed ledgers.
  A concurrent exact reservation reconciles its committed receipt after rollback.
  Added bounded, source-independent maintenance expiry and distinct immutable
  service audit, with no fabricated human decision. Migration 033 and its manifest
  hash/grants changed; **T009 remains open pending fresh disposable migration and
  role evidence**. Owned reservation/replay/expiry/disable/race tests are **unrun**.
- Review found workforce timers nested inside the recurring watchdog callback,
  which would multiply timers and make shutdown references inaccessible. Moved
  them to module scope. A focused mocked scheduler regression proves independent
  bounded ticks while the conversation watchdog is stalled: **1/1 passed**, 81 ms.
  This is scheduling evidence only, not a live worker/recovery check.
- Available staffing units excluding the blocked resolver: **17 files, 71/71
  passed**, 1.41 seconds. An actual resolver rerun including the new reservation
  boundary vector: **1 file, 6/6 failed**, 190 ms, because
  `@js-temporal/polyfill` 0.5.1 is absent. The DST/overlap/reservation tests remain
  required and unskipped in the complete suite; this failure is not a green gate.
- Added deterministic confirmed-ledger precommit arithmetic for the sorted
  old/new resource/date and stable demand/date union, old-commitment subtraction,
  remaining demand/capacity checks, retained past rows and identity-only future
  release after lost feasibility. Historical midnight uses stored revision
  timezone. Focused arithmetic: **9/9 passed**, 76 ms. This function is **not yet
  wired to governed preview/confirmation persistence**; T039/T040 remain open.
- Typecheck passed after the calendar, reservation and scheduler additions. Docs
  hygiene checked 101 authored Markdown files and `git diff --check` passed before
  the ledger additions. Current DB, full UI, native/live, load, recovery and Preview
  gates remain incomplete. Production and Preview were not connected or changed.

- Subsequent available unit run: **18 files, 80/80 passed**, 1.45 seconds, explicitly
  excluding the six failing required timezone-resolution vectors. Added explicit
  overlap timezone/minutes/local endpoints/optional offsets to the demand editor
  and extended the keyboard assertion; **that WebKit behavior is unrun**.
- Actual local eve/Next build passed (exit 0), with all database URL variables
  overridden to inert loopback port 9 and output retained in ignored restricted
  `local-artifacts/007/build-current.log`. This build precedes the new ledger and
  decision modules below; it is not their final build evidence or hosted behavior.
- Added the ordered internal stable-ledger transaction suffix: scoped complete
  resource/date and demand/date union, serialized first resource/date rows, current
  generation snapshots, exact old-row recheck, target revision identity checks,
  future-only row replacement and generation updates. It performs no independent
  commit. **Database behavior remains unrun.**
- Further history review exposed retained past dates belonging to earlier
  resources after future amendments. The new vector caught a timezone change
  making an old past date appear editable. Fixed classification/collision checks
  against the stored historical timezone and automatic past-row retention.
  Focused ledger arithmetic now **10/10 passed**, 75 ms after a 9/10 failing run.
- Added exact actor/session-bound release/cancel previews, current daily effects,
  expiry/dependency rechecks and transactional future release/cancel decisions,
  including receipt replay and use while 007 writes are disabled. This identity-only
  path does not read withdrawn source prose or require renewed feasibility.
  **Confirm/amend remain unavailable** until their entire governed feasibility
  prefix is implemented and validated; no incomplete commitment path was opened.
  Added owned lifecycle tests for inactivation, changed generations, expired
  previews, operational denial, exact replay and real post-ledger SQL rollback:
  **authored, unrun**. Their explicitly seeded confirmed ledger fixture does not
  establish human confirmation or the trusted-context journey. Typecheck passed
  after correcting the new tests' `QueryResult.rows` access.
- Reopened **T012** for the new standalone exact-replay helper and current
  calendar/allocation receipt authority. Added an owned standalone replay test:
  **unrun**. T009/T010 and all current decision/UI/native/live/load/recovery/Preview
  gates remain open. No feature branch or PR was committed, published or merged.

- Subsequently wired confirm/amend into the governed decision path: strict
  current accepted-baseline qualification, source/competency/resource/calendar/
  partner feasibility, future-only dates, old commitment credit, complete stable
  ledger union and current capacity-generation recheck, both daily limits, exact
  actor/session-bound preview and late session/preview/reservation expiry checks.
  Temporal overlap preparation remains outside transactions. **This code is
  unvalidated against a current disposable database**, and T038–T046 remain open.
  The earlier release-only availability statement describes the prior checkpoint.
- Corrected preview request normalization to retain the requested review action in
  its digest. Added conflict-only exact receipt reconciliation without automatic
  preparation/mutation retry. Internal decision feasibility normalizes an implicit
  first zero-usage ledger to generation one only when the union lock verifies zero
  usage/generation one; otherwise a first preview would invalidate itself. Public
  matching remains whole-pool and cannot receive decision scope/credit overrides.
  Unused resource/date capacity is excluded from decision dependency fingerprints.
- Added real 007 reviewed competency/calendar/proposal fixtures and owned tests
  for competing first confirmations, action-digest conflicts and source withdrawal
  after preview: **authored, unrun**. The source-free accepted 006 baseline in this
  fixture is explicitly **not** the required trusted-context journey. Synthetic
  scenarios reset scoped staffing rate windows before cases while preserving the
  real admission limits within each case.
- Latest available staffing unit run: **18 files, 81/81 passed**, 1.44 seconds,
  still excluding the six blocked required timezone tests. Added retained history
  beyond a new revision's 91-date limit; focused ledger arithmetic now **11/11
  passed**, 82 ms. Typecheck passed after the current decision wiring. Owned races,
  HTTP/UI, final build, native/live, benchmark, recovery and Preview are still open.

- Continued allocation reads with current confirmed feasibility/self-credit and
  conservative needs-review on unavailable local timezone resolution; operational
  reservation follows the contract for any currently authorized internal member,
  while proposal revision/cancellation retains its separate author/manager checks.
  Added an owned HTTP reservation-by-another-member case: **authored, unrun**.
- Added allocation proposal/working revision/reservation/cancellation/exact review
  and all four decision controls. Captured heads and dirty inputs survive refresh;
  conflicts trigger read-only reload, uncertain saves use receipt lookup, previews
  recheck on a ten-second poll, and current source/authority failure withholds detail.
  Added actual commit-then-response-loss and competing-revision WebKit cases:
  **authored, unrun**. No seeded ledger is claimed as confirmation proof.
- Added customer-period operations API and internal overview, with batched calendar,
  interval, usage and stable ledger reads, current input identities/as-of times,
  separate selected-customer/shared/tentative totals, negative remaining and unknown
  calendar states. Added owned projection and keyboard/privacy tests; these use a
  clearly labeled synthetic seeded ledger and remain **unrun**.
- Current available unit suite: **18 files, 82/82 passed**, 1.47 seconds. The six
  required pinned-timezone tests remain unavailable and are not removed from the
  full runner. CLI Playwright discovers **76 cases in four files across four WebKit
  projects**, which is **discovery only**, not executed UI evidence.
- Current `npm run typecheck`, `npm run check:docs` (**101 authored Markdown files**)
  and `git diff --check` passed. Current local `npm run build:check` passed eve and
  Next.js with every selected database URL replaced by an inert localhost endpoint;
  output is in ignored `local-artifacts/007/build-allocation-operations.log`.
  These are local build checks, not hosted behavior. T038–T046/T049/T053/T054 and
  native, complete journey, load, recovery, full regressions and Preview gates remain
  open. Production and Preview were not connected to or changed.

- Added advisory preparation with a strict exact-demand/mode contract, fresh
  owner-private delivery-scoped conversations, a serialized rolling five-request
  hourly limit, instruction UTF-8 charging and safe ID-only command replay. Added
  database guards against populated/mixed bindings, mismatched request ownership,
  changed native response identities, reset deadlines/counters and terminal revival.
  Updated the draft 034 manifest identity; T010 remains open pending owned migration
  and upgrade tests. Generic bound tools now deny staffing before default snapshot
  retrieval; the four staffing read tools and full native admission are not wired.
- Added the staffing advice skill from installed eve authoring docs. Cancellation
  acknowledgement closes the exact matching advisory in the owned stopping-response
  transaction, including feature-disabled identity-only cancellation. Owned admission,
  binding, generic-tool denial, progress guard and cancellation cases are **authored,
  unrun**; synthetic DB native IDs in these cases do **not** prove actual eve/native
  transport, stream fencing, cancel/replay or live model output. No provider was called.
- Current available unit suite: **18 files, 84/84 passed**, 1.64 seconds, including
  advisory scope and exact shared context quota boundaries. Six required Temporal
  tests remain blocked, unskipped in the full gate. Current typecheck, docs (**101
  authored Markdown files**) and diff check passed. A second current local eve/web
  build passed with inert database URLs; ignored log:
  `local-artifacts/007/build-advisory-foundation.log`. The selected model/reasoning
  remain unchanged. T055–T066 and all final feature gates remain unchecked.

- T050 pure economics implementation review and focused validation: **2 files,
  13/13 passed**, 205 ms. Added independent exact grouped snapshot expectations
  (four minutes × 15 minor units/hour gives numerator 60/divisor 60/amount 1;
  two minutes on the next service date gives numerator 30/amount 1). Existing
  contribution/percentage, split/merge, half-open rate, currency, input-bound and
  missing/mixed tests passed. T050 is checked for the strict pure calculation
  boundary only; persisted scenarios, financial current-read fences, DB/HTTP/UI
  and T048/T051–T054 remain unchecked. Current 034 advisory constraints additionally
  require a complete immutable dispatch/deadline pair and prohibit budget charges
  after terminal settlement; manifest hashes match all **34** migration files.

### Continued implementation — finance scenario slice (2026-10-01)

Implemented immutable typed scenario creation/list/detail routes and a finance-only scenario editor. The scenario calculates from persisted confirmed allocation-day rows, captures exact grouped rounding inputs and entered effective rate/amount revisions, and preserves separate hypothetical service revenue. Missing amounts remain incomplete. Current accepted baseline and approved personnel sources are rechecked; changed healthy inputs label the original snapshot historical/stale, while unavailable baseline/personnel inputs withhold its content. Advisory admission and current scope now reject stale/withheld same-baseline scenarios through this reader. These domain/database guarantees still require owned-clone execution; typecheck alone does not establish them.

Actual local verification: Node 24 typecheck passed; 18 available staffing unit files / 86 tests passed in 1.44 seconds. The required Temporal calendar-resolution file was explicitly excluded from this local available-unit command because its pinned package remains unavailable; this is not the complete required unit gate. `git diff --check` and authored documentation/hygiene check passed (101 Markdown files). Eve/Next build check passed with all database URL variables overridden to an inert local endpoint; private build log is `local-artifacts/007/build-finance-scenarios.log`. This build preceded the subsequent advisory scenario reader integration, which separately passed typecheck.

Added actual owned-database HTTP/domain scenario cases and one WebKit keyboard/exact-cost/withholding scenario case, using a clearly labelled seeded confirmed-ledger fixture. These are authored but **unrun**; they do not substitute for the complete trusted-context journey. Command-line Playwright discovered 80 cases in four staffing files across four WebKit projects; discovery is not execution. Production and Preview were not contacted or upgraded. T048, T051–T059 and required database, native, UI, performance, live evaluation, recovery and Preview gates remain unchecked.

### Continued implementation — restricted assignment and advisory guards (2026-10-01)

Added a strict assignment allowlist and bounded actor/session/baseline-scoped cursor projection to the engagement detail reader. It selects only confirmed future rows under the stored resource timezone; retrieves only display name and delivery role after approved-source locks; withholds narrative for unavailable sources, inactive resources, old baselines or changed demands; and preserves dated commitment minutes. The engagement UI refreshes authority every ten seconds and clears content on a failed read. Partner projection tests cover allowed fields, source withdrawal before cleanup, revoked grants, excluded proposal/reservation/released/cancelled heads, and strict query shape. The owned database cases are **unrun**; no claim of complete partner lifecycle/freshness/eligibility race validation is made. T044 remains unchecked.

Added a staffing-specific owned native tool-actor guard and an unexposed provider-step admission helper. These check current demand/scenario and login authority, active owned response/deadline, exact native session/turn, a unique step token and six-step admission. Consumed-dependency fencing is a mandatory supplied callback before the attempt mutex; the helper is not wired to dispatch and proves no provider/native behavior. The four governed tools, dependency union, delivery-only initial context and active/history/replay fences remain incomplete.

Actual verification: repeated Node 24 typecheck and whitespace checks passed. Focused assignment-contract and economics checks: 3 files / 20 tests passed in 273 ms. The existing broad 18-file/86-test measurement above precedes the added delivery allowlist test. The date-sensitive allocation HTTP fixture now uses tomorrow rather than 2026-10-01. No new database, WebKit execution, live model, Preview or production operation was performed.

Latest available-unit repetition after the delivery assignment contract: 18 files / **87 tests passed** in **1.58 seconds**, with the required unavailable Temporal resolution suite explicitly excluded as before. Eve/Next build check **passed** for the assignment/admission slice using inert database URLs; ignored private log `local-artifacts/007/build-assignments-admission.log`. The subsequent late login-expiry check in the unexposed admission helper requires its next verification. These local results do not close database/native/UI gates.

### Continued implementation — actual journey and advisory settlement (2026-10-01)

Authored `tests/fixtures/staffing/journey.ts` and `tests/integration/staffing-journey.test.ts`. The fixture calls actual 004 upload, scanner/container extraction and 003 artifact-backed human approval; materializes and retrieves the approved delivery source; publishes a shared practice through actual 005 human review; and accepts a source-bound 006 plan through its exact preview/decision services. The 007 continuation calls actual workforce intake/scan/parse/literal mapping/row approval, calendar publication, whole-pool matching, exact human confirmation and entered finance/policy/scenario services. Persisted selection, source, extraction, mapping, competency, baseline decision and allocation ledger/decision identities are asserted. Expected exact finance totals are cost 2000, entered revenue 10000, nonlabor 500, contribution 7500, margin 75.00 and separate hypothetical service revenue 4000. **These are expected test assertions, not observed database results.** No seeded acceptance/extraction/confirmation shortcut is used. The owned journey remains **unrun** and T070 unchecked.

Added bounded environment-scoped advisory deadline settlement, independent of the conversation watchdog and still eligible while new 007 writes are disabled. Overdue ambiguous dispatches settle unconfirmed without paid retry, source retrieval or allocation changes. A synthetic durable ambiguous-dispatch integration case is authored but **unrun**; it does not claim an actual native call. Actual Node 24 typecheck passed. The fake-clock independent scheduler case, extended for advisory settlement, passed: 1 file / 1 test in 80 ms. This proves scheduling independence only, not live worker/database/native recovery. Required native/tools/context/replay/output, performance, recovery, WebKit, live evaluation and Preview gates remain open.

### Continued implementation — durable advisory read/step foundation (2026-10-01)

Added unexposed staffing-specific read reservation and result storage helpers. Admission is intended to commit before domain execution; a receipt without a payload stays unconfirmed rather than automatically repeating the read. Results charge exact UTF-8 bytes and the typed consumed dependency union before release; unchanged receipt replay charges no second read. Operational attempts cannot reserve finance-scenario reads. The owned tool actor now follows response→advisory lock order shared with cancellation, checks admissible native dispatch state and turn identity, and compares the consumed dependency digest before/after acquiring the attempt mutex so concurrent new dependencies cannot escape the supplied fence. Late deadline/login checks precede replay/result release and step admission completion.

Added synthetic DB-only quota/ownership fixtures and owned integration assertions for durable uncertainty, exact replay, six-read and six-step limits, forged turns, stopping responses, finance denial, and no staffing writes. These tests are **authored but unrun**; synthetic identities/receipts establish no actual provider/native behavior. Node 24 typecheck and whitespace check passed during this work. The complete authoritative consumed-dependency fence, four actual tools, initial staffing context, native dispatch/cancel/history/stream/replay and live output remain incomplete; T055–T065 stay unchecked.

The latest journey/read-budget slice also passed eve/Next build check with inert database URLs (`local-artifacts/007/build-journey-read-budgets.log`, private/ignored). Subsequent shared-profile changes explicitly reject staffing bindings in generic context capture/replay until the complete staffing bridge is connected, before any default internal snapshot is assembled. An owned assertion checks that no generic snapshot receipt is created; it is unrun. This temporary closed entry point is recorded implementation incompleteness, not native advice availability.

Further UI race work adds response generations to finance scenario selection/polling and engagement assignment paging/polling. A WebKit scenario case now delays an actual authorized HTTP response, deactivates the resource through the owned database, observes a newer withheld read, then releases the delayed response and asserts no old totals reappear. This authored case is unrun. The source-head race comparison also now uses a map rather than a quadratic per-head lookup; no database performance result is claimed. Typecheck and whitespace checks passed after these changes. Step admission now respects the 007 disable switch; settlement and eligible reads retain their separate behavior. T012 and shared 002–006 regression/native gates remain open.

The broader available unit command `vitest run tests/unit --exclude tests/unit/staffing-calendar-resolution.test.ts` passed **51 files / 203 tests in 3.98 seconds**. Its explicit Temporal exclusion means this is not the full required unit gate. This run preceded the partner eligibility and native guards below.

### Continued implementation — partner authority and generic native closure (2026-10-01)

Extracted a shared current partner authority prefix for matching, restricted assignment reads and finance snapshots. Authority includes active organization, linked membership/principal and the resource member's current customer grant; external resources still require explicit organization and dated eligibility. Assignment narrative now requires active declarations for every projected future commitment date. Missing/retracted eligibility or authority loss withholds display name and role while preserving recorded minutes. Calendar coverage/timezone and observed review windows, plus accepted competency review through each service date, flag review without altering commitments. One captured database timestamp defines the page's date boundary. Finance snapshots now withhold unavailable partner eligibility and retired accepted skills, and include partner authority/declarations in their source fingerprint.

Authored owned assignment/finance cases for missing declarations, retraction and inactive organization with retained ledger minutes. They remain **unrun**. Pure authority/freshness/matching/assignment-contract checks passed: **3 files / 19 tests in 264 ms**. Repeated Node 24 typecheck and whitespace checks passed. These do not validate the current SQL, concurrent source/acceptance races or hosted behavior; T034, T044, T048 and T051 remain unchecked.

Generic dispatch/replay, history/reconnect/chunk context checks and all visible native event projections now reject staffing bindings until their charged staffing context/dependency bridge is connected. The root agent's step resolver also rejects such an unbridged binding before returning a provider model; `spacexai/grok-4.7` and reasoning `low` remain unchanged. Added a synthetic DB-only case asserting no projected output or charged steps/reads through these closed paths; it is **unrun** and proves no actual native transport. This is temporary fail-closed behavior, not completion of T055–T066 or availability of staffing advice.

Eve/Next build check passed for this slice using inert database URLs; ignored private log `local-artifacts/007/build-partner-native-guards.log`. Production and Preview were not contacted or changed. No task was newly marked complete.

### Continued implementation — read telemetry and live-review prerequisites (2026-10-01)

Added settled read telemetry to roster/skill, operations and finance scenario readers. Records contain fixed operation/outcome, bounded duration and an allowlisted conflict category only; caller-owned transactions report validated rather than an outer commit. Raw requests/results/errors and finance-dependent counts are never supplied. Approved roster reads also report only a bounded aggregate count of excluded accepted source/skill summaries. This adds a source count query whose current representative database cost still requires T069 measurement. The redaction/failure/transaction tests, partner freshness tests and provider-budget tests passed **3 files / 15 tests in 264 ms**; typecheck and whitespace checks passed. Current owned read/source/model-usage integration proof remains incomplete and T067 unchecked.

Created the fixed S01–S08 cases in `evals/fixtures/007-staffing-cases.json` and the `eval:staffing:verify` review command. The verifier binds the exact fixture and captured private-output digests, eight unique owned identities, one initial dispatch/case, no automatic retries, dispatch/settlement and suite deadlines, charged context/read/dependency limits, contiguous step receipts, actual usage provenance (missing counts remain null), provider output clamp, scope and lifecycle assertions, and all four human rubric/hard-gate results. Private input files must be regular owner-readable-only files under the physical ignored 007 root; CLI failures disclose no captured content. The verifier checks recorded evidence and review, not an independent native execution. Its synthetic rejection tests are explicitly **not live results**.

Actual verifier/telemetry unit check passed **2 files / 9 tests in 181 ms**, and typecheck passed. The owned eight-turn runner, actual native bridge and actual-output capture are still unbuilt/unrun; T072 and T073 remain unchecked. No actual live review was created or passed, no paid provider calls were made, and no Preview or Production operation was performed.

The subsequent broad available-unit run passed **52 files / 212 tests in 4.09 seconds**, again explicitly excluding the required unavailable Temporal resolution suite. Documentation/hygiene passed for **101 authored Markdown files** and whitespace checks passed. This measurement predates the dependency-accounting changes below.

### Continued implementation — exact consumed-dependency accounting (2026-10-01)

Centralized the strict sixteen-kind dependency contract and immutable union accounting in `lib/staffing/dependencies.ts`; read-result storage now uses that shared accounting. Exact repeated identities consume no second slot, while changed revision/generation/digest, invalid metadata or a union over 200 fails without clipping. Added a pure complete-snapshot assertion that rejects missing, duplicated, substituted or extra resolver rows. These helpers do not retrieve or authorize sources: the authoritative sorted-lock resolver and its native output integration remain required and unbuilt.

Actual dependency/model-budget checks passed **2 files / 9 tests in 198 ms**; Node 24 typecheck passed. Added the new verifier and dependency suites to the isolated manifest. Current owned read-budget SQL, full native bridge, complete staffing suite, WebKit, live evaluation, load, recovery and Preview gates remain open. No task was newly marked complete.

The dependency/review/read-telemetry slice passed eve/Next build check with inert database URLs (`local-artifacts/007/build-dependencies-review-telemetry.log`, ignored/private). A subsequent matching source-exclusion counter uses its existing assessment result without another count query; an owned withdrawal/read telemetry case is authored but **unrun**. Typecheck passed after those changes.

### Continued implementation — first-competency source race (2026-10-01)

Review found a first-row phantom gap: an accepted competency could appear after a reader's discovered competency range but before resource locking, so the new source header had never been locked. Candidate creation/correction, imported candidate mapping and competency decisions now acquire sorted resource UPDATE locks after their source/skill/competency prefix. The governed read helper takes its resource SHARE locks, then rechecks the discovered competency range without acquiring new competency locks in reverse order; any changed/added head causes refusal before personnel payload retrieval. Readers do not silently add an unlocked source to the snapshot.

Authored a real two-transaction owned-clone interleave: commit an actual new manual candidate and human approval between reader head discovery and resource locking, require source_changed with zero personnel-payload reads, then verify a fresh read sees the reviewed competency. This case is **unrun**. Node 24 typecheck passed; current source/acceptance/database race gates remain unchecked. This change requires the current owned competency/mapping/matching/finance/allocation regression run when the isolated database is available and representative performance measurement of the additional final metadata query.

Latest focused dependency/freshness/telemetry/review checks passed **4 files / 19 tests in 341 ms**. Documentation/hygiene passed for **101 authored Markdown files** and whitespace checks passed. The source-phantom slice passed eve/Next build check with inert database URLs (`local-artifacts/007/build-source-phantom-guard.log`, ignored/private). The concurrent fixture uses UTC so its current assessment date cannot accidentally be future-dated in Denver. No current owned DB, native transport, WebKit execution, live evaluation, representative load, recovery or Preview gate has been closed.

### Continued implementation — authoritative dependency resolver and four read tools (2026-10-01)

Authored `lib/server/staffing/fences.ts` and connected it to the four strict native read definitions through `lib/server/staffing/tools.ts`. The resolver acquires current delivery-only customer context and the original accepted-baseline source prefix, sorted demand/partner/personnel-source/skill/competency/resource/calendar/capacity inputs, and optional same-baseline scenario inputs before the response/advisory mutex. It compares the entire saved dependency union, including whole-pool matching receipts, resource-local date/freshness changes and every dated calendar/capacity generation. Capacity fingerprints retain confirmed usage even when calendar coverage is unknown. Imported source fingerprints are source-header identities; assessment/extraction eligibility remains in the competency fingerprint, avoiding conflicting fingerprints for two assessments of one source.

A shared/exclusive workforce-pool mutex now covers native discovery versus resource creation/reactivation. Required skills without a competency row are included in the sorted skill prefix. The full owned SQL/lock-order/phantom/concurrent-source proof remains **unrun**; this is authored implementation, not established database or native behavior.

Each actual tool uses the native `ctx.callId` as its durable read key. A reservation commits before a new domain execution; replay reauthorizes all consumed dependencies without charging another read, and an admitted receipt without a payload remains unconfirmed rather than automatically repeating execution. Final result/dependency storage charges exact UTF-8 output before release. Capacity requests must select resources already released in this attempt's matching pages, within the bound demand period. Model result contracts omit private evidence/absence/rate provenance and preserve explicit missing/unknown constraints and negative capacity. Withdrawn personnel source/assessment identities are retained only where required in the server authority union, not exposed as current model citations. Scenario reads remain finance-only and retain exact deterministic input/formula/policy identities.

Actual Node 24 focused unit checks passed **3 files / 15 tests in 289 ms**, covering the new strict request/result boundaries, dependency accounting and matching arithmetic. Node 24 typecheck and `git diff --check` passed. Eve/Next build check passed with inert database URLs (`local-artifacts/007/build-staffing-read-tools.log`, ignored/private). An owned-database case now exercises the real executor/resolver, exact replay/counter preservation and subsequent required-skill retirement; it is **unrun** and uses explicitly synthetic response identities, not a real provider/native transport.

The generic native entry/output guards remain closed until charged initial context, production provider admission, the runtime capability restrictions, terminal/history/reconnect/cancel fences and actual native validation are connected. T058, T059, T061 and T062 remain unchecked. No current owned SQL, native transport, WebKit execution, live evaluation, representative load, recovery or Preview gate has been closed; Production and Preview were not contacted or changed.

### Continued implementation — charged initial context, capabilities and paid retry prevention (2026-10-01)

Added initial staffing snapshot capture/storage and a shared exact renderer, a current saved-snapshot/injection reader, and production provider-admission prerequisites. Initial context includes only the governed delivery customer projection, exact qualified demand/baseline identity and optional bound scenario identity; exact rendered UTF-8 bytes and dependencies are persisted before injection. The native instruction resolver and step hook branch before generic internal/customer/artifact context. Original snapshot expiry also bounds current tool release clocks. These helpers are authored/typechecked but initial dispatch association/capture, production model selection and all output/history/reconnect/terminal fences are still being connected; entry/output guards remain closed.

Review corrected a replay instability: governed quality assessment clocks and rolling validity timestamps change on each profile read. Customer fingerprints now omit only those generated quality clocks, retaining actual source/payload identity, scores and freshness changes; original injection expiry is separately required. The regression passed **2 files / 9 tests in 195 ms**. Staffing delivery projection uses the existing read-only actor lock mode, avoiding an actor lock upgrade after the pool mutex. Zero-based customer generations are represented as one-based dependency versions with the real generation retained in the content fingerprint. Current owned concurrency/database proof remains unrun.

Ordinary authored tools now resolve by turn and are omitted for staffing; the four staffing definitions are omitted outside their binding, and scenario visibility requires finance mode and a fixed scenario. The authored planning/staffing procedure text was preserved under `agent/skill-procedures/`; dynamic `agent/skills/*.ts` exposes only the applicable procedure. The allowed staffing loader reauthorizes the entire union and durably charges each exact native load key's UTF-8 text without charging an exact replay twice. Migration 034 now includes append-only `staffing_skill_load_receipts`; its checked-in checksum and runtime role restrictions were updated. This migration change requires a new owned migration/role run; it has **not** been applied to Preview or Production. T009/T010/T012 remain unchecked.

The first catalog build failed because installed eve requires workflow tools to remain static. Restored the research workflow's required static export; its executor retains staffing denial. The staffing provider wrapper filters its final provider-visible catalog to the allowed reads/procedure (scenario only in finance mode), and rejects forced generic/operational-finance tools. It also permits exactly one generate OR stream invocation per admitted step, blocking SDK retries after the first call may have reached billing. Existing direct-executor tests import the named authored definition so authorization remains tested independently of visibility. Model `spacexai/grok-4.7` and reasoning `low` remain unchanged.

Actual context/catalog eve/Next build passed with inert database URLs (`local-artifacts/007/build-staffing-context-catalog-v2.log`, ignored/private); this build predates the subsequent provider-wrapper/step-hook changes. Provider retry/catalog and existing profile-tool checks passed **2 files / 11 tests in 459 ms**. The latest focused availability, strict tool/dependency/provider and profile-tool checks passed **5 files / 23 tests in 1.05 seconds**; availability tests mock immutable binding metadata and are not actual native evidence. Node 24 typecheck and whitespace checks passed after the step-hook changes. No new implementation task was marked complete. Current owned SQL, native transport, WebKit execution, live evaluation, representative load, recovery and Preview gates remain open.

### Continued implementation — native dispatch, release, settlement and explanation UI (2026-10-01)

Connected the staffing branch of native prepare/claim/derive, production root paid-step selection and pre-provider reauthorization, injection, all visible projection paths, chunk/reconnect release, saved conversation history and exact receipt replay. Preparation now creates a distinct server-owned native request UUID and conversation operation ID. Staffing sends use exactly one native POST; an ambiguous result or pre-admission rejection never triggers the ordinary route's automatic retry loop. Initial content is charged in the dispatch-claim transaction before native IO. Paid wrappers retain the selected Grok model and low reasoning, permit one generate OR stream, filter the final catalog, recheck the exact admitted step/injection/source union immediately before IO and combine caller cancellation with the original deadline. Instruction normalization/charging now matches native NFC/LF text and enforces the transport's 16384-byte limit as well as 8000 characters.

Completed history requires current original authority/snapshot/dependencies; cancellation, expired/uncertain states and changed inputs refuse content. Metadata-only event/recovery handling validates exact input/cursor/turn associations and can settle usage/terminal state after cancellation, login expiry, source withdrawal or feature disable without copying model messages. Migration 034 adds scoped append-only actual native step usage receipts with nullable counts; role restrictions, manifest checksum and owned schema assertions were updated. Owner-only advisory status reports a token total only when every admitted step reported it, preserving actual zero and unknown. Committed native usage emits only redacted numeric telemetry. The installed native route inventory contains zero WebSocket routes; any future WebSocket route fails closed rather than bypassing HTTP release governance. These SQL paths and migration changes remain **unproven** on the current owned database.

Added fresh advisory/status/cancel routes and the demand-page explanation component with explicit operational or finance/scenario binding, exact preparation reconciliation, one explicit dispatch, saved status, durable stop, current-output removal and independent deterministic comparison/decision UI. Session storage retains only the attempt ID. Finance choice visibility reflects the current mcteer manager predicate; server authorization remains authoritative. The UI is authored/typechecked, **not WebKit-validated**.

Actual focused provider/context/contract checks passed **2 files / 15 tests in 263 ms** and the broader focused check passed **6 files / 31 tests in 1.01 seconds**. Node 24 typecheck and whitespace checks passed. Eve/Next build passed with inert database URLs (`local-artifacts/007/build-staffing-native-bridge.log`, ignored/private); that build predates the subsequent explanation UI, usage telemetry and native-fixture additions. Current typecheck passed after those additions.

Authored four actual eve/native HTTP cases in `tests/integration/staffing-native.test.ts`, using a bounded fixture model installed solely in an owned disposable app copy while retaining production admission/filter/fence wrappers. Cases cover real native association/injection/tool/usage events, exact replay/provider-count preservation, owner/finance denial, saved-output source retirement, attached-stream withdrawal and cancellation while a native provider invocation is held at an explicit barrier. A separate synthetic SQL case covers immutable unknown usage after cancel/login revocation; it is not actual native proof.

The attempted current owned native check failed in suite setup with **ENOTFOUND on the marked test source**, before connection/marker inspection or clone creation. **0 passed / 4 skipped by failed setup**; no native case executed. Private JSON/diagnostic artifacts are under ignored `local-artifacts/007/`. No fallback database, paid provider, Preview, Production, Vercel link or deployment was used. T009/T010/T012/T055–T066/T067 and all current native/database/UI/live/load/recovery/Preview gates remain unchecked. No new task was marked complete.

### Continued implementation — direct legacy UI comparison and owned journey/recovery coverage (2026-10-01)

Directly inspected the read-only legacy operations/planning route re-exports and their actual `app/portfolio/page.tsx`, `app/operating-model/page.tsx` and `app/_components/services-plan.tsx` implementations. Earlier reference notes were not a direct comparison of the new staffing screens. The legacy's compact metrics, exception-first review and calculation details now guide 007 operations and finance scenarios. Operations shows explicitly loaded-page metrics and daily minute tables in labelled keyboard-focusable scrolling regions. Finance displays exact persisted amounts as currency (including negative cents, zero and JPY); the unchanged grouped minor-unit calculation remains available beneath the totals. No legacy demo assumptions or annual business planning were ported. This was a source comparison, not visual validation.

Actual Node 24 typecheck and whitespace checks passed. Six synthetic formatter checks passed, including a negative cent and the maximum derived amount. The first formatter command was blocked by the sandbox's denial of tsx CLI's IPC listener (`EPERM`); using Node's `--import tsx` loader completed the same check without that listener. This does not establish app/native server availability in the sandbox.

Available unit checks passed **55 files / 229 tests in 5.30 seconds**, explicitly excluding the required unavailable Temporal resolution suite. Documentation/hygiene passed for **101 authored Markdown files**. Eve/Next build passed with inert database URLs (`local-artifacts/007/build-legacy-ui-journey.log`, ignored/private); this build includes the UI layout, generic staffing-status branch and new browser-journey source, but predates the subsequent recovery additions.

CLI Playwright discovery found **28 operations/advisory cases across four WebKit configurations**, and separately **four journey cases**. Discovery is not execution, screenshots, axe results or overflow proof. The actual staffed browser journey now uses the same real artifact scan/extraction, 003 review, 005 retrieval, shared-practice review, 006 acceptance, reviewed workforce scan/import and calendar preparation as the domain journey; browser actions then create and qualify demand, compare candidates, propose, human-review/confirm, enter finance inputs, approve the exact policy and create a scenario. The persisted source/competency/allocation/baseline identities and independently expected USD 100/5/20/75/40 totals and 75% margin are asserted. Earlier stages are domain setup, not claimed as browser actions. These new journey cases remain **unrun**.

Added `staffing-recovery.test.ts` for real upload/lease reclamation after DB client reconnection, stale lease refusal, disable-time cancellation and idempotent cleanup preserving a newer independently owned original. The cleanup case does not by itself prove replacement generations of the same source. Added a fifth actual-native case for durable cancellation and receipts across a real Next/eve/maintenance supervisor restart using the same selected database, artifact/workforce stores and eve workflow directory; it reconnects database clients and does not reboot managed Neon. Added the owned-only `staffing:recovery:check` runner, which requires all seven native/recovery cases without skips and captures diagnostic reports privately. These recovery/native cases remain **unrun**.

The generic conversation-status endpoint now uses the same owner-authorized nullable usage projection as staffing status; a pending admitted step cannot become a reported zero through that endpoint. A corresponding pending-native assertion is authored but **unrun**. Current Node 24 typecheck and whitespace checks passed after the recovery additions. No task was newly marked complete. Current source/acceptance/hidden-lineage SQL races, full isolated staffing checks, actual native/WebKit execution, required Temporal dependency, representative performance, eight-case live evaluation, complete recovery and Preview gates remain open. In particular, operations still needs full current competency/source/baseline/grant review flags for retained commitments. Production and Preview were not contacted or changed.

The actual isolated-suite manifest check found **45 suites present**, including the newly authored recovery suite. A synthetic HTML preview was generated from the actual extracted `StaffingOperationsReport` presentation and current CSS, without a database or network requests. Its CLI WebKit launch **aborted before creating a page** (`Abort trap: 6`, browser exit 134). Consequently **zero visual/axe/overflow cases ran and no screenshots were produced**. Private preview sources/HTML are ignored under `local-artifacts/007/`; they are not authenticated journey or hosted proof. The current WebKit launch failure is an additional execution blocker, independent of test-source DNS. No host browser was used.

The latest eve/Next build passed with inert database URLs (`local-artifacts/007/build-legacy-presentation-recovery.log`, ignored/private), including the extracted actual capacity presentation and authored recovery/native cases. The owned recovery runner was attempted with Node's tsx import loader and failed with a redacted **ENOTFOUND** classification before test execution. No recovery case ran. All **34 checked-in migration checksums** matched; this is file integrity, not SQL execution or role validation.

### Continued implementation — representative performance runner and isolated query accounting (2026-10-01)

Authored `scripts/benchmark-staffing.ts` and `benchmark:staffing`. The owned-only runner prepares the actual reviewed source-bound baseline/import, then constructs 500 resources, 50 skills, 20000 competency revisions, 10000 dated historical allocation rows and 91 service dates. Historical confirmed rows are an explicitly physical synthetic load fixture, not human-confirmation evidence. Actual measured confirmations use proposal, exact preview and decision commands. Five logical clients have separate current demands/resources so unrelated confirmations do not intentionally invalidate one another's exact review snapshots. Synthetic setup obtains new authorized fixture sessions rather than editing old login expiry timestamps. Corpus counts and original scanned/imported/baseline lineage are asserted before timing.

Each class has ten warmups and 100 measured calls with five clients. Timings include roster, detail, whole-pool matching plus page release, operations and confirmation acknowledgement; proposal/preview setup is excluded from confirmation timing. The runner reports unrounded p50/p95/p99, warmup/measured failures and actual SQL-call counts, and requires every p95 at most 2000ms with no correctness failures. It checks independent 480 available/60 protected/419-or-420 remaining minute values, 119 minimum remaining minutes after matching, restricted sentinel absence and review flags for retained stale commitments. Stale cases are deliberately present on the first operations page; a missing review flag cannot pass the benchmark solely through low latency. Source-bound and hidden shared-origin lineage remains in the actual accepted baseline. This runner/corpus is **unrun** and still needs owned database correctness and representative runtime proof; T069 remains unchecked. Setup cost also remains unmeasured.

`lib/server/db/query-counts.ts` installs instrumentation only on the benchmark process's selected pool. Async contexts separate overlapping calls, pool callback queries are not charged twice, transaction boundaries and failed queries count, and connection methods are restored at release. Query text, parameters/results and credentials are never captured. Ordinary application pools have no installed observer. The installed pg-pool source was inspected to confirm its callback query path; this is not a real database execution test.

The first new observer check failed on a test syntax/type error; those errors were fixed. The latest focused check passed **1 file / 3 tests in 76 ms**, using an explicitly fake pool to cover concurrency, failure counts and method restoration. Current Node 24 typecheck and whitespace checks passed. The isolated staffing manifest now contains **46 suites**. Added `.vitest/` to ignores so generated diagnostic JSON cannot be accidentally committed; existing report files were preserved. No task was newly marked complete. Actual SQL/source/lifecycle/acceptance/hidden-lineage races, complete staffing/Temporal/native/WebKit/live/load/recovery/Preview gates remain open. The known operations commitment-eligibility review projection still needs implementation.

### Continued implementation — retained commitment review projection (2026-10-01)

Implemented the previously missing operations review checks. The selected customer's retained commitment identities now acquire all plan heads, the sorted union of original public/private plan-source headers, engagement heads and demand heads before partner authority, workforce sources/skills/competencies, resources, calendars, allocations and capacity ledgers. Baseline source eligibility and evidence quality are checked before reading only the plan evidence summary and required-skill portion of the bound demand. Other customers supply numeric capacity aggregates only. Current accepted baseline/revision, demand state/revision, required competency level/source/freshness and dated partner authority failures produce review warnings without releasing committed minutes. A final identity-range check refuses concurrently inserted or changed commitments, including first-row phantoms; the existing capacity-range check remains.

Added an integration case using actual proposal, preview and human-confirmation commands, then actual manual-evidence withdrawal and demand cancellation. It asserts that current load becomes review-required, its capacity remains identical and private evidence/original evidence IDs remain absent. This case is **unrun**: the disposable test source remains unavailable. Batch source-lock SQL, lock ordering under real concurrent writers, hidden-lineage races and acceptable operations latency require disposable validation; no task was marked complete.

Actual Node 24 typecheck and whitespace checks passed. Focused capacity, freshness, dependency and query-accounting unit checks passed **4 files / 18 tests in 318 ms**. Eve/Next build passed with inert database URLs (`local-artifacts/007/build-operations-eligibility.log`, ignored/private). These checks establish local compilation and the existing pure arithmetic/fence contracts, not execution of the new SQL or full feature readiness. Full owned gates, CLI WebKit visual/accessibility proof, eight-case live evaluation, representative benchmark and Preview inspection/upgrade remain unchecked.

### Continued implementation — legacy intervention comparison and delayed-read guards (2026-10-01)

Reviewed the legacy engagement page's pending-intervention presentation read-only. Matching now shows unmet feasibility checks first and exposes satisfied checks through a native keyboard-accessible disclosure; its explicit proposal/confirmation distinction remains. No separate legacy resource-directory, competency-review or staffing-import route was identified in the bounded source inventory. These new interactions still require their own actual browser proof.

Added request-generation/scope guards to resource detail, competency history/pagination and finance-input selection/reload. A newer selection, reload, denial, closed history or unmounted page invalidates older responses; current denial also clears protected detail. Pagination deduplicates stable revision/skill/input identities. Selecting a finance input is disabled while an editor is open, preserving its unsaved fields. Extended the source-withdrawal browser case to delay an actual eligible history response across withdrawal, and added a finance case delaying an actual eligible input response across resource inactivation and a newer withheld selection. Both race cases are **unrun**.

Actual Node 24 typecheck/whitespace checks passed. CLI Playwright discovery found **76 cases across three suites and four WebKit configurations**; discovery executes no browser assertions. Eve/Next build passed with inert database URLs (`local-artifacts/007/build-legacy-matching-read-guards.log`, ignored/private), including the presentation and read guards. No visual/accessibility, SQL/race or hosted claim follows from that build.

Corrected the actual-output review verifier's unconfirmed-case exception: every case must remain within the specified 120 seconds; an ambiguous durable receipt no longer permits 300 seconds. Synthetic verifier tests assert acceptance at exactly 120 seconds and rejection at 121 seconds. The focused verifier unit check passed **1 file / 6 tests in 127 ms**. These fabricated records only test verification rules. The eight-case native live runner and actual-output evaluation remain incomplete; T072/T073 and all dependent release/Preview gates remain unchecked.

### Continued implementation — actual-source withdrawal journey and command loading (2026-10-01)

Extended the actual trusted-context integration journey: after its real source-bound allocation confirmation and exact finance/partner/lineage assertions, it reads current operations, withdraws the actual uploaded original using the current human lifecycle command, and requires a baseline-review warning with identical retained capacity and no source/personnel/hidden-origin prose. It selects the authorized owner or steward from the original's actual submission metadata. This extended journey remains **unrun**; no source lifecycle/race gate is established by its source or compilation.

007 package commands and owned preparation now use Node's `--import tsx` loader, avoiding the previously observed tsx CLI IPC-listener `EPERM`. Existing 002–006 command wrappers are preserved. Focused manifest/verifier unit checks passed **2 files / 7 tests in 301 ms**. The latest available unit run passed **56 files / 233 tests in 7.31 seconds**, explicitly excluding the required unavailable Temporal resolution suite.

The actual full `npm run test:staffing` command was attempted after the loader change. It failed before owned clone setup/testing with **redacted `ENOTFOUND`**, not the former IPC-listener error; **no database case ran**. Added a whitelisted error-code diagnostic to that runner without exposing the database address, credentials or raw error. The first failed run's static diagnostic is preserved privately in `local-artifacts/007/staffing-full-loader-check.log`. No incomplete task or release gate was checked off.

### Continued implementation — bounded live stream capture primitive (2026-10-01)

Read the installed eve client, streaming, session protocol and evaluation docs. Authored `scripts/staffing-live-stream.ts` using the installed `eve/client` fixed-session attachment rather than creating or sending a turn. Capture allows an owned local HTTP origin only, refuses credential-bearing target URLs/redirects, uses an absolute cursor, disables automatic stream reconnection, checks original turn/stable event identities, bounds retained bytes/events and respects the earlier original 120-second case or suite deadline. Denial is numeric metadata only; incomplete connections remain unconfirmed and raw client error bodies are never serialized. Closing this reader is explicitly not durable cancellation. The full eight-case runner still needs setup, lifecycle orchestration, actual context/tool/provider observation, cancellation/recovery and rubric-bound evidence; this primitive is not T072 completion.

The first mock-HTTP checks failed because the synthetic stream responses omitted the installed client's required stream-version header. Those fixtures were corrected to the actual version-25 protocol. A subsequent typecheck caught the session-completed event's lack of `data`; the reader now narrows that union explicitly. Latest focused mock-HTTP/manifest checks passed **2 files / 8 tests in 258 ms**, covering GET-only attachment, cursor/terminal identity, split UTF-8, deadline/no retry, denied-body privacy, incomplete streams and invalid target/event identities. Current typecheck/whitespace checks pass. The staffing manifest contains **47 suites**. These are mock HTTP records consumed by the real SDK, not actual eve sessions or paid model output; all live and dependent release gates remain open.

### Continued implementation — live coordinator, real-input observation and strict deterministic coverage (2026-10-01)

Authored `scripts/eval-staffing.ts` and `eval:staffing`, owned provider observation, actual eight-case builders, native runtime helpers, source-byte binding and private evidence capture. Before any live dispatch the coordinator requires typecheck, every staffing suite, owned002–006 regressions, the full WebKit matrix, recovery, representative benchmark, build and docs. Deterministic child processes receive no gateway key. Each fixed live case owns a fresh clone/app/store/eve pair, preserving the actual actor admission window. There is no CLI gate bypass, source/database override or automatic paid retry. Live setup counts toward20minutes, while each turn retains its original120-second allowance. Real provider inputs/catalog/output limits are observed in an owned app copy; the selected model, low reasoning and production admission/fence wrappers remain. Observation is before provider IO and does **not** establish that a provider completed or billed a step. Native usage remains null when unknown.

S01–S08 setup uses actual human/domain commands and the trusted source/import journey; S03 changes a real calendar after a real initial confirmation, S05 materializes an actual other-customer sentinel, S06 persists a missing-nonlabor scenario and later revises its consumed rate, and S07 includes quoted injection in an actual uploaded/reviewed source. Owned-only barriers before the second provider IO support source withdrawal and durable stop/paired restart without manufacturing the first provider output. S07 probes the actual generic mutation/research/context callbacks and the shared production procedure gate, and rejects caller-added customer scope through the strict staffing read contract. These are authored **unrun** native/SQL paths; there is no actual eight-case outcome or score yet.

The first coordinator attempt failed during CLI import because Node cannot consume the bundler's raw Markdown skill import. Factored the existing procedure authorization into a shared server gate used by production `load_skill` and live denial probes; no procedure authorization was removed. The next actual coordinator attempt passed its typecheck preflight, then its mandatory full staffing preflight failed with redacted **ENOTFOUND** before clone/testing. It made **zero live dispatches**. Unique private reports remain under `local-artifacts/007/live-xvPf4U/`; failed setup diagnostics are separate from paid-model evidence. Failed/partial paid cases now retain real snapshots, tool payloads, observed provider inputs, native events and receipts before clone disposal. Actual semantic assertions and all rubric scores remain unset pending review; capture alone cannot pass the verifier. The verifier now permits an actual failed S04 terminal only with both required change-fence proofs, while ordinary response cases still require completed nonempty stream output.

The deterministic staffing reporter now checks exact suite coverage, passing assertion counts and zero failed/skipped cases rather than only Vitest exit status. Its report-format check actually ran **2 suites / 9 tests, zero failures/skips** with verbose plus private JSON reporting. The manifest now contains **48 suites**. Latest focused mock-provider/HTTP, verifier, manifest and catalog checks passed **5 files / 23 tests in1.06seconds**. Latest broader available unit run passed **58 files / 246 tests in5.24seconds**, explicitly excluding the required unavailable Temporal resolution suite. Current Node24 typecheck, whitespace and documentation checks passed (**101 authored Markdown files**); eve/Next build passed with inert database URLs (`local-artifacts/007/build-live-coordinator.log`). No new task was checked off. All real SQL/lifecycle/acceptance/native/UI/recovery/performance/live and Preview gates remain incomplete; Production and Preview were not contacted or changed.

### Continued implementation — cleanup after same-competency correction (2026-10-01)

Added an owned recovery case that uses actual manual creation, exact human acceptance, correction on the same competency aggregate, fresh acceptance of the corrected revision and withdrawal of the original manual evidence. The pending correction must retain the old accepted pointer until its own decision. After database reconnection and two actual cleanup ticks, it requires the corrected level/evidence to remain readable/current, the old history to remain withheld and only the corrected payload to survive. The two evidence headers are intentionally distinct immutable original identities; this is not a claim that a retired original was revived or its approval inherited. The existing separate-original cleanup case remains.

The recovery runner now requires all **eight authored cases** (three lease/cleanup plus five native cases), exact coverage of both files and zero skipped/failed assertions through the shared strict reporter. The new case is **unrun** because the known test-source DNS blocker persists. Typecheck passed after authoring it; this does not execute cleanup SQL or establish recovery. T015/T022/T068 and all dependent release gates remain unchecked.

S04/S08's fixed instructions now explicitly request a real first bound demand tool read; the runner refuses to fabricate that first provider/tool step if the model does not perform it. Its capture also refuses invalid event timestamps and any newly emitted model text after source-change/cancellation begins, in addition to requiring current owner status and denied replay. This conservative check does not assert that already released pre-change bytes can be recalled. The source binding also covers authored docs/governance; two actual consecutive fingerprint reads agreed on the same64-character digest. Focused verifier/manifest/catalog checks after the instruction update passed **3 files / 12 tests in819ms**. These remain local verification, not an actual lifecycle/live outcome.

Reviewed the older regression fixtures before execution: they call route handlers directly with Requests at `http://127.0.0.1:3000`, so only that child process's expected origin is aligned; its database/store remain the owned clone and no listener is started. The optional legacy `runtime-restart.test.ts` requires an externally prepared conversation and otherwise skips, so it is explicitly excluded from this **deterministic** regression selection and reported as a separate recovery obligation. The coordinator still requires the owned native recovery gate independently. This selection is not a claim of legacy hosted/native restart proof. Current focused stream/provider/verifier/manifest/catalog checks passed **5 files / 23 tests in1.34seconds** after timestamp validation; typecheck/docs/whitespace checks passed again. No database regression or native recovery case executed.

Strengthened owned paired-restart evidence in both the native test and live S08: require canonical owned app/artifact/workforce/workflow directories without symlink substitution, preserve directory device/inode identities and both ownership-marker digests, and recheck the actual selected database name/environment/schema034. Legitimate workflow journal writes remain possible; the test does not freeze file contents. The live evidence retains the before/after pair identities and unchanged admitted-step identities privately, and requires an actual native terminal metadata projection for S04/S08. Missing terminal evidence remains a failed/unconfirmed gate rather than an inferred cancellation/completion. These additional real database/native paths remain **unrun**. Typecheck passed after the changes.

### Continued implementation — cancellation uncertainty, run allowance and write evidence (2026-10-01)

Resumed the checked-in implementation skill and current governance/spec/task review without discarding uncommitted work. The requirements checklist still passes **16/16**; that is specification quality, not implementation completion. Fresh guarded DNS checks returned **ENOTFOUND** for both the marked test source and package registry. Docker inventory was read-only; no unrelated container was altered, no new denied container-creation command was retried and no alternate unmarked database was used.

Extended live S08 to call the actual signed metadata-only reconciliation endpoint on the owned native supervisor after the paired restart and original-turn cancellation RPC. Its classification now requires either an actual native terminal projection plus settled reconciliation, or durable cancelled advice with a still-stopping native response, no terminal projection and an actual retry result. The latter evaluation outcome is explicitly **unconfirmed**; it does not relabel the persisted advice or invent a native terminal. Admitted paid-step identities must still equal the pre-restart identities after reconciliation. Missing/denied/inconsistent evidence fails instead of becoming an unconfirmed passing record. This supersedes the preceding paragraph's S08 terminal-only requirement; S04 still requires its actual terminal projection. These actual HTTP/SQL/native paths are **unrun**.

Added an absolute original-allowance helper to owned environment setup. Preparation/migration child timeouts and restart readiness are capped at the remaining suite allowance, and expired setup refuses subsequent work. Cleanup still runs after expiration. Runtime preparation/fixture/start failures within the owned callback now retain a private failed-case record. This does not prove a strict 20-minute wall-clock bound for every filesystem copy or database query: those in-flight operations and complete live orchestration still need actual disposable validation; T072 remains unchecked.

The live runner now snapshots immutable workforce/staffing command receipts before dispatch and after capture. It rejects extra writes, removed/changed receipts and duplicate allowances; S06 permits only its exact manager/request/action/table rate-change receipt. The original all-customer allocation-ledger digest remains mandatory. This adds evidence for governed staffing writes beyond allocation changes; it is not a claim of a global cross-domain database audit. Actual receipt SQL is **unrun**. The root development supervisor's two workers now use the current Node executable with `--import tsx`, avoiding the tsx CLI IPC listener that previously failed with EPERM while preserving their environment and stores. JavaScript syntax and the existing stalled-watchdog maintenance unit check passed; real supervisor readiness/restart remains unproven.

Actual focused classification/transport/deadline/write-verifier/review/manifest/maintenance checks passed **4 files / 20 tests in 417ms**. Fixtures explicitly use synthetic metadata and mocked HTTP; they are not native cancellation or live output proof. The complete available unit selection passed **59 files / 256 tests in 6.24seconds**, explicitly excluding the required unavailable **six-test Temporal resolution suite**. The actual suite inventory now has **49 staffing suites**. Node24 typecheck passed. Eve/Next build passed with inert database URLs and no gateway key (`local-artifacts/007/build-cancellation-deadline.log`, ignored/private). Docs/hygiene passed for **101 authored Markdown files** and whitespace checks passed before this documentation append; the final documentation checks are recorded below.

The first direct staffing child invocation omitted the package script's environment-file loader and failed its configuration guard before database access. Re-ran the actual configured `npm run test:staffing` package command with the gateway key removed: **ENOTFOUND**, before clone creation or any database test execution (`local-artifacts/007/deterministic-cancellation-deadline-configured.log`, ignored/private). No SQL/native/UI/recovery/performance/live gate passed. All 63 previously open tasks remain unchecked, including T072–T077. Preview and Production were not contacted or changed; no Vercel link/deployment, commit, PR or merge occurred.

Added three actual two-transaction competency races: competing exact acceptances must produce only one decision/receipt and preserve exact replay; acceptance versus original-source withdrawal must leave no readable withdrawn skill regardless of the winner; acceptance versus correction must commit exactly one transition without inheriting approval or leaving a rolled-back replacement source/receipt. These call actual governed commands with separately committed owned fixtures and Promise.allSettled, not mocked SQL/interleavings. They are **authored but unrun**, so T015/T021/T025/T028 remain unchecked. Current typecheck and whitespace checks passed after the additions. The preceding successful build predates these test-only additions; no application code changed afterward. Final docs/hygiene checks passed for **101 authored Markdown files** after the first append; the final checks below also cover this race note.

### Continued implementation — current UI reads and allocation races (2026-10-01)

Hardened allocation list/detail selection and review-preview polling with scope and request generations. A newer denial clears protected content and invalidates older responses; an older eligible response cannot restore a withdrawn preview or replace a newer withheld detail. Calendar authority denial also clears an open manager draft. Eligible refreshes continue to preserve dirty drafts and their captured revisions. Added three actual-response browser races for allocation resource inactivation, review-preview source withdrawal and calendar session revocation. These WebKit cases are **authored but unrun**.

The UI gate now binds the source before setup, discovers every selected file/project and requires the exact discovered cases to pass once, with no skips, retries, duplicates, missing cases, expected failures or false aggregate counts. Unique private `ui-*` report directories preserve prior attempts; only a completed passing run writes `completed.json`. Synthetic verifier rejection checks passed **2 files / 5 tests**. A separate installed-Playwright reporter-format probe passed **2 Node-only tests**, launched **zero browsers** and used no database/model; it establishes reporter compatibility, not UI behavior. The staffing suite inventory now contains **50 suites**.

Added nine real owned-database cases across the decision/lifecycle suites: separate demands competing for resource/date capacity; cross-resource amendment versus cancel with complete old/new ledger assertions; current session revocation before committed receipt replay; full confirmation rollback after an owned allocation-specific SQL fault following ledger writes, followed by exact retry; confirmation versus reduced calendar capacity, original withdrawal, resource inactivation, exact competency retraction and actual accepted-plan baseline replacement. A committed-key/different-rationale check also rejects conflicting replay. The race fixtures call governed commands in separate transactions; retained earlier commitments remain counted and require review. Corrected the reservation case to use tomorrow's UTC date rather than an already-expired fixed midnight, and gave the amendment replacement resource its own unique external identity. These SQL cases are **authored but unrun**; test discovery/typecheck do not establish serialization or rollback. Remaining grant/pointer/demand-history race obligations are still open under T039.

The available unit selection passed **60 files / 259 tests in 5.60seconds**, explicitly excluding the still-unavailable required **six-test Temporal resolution suite**. Node24 typecheck passed after all additions. Eve/Next build passed with inert database URLs and no gateway key (`local-artifacts/007/build-allocation-races.log`, ignored/private); the subsequent changes were test-only and documentation. Actual configured `npm run test:staffing` and `npm run staffing:ui:check` both failed with **ENOTFOUND** before clone creation or database execution. The latter discovered **27 desktop-light cases and executed zero**. Private logs: `local-artifacts/007/allocation-gates-s0GaVF/`. No SQL, WebKit, trusted journey, recovery, benchmark or live case passed in this continuation.

All **63 open tasks remain unchecked**. Preview and Production were not contacted or changed; there was no Vercel link/deployment, commit, PR or merge. Test-source/package-registry access, the pinned Temporal dependency, browser execution and disposable gates remain prerequisites to acceptance. The workspace still forbids network escalation and Git metadata writes; no restriction was bypassed.

The continued UI audit also found unsequenced demand context/selection/taxonomy reads. These now publish only within the current customer/engagement and latest request, publish combined context atomically, ignore superseded detail failures and clear current denied content/drafts/candidate selections. Match reads and command results are also bound to current scope/request generations. Added a fourth actual-response browser race: a delayed readable demand selection must not return after a newer real browser-session denial. Matching UI scenarios reset only the owned synthetic write windows between cases; admission behavior within each case remains intact. These changes and the new browser case are **unrun in WebKit**.

Final Node24 typecheck and whitespace checks passed. The updated Eve/Next build passed with inert database URLs and no gateway key (`local-artifacts/007/demand-read-gates-tP9evg/build-check.log`, ignored/private). The actual updated UI gate discovered **28 desktop-light cases and executed zero**, then failed **ENOTFOUND** before clone creation (`local-artifacts/007/demand-read-gates-tP9evg/staffing-ui-check.log`, ignored/private). Vitest discovered **19 decision/lifecycle cases** without execution. The final docs/hygiene check covers **101 authored Markdown files**. These results do not replace the missing SQL, Temporal, native, UI, recovery, performance, live or Preview gates; task completion remains **14/77**.

Authored two further actual owned-database lifecycle cases: real partner customer-grant revocation racing confirmation (with restored fixture grant state afterward), and a governed first confirmation retaining both stable resource/demand ledgers through reduced and cancelled demand revisions until exact identity-only release. The reviewed proposal helper accepts explicit resource identity overrides for the partner case. This expands decision/lifecycle discovery to **21 cases**, including **11 newly authored database cases** in this continuation. It supersedes the preceding note that grant/demand-history cases were not authored; their actual execution and the remaining pointer/race acceptance evidence are still missing. Typecheck and whitespace checks passed after these test-only additions. `npm cache ls '@js-temporal/polyfill'` returned no cached entries, so the required pinned dependency cannot be installed from local npm cache. No unchecked task was marked complete.

### Owned local 007 continuation — current gate status

The dedicated marked local test source `turas_test_local_007_v2` was reachable; all destructive runs used owned clones. Node 24 `npm run test:staffing` passed **51 files, 269 tests, zero skips/failures**, including the actual reviewed-source journey, partner projection and five native transport cases. The native case now waits for terminal response metadata after a withdrawn source, tests unreadable history/stream, and isolates synthetic profile-read windows between cases. Across a paired restart, an old-generation native turn may remain `stopping`; durable cancellation and unreadability were verified, but a native terminal event was **not** claimed. Removed temporary private-log writes and stage-specific production errors. The operations suite was corrected to select its own resource rather than assume a fresh database between cases in one file.

`npm run staffing:recovery:check` passed **2 files, 8 tests** in an owned paired supervisor/database/store scope; this is not hosted backup proof. Current Node 24 typecheck, local eve/Next `build:check` with inert database URLs, `check:docs` (101 authored Markdown files) and `git diff --check` passed. The complete four-project WebKit gate **timed out after 600 seconds**: desktop-light discovery found 28 cases, but no execution report or completion marker was written. Investigate owned environment startup/test execution before rerunning; no UI pass is claimed.

The representative benchmark constructed its 500-resource/50-skill/20,000-competency/10,000-allocation/91-day corpus in an owned clone and ran 100 measured calls per class. Its **gate failed**: roster p95 48.69 ms (0 failures), detail p95 12.97 ms (**100/100 failed** a detail assertion), matching p95 5960.96 ms (**70/100 failed**), operations p95 173.13 ms (0 failures), confirmation p95 52.40 ms (0 failures). Five clients and ten warmups were used. The fixture now resets only owned synthetic write windows between seeding batches and outside timed confirmation preparation; the production admission limit was not changed. Detail correctness and match performance/correctness still require diagnosis and remediation; SC-005 is **not met**. Private measurements remain in ignored `local-artifacts/007/benchmark-*/report.json`.

The affected 002–006 aggregate regression runner also **failed**: 41 files failed, 58 passed, 100 assertions failed and 244 passed (7 pending). Most database cases rejected the runner's configuration because the owned clone was assigned to both `TURAS_TEST_DATABASE_URL` and the application database; the legacy guard requires distinct databases. Correct the guarded regression harness using separately owned test and app clones, then rerun; do not weaken that guard. The live eight-case evaluation was not dispatched, no actual-output review was performed, and Preview inspection/upgrade is prohibited while disposable gates fail. No PR, merge, deployment, Preview or Production mutation occurred. Keep T069, T071, T073–T077 and their dependencies unchecked; the feature is **not ready to merge**.

### Local follow-up — full UI execution and unresolved load/regression gates

Node 24 full `npm run staffing:ui:check` passed **112/112 actual CLI WebKit cases** across desktop/mobile × light/dark, six suites per project, zero failures/skips/retries. The earlier timeout was superseded by real execution. Focused operations (6/6), allocations (4/4), native advisory (2/2) and trusted journey (1/1) also passed in owned clones. Fixed accessible labels, demand row identity, initial customer-option load synchronization and isolated synthetic import write windows. These tests do not prove hosted behavior. `npm run test:staffing` subsequently passed **51 suites / 269 tests**, zero failures/skips; Node 24 typecheck and whitespace checks passed after the code changes. No private diagnostic runner was retained.

The representative load run still **fails** SC-005 despite resolving the earlier detail and matching correctness failures. The most recent complete run reported zero correctness failures across all five classes; p95 roster 47.05 ms, detail 10.23 ms, matching **6320.16 ms** (limit 2000 ms), operations 170.02 ms and confirmation 50.27 ms. A separate timing run measured matching create p95 3971.90 ms and page release p95 2814.94 ms. Owned, numeric-only diagnostic traces on the representative workload measured approximately 600 ms for one full feasibility snapshot, including approximately 340 ms for calendar input resolution (about 140–160 ms for interval retrieval); five active clients amplify the cost. Temporary production instrumentation was removed. Five distinct synthetic internal actor identities now replace the former five sessions for one actor; original production admission limits were not relaxed. Matching still requires an authorization-preserving performance fix and full passing benchmark rerun.

The initial aggregate 002–006 regression attempts used separate owned databases but failed because 006 needs a separately named selected application clone, synthetic profile windows crossed independent cases and local owner connections bypassed runtime-role assertions. The corrected Node24 `npm run test:staffing:regressions` passed **99 files / 356 tests** in three guarded owned clone selections: 002–005 **93 files / 334 tests**, 006 plan foundation/lifecycle/authoring/etc. **5 files / 19 tests**, and a separately owned plan drafting clone **1 file / 3 tests**. All had zero failures/skips. A true PostgreSQL `turas_runtime` role was selected on the disposable app connection; only guarded synthetic profile windows reset between independent older tests. The forward-migrated 006 foundation assertion accepts schema version ≥31 while still checking scoped tables and invariants; the dated quality assertion computes the exact policy result at its persisted `as_of` rather than assuming a fixed calendar month. No old test was deleted or muted. The externally prepared native 002–006 recovery case remains an explicit separate exclusion; 007 paired recovery passed earlier.

A later benchmark after isolating five actor identities and avoiding unnecessary no-overlap interval work still failed solely on matching latency: **p95 6207.80 ms** (create 3913.65 ms, release 2572.43 ms), zero matching correctness failures; other four classes passed. An authorization-preserving page-read optimization removed a redundant same-transaction demand re-read; all **269/269 staffing tests** and typecheck passed afterward, but the measured benchmark still failed at **p95 6202.37 ms** (create 3876.25 ms, release 2570.88 ms). Diagnostic query classification was removed; production read checks remain intact. SC-005 and T069 remain open. The eight-case live runner enforces the benchmark as a deterministic preflight, so no paid model turn was dispatched and no first live response exists to review. Preview remains untouched. T073–T077 and dependent work remain unchecked; T071's full UI gate passed, but the required final convergence/Preview work has not occurred.

### Final owned validation and Preview upgrade (2026-10-01)

The previous blocked-state paragraphs are historical checkpoints, superseded by
these completed checks. All destructive tests below used the separately marked
local test source and owned clones with isolated database, workforce, artifact,
worker and eve workflow state. The selected database and `.eve/.workflow-data`
were preserved. Node 24.21.0 ran the project commands.

- The final live-run preflight passed `npm run test:staffing`: **51 suites / 271
  tests**, zero failed or skipped. It included real import, exact acceptance,
  demand/matching, confirmation races, economics, native transport and the
  complete 003–006 reviewed-source-to-finance journey. The delivery-context
  reread case verifies 125 governed staffing rereads do not consume the generic
  user-read quota while an ordinary profile read still does.
- Affected 002–006 regression selection passed **99 suites / 356 tests**, zero
  failed or skipped, using guarded owned application/test clones. The
  externally prepared old native-restart fixture is outside this deterministic
  selection; the feature's paired native recovery gate passed separately.
- CLI WebKit passed **112/112** staffing cases across desktop/mobile and light/dark,
  zero failures/skips/retries. This included reviewed import, match, allocation,
  operations/finance, advisory and trusted journeys, keyboard and accessibility
  checks and restricted-field response/DOM assertions.
- `npm run staffing:recovery:check` passed **2 suites / 8 tests** in an owned
  paired database/store/eve restart. This proves the local recovery cases, not
  hosted backup or restore.
- The final representative benchmark passed with **500 resources, 50 skills,
  20,000 competency revisions, 10,000 dated allocations, 91 days, ten warmups,
  100 measured calls per class and five clients**. There were zero correctness
  failures. p95 was roster **65.44 ms**, detail **18.53 ms**, matching
  **935.88 ms**, operations **200.82 ms**, and confirmation **93.66 ms**, each
  below the 2,000 ms gate. The fix caches only exact locked calendar inputs and
  uses a compact dependency digest; current authorization, source and eligibility
  checks remain in the matching path. A repeated complete run also passed.
- Typecheck, Eve/Next build with inert database URLs, `npm run check:docs`
  (**101 authored Markdown files**) and `git diff --check` passed in the same
  preflight. The CI workflow enumerates the isolated staffing suites and does not
  require a live provider key.

The one bounded `npm run eval:staffing -- --live` run completed after those gates
with **eight initial paid turns, zero automatic retries**, within **297.337 s**.
All eight fixed cases retained actual private context/tool/output/receipt evidence
and were reviewed against their output digests. S01–S03 and S05–S07 completed
native answers with cited governed inputs; S04's source change fenced active
output/replay, and S08's cancellation/restart retained an unconfirmed durable
state without a second turn or substantive late answer. All case scope, citation,
numeric, privacy, write and paid-step hard gates passed. The completed answers
each scored 8/8 across the four rubric dimensions; S04 and S08 scored 7/8
because the safe outcome withheld a complete answer. The review verifier passed
**8 cases / 27 observed steps / 18 bounded reads / 2 unknown-usage steps**,
with actual-output digest binding and all hard gates. Unknown usage was retained
as unknown, not counted as zero. The S06 authorized rate revision was the sole
permitted staffing receipt change; allocation ledgers remained unchanged.
Raw prompts, personnel, financial amounts and provider outputs remain in ignored
private local artifacts only.

Only after these disposable gates passed, `npm run db:inspect-preview` verified
the configured Preview endpoint and matching `preview-neon-005` marker at schema
**031**, PostgreSQL **18**, pgvector **0.8.6** and **106** public tables. The
explicit transactional migration command applied **032–034** and `npm run
db:roles` passed. Read-only reinspection verified the same marker, schema
**034**, **175** public tables, including **27 workforce** and **37 staffing**
tables. A local Next start against the Preview runtime role reached ready;
unauthenticated session and staffing reads returned `401 authentication_required`,
and the workspace page redirected to login. A read-only runtime-role transaction
verified schema/marker agreement, workforce SELECT, denied payload UPDATE and
permitted advisory INSERT. This smoke did not run the maintenance supervisor or
seed Preview. Production was not connected or changed. No Vercel link/deploy ran.

Convergence checked FR-001–023, SC-001–008, all five story acceptance sets, the
plan's named components and decisions, all 77 original tasks and constitution
principles I–VIII against current source and the checks above. No actionable
remaining implementation task was found. The outstanding release boundary is
review-head CI and PR review; hosted behavior remains unclaimed.
