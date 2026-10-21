# 016 Validation Record

## Baseline

Implementation began in the canonical checkout on `016-pilot-hardening`, planning
commit `699f6f4`, main `db6c0b9a721fcf5f6311b5be8ecd18846e38a8c9`.
Migration manifest is 055; 056/057 are available. Private preservation receipt records
selected configuration, model and all 40,615 root workflow files. No selected database
or Production record was changed. Requirements checklist is 16/16 passing; no
extension hooks are installed. Ignore patterns cover Node/Python/Docker generated
state, private evidence/configuration and credentials.

## Current acceptance

Implementation in progress. No 016 runtime acceptance, hosted provisioning, paid
execution, participant feedback, pilot readiness or release is claimed by this record.
Results will be appended with exact source/environment and truthful gate states.

## Initial implementation checkpoint

- T001: canonical source and preservation baseline recorded privately; no selected
  database, model or root workflow writes performed.
- T004: checked in actual local/hosted capability inventory and lifecycle policy
  references. Missing hosted adapters, classes, matched restore and backup cadence
  are explicitly pending, not readiness passes.
- T015: added dedicated 016 source digest selection, including operational config,
  catalog, tests, contracts and renderer assets; predecessor feature mappings retain
  their own feature identity.
- Narrow verification: 15 readiness contract/selection cases and eight private
  evidence IO cases pass (23 total). `tsc -p tsconfig.pilot.json` passes.
- Private evidence IO rejects unsafe modes, traversal, symlinks, overwrite, altered
  bytes and metadata beyond 1 MiB. A partial run remains technically ineligible;
  checker results never grant human approval.
- These checks cover the initial implementation only. Full US1, migration, owned
  harness, runtime, UI, CI and hosted acceptance remain incomplete. No release or
  production readiness claim is made.

## Owned migration checkpoint

T009/T010/T013: migrations 056/057 initialize an empty owned database and upgrade
an owned 055 database. Six integration cases pass: exact 57-entry ledger and repeat
forward application; unambiguous primary session backfill; ambiguous session
revocation; foreign-principal FK denial; contribution-derived immutable publication
provenance; runtime denial of control writes, workspace provisioning and DDL.

The initial fixture run found bootstrap's runtime workspace INSERT, corrected by
requiring its explicit owner connection. A subsequent fixture SQL parameter typing
failure was corrected and the complete six-case catalog rerun passed. Owned
containers/directories were removed by the harness. No hosted schema was changed.

## Foundation implementation

T002/T003/T005/T006/T008/T011/T012/T014: pinned SDK decisions, fixed named case
inventory and required method/role pairs, planned private command configuration,
strict schemas, owned 016 harness, exact schema/ledger/grant validation, explicit
054–057 learning activation compatibility and finite maintenance status registry
are implemented. Planned command entry points are wired as their implementations
are completed; their presence does not assert readiness. No production configuration
was edited. Remaining story implementations and full catalog execution are pending.

Current narrow checks: 18 readiness cases, eight evidence IO cases, five maintenance
cases (31 total) and six owned migration cases pass. The latter also verifies exact
runtime readiness and owner learning activation on 057. Typecheck passes. The harness
verifies protected model/configuration/root-workflow byte digests after cleanup and
creates separate owned artifact/workforce/report stores without provider credentials.

## US1 scoped checkpoint and session binding

T007/T016–T021: explicit private proof validation, immutable complete-attempt resume,
fixed named-suite execution/conversion and separate explicit CI artifact aggregation
are implemented. Forty-five deterministic contract/evidence/maintenance/result/resume
cases pass. A real Vitest JSON capture was verified against the complete named
readiness inventory. The full runner reports blocked for the thirteen unbuilt
required story suites; this is not full pilot eligibility or actual CI acceptance.
Local receipts cannot satisfy hosted/model/human requirements. Failed attempts and
changed/tampered proof cannot be hidden by an older selection or partial replacement.

T022/T024: eight owned session cases first exposed six failures, then passed after
binding issue/resolve/logout to exact membership/workspace. Tests cover primary
selection, explicit pilot selection, unassigned denial, immediate membership
revocation, stable existing sessions, unresolved legacy denial, exact logout audit
scope and private conversation isolation. Authentication defaults to the existing
canonical primary workspace. Identity and model selection remain unchanged.

## Workspace isolation and private object checkpoint

The exact session and isolation catalogs pass 16/16 in an owned 057 database.
Isolation exercises actual domain authorization, shared projection search and
consumption, scoped metrics, publication eligibility and personal MCP authorization.
The native dependency test uses a controlled owned binding to exercise the source
fence; it does not claim an actual eve turn or model evaluation. Primary sanitized
practices remain readable and consumable in the synthetic pilot.

The five provisioning cases pass: exact scoped synthetic workspace, idempotent
memberships/grants, wrong-environment refusal, unknown-principal/primary-overwrite
refusal and no accepted or published facts. A replay never restores revoked grants.
The provisioner requires the migration owner and an explicit private manifest;
no Production provisioning was performed.

The eight private-object contract cases pass against the local adapter: verified
size/digest, immutable conflict reconciliation, identity/traversal denial, private
read and exact scoped deletion. Blob adapter code uses private access and uncached
reads; actual provider validation and domain store cutover remain pending.

A production-build CLI WebKit workspace run passed 20/20 with zero retries, skips
or flaky cases across the four projects. Screenshot inspection then identified
that the mobile pilot label should remain visible with navigation closed; a
persistent banner was added and a fresh complete workspace run is in progress.
The upload UI catalog and the full 40-case UI acceptance remain pending.
Owned resources were removed, and protected model/configuration/workflow hashes
were verified by the harness after each completed owned run.

The persistent-banner correction passed a fresh complete 20/20 workspace WebKit
run (zero skips/retries/flaky results), including closed-navigation mobile context.
Safe mobile screenshots were inspected. The earlier failures were login-navigation
races and incorrect empty-state/alert locators, corrected in the tests. Removed an
unconditional customer-page synthetic badge so workspace classification comes
from the authenticated shell rather than a static page label.

The private-object catalog also passes all eight cases against both local storage
and a controlled SDK mock. The mock asserts private access, bypassed cache, fixed
paths and overwrite refusal; it is adapter-mechanics proof only. Local inventory
walks have a finite 10,000-entry bound and refuse excess rather than returning a
partial successful inventory. Blob pages are capped at 100. Domain factory/refactor
work is underway; provider validation, verified cutover and the full store/runtime
regression catalog remain pending.

Migration cases were rerun after adding projection origin derivation and immutable
provenance assertions to the contribution-origin case: all six passed.

## Artifact regression checkpoint

The predecessor artifact HTTP catalog initially refused the unowned invocation.
In the owned environment it passes two cases but rejects the scan/parse positive
case: the existing 004 preparation manifest does not match either currently
installed image ID. This remains a failed regression, not a accepted-file proof;
preparation must be reviewed and regenerated in owned state before rerunning.
No existing preparation or image tag was overwritten.

That failure exposed a pre-existing transient-retry defect: the worker attempted
a forbidden processing→quarantined transition and failed to advance attempts.
Retries now use the allowed failed state, advance the scheduled attempt counter
and stop after three attempts. Both artifact job integration cases pass in an
owned database, including the new three-attempt regression. The common profile
fixture now creates explicitly membership-bound sessions required by 056.

The artifact, workforce, report and gap stores are being adapted for explicit Blob
selection. Artifact downloads verify size/digest before returning chunks and
recheck current authorization/generation for each chunk. Local formats remain
unchanged. Full cutover/executor/cleanup and direct-upload validation is pending;
T030 is not marked complete.

## Direct-upload and scanner freshness work

057 now includes immutable session/membership-bound staging capability headers,
ten-minute expiry constraints and runtime admission grants. It also supplies
immutable artifact-header UPDATE triggers; the grant setup permits UPDATE(id)
only for PostgreSQL row locks on artifacts and upload batches. Original column
writes and header deletion remain denied. Full migration validation must be
rerun against this latest amendment before acceptance.

Direct staging preparation, token admission and authenticated actual-byte finish
are implemented for artifacts/workforce, with the client transport preserving
local uploads. Signed provider callbacks perform no fact acceptance. The new
eight-case upload catalog is being executed under actual runtime grants with
controlled SDK storage; provider signature/network behavior is not claimed.
It respects natural intake pacing rather than rewriting production rate limits.

The existing scanner freshness check used filesystem modification time alone,
which could make copied old signatures appear fresh. It now also checks the CVD
build epoch. Two unit regressions pass for copied stale data, old file age and
future build time. The existing 004 signatures are dated September 28 and need
actual refresh; no timestamps or signature bytes were changed to manufacture
a scanner pass.

The latest eight-case upload catalog passes under runtime grants. It covers both
maximum-size artifact/workforce staging and replay, exact single-path token
admission (private upload, no overwrite/suffix, declared maximum and ten-minute
expiry), foreign token/completion denial, expiry/cancellation, oversized bytes,
revoked chunked reads and callbacks that accept no evidence. Controlled SDK mocks
exercise adapter/token-option mechanics after simulated signature verification;
actual provider signature verification and >4.5 MiB hosted transfer remain pending.
The catalog waits for natural artifact intake windows without resetting counters.
The latest six-case migration catalog also passed after capability/header changes.

Workspace binding was additionally enforced in staffing policies/job actors/tool
actors/decision settlement, support policy and gap-report job actors. A wider
affected predecessor regression composition remains required before merge.

Registry search and installed eve Vercel sandbox documentation were reviewed:
the framework adapter prepares persistent session sandboxes. Heavy domain jobs
use the pinned SDK behind their own nonpersistent governed executor, not a fabricated
agent turn or additional speculative integration. Fixed execution contracts/local
adapter implementation is underway and is not yet recorded as validated.

### Fixed execution adapters — local checkpoint

Eight controlled Sandbox SDK unit cases pass: fixed command and byte checks, denied network/ports/persistence, no in-execution credentials, mismatched isolation rejection, uncertain creation held without retry, lost lease denial, transfer mismatch, immediate oversized-output abort and cleanup uncertainty. These use a controlled SDK fixture and do not establish provider behavior. An explicit actual local Docker case also passed using the installed parser image resolved to its immutable image ID: verified synthetic text produced the expected manifest and its owned container was absent afterward. T033 is complete; image provenance, durable admission/reconciliation and actual hosted execution remain pending.

### Durable heavy-job control — local checkpoint

The eight frozen hosted-job integration cases passed in an owned disposable PostgreSQL environment under runtime grants. They cover SDK isolation rejection, original-deadline fencing, uncertain creation without a second dispatch, lost lease and stale-source denial, missing input, class failure isolation and exact tagged orphan reconciliation. Service-budget and provider behavior are controlled fixtures, so this proves database/control mechanics only; actual service admission, SDK provider behavior and charge settlement remain pending. The first run exposed a runtime lock privilege error; control synchronization now uses a shared advisory fence paired with an owner-update trigger, preserving SELECT-only runtime control privileges. Migration 057 also enforces immutable leases/state transitions and preserves the existing 50 MiB parser output bound. T036 and T040 remain open until the complete wired behavior is verified.

### Actual local artifact processing — checkpoint

The existing three-case upload HTTP contract passed in an owned disposable environment under runtime grants using newly prepared immutable scanner/parser image IDs and a genuine fresh signature snapshot (daily version 28149). The positive case performed actual ClamAV scanning and parsing, published the verified extraction, and kept intent completion atomic. Cancellation/expiry and revoked-stream cases also passed. The complete selected local report is `local-artifacts/016/artifact-real-eNMWQS/result.json`; earlier failed reports remain preserved. This is local processing proof, not hosted Blob/Sandbox or production acceptance. Preparation records retain `hostedVerified:false` and no hosted OCI assertion.

Ten controlled executor cases plus four provider-reconciliation cases and four container-policy cases now pass. These cover original-deadline shutdown/deletion and deletion attempts after a failed stop, in addition to the earlier execution checks. The provider adapter performs metadata lookup with `resume:false`, rejects foreign ownership, treats partial inventory as incomplete and requires confirmed deletion. Actual SDK provider behavior and service-cost authority remain unverified.

### Renderer and binding follow-up — checkpoint

The complete two-case actual local executor rerun passed (`local-artifacts/016/executor-real-iBw3MD/result.json`): immutable-image parsing and real PDF/native PPTX rendering, digest/font/format inspection inside isolated execution, and LibreOffice edit/save/reopen validation. Both rendering and Office checks shared the original 120-second deadline. Earlier renderer failures exposed root-only copied static directories, including permissions masked by an operator umask of 077; preparation now explicitly makes static build directories readable while retaining its private parent. The current preparation is `local-artifacts/016/images-20261010-d/preparation.json`, with genuine signatures/OCR digests and `hostedVerified:false`. Hosted OCI references remain unverified, so T034 stays open.

Retired all 18 image tags from superseded preparations plus three current base tags after exact image-ID checks; removed superseded downloaded static assets and build contexts. Historical proof/failed reports remain private. Only the three current candidate image tags and their reviewed static preparation remain for the next checks. No owned 016 DB or artifact-processing containers remained at this checkpoint.

The session/workspace isolation/hosted-control rerun passed 24 cases (`local-artifacts/016/bindings-Z2K3YH/result.json`), and the additional customer-context/customer-create/general-chat regression passed six cases (`local-artifacts/016/profile-binding-mKg7OJ/result.json`). Native actor resolution, snapshot/conversation matching, conversation queries, customer creation and grant decisions now require the exact stored session membership/workspace; actor-loss maintenance recognizes a missing or mismatched session as unavailable. Complete predecessor/native catalogs and fresh quality applicability review remain required, so T026 is still open.

### Upload identity, object cleanup and diagnostic/deadline follow-up

The complete eight-case direct-upload rerun passed (`local-artifacts/016/uploads-MtyTMp/result.json`). Blob selection now checks the declared store against the identity encoded by the pinned SDK read/write token before provider operations. Private report readiness uses bounded metadata; exact cleanup reconciles already-absent objects and refuses conflicting bytes. Two controlled storage units passed; these do not establish actual hosted storage behavior.

Twelve controlled executor cases pass, including exact safe parser diagnostic classification without returning raw stderr. The complete two-case artifact lease regression passed (`local-artifacts/016/deadlines-9JxaUx/result.json`), including unchanged deadlines across all retries and expired-work cancellation. Earlier expanded-case failures were invalid fixture timestamps under the existing exact 120-second constraint; those failed reports remain preserved. Artifact claims retain their original start/deadline, and workforce claims preserve the original deadline and deny expired retries. Typecheck passes. Full worker integration, real service-cost authority and hosted/recovery/acceptance catalogs remain pending.

The render retry regression passed under owned runtime grants (`local-artifacts/016/render-deadlines-rRi2cZ/result.json`): a retry retains the first deadline, and expired queued render work becomes failed without another execution. Draft/send behavior retains its governing feature contract. The complete eight-case hosted-control rerun passed (`local-artifacts/016/capacity-Nt0lbU/result.json`), now also rejecting a third active heavy-job admission. These database/controlled-provider checks are not paid-service or hosted acceptance.

T035's fixed Sandbox adapter implementation is complete with bounded verified transfers/output, original deadlines, denied network/ports/persistence and finally stop/delete behavior covered by twelve controlled SDK cases. Actual provider configuration/images/charges and full routed-domain verification remain separate open tasks (T034/T036/T037/T073). No after-implement hooks are registered; `.specify/extensions.yml` remains absent.

### Governed domain execution and durable service authority — local checkpoint

T036–T038 are implemented. The original job lease, two-job environment capacity, exact creation/provider identity and current source locks govern hosted execution. Runtime consumes an owner-provisioned service budget but cannot create, enlarge or settle it. Unknown dispatch holds the original reservation and prevents further admission. Eight cost contract cases and four actual owned-database authority cases passed (`local-artifacts/016/cost-authority-rW0XxM/result.json`); migration/grant upgrade and reapply checks passed six cases. These synthetic accounting records are not service authorization or actual charges.

All three domain runners now use the governed executor. Actual local regressions passed three artifact cases (`local-artifacts/016/artifact-governed-A01m3G/result.json`), six workforce cases including EICAR rejection (`local-artifacts/016/workforce-governed-3hPNVY/result.json`) and two real PDF/PPTX rendering/download cases (`local-artifacts/016/report-governed-MNXlXh/result.json`). Earlier origin/static-store fixture failures remain retained. Report bytes are validated inside isolated execution, cataloged before store IO and accepted under current domain locks. Approval and email dispatch retain their existing boundaries.

Four governed SDK/actual-database integration cases passed (`local-artifacts/016/governed-sdk-T881XX/result.json`): accepted domain publication, uncertain creation held without another paid dispatch, withdrawn-source output withheld and changed provider/pricing scope denied before creation. The first SDK run retained an active domain lease between cases; fixture isolation now cancels those synthetic leases before each case. The failed report remains preserved. These SDK results use controlled responses and do not establish hosted provider behavior.

Protected heavy dispatch accepts only the fixed cron route and fixed artifact/workforce/report catalog, with a 360-second cancellation signal passed through each runner; their shorter original domain deadlines remain enforced. A separate watchdog cleanup path uses the original cost reservation and exact provider ownership, stays independent of authoring enablement and holds a changed provider scope. Thirteen dispatch/reconciliation/provider unit cases pass. Shared maintenance registry wiring, full acceptance composition, actual hosted SDK/images/charges, recovery and participant proof remain open. Typecheck passes. No deployment, merge, selected-database mutation or paid dispatch occurred.

### Shared maintenance and durable local execution (T039–T040)

The fresh composed run passed 67 cases with zero failures or skips in `local-artifacts/016/registry-current-r1xjke/result.json`. It covers all 15 actual maintenance bindings under runtime grants, owned worker start/crash/restart, independent class failure, local/hosted combined capacity, immutable original deadlines and source publication fences, controlled SDK uncertainty, exact owned compute reconciliation and durable cost holds. The separate complete eight-case hosted failure catalog passed in `local-artifacts/016/hosted-failures-current-tugzyq/result.json`. These controlled SDK results do not establish actual hosted service acceptance or authorize spend.

Retrieval lifecycle claims are restricted to cleanup/invalidation while authoring is disabled; they cannot claim index work or trigger embeddings. The composed run includes an actual retired projection purge under runtime grants, with indexing left queued. Mutable parent locks replace invalid runtime locks on immutable retrieval payload rows; a missing lifecycle SQL argument is corrected. A stale startup-generation fixture assertion was corrected to require a fresh completed tick, current code version and no outstanding lease; the earlier failed report is preserved.

Migration 055→057, role setup and forward reapplication passed all six cases after adding `operations_local_jobs` (`local-artifacts/016/migrations-current.log`). Local and hosted jobs share the two-heavy-job bound. Local compute has exact job/environment labels, a fixed image-level deadline and durable reconciliation before releasing uncertain capacity. Owner settlement of a charge permits stopping its original orphan without reopening the immutable ledger. Full TypeScript checking passed (`local-artifacts/016/typecheck-current.log`). No selected database, deployment, merge or paid provider dispatch was changed.

Real routed local artifact intake/scanning/parsing passed three cases, the two-sheet workforce/review catalog passed nine, and genuine PDF/PPTX rendering and download passed two (`local-artifacts/016/routed-local-CQ1TgP/suite-{0,1,2}.json`). An earlier run selected a nonexistent report test filename; its partial scope is retained and does not count as routed report acceptance. The current UI run uses actual prepared immutable local images and fresh assets; its earlier failures remain preserved. UI expiry display uses a controlled error response; server capability expiry is separately tested by the upload integration catalog. Full hosted, lifecycle/access, recovery, load, quality and human acceptance remain pending.

The current workforce original admission/EICAR regression passed all six cases in `local-artifacts/016/workforce-current-YD2YPw/result.json`: exact-byte admission/replay, actual clean scan, immediate withdrawal denial, and actual EICAR blocking before parsing/publication. The preceding run copied scanner assets into the personnel store rather than the shared artifact infrastructure root; its failed report (`workforce-current-qV9PMz`) is retained. Correcting the owned runner's asset placement required no product-code change or widened permission.

### Dependency review in progress (T047)

The pinned-tree audit (`local-artifacts/016/dependency-audit.json`) reports Next 16.3.4, source-map-js 1.2.1 and eve's exactly pinned undici 8.9.0 as affected. The [Next ImageResponse advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) identifies a fix in 16.3.6; the [later cache-poisoning advisory](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) identifies 16.3.8. The application does not use attacker-controlled next/og SVG generation; that applicability finding does not clear the dependency audit. A bounded patch-level remediation and native regression review remain pending. No speculative eve upgrade has been made.

### Complete CLI WebKit workspace/upload catalog (T044)

All 40 frozen journeys passed once with zero failed/skipped/flaky cases across desktop/mobile and light/dark (`local-artifacts/016/ui-0Ke1oH/summary.json` and four project reports). The runner checks exact file/title/project discovery, original immutable prepared image IDs, scanner/OCR asset digests, uncached domain completion and maximum 10 MiB bytes recorded in the owned database. It owns and removes its clone, database and local workflow state, preserving the selected root state. No browser on the host was operated.

Keyboard navigation/removal, responsive controls, serious/critical accessibility, assigned synthetic context, denied login, empty/error states and primary-workspace behavior passed. Safe light/dark desktop/mobile upload screenshots were visually inspected; their layout has no horizontal overflow. They contain only synthetic fixtures. Next's development indicator is visible because the CLI harness starts the local native eve service through Next development; this is local UI evidence, not a Production appearance claim. Maximum-size originals remain quarantined until governed scanning; successful transport is not evidence acceptance. The controlled expiry/error display and foreign-owner denial are explicitly distinct from actual hosted Blob proof.

Previous UI failures remain in their private directories. Corrected fixture errors include an ambiguous button/file-input selector, starting the native eve service, actual infrastructure assets rather than an unprepared transport fixture, WebKit keyboard-button activation and cancelling each exact interrupted fixture upload. Quotas are paced naturally; no governing quota is reset or weakened. The current result binds source digest `69cfce311e544e5e2b918d27084be13cf52d26bc04cf4b79c4eba0f44f312598`; subsequent source/dependency changes require a fresh complete acceptance run.

### Recovery contracts, control and access admission (in progress)

The matched-recovery contract rejects mismatched checkpoints, partial inventories, unsupported workflow capabilities, missing key availability, wrong environment/ledger, snapshot-derived or stale denial authority, and an unverified outside-domain copy. Its encrypted bundle digest covers the full matched archive; database dump identity and object inventories remain separate checks. Eight required contract cases and four actual AES-256-GCM cases passed (`local-artifacts/016/recovery-crypto-current-2.json`). Authentication failure removes partial plaintext; wrong capture context, symlink inputs and an existing destination are refused. The first stream implementation failed to close file handles reliably; bounded explicit chunk reads/writes replaced it and the hung run was stopped. Its owned temporary directories were removed, preserving selected state.

An owned run passed 24 recovery contract/control/admission cases (`local-artifacts/016/recovery-admission-MBaMxg/result.json`) before the subsequent crypto/bundle additions. This proves current session issuance/read denial, domain and MCP actor denial, nonserializable protected cancellation authority, exact owned upload cancellation and all 15 cleanup classes remaining executable while locked. Control receipts and owner verification records are immutable; runtime cannot provision verification or unlock. Verification and control are separate from participant/release approval. A combined follow-up exposed missing fixture directories and a microsecond fixture lease/deadline mismatch; failed reports are retained and corrected fixtures require a fresh complete run.

The control/capture/restore workflow is not yet complete: physical IO/capture fencing, current verification invalidation, actual matched capture and independent denial/replay reconciliation remain open. T049–T059 are not satisfied by owner-inserted synthetic verification rows. No Production or Preview database was changed. The patch remediation preserves eve 0.67.1 and the selected agent model, using Next 16.3.8, an eve-only undici 8.10.2 override and source-map-js 1.2.2. The current npm audit reports zero vulnerabilities (`local-artifacts/016/dependency-audit-patched.json`); required build/native/browser acceptance after these changes remains pending.

### Current recovery IO, state invalidation and lifecycle engineering checks

The complete owned recovery/control/admission/crypto/maintenance composition passed 38 cases with zero failed or pending cases (`local-artifacts/016/recovery-io-current-SyKD2i/result.json`). Quiescing closes admission without waiting for ongoing IO; the exclusive locked transition waits for its capture fence. A separate single database connection holds the process's collective IO fence, so fifteen concurrent cleanup callbacks can still query through the ten-connection runtime pool. Guards cover upload staging/finalization, report/gap object writes and exact cleanup, governed output preparation, the cleanup registry and independent hosted orphan reconciliation. HTTP upload bodies have a finite five-minute deadline. A subsequent source change still requires complete acceptance composition; this engineering run is not full recovery proof.

Owner verification now binds a SHA-256 digest of current database content and schema/grants/constraints/functions/triggers under table SHARE locks. Unlock rejects an accepted-state or denial-state change after verification, even within its thirty-minute freshness window. Observational control/health rows are excluded; authoritative content and replay state are included. Actual object restoration and independently current denial/replay reconciliation remain required and unimplemented; this digest cannot replace either.

The worker/executor/cleanup regression composition passed all 76 cases across fourteen files (`local-artifacts/016/registry-io-current-MprJ8w/`). The first runner named an incorrect existing test path; that failed attempt remains recorded rather than being counted. Actual private inventory/copy tests passed eight cases, plus the existing report-object test: actual stream bytes, exact immutable resume, destination mismatch, foreign scope, unavailable provider without fallback, interrupted enumeration and retained originals. The new inventory helper changes no configuration and performs no original deletion; the complete operator cutover procedure remains open.

Eight owned lifecycle cases passed (`local-artifacts/016/lifecycle-current-pZgms4/result.json`): synchronous knowledge/search/citation/native/MCP withholding before projection cleanup, disabled-authoring purge without embedding dispatch, retained withdrawal replay authority, and immediate MCP revocation followed by hash minimization with its management receipt retained. These cases cover the shared-knowledge/MCP portion; the required cross-feature original/report/Blob/interruption matrix remains open. The fixed lifecycle command invokes all existing finite cleanup bindings and reports active-store execution separately from backup expiry.

A fresh owned eve/Next production build passed after the dependency patch and recovery IO changes (`local-artifacts/016/build-recovery-current-2.log`). Its first attempt caught a missing named catalog entry and an intentionally partial fixture needing an explicit unknown conversion; both were corrected, and the failed log remains retained. This proves an owned local build, not deployment or Production behavior. Owned application/database/workflow resources were removed and selected configuration, model and workflow state preserved. No selected database, Production deployment, actual provider budget or email was changed.

### Post-drain snapshot and schedule checks

Six actual PostgreSQL checkpoint cases passed (`local-artifacts/016/checkpoint-current-qqgwGm/result.json`). The capture now takes its session-exclusive IO fence before beginning repeatable read, so a cleanup update drained before capture appears in the exported snapshot. The prior ordering could freeze database state before cleanup completed. The actual compatible dump, authenticated encryption and matched archive byte tests also pass. The broader recovery composition passed 59 cases (`local-artifacts/016/backup-composed-current-aNTIUd/result.json`) before this final snapshot-order change; it is engineering evidence, not full restoration acceptance.

Seven schedule policy/CLI cases passed (`local-artifacts/016/backup-schedule-command-current.json`). The private inventory command enforces fixed cadence/freshness/retention policy, preserves failed foreign-scope attempts, distinguishes expired managed captures from operator archives, and grants no deletion or restore authority. Inventory timestamps cannot establish actual scheduled execution; the scheduler, managed expiry execution, independent current authority, outside-domain copy, complete isolated restore and two actual scheduled captures remain open. T051–T059 remain unchecked.

The read-only legacy-store bridge and current private inventory passed 22 cases (`local-artifacts/016/legacy-inventory-current-2.json`). Actual artifact/workforce/report/gap files, including legitimate workforce hardlinks, copy into verified immutable namespaces with original bytes retained. Missing/foreign/unsafe stores, unknown report classification, symlink originals and changed expectations fail closed. A listed object disappearing during enumeration now fails instead of silently reducing the inventory. The first legacy test attempt failed because its fixture removed a directory without the recursive option; that report remains retained. This bridge neither changes configuration nor constitutes a complete operator cutover, full matched backup or hosted proof; T045 and T051 remain open.

The owner drain now inspects all actual domain lease columns and report `dispatching` state, beyond the new processing registries. The complete owned recovery composition passed 61 cases (`local-artifacts/016/backup-composed-current-VMMSHJ/result.json`), including an independently leased domain table preventing a locked transition until its lease drains. Terminal work and expired leases are distinguished conservatively; old unfenced deployments still require explicit protection before capture.

Actual PostgreSQL dump plus object checkpoint/archive/encryption cases passed six cases (`local-artifacts/016/checkpoint-current-aBY6wV/result.json`). The checkpoint copies verified immutable originals into private single-link files, verifies the full inventory again, retains originals and removes partial staging after byte/inventory failure. The combined storage/checkpoint tests passed 27 cases (`local-artifacts/016/object-checkpoint-current.json`). Capture deadlines now propagate to Blob inventory/read/write calls. No actual Blob calls occurred. This remains capture engineering proof, not complete workflow/current-authority/outside-domain/isolated database restoration acceptance.

The current storage/checkpoint/schedule composition passed 35 cases (`local-artifacts/016/capture-storage-schedule-current-2.json`), including propagation of a capture deadline into a stalled simulated Blob request. This SDK contract case does not claim actual Blob behavior. A fresh owned eve/Next build passed (`local-artifacts/016/build-backup-current-2.log`) after fixing two incomplete typed test doubles; the failed first build remains recorded. Subsequent restore/authority additions still need complete acceptance validation.

One actual owned encrypted PostgreSQL restore case passed (`local-artifacts/016/owned-database-restore-current-3.json`). It rejects the source database as a target, requires a separately created locked marker, verifies input dump bytes, uses the fixed PostgreSQL 17 client, checks restored marker/identity content, reapplies explicit runtime grants and denies runtime unlock. The first attempt exposed pre-existing target default grants admitting restored table reads before the grant step; the helper now closes those defaults and retains original function ACLs, with runtime table privileges withheld pending explicit grant refresh. The second attempt preceded the function-ACL preservation correction; only the third result covers the final restore helper. All databases/clients/containers and private plaintext/key buffers were cleaned after the owned run. The helper supports disposable owned targets only and never starts an app, reconciles independent current authority, publishes an alias or authorizes unlock. Full T053/T058 recovery acceptance remains open.

The recovery/control/checkpoint/crypto composition passed 62 cases (`local-artifacts/016/backup-composed-current-I9Pdbe/result.json`). Owner verification invalidation now includes schema/default grants, relation ownership/ACL/RLS, row policies, routine ownership/ACL/security/configuration and installed extension metadata. An actual change to function execution authority after a fresh verification rejects unlock. Full source-to-target semantic grant comparison and independent current denial/replay reconciliation remain separate outstanding requirements.

Four actual database sample cases passed (`local-artifacts/016/health-samples-current-onXJ9x/result.json`). Draft migration 057 now includes the missing payload-free sample table with fixed typed fields, server-owned 90-day expiry, immutable observations and bounded idempotent expiry. Runtime cannot supply timestamps or directly update/delete samples; the fixed expiry function rejects NULL/unbounded/foreign input and preserves permanent control receipts. Its checked-in checksum and explicit role grants were updated. Full health checks, scheduler placement and outage-detection proof remain open under T060–T062. Migration 056 remains unchanged and neither migration was applied to a selected or hosted database.

The updated owned 055→056→057/repeat migration catalog passed all six cases (`local-artifacts/016/migrations-samples-current.log`). A fresh actual PostgreSQL checkpoint composition passed six cases (`local-artifacts/016/checkpoint-current-Z9V6Hl/result.json`) with a canonical permission digest included in the post-drain boundary. The fresh encrypted owned restore case passed (`local-artifacts/016/owned-database-restore-current-4.json`) and compared actual source/target relation, column, routine, schema/default grants and relevant role/membership attributes after explicit grant refresh. Database/catalog OIDs and database names are excluded from that portable permission comparison. This proves the owned permission comparison; independently current denial/replay and full feature-history/workflow restoration remain open.

T030's storage integration is implemented: artifact intake/read/processing/cleanup use the selected store factory; workforce and report/gap paths select uncached private Blob or validated existing local storage; processing receives verified bytes instead of persistent source paths. Hosted deployments require explicit Blob/Sandbox selection, including prepared image/brand selection, and cannot select ephemeral local storage/processing as a fallback. The fresh worker/executor/store regression composition passed 77 cases across fourteen files (`local-artifacts/016/registry-io-current-s8pkhq/`); private store/config/report contracts passed twelve cases (`local-artifacts/016/hosted-store-selection-current.json`), with additional executor/dispatcher configuration checks passing (`local-artifacts/016/hosted-backend-config-current.json`). Earlier genuine local extraction/rendering and routed storage checks remain scoped predecessor evidence. Actual hosted Blob/Sandbox, image publication, inventory cutover and restart/revocation proof remain mandatory under T034/T045/T073 and are not claimed by T030 completion.

### Valid pilot measurement isolation (continued implementation)

The fresh owned `isolation-metrics-current-AOBq9X/result.json` catalog passed all
eight required isolation cases. The metric case now creates five normally reviewed
profile/plan/execution/measurement chains in the synthetic pilot workspace, releases
the cohort there and checks its independently expected mean change of `2.00`. A
valid primary session cannot release that population, sees an unavailable cohort,
and has no primary release row. The remaining cases cover knowledge, retrieval,
citations, native dependencies, job eligibility and MCP, including permitted primary
shared knowledge in the pilot. Shared origin eligibility derives from immutable
database provenance, and downstream source checks retain the requesting workspace.

The first fresh attempt (`isolation-metrics-current-ZCu3RD`) exposed outdated owned
learning fixture sessions; it was not accepted. Fixtures now bind membership and
workspace on schema 056+, preserving their owned predecessor-schema path. Domain
session authorization was not relaxed. The subsequent typecheck passed. This is
local implementation evidence for T026, not Production or launch acceptance.

### Maintenance observation and sample cleanup

The fresh owned `health-samples-current-P0x3of/result.json` run passed all ten
cases across sample retention, maintenance health assessment and actual worker
start/crash/restart. The independent sixty-second worker lane observes all fifteen
classes, persists only typed bounded samples, expires at most 100 ninety-day-old
samples, and emits only class IDs and enumerated states. Missing/stale/failed/wrong
version/future/incomplete observations cannot become successful ticks. Each stopped
class is detected at its existing threshold plus the sixty-second check interval,
no more than 240 seconds. The actual database case verifies one stale class, fourteen
healthy classes, fifteen new observations, and an unchanged success timestamp.

The first composed attempt (`health-samples-current-ZXC61Z`) failed an assertion
that assumed no observations existed after the worker-restart test. The corrected
assertion measures the exact fifteen-row increment; the original failure is retained.
`pilot-health.ts --environment E --output NEW_PRIVATE_DIRECTORY --observe` records
one source-bound maintenance observation and explicitly does not claim full
readiness. T060–T062 remain incomplete pending full readiness/status and incident
observation checks; this implementation does not establish hosted health.

### Owner recovery-control implementation

T049 is implemented. The fresh `backup-composed-current-qcwWS3/result.json` run
passed all 62 cases, including eleven actual owner/runtime control cases: permitted
transition order, exact revision and identity, immutable operation replay, incomplete
or stale verification rejection, runtime denial, bounded lease drain, and invalidation
after current state or function authority changes. Advisory admission fences remain
held through transition and capture boundaries. The operator CLI requires an exact
environment and separately supplied owner connection; local targets must be owned
016 databases and remote transport must use verify-full. Actual full recovery
reconciliation and hosted restore acceptance remain separate unfinished tasks.

### Original-source retraction across shared consumers

The fresh owned `lifecycle-current-w7wxnk/result.json` run passed all nine cases.
The added case retracts a normally accepted profile original through its governed
command, then denies the downstream published practice, search result, existing
citation, native dependency and existing MCP actor while derived passages still
exist. The separate knowledge suspension sweep retires that publication; retrieval
cleanup then removes its passages with authoring disabled. Replaying the exact
profile retraction after cleanup returns its retained receipt and produces no
second lifecycle event. Existing withdrawal and MCP revocation cases still pass.

The first attempt (`lifecycle-original-current.log`) incorrectly expected retrieval
cleanup alone to suspend an active dependent publication. It was retained as a
failure. The corrected case executes the real separate knowledge and retrieval
maintenance authorities, while keeping the immediate source-denial assertions
before either cleanup. T042 still needs the remaining original/report/store-fault
and interrupted-expiry matrix; nine passing cases do not establish that matrix.

### Lifecycle execution tooling and current build

T041 is implemented. The executable lifecycle command was run against a fresh owned
016 database from the canonical source checkout (`lifecycle-command-current.log`).
All fifteen fixed cleanup class executions passed under runtime grants, using the
existing domain functions and tighter step bounds. The expanded lifecycle inventory
identifies originals, derivatives, native copies, governing withdrawal authority,
original TTLs, cleanup functions, permanent receipts and separate backup outcomes.
It corrects the earlier coarse table that incorrectly grouped the 730-day report
audit policy with gap audit retention (365 days followed by its keyed fence).
No global TTL or deletion authority was introduced. The command honestly records
backup expiry as not executed, permanent replay catalog as not verified and full
lifecycle verification as false; T042 and hosted/lifecycle acceptance remain open.

The fresh owned eve and Next production build (`build-health-original-current.log`)
passed with the monitoring and original-source test changes. Selected configuration
and root workflow state were preserved. This is an owned build/start check, not a
Production deployment or launch readiness claim. The later inventory-only change
passed documentation validation and `git diff --check`.

### Report image compatibility and interrupted physical cleanup

The first composed report/lifecycle run (`report-lifecycle-current-DEolOv`) exposed
a real predecessor-image regression: the new executor invokes fixed render/office
commands, while the existing CI-built report image lacked those programs. The
`report-renderer/Dockerfile` now includes the same fixed scripts as the pilot image;
the actual image was rebuilt (`renderer-fixed-program-build.log`). The complete
actual report cleanup plus nine-case lifecycle composition passed ten cases in
`report-lifecycle-current-cTlAfz/result.json`.

The expanded fresh composition (`report-lifecycle-current-uLtzGi/result.json`) also
passed all ten cases. It renders real PDF/PPTX outputs, then mirrors those exact
bytes into a deterministic Blob fault adapter: one deletion succeeds, the second
fails, the database cleanup transaction rolls back and downloads remain denied.
Retry accepts the verified missing object, removes the remaining exact object and
is repeat-safe. Local originals remain intact through the adapter fault exercise
and are then actually deleted through their own fresh exact cause; unrelated
objects survive. This modeled Blob interruption is not an actual hosted Blob claim.
An intermediate expanded attempt failed because the fixture did not restore its
local-copy catalog after the mirror exercise; its failure was retained.

### Maintenance cadence and immutable cost accounting

The maintenance catalog now records the actual existing two/five/thirty-second
schedules instead of keeping accelerated intervals in a separate map. Each stale
threshold is at most three actual intervals, capped at 180 seconds; the catalog
schema rejects longer thresholds. The fresh `maintenance-cadence-current.json`
composition passed all 39 contract/suite-result/health/scheduler cases and the fresh
`health-samples-current-EvBKEo/result.json` owned ten-case observation/worker catalog
passed after this correction.

T064 implementation is complete. `cost-command-current-p7PoNC/result.json` passed
all 21 contract and actual owned database cases. The owner command supports strict
status/provision/reconcile records across eight separately scoped categories; caps
are immutable, revoked authority cannot be revived, unknown dispatch holds admission,
estimates retain the full reserved bound and actual charges are distinct. Draft 057
now requires an immutable exact evidence/review receipt for settlement; runtime
cannot provision, settle or alter those receipts. Idempotent replay binds the whole
request, including evidence/review digests. The command makes no provider calls and
does not approve release. No actual 016 paid budget was provisioned or consumed.
Fresh full migration/recovery/grant composition is still required after this draft
schema addition; selected and hosted databases remain untouched in this turn.

- Current encrypted owned database restoration: `owned-database-restore-current-5.json`, 1/1; draft 057 cost receipt schema restored, grants explicitly refreshed, portable source/target grants match. No Production restore or release permission established.
- Updated maintenance clock/cadence/sample composition: `health-samples-current-NDyB4Z/result.json`, 10/10.
- Real elapsed worker crash/outage/restart composition: `health-samples-current-HRfUdm/result.json`, 10/10. After SIGKILL, independent observations waited for all 15 actual completion timestamps to become stale naturally (no fake clocks or timestamp rewriting), within five minutes, then verified restarted actual worker ticks. This proves owned outage observation and retention, not a configured hosted monitor or full readiness endpoint.
- Private feedback contract/current database membership tests: `feedback-current-hFTHAu/result.json`, 13/13. Actual root CLI record → immutable triage append and revoked partner refusal: `feedback-command-current-JrEsfJ`. Observations were explicitly synthetic fixtures; G21 real human feedback remains unverified.
- Refreshed all three amd64 scanner/parser/renderer images after the fixed report programs changed: `images-current-20261011/preparation.json`; ClamAV signature version 28149, pinned OCR digest, exact actual local image IDs. No OCI publication or actual hosted execution.
- Owned eve and Next production build after cost/cadence changes: `build-cost-cadence-current.log`, passed. This precedes feedback additions; final fresh build still required.

- Current bounded access review: `access-current-QyPUoF/result.json`, 8/8. The actual newly prepared pinned ClamAV image detected harmless EICAR bytes through `runArtifactJob`; the original became failed/unsafe-content, could not be read as usable content or retried, and produced no extracted units. Actual database cases verified Pending claims cannot enter accepted context, forged tool attributes cannot establish an attempt, partner foreign-customer and internal foreign-workspace reads are denied, conversations remain owner-private, runtime control/schema/cost-receipt mutations fail, and diagnostics omit synthetic private sentinels. Original-withdrawal/shared source eligibility is additionally exercised by the 9-case lifecycle proof and 8-case isolation proof above. This is local engineering review, not actual-model prompt-injection evaluation or hosted acceptance.
- Current production dependency audit: `security-audit-production-current.json`, zero vulnerabilities. `git ls-files .env.local .eve local-artifacts` returns no tracked private runtime artifacts; `git diff --check` passes. Full tracked-output and independent release security review remains in progress.
- Feedback/contract/readiness result-validation composition: `feedback-contracts-current.json`, 40/40.

- Stable private workflow byte staging: `workflow-checkpoint-current-2.json`, 8/8, covering nested/empty inventories, symlink/hardlink and permission refusal, actual filesystem case semantics, unsupported names, retained existing operator destinations, pre-abort and real mid-copy interruption with original-byte preservation. The helper explicitly does not establish a stopped native runtime or full matched checkpoint.
- Current PostgreSQL exported snapshot + all four object-store kinds + nested workflow fixture archive encryption/extraction: `checkpoint-current-DN2Nth/result.json`, 6/6. Every restored archive entry matches its original SHA-256. Full native restart/current authority/outside-failure-domain/scheduled cadence remains unverified.
- Bounded tracked-output/security audit reviewed 2,295 tracked/new nonignored files. No `.env.local`, `.eve/` or `local-artifacts/` paths are tracked. Four credential-pattern files were reviewed: they contain explicitly synthetic/controlled mocked Blob fixtures, not selected credentials. Full production and development dependency audit `security-audit-all-current.json` reports zero vulnerabilities. New feedback stdout exposes state/digests only; observation prose, participants and customer identities remain in guarded private artifacts. Existing access diagnostics tests retain only safe enumerated metadata.
- Unresolved release security blockers from this bounded audit: the public readiness route still uses its older broad readiness behavior (T061); actual hosted store/image cutover, protected status and full current-denial reconciliation are not yet established. Those gates remain open and 016 is not launch-approved. Independent operator review remains T068.

- Read-only actual hosted metadata inventory: `target-inventory-current-KDbrjU/targets.json`. Preview is schema 38, Production 55; both servers are PostgreSQL 18 and explicit supplied owner connections were verified. No migrations, provisioning, record changes, deployment or provider calls were performed. This exposed and prompted removal of the PostgreSQL-17-only recovery assumption.
- Protected health/status implementation: `health-status-current-noc1qm/result.json`, 7/7, including actual bound canonical login versus member/partner/MCP/header impersonation, locked diagnostics, minimal public 503, no anonymous sample writes, actual maintenance bindings, missing/failed tick handling and actual wrong-schema/wrong-grant refusal. Actual infrastructure/backups remain explicitly unverified; T060/T061 and the mandatory full health suite remain open.
- Exact completion timestamp and real elapsed worker outage/restart: `health-samples-current-YuYkgI/result.json`, 10/10. A single database clock value now records success/completion, removing a millisecond-boundary race between two separate clock calls.
- Owned eve/Next production build through health, feedback and workflow changes: `build-health-feedback-current.log`, passed, selected environment and original workflow state preserved. PostgreSQL-18 support was added afterward; fresh final build still required.

### Current-schema predecessor composition (2026-10-11)

The owned PostgreSQL 18 run `combined-predecessor-current-7KQqCC` passed all 39 foundation, conversation, membership/grant and MCP profile/evidence/knowledge/plan/report/authority cases with zero failures or skipped cases. Earlier fixture-origin failures remain in their private reports. Older load fixtures now create actual membership-bound sessions on schema 056+ while retaining pre-056 compatibility; runtime admission is unchanged. The new `check:pilot-regressions` command composes complete predecessor gates, all 39 current-schema cases, and fresh four-project pilot WebKit acceptance. Its complete composition has not yet passed; T081 remains open. This local evidence does not establish hosted behavior.

The subsequent full predecessor checks passed 77 learning domain/native fixture cases, 25 actual local eve native checks without paid calls, 198 cases across the 40-suite gap regression composition, 120 complete gap cases and 57 complete partner cases. Their immutable private reports retain prior failures. Ordinary gap/partner harnesses now upgrade their owned databases to the installed schema; explicit predecessor migration rehearsals retain their original 047→049 and 049→051 boundaries. Disposable learning/partner/MCP/gap environments supply the actual Git commit required by maintenance. The scheduler unit fixture now supplies its physical IO fence dependency instead of silently preventing every mocked tick. Current cross-workspace tests separately prove rejection of a forged session scope and concealment for a genuinely bound foreign-workspace session. Full T081 composition, including fresh pilot UI, remains pending.

Read-only scoped Vercel inspection found an existing private Blob store connected to Turas in `iad1` and no container repositories. Hosted configuration lacks the new explicit Blob/job backend settings. Sensitive Production environment values are masked by Vercel when pulled; the private placeholder file is not a usable runtime connection or proof of deployed runtime grants. No selected configuration, hosted database, store, image or deployment was changed by these inspections.

### Complete predecessor composition and quality applicability (2026-10-11 continuation)

The complete `check:pilot-regressions` attempt passed all three groups in
`local-artifacts/016/regressions-ebbf6895-9d26-4a35-bddf-21206e033b3b/completed.json`: the eight required predecessor gates, 39 current-schema PostgreSQL 18 cases, and 40 fresh WebKit cases across four projects. Paid calls were zero; hosted proof is false. Earlier failed attempts remain preserved. This result represents its recorded source digest; subsequent quality-index changes require a fresh final composition. T081 remains open until the final source is verified.

The new `pilot:quality -- --base <full-commit> --output <new-private-directory>` command records source-bound applicability for nine governing evaluation catalogs: capability/context/artifact honesty, retrieval, research, plans, staffing, execution, support, expansion, and learning. Shared domain, authentication, recovery, API, migration, model/package, or evaluation-fixture changes conservatively require fresh evaluations. An apparently unchanged path still requires historical-proof review; no historical capture is accepted automatically. Each entry maps evidence/citation/abstention, owner, or publication boundaries to its existing full evaluation/verifier commands. The command neither executes providers nor grants budget or release authority.

`local-artifacts/016/quality-unit-current.json` passed all five applicability cases; `typecheck-quality-current.log` passed and `git diff --check` was clean. The actual private index in `local-artifacts/016/quality-applicability-current/quality.json` identifies nine fresh-required catalogs, with actual-model quality, hosted proof, historical acceptance and budget admission explicitly unverified/false. Earlier 011/014 budgets are not reused. T069 stays open: current live evaluations and governing reviews have not been run. T065's index is implemented; final-source indexing remains part of closeout.

### Exact owner recovery boundary (2026-10-11 continuation)

Recovery control and database checkpoint now require `current_user` to match the actual `operations_control` table owner, rather than accepting any role with UPDATE permission. The added actual PostgreSQL regression creates a delegated NOLOGIN writer, proves its UPDATE grant exists, and verifies both control transition and capture reject it before any callback or mode change. The owned PostgreSQL 18 control/checkpoint cohort passed all 18 cases (12 control, six checkpoint) in the private `recovery-owner-current-*/result.json` attempt, with original resources and selected state preserved. This fixes the owner boundary; it does not claim full matched capture/restore or current-authority reconciliation is implemented.

`docs-quality-current.log` passed the documentation check, `build-quality-current.log` passed the web/eve build, and `typecheck-owner-current.log` passed the pilot typecheck. The build preceded the last owner-check change; the final-source build remains a release gate.

### Portable content proof, isolated restore and conservative authority recovery

The owned PostgreSQL 17/18 restore case now creates normally reviewed profile/knowledge content, captures a portable all-domain content and sequence digest under the actual source checkpoint fence, and compares the restored content rather than just principal counts. It passed in `local-artifacts/016/recovery-content-cross-major-current.json` (one complete case exercising both majors). Recovery/archive manifests now bind `acceptedContentDigest`; schema/grant authority remains a separate check. Object recovery hashes canonicalize JSON property order after the real composed fixture exposed different hashes for identical object descriptors. Earlier failed attempts remain private evidence.

`pilot:recovery:check -- --restore-isolated` now restores authenticated archives into an already locked, separately named owned 016 database only. It validates all captured content, exact installed ledger, explicit runtime grants, and six object namespaces/four store kinds, preserving authenticated workflow bytes without starting or claiming to resume a runtime. Actual fresh authority reconciliation and outside-domain proof remain unverified. PostgreSQL cleanup stops the owned restore container before removing runtime grants, including on partial failure, and no command promotes or unlocks. This is not a Production/Preview restore CLI or a 055 prechange backup. T051–T058 remain open for full scope.

`local-artifacts/016/isolated-restore-current-5.json` passed all three composed cases: successful physical restore of accepted content plus four real object kinds; wrong-key rejection before target replacement; and validly encrypted but wrong content proof rejected after restore with runtime access removed. The synthetic workflow/outside-copy/current-authority manifest flags in this fixture establish contract mechanics only. The returned full readiness/current-authority flags are false. No actual provider, accepted report rendering, partner training recovery or managed Workflow restoration is claimed by these three cases.

The absent-current-proof fallback now revokes restored sessions, permanently removes MCP credential hashes, revokes active partner grants, and preserves captured fact histories and permanent receipts while every required scope stays globally fenced. MCP credential tombstoning uses its existing irreversible identity trigger; it does not fabricate a human revoker membership. Management metadata reports an unexpired credential with a permanently removed hash as revoked and excludes it from active-credential limits. `pilot:recovery:authority -- --quarantine` records actual owner-bound, exact marker/recovery/revision scope. It cannot produce full current-denial/replay verification or unlock. The composed restore invokes this fallback automatically.

Migration 057 also denies runtime login-session INSERTs in quiescing/locked modes at the database boundary, including legacy inserts without bound-workspace columns. Owner migration/restore operations retain their explicit owner path. This closes a legacy login-write bypass; externally stopping/protecting older deployments and unfenced workers remains required before release/capture. The draft 057 manifest checksum was refreshed, with no hosted migration applied.

`local-artifacts/016/recovery-quarantine-current-PTGWke/result.json` passed all 35 actual PostgreSQL 18 cases (12 control, 12 admission, six database checkpoint, five authority quarantine). Quarantine cases cover runtime denial, actual credential/grant revocation, wrong scope, idempotence and the owner CLI retaining histories/receipts. The eight-case full current-authority catalog is still unimplemented and is not replaced by these fallback cases.

### Due-work maintenance health (continued implementation)

- `maintenance-backlog-current-6cUXBW/result.json`: 37/37 actual owned PostgreSQL 18 cases across all fifteen bindings, typed observations, scheduler behavior and new due-work cases. Future retention/retry times are excluded; overdue work is ordered before the 1,001-row cap; the returned oldest timestamp comes from the queue. Healthy knowledge publications receive an actual persisted inspection timestamp rather than remaining permanently overdue. Draft migration 057 and its manifest were updated explicitly; no hosted schema was changed.
- `health-current-wYM7Fu/result.json`: 8/8 actual owner/runtime and bound-session health/status cases. Public output remains only `{ready:false}` with 503. Internal members, partners, MCP credentials and role headers cannot obtain operational diagnostics. A fresh successful tick with an overdue backlog fails its class without masking healthy independent classes. Infrastructure and backup acceptance remain unverified; these checks do not establish hosted readiness or replace a stale-backup restore exercise.
- Health observations now retain the actual oldest due timestamp alongside bounded counts for the existing ninety-day retention window. Runtime may insert that typed field but cannot supply sample clocks or edit/delete observations. This last sample-column change requires the subsequent verification recorded separately below.
- T060/T061 remain open pending the complete stopped-class/backup and actual infrastructure readiness acceptance. No pilot-ready, merge or deployment claim is made.

- `maintenance-backlog-current-u03KRm/result.json`: 38/38, rerun with the explicit oldest-due sample column/runtime grants, including immutable typed age observation without clearing queues or changing success clocks.
- `maintenance-worker-refresh-bjlIxa/result.json`: actual SIGKILL, real stopped-clock observation and restart, 1/1. All fifteen required classes became stale through actual polling in about 92 seconds, then completed fresh ticks under the restarted worker. Together with the 8/8 `health-current-wYM7Fu` authorization/readiness diagnostics cohort, this completes T060's health/status/stopped-class/safe-output tests. T061's actual infrastructure/backup readiness remains open.
- Fixed load measurement mechanics: `load-measurements-current.json`, 8/8 unit cases. Eighteen immutable classes, ≥100 completed measured samples each, exact fixture population and 25 observed actors, strict overall/per-class failure rates, all slow/error samples retained, admitted MCP versus client latency separated, natural quota waiting counted, no quota resets/provider calls. Pure assessment is not a performed benchmark or platform resource proof.
- Actual owned population: `load-fixture-current-yuVHWL/result.json`, 1/1 in about 35 seconds. Exactly 25 normally issued bound sessions (15 internal/10 partner), 250 synthetic customer references, 2,500 normally proposed/accepted manual evidence records, 10,000 materialized eligible delivery passages, 2,500 ordinary administrator partner grants, and zero embedding dispatches. Owner scaffolding creates synthetic identities/customer references only; no acceptance state or grants are inserted directly. Other accepted/published read-class fixtures and the complete timed workload are still pending; T063/T066 remain open. The preceding duplicate-state fixture failure is retained in `load-fixture-current-AuC8Rj` and was corrected by respecting the customer creation trigger's existing profile state.
- Main and pilot typechecks and documentation checks pass after these changes. Protected selected configuration, root model and workflow state were preserved by the owning harnesses; no Production/Preview mutation, paid dispatch or deployment occurred.

#### Load corpus eligibility correction

The initial population result above proved reviewed rows and current materialized
passages, not freshness eligibility: most manual claims had unknown observation
dates. It is **not** acceptance of the required eligible-passage population and
must not be selected for the load gate. The fixture now proposes dated synthetic
product-use observations, reviews each normally, and calls the actual retrieval
quality reader and `currentFactEligible` for every revision before materializing
its four passages. A fresh run is required; previous population/delivery/training
prototype captures remain historical mechanics only.

The initial actual SDK attempt rejected a large profile page. Ten large record
payloads plus the duplicated MCP text/structured envelope exceed the unchanged
131,072-byte response ceiling. The fixed positive read uses one-record profile
pages within the existing limit; no server cap, scope, role or quota is relaxed.
Failures are retained in `load-mcp-current-xndt2A` and
`load-mcp-current-3fgOcK`; a fresh complete SDK attempt must pass all 25 consumers
and five categories. This is separate from the required timed workload.

### Fixed-load fixture and instrumentation follow-up (2026-10-11)

The owned PostgreSQL 18 evidence-fixture check
`local-artifacts/016/load-fixture-current-SDBhcV/result.json` passed its one case:
25 normally issued membership-bound sessions, 250 synthetic customers, 2,500
explicit ordinary partner grants and 10,000 individually reviewed, currently
fact-eligible customer passages. This capture precedes the later heterogeneous
compact report fixture and is retained as fixture mechanics evidence only.

The corrected actual pinned-SDK fixture capture
`local-artifacts/016/load-mcp-current-r2CIht/result.json` passed its one case,
including all 25 consumers and all five positive categories (125 read receipts).
The report sample was made compact without increasing the existing 40-slide or
128-KiB MCP response limits. The fixed corpus now has 60/30/30 passages in its first
three customers and 40 in each remaining customer, totaling exactly 10,000; each
passage still originates in a normally reviewed, currently eligible observation.
This capture precedes the subsequent compact lexical-terminology adjustment and
benchmark request changes; it is not a fresh full-source acceptance receipt.

`local-artifacts/016/load-statistics-current-jYnxfq/result.json` passed all nine
instrumentation/measurement cases. Disposable PostgreSQL 18 uses owner-only
`pg_stat_statements` instrumentation and counts successful top-level runtime
statements without capturing query text. Reset/eviction invalidates the count;
unknown per-request counts remain null. Class aggregate counts are separately
attributed to each serial request wave. These tests do not establish workload
performance or hosted capacity.

The actual benchmark now exercises 13 ordinary HTTP classes and five pinned-SDK
classes with real actor sessions, ordinary reviewed delivery/training/knowledge/
learning records, exact MCP admission receipts, actual quota pacing, observed
Docker/app resources and a two-minute warmup plus ten-minute measurement. Search
uses the unchanged five-active ceiling, MCP waves respect the unchanged concurrent
workspace ceiling, and queue/client/admitted time remain separate. Natural quota
pacing may extend measured sampling only up to the fixed 60-minute bound. No model
or embedding provider credential is admitted, and quotas are never reset.

Initial owned warmup attempts were stopped rather than accepted: an oversized
customer-wide report exceeded its existing slide cap; a deferred hypothesis was
incorrectly read through an active-only list; and compact lexical observations
omitted a required search term, causing missing search/citation results. The
benchmark now requests the exact deferred record and retains every actual sample
and safe class failure diagnostic, including on interruption. Final reports are
prepared after the normally reviewed synthetic learning outcome so their source
snapshot is current. T063 and T066 remain open pending the complete timed capture
and complete fault catalog. No hosted migration/deployment, paid call, external
message or Production pilot approval occurred in these checks.

### Complete owned fixed-load capture (2026-10-11)

`local-artifacts/016/load-sF3VHG/completed.json` records a source-bound successful
actual HTTP/pinned-SDK benchmark. Its source digest is
`17eef05cdc30a679caf018307cd3ef5c332471b82ae06d8e5c05a0020e02693f`.
The 120,000-ms warmup was followed by 603,560.889625 ms of measured work (total
723,560.889625 ms). All 18 required classes passed, with 3,370 completed measured
reads, at least 120 per class, zero unexpected failures and zero quota denials.
The largest ordinary-class p95 was 341.391 ms; the largest actual admitted MCP
category p95 was 261 ms. All five MCP categories used exact persisted admission
receipts; client latency and queue wait remain separately captured. No quota state
was reset and no paid model/embedding call was admitted.

The benchmark captured 354,442 successful top-level runtime SQL statements across
its measured class waves, without SQL text, and actual owned database/app resource
observations in `resources.json`. It verified unchanged source after the run and
completed its owned cleanup/protected-state checks. No labelled owned pilot
container remained. These are observed local resources and performance, not
hosted capacity or hosted readiness. Samples, full class results and any earlier
failed/interrupted attempts remain private and distinct. T063 is complete; T066
remains open for the complete fault catalog. Later implementation changes require
fresh final source-bound acceptance before release.

### Storage rehearsal and complete owned fault follow-up (2026-10-11)

The compact fixed corpus passed its fresh one-case verification in
`local-artifacts/016/load-fixture-current-raEViO/result.json`: all 25 issued bound
sessions, 250 synthetic customers, 2,500 partner grants, 2,510 ordinary accepted
revisions and exactly 10,000 currently eligible customer passages. No provider
embedding operation was created.

`local-artifacts/016/isolated-restore-current-6.json` passed all three fresh physical
restore cases, including the bounded transaction change. This remains content/
object restoration with locked quarantined authority, not service restoration.

`local-artifacts/016/storage-copy-current-F7DKBT/result.json` passed all five new
fenced local-copy cases: six namespaces and cold parity, idempotent retry, changed
revision/open-fence refusal, destination conflict and missing-source refusal.
Source bytes remain intact; no configuration or hosted store was changed. The
first attempt failed because the owned test artifact parent was absent; its failed
capture is retained separately. T045 remains open for actual legacy/hosted copying,
reconciliation and authorized cutover.

`local-artifacts/016/faults-J3bHvu/completed.json` records a source-bound full owned
fault catalog: nine complete suites (64 cases) plus actual PostgreSQL stop/start
with HTTP denial, minimal 503 readiness, and verified profile/session recovery.
Controlled SDK/domain cases cover storage unavailability, network/port denial,
original deadline, uncertain launch, lease/source loss, orphan reconciliation,
cost scope/exhaustion/unknown dispatch, all 15 class bindings, health access and an
actual worker crash/restart. No paid provider dispatch occurred. The earlier
`faults-q2YY9N` attempt failed solely because its outage verifier mistakenly required
a 5xx instead of recognizing the actual 401 admission denial; it is not selected
as acceptance or combined with the later pass.

Remote fault mechanics remain explicitly controlled fixtures; this is not hosted
Blob/Sandbox fault proof or the independent operator exercise. The actual database
outage timing is recorded separately in `database-outage.json` and is not full RPO/
RTO. Later CLI registration/evaluation-fixture changes invalidate selecting these
captures as the final current-source bundle; final acceptance remains fresh after
the last implementation change. T066 remains open for that final complete bundle.

The owned encrypted candidate capture executed three real PostgreSQL 18 cases in `local-artifacts/016/capture-candidate-current.json`, all passed: matched pinned dump/stable workflow capture with authenticated decryption; incorrect locked revision rejection with no retained partial bytes; captured-key/pre-interrupted rejection preserving originals. The command emits only a candidate, with current authority, workflow stop/resumption, outside-domain copy, scheduled execution and restoration readiness unverified. T051 remains pending. The completion receipt now follows successful checkpoint commit/fence release; failed completion removes its new partial receipt and encrypted output. Catalog registration and this failure-cleanup adjustment require a fresh check before final source acceptance.

T067's incident/withdrawal/revocation/worker/budget/uncertain-send/release procedures now identify actual owner authority, evidence, safe action, rechecks and stop conditions. The registered control command and existing readiness command are linked explicitly. This completes procedure authoring only; T068's independent operator exercise remains pending. Task completion is now 52/84.

Four real owned capture cases passed in `local-artifacts/016/capture-candidate-interruption-current.json`. The added case observes an actual exported Postgres checkpoint before interrupting, requires failed capture, retained locked control, absent partial output and successful acquisition/release of the prior capture fence. Three physical restore cases also passed after restore command cancellation was added; the previous restore result is retained separately. Four actual child-process cancellation cases passed in `local-artifacts/016/recovery-cancellation-repeated-current.json`, including repeated SIGTERM while cleanup is still running. Capture, restore and integrity verification now retain signal handlers until bounded cleanup settles. These checks do not replace the unfinished eight-case full recovery/current-authority catalogs.

A private hosted preparation draft is retained at `local-artifacts/016/hosted-release-preparation-draft.json`: existing target identities, dated PostgreSQL/schema observations, local image preparation, exact disabled-first migration/service order, required protected configuration names, actual participant input and missing cost/recovery/hosted prerequisites. It explicitly admits no execution, budget or hosted proof; T072 remains open until the concrete measurable cost/credential and full recovery prerequisites are resolved. No external service was provisioned and no model/send request was dispatched.

The protected database health check now also rejects runtime CREATEDB/REPLICATION, database CREATE and direct/indirect membership in owners of public relations/routines, including NOINHERIT memberships that permit SET ROLE. The real PostgreSQL 18 health catalog passed all eight frozen cases in `local-artifacts/016/health-privileges-current-YNQuUq/result.json`; its existing schema/grants case now changes each privilege and restores it, including a two-hop owner membership. This expands actual grant validation without claiming store/image/backup health. T061 remains pending for those actual producers.

The operator selected an existing operator-controlled backup destination for 016. Its actual path/bucket and access method remain requested; neither the selection nor the preparation draft proves a reachable destination or outside-failure-domain copy.

After the current capture/cancellation/privilege changes, `npm run build:web:check`, `npm run build:eve:check`, main typecheck, pilot typecheck and `git diff --check` passed. The eve build used the existing `--skip-sandbox-prewarm` command and did not dispatch an actual model request. The full predecessor/current-schema/WebKit regression composition is running with the prepared owned images; source edits are held during that source-bound capture. These checks remain local and do not satisfy CI, hosted deployment or full recovery acceptance.

The current actual AI Gateway catalog was queried read-only for the unchanged `spacexai/grok-4.7` model. Its selected published input/output rates were $2/$6 per million tokens, respectively; the existing conservative 500k input plus 500k billed-output ceiling reserves $4 per model step. Metadata is private at `local-artifacts/016/model-pricing-preparation-current.json`. This made zero paid generation calls and admitted no 016 evaluation budget. The legacy governing runners still need one consistent finite admission/accounting boundary for the full fresh catalog before any new model batch; the earlier 011/014 budgets have not been repurposed.

The fresh regression composition `regressions-fde8ba6a-93ed-4b4d-9acd-60e0b811136d` failed before browser execution at 014 WebKit's owned production build. Its domain/native gates passed, but they are not a replacement for the failed complete run. The retained synthetic build log identifies omitted `infra/pilot/load-profile.json` in the disposable app copy, causing typecheck failure. All seven applicable source-copy inventories now include `infra`; the complete composition is rerunning from the beginning with no filters or lowered assertions.

Four owned PostgreSQL 18 capture cases passed with payloads in all six object namespaces, authenticated candidate verification, tampered provenance/inventory and forged-readiness rejection, wrong-key rejection and post-exported-checkpoint interruption in `local-artifacts/016/capture-candidate-wrong-key-current.json`. Pilot typecheck passed. The schedule inventory assessment now distinguishes required independent-authority retention from verified retention; it no longer asserts that independent records exist merely because deletion is prohibited. All five schedule-policy cases passed in `local-artifacts/016/backup-schedule-authority-current.json`.

The operator authorized creating the backup destination using existing resources. A private `Turas Recovery` destination was created in the already signed-in macOS iCloud Drive, with separate managed-backup and independent-authority directories and a local key directory outside the cloud destination. The encrypted synthetic probe actually uploaded, was locally evicted, downloaded from iCloud with matching digest and successfully decrypted using the separately held key. The synthetic probe/key were removed afterward. Private preparation, cloud-status and cleanup receipts are retained under `local-artifacts/016/`; no Production/customer data or fresh paid model request was dispatched. This verifies destination reachability only. The first two full owned-candidate copy attempts failed closed (the second identified iCloud server-unavailable error 4355); their logs and explicit owned-cloud-copy cleanup records remain private. The full copy command is being checked separately and cannot yet be selected as successful evidence. Independent current-authority production and the 12-hour schedule remain unproven; T051/T052/T054 remain pending.

The third complete owned-candidate copy passed against the real operator iCloud destination (`local-artifacts/016/operator-cloud-copy-third-current.json`). It captures a real locked PostgreSQL 18 dump, six nonempty private object namespaces and stable workflow bytes, authenticates the candidate before copying, and requires actual cloud upload/local eviction/digest-matched download of both encrypted archive and receipt. Original encrypted digest remained unchanged. The exact synthetic cloud copy was removed afterward and its cleanup receipt retained. The utility now waits within its fixed deadline for Apple server-unavailable status 4355 to clear; quota/conflict/other errors still fail, and failure never substitutes a local read for cloud proof. No key, Production data or paid model request was copied/dispatched. `pilot:backup:copy` is an operator-macOS command, not a hosted iCloud connection or managed scheduler. Independent current authority and full recovery remain unverified; task completion remains 52/84.

The current privacy-hardened operator copy also passed (`local-artifacts/016/operator-cloud-copy-private-current.json`), requiring explicit unshared and sync-enabled iCloud file status before eviction/download. Two exact cloud proofs, six object namespaces and original digest preservation passed; `operator-cloud-copy-private-cleanup-current.json` records removal of the owned synthetic copy. The permanent destination directories remain intentionally. `npm run check:docs` and pilot typecheck passed; no full feature/hosted acceptance is claimed.

The fresh current capture rerun passed all four owned PostgreSQL 18 cases in `local-artifacts/016/capture-candidate-key-boundary-current.json`, including rejection of a recovery key inside an additionally excluded destination root. The operator copy enforces this exclusion for the entire cloud recovery directory. This verifies separate-key admission without exposing or copying key bytes.

### Personal-storage rejection and removal (2026-10-11)

The user explicitly prohibited personal iCloud storage for this potential work tool. The prior iCloud experiment was an incorrect infrastructure choice and is disqualified from all acceptance evidence. Only synthetic encrypted test data was copied there; the test archives and temporary keys had already been deleted. The two empty cloud subdirectories, their created recovery parent, and the empty local key directory have now been removed. The iCloud executable, npm command, active destination configuration and private recreation scripts were removed. Historical private test logs remain only as rejected-attempt records in the checkout. Planning/runbook guidance now requires work-controlled infrastructure and inspection of existing Neon recovery, with separate protection for private files and independently current denial/replay records. No Production backup or successful 016 recovery is claimed.

## Durable missing-authority quarantine

The conservative restore path now persists all seven required quarantine scopes
(sessions, MCP, grants, sources, publications, external effects and workflows).
Runtime has read-only access; owner-trigger admission binds the exact locked
recovery and revision. Both the domain unlock and database unlock reject unresolved
quarantines, even when an owner supplies a fresh verification label. Replay retains
original quarantine timestamps. Unreconciled dispatched cost reservations become
unknown; settled charges and permanent cost reconciliation records remain intact.

Four owned PostgreSQL 18 recovery-quarantine cases pass in
`local-artifacts/016/recovery-quarantine-transaction-fixed.json`. The earlier failed
migration-checksum and test-transaction reports remain separate. Eight owned health
cases pass in `local-artifacts/016/health-privileges-current-z4NwjD/result.json`,
including rejection of each quarantine write privilege. Pilot TypeScript passes.
These are restricted fallback proofs, not current-authority reconciliation or full
recovery acceptance; T052/T055/T056 remain open. No Production schema or data changed.

Read-only Vercel queries confirmed the existing work-team Neon integration and one
Neon resource. Its effective restore window and separately retained current-denial/
replay storage have not been verified. No personal storage is an admissible recovery
destination. No infrastructure was provisioned by these queries.

The actual isolated restore catalog also passes all three cases after the durable
quarantine change (`local-artifacts/016/isolated-restore-quarantine-current.json`).
It restores into separately owned targets, preserves factual content and private
byte inventories, and remains locked with missing current-authority proof. It does
not establish hosted restoration, workflow resumption, or readiness.

## Interrupted effects and locked logout

The missing-proof fallback now holds interrupted native responses as failed with
uncertain dispatch, retains native IDs and places watchdogs in needs-attention.
Interrupted report sends become uncertain without changing provider keys, first
 dispatch timestamps, attempts, successful deliveries or permanent provider receipts.
All six owned quarantine cases pass in
`local-artifacts/016/recovery-quarantine-effects-policy-fixed.json`; provider
responses in these cases are synthetic and no real mail or model was dispatched.

The actual runtime report path exposed an unnecessary row lock on immutable policy
revisions. Locking the mutable policy head retains the approval fence and works
without granting UPDATE on immutable history. Owner-only clock/trigger fixture
setup is now separate from runtime application behavior. The complete three-file
scoped report regression run passes 10 cases (policy review 1, outbox 8, process
crash recovery 1) in `local-artifacts/016/report-runtime-policy-current-AazICy`.
The earlier failure report remains separate. This is not the full predecessor gate.

Logout now resolves only the exact POST logout session while recovery is closed;
it retains origin/CSRF checks and conveys no ordinary mutation/cancellation authority.
Four owned cases pass in `local-artifacts/016/recovery-logout-current.json`, proving
permanent revocation after reopening, rejected CSRF/origin, narrow authority and
idempotent revocation. Pilot TypeScript and diff whitespace checks pass.

## Hosted admission implementation

The hosted runner now validates private scope/run binding, committed source,
authenticated Vercel deployment and origin resolution, and an explicitly supplied
Neon runtime connection. The shared database validator checks exact schema/ledger
and runtime restrictions without borrowing the selected connection or owner role.
It requires the exact active synthetic workspace and rechecks deployment/source/
protected checkout before writing a private preflight receipt. A successful preflight
still exits nonzero with a separate blocked receipt: authenticated journeys and the
full hosted catalog are unfinished. T071 and all hosted acceptance remain open.

Seven deployment/scope boundary tests plus one actual owned PostgreSQL runtime
validation case pass in `local-artifacts/016/hosted-preflight-owned-current.json`.
These controlled metadata responses and local databases are not hosted proof.
No 016 hosted preflight or release has been executed. Live inspection of the existing
work-team Neon resource confirms availability and a Free plan; actual restore-window
and independent recovery-authority retention remain unverified.

## Hosted role boundaries and archive storage

Six owned PostgreSQL cases now pass in
`local-artifacts/016/hosted-role-cleanup-cancellation-current.json`: exact role/session
binding, positive and denied partner reads, missing credentials, cross-workspace
disclosure, changed serving release, malformed login cleanup and parent cancellation
are covered across the six cases. The transport invokes actual application route
handlers inside disposable environments; these are not live hosted journeys. Three
serving-version unit cases plus existing HTTP cases passed in the earlier ten-case
`hosted-role-version-current.json` run. The serving response header binds reads to
the expected commit. Actual read-only Production deployment metadata parses through
the same deployment verifier (`hosted-metadata-parser-current.json`); this proves
metadata compatibility, not deployment of the current checkout.

The fresh eight-case database/health restriction regression passes in
`local-artifacts/016/health-privileges-current-iHiS8H/result.json`.

The new separately installed Neon archive schema stores bounded immutable encrypted
chunks, enforces seven-day managed retention, and keeps runtime/public access denied.
Four owned cases pass in `neon-archive-cold-download-current.json`, including a fresh
connection, full encrypted download equality, conflicting replay, missing chunks,
partial-download removal, source tampering, capacity/expiry rejection and cancellation.
No application request installs this schema. Storage receipts explicitly leave
independent placement and restoration readiness unverified. These tests use a
disposable local database and do not establish a hosted backup, current-authority
reconciliation or the required scheduled cadence. T051/T052/T054/T071 remain open.

## Work-controlled database safety copy and 055 forward rehearsal

The separate work-owned Neon Free archive and undeployed operator project are
provisioned. No app link/deployment, selected-connection change or Production
migration was performed. The explicit archive capacity migration raised retained
ciphertext from 200 to 400 MiB, preserved existing immutable archives and left the
Free plan unchanged. Six archive cases, four destination cases and four source
cases pass in `neon-archive-capacity-current.json`; two repeatable-read content
cases pass in `database-safety-content-current.json`; three isolated legacy
restore cases pass in `legacy-safety-restore-current.json`. Twelve strict context/
source/destination cases pass in `legacy-safety-contracts-current.json`.

Actual hosted synthetic encrypted roundtrip, owned-candidate cold copy and expiry
command receipts are retained privately. The expiry invocation found zero expired
archives; it is not recurring cadence proof. The first Production dump attempt
failed before storing a key; the second stopped on missing client-container CA
trust. The corrected dump mounts the root-owned system public CA bundle read-only
and retains `verify-full`; no verification downgrade was used. Historical failures
remain in private evidence.

`production-database-safety-copy-content-v2/database-safety-copy.json` records a
successful actual read-only Production schema-055 snapshot, authenticated content/
ledger context, encrypted cloud copy, fresh-connection cold download/decryption
and separately verified encrypted work-project key. Protected operator connection
binding remains explicitly distinct from readable platform-variable proof.
Temporary plaintext/key staging is removed.

`production-legacy-safety-rehearsal-current/rehearsal.json` records successful
restoration of that actual copy into a disposable PostgreSQL 18 target, exact
application-content and ledger verification, explicit 056/057 forward migrations,
runtime connection denial and durable quarantine. The owned target was destroyed;
Production was unchanged and remains on 055. This proves only database restore/
forward compatibility. Private objects, current authority, Workflow resume, full
service RPO/RTO and scheduled cadence are not established. The archive's separate
work resource is in the same region, so provider/regional failure independence
remains unverified. T051–T054 and full hosted/recovery acceptance remain open.

## Complete cross-feature withdrawal and interrupted cleanup catalog

T042's eleven exact lifecycle cases pass without skips/retries in
`lifecycle-extended-fixed3-current.json` on owned PostgreSQL 18/schema 057. The
original nine cases cover knowledge withdrawal, search/index/citation withholding,
stale native context, MCP reads/revocation, original-profile retraction and exact
permanent replay after cleanup. The added original-artifact case proves immediate
attachment/native-context denial, original-store failure and bounded retry, exact
delete replay, physical removal and continued denial while native retirement is
still explicitly unconfirmed. The report case publishes actual monthly PDF/PPTX
outputs using ordinary review, opens an authenticated stream, crosses the existing
payload expiry, verifies immediate stream/download denial and injects a controlled
Blob interruption after one deletion. Retry reconciles the missing object, purges
the remaining object idempotently and retains permanent publication history.

Historical failed fixture attempts remain private: extraction was not yet
published, weekly reports have no PDF/PPTX files, and the first controlled Blob
fixture omitted the readiness-list stub. That omission attempted a metadata call
with a synthetic invalid credential and failed; it is not hosted storage proof.
The corrected complete run stubs all Blob operations and dispatches no model or
email calls. It runs the real local renderer and domain/runtime permissions.
Local original files untouched by the mirror are destroyed with the owned harness;
no primary records/stores or root workflow data are changed. T046's complete UI/
storage catalog and actual hosted lifecycle checks remain separate.

## Independent minimized denial/replay retention

The archive's explicit 003 owner migration is installed in the separate work
resource (`neon-authority-retention-migration-current.json`), preserving every
existing archive and the Free plan. Ten archive cases pass without skips/retries in
`neon-authority-retention-current.json`. They cover permanent hold immutability,
unchanged exact replay, ordinary expired-backup deletion, held-ciphertext survival
after expiry, owner-only writes even after accidental runtime grants, wrong
context/installation, missing chunks, cancellation and explicit migration gates.
No Production/app database DDL was performed.

Four minimized current-state cases pass in
`recovery-denial-snapshot-v2-inventory-current.json`: actual owner snapshot, source
text/credential omission, later MCP revocation and permanent receipt capture,
foreign/runtime/cancelled/stale/changed proof denial and fail-closed oversized
inventory. Revocation is tested before cleanup: the credential-presence bit can
remain true while actual bearer authentication is denied. Paid/native/service
state inventories and schema-057 operational charges are explicitly required.

Actual Production source capture in
`production-denial-snapshot-v2-current/snapshot.json` records 60 schema-055 tables,
775,172 minimized bytes, authenticated cloud ciphertext, fresh-connection cold
download/decryption and independently verified work-project key availability.
Only minimized metadata is held beyond managed backup expiry; full customer
database dumps retain their ordinary seven-day rule. Temporary plaintext/key
staging is removed. The earlier retained v1 metadata run is historical narrower
coverage and cannot satisfy the v2 verifier. All receipts explicitly leave current
authority acceptance, restored replay reconciliation and restoration readiness
false. This implements actual independent retention/capture but does not complete
T052's restored-target reconciliation, workflow/provider resolution or scheduling.

### Current credential denials in an actual Production-copy rehearsal

The fresh independently retained Production denial snapshot was read from the work-owned Neon archive, authenticated against its separately retained work-project key, and applied after restoring the content-bound schema-055 database safety copy and explicitly migrating the disposable target through 056/057. The rehearsal passed with `pilot-owned-legacy-restore-v2`: 17 restored sessions were revoked, no authority was granted, all seven recovery scopes remained quarantined, runtime connections remained denied, and the owned target was removed. Production and the selected checkout database were unchanged.

The owned credential-denial catalog passed all six cases, including membership downgrade, newer revocations, unknown restored credentials, and exact-repeat behavior. The legacy restore catalog passed all five cases, including current-denial application and rejection of changed proof before target mutation. No skipped cases or paid model calls were used. Private receipts: `recovery-credential-denials-fixed-current.json`, `legacy-safety-denial-restore-current.json`, and `production-legacy-denial-rehearsal-current/rehearsal.json`.

This establishes credential/grant denial reapplication only. Source and publication reconciliation, permanent replay fences, provider/workflow reconciliation, full service restoration, scheduled cadence, RPO/RTO and release acceptance remain unproven. T052 and T053 remain open.

### Owned retirement of credentials used by older deployments

The new owned runtime-retirement catalog passed all five cases without skips. It demonstrates that the old runtime login cannot reconnect, an already connected old backend is terminated, and the replacement login inherits the existing restricted permission role without gaining schema/control authority. Session records remain unchanged and recovery remains locked. Exact repetitions preserve the replacement credential; stale revisions and conflicting replacement bindings fail before widening authority.

This is an owned disposable-database rehearsal, not Production credential rotation or full old-deployment release fencing. The operator cutover, hosted environment updates and actual old-deployment denial remain part of T050/T074. The protected CLI also ran successfully without retaining its replacement secret in output or receipts. Receipt: `runtime-retirement-restrictions-current.json`.


### Private registry and actual bounded Sandbox images

All three prepared Linux/amd64 images were uploaded to the existing work project’s private registry. Authenticated OCI index and platform-manifest digests match the prepared immutable images; repository metadata confirms private visibility and all platform manifests are ready. `infra/pilot/images.json` now binds their actual OCI/configuration digests, recipes, signature version 28149, OCR asset digest and fixed executable paths. Temporary Docker registry credentials were removed after both upload and verification. T034 is complete; task completion is 54/84.

Actual synthetic Sandbox checks passed for scanning, parsing, PDF/native PPTX rendering and Office edit/save/reopen. They used the governed executor’s fixed commands, verified input transfers, denied networking, no exposed ports or persistence, a maximum five-minute original deadline, sequential admission and finally stop/delete. Renderer validation checked the actual brand/font assets and produced validated PDF/PPTX bytes. Office text/table round-trip checks passed; this synthetic document had no chart, so chart verification was not applicable. These checks establish image execution only, not Production domain workflows or release acceptance.

The first actual scanner attempt exposed the SDK’s rejection of an already existing output directory. The executor now uses directories provisioned with the execution user’s ownership by the pinned image, and explicitly selects iad1. The corrected scanner passed. Twelve focused executor cases and the pilot type check pass. No uncertain provider creation or shutdown occurred, and no automatic paid retry was used.

The user authorized a $5 infrastructure cap. A $1 registry reservation and five $0.20 execution ceilings remain fully held ($2 total; $3 unallocated). Published iad1 compute/memory/creation prices put each five-minute execution below its reserved ceiling. These are conservative upper-bound accounting records, not claimed invoice costs; no reservations were released. Private receipts are under `local-artifacts/016/hosted-image-provision-current/`. No customer data or model calls were used.

### Versioned replay metadata and current projection denials

The v3 minimized denial/replay snapshot retains opaque request keys, request digests, actor/action identities, current accepted profile heads and retrieval lifecycle/generation/digest metadata. It preserves v2 reads for the narrower historical credential proof and never includes factual payloads, bearer credentials or source text. Four snapshot cases and six predecessor credential cases passed as a ten-case composition before projection reconciliation was added.

The complete current owned credential/projection plus legacy restore composition passed all 13 cases without skips (`recovery-projection-denials-final-current.log`). Newer publication withdrawal suspends the restored mutable publication head and retires both old shared projections. Current accepted-head proof also retires an old profile projection before physical cleanup. Exact repeats make no new changes; accepted revision payloads and immutable decisions remain intact. Existing credential, membership downgrade and grant denials continue to pass. Earlier failed attempts are retained; one required a changed receipt-scope assertion, another exposed the fixture's two shared projections rather than one.

The owner recovery receipt is now `pilot-owned-credential-denials-v2`. This establishes credential/grant and projection denial application only. It does not reconcile every factual/source head, restore permanent replay fences into runtime commands, resolve external/provider/native Workflow state, clear any durable quarantine or permit unlocking. T052/T053 remain open.

The focused Sandbox suite passed 12 cases, the broader pilot unit suite passed 170 cases, and the eve build passed. The first web build exposed the Next.js ambient `ProcessEnv` requirement for `NODE_ENV` in three restricted operator subprocess environments; those environments now preserve that standard setting while retaining their secret allowlists. The corrected web build is tracked separately and must pass before acceptance.


### Current owned authority catalog and durable replay/source denials

The full snapshot/credential/legacy-restore/retirement/authority composition passed all 31 assertions, but reported one unhandled idle-pool error during forced old-login retirement. That run is not a clean acceptance report. The idle connection failure path now discards pg's already-removed idle connection with a static, non-sensitive diagnostic; active query failures still reject normally. The complete affected authority/retirement rerun passed all 13 cases with no unhandled errors (`recovery-authority-pool-fixed-current.log`). The eight mandatory authority cases passed without skips. T055 is complete; implementation is 55/84 tasks.

Those eight cases cover newer grant/session/MCP revocations, a real governed artifact delete before physical cleanup, a governed publication withdrawal, a missing restored permanent request, the old raw session lookup after locking, and absent-proof quarantine. Each current-proof case uses actual owner-held PostgreSQL state, AES-authenticated cold metadata read with a separately retained synthetic key, and explicitly modeled older mutable target rows. These are owned authority tests, not a substitute for physical full restore, hosted old-deployment denial or native Workflow recovery. Original bytes and accepted histories remain intact. The absent-proof case initially failed because the fixture passed extra fields; the strict command contract was preserved and the fixture corrected.

The still-unreleased explicit 057 migration now installs owner-only immutable `operations_replay_fences` and `operations_source_denials`, with corresponding runtime grant/readiness checks. Replay guards use hashes of actual unique idempotency-key tuples; they reject restored missing requests before insertion without manufacturing result payloads, allow genuinely new keys, and carry existing fences through a second recovery. Governed request handling reports a conflict after transaction rollback. The minimized v4 snapshot records those digests and current source availability while retaining older v2/v3 readers for their narrower proof. No Production/app DDL has run.

Current source denial application clears obsolete accepted heads while preserving immutable accepted revision bytes, withdraws deleted artifact versions before cleanup, suspends obsolete publications, and adds explicitly owner-attributed research denial events when independent current metadata denies a research revision. Owner recovery events have no fabricated human reviewer. Immutable operational receipts bind each denial to its fresh source snapshot. Provider/native reconciliation and quarantine resolution remain required; no function grants authority or unlocks recovery.

The v3 actual work-cloud snapshot/copy rehearsal passed before these newer replay/source changes: 61 minimized tables, cold decryption, 17 old sessions revoked, zero new authority, locked target, exact owned cleanup and unchanged Production. Receipt: `production-legacy-denial-v3-rehearsal-current/rehearsal.json`. It is historical narrower proof, not current v4 acceptance. The corrected web build also passed (`web-build-fixed-current-20261011.log`).

An actual read-only Production schema-055 inventory reports zero artifact versions, workforce source versions, report store objects and engineering report store objects. It reports seven conversations and four response attempts. These counts do not prove provider inventories or native recovery; they identify the database-linked file cutover scope. Production owner capabilities for role creation, database creation and backend signaling were verified by read-only catalog queries. Receipts: `production-store-counts-v2-current.json` and `production-owner-capabilities-current.json`.

### Fresh v4 work-controlled denial capture and coupled restore

The fresh Production schema-055 minimized capture retained 63 tables (1,510,990 bytes) in the independent work-controlled Neon archive. Cold decryption and independently retained authority metadata passed. The existing content-bound encrypted schema-055 database safety copy was cold-restored into a separately owned disposable target, explicitly forward-migrated through 056 and 057, and reconciled against that fresh capture. The v4 rehearsal revoked 17 restored login sessions and installed 60 permanent replay fences. It left all required recovery scopes quarantined and runtime access denied; the owned target was removed. Production was unchanged. Private receipts: `local-artifacts/016/production-denial-snapshot-v4-current/snapshot.json` and `local-artifacts/016/production-legacy-denial-v4-rehearsal-current/rehearsal.json`.

This verifies database restoration, the expanded minimized denial inventory, and permanent-request fences against actual Production backup content. It does not establish matched private-object/managed-Workflow recovery, quarantine resolution, scheduled cadence, RPO/RTO, or full/restricted service readiness. The protected operator source remains explicitly identified; the platform’s sensitive connection value was not decrypted or changed.

The separately added explicit owner research-withdrawal integration case passed its narrow run (one selected case, nine filtered cases). It preserves original research passage bytes and records an owner recovery denial without fabricating a human actor. This narrow run does not substitute for the complete ten-case catalog or the complete recovery composition.

The fresh v4 combined integration run passed all 32 cases across denial snapshot (4), credential/source/replay denials (10), mandatory authority cases (8), legacy physical restore (5), and runtime retirement (5). The clean run had zero skipped cases and zero unhandled errors: `local-artifacts/016/recovery-v4-composition-current.log` (367.69 seconds).

### Complete eight-case interrupted recovery catalog

T056 passed all eight registered cases without skips or unhandled errors in `local-artifacts/016/recovery-eight-fixed-current.log` (100.03 seconds). The first eight-case run passed seven cases and failed one on an incorrect report-fixture import; that failure is retained in `recovery-eight-current.log`. The corrected complete rerun verifies exported snapshot invalidation after cancellation; interruption of an actual pinned `pg_restore` blocked on a target database lock and subsequent runtime grant closure; missing operator key/dump/private object refusal; wrong environment/schema refusal; owner/runtime unlock denial without verification; exact artifact cleanup retry and completion while locked; uncertain cost/send holds without provider retry; and shared UI-session/native/MCP/domain/job admission denial. This is owned local failure-path evidence, not hosted workflow recovery or an unlock/readiness decision.

The current pilot typecheck, documentation check, 170 unit cases across 34 files, and production Next.js web build passed. The four-project browser catalog and complete registered pilot composition are separate acceptance checks.

The complete four-project CLI WebKit UI catalog passed 40/40 with zero skips: desktop light/dark and mobile light/dark, ten journeys each. Private evidence is in `local-artifacts/016/ui-ErVUGt/summary.json`; source identity is recorded there. These checks cover local workspace and upload transport, not hosted processing or scanner acceptance.

The first complete registered pilot run failed at provisioning after passing its earlier suites. A prior isolation fixture retained the one allowed active synthetic pilot in the shared disposable database. Provisioning correctly refused a second active workspace. The provisioning tests now use separately owned disposable environments rather than deleting/relabeling the prior pilot or weakening the domain uniqueness rule; their five exact registered titles are unchanged. The failed full-run receipts remain in `local-artifacts/016/run-ebe6ed1c-3f83-4c10-bd2f-a28de0534161`.

The second complete catalog passed 105 cases before health scenarios failed on preexisting upload backlog. The health producer accurately retained that backlog; it was not cleared or relabeled. The eight health scenarios now execute in separate owned disposable databases, with the stalled-queue scenario first running all actual maintenance bindings before its controlled backlog change. All eight passed (`health-isolated-current.log`, 81.16 seconds), and the pilot typecheck passed. Failed full-run evidence is retained in `run-1682d2d4-055c-4a1d-888a-065c0bcf3c59`. No complete catalog acceptance is established by those partial runs.

A read-only work-project provider inspection verified all seven Production conversation native IDs against actual managed Workflow run records, bound to three original deployments. The four application response attempts are terminal (three completed, one cancelled); the seven durable session runs remain running. Private receipt: `production-managed-native-bindings-current.json`. This proves provider reachability and actual application/provider identity mapping, not idle/checkpoint/task validation, deployment handoff, cold native recovery or full restoration readiness. The installed eve execution-model guide preserves session identity and stream across a settled deployment handoff but refuses to move live or pending work; fallback can remain on the original deployment. Recovery must verify those conditions and preserve the original stream/deployment until sessions end, instead of assuming that a new deployment replaces existing runs.

### Managed Workflow inspection and v5 independent denial inventory

The canonical protected operator command completed against Production schema 055: seven conversation bindings resolved to their original managed Workflow runs and four recorded response attempts were inventoried. Application bindings remained unchanged; provider writes and model calls were zero. Run status alone does not prove an idle checkpoint, task compatibility, handoff, recovery, or service readiness.

The v5 minimized denial snapshot was independently retained in the work-controlled Neon recovery project and cold-decrypted with its separately retained work-project key. Its 65-table inventory contains 1,517,434 bytes, including conversation/native-run bindings and watchdog metadata without message bodies. Current-authority reconciliation, Workflow resumption, and full recovery remain unverified pending the separate restoration and provider checks.

The v5-coupled physical restore passed against the archived 055 database: full application-content integrity and forward migrations to 057 verified, 17 restored sessions revoked, 60 permanent request fences installed, and the owned target removed. Runtime admission remained denied and Production was unchanged. No quarantine was cleared, no authority granted, no native Workflow resumed, and full service readiness remains false.

Read-only current Production environment metadata identifies an existing eve memory Blob store; its provider metadata reports private access in iad1. No domain artifact/workforce/report Blob binding is configured in that metadata. This inspection does not prove an empty provider object inventory, matched object backup, or domain-store cutover, and performed no provider writes.

The five schedule tests now read the actual checked-in manifest instead of a parallel inline fixture, verifying its seven-day managed-archive expiry policy and independently retained denial records. The manifest already included `deleteIndependentAuthority: false`; no policy change was required. This is configuration verification, not hosted scheduler execution.

### Full-catalog scanner preparation correction

The v5 full catalog completed 142 cases before the access suite, then passed seven access cases and failed its malicious-original case; the complete eight-case recovery interruption suite had passed. The runner had not installed the actual prepared signature/OCR assets, and queue-only fixtures left a shape-only image record. The canonical runner now verifies the prepared image IDs, signature byte hashes and freshness, and OCR hash, installs those assets in its owned store, and restores the verified image attestation before each registered suite without altering retained domain queues. The upload fixture respects an explicitly selected immutable image instead of replacing it with an unrelated synthetic digest.

The actual owned upload-to-access sequence passed 16/16 registered cases, including the harmless EICAR antivirus original through the actual scanner. Current pilot type and authored-documentation checks pass. A fresh complete 466-case catalog is running; the failed partial run is retained and is not acceptance. The current 34 pilot unit suites passed 170/170, and the web build passed before the scanner preparation correction.

The subsequent full catalog stopped at the independent-authority suite with 122 passing cases and one freshness failure. A fixture used the host clock for its modeled pre-denial backup watermark while the denial capture and reconciliation used Postgres time. The fixture now records the watermark and cold-proof verification time from the source database; production freshness comparisons and rejection boundaries remain unchanged. The two affected authority suites are being rerun together before the next complete catalog.

Read-only metadata for the existing private eve memory Blob store binds its actual work owner and original project, reports available status in iad1 and count/size zero. These provider aggregate counts do not substitute for a matched prefix/byte inventory. Read-only native-owner deployment inspection found three original deployments, all READY; none was changed or retired, and old-deployment closure remains unverified.

### Quarantine resolution and SQL owner guard

Six owned resolution cases passed, followed by another complete six-case run that exercised the canonical `--resolve-quarantines` command. They cover denied runtime/delegated insert authority, missing/partial/stale/future/foreign proof, changed state/recovery revision, immutable history, idempotent resolution, separate explicit unlock, and transaction interruption followed by a fresh-proof retry. Controlled owner verification rows establish these guard mechanics only; they are not actual provider reconciliation or Production acceptance.

Unreleased 057 now adds immutable resolution receipts linked to existing complete owner verifications, and a database trigger rejects delegated control writers even if UPDATE was mistakenly granted. Runtime has SELECT only on resolution receipts and readiness checks those privileges. Resolution preserves the original holds and never opens service; explicit unlock rechecks the exact fresh bundle and current content/authorization digest. No 016 migration has been applied to Preview or Production.

The related recovery composition passed 45/45 across control (12), quarantine (6), denial capture (4), current credential/source denial (10), independently cold authority (8), and retired runtime (5). The complete registered catalog now includes 84 suites and 472 cases, including the six new resolution cases in the recovery gate. Type and authored-documentation checks pass.

The current source completed all four WebKit projects: 40/40 cases, zero failures/skips/retries, with receipt `local-artifacts/016/ui-ImKg9b/summary.json` (source digest `a36fca90581461097027bbd98f1e7d00ab0d3ee875a4efd09262b02af19bf329`). The safe desktop-light synthetic workspace and mobile-dark upload-controls screenshots were visually inspected; layout and controls were legible and did not overflow. This establishes owned local UI behavior, not hosted delivery or scanner acceptance. Current 34 pilot unit suites passed 170/170 and the web build passed after the resolution/control changes.

The 472-case catalog reached its control suite with 218 prior cases passed, then passed five control cases and failed seven at the real recovery-drain guard (223 passes total). Earlier suites had retained active domain leases; these were not removed or relabeled. The control suite now holds a fresh owned database for its complete 12-case lifecycle, using an explicit fixture close that preserves selected local state. Its standalone 12/12 run, pilot type check and authored-documentation check pass. A fresh full composition remains required; the partial failed run is retained.

### Admission fixture isolation and authoritative evaluation pricing

The next full catalog reached admission with one failure at its real drain guard: a prior suite retained domain work. Admission now owns its complete suite database rather than borrowing those queues; no prior work was deleted or relabeled, and its 12/12 standalone cases pass. A fresh complete 472-case catalog remains in progress and no partial run establishes acceptance.

A read-only comparison found the Gateway SDK's parsed model catalog drops published priority/long-context price tiers. Expansion live admission now reuses the bounded authoritative raw-catalog and reasoning-inclusive output-contract verifier, bypasses local learning fixture contracts, and refuses a different model or provider limits above its reserved ceilings. Twenty-two pricing/review guard cases pass, including the current higher-tier $16 maximum per-call reservation and unknown fee/limit/body rejection. Pilot type checks pass. No paid model call ran and the root model selection is unchanged; the separately recorded $5 infrastructure approval does not authorize model evaluation.

The current Production denial snapshot was independently retained and cold-decrypted in the work Neon archive: 65 minimized tables, 1,517,434 bytes. This proves separate retention and integrity only; current authority, replay reconciliation and restoration readiness remain unverified pending the coupled restore rehearsal and full required-scope proof.

The coupled current-source restore rehearsal passed actual cold decryption, database restore and 055→057 migrations in its owned target. It revoked 17 restored sessions and installed 60 immutable replay fences, then verified denied runtime connection and removed the target. Production was unchanged. Required-scope authority, private objects, workflow reconciliation, quarantine resolution and full service readiness remain unverified; the rehearsal did not unlock service.

A protected operator-only Production environment pull obtained project OIDC without modifying the selected `.env.local`. Using that identity and the exact owner/project-verified private Blob store, an unfiltered provider list returned zero objects and `hasMore: false`; this establishes the existing store's actual empty inventory rather than relying on aggregate counters. Provider writes were zero. Unneeded pulled environment values were removed, retaining only the protected short-lived identity and store binding. Domain storage configuration/cutover and matched service backup remain incomplete.

### Restore-suite deadline and project OIDC storage

The subsequent partial catalog recorded 293 passed assertions across 42 suite reports. Its missing restore report was initially attributed to the generic 120-second deadline; that attribution was incorrect. A diagnostic rerun proved the preceding object-checkpoint report had five real cases while the catalog incorrectly required an additional case named `/`. Exact verification rejected that report before the restore suite started. The runner now retains bounded private process diagnostics and honors the restore suite's declared 720-second deadline. A direct actual PostgreSQL 17/18 restore passed in 59.68 seconds; a separate nested owned restore also passed. Neither partial catalog proves complete execution.

Private storage adapters now accept the installed SDK's project OIDC authentication in addition to exact store-matched read-write tokens. The selected connected store remains explicit; malformed or missing operator identity is rejected and provider failure never falls back to local storage. Artifact, personnel, report/gap and direct-upload adapters share the configuration. Five storage/report cases and pilot type checks pass. Through the actual adapter with protected project OIDC, every governed Production object namespace was listed and verified empty, with no provider writes or domain configuration change. Hosted upload/callback acceptance and storage cutover remain required. The registered catalog is now 474 cases in 84 suites.

A complete, bounded read-only managed Workflow provider listing traversed five advancing cursor pages and captured 435 run metadata records: 165 running, 269 completed and one cancelled, spanning 38 original deployments; active runs span all 38. This replaces the first-page-only inventory limitation. It does not establish an atomic workflow checkpoint, current task state, idle session handoff, paid/send reconciliation or old-deployment closure. Only seven current application conversations are bound to provider runs, so absence from the application binding list is not proof a provider run has ended. No run or deployment was changed.

The complete original-deployment metadata inventory verifies all 38 READY deployments belong to the work project/team. Actual project settings report Standard Protection (`all_except_custom_domains`). Anonymous GET probes of the native session route on all 38 verified generated URLs returned 302 redirects to verified HTTPS Vercel authentication endpoints; no app response body was retained and no provider mutation ran. This proves anonymous access fencing at those URLs, not database credential retirement, operator-authenticated legacy-session safety, provider interruption or recovery readiness.

One abandoned owned test container/directory from an earlier interrupted run was removed only after exact artifact marker, Docker ownership label, database name and absence of active app processes were verified. The current runner and all retained run receipts remain intact. Current web and eve builds pass; the eve build skipped paid Sandbox prewarming.

### Catalog correction and compiled native UI

The nonexistent object-checkpoint case was replaced with an actual interrupted-copy regression. All six cases pass: cancellation after partial staging removes the checkpoint copies and preserves the source object. Pilot types pass. The frozen catalog remains 474 cases; no case was skipped or counted without execution. The diagnostic failed run is retained at `local-artifacts/016/run-5cf183b4-f57e-4154-b44e-03f05d934cb9/`.

The latest development-mode WebKit run failed a maximum-size upload after Next returned 500 with an internal JSON parsing error; this is not UI acceptance. A compiled application diagnostic initially exposed that the owned production harness did not start its separate built eve service. With both services running, all ten desktop-light WebKit cases passed, including the actual 10 MiB upload, cancellation/expiry/foreign completion, focus and accessibility. This diagnostic is not the complete four-project catalog. The canonical pilot UI runner now builds the owned application and starts both production services on owned ports, preserving root model/config/workflow state and cleaning both processes. Full current catalog and four-project UI execution remain required.

The canonical compiled native UI run passed all four projects: 40/40, zero failures/skips/retries, at `local-artifacts/016/ui-gSNQBm/summary.json`, bound to source digest `fc4253864fa20f60fe5ecfe24be4816257581e6b9f9727b53592d945a31509f5` and catalog digest `5442906f607a65b575590ca26f4f14f5a6a1fcc3f3d7012dfc73e6c3a3bf0511`. The current mobile-dark synthetic workspace and mobile-light upload-controls screenshots were inspected: context remained visible, controls/focus were legible, and no horizontal overflow appeared. Both owned application services and their disposable database were cleaned up. This is local compiled UI evidence, not hosted acceptance.

The corrected full catalog passed the actual two-version encrypted restore, then failed one health-observation assertion because earlier suites retained two queues: 12 rather than 14 other classes were healthy. The six health-sample cases now own a fresh suite database and pass in 10.23 seconds; inherited work was preserved. A subsequent diagnostic composition reached authority quarantine and proved its own later cases attempted to reopen unresolved holds created by its earlier case. Those cases now own separate disposable targets and retain the real unlock guard, instead of clearing holds or fabricating verification. Partial diagnostics do not satisfy T046.

### Owned load composition and quality-budget work

The remaining 25-suite diagnostic composition at `local-artifacts/016/run-edd20366-2a0a-45ef-9e89-df36688919f1/` completed with successful process receipts, including the actual 125-read MCP population, delivery, training, internal and learning populations. Each load population now owns a fresh database instead of creating multiple active pilot workspaces in a shared environment. The real governance guard remains enforced. This filtered diagnostic is not the canonical complete catalog and cannot complete T046.

Evaluation-only shared accounting now reserves each full published request ceiling before provider dispatch, serializes admissions across disposable clients, and holds the batch on unknown, interrupted or invalid charges. Thirteen budget/fetch cases and pilot types pass. The current registered catalog is 487 cases in 86 suites. Public pricing verification reports a $16 Grok full-request ceiling and a $0.006 whole embedding-request ceiling; these are reservations, not observed charges or authorization. No actual-model work has run under the infrastructure-only $5 authorization.

Native synthetic checks use a dummy provider credential and a one-microdollar fixture cap. Earlier zero-dispatch observations did not establish that model admission reached the budget guard. A 503 check identified a missing actual maintenance-worker heartbeat; the owned startup now waits for that heartbeat. A subsequent accepted request failed before the expected budget-denial receipt. The installed SDK distinguishes chat and embedding model headers; the guard now uses the respective header and rejects conflicting identities. Current native admission diagnostics remain incomplete, so no paid quality batch or actual-model acceptance is approved.

The completed native synthetic admission check at `local-artifacts/016/quality-native-denial-complete-current/result.json` passed on the unchanged root agent. The genuine Gateway language request reached the ledger, produced an `insufficient_budget` denial receipt, and recorded zero dispatch events under the one-microdollar fixture cap. No real provider credential was supplied. The exact earlier metadata blocker was the framework's public `/v1/models/catalog` endpoint, which the initial guard omitted; the dummy credential explanation alone did not establish that cause. Exact public catalog endpoints now omit authorization, while account-specific SDK config retains its original authentication. The installed AI SDK separately demonstrated one budget denial with zero provider calls. Neither check proves actual-model quality or hosted readiness.

### Complete quality controller preparation

The evaluation controller now retains one canonical private dollar/credit journal per operator approval. Corrected full attempts append current-source bindings without resetting prior costs or extending the approval; stale attempts are rejected atomically at provider reservation. Unknown charge holds apply across both providers. Context uses separately metered existing credits, verifies Auto-Topup disabled before and after search, and never invents a dollar conversion. The documented zero-credit account-usage check confirmed sufficient existing credits with Auto-Topup disabled; no paid search or billing change ran.

All 24 focused accounting/provider tests and pilot types pass. The broader focused contract run passed 71 assertions. The registered deterministic catalog now has 498 cases in 87 suites. The current controller preparation at `local-artifacts/016/quality-preparation-final-current/preparation.json` passed exact local image and signature verification plus real native admission on the unchanged root agent, using a synthetic credential and one-microdollar denial cap. It recorded zero paid dispatches and cleaned the owned environment. This is pre-provider preparation only: actual-model captures, independent semantic review, full recovery, hosted acceptance and release remain pending. The infrastructure-only $5 authorization has not been used for model evaluation.

The canonical 498-case run at `local-artifacts/016/run-98e5f656-4805-431a-8836-769a07940e4d/` completed 49 successful suite processes, including the two-version encrypted restore, then failed feedback setup because an earlier suite had retained the environment’s permitted active synthetic pilot workspace. Feedback now owns a fresh suite environment; all five cases and pilot types pass without weakening the single-active-workspace guard. This failed full run is retained and does not complete T046.

Locked runtime retirement now shares one governed implementation between the owned rehearsal and an explicit Production operator command. It verifies the independently selected database/owner, marker and exact locked revision, refuses escalated legacy/replacement roles, disables the legacy login before terminating its backends, and binds repeat execution to the same replacement secret. The operator command additionally verifies work-project binding and a fresh replacement connection, with no secret in its receipt. Five actual owned retirement cases and pilot types pass, including wrong-database and replacement-escalation rejection. A read-only Production capability check confirmed the existing owner has CREATE ROLE and pg_signal_backend authority without superuser status; no Production role, deployment credential or schema changed. Provider-run closure, current-authority verification, hosted credential cutover and service unlock remain pending.

The corrected canonical complete catalog at `local-artifacts/016/run-03c85973-5fba-4464-9005-8230c710f14d/` passed 498/498 cases across all 87 registered suite processes, without skips, filters or retries. It is bound to source digest `5147b45ee20339c2a917ea6dc0bdadf0e4041ade5b0960b59709bb5a38e04add` and catalog digest `f1b78028c10b187e954db610c11fc672e98a16299676ee7805f0d98b166c1575`. Owned resources were cleaned and protected root configuration/model/workflow state preserved. This completes the deterministic run for that exact source; later code changes require appropriate current checks, and full pilot readiness remains false. Current UI, hosted, actual-model, full recovery/cadence and human gates remain separately pending.

A local Amazon Linux 2023/amd64 PostgreSQL 18.6 client prototype was built from the official source tarball with verified SHA-256 `555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f`. Its Linux version check passed without network access. The bounded runtime subset contains pg_dump/pg_restore, their required non-system libraries, and PostgreSQL/OpenSSL/zlib license material, totaling 8,566,384 bytes. Temporary export containers were removed by exact ownership label; the local image remains needed for the pending native backup prototype. No Vercel/model budget, Production credential, schema or data write was used. This is local tooling preparation, not a hosted backup or schedule proof.

The native client is now packaged under `infra/pilot/native-postgres/linux-amd64/`
with upstream PostgreSQL/OpenSSL/zlib licenses, ten regular-file SHA-256 inventory
entries and its pinned-base build recipe. The libpq alias is a regular copy;
no symlink escapes the source fingerprint. Five asset-boundary tests and three
real Linux PostgreSQL 18 tests pass. The latter restore the exported snapshot
while retaining later source writes, deny pre-cancelled execution without a
partial dump, and capture/authenticate all six private object namespaces alongside
the owner-fenced database. Fourteen focused native/backup-verification assertions
and pilot typecheck passed. Dump execution monitors its size while running and
awaits process closure before removing incomplete bytes. The exact owned draft
image and temporary containers were removed; licensed canonical tools remain.

`captureWorkRecoveryCandidate` implements a bounded native database/private-object
capture against an exact locked owner boundary and installed ledger. It encrypts
matched bytes with separately supplied key material and retains originals. Its
versioned candidate explicitly leaves managed Workflow reconciliation, current
independent authority, outside copy, schedule and restoration readiness false;
no manufactured manifest turns this byte proof into recovery acceptance. The
registered deterministic catalog now has 506 cases in 89 suites. These source
changes postdate the earlier 498-case complete run; current complete execution,
hosted scheduling/cold recovery and human acceptance remain pending. No Production
schema, credential, workflow, deployment or paid-provider mutation occurred here.

The routine work-backup path now holds the same exclusive IO fence while leaving
open service control unchanged; it refuses busy or mismatched sources. A real
Linux integration check confirms concurrent shared IO cannot enter that boundary.
The independent copy authenticates a fresh download and retains encrypted full
candidate metadata in an expiring capsule, plus minimal immutable audit. The cold
reader derives the archive key from an independently retained master and reads no
source connection. Seven real Linux/database cases pass, including wrong-master
rejection, cold inspection, immutable idempotent audit and cost admission with
atomic category allocation, concurrency/unknown holds, retained ceilings, no slot
retry and exhaustion. Thirteen focused asset/configuration/crypto/compiled-HTTP
checks pass. Pilot types and whitespace checks pass. The catalog now registers
518 deterministic cases in 90 suites; a fresh complete current-source run remains
pending after implementation freezes.

The independent work Neon archive received explicit migrations 004/005, verified
in `local-artifacts/016/archive-schema-005-current/migration.json`. Existing
ciphertext/authority records remained unchanged; no primary database was mutated
and no cost authorization was created. A fresh encrypted master was created only
in the separate work operator project and cold-retrieved successfully. Its private
reference and provisioning proof are under `local-artifacts/016/work-master-key-current/`;
key bytes are absent from receipts and temporary request files were removed.

The standalone operator package builds with Vercel Build Output API v3, licensed
native tools, a protected deterministic endpoint, 12-hour UTC cron and five-minute
platform deadline. Its compiled endpoint rejects unauthorized, disabled and
nonproduction traffic. `local-artifacts/016/operator-package-native-current/` is a
historical preparation and must not be deployed as current source after later
changes. The new cold inspection command verifies actual independent key/resource
bindings before retaining operator-only inspection output. Production schema 055,
Preview schema 038, source credentials, old deployments/workflows and rollout
remain unchanged. Actual hosted scheduler execution, full physical/forward restore,
current authority/replay, cadence/RTO, actual-model review and human release gates
are still pending. The infrastructure-only $5 authorization has not been converted
into model or backup-hosting/Blob authority.

## Recovery authority continuation — 2026-10-12

The current denial contract is v6. Actual owned PostgreSQL 18 checks passed:
19 credential/denial-snapshot cases, including fresh sign-in denial for restored
principals, downgraded memberships and disabled partner organizations; seven
quarantine cases, including permanent learning reservation holds; and twelve
physical work restore, resolution and private object cases. The expanded
membership fixture initially failed because the ordinary authority epoch trigger
prevented modeling an older restored revision; the disposable fixture now models
the actual loaded tuple before re-enabling the trigger, and the full affected set
passed. Types and authored documentation checks passed.

A fresh actual Production minimized denial snapshot contains 67 tables and
1,518,342 bytes. It was encrypted, retained permanently in the separate work Neon
archive and cold-decrypted using its separately retained work-project key. The
actual database safety-copy restore applied the current 056/057 migrations and
v6 credential/replay reconciliation in a disposable PostgreSQL 18 target,
retained the lock and quarantine, then removed that target. Production remained
schema 055 and unchanged. Private receipts are
`local-artifacts/016/production-denials-v6-current/snapshot.json` and
`local-artifacts/016/production-denials-v6-rehearsal-current/rehearsal.json`.
These establish restricted database recovery only, not full authority, Workflow,
runtime grants, hosted service, RPO/RTO or release readiness.

The registered deterministic inventory is now 533 cases in 92 suites. The
historical 498-case complete run predates these changes and does not establish
current-source acceptance. The new 016 CI jobs cover the complete registered
catalog with source/run-bound evidence, four-project CLI WebKit and complete
predecessor regression composition. Actual CI execution remains pending; no
hosted, human or actual-model gate is claimed by this wiring.

### Continued recovery and maintenance verification — 2026-10-12

The actual owned production build and all 40 CLI WebKit cases passed across four projects. This is local workspace/upload proof, not hosted processing or pilot acceptance. Its source digest was `5c1b8289214e14503a697c40d04719c53194e9604741903298c7cd1cad2a5cc5`; subsequent maintenance edits require a fresh final UI run.

All 16 recovery credential cases and four snapshot cases passed. Organization authority revisions now prevent an old restored active partner organization from reviving sign-in after disable/re-enable. The earlier command named an absent unit snapshot file; its 16-case result proves only the credential suite. The actual integration snapshot file was then run separately and passed four cases.

Five dispatcher unit cases and nine actual database health/maintenance cases passed. Gap cleanup no longer starts report preparation; the admitted dispatcher owns deterministic gap exports. Exact schema-57 claims check operational admission under its shared transaction fence. Locked cleanup preserves queued work without authoring it. Health cases are included explicitly in the maintenance gate.

A fresh bounded public pricing verification checked all three official documents. With metadata/header allowances, minimum conservative estimates are 66,393 micro-USD hosting and 45,227 micro-USD Blob per backup invocation, below the configured 100,000/50,000 ceilings. This public read creates no backup budget or paid dispatch.

The prior 533-case catalog attempt was interrupted after a real production-build type failure. Explicit `NODE_ENV` in the restricted native child environments fixed that error; root and pilot TypeScript checks passed. The failed attempt remains retained and does not count toward acceptance. A fresh complete run now covers 549 cases across 94 suites.

The complete predecessor composition passed in `regressions-058f0f7e-4beb-418a-b3d9-95916e4ef4a0`: all eight 015 predecessor groups, 39 exact schema-057/Postgres-18 checks, and a fresh four-project 40-case pilot WebKit run. No paid calls were dispatched. The resulting `ui-dWiSsq` screenshots were inspected for desktop/mobile light/dark layout, explicit synthetic branding, private upload state and keyboard focus; no layout defect was observed. These are current local checkpoint results, not CI, provider or participant acceptance.

The complete current deterministic catalog passed: **549/549 cases across 94 suites**, with zero failed/skipped/flaky acceptance, in `run-e7469be2-95dc-4894-a8a6-c22fdfe87ea6`. Source digest `f097d86309d584281be377727b119f1045758c039963143f3e9e63bde88c1d4e` and catalog digest `66e8ac72d803119e304b3d28887164c300131372ef5a089c7dfa5c614e2bab8b` match the fresh regression/UI checkpoint. T046 is complete for this owned local catalog and inspected screenshots; actual provider/hosted/human gates remain pending. Later code changes require a new complete run before acceptance.

Readonly Production schema-055 metadata inspection found nine explicitly classified private-object pointer columns with zero populated values and zero rows across the four current file-domain tables. The first private helper used the nonexistent `report_files` table and failed read-only; the corrected query uses `report_artifacts` and retained its own new evidence directory. JSON payloads and managed Workflow attachments remain outside this inspection, so it does not authorize a storage cutover or prove their absence.

## Current infrastructure health implementation

T061 is implemented with SQL-only status reads, actual adapter write/read store
observations, immutable job code identity and domain-validated image completion,
owner-only cold-backup observations, recovery-epoch invalidation, resolved-scope
reporting and bounded capacity/cost metadata. Public readiness is the conjunction
of these observations with exact schema/grants, open admission, completed current
maintenance and no unknown cost or incomplete budget inventory. These are code
checks, not actual target or release acceptance.

Narrow owned PostgreSQL 18 checks passed: store observations 8/8; image health and
native PostgreSQL/cold-backup producer 14/14; backup health and existing operational
health 14/14; recovery resolution 6/6; hosted jobs and cost authority 13/13. Blob
SDK fixtures and owner-authored health rows prove code boundaries only. The native
runner independently exercised real dump/encryption/cold copy/cost settlement and
recorded an exact source observation in a disposable database. Root and pilot type
checks and the 221-file documentation check passed. The complete catalog now has
569 cases in 97 suites and must run again after the final source changes. No actual
Production/Preview migrations or paid provider dispatch occurred for these checks.

## Complete owned load measurement

The source-bound `load-AuIkOs` run passed with 25 sessions (15 internal,
10 assigned partners), 250 synthetic customer references and 10,000 eligible
passages. It used the actual production build, HTTP and pinned MCP SDK with a
120-second warmup and 603.931-second measured window. All 4,050 warmup/measured samples
were available; unexpected failures and quota denials were zero. No quota reset
or paid provider call occurred. The fixed minimum of 100 measured samples per
class passed; actual queue waits and SQL/resource measurements remain in private
evidence. These timings are owned local proof, not hosted latency guarantees.
The earlier `load-FuEelj` attempt failed before measurement because an obsolete
local preparation referenced a removed renderer image; the complete passing run
used the verified current preparation.

| Class | Measured samples | p95 ms | Unexpected failures |
|---|---:|---:|---:|
| profiles | 200 | 339.4 | 0 |
| evidence | 200 | 148.55 | 0 |
| passages | 200 | 161.74 | 0 |
| citations | 200 | 98.4 | 0 |
| plans | 200 | 69.27 | 0 |
| execution | 200 | 172.79 | 0 |
| reports | 200 | 179.22 | 0 |
| support | 120 | 61.51 | 0 |
| expansion | 120 | 72.65 | 0 |
| gaps | 120 | 82.65 | 0 |
| partner-workspace | 200 | 124.36 | 0 |
| training | 200 | 261.56 | 0 |
| learning | 135 | 280.39 | 0 |
| mcp-profiles | 225 | 217 | 0 |
| mcp-evidence | 225 | 199 | 0 |
| mcp-knowledge | 225 | 188 | 0 |
| mcp-plans | 200 | 157 | 0 |
| mcp-reports | 200 | 265 | 0 |

## Complete owned fault catalog

`faults-JYtomg` passed all nine fixed suites (65 cases), then an actual owned
PostgreSQL stop/start. Admission failed safely during the outage; the minimal public
readiness response remained 503 and a reviewed profile was readable before and
after restart. Quotas and budgets were preserved; deterministic paid calls were
zero. Controlled store/provider fixtures prove code boundaries, not actual remote
outages. T066 is complete at this source checkpoint; subsequent code changes require
fresh final validation and must not relabel these older receipts.

A fresh read-only Production managed Workflow inspection found seven bound runs
still `running`, four application response attempts, no provider writes. Actual
provider closure remains outstanding. The owned real SDK driver stopped because
MCP responses lacked serving-release headers, and its exact newly created
credential was revoked. The MCP boundary now adds only the optional exact code
version response header, retaining predecessor behavior when no version is set.

## Hosted SDK driver and dispatch readiness

The owned real HTTP/pinned SDK driver passed all twelve category/list/read/citation/
ceiling/revocation assertions and exact credential cleanup after source withdrawal.
Registered SDK plus bound-role suites passed 9/9, including reconciliation and
revocation when a successfully created credential response body is damaged. The
MCP release-header suite passed 3/3; pilot types and documentation checks passed.
No actual hosted acceptance is inferred from these owned read-state fixtures.
The hosted operator now invokes the fixed SDK driver under each already verified
role, selecting only visible synthetic ordinarily accepted delivery records. Missing
required records fail; normal logout and credential cleanup remain bounded. The
remaining full J002–014 chains are still outstanding, so T071 remains incomplete.

The readiness conjunction additionally checks that the dispatcher is explicitly
enabled and its exact current Sandbox scope/pricing budget has enough remaining
upper-bound allowance for every configured job, with no unknown charge. Known
expired/revoked budgets are excluded from active/unknown diagnostic inventory.
The updated five-case image/readiness suite passed. These actual local boundary
checks do not establish target migrations, cost authorization or provider behavior.

### Fresh Production authority and file metadata inspection

The fresh independent denial snapshot retained 67 tables (1,518,365 bytes), then the actual encrypted schema-55 safety copy restored into an owned PostgreSQL 18 target and passed forward migrations through 057. Application content and source ledger verification passed; current credential denials were reapplied, the target remained locked and was removed. Production was unchanged. This is an isolated database rehearsal, not full service recovery, Workflow resumption, primary migration or an RTO claim. Private receipts: `production-denials-health-schema-fresh-current/snapshot.json` and `production-authority-health-schema-rehearsal-fresh-current/rehearsal.json`.

A read-only, repeatable-read Production inventory classified 115 JSON/JSONB columns across public and legacy_archive_20261005; 22 were populated. No rows matched the bounded file-key, storage-key or known storage-location classifiers. The earlier nine dedicated pointer columns and four governed file tables were empty. These SQL-side lexical counts retrieved no raw JSON values and performed no provider writes. They do not establish managed Workflow attachment completeness or authorize storage cutover. Private receipt: `production-json-file-reference-inventory-current/inventory.json`.

### Normal HTTP profile review driver

The expanded hosted SDK integration suite passed 6/6 cases in a fresh owned PostgreSQL 18 environment with a Production Next build and actual HTTP transport. Three cases validate the J003 boundary driver: five ordinary commands propose, accept, propose correction, accept correction and retract; pending content is absent from facts, and the final record has no current accepted fact. A damaged successful mutation response is reconciled through exactly one original-key receipt read, with exactly five mutation requests and no duplicate dispatch. A foreign customer is denied before HTTP dispatch. The existing three pinned SDK/cleanup cases also pass. This establishes the driver in an owned environment, not actual hosted acceptance or the complete linked J003–J009 chain. The hosted runner invokes the review boundary only from its already verified administrator session. T071 remains incomplete.

### Current recovery admission implementation

T050 is implemented in the current domain and transport paths. The current complete-catalog run has passed the 12 admission cases, four governed-execution cases and eight hosted-job cases: locked/quiescing ordinary sessions, direct domain actors, MCP credentials and native admission are withheld; exact cancellation capabilities and bounded cleanup remain available; the physical capture fence blocks new private IO and waits for active IO. These are owned deterministic proofs. The still-required retirement/reconciliation of old hosted deployments and their already-admitted provider work remains part of the operational recovery/cutover tasks; no hosted closure is inferred from the new code's lock checks.

### Complete profile/health source checkpoint

The complete catalog passed 579/579 cases across 99 registered suites, without filters or skips. Private run: `run-ae9cca6c-31f7-4deb-8bd9-0b499bd87239`; source digest `56bcfb7654c48ef9a026f2f27c2d2b0e02d40cb33cd504b46cf0bd86b6201c16`; catalog digest `28a93aac58a5c09f7b7da4670dc4ecb0a0249afb3d3330eb9f5121d2a849ac34`; commit `699f6f4a89911b1ba33bc2d90ed51ac1ba2ee530`. This includes the new health observation producers, release headers, ordinary HTTP review driver and actual pinned SDK transport checks. It establishes this owned deterministic source checkpoint only. It does not establish CI, hosted readiness, actual-model quality, scheduled cadence, actual primary migrations or full pilot readiness. The current nine-catalog native preparation also passed with zero paid dispatches; the operator package rebuilt locally and remains undeployed. Later source changes need fresh applicable validation.

### Managed Workflow retirement producer and independent journal

The new core closure producer passed 15 unit cases for exact lazy provider binding, response bounds, definition/deployment mismatch, uncertain cancellation and read-only reconciliation. The 18-case owned journal/batch run passed; the later command/migration suite passed 19 cases, including refusal to attach invented source provenance to an existing legacy observation. These use controlled provider responses and actual PostgreSQL 18; they are not actual provider retirement proof. The trusted operator command requires schema 57, the exact locked/drained owner boundary, retired legacy login/backends, fresh source/catalog identity and at most 50 unique eve run bindings. It writes an independently committed immutable intent before cancellation, reads terminal state independently afterward and preserves unknown attempts without retries. Terminal observations bind source commit plus content/catalog digests.

Explicit independent work archive migrations 007 and 008 were applied and verified against the existing Free Neon destination. The encrypted archives, current-authority holds, capture receipts/capsules and cost records were unchanged; no cost authority was created, operator deployment performed, primary database changed or real provider run cancelled. Private receipts: `archive-schema-007-current/migration.json` and `archive-schema-008-current/migration.json`. Primary remains schema 55, so the new closure command refuses it until the controlled migration/retirement stage.

Fresh read-only managed metadata inspection still found 435 provider runs (165 running, 269 completed, one cancelled). Running definitions comprise 82 eve session entries, 82 session timeout workflows and one task workflow. The task's one listed step was completed; this snapshot does not prove no future work/charge or terminal workflow closure. Native input/output bodies were not captured. All project-wide closure, paid/send reconciliation and full service recovery claims remain withheld.

The final batch suite passed 6/6, including actual termination of the owned source backend during cancellation. No second provider read or cancellation occurred after fence loss, the independent intent remained, and no terminal observation was written. The current registered catalog is 619 cases across 104 suites; it has expanded since the complete 579-case checkpoint and requires a fresh complete run.

### Current read-only text inventory and operator rebuild (2026-10-12)

The bounded SQL-side Production text inventory inspected 1,143 text columns,
196 populated, without retrieving raw text values or writing to the provider.
Three legacy evidence passages matched `/workspace/`; separate category checks
found zero matching Blob, local-artifact, `.eve`, personal-directory, temporary,
or governed namespace paths. These lexical matches require structural review;
they do not establish storage cutover or managed Workflow attachment completeness.
Private evidence: `production-text-file-reference-inventory-batched-current` and
`production-legacy-location-classification-current`. The source uses a protected
operator connection: the sensitive platform variable cannot be decrypted, so
platform connection equality is not asserted.

The independent backup package was rebuilt from the current 619-case catalog
source in `operator-managed-closure-current-20261012`. Local package preparation
passed. It remains undeployed; no scheduled invocation or restoration readiness
is claimed.

The 619-case full catalog attempt `run-0063d218-2182-4e47-afc9-7c149183fc30`
failed during the owned production build for `load-mcp.test.ts`; its test body
did not run. The complete catalog is not accepted. Diagnosis runs are tracked
separately and cannot replace the required full rerun. Earlier progress messages
incorrectly checked an `exitCode` property; the runner records `code`. The final
runner correctly rejected the failing suite.

The failed owned build was reproduced with retained private diagnostics. Its
TypeScript error identified absent named-case inventories in five new Workflow
closure suites. The expanded SDK suite also still listed only its original three
names. All six registrations now contain exact complete names; the verifier and
full runner reject incomplete or duplicate registered names before admission.
The five closure suites passed 40/40 cases with their actual JSON inventories,
and the catalog verifier passed 6/6. Pilot and root type checking passed after
the correction. The failed full attempt remains failed; no partial result is
substituted for its required full rerun.

The isolated `load-mcp.test.ts` rerun passed after the named-inventory fix,
including the real owned production build and 25 pinned SDK consumers reading
all five categories (125 available access receipts), with normal reviewed load
records and actual PostgreSQL ownership. This is local proof. The fresh complete
619-case catalog is running as `run-e4be3b0e-5bf2-4099-8951-7015a95857b7`;
completion and hosted readiness are not claimed.

Current native preparation `quality-named-catalog-preparation-current` passed
for all nine applicable catalogs with zero paid dispatches. The independent
operator package `operator-named-catalog-current-20261012` also prepared locally
from the corrected source. Actual-model comparisons, independent output review,
operator deployment and scheduled captures remain unverified.

Owned linked-journey prototypes (kept private until integration into the feature)
passed the ordinary HTTP profile/plan/delivery diagnostic. Five normal profile
commands, a real lexical citation, four normal plan commands and four delivery
commands produced accepted synthetic revisions, an accepted engagement baseline
and a reviewed activity. The activity did not become milestone completion.
No accepted states were inserted by SQL: SQL provisioned the synthetic scope,
materialized the governed eligible projection and checked the resulting baseline.
These prototypes remain outside committed implementation and do not complete
T071 or prove hosted behavior, file workflows, human feedback or full J008.

Two completed owned scopes that retained only late trace files were cleaned up
after exact private-log attribution, direct owner checks, bounded trace-only
inventory and absence of active Node working directories. Eight trace files
were removed. The protected selected database configuration and root Workflow
state were verified unchanged. Private receipt: `completed-trace-scope-cleanup-current`.

### Cited-plan report regression and source-clock fixtures (2026-10-12)

The 619-case attempt `run-e4be3b0e-5bf2-4099-8951-7015a95857b7` failed
in suite 96, `image-health.test.ts`. A controlled owner backup observation used
the client clock, which could be ahead of the actual PostgreSQL capture/sample
clock and correctly violated the future-capture constraint. Positive observation
fixtures now obtain their capture timestamp from the source database; the stale
and future timestamp denial tests remain intact. The failed attempt is retained
and is not replaced with a selective test result.

The ordinary linked HTTP prototype also reproduced a report-source defect for
plans carrying governed retrieval citation digests. Report source checks previously
compared accepted-profile dependencies only against original revision digests.
The shared report domain now reconciles an exact current retrieval projection
when the direct original digest does not match, retaining current original/source
eligibility, exact generation/digest/customer/audience checks and prohibited
commercial-context checks. Native original references still work.

The new eight-case actual PostgreSQL regression covers both digest forms, wrong
digests/generations, foreign customers, commercial exclusion, internal audience
fences and normal source withdrawal before passage cleanup. All eight passed.
Together with image and backup health, the targeted run passed 18/18, with zero
pending tests, in `report-source-clock-regression-current.json`. These are local
checks; Production was unchanged. The complete registered catalog is now 627
cases across 105 suites and requires a fresh full run after source integration.

### Linked cited-plan and real report HTTP regression (owned checkpoint)

The normal-command diagnostic completed profile acceptance (five commands), cited plan review and acceptance (four), delivery activity review (four), and report rendering/brand approval/publication (ten). Two actual queued renderer jobs produced four published PDF/PPTX artifacts; authenticated HTTP reads verified their exact sizes, hashes, file signatures and release headers. `hosted-linked-report-release-fix-current.log` records the successful owned Production-build checkpoint, with zero paid calls. Activity remained distinct from milestone completion. This is local proof, not actual hosted deployment or completion of the full linked journey.

The check exposed missing release headers in report JSON/error and artifact responses. Those responses now use the existing versioned-header helper while retaining their private cache, error and retry semantics; three focused unit cases passed. The linked drivers now live in `scripts/pilot-hosted-{foundation,plan,delivery}.ts` and the explicitly local-only `scripts/pilot-owned-report.ts`, with a registered ordinary-HTTP regression. Its first promoted attempt failed the Production build because prototype schema defaults and command helper parameter types did not typecheck; those types were corrected without weakening schemas. That failed attempt is retained separately. The first corrected promoted check passed (`linked-http-reports-promoted-v2-current.json`, one actual linked case, zero pending). A bounded streaming transport is now installed and is receiving a fresh run; neither run supersedes the failed complete catalog attempts.

The bounded transport linked run also passed (`linked-http-reports-bounded-v2-current.json`), one complete owned case with zero failures or pending cases. Its initial attempt failed because the retrieval envelope had not yet been parsed from `unknown`; explicit schema parsing fixed the build. Six transport cases prove release binding, streaming limits, cancellation, same-origin/API path admission and no mutation retries. Together with the six exact catalog-result cases, all twelve focused tests passed. Current registered inventory is 637 cases across 108 suites; a fresh complete run is still required. No T071 completion or hosted readiness is claimed.

The owned upload prototype (`owned-linked-upload-current.log`) also completed normal conversation creation, original-byte upload, completion and actual governed scan/parse before reading located units, followed by the linked plan/delivery/report chain. Scanner and parser work ran locally with prepared immutable images; no paid calls occurred. The successful 204 upload response lacked `X-Turas-Code-Version`, recorded as `uploadReleaseHeaderVerified:false`; it is not accepted as exact-release upload proof. That header fix and the next exact uploaded-passage/review/withdrawal prototype remain pending. This private prototype is not the full hosted file-job acceptance catalog.

The uploaded-source prototypes completed exact located-passage proposal and normal claim review before cited plan acceptance (`owned-linked-located-source-current.log`). Ordinary source withdrawal then denied the citation and all four published report file reads (`owned-linked-source-withdrawal-current.log`). An authenticated original read verified exact original bytes while identifying a second missing artifact release header (`owned-linked-original-current.log`). Both upload and original read header omissions are explicitly pending, so these diagnostics do not claim exact-release file transport acceptance. A typed source driver passed the same chain (`owned-linked-typed-source-v3-current.log`); its earlier draft failures were an incorrect workload table name and rejection of the valid initial record version zero, both corrected to existing schema contracts. This is still an ignored prototype awaiting registered integration, and T071 stays incomplete.

The complete 637-case / 108-suite owned catalog passed in `run-e9b78bfd-904e-4b07-ac25-0d5d152abcb7`, with zero failed/skipped acceptance and `fullPilotReady:false`. This checkpoint precedes the subsequent artifact release-header and restored service-budget fixes. Its proof remains attributed to its recorded source; it is not silently relabeled for those changes.

The registered source/report case now uses the typed `scripts/pilot-owned-source.ts` driver, prepared scanner/parser assets, real byte upload and original reads with exact release headers, located-source proposal and normal review, cited plan/delivery/report decisions, and normal source withdrawal followed by denied citation and report-file reads. The source images are explicitly supplied to both standalone and complete catalog runs; the nested owned runner does not borrow unverified assets. Upload and original responses use the existing versioned-header helper without changing byte authorization or streaming revocation checks.

Recovery now revokes every restored service cost budget, including apparently unused budgets whose post-capture charges could be missing, and prevents automatic runtime release under revoked authority. Original authorizations, caps and permanent accounting remain intact. Explicit owner charge reconciliation remains possible and leaves the authority revoked. Two actual owned database regression cases cover unused/reserved caps, immutable revocation, idempotent quarantine, denied worker release and post-quarantine charge accounting. No source schema migration is needed for these changes: they use the existing versioned budget state contracts.

`source-budget-regressions-current.json` passed all 12 registered focused cases, with no failures or pending cases and zero paid calls. Root/pilot typechecks and the 221-file documentation check passed. Current deterministic inventory is 639 cases / 108 suites; its fresh complete execution is pending. T071 and full current recovery verification remain incomplete; these changes do not establish hosted release or human acceptance.

### Current source budget and linked-source regression composition

The complete predecessor composition passed in `regressions-e5335277-0d8d-44db-a5ef-d25f6d5e945a`: eight original predecessor groups, 39 actual schema-057/PostgreSQL-18 authority cases and 40 CLI WebKit cases across four projects. Source digest `7131724b790301512fffeabf8b6535967966fe5673cd13f25b887d0a3fcb351e`, catalog digest `ddc87e91ecc9e0e90bcb44987424ebc5bbf8d39cc352a17fd7e8b18f0ebdbdf6`; zero paid calls, local only. Current synthetic-workspace screenshots were inspected in desktop/mobile light/dark; clear test-data labels and responsive layout were retained. The separate operator package prepared successfully against the same source in `operator-source-budget-current-20261012`; no deployment or scheduled capture occurred. Fresh quality applicability identifies all nine catalogs as requiring actual-model evaluation; the index is not output-review proof. The 639-case complete pilot run remains active.

The matching complete pilot catalog finished successfully: `run-a02cae32-f054-4e05-b980-656aefac525c`, 639/639 named cases in 108 suites, zero failed/skipped cases, process exit 0 after owned cleanup. This validates the artifact release headers, current linked-source/report withdrawal path and restored service-budget changes at the source identity above. `fullPilotReady` remains false; actual CI, hosted full workflow/recovery, scheduled cadence and participant feedback are separate outstanding requirements.

### Normal HTTP partner training implementation

The ignored owned prototype completed normal guide authoring/submission, exact mcteer publication preview/decision, exact individual assignment preview/decision, partner draft/submission and mcteer checkpoint verification. The first attempt failed only its final unavailable-progress assertion: after source withdrawal the governed projection returns `progress:null`, not a displayed zero percentage. That failed receipt remains failed. The corrected prototype and reusable guide helper each passed, followed by the registered `linked-http-training.test.ts` (1/1, process exit 0) with actual unassigned-customer denial before the normal administrative grant. All used isolated PostgreSQL 18, a production-built HTTP application, real owned extraction and no model/provider calls. SQL only initialized the synthetic workspace/principals/memberships/customer; facts, plan, activity, guide, assignment and demonstration decisions used ordinary governed commands. The new named case is registered in G18; inventory is now 640 cases/109 suites. The prior 639-case complete run remains proof for its original source only. T071 remains incomplete pending the full hosted catalog.

The registered linked source/report and partner training checks subsequently passed
2/2 with explicit milestone review in the report chain. The report remains grounded
in reviewed activity; three separate milestone preview/decisions establish its
controlled acceptance without asserting a customer outcome. Root and pilot
TypeScript checks and the 221-document check passed. Review also identified local
renderer-image literals in the two linked tests; both now select the immutable
renderer ID from the validated prepared-image manifest so a fresh CI build need not
have this machine's Docker image ID.

### Permanent recovered request audit

`recovery-replay-audit.ts` adds actual owner inspection of captured/inherited request
fences. The initial complete credential-denial suite passed 16/16, including missing
fence, disabled guard, stale revision and runtime-authority rejection. A subsequent
focused case passed after checking the actual replay function body/configuration
against the authored migration and rejecting a changed implementation (1 selected
case, 15 intentionally unselected; not a complete-suite claim). Additional immutable
fence protection and runtime-write checks are being verified. The CLI consumes
actual independent encrypted archive bytes through the existing cold reader and
never accepts a raw healthy flag or creates complete recovery-verification rows.
T052 remains incomplete for current full source, provider/send/charge and workflow
reconciliation. No primary migration, provider cancellation, model call, paid job or
service unlock occurred in these implementation checks.

The strengthened permanent-request audit focused case passed (1 selected, 15 unselected), including altered function body, disabled request trigger, disabled immutable-fence trigger, runtime-owner denial and stale revision. Authored function SQL is obtained from the existing migration static emitter without executing schema changes. The CLI re-authenticates independently retained encrypted current bytes and does not manufacture complete verification rows. Final root/pilot TypeScript, document and diff checks passed; credential hygiene found no protected `.env.local` values or private candidates among 505 changed/new paths. The upcoming draft checkpoint/CI remains separate from full feature completion and Production release.

### First actual CI checkpoint and discovered predecessor failures

Draft PR 32 was created at `91287f288e79376d0127ed5dea0c4bbbace526c8`;
workflow run `38254825028` is not acceptance. Early failed job logs revealed:
(1) the second synthetic bootstrap in the base/execution workflows supplied the
new test environment but retained the application owner connection; the now-explicit
owner bootstrap correctly refused it; (2) legacy feature recovery checks expected
schema 049/051/055 while default owned environments now initialize 057; and (3) the
new authoritative expansion pricing suite was missing from the strict 011 manifest.
The fix supplies both exact test connections, explicitly retains the historical
feature schema only in those owned recovery rehearsals, and registers the pricing
suite. Ordinary current-schema regressions still use 057. Base recursive test
commands now exclude the dedicated pilot directories, which remain fully covered
by the separate named 640-case catalog with its required image preparation. These
changes do not loosen production readiness, bootstrap ownership or recovery guards.
The failed CI run remains failed; the corrected recovery commands are being verified.

The first local recovery correction attempt retained the old feature schema and
failed correctly on missing `operations_control`; it is not acceptance. The final
approach keeps the current guard, seeds predecessor records with the exact released
base `699f6f4a89911b1ba33bc2d90ed51ac1ba2ee530` in a bounded, marked, loopback-only
subprocess, waits for that writer to exit, and migrates the owned target through the
complete installed manifest. Narrow seeding checks passed for 047/049/051 → 057.
Complete partner recovery passed empty/049 → 057; complete learning recovery passed
empty/051 → 057 with 11 domain cases each, authenticated native restarts, unknown-cost
holds, immutable snapshot and deadline checks. The stale MCP activation case now
checks explicit supported 054–057, rejects unknown versions/runtime authority and
restores its actual original marker; its focused owned case passed.

The initial gap recovery then exposed the local 012 worker removal: the report worker
no longer ticked independent gap preparation/cleanup. The corrected local lane is
separate from 009 enablement and is inactive for the hosted Sandbox backend; complete
empty/047 → 057 recovery now passed disabled cleanup, crash recovery, no automatic
retry, workflow marker preservation and lifetime tombstone checks.

The standalone report-audience attempts did not reach their suite because required
operator-independent test configuration was absent. An existing older failure
receipt (`tests-IZA4mz`) diagnosed shared generation windows, but is historical and
cannot prove this source. The verified owned report clone now isolates quota windows
between independent cases only; normal generation limits and measured journeys are
unchanged. A new run with sanitized, generated synthetic configuration is underway.
Fresh CI will print bounded redacted failed-test metadata rather than lose every
underlying assertion behind generic private-evidence errors.

The configured current report-audience run completed successfully (1/1 registered case, exit 0), using generated synthetic credentials and a sanitized process environment; it is a focused check, not a complete report/CI claim. Complete gap worker recovery also exited 0 for empty/047 → 057. Current pilot/root TypeScript checks passed. The first CI run completed with failure and remains explicitly failed; the corrected checkpoint will be validated by a new run.

### Resumed CI failure correction — 2026-10-12

PR 32's second workflow, `38264825909`, ran against
`1dbd8dc3af5b11583e3b1bfb9c1e31159e338be1` and has failing jobs; it is
not acceptance. Completed job logs identified several remaining incompatibilities:

- 012/013/014 recovery commands correctly reached schema 057, but their evidence
  verifiers still required 049/051/055. Verification now requires the exact
  supported current manifest (057), both distinct empty/predecessor paths and
  every authority, replay, restart and retention outcome. Six regression cases
  reject incomplete, historical, duplicate, future-schema and weakened receipts.
- Two predecessor bootstrap tests still omitted the exact test owner connection.
  Both now supply it explicitly without weakening the operator's target guard.
- Two low-level retrieval fixtures referenced nonexistent original revisions.
  They now create workspace-bound original provenance; they do not manufacture
  factual acceptance or claim end-to-end retrieval eligibility.
- The synthetic stale-signature fixture did not supply the required 512-byte,
  space-padded CVD header. Its correction preserves the scanner's format and
  freshness checks.
- A nested owned recovery scope discarded the parent's explicitly prepared
  immutable renderer. The narrow recovery fixture now carries that image binding,
  not provider credentials or arbitrary inherited configuration.
- The renderer image lacked `lib/server/operations/code-version.ts`, newly
  imported by `lib/contracts/http.ts`. A fresh isolated render reproduced
  `ERR_MODULE_NOT_FOUND`. Both the Docker recipe and the minimized preparation
  context now include that content-free module. Renderer diagnostics expose
  only fixed stage codes; Python validation tracebacks remain withheld.

Owned verification passed 13/13 affected actual-database cases, the focused stale
signature case (32 unrelated cases intentionally unselected), all focused unit
cases in `resume-ci/unit-final.json`, root and pilot typechecks, and the document
check. A fresh image rendered all four required output files, and ordinary
report preparation, render, brand review and publication passed in an isolated
owned database with restrictive umask and zero paid calls. The focused ordinary
Product Gaps author/edit WebKit case also passed locally (1/1). Its Linux CI
failure is not yet resolved; bounded availability/content-presence diagnostics
were added without recording IDs, titles, source prose or response bodies.

These are scoped local corrections, not a replacement complete 640-case catalog,
complete predecessor composition, green CI, provider acceptance or release. No
Production migration, deployment, unlock, paid evaluation, provider cancellation
or participant feedback occurred during this resume. All incomplete tasks retain
their unchecked state. PR 32 stays draft until its required current-source checks
and review are complete.

### Third CI checkpoint and complete-catalog failure

Workflow `38267585689` at `991715e813f210d73ad133ff4f4aae34223d52e0`
confirmed passing current-schema 012/013/014 recovery evidence, reporting
deterministic checks and all Product Gaps WebKit projects. The Product Gaps
failure from the prior run did not recur; the extra diagnostics remain minimized.
Other failed jobs mean this run is still not acceptance.

The workflow exposed another access-contract bootstrap using the application owner
instead of the test owner, and a staffing authority fixture still inserting an
unbound legacy session. Both are corrected to exact owner/session bindings; the
staffing test retains its 403 canonical-reviewer and 401 forged-principal assertions.

Fresh public-asset preparation completed in `images-resume-ci-20261012` with the
corrected renderer dependency. The complete local catalog attempt
`run-d44184b6-4aea-41be-abf4-98fd865aac7b` failed in
`recovery-quarantine.test.ts`: its separate nested helper dropped the prepared
image and rendered from an older tag, correctly failing binding verification.
That helper now reuses the existing exact owned authority environment, including
its explicitly admitted immutable renderer. The failed full attempt is retained.

The three corrected suites passed 22/22 cases (access 6, staffing authority 5,
recovery quarantine 11), with zero pending cases, in the private `resume-ci`
receipts. The prior focused unit composition passed 25/25; root/pilot typechecks
also passed. These do not replace a complete-catalog or current CI result. The
Linux CI pilot recovery case separately encountered a non-HTTP render failure;
only fixed execution/contract failure categories are now exposed for diagnosis,
never renderer inputs, paths, filenames or arbitrary exception text. Current
full-catalog acceptance remains pending.

### Complete owned catalog on c638b31 and fourth CI diagnosis

The fresh complete local catalog passed **640/640 named cases in 109 suites**,
zero failed/skipped acceptance, in `run-67a89edc-4e35-4186-b8a3-83c07e1cc722`.
Commit `c638b3158660397311c33158a1338e9aad711de0`, source digest
`c7fdf77c84cc2db6ae2c8341adff4e3225900acecff50390c546882a6d0f1304`,
catalog digest `93d9c32dcd5d3b886611dbcf09c2f02a300aee2db33e10404b9c15e35febb40a`.
The owned runner exited 0 after cleanup. This is current local proof at that
commit, not hosted or human acceptance; `fullPilotReady` remains false.

Workflow `38270783944` at that commit still has failures. Its base UI runner
incorrectly discovered the dedicated pilot journeys without their owning harness;
the legacy-only discovery now excludes those two files while the independent
four-project 016 job remains mandatory. Explicit discovery confirms no pilot
files enter that legacy catalog. Its execution schema tests also attempted to
run current domain code against schema 034/035, where operational controls do
not exist. The locked current guard is retained: a verified loopback,
owner-marked clone now uses the exact released code to create ordinary reviewed
baseline/resource records, terminates that writer, then forward-migrates and
compares the unchanged original metadata. CI fetches the required history for
this deterministic gate. All five actual owned execution-schema cases passed,
including both upgrades and current runtime grants/readiness.

The Linux pilot recovery/render failure remains under diagnosis; local full
success cannot waive it. Unknown render exceptions now report only a fixed
execution phase and an allowlisted system/contract category, with all arbitrary
exception text withheld. These later source changes require fresh CI/full
validation before acceptance. No hosted target or approval changed.

### Linux execution root cause and absent-parent regression

Fresh CLI WebKit at `2819483` passed all 40 cases in four projects in
`ui-nT9fy5`. Synthetic desktop light/dark workspace and mobile dark upload
screenshots were inspected: explicit test-data labeling, readable controls and
responsive layout were retained. This predates later diagnostic/environment
changes and remains attributed to its original source.

CI `38276708605` at `80656e2` identified the failed render before output
validation, at the executor's fixed mount guard. The owned harness constructed
its safe environment with undefined parent entries, then assigned them to
`process.env`; on Linux an absent `TMPDIR` became the string `"undefined"`.
`os.tmpdir()` therefore produced a relative scratch path. The mount guard
correctly refused it. Parent environment construction now omits absent values
while retaining only the same explicit non-secret allowlist. Neither mount
validation nor isolated execution permissions were relaxed.

The actual owned access/staffing/quarantine composition passed 22/22 cases with
`TMPDIR` explicitly unset, including actual report rendering and uncertain-send
quarantine. Thirteen focused executor/environment cases passed; the environment
case proves absent values and provider/database credentials cannot enter the
safe parent map. Root/pilot typechecks and document checks passed after correcting
a test-only Next ambient `ProcessEnv` typing issue. Failure diagnostics retain
only fixed stages, allowlisted codes and specifically authored execution source
locations; arbitrary exception text, private storage paths and original filenames
remain withheld. These later changes still require fresh complete CI acceptance.
Production, selected configuration, workflow state and agent model were unchanged.

### Completed sixth CI and public execution asset permissions

CI `38278435669` completed at `90f8bfc` with **40 successful jobs and three
failures**. Both pilot regression/WebKit jobs, the base verify job, all execution
jobs, reporting, 012/013/014 recovery and most composed gates passed. The prior
Linux report failure is resolved; the deterministic catalog reached its next
actual scanner test instead of stopping at recovery rendering. No CI acceptance
is claimed while the three failures remain.

The scanner executes under its existing fixed non-root UID. Recursive copying
public AV/OCR assets under the deliberately private `077` runner umask produced
owner-only directories on Linux. A narrow CLI helper now validates only the
public `signatures`/`assets` namespaces (rejecting symlinks and unexpected files),
then restores `755` directory/`644` public-file permissions. Freshclam state is
not modified. The private store root, originals, execution UID, network denial,
mount validation and resource limits are unchanged. The eight actual pilot
access cases passed with both `TMPDIR` absent and umask `077`, including the
pinned scanner's harmless malicious-original detection and zero extracted units.
The focused 13 executor/environment cases and both typechecks passed. The
permission regression verifies that a private original remains `600` and a
symlink to it is refused.

The other failures were a composed 014 full eight-review WebKit journey timing
out at its 120-second bound (standalone 014 WebKit passed), and an 008 native
binding failing inside expansion's full regression cohort (standalone 008 gates
and the pilot composition passed). The full 16-arm/eight-review journey now has
a still-finite 180-second two-core CI bound; no assertions, reviews or cases are
removed. Native preparation reports only its HTTP status, never an arbitrary
response body, to distinguish authorization/admission failures from readiness.
These changes need a new complete source-bound run; a passing standalone cohort
cannot waive either composed failure.

### Current-source attempts are retained, not promoted

The new full local attempt at `e72f811`,
`run-640b9113-b4be-40d1-a131-ecd98dc929cd`, failed at the 50th composed suite:
the interrupted workflow-copy case exceeded its 10-second test bound. The
large original's full-byte verification now uses `Buffer.equals`, avoiding an
8-MiB recursive assertion traversal while still comparing every byte. All eight
workflow-checkpoint cases passed after this change; no interruption, cleanup,
retention assertion or timer bound was removed.

CI `38288378778` also still failed the actual malicious-original scanner case.
The public permission correction and isolated access proof do not waive that
Linux failure. Its assertion now reports only a finite known state/error-code
pair so the next run can distinguish deadline, stale-signature and execution
failure without exposing document data or arbitrary diagnostics. Neither attempt
is relabeled complete acceptance. PR 32 stays draft and operational/human gates
remain pending.

The next Linux failure at `88ae9bd` reported the finite disposition
`failed; scan_unavailable`, not a content rejection. The scanner previously had
both a 30-second daemon-readiness loop and a 30-second outer stage kill, leaving
no startup slack for cold AV loading. Its bounded readiness is now 60 seconds
and its stage cap 90 seconds, still capped by the original immutable domain
deadline (120 seconds for ordinary artifact work). Per-file AV limits, heartbeat,
source/lease rechecks, non-root UID, 4-GiB memory, denied networking and fixed
program/input rules are unchanged. Focused assertions prove a shorter original
deadline remains the cap; no deadline is renewed after admission.

New actual images were prepared in `images-resume-startup-20261012`. All eight
owned access cases passed against those immutable images with absent `TMPDIR`
and private umask; 21 focused executor/environment/checkpoint cases and both
typechecks passed. The scanner case observes the real executor's response with
a call-through spy only (no fake scanner or substituted output) and includes only
the allowlisted failure code and finite exit status in failure diagnostics. This
is diagnosis and local verification, not a claim the next Linux run is accepted.

### Fresh complete local run and two remaining exact CI failures

At `a88489feafc196eda1f4901e1116b8df7490d522`, the complete local run
`run-91f16647-6acb-4543-b6c0-17f3a0e62505` passed **640/640 in 109 suites**,
with `TMPDIR` unset, actual prepared images and cleanup completed.
Source digest `2c19e7da7a3572864ef14f35d1795d0553fc81b102f7d693fd7d7c487cf0d972`,
catalog digest `93d9c32dcd5d3b886611dbcf09c2f02a300aee2db33e10404b9c15e35febb40a`.
CI `38292390500` completed with **41 successful jobs and two failures**. The
full 014 review journey and native 008 case passed in their compositions; the
remaining expansion failures were both historical 034/035 seeds missing the
released Git commit in a shallow checkout. Expansion's full regression job now
fetches the required history, retaining the exact ancestor/ownership checks.

The actual Linux scanner response was exit 2 with no known isolated failure
code, not an executor deadline failure. The runner's private `077` umask reduced
the requested `0444` scratch-original permissions to `0400`; its fixed scanner
UID could not read that bind-mounted inode. The adapter now creates the exact
exclusive scratch file and sets its final permissions on its open handle,
independent of umask. Enclosing scratch/input roots stay `0700`, report inputs
stay `0600`, and stored private originals are not changed. Scanner/parser UIDs,
read-only bind, denied networking and existing resource limits remain intact.
The attempted startup allowance was not the remedy: the original 30-second
scan stage/readiness limits and 60-second scanner case bound are restored.

All 21 focused executor/environment/checkpoint cases and eight actual owned
access cases passed after this correction. The regression checks exact `0444`
mounted input versus `0600` report input, `0700` parent, retained bytes and
refusal to overwrite existing files under umask `077`. Both typechecks passed.
Fresh full-source CI acceptance is still mandatory; the earlier full local
receipt is not moved to this changed source. Operational/human gates remain false.

### Green complete local and required CI checkpoint

Commit **`08ef152929a46d1bd3829c35f4d401814556e87d`** passed a fresh complete
local catalog: **640/640 named cases in 109 suites**, zero failed/skipped
acceptance, `run-39221025-1741-48de-b800-56cee839499d`.
Source digest `8a3ecf5203a5e95a6dd4d2d214b44de5ac9b25435a15a9872bb6a9a1f8e5cc73`,
catalog digest `93d9c32dcd5d3b886611dbcf09c2f02a300aee2db33e10404b9c15e35febb40a`.
Fresh immutable images came from `images-resume-input-mode-20261012`. `TMPDIR`
was explicitly absent; the runner retained its private umask and completed owned
cleanup. No active owned database/job containers remained at final inspection.

Required workflow **[38301166639](https://github.com/mcteer/turas/actions/runs/38301166639)**
completed successfully with **43/43 jobs**, zero failed/cancelled jobs. The Linux
complete pilot catalog, four-project WebKit, complete affected predecessor
compositions, schema/recovery, access/lifecycle, native/SDK and build gates passed.
This is an actual fresh full-source run, not a retry of selected failed cases.
All prior failed runs remain recorded privately. T081 and T082 are checked on
this evidence; documentation-only follow-up is not a relabeled new local receipt.

Feature status is **62/84 tasks**, not completed/ready. Remaining verified
cutover/capture/current-authority/restore/runbook implementation, hosted journeys,
concrete infrastructure/budget scope, applicable actual-model independent review,
actual scheduled backup cadence, participant/operator observations, cleanup and
attributable mcteer release decision still require their own proof. Production
remains on its existing deployment/schema; no merge, migration, enablement,
provider deployment, paid evaluation, user impersonation or release occurred.
Selected configuration, root workflow data and the authored agent model were
preserved. PR 32 remains draft while those requirements are unfinished.

### Documentation follow-up and explicit cancellation acknowledgment

Documentation commit `eab14f6` ran fresh CI `38310369273`: 42/43 jobs passed,
including the full Linux pilot and all predecessor compositions. Product Gaps
WebKit passed all 21 cases in desktop light/dark and mobile light, but the mobile
dark in-flight export case timed out awaiting its cancellation status. Bounded
diagnostics had no completed cancellation response at that assertion. This is
retained failure evidence, not accepted as a flaky pass or waived by `08ef152`.

The existing case now waits for the exact cancellation POST response and requires
HTTP 200 before checking its UI acknowledgment. Its cancellation route wait has
a finite 30-second bound; no assertions or cases are removed and there is no
retry. The held GET/abort-release race, zero browser download, persisted cancelled
receipt and no-reusable-identity assertions remain. An actual owned CLI WebKit
check passed the case in desktop light and mobile dark: 2/2, zero skipped,
unexpected or flaky results. Root/pilot types and diff checks passed. This focused
proof does not replace the fresh complete CI still required on the changed source.

### Native authenticated validation before mutation admission

CI `38318332649` at `d2715a4` passed 42/43 jobs, including all Product Gaps
WebKit projects with the explicit cancellation acknowledgment. Expansion's
composed regression still failed the richer E08 actual native fake-provider
capture while binding the local session (HTTP 503); standalone execution and the
complete pilot composition passed. This composed failure is not waived.

The installed eve authentication documentation confirms public health skips the
auth walk. The owned execution harness now warms the actual authenticated native
route with an intentionally invalid, empty body, requiring the governed wrapper's
422 validation rejection before creating a conversation or admitting advice.
The wrapper rejects that body before `claimBinding`. Only this non-mutating
validation probe may repeat during a finite 20-second readiness interval,
within the original overall deadline; real session creation, message dispatch,
model/provider work and unknown effects are never retried by this change.
Unauthorized/unexpected responses fail, and diagnostic binding failure categories
are a fixed allowlist rather than arbitrary response bodies.

All three actual owned eve boundary cases passed. The strengthened existing case
proves rejection 422, zero native delegation and an unchanged unbound conversation
before its ordinary successful bind. The previously failing richer E08 capture
also passed against the actual owned native runtime and fake provider; its eight
unrelated cases were explicitly unselected, not counted as full acceptance.
Both types passed. No authored agent model, primary deployment or selected data
changed. Fresh complete CI remains required on this source.


### Resumed owned storage and physical recovery timing (2026-10-12)

Resumed the existing clean `94d3dc3` checkpoint, without resetting tasks or
relabeling retained proof. Read-only GitHub inspection confirms required workflow
`38326648341` completed successfully: 43/43 jobs, zero unsuccessful jobs, exact
head `94d3dc3eaeaedaf634e19c9e6c907797d6bf1f95`. This is prior committed-source CI,
not CI for the new uncommitted changes.

T045 now additionally supports `--copy-owned-legacy`: separate privately marked
artifact/workforce/report roots, exact owner recovery lock and one database capture
fence. Both report ledgers classify IDs with a 100,000-row bound. Cross-ledger
collisions and unknown files are refused, immutable bytes are copied and checked
through cold clients, and originals/configuration are retained. Failed copy attempts
retain content-free failure receipts. Hosted Blob copying, admitted provider costs
and actual cutover remain pending; T045 is not checked off.

T057 now has strictly parsed physical timing diagnostics in both isolated restore
commands. Exact capture age and physical restore duration are measured with
24-hour/four-hour comparisons; backwards clocks fail. Incident start and verified
service remain absent, and RPO/RTO/full readiness remain false. This does not resolve
required quarantine, current authority, provider replay or authenticated recovery.
T057 remains unchecked.

Focused checks passed 24/24 unit cases and 3/3 actual owned-database legacy command
cases. Root and pilot typechecks, authored docs and diff hygiene passed. New cases
are registered in the complete suite catalog, with no filter or skipped/flaky
acceptance. The final full local run passed **653/653 cases in 112 suites**:

- Run `local-artifacts/016/run-0c4e47a4-40a0-4fd2-b9ac-aed3648b7315`.
- Base commit `94d3dc3eaeaedaf634e19c9e6c907797d6bf1f95` with uncommitted changes.
- Actual source digest `76a0751de1c0bbeeacfc186a237edcf985a0cd3a30ddbc02b1500793d8eedd48`.
- Catalog digest `93d9c32dcd5d3b886611dbcf09c2f02a300aee2db33e10404b9c15e35febb40a`.
- Exact owned marker `test-pilot-be295534f81b`; retained pinned local image
  preparation `images-resume-input-mode-20261012/preparation.json`.
- `TMPDIR` unset; owned harness cleanup completed. No owned database/job containers
  remained at inspection. Unrelated host containers were not modified.

Retained failures: `run-01ed6c7c-127d-442b-bca3-c409bc39d7e5` timed out the admission
suite's 15-second setup hook, leaving all 12 cases unexecuted. Its explicit setup
and cleanup budgets now fit the existing 120-second suite envelope; all actual
admission assertions and operational deadlines are unchanged. Standalone 12/12
passed. `run-33501ab4-1074-4649-a865-fc89f6b1f044` hit the recovery suite wrapper's
120-second deadline, below that suite's existing 210-second setup/test allowances.
The wrapper now allows 300 seconds; no domain timeout or assertion was removed.
`run-67931829-e152-47d9-8ff3-23682d719d9d` then exposed the old incomplete-store test's
expectation of an empty evidence directory. It now verifies the actual failure
receipt and all retained-original/no-cutover boundaries. The next complete run
passed. Failures were not deleted or counted as successful receipts.

Documentation updates after this receipt have their own source identity; the
receipt is not relabeled onto them. No commit/push/merge/deployment, Production
migration/unlock, paid model call or new infrastructure provisioning was performed.
Task inventory remains 62/84 checked; required hosted/human/release work and remaining
implementation are not declared complete.


### Owned current-denial operator reconciliation (2026-10-13)

Resumed the existing uncommitted storage/timing changes and preserved the green
`94d3dc3` / workflow `38326648341` checkpoint. Added
`pilot:recovery:authority -- --reconcile-owned-work-denials`, using the existing
independent encrypted snapshot reader, actual owned-target denial application and
actual replay-function/trigger/index/immutability audit. Hosted and unowned targets
are refused before archive reads. Complete schema-057 v6 proof is required; absent,
older or stale proof cannot authorize mutations. The owning disposable connection
and the restored source marker are checked independently. No credential/grant is
revived, quarantine resolved, service opened or uncertain effect retried.

Denial changes commit before the replay audit. `denials-applied.json` preserves that
checkpoint; audit failure retains committed denials, a content-free failed attempt
and the service lock. Full repetition is idempotent and writes successful
`reconciliation.json` only after audit completion. Temporary decrypted staging is
removed on both success and failure. T052 remains open for complete recovery,
provider/uncertain-effect and service acceptance.

Four actual owned PostgreSQL 18 command cases passed in 44.54 seconds, including
normal denial/replay application and idempotent repetition, pre-read changed-lock
rejection, failed-audit resume without denial rollback, and unavailable/older/stale
proof rejection. The archive reader is stubbed in these command tests; they do not
claim actual independent-provider authentication. Earlier focused composition
passed 20/20 across the first three command cases, seven schedule cases, six timing
cases and four legacy-classification cases. Initial attempts exposed the host's
Node 26 selection and a bigint assertion expecting a number; Node 24 and an explicit
query cast corrected those test setup issues, without changing domain safeguards.

Registered the four cases in the complete suite inventory and bound all 17 new
storage/classification/timing/command cases into G06. The initial full run
`run-0feafba2-b4d1-4f2e-9917-1136609726bb` was deliberately interrupted to add that
gate binding; its failure and cleanup are retained and never counted as acceptance.
Fresh complete run `run-a4448b02-0921-46e4-b9a3-0218f9c3acd8` is pending against the
updated source/catalog. Docs (221 authored files), root/pilot types and diff hygiene
pass. No primary/Preview/Production schema, deployment, credential or provider
change was made by this resumed work.

The user nominated mcteer for the human operator/reviewer exercise. The concrete
walkthrough is documented in operations; nomination is not an observation or
participant acceptance. Distinct internal/assigned-partner feedback and the actual
scoped release decision remain required. Task completion remains 62/84.


The complete expanded local catalog passed **657/657 in 113 suites**, with no
failed/skipped/flaky acceptance, in `run-a4448b02-0921-46e4-b9a3-0218f9c3acd8`.
Base commit: `94d3dc3eaeaedaf634e19c9e6c907797d6bf1f95`; exact uncommitted source
digest: `17c299c30d96055cb208ff41314a86e1862a5286eb94bc417a7d0d2005c71a5e`; catalog
digest: `1e568e554aca63856e05fc7ec6e5e1b1567acb37c074b20c5434ee20a5dbdb36`; owned
marker: `test-pilot-ec707cc40892`. Process exit 0 followed owned harness cleanup.
This proves the recorded source only; subsequent status/cleanup documentation and
deterministic directory-order assertions require their fresh committed checkpoint.

T054 is complete as an implementation task: strict schedule policy and CLI tests,
actual operator cron generation/transport checks, actual database managed-expiry
and permanent independent-authority retention checks all passed. The implementation
uses the fixed 12-hour/24-hour/seven-day policy and never deletes operator archives
or independent authority. T077 remains open for two genuine hosted scheduled
captures and full restore/service timing. Task completion is **63/84**.

The user explicitly authorized a single **$25 total** T069 evaluation cap plus
**four existing Context credits**, with automatic billing/top-up disabled. Its
private authorization retains one UUID and a 24-hour validity window. No paid
evaluation was dispatched before this authorization; Context credits fund bounded
catalog research and cannot establish semantic review. Native preparation, current
committed deterministic proof, actual accounting and independent review remain
required before T069 can close. The user also required unnecessary data and
OrbStack cleanup after implementation; T080 and operations now state that scope
while preserving selected state, necessary recovery evidence and permanent/unknown
effect protections.


### Anonymous backup-client volume cleanup

The user's closeout request prompted a read-only OrbStack inventory. It identified
12 historical owned image tags as candidates (three current images retained) and
856 unreferenced volumes without a verified 016 owner label. Inventory alone does
not authorize removal of unclassified retained data. One owned interrupted-run
container `turas-016-check-cc169e4f09c1` was removed with anonymous volumes after
actual owner/name and selected-database-reference checks; protected hashes remained
unchanged. Its failed run evidence is retained. No global prune was used.

The dump/restore clients had omitted `--volumes` when removing their positively
owned containers. `backup-container-cleanup.ts` now checks exact UUID/name and actual
owner label, distinguishes positive absence from failed inspection, and removes
anonymous volumes together with the owned client. Named volumes and bind-mounted
stores are retained. All five focused cases passed: four ownership/failure cases
and an actual Docker case covering both pinned PostgreSQL 17/18 images, anonymous
volume removal and named-volume retention. Pilot types pass.

The committed deterministic run `run-b6e5f185-e2ae-4d68-b155-74ba5e341d62` was
intentionally interrupted to include this necessary cleanup correction. Its failure
and cleanup remain retained, not acceptance. Native preparation at `0faa1c1` passed
with zero paid dispatches but does not replace corrected-source preparation.
Full inventory is now **662 cases / 115 suites**. Fresh committed proof is pending;
the original evaluation authorization is unchanged and no paid dispatch has yet
been admitted.


### Corrected committed deterministic checkpoint and admitted evaluation

Complete run `run-b663b652-4459-4150-b89a-2dbb4f508313` passed **662/662 cases in
115 suites**, zero failed/skipped/flaky acceptance, with process exit 0 after owned
cleanup. Exact commit: `f81f6e4f095754f12f351c7f7ec529114fb6d233`; source digest:
`29dfb6a11363af83ad2a74bf2c14f3977532fd043c85c5f38c792df85a4215e0`; catalog digest:
`00e5feefbb437d111334351389c9341c7208728615fad09f7dea9125628bafec`. Current native
preparation `quality-preparation-cleanup-20261013` passed on those same identities
with zero paid dispatches. CI `38415271420` is still in progress; 37 jobs have passed
and none failed at inspection. The superseded `38412679671` run was cancelled by
the existing branch concurrency policy and is not acceptance.

The actual-model batch was started with the user's original $25/four-credit
authorization and these exact committed deterministic/preparation receipts.
Private capture root: `local-artifacts/016/quality-live-20261013`. The global approval
journal must survive corrections and unknown costs. The source remains fixed at
`f81f6e4`; no semantic pass, independent review, T069 completion or pilot readiness
is claimed from admission or captures.

OrbStack accounting separately identifies 452 empty unreferenced anonymous-volume
candidates and 414 unreferenced nonempty volumes. Both inventories are private and
read-only; any deletion requires refreshed references and classification. Current
images, selected stores/state and required recovery/accounting evidence remain
preserved. The second interrupted-run orphan `turas-016-check-3b70d9da64c4` was
also removed after owner/name and selected-database-reference checks; cleanup
evidence and failed run results remain retained.


### First actual-model attempt: accounted failure and evaluator correction

`quality-live-20261013` completed 002 capture, then stopped on the first 003
`accepted-source-fidelity` response at `noUnknownCitations:false`. All 26 Gateway
dispatches are accounted: **$0.349202** reported charges, zero held/unknown charges,
zero Context credits consumed/held, and admission unheld after shutdown. The
original $25/four-credit journal remains unchanged. No replacement approval or
spending reset is created. No complete actual-model or semantic pass is claimed.

The retained reply cites actual accepted records and their attributed source, but
also displays the actual workload IDs returned by the governed product-use tool.
The evaluator matched every UUID and omitted workload references from its known
identifier set. `profileEvaluationState` now recognizes workload IDs only through
current audience-eligible accepted records for the exact customer. It does not
whitelist all workloads, unknown IDs, other customers, Pending records or
partner-withheld internal records. The actual owned regression passes those
positive/negative cases and rechecks withholding after normal retraction. Two
initial regression attempts used incomplete retraction version fields; corrected
current-record-version input passed, without changing the domain contract.

The case is registered under G09. Full inventory is **663 cases / 116 suites**.
Fresh committed deterministic/native proof and the corrected full paid batch remain
pending; the prior failed attempt and its captures/costs remain retained.

### Current deterministic proof and second actual-model attempt

Committed `0b7712fda97ad2452afebb0873338e60e707057d` passed **663/663 cases in
116 suites**, run `run-684d8a59-055a-4f3a-9b11-14a1c648ad30`, source digest
`6a070b164394e14e2cffcb3b8caeff1e1d3084de94f3384267d9e1adea5bde7b`, catalog
`c0bf9a2bd96e43383b01ae5e64333cfc090b7b849657599f4534bed801849048`.
Current native preparation also passed with zero paid dispatches.

`quality-live-identifiers-20261013` completed 002 and seven 003 responses, all
completed 003 hard gates passing, then stopped at the inherited 14-model-step
limit. The incomplete attempt remains failed. Across both paid attempts, the
same original journal reports **$0.806589 charged**, no held/unknown charges,
66 Gateway dispatches and zero Context credit dispatches/consumption. Remaining
allowance is $24.193411 and four Context credits; no spend reset is permitted.

mcteer explicitly authorized **32 steps for the full 003 catalog only in 016**,
retaining all cases, domain limits, original $25 total/four-credit cap and disabled
automatic billing. A separate strict step authorization binds the original budget
ID/digest/expiry. Its runtime supplement does not change the monetary authority;
ordinary 003 runs and filtered cases retain their prior 14-step cap. Expanded
captures record their actual cap. Wrong budget/digest/expiry, other catalogs,
future/expired approvals, excessive caps and extra money fields fail validation.
The catalog now contains **664 cases / 116 suites**. Fresh full committed proof,
native preparation and the whole corrected paid batch are required again.


The first step-supplement deterministic attempt at `101ed5c`,
`run-3adb79cd-6086-4ab9-be4e-83684b6e2786`, was deliberately interrupted during
load verification to correct the governing review verifier's remaining 14-step
check before any further paid work. Its incomplete evidence is retained. The exact
owned orphan container was removed after label/name and selected-connection checks;
protected configuration/model/workflow state matched before and after.

The 003 verifier now reads the same explicit private operator runtime as capture,
requires the capture's recorded cap to match that authorization, and keeps the
ordinary 14-step limit. A subprocess regression uses synthetic review fixtures
only: 24 steps fail without the runtime, pass under its exact approved 32-step
supplement, and fail under a foreign budget binding. No semantic observation or
provider call is supplied by this regression; its ledger remains zero dispatches.
The initial regression incorrectly included sourceCommit in the strict budget
schema; its fixture was corrected. All seven quality unit checks and both types
pass. Inventory is **665 cases / 116 suites**; full fresh proof remains required.


Current CI `38432315566` at `1a965b2` recorded a desktop-dark accessibility
assertion failure in `learning-draft.spec.ts:9:225`; it is not CI acceptance.
The exact local journey reproduction passed 4/4 WebKit configurations without
retries/skips (development subset, acceptance false). The complete five-journey
learning UI reproduction then passed **32/32**, eight cases in each of four
configurations, source `5d2b34d1b7ebf6bd2697b145fc8df73a6e1fb378d962a15973b0a1cf4754a2ea`,
with acceptance true and no retries/skips. Private logs are retained in
`learning-draft-repro-20261013.log` and `learning-ui-full-repro-20261013.log`.
No accessibility assertion or product code was changed; fresh whole CI job proof
remains required. Native preparation `quality-preparation-step-review-20261013`
passed on this source with zero paid dispatches. The 665-case full run is active.


### Committed full proof for step-authorized capture

`run-fd5f7070-b372-405d-9b39-27b4351b5552` passed **665/665 cases in 116 suites**
at `1a965b262a8c8e96386cc1a49b554af73ba9ae24`; source digest
`472efe3e7ca8ce0e388d0f972f8f4e132a4e0c8eeddd0e80f05f43a8b5246c3e`, catalog
`a6db61776e155811b252cd0d3e2cb910b088d1dfefcc55f21c53fec4d3cc3390`.
The runner exited zero after owned cleanup. Native preparation
`quality-preparation-step-review-20261013` passed with zero paid dispatches.
The corrected whole batch `quality-live-step-review-20261013` is now executing
under the original dollar/credit journal and separately bound 32-step 003 approval.
No complete actual-model/semantic acceptance is claimed while it is running.


### Third paid attempt, independent judge and source/setup correction

`quality-live-step-review-20261013` completed 002 and 003. The full 003 capture has
12 replies and 18 completed model steps, all hard gates true, admitted cap 32.
004 then failed before provider dispatch with the legacy configured-application/
test-database equality guard. The whole attempt remains failed and retained.
Original journal total: **$1.474879**, 105 requests, zero held/unknown entries and
zero Context consumption/dispatches. A missing worker preload was discovered and
corrected before any further paid attempt. Official read-only `GET /v1/report`,
scoped to the exact API key and UTC date, returned two stable complete observations:
90 language requests ($1.474864) and 15 embedding requests ($0.0000027), matching
the journal counts. Per-request upward rounding covers the $1.4748667 provider sum.
No additional request is observed. Private reports and reconciliation are retained
in `gateway-provider-audit-20261013`; no budget was replaced or reset.

The user explicitly requested another LLM judge. Independent gpt-6-astra review
passed 002 12/12 (governing verifier passed) and 003 10/12, withholding both source-
fidelity runs for baseline-versus-optional-walkthrough fixture ambiguity. It did not
assert fabrication. Originals remain byte-for-byte preserved; review artifacts
record exact digests and model identity in `quality-review-step-20261013`. The
judge's first 003 verifier call lacked the explicit operator runtime and correctly
failed its allowance match; no cap or score was rewritten to bypass that guard.
No full quality/hosted/human acceptance follows from these partial reviews.

Quality stages 002–004 now seed only the governing baseline demo; retrieval keeps
the original judged walkthrough. An actual normal-command regression verifies
three accepted baseline records/one product-use versus 25 accepted walkthrough
records/three product-uses. No case/rubric/domain limit is removed. The newly added
002 modelStepCap:14 label was inaccurate (only its result count was bounded); its
metadata is omitted. 003 retains its explicit admitted cap and 004 records its
unchanged 16-step cap.

The four legacy evaluation entry points now use a strict owned-source adapter,
without changing the ordinary test guard. Four unit cases prove legacy selection
and refusal of unmarked/hosted/mismatched/owner-as-runtime sources plus foreign
labels/port bindings. Actual PostgreSQL 18 source/clones/startup pass. Initial
credential-free checks exposed test-mode artifact startup, omitted retrieval report
sources, then omitted package paths; those concrete setup issues were corrected.
Retrieval copying excludes .eve/node_modules and links only required dependencies.
Both older helpers drain exact owned app processes before dropping their clones.

The worker guard test initially expected one installation receipt; Node's preload
runs in multiple contexts of the same worker. The corrected test checks every
receipt against the actual spawned worker PID and original budget/source. All
**four unit plus three composed owned cases pass**; worker test records zero paid
model/Context dispatches. Root/pilot types pass. Current inventory is **672/118**;
fresh complete committed/native/CI checks are required before further paid work.


### Independent-review evidence retention correction — 2026-10-13

The separate LLM judge identified that transient evaluation cleanup invalidated
native review roots and absolute capture paths. Each quality stage now retains a
private review workspace with exact Git-tracked source, verified against feature
008/010/011/014/016 and staffing source digests. Native artifact directories,
preflight logs and raw arm files remain until independent review; transient app,
database and worker resources still clean up normally. The original repository
also receives its explicit tracked-file hygiene check. Fixtures are generated in
the retained workspace. No capture/source digest is rewritten to simulate binding.

005 retrieval now retains query/role/scope, expected source/passages, ordered
results, resolved citations, recall, partner-scope outcomes and partial failure
evidence for independent review. No embedding vectors or credentials are copied.
The existing seven quality unit cases pass, including actual source-copy equality,
credential/state exclusion and altered-source rejection; root/pilot types, docs
and diff checks pass. Inventory remains 672 cases/118 suites.

The 7a892bb full run de86644d was deliberately interrupted after 84 completed
suites to apply these prerequisite corrections; it is failed/incomplete evidence,
not a full pass. Its owned resources were removed. CI 38441833704 reports a pilot
predecessor regression failure with no assertion-level diagnostic; a bounded
fixed-name predecessor-phase diagnostic now makes future CI failure attributable.
No paid calls occurred during this correction. Original cumulative spend remains
$1.474879, 105 dispatches, zero Context credits; $23.525121/four credits remain.
Fresh committed full/native proof is required before the next paid batch.


### Canonical review-workspace test correction — 2026-10-13

Run ac75a9cb at 6fb2a20 stopped at suite 55 (quality unit): the new test used the
transient app copy as its snapshot source, whereas the controller supplies the
canonical repository. Fifty-five prior suites passed; this run is not acceptance.
The test now resolves the real Git source, creates its private parent explicitly,
and passes all seven cases inside an actual owned PostgreSQL 18 app environment.
The first isolated recheck lacked that test parent and is retained as failed.
No runtime guard, fixture, rubric or product assertion is weakened.

The independent judge confirmed 007's documented derivative annotation workflow:
preserve original actual/pending files, independently fill only supported semantic
flags in derivative files, bind new digests in a separate review and retain explicit
original/derivative provenance. Other catalogs keep objective captures unchanged.
Retrieval also retains the failed non-hybrid response before rejecting it.

CI 38445284245 failed the same workspace test, composed 014 WebKit, and Product
Gaps desktop-light authoring. Its standalone 014 WebKit job passed. Exact local
Product Gaps authoring passed 5/5 (desktop-light subset, zero skips/flaky/retries,
acceptance false). Neither that selected result nor earlier UI passes clears the
failed CI gates. Bounded composed diagnostics now retain exact learning locations
and fixed failure signatures; fresh full local/native/CI results remain required.
Spending remains $1.474879, zero Context credits; no new paid run has started.


### Clean owned evaluation roots — 2026-10-13

The full 8199ace run 4f0ceeda reported 671 passing cases and one failure, across
all 118 suite reports. It is failed evidence. The final composed source case
exposed the older artifact helper's assumption that local-artifacts/004 already
existed. The helper now creates its private parent before mkdtemp. Exact composed
reverification inside an actual owned PostgreSQL 18 app passes all three cases,
with zero paid calls. Individual durations were 50.316s, 53.370s and 6.608s.

The deterministic runner's evaluation-source file allowance now covers its three
existing declared test bounds (390+210+120 seconds), plus sixty seconds for
process/report completion. The earlier successful direct composition took
130.32s, exceeding the generic 120s file allowance. Domain deadlines, model
steps, output limits, assertions, cases and money/credit caps are unchanged.
Root/pilot types and diff checks pass. Fresh complete committed/native/CI proof
remains required; no paid evaluation or feature/release acceptance follows from
the partial run or selected recheck. CI 38447453887 remained in progress with
38 successful jobs and no reported failure at this observation. Original spend
remains $1.474879, zero Context credits consumed, with the same expiry and cap.


### Fresh full checkpoint and independent review — 2026-10-13

At 24cd0d9, owned full run e1df4931 passed all 672 cases across 118 suites, with cleanup exit zero and protected selected state preserved. Native preparation also passed. This is local evidence only; CI 38452989331 failed its composed learning publication navigation check and does not establish acceptance.

The next actual-model batch completed 002 but stopped in 003 on an unknown citation in accepted-source-fidelity run 2. Independent LLM review of the fresh 002 replies passed eleven of twelve: save-profile run 1 omitted the required explanation of unavailable chat profile saving. Neither catalog is accepted. The original journal now records $1.806543 charged, no held/unknown charges, and zero Context credits consumed; the original $25/four-credit cap and expiry remain unchanged. Raw captures and failed reviews are retained.

Turi instructions now explicitly explain unavailable accepted-profile saving through chat while permitting governed Pending proposals, and omit operational search receipts from evidence citations. A fresh full model catalog is required to demonstrate the changed behavior. The publication UI test now waits for the actual candidate payload heading before asserting absent controls and navigating; this strengthens the assertion but does not prove the exact CI failure cause. Fresh verification remains pending.

The strengthened publication journey passes all twelve cases in four CLI WebKit configurations with no retries or skips in the frozen-tree recheck. It is a development subset, acceptance false. The earlier twelve-case run was correctly rejected because documentation changed during execution; it remains invalid evidence. Pilot types and authored-document hygiene pass.


### Compact learning input correction — 2026-10-13

Fresh CI at e2f768c failed native learning and its composed MCP predecessor. The exact native check reproduced locally: the expanded root instructions exceeded the existing cumulative learning input bound on the normal two-step fixture. The full local run 32005bc2 was deliberately interrupted after this reproduced failure; its partial passes are not acceptance. No new paid evaluation occurred.

The authored instructions now state the same capability, evidence and approval boundaries more concisely: 5,749 bytes versus 5,850 at the earlier passing 24cd0d9 and 6,282 at failed e2f768c. The original 24,576-byte cumulative input limit, model/output bounds, fixtures and assertions remain unchanged. The full native learning check passes all 25 checks with zero paid calls and verifies hosted MCP cleanup in the owned fixture. The selected model/configuration/workflow snapshot is preserved. Fresh committed complete local/native/CI verification remains required.


The 06aeb2b CI verify and execution-regression jobs exposed the existing root capability inventory wording assertions. The concise instructions now retain the exact private-customer-chat, bounded-context-snapshot and direct-fact-update denial phrases; no assertions were relaxed. Their final size is 5,784 bytes, still below the earlier passing 5,850 bytes. Both capability tests and all 25 native learning checks pass together with unchanged domain bounds.

The broader root unit suite passes all 498 tests in 110 files under explicit synthetic unit configuration (no selected credentials or live providers). Earlier attempts without required configuration, and with unrelated pilot-owned guard flags, are retained as failed development checks. Root/pilot types and documentation hygiene pass. The 46d9099f full pilot run was interrupted to correct the reproduced wording failure; partial results do not establish full acceptance. Fresh committed local/native/CI and actual-model proof remain required; spend stays $1.806543 and zero Context credits.


### Complete compact-guidance checkpoint and browser diagnostics — 2026-10-13

At 5c6a6d5, run 333388da passes all 672 cases across all 118 suites, with cleanup exit zero and the original selected model/configuration/workflow snapshot preserved. Source digest is 4d3af3b137912d5242e47b76b3baec323bdea76e2d0594c9cc7be575a7ca5285; catalog digest remains 9b22fb71e9f1c60cf25443de6ec992c6530666107e07624535f21bb1075082ff. Current native admission preparation also passes without paid calls.

Fresh CI 38461942181 passes native learning and the execution regression chain, but fails Product Gaps authoring in desktop-light and MCP browser checks in desktop-dark. Exact full local MCP WebKit verification passes 32/32 cases across four configurations with no retries or skips; that does not clear the CI failure. Product Gaps diagnostics show eligible working content returned by the API while the new proposal heading assertion timed out. No authorization failure or precise timing cause is established. The MCP CI log does not identify the failed assertion.

The CI failure printer now reports bounded browser source locations, project/status, duration and fixed failure categories/signatures from the retained JSON reports. It excludes titles, error prose, page content, stdout and attachments; only actual checked-in browser filenames are admitted. Two privacy/bound tests and root types pass. No fixture, assertion, retry, model or domain limit changes. Fresh committed full/native/CI proof is required before further paid evaluation; the original $1.806543 journal and zero Context credits remain unchanged. T069, hosted/recovery and real participant gates stay open.


### Independently verifiable behavior outcomes — 2026-10-13

Independent LLM review identified that booleans and intended fixtures could not conclusively establish the tool outcome for a Pending proposal. The paid batch remains stopped; no new provider or Context dispatch occurred. The 48c53ed full run was deliberately interrupted before changing this evidence path. Its partial results are not full proof.

The 016 controller now installs an observe-only event hook exclusively in disposable owned app copies for 002/003, and the existing 004 clone when explicitly requested by that controller. The root agent hook/model and public HTTP projections are unchanged. Private mode-0700/0600 files retain actual action arguments/results and completed-step/terminal events, redact known credential values, enforce exact app/database/environment/attempt/session binding, bound bytes/counts, and reject changed replay. The behavior driver preserves the original reply/history before collecting supplemental evidence, then retains actual proposal payload/channel/review state, command receipts, before/after counts, authorized customer snapshots/injection receipts, and exact selected artifact envelopes/ranges before withdrawal. References and underlying events are byte-bound; the governing verifier rejects changed sidecars, events or replies. Existing original captures stay immutable. No evidence becomes accepted customer context.

A real native SDK fixture emits one tool result and two completed steps, recorded in five bound events with zero paid calls. A second real native SDK/owned PostgreSQL 18 fixture submits exactly one governed Pending assistant proposal with the expected persisted wording/channel/receipt and unchanged accepted count. Its final snapshot-aware check verifies exact customer snapshot/injection agreement and the bound original reply. These use a synthetic provider and explicitly are not actual-model quality proof. The independent LLM checked all five event hashes and actual proposal/result/receipt identities, and confirmed evidence sufficiency for that controlled outcome; it requested the additional customer snapshot for direct approved-excerpt answers, which is now retained.

Three observer/privacy/tamper tests and two browser-diagnostic tests are explicitly registered in the complete pilot catalog: current inventory 677 cases in 120 suites. Their narrow contract check passes 27 cases across three files. The broader root unit suite passes 503 cases in 112 files under explicit synthetic configuration; root/pilot types pass. The strengthened chat/logout development subset passes both cases in all four production-served CLI WebKit configurations (8/8, no retries/skips, zero paid calls). Logout now verifies its actual HTTP status before waiting for navigation; this exposes denial separately from navigation timing without changing server authorization or existing bounds.

CI 38466278284 at 48c53ed passes Product Gaps WebKit but its verify job fails the original chat sign-out navigation wait; it is not accepted CI evidence. Some aggregated jobs API requests returned 502; smaller pagination returned actual job metadata. No precise sign-out failure cause has been established. Fresh committed full/native/CI and full actual-model/independent review remain required. Original Gateway journal spend stays $1.806543, with zero Context credits, the original cap/expiry and 003-only step supplement unchanged. Protected selected model/configuration/workflow snapshot remains preserved.


### Hosted conversation boundary authoring — 2026-10-13

The committed f988c93 checkpoint passes the complete local catalog: 677/677 cases across 120 suites, with no failures. Private proof: `local-artifacts/016/run-82efb1bf-7bb9-4899-89b0-953656bc8f48/execution.json`; source digest `62000af8a326204bd82a1532961feed454ea255dea8dc6da0192f3c06e509593`, catalog digest `8f2785cfb99b6ffddb69ea64e70c50f34f4d3b9df1066c59c60748d1e635b24f`. Native preparation also passes at that commit with zero provider dispatch. CI 38470861308 has 41 successful jobs while expansion and execution WebKit remain running; this is not complete CI acceptance.

T071 now has normal authenticated parked-conversation creation, original-key replay, ownership reads, archive/restore and exact interrupted-response cleanup. All roles use the same synthetic customer assigned to the partner, so foreign-owner denial cannot pass solely because a customer is unassigned. Cleanup archives only the original creation key under the exact actor/workspace/environment through the normal API. The source remains unbound; no messages, native sessions or model calls are created.

The normal HTTP integration suite passes 9/9 cases, including three role boundaries and damaged-response cleanup (`hosted-conversations-common-customer-20261013.json`). The actual production-served owned CLI WebKit integration passes its registered case with 60 assertions across three role sessions and four desktop/mobile light/dark projects (`hosted-browser-parked-state-20261013.json`): real parked reads/reloads, synthetic context, keyboard focus, responsive overflow, zero serious/critical accessibility violations, and foreign-owner API/page denial. All created conversations are archived and all three sessions revoked. Initial browser checks failed from an incorrect expectation of a composer/history request for an unbound chat; the successful check verifies the actual parked notice and independently calls the normal backing API. These are development-subset plumbing results, not hosted deployment or streaming/resume/stop proof.

The new fixed inventory is 680 cases across 121 suites. The deterministic CI job now installs WebKit because the registered browser integration requires it. G12's existing full UI inventory remains separate; the parked subset does not replace it. Fresh complete committed proof remains required. Completed role conversation/browser receipts are written privately before subsequent stages; the hosted runner still returns incomplete-catalog failure. T071, the other hosted journeys, managed recovery/RPO/RTO, actual-model review and human gates remain open. No new paid calls or Context credits have been dispatched; the original $25/four-credit budget and expiry remain unchanged.


### Linked support, expansion and Product Gaps boundaries — 2026-10-13

The committed 86bc6c2 checkpoint passes the complete local catalog: 680/680 cases across 121 suites. Proof: `local-artifacts/016/run-7c3a767c-1196-44d6-9c2f-4212a3702190/execution.json`; source digest `7ef3ea369092f098aee3ab8cae389414cb78d3e532dd4280daab28659c4e4e8b`, catalog digest `a7d5ca2fb5d925b0d74bfb20145aead27e538fd9d0ccd06a94b183218b6c8075`. Native preparation passes with zero paid dispatch. A first full launch omitted the required prepared-image input and failed at setup before any case; the complete passing run supplies that input. This is a checkpoint, not full pilot readiness.

CI 38479341519 fails the composed 014 WebKit predecessor: `learning-draft.spec.ts`, desktop-dark, the serious/critical accessibility assertion. Its diagnostics identify the assertion but not the actual rule. An exact local development recheck passes 4/4 projects. The test now verifies the actual current draft URL/heading and absence of the prior form before accessibility analysis; another 4/4 development recheck passes without retries or skips. No precise CI failure cause has been established. Safe CI diagnostics now retain only quoted rule IDs from the installed axe catalog, bounded and deduplicated, alongside existing fixed metadata; they retain no private prose, DOM, selectors, titles or credentials. The existing installed axe-core 4.13.0 is explicitly declared without a version upgrade.

The hosted runner now has linked normal support, expansion and Product Gaps boundary helpers. A shared admission checks the exact active synthetic workspace, accepted plan decision, active baseline, workload/customer, owner and authorized API head/dependency. Support uses six normal commands: pending unknown readiness, exact acceptance, an open owned action, exact acceptance, a proposed deferral and its separate review. Unknown capabilities/routes remain unknown. Expansion assigns the scoped account owner, submits an unknown-benefit/use hypothesis, verifies actual `qualification_incomplete` denial under the serving commit, and exercises defer/reopen/dismiss/reopen with exact previews. No benefit, commercial outcome or external action is invented.

Product Gaps performs normal synthetic narrative/impact review, exhaustive merge/split mapping, actual queued report processing, disclosure review, both byte/hash/identity-verified JSON and Markdown exports and an explicitly unsent synthetic handoff demonstration. Pilot-local suspected-customer count is one; requiring zero there was an incorrect initial check. Separate actual primary login/session/API/database probes prove all three pilot gap IDs and the report withheld plus empty primary registry results, then revoke the exact primary session. No primary customer record is mutated. The report count check does not substitute a pilot-local statistic for a primary outcome.

The extended actual production-served owned linked HTTP case passes, including support/expansion readability before artifact withdrawal and withholding afterward (`hosted-gaps-stream-binding-20261013.json`). It exposed a real missing serving-code header on streamed gap exports. `gapExportResponse` now uses governed versioned headers while preserving review/integrity headers and per-chunk eligibility checks. Two focused stream/header tests, seven bounded HTTP denial/privacy tests and two diagnostic/privacy tests pass (11/11; `hosted-gap-stream-headers-20261013.json`). No model, research, Sandbox provider or external message is dispatched by these owned checks. Actual hosted processing and participant observation remain separate.

The expanded fixed inventory is 683 cases across 122 suites. Fresh full committed/native/CI proof is required; the 680-case checkpoint and development subsets cannot replace it. T071's remaining streaming, upload/executor, workforce, linked hosted delivery/report, partner/learning and complete receipt catalog remain open alongside managed recovery/RPO/RTO, actual-model review and human gates. The original Gateway journal remains $1.806543 with zero Context credits; its original cap/expiry and 003-only step supplement are unchanged. Required private failures/captures remain retained; completed owned test compute cleans up while the selected configuration/model/workflow stays preserved.

### Exact hosted configuration and finite dispatch count (2026-10-13)

The hosted CLI now requires a separate private configuration manifest and compares its exact environment/project/team/store, pinned images, enabled dispatcher and unchanged domain resource limits to the actual authenticated administrator diagnostic before its first journey callback. Only configured identity metadata is exposed; no token, database URL, provider permission or health claim is inferred. Missing, malformed, cross-target or changed-store readback blocks writes and revokes the original test session. The complete affected configuration/role subset passes 14/14 with no retries/skips (ten actual normal-route owned cases and four allowlist/shape/boundary cases).

Optional finite Sandbox dispatch count is bound into the existing pricing digest. Admission serializes on the existing budget row, counts all reserved/dispatched/unknown/settled calls, and only frees a count for a never-dispatched release. Settled cheaper calls cannot reset the approved count. Paid-dispatch readiness also withholds admission after count exhaustion despite remaining money. Seven owned cost-authority cases and four governed execution/provider-scope cases pass with zero actual provider dispatch. A first new health test attempted to edit an immutable fixture budget and correctly hit the existing authority trigger; the corrected fixture creates a separately bound synthetic budget instead. The prior failed capture is retained. No runtime migration, budget reset, selected-state edit or external service change occurs.

The current fixed inventory is **690 cases / 123 suites**; fresh full-source proof remains pending. The unchanged ef4ea5b checkpoint's complete 683-case run and CI are separate ongoing checks and cannot prove these later changes. Native preparation at ef4ea5b passes without paid dispatch. The private Preview-only provisioning proposal binds the re-read Vercel project and Preview schema 38 / PostgreSQL 18, one private store, 32 jobs, two deployments, a proposed additional $10/48-hour cap and backup/rehearsal before Preview migration/grants. This is a proposed authorization manifest, not actual provisioning or hosted proof. Production remains schema 55 in the same dated read-only inspection; it is not migrated or deployed.

The independent LLM judge retrospectively confirms that the old 003 accepted-source-fidelity run 2 includes an operational search-receipt UUID rather than supporting evidence, with no additional semantic failure established from available evidence. The original hard failure remains unchanged and its tool receipt cannot be authenticated from the old trace. This does not replace fresh actual-model evaluation. No new Gateway/Context calls are made; the original $25/four-credit approval, expiry, journal and 003-only 32-step supplement remain unchanged. Human operator/participant gates, full hosted/recovery/storage paths and final owned-resource cleanup remain open.

### Required-original integrity and completed 683-case checkpoint (2026-10-13)

The ef4ea5b checkpoint passes the complete local catalog: **683/683 cases in 122 suites**, with owned cleanup complete. Its private proof is `run-294f813e-425e-404c-98d6-fc1cf72f9c6b/execution.json`, source digest `704225fa9584791842d186d729824c482a548ab9f6014e8e998cd07ec298345a` and catalog digest `62b450cd66c176fcb9bbf921a56a0cc8088d328a069c9742632389d8a5c60e2a`. Protected selected model/configuration/workflow state is preserved. This checkpoint cannot prove later source. CI 38486116255 was superseded/cancelled; no complete CI pass is inferred.

CI 38489374553 reports a root typecheck failure because Next's augmented ProcessEnv requires NODE_ENV in explicit fixture maps. The pure configuration reader now accepts a partial environment and continues returning null for missing required hosted configuration. Both root and pilot typechecks pass after this correction. Other failed jobs remain unresolved until fresh CI establishes their outcomes; the composed 014 failure has empty browser diagnostics and no exact accessibility-rule cause is claimed.

Physical source/destination equality did not establish that originals required by live database records existed. A new bounded checkpoint query derives required artifact/staged artifact, workforce/staged workforce, finalized/staged report and gap-report descriptors from the current environment's existing ledgers. Copy and owned/work-controlled capture verify required key/digest/size against the physical source inventory before completing. An otherwise empty pair of stores cannot certify a missing live original. Copy also carries caller object/byte/page ceilings through every parity pass. No original is deleted or accepted fact authored by these checks.

The focused required-original suite passes **13/13** without skips or actual provider dispatch. Its owned PostgreSQL 18 case creates controlled live upload metadata, verifies missing-byte copy and encrypted-capture denial, then supplies exact original bytes and verifies cold copy parity with source retained. Hosted copy/cutover and full managed recovery remain incomplete; this closes an integrity hole rather than asserting T045/T051 complete. The fixed inventory expands to **694 cases / 124 suites** and requires fresh full-source proof.

The user explicitly authorizes the exact private Preview plan: an additional **$10 total for 48 hours**, one private Preview store, up to 32 Sandbox jobs (two concurrent, 300 seconds), two Preview deployments and backed-up/rehearsed Preview migrations/grants. The separate receipt expires **2026-10-16T00:28:11.256Z**. Implementation and recovery prerequisites remain required before execution. Production, plan upgrades, automatic top-ups and additional model allowance are excluded. No external mutation or new paid model/Context call is performed here. The original model-evaluation approval/journal/cap/expiry are preserved.

Affected copy, encrypted-candidate capture and actual Linux PostgreSQL work-capture/scheduler regressions also pass **18/18**, with no skips or actual paid provider dispatch. The native probe retains its independent cold-ciphertext/archive, matching database restore and conservative cost assertions; these owned checks do not prove hosted cadence, Workflow resumption, current denial reconciliation or RPO/RTO.

### Explicit Preview safety capture and isolated copy fixtures (2026-10-13)

The 694-case attempt at 6b56aec fails at the fenced legacy copy case after 256 passing cases. Its private run is `run-55feaedb-9990-4e97-bb04-a3d620bfb107`; the original failed suite and immutable failure receipt remain retained. Shared predecessor fixtures leave live original metadata absent from that copy test's temporary stores. The two command-copy suites now create their own disposable PostgreSQL environment per case, so their complete synthetic stores and ledgers belong to the same checkpoint. Required-original verification is unchanged. The affected isolated-copy and original 055 safety-restore subsets pass **13/13**, without skips. No original full failure is relabeled as a pass.

The Production source schema remains restricted to 55/57. A separate Preview capture schema supports its observed 38 and supported 55/57 snapshots. New safety-copy context v3 cryptographically binds Preview/Production target; the reader still accepts the exact original v2/055 context. A Preview archive key uses only the separate operator project's Preview environment, preserving existing Production key behavior. Isolated rehearsal verifies exact source schema/ledger/content before explicit forward migrations through 57, then retains quarantine and denies both existing runtime roles, including runtime_016. Unsupported Production-38 or target/context mismatches fail before restoring. The source remains read-only; no actual Preview/Production mutation is performed.

The new safety-source/Preview restore subset passes **7/7**. Its actual PostgreSQL 18 case exports a schema-38 snapshot, restores it into a separate schema-38 owned target, verifies content/ledger, applies all 19 forward migrations, and proves both runtimes cannot connect and quarantine cannot be cleared by a bare owner update. Both root/pilot typechecks pass. These are database rehearsal checks, not full matched service recovery, managed Workflow resume, hosted migration/grant or readiness proof. Full inventory is **697 cases / 125 suites**; fresh committed full/CI proof remains required.

Private Preview backup inputs now bind the rechecked exact schema-38 marker and direct unpooled owner connection to the existing independent work-controlled recovery destination. The first input preparation rejects a pooled source; deriving its standard unpooled endpoint and independently rechecking exact marker/schema/owner succeeds before the private inputs are written. Credentials are not printed and the selected environment is not edited. The separately authorized Preview cap/expiry and original model budget remain unchanged. Implementation/recovery prerequisites still govern external execution; no new model/Context call or deployment occurs here.

### Normal accepted projections and admitted hosted chain (2026-10-13)

The complete committed `82790cc` catalog passes **697/697 cases in 125 suites**, with owned cleanup complete: `run-89a55b68-e5fb-4e5b-9399-1adac660a8b4/execution.json`, source digest `fbd7021d748542bac686e82e8a671fc2f37b16476be5cbb3bf5a824bc62743f2`, catalog digest `abdd00d66672d9027f600ded599442ec63f38f837ff2e3b9e622c5892248f32e`. CI 38492820858 has 41 successful jobs and two WebKit jobs still pending at this inspection; this is not a complete CI pass.

Normal profile acceptance now prepares current governed retrieval projections inside the exact review transaction. It preserves existing eligibility, audience, quality and original-date checks; Pending proposals remain unprojected, corrections/retractions retire prior sources, and the 005 rollback switch or schemas before 28 skip new projection work. Projection creation neither embeds nor publishes shared knowledge. The source-to-plan/delivery/report owned production-served HTTP check passes **1/1** without the former owner-SQL materialization step. Focused normal-command tests pass **2/2**, covering Pending, acceptance, correction, retraction, internal-only projection and disabled intake. The broader profile/context/retrieval/hosted-role subset passes **31/31**, without skips. Its first launch was blocked by the test database fixture's connection-isolation check before affected profile cases ran; it is retained as failed development evidence, not acceptance.

The hosted runner composes normal upload, exact source review, lexical retrieval, plan/delivery/milestone review, and weekly/monthly/quarterly report publication. Source scanning/parsing and PDF/PPTX rendering require actual configured hosted jobs, pinned images, original domain IDs, serving commit, output digest and matching cost reservation. Local execution guards remain on the owned wrappers. The actual administrator diagnostic now includes the configured budget ID and scope/pricing bindings, plus the presence of an embedding key; the infrastructure-only chain refuses embedding traffic before writes. Current actual SQL admission verifies active exact synthetic workspace, schema/control state, applicable original approval, expiry, count and budget bindings before dispatch. Six configuration/admission tests pass with no provider calls. No hosted run or provider completion is claimed by these development checks.

Current fixed inventory is **701 cases / 127 suites**. Root/pilot types and documentation hygiene pass. Fresh complete committed proof is required. The hosted catalog still explicitly blocks completion pending remaining normal-record journeys, current-source SDK boundaries and hosted file faults. Managed recovery, finite non-job service envelopes, actual Preview execution, actual-model independent review, participant observations and release acceptance remain open. The original $25/four-credit model authorization and journal are unchanged; the separate authorized $10/48-hour Preview plan has not been executed.

The owned normal HTTP partner-training chain also passes **1/1** after removing its owner-SQL projection step. It publishes a contributor-authored exact guide, assigns the current partner, records that partner's demonstration, requires separate mcteer preview/verification, and proves normal original-source withdrawal removes current credit. Hosted composition now obtains independently authenticated contributor/partner sessions through the existing exact role reader while the administrator reviewer session stays active; each nested session follows normal login/logout and database binding. This composition is implemented and typechecked, not executed against Preview. Training remains distinct from delivery acceptance, skills certification and actual participant observations. The full `4fde933` 701-case checkpoint is still running and cannot prove subsequent composition changes.

Training admission passes a separate actual PostgreSQL 18 scope check: an absent grant stops before any HTTP request; an active exact grant with no ordinary source stops before role callbacks; an inactive partner organization is denied. Two earlier fixture attempts omitted required grant identity/version/provenance fields and failed before admission completed; they are retained. The final check includes all required fields and passes 1/1. This is admission evidence, not hosted provider proof. The fixed inventory is now 702 cases / 128 suites.

The read-only managed Workflow inspector now accepts the distinct Preview safety-source contract and sends its actual target in provider headers and receipts. Shared Production mutation/cancellation source contracts remain unchanged. Root/pilot types pass; no managed provider inspection, cancellation, checkpoint or resume was dispatched in this step.

### Automatic Preview deployment correction (2026-10-13)

A read-only provider inventory shows Git pushes created actual Preview deployments even though no explicit deploy CLI was invoked. The detailed timestamp audit identifies **three** feature-branch deployments after the separate Preview approval (`6b56aec`, `82790cc`, `4fde933`), exceeding its two-deployment count by one. They ran before the prepared implementation/recovery prerequisites were complete. Earlier statements that the plan had not been executed were incomplete: explicit store/job/migration provisioning has not run, but automatic Git deployment did. No full hosted readiness is inferred from READY deployment status.

The private retrospective observation retains their provider IDs, source commits and times, states that pre-dispatch admission was not verified, and keeps the full build envelope held without claiming an invoice or zero cost. The approval ID/cap/expiry/count is not reset and no additional deployment is authorized. `vercel.json` now disables automatic deployment for the exact `016-pilot-hardening` branch using Vercel's documented `git.deploymentEnabled` setting. Other branches keep their existing behavior; this is containment of feature-branch automation, not a Production rollout. Provider readback after the containment push remains required. Further exact-source Preview deployment requires a concrete additional authorization after implementation prerequisites pass.

The `4fde933` complete local run stops after **396 passed / 1 failed** in 62 completed suites: the load fixture's unscoped physical passage count doubled after normal review began preparing both audience projections. CI 38498235524 also fails pilot deterministic validation. Neither is an accepted complete checkpoint. The correction retains both audiences and the full fixed reviewed evidence population; the initial affected linked knowledge/load subset passes 2/2. A stricter distinct/physical/visible census is being verified separately, with all load timing/concurrency/error thresholds unchanged. Protected selected model/configuration/workflow state is preserved.

The stricter fixed load census passes **1/1**: 25 current issued sessions, 250 synthetic customers, 2,510 ordinary exact accepted heads, **10,000 distinct reviewed passages**, and exactly 10,000 current copies in each audience projection. There are 20,000 physical passage rows; internal retrieval may consider both copies, while partner/delivery retrieval sees 10,000. These counts are retained explicitly in the population metadata. No projection is deleted, threshold reduced or quota reset. The fixture now reads projections created by normal review instead of manually materializing them. The complete performance measurement remains separate; this preparation case is not fresh load acceptance.

The normal HTTP knowledge baseline/source/plan/delivery/report subset passes **2/2** together with the audience census. It creates/submits/publishes a sanitized baseline through ordinary reviewed knowledge routes in a never-activated synthetic workspace, reads the actual publication, and proves ordinary source withdrawal denies that publication as well as citations/report files. It refuses an activated learning workspace instead of switching learning off or inventing evaluated benefit. A first fixture attempt redundantly inserted learning state and hit the automatic workspace-initialization uniqueness guard; the correction uses the existing default row and changes no provisioner behavior. Actual evaluated improvement/release remains open.

The containment commit `2b8c385` was pushed; two subsequent provider inventories contain no deployment for it and retain the same latest feature heads (`4fde933`, `82790cc`, `6b56aec`). No further manual deployment, store, migration or hosted job was dispatched. The retrospective deployment overage and build envelope remain retained. Fresh complete source-bound validation is required for the corrected fixture and new knowledge composition.

### Current-source SDK withholding and setup diagnostics (2026-10-13)

The normal owned HTTP chain now runs the real pinned MCP consumer against its exact reviewed uploaded evidence, newly reviewed baseline knowledge, accepted plan and published report. While its credential remains authorized, normal artifact withdrawal withholds current evidence and both evidence/knowledge citation handles, knowledge, plan and report reads. Authenticated HTTP also denies the exact citation, knowledge publication and four actual rendered files. The credential is then revoked and its retained database state verified. Source boundary cases have unique identities. The affected actual linked/SDK subset passes **7/7**, without skips; an earlier scalar case-count assertion expected 20 instead of 19 and failed after the actual checks completed, then was replaced with explicit required boundary identities and uniqueness. The standalone corrected linked case also passes 1/1.

Hosted composition performs the source withdrawal only after all three roles' positive SDK reads, using a separately bound normal administrator session. It then checks the assigned partner's actual demonstration has lost current credit. Original deletion, provider replay and human feedback are not inferred. This composition remains unexecuted against Preview and does not finish streaming, reviewed workforce/allocation, evaluated learning or the hosted file-fault catalog.

The complete `90ded90` 702-case local run stops after 124 passed cases when Docker setup fails before the eight-case recovery suite can run. That suite has eight skipped assertions and a failed setup; the run is not accepted. The original private child diagnostic was removed with its owned clone, so no exact Docker failure cause is established. Both pinned PostgreSQL client images are still present. A standalone recovery reproduction initially omitted the full runner's explicit renderer and failed its rendered-binding guard (7 pass / 1 fail); supplying the same verified prepared renderer passes **8/8**. The binding guard is unchanged. The owned setup helper now preserves only a fixed safe operation/failure classification in the parent report while keeping arguments, connection strings and arbitrary error prose private. Root/pilot types pass. Fresh complete committed local/native/CI proof remains required.

### Role-specific load passages, original upload and workforce review (2026-10-13)

The complete `68ef5bd` run reaches **399 passed / 1 failed** in 65 completed suites: `load-mcp` requested a delivery passage ID for an internal consumer after normal review began producing its preferred internal projection. The existing MCP policy deliberately withholds that delivery projection when a current internal one exists. The policy is unchanged. The load check and benchmark now select the actual passage for each actor's audience. The corrected owned check passes **1/1**, covering all 25 real pinned SDK consumers and all five categories with 125 available access receipts, the same individual customer ceilings and all 2,500 partner grants. This is not new full performance acceptance.

The source uploader now follows the normal UI capability/token/finish protocol and uses the installed native Blob client with a narrowly issued client token; it refuses hosted local fallback, mismatched namespace/size/expiry and changed returned object identity. Blob token/callback responses and workforce original downloads carry the serving code version while preserving private/no-sniff response headers. The pinned Blob SDK defaults to ten retries. Hosted private Blob authorization now fails closed unless `VERCEL_BLOB_RETRIES=0`; the actual authenticated configuration readback requires that zero-retry value, and the hosted operator process also disables SDK retries. No selected environment file is changed. The upload/configuration subset passes **12/12**, budget/configuration admission **6/6**, and explicit missing/nonzero retry/storage boundaries **8/8**, all without real provider dispatch.

A new actual production-served owned HTTP check passes **1/1** through resource/skill creation, workforce CSV upload, genuine local scan/parse, all six literal cell identities, explicit resource/skill mapping and exact mcteer competency review. It reads and verifies the actual original bytes and proves no profile revision or customer retrieval source/result is created from personnel evidence. This does not establish staffing commitment, skills certification, actual participant observations or hosted processing. Hosted composition requires two additional actual workforce program/cost receipts, preserving the original 32-job total and every job/domain bound. The linked infrastructure chain now admits six expected program jobs rather than four; no job has run against Preview.

The fixed inventory is **703 cases / 129 suites**. Root/pilot types and document hygiene pass. Fresh complete committed local/native/CI proof remains required; previous failed complete runs and development subsets are retained separately. The original model ledger/authorization is unchanged. Automatic feature-branch deployment remains disabled; no additional deployment is authorized by these changes.


### 2026-10-13 complete local checkpoint and staffing runtime correction

The complete owned deterministic run at `d3e8f8b32f9e8f187bc9134201ee62b0fd760443`
passed **703/703 cases across 129 suites**. Its execution receipt is
`local-artifacts/016/run-560e4eec-ec70-4b21-88a9-314710a13cf0/execution.json`,
source digest `d506ee3729596982f55167f8f3ab99bdfc8a516c7ab0275bc39ba004b7f8ded7`,
catalog digest `8ca16e0a0341351234f9ba81344cf7609b9d5b48fef89287fb2048f316d472b7`.
This precedes the following source changes and does not validate them.

CI run `38510918804` failed the predecessor MCP benchmark because its internal
credential selected a delivery projection when both audience copies existed.
The corrected fixture selects the internal copy explicitly. The governing
`npm run benchmark:mcp` passed 100 real SDK reads in each of the five categories;
server p95 values were profiles 49ms, evidence 59ms, knowledge 58ms, plans 45ms
and reports 54ms. Each category denied its over-limit trial; quota resets and
paid calls were zero. Private output: `mcp-benchmark-correction-20261013.log`.
This is local proof and requires fresh CI on the resulting commit.

The existing owned workforce HTTP case now continues through an ordinary reviewed
profile and accepted plan, dated capacity, qualified demand, proposed allocation,
exact confirmation preview and confirmation of 60 minutes. Personnel originals
still do not become customer retrieval evidence. Its first three runtime attempts
failed at calendar approval with HTTP 503; private logs are retained. A fixed
stage diagnostic established that the built loader failed at `resolve` with a
TypeError. Obtaining Node's native loader through `process.getBuiltinModule`
restores the pinned resolver while preserving the package version and timezone
checks. The temporary diagnostic was removed. The extended case passed 1/1 in
`staffing-commitment-native-loader-20261013.log`. Explicit Next.js tracing retains
the dynamically loaded polyfill and its dependency for staffing routes. The
final extended case passed 1/1 after asserting the built calendar route trace
contains the pinned package metadata, CommonJS entry and jsbi dependency
(`staffing-commitment-runtime-trace-20261013.log`). Existing calendar resolution
and contract regressions passed 12/12; root/pilot typechecks and documentation
checks passed.

The staffing commitment is composed into the hosted linked recipe without extra
provider jobs. These are implementation/local results; no new hosted execution,
model evaluation, participant feedback, deployment or release is claimed.
Original Preview deployment overage and exhausted count remain recorded; automatic
Git deployment for this branch stays disabled. Full current-source validation,
CI, recovery/hosted acceptance and human observations remain open.


### 2026-10-14 user-directed resource cleanup and operator retirement

No Turas test/app process was running at cleanup. The selected checkout database
was verified remote. Three stopped, obsolete containers were removed:
`turas-production-rehearsal-20261005`, `turas-007-pgvector` and
`turas-007-postgres`, along with their three exclusively attached anonymous
volumes. Other projects' containers and volumes were untouched. Twenty-four
obsolete `turas-pilot-016-*` image tags were removed after checking current
container references and the three current prepared image identities.

Removed 140 obsolete cloned app/build/review/operator or test-asset directories
and ten additional build/runtime/obsolete asset directories, about 14.96 GiB
of logical file content. The clean disposable `hosted-worktree-f988` Git worktree
was removed. Preserved current prepared assets, selected store paths, accepted
validation/cost/authorization receipts, actual-model captures and recovery data.
Before/after hashes of `agent/agent.ts`, `.env.local` and `.eve/.workflow-data`
matched, including the workflow file count. No Turas containers remain.
Private exact inventories are in `local-artifacts/cleanup-20261014/`.

The Vercel project was actually named `turas-recovery-operator`, created during
016 work for independent backup/key storage. It had no Git link, deployment or
running scheduler. Before deletion, all 29 encrypted variables were retrieved and
verified, including 13 recovery keys and archive credentials. They are retained
in the mode-0700 work directory
`/Users/mcteer/Projects/turas-recovery-retained/retired-operator-20261014`,
with a mode-0600 secrets file, outside the application checkout. The project was
deleted and a fresh project list confirmed its absence and the continued presence
of the primary `turas` project. The separate Free Neon archive remained available
with zero connected projects; existing recovery backups and permanently retained
authority records were not deleted. Existing operator-project bindings are now
retired and no automatic replacement is authorized. No application deployment,
primary database mutation, hosted backup or recovery readiness is claimed.

The completed local catalog at code checkpoint `072d2eb` passed 703/703 cases.
This cleanup does not close T080's later release-time checks or any remaining
016 acceptance gates.

## Current-release integration checkpoint — 2026-10-17

Resumed against released main `34eb05c209346685446bf197dd455e5874e27aa3`
(schema 77), preserving all 77 released migration bytes and the selected root
model. The two unreleased pilot migrations are now 078 and 079. This checkpoint
is implementation evidence; it does not establish hosted pilot readiness.

- Actual owned Postgres 18 upgrade from 77 to 79: six assertions passed,
  including migration ledger, session/membership binding, provenance and runtime
  denial checks. Repeated after the final recovery provenance changes.
- Current workspace isolation: nine assertions passed. Ordinary refresh forwards
  the workspace to shared-publication eligibility; own pilot evidence remains
  current, foreign pilot evidence is denied, and withdrawal retires it.
- Focused denial-capture/accounting: seven assertions passed. Version 7 adds the
  newer ordinary/native/evaluation metadata and full unique replay identities;
  bounded snapshots exclude private text, upload bytes and credentials. Typed
  holds preserve absent post-backup operations without borrowing learning IDs.
  Immutable observations retain earlier unknown holds and later known charges,
  including subsequent recovery inheritance, and distinguish row/snapshot hashes.
- Recovery quarantine with the freshly prepared renderer: all eleven assertions
  passed, including interrupted `waiting_input` attempts. The first run used an
  older fallback renderer and failed the actual rendered-code binding check;
  that failure is retained separately.
- Current unit/contract batch: 350 assertions passed across 60 files. Root and
  pilot typechecks and documentation checks passed. Scheduler coverage includes
  independent ordinary upload/retirement cleanup and Preview worker admission.
- The first full pilot catalog run was deliberately superseded when independent
  source review found the accounting-observation gap. Partial suite receipts and
  all earlier failures remain private evidence, not a complete catalog pass.

Private receipts are retained under `local-artifacts/016/resume-20261017` in the
canonical checkout. No provider model call, hosted schema change, deployment,
new service provisioning or budget renewal occurred during this checkpoint.
Existing expired authorities and unknown charges remain preserved. Full hosted
storage cutover, matched capture/recovery, the complete ordinary hosted catalog,
actual scheduled cadence, real participant feedback and final release remain
pending under T085–T094 and their original tasks.

### Hosted storage operator implementation checkpoint — 2026-10-17

The existing storage command now supports explicit hosted admission and copy,
with an exact-source finite plan, an applicable durable Blob cost ceiling,
locked owner checkpoint, fresh adapter parity and authenticated platform/runtime
configuration readback. The shared deployment identity verifier is reused before
sending the administrator cookie. SDK retries must be disabled. Unknown charges
block further work from that budget; all copy outcomes preserve the complete
hold until explicit accounting. Original bytes are never deleted.

Seven actual isolated-database/local-byte integration assertions passed: normal
copy, changed recovery scope, revoked authority, provider failure, partial-copy
cancellation, same-operation concurrency and expiry during IO. These are local
mechanism checks, not actual Blob acceptance. Deployment identity/configuration
contract checks and root/pilot typechecks passed. Independent bounded source
review found no remaining authorization/hold bypass in this path.

The runbook requires an original configuration/inventory readback and a separate
rollback envelope admitted before locking. The copy receipt intentionally keeps
`cutoverVerified:false`: actual Blob copy, original/target configuration evidence,
required service verification and explicit unlock remain T085 release evidence.
No provider operation or budget renewal occurred in this checkpoint.

### Current-interface pilot browser reconciliation — 2026-10-17

The first owned headless WebKit attempt failed before its intended checks because
pilot fixtures still expected the superseded `Customers` heading and used
`Attach documents` for governed customer evidence. Login itself succeeded.
Current interface behavior uses `Customer Profiles` and `Customer sources`;
ordinary chat document attachment retains its separate current flow.

After correcting those fixture entry points, all 40 fixed pilot cases passed
across desktop/mobile and light/dark WebKit projects with zero skips. The tests
include maximum-size private upload transport, cancellation/expiry, foreign
completion denial, workspace selection/isolation, navigation and accessibility.
This is owned local application/native-runtime evidence, not hosted Blob or
scanner acceptance. The initial failures remain retained. The application build
also passed. Exact source digest and individual browser reports remain private.

Read-only provider/owner checks confirmed Production's released commit
`34eb05c209346685446bf197dd455e5874e27aa3`, and both existing Production and
Preview source databases at schema77 with77 ledger entries. Older private
operator descriptors labeled them55/38; new observed descriptors were retained
without altering the originals or either hosted database. Existing unrelated
Blob storage remains untouched; no pilot backend has been provisioned yet.

### Recovery allowances, transaction-bound read probe and CI repair — 2026-10-17

Six focused owned PostgreSQL recovery/accounting cases passed. They preserve
unknown ceilings, count overlapping operations once, retain the original
20,000-token allowance and reject conflicting baselines. A modeled older backup
missing its immutable allowance reconstructs the independently authenticated
baseline before installing permanent insertion fences in the same locked
transaction; repeated reconciliation remains idempotent. Runtime grants cannot
write recovery hold/observation rows. No provider accounting is invented.

The protected owner read probe passed its actual owned-database case, including
rejection of autocommit, forged token/actor, another connection, writes, changed
revision and revoked session. Concurrent owner revision/session changes time out
against the probe's held transaction/row locks. Independent review identified
the earlier autocommit gap; the implementation now requires a caller-owned
transaction and holds the operational fence plus authority rows. The capability
is removed on callback success/failure. This remains an internal mechanism, not
a required-service verification producer or evidence of supported native resume.

The first integration CI exposed obsolete schema-57 evidence guards for features
012/013/014. Those explicit current-target guards and their six unit assertions
now use 79. Native owned startup also exposed a duplicate injected execFileSync
import, then a fixture bootstrap attempted after selecting runtime privileges.
Bootstrap now runs against the migrated owned clone before runtime selection.
The actual Eve/headless-WebKit questions check passes locally, with zero paid
provider calls. Failed attempts remain preserved. Safe readiness metadata and
private wrapper failure logs now survive future startup failures. A separate
mobile learning-publication CI timeout remains under investigation.

Root/pilot typechecks and authored documentation checks passed at this checkpoint.
A combined 346-case pilot unit/contract run had 345 passes and one source-copy
identity failure while the source was being edited; it is not a complete pass
and requires a stable-source repeat. The expanded catalog has 718 named cases
across 133 suites. Full final-source local/CI runs remain required. No hosted
schema/configuration, deployment, budget, storage or Production change occurred.

### Managed-run pagination mechanism — 2026-10-17

The operator provider adapter and existing inspection CLI now perform unfiltered,
lazy, explicitly environment-bound run listing. Two complete metadata traversals
must agree and contain every application binding. Provider-only children/orphans
remain visible. Missing completion metadata, duplicate identities, cursor cycles,
empty nonterminal pages, changes and finite bounds all fail closed.

Fifteen focused unit cases pass across the provider adapter and new inventory
module; root/pilot typechecks pass. These are synthetic transport checks, not
actual provider traversal or closure evidence. Metadata parsing discards native
input/output fields. Receipts explicitly withhold atomic-provider-snapshot,
old-deployment-closure, all-runs-closed, effects-reconciled, native-resume and
restoration-ready claims. No provider operation occurred in this checkpoint.

The subsequent actual read-only Production inspection passed against the existing
schema-077 source: 18 conversation records (17 bound native runs), 15 response
attempts and 484 provider workflow records. Each full traversal required five
pages; both metadata inventories agreed. The 467 provider-only records are not
a claim that all are active or orphaned. No provider cancellation/write, model
call, configuration change, hosted migration or readiness assertion occurred.
Initial failed captures are retained: private evidence directory permissions,
then an obsolete inspector expectation for a createdAt field discarded by the
minimized metadata adapter. The inspector now consumes its validated minimized
record directly. Complete deployment closure and required-service verification
still remain unproved.


Recovery completion checkpoint, 2026-10-17: the owned PostgreSQL encrypted work
restore passed actual ledger/content/six-namespace measurements and an advisory
lock race regression. JSON-cloned proof and a different store directory were
rejected. The current-grant reconciliation fixtures passed unchanged-grant
preservation, newer revocation, credential retirement, idempotence and atomic
rollback. Those fixtures stub only the external archive reader boundary; they
do not prove a real Neon/Vercel independent denial archive or hosted recovery.
The production read-only inventory completed two stable traversals of 484 managed
runs (five pages each), including 467 provider-only records. This establishes
metadata enumeration, not cancellation, effect settlement or deployment closure.
Native question and text-preference checks passed locally with bounded route
warmup. Full final-source validation and hosted recovery/release remain pending.

The native task-state check also passed on the recovery completion source using
actual local eve and headless WebKit, with no paid provider calls. Root and pilot
type checks and the authored-document hygiene check passed.

CI receipt aggregation rejected the expanded catalog because it retained a
128-suite cap and a path pattern excluding two explicitly registered shared unit
suites. The reader now has a finite 256-artifact bound and accepts only exact
registered suite paths. A full-current-catalog regression passed, including
rejection of omissions, duplicates and foreign source bindings. The preceding
recovery checkpoint passed 350 unit/contract cases across 60 files.

The replay-fence audit now takes its current-state measurement after both recovery
fences and table locks, using READ COMMITTED. All 16 credential-denial integration
cases passed, including an actual owner transaction that disables a replay guard
while the audit waits; the audit rejects the changed guard. The audit receipt
binds its measured current-state digest and still grants no recovery readiness.

The frozen `b275bb7` local catalog passed all 718 cases across 133 suites
(run `6a71e199-67cf-46a2-a166-6a75f64e3b8e`). This precedes the recovery completion
changes and cannot substitute for their final-source full run. Canonical local
preservation verified the selected environment, 40,615 workflow files and model.
The first four-project legacy browser run passed 79/80; its sole failure set a
saved scroll offset before initial authoritative positioning completed. The
fixture now waits for initial positioning before testing the failed reload.
A separate handoff diagnostic could not start because this auxiliary worktree's
symlinked dependencies lay outside Turbopack's filesystem root; it did not reach
the handoff scenario. Repeat it from the integration tree's real dependencies.

The corrected legacy browser gate passed all 80 cases across four headless
WebKit projects, with no retries/skips or paid calls. The execution handoff
diagnostic also passed from the integration tree's actual dependency directory.
These are local owned checks, not hosted acceptance or real participant feedback.

An expanded recovery probe exposed a real canonical-read defect: profile research
metadata copied the actor object and lost the owner-only read capability. The
research reader now keeps the original authenticated actor for authorization and
checks that all separate metadata identifies that exact session, principal,
membership, workspace, token, role, login and environment. The full accepted
profile read passes while locked; mismatched metadata remains denied. All existing
probe bounds still pass, as do three normal customer-profile regression cases and
root/pilot types. This fix is later than the frozen 7a11d49 catalog run.

A normally reviewed accepted plan now joins the canonical profile recovery probe.
A separate post-quarantine case verifies the actual owned operator command using
configured credentials, a fresh short-lived session and canonical profile/plan
reads. It rejects unowned/runtime/autocommit access, wrong credentials/workspace
and wrong accepted plan revision; SQL callback failure leaves no live session.
All seven quarantines and the global lock remain. Both integration cases and
root/pilot types passed before the additional explicit SQL transaction deadline;
the final bounded command check is recorded separately. The current catalog now
has 732 cases across 136 suites; the frozen 7a11d49 run still has 731.

The final bounded owned command check passed both integration cases in 21.79s,
including the explicit SQL transaction deadline and the real success/failure CLI
receipts. No hosted target, ordinary login or required quarantine was opened.

A third owned recovery probe now prepares delivery through normal review, renders
actual weekly/monthly/quarterly reports and publishes the reviewed weekly report
before quarantine. The authenticated locked canonical report read passes, as does
the version-2 operator command; a mismatched publication revision is rejected and
leaves no live probe session. All three probe cases passed in 32.78s. The fixed
catalog now contains 733 cases in 136 suites. The composed probe suite has a
300-second process bound; original per-job and scenario bounds are unchanged.

The first Eve build after the identity handoff change failed its authored memory
module bundling check. Moving the metadata comparison into a small module with
type-only identity imports removed the runtime import cycle; the next Eve build
passed. The selected model and authored memory file remain unchanged.
Read-only Production configuration inspection found the runtime connection value
protected from decryption; it establishes no authenticated-login retirement proof.

The version-2 report probe now uses the normal authenticated browser projection
after verifying the exact current publication. It does not borrow MCP's narrower
financial-content exclusion. All three composed probe cases passed again in
33.54s, including success/failure operator receipts, and pilot types passed.

The fixed-inventory closure orchestrator passed 19 cases across its inventory unit
and actual two-owned-database integration suites. New coverage closes 53 controlled
provider runs in two batches and resumes without duplicate cancellation; detects
new identity drift; retains an uncertain independent intent and refuses retry;
rejects wrong identity digests/unsupported workflow names before cancellation; and
requires the independent archive even for verified empty inventory. Provider
responses are controlled fixtures: no actual hosted run was cancelled. Root/pilot
types passed. The current catalog contains 738 cases across 136 suites.

The current catalog contains **743 cases across 137 suites**. Four new runtime
binding unit cases passed, and all nine actual owned-database health integration
cases passed. Health observations distinguish a direct restricted runtime login
from owner SET ROLE and bind the actual database endpoint without exposing its URL.
Both cancellation commands now require a fresh authenticated deployed observation
verified against platform deployment/alias metadata before cookie dispatch.
Provider cancellation additionally verifies the original deployment project, owner
and explicit target before sending its one cancellation request. These are local
checks with controlled provider transport; no hosted run was cancelled. The full
731-case run at 7a11d49 passed independently; it does not establish a complete
pass of this newer catalog or hosted readiness.

An actual owned Postgres 18 rehearsal of released schema 077 passed in 17.39s.
It exported a read-only 77-entry ledger/content snapshot, cold restored its real
dump into a separate owned 077 target, forward applied 078/079, reapplied a newer
independently captured denial snapshot and verified both runtime roles cannot
connect. All seven quarantines remain and owner unlock is denied. This proves
the local released-schema path; no current Production cloud safety copy or hosted
restore has been performed. T094 therefore remains open. Catalog: 744/138.

Current-source CI at fa9bd1b remains incomplete and failed: the deterministic
runner stopped in the MCP load suite without a failed assertion in the emitted
reports; file corrections and native operations exited their disposable child;
one Expansion authoring browser case reached its case deadline. Failure logs are
retained privately. CI diagnostics now classify suite setup and child-process
failures with fixed signatures, approved source locations and exit metadata;
they do not publish arbitrary output, credentials or page content. Three focused
diagnostic cases and six catalog-aggregation cases pass. Catalog: 745/138.

A read-only current Production inventory at 09bfcb0 successfully repeated both
five-page traversals: 484 runs, 467 provider-only. Schema 077 correctly produced
no locked control or cancellation plan; provider writes remain zero. Actual
native operations and composer/file-steering correction diagnostics passed
locally using Eve and CLI WebKit; these do not substitute for governing CI.

The deployment lookup was corrected to resolve the origin hostname using Vercel's
documented `idOrUrl` path parameter, instead of an unsupported `url` query. Both
the hosted runner and cancellation binding use that helper, with Git metadata
requested explicitly. Eleven focused unit cases pass, including a different alias
deployment being rejected before cookie dispatch. Actual read-only platform
lookups by deployed ID and `www.turas.dev` both returned the unchanged Production
deployment. See [Vercel's endpoint contract](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url).

The c87d150 CI diagnostics locate native operations at its first thread navigation
and file corrections at the ten-second post-Send attachment-clear assertion.
The operations fixture now compiles the real thread route before browser timing.
The file fixture compiles upload handlers using only a 405 method read and scoped
404 reads of a random nonexistent upload. It creates no upload reservation and
retains the existing ten-second assertion, turn deadlines and allowance bounds.
Both complete actual Eve/CLI WebKit flows pass after these changes.

A fresh dependency audit exposed lost pre-composition remediation: source-map-js
had returned to 1.2.1 and Eve's pinned undici to 8.9.0. The narrow overrides restore
source-map-js 1.2.2 and only undici@8.9.0 to 8.10.2. Eve stays 0.67.1, the separate
undici 7.30.0 dependency is unchanged, and the root selected model is unchanged.
An isolated clean install avoids mutating the dependencies under the frozen c87
catalog run. Its actual native operations/file-correction checks, combined Next/Eve
production build, root/pilot types and 33 focused unit cases pass. Lock audit now
reports zero high/moderate and eight low findings in the existing math-rendering
chain; it is not a zero-vulnerability claim. No framework major upgrade is applied.
The relevant upstream advisories are [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
and [undici](https://github.com/advisories/GHSA-w293-vg96-wgc3).

The current c87 deterministic CI failure is now attributed: the MCP load suite's
120-second beforeAll hook expired while constructing the production application;
there was no failed SDK assertion. The fixture now returns the owned environment
before starting that build, so afterAll can clean it even when setup fails, and
uses the existing hosted-sdk suite's 240-second production-build setup bound.
The complete environment/process remains capped at 660 seconds; the SDK population,
125 positive category reads, 2,500 grants and all workload/job limits are unchanged.
The corrected actual owned SDK case passes in 190.52 seconds with the isolated
patched dependency install. Pilot types and documentation checks pass.

The frozen c87d150 catalog stopped after 654 passed cases and one stale command
unit failure: its unknown-flag input still had the earlier eleven arguments.
The input now includes both required runtime/session files before the unknown
flag, preserving its assertion that rejection happens before any protected read
or platform call. All five command unit cases pass. This is not a full catalog
pass; its exact failed report and process receipts are retained.

The general CI failure reaches the thirty-second deadline near the end of the
partner's acceptance/retraction/rejection journey. That multi-stage case now uses
the adjacent review test's existing sixty-second bound; five-second assertions
and all domain limits remain unchanged. An owned cold-development diagnostic also
exposes a competing post-login navigation. Successful JSON login now makes one
authenticated document replacement and keeps its button busy until navigation,
rather than queuing client replacement plus refresh. This preserves the form and
server-side origin, return-path, session and role checks.

The entire normally reviewed partner journey passes with the built production
app in 4.6 seconds and warmed development routes in 17.0 seconds. Two cold local
development diagnostics failed and remain retained: navigation interruption, then
a return to login despite a live cookie and successful authenticated session read.
They are not silently reclassified as passes. The production/warmed results do not
prove cold-development startup reliability or hosted behavior. Root/pilot types,
nine auth/failure-privacy unit cases and documentation checks pass.


### Native legacy login restoration and built UI checks (2026-10-18)

Further inspection of `../turas-back/app/login/login-form.tsx` and its login route
shows the working mechanism is a native form POST with the cookie on the server's
303 redirect. That mechanism now replaces the preceding experimental JavaScript
document replacement. The existing field styling, workspace selection and server
origin/return-path/role checks remain. Native unavailable storage returns a private
303 error page with no cookie; JSON clients retain the unavailable 503 contract.
Operational diagnostics contain controlled phase/category/SQLSTATE only.

An actual owned production Next/Eve build passes, followed by **16/16 headless
WebKit checks in 28.7 seconds** across all four projects: mcteer, panel and partner
login/logout, plus exactly one form credential POST, 303 `/s` redirect, positive
session and logout. No request routing or simulated success is used for these
positive cases. The separately mocked unavailable UI fixture remains a contract
check. Five failed-storage/privacy cases pass, as do root/pilot types and all
**356 pilot unit/contract cases across 61 files**. The first unit attempt retained
355 passes and a source-workspace failure because the new authored files were
untracked; staging them restores the existing exact-source comparison without
changing its guard.

The CI general UI job now uses its already-built application through a restricted
local production test supervisor, which owns Next, Eve and the three unchanged
worker entrypoints. Default development supervision is unchanged. The owned
login run recorded initial maintenance wrong-version/missing observations and
workforce lane warnings; its browser success does not establish healthy workers,
full readiness, a hosted deployment, or cold-development reliability. A later
supervisor adjustment sends internal worker traffic directly to its owned native
origin, matching existing development supervision; the browser run precedes that
worker-only adjustment.

CI at `02e5175` passes six of seven legacy parity gates, including WebKit, but the
native operations gate times out waiting for the intervening ordinary reply.
That failure remains open. The complete current-source catalog and final CI have
not passed, and Production/schema 077 are unchanged.


### Chat polling, native fixture ownership and engagement lock order (2026-10-18)

The built-app four-project history/scrolling case now also verifies that a 404
clears the live chat/composer and stops history polling through ten seconds of
browser clock advancement. All **4/4 cases pass in 37.7 seconds** with actual
application authentication and explicitly substituted native wire/history failure
responses. This is UI contract evidence, not managed-provider execution. Temporary
history failures still recover normally; terminal denied/context-changed live chats
stop both history and attempt polling. The final stale-attempt guard was added
after this focused browser run and requires final-source matrix verification.

The actual unpaid native operations/knowledge catalog passes after closing browser
pages only after their complete scenario assertions and scoping deterministic
model tool results to their submitted attempt. The original parked approval,
intervening turn, fresh-owner decision, other-member refusal, changed-source
rejection and all five governed knowledge actions remain required. The failed
attempts are retained: one reached the knowledge application stage before a native
statement timeout; another timed out during the changed-source execution read.
The passing native run still contained an actual Postgres deadlock, so it is not
accepted as deadlock-free or as final-source proof.

Its retained owned Postgres log identifies opposite lock order: execution waits
for an engagement while the composed ordinary read holds it and waits for a plan.
Delivery-assignment reads now take the shared plan prefix before the engagement,
matching execution's plan-before-engagement order. The actual domain regression
passes **1/1 in 3.34 seconds**. A separate owned negative check removes only that
new prefix and the same regression rejects the old order with a NOWAIT engagement
lock failure. It observes actual blocking backend identities, refreshes Postgres's
transaction-cached statistics and preserves all domain lock/statement deadlines.
The earlier setup/statistics-witness failures are retained. No runtime migration,
provider call, authority bypass, source withdrawal relaxation or timeout increase
is involved. Current native/full CI and the separately failing Product Gaps UI
matrix remain under verification.


The actual built released-main follow-up exposed an unsupported WebKit fixture:
`route.fulfill` rejects303 redirect responses. The unavailable login UI contract
now reads the real error page directly; server route tests still assert actual
native303/JSON503 failure contracts and no cookie. The first focused attempt's
24passes/4fixturefailures are retained; the corrected focused release branch passes
28built WebKit cases. This does not yet establish a new complete016 matrix.

The local Product Gaps browser run passed84cases across four projects but its
controller correctly rejected source drift during the run. It is retained as
case-level evidence only, not an exact-source matrix pass. A focused018 release
branch now carries the user-facing login, polling and composed-read lock fixes
from released main without including unfinished016 schema/infrastructure changes.
Its actual native operations/knowledge gate passes with independently retained
owned Postgres diagnostics reporting zero deadlocks and statement timeouts. This
is not hosted recovery or authorization to merge draft PR32 early.


### Complete project deployment inspection and full checkpoint (2026-10-18)

The frozen integration checkpoint `5b27e49` passes **745/745 cases across 138 suites**
in `run-d7bd565c-88e9-4ac6-96b2-cdb610b39cb2`, with process exit 0 and owned cleanup
complete. It retains `fullPilotReady:false` and predates later polling/read-lock,
deployment-inventory and environment-supervisor changes. It cannot establish those
later source checkpoints or hosted readiness.

The existing read-only managed-workflow inspector now also inventories the entire
project deployment collection at a fixed cutoff, across Preview and Production,
using bounded pages/identities/metadata and two equal traversals. Workflow-target
headers and branch/state/target filters are omitted for this collection; output
strips unrelated fields. Unlisted run-referenced identities remain unverified,
not silently retired. Seven new cases join G06; the registered pilot catalog is
now **752 cases/139 suites**. All 15 focused new/provider cases pass, followed by all
**363 pilot unit/contract cases across 62 files**. Root/pilot types and docs pass.

The actual operator run `managed-inventory-production-20261018-6` passes against
the selected schema 077 source: 18 conversations, 15 attempts, 484 managed runs and 561
project deployments, with six deployment pages per traversal and zero unlisted
run-referenced deployments. Application bindings and protected source remain
unchanged. Provider writes/model calls are both zero. Control and closure plan
remain null; deployment protection, retirement authority, old-deployment closure
and recovery readiness remain false. Private original observations are retained.
The earlier 44-deployment reference inspection is correctly narrower than this
complete project collection.

The test-only production UI supervisor also loads Next's effective production
dotenv configuration before checking local databases and disabled provider keys.
Three child-process tests pass, including dotenv precedence, file-loaded credential
rejection without value disclosure, and explicit safe shell precedence. Its
`@next/env` test dependency matches Next 16.3.8. Default development and production
application behavior are unchanged. The frozen 745-case result predates this guard;
final current-source verification remains required.


### Complete 152ecfa local catalog and predecessor verification

Commit `152ecfa996180da870f56ece52a63730dcf0ebcb` passes **752/752 cases across139
suites** in `run-cda37731-6ae6-4eba-93d4-b406d1ac3938`. Its actual process exits0
and owned cleanup completes. The first invocation used a nonexistent preparation
path and stopped before executing a case; that failure remains preserved. The
passing invocation uses the existing integration-worktree image preparation, with
verified scanner/parser/renderer identities and unchanged domain limits.

The same frozen source passes the complete regression composition in
`regressions-24f1fc05-cf0a-43b6-8cde-ada1d33dd752`: all eight predecessor groups,
all39 current079/Postgres18 cases with no skips or retries, and all40 fresh pilot
WebKit cases across four projects. The final receipt records three passing groups,
paidCalls:0 and hostedProof:false. The process exits0 and cleanup completes.

Released main34eb05c is already an ancestor of this checkpoint. No redundant merge
is needed. T092 stays open for final release/current-main reconciliation, including
the separate018 session/read-lock follow-up once released; later documentation or
source changes cannot adopt these receipts as their own exact-source acceptance.
No additional release or hosted tasks are checked from these local results.

A fresh read-only managed inventory at this source finds484 runs and563 deployments
with two six-page traversals and no unlisted referenced deployments. Application
bindings remain unchanged; provider writes/model calls remain0. This observation
has a fixed cutoff and predates the later focused018 deployment. Protection,
retirement, paid-effect reconciliation and full recovery readiness remain unproved.

Separate018 PR43 validates its native login/polling/read-lock fixes from released
main without016 schema changes. It reuses an existing backed-up isolated real-data
Preview for its unchanged strict profile comparison, preserving the general
Preview's newer research and original holds. Its passing hosted profile check and
all-seven legacy CI result do not establish016 hosted recovery, current-schema
cloud capture, model catalogs, scheduled cadence or actual participant acceptance.
Production, original protected state, budgets and unknown charges are preserved.


### Read-only Gateway credential scope checkpoint

The installed Vercel CLI59.19.0 supports the documented
[read-only key-list command](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets).
A selected-team JSON inventory returns one ai-gateway key, with no project binding
and no finite expiry; no leak is reported by that metadata. Raw key identifiers,
masked-key metadata and authentication remain private. No key was created,
updated, revoked or used for a model request; no budget or spend limit changed.

This is not proof of exclusive Turas use, complete historical credential closure,
OIDC retirement or any original request's charge. Other consumers remain
unverified, so this observation grants no rotation/retirement authority and
reconciles no unknown hold. The documented
[Gateway authentication methods](https://vercel.com/docs/ai-gateway/authentication-and-byok)
also include OIDC, which must be accounted for separately. T087/T091 remain open.

### Completion resumption against released main — 2026-10-18

The user requested completion of the remaining pilot work. Preserve the unpushed
project-deployment inventory commit and merge released main `f8d196f`, including
PR43 native login/read-lock fixes, PR44 first-send/display/handoff fixes and PR45
customer pagination/recent-history/checked-product fixes plus their release record.
Login conflict resolution retains the pilot workspace selector and server-bound
membership, failure redirects preserving the selected workspace, released native
form/cookie behavior and the released screenshot regression. Pilot fixture
ownership and its pinned accessibility dependency are retained. No selected model,
local environment, durable workflow data, schema or hosted configuration is changed
by this integration. Root typecheck and documentation hygiene pass; five focused
login failure-contract cases pass. Fresh full pilot, predecessor, browser and CI
proof remains required for this newly composed source.


### Default-off pilot login and current picker fixtures

Completion review found that the pilot selector was always rendered and direct
pilot login had no disabled-first admission switch. `TURAS_PILOT_LOGIN_ENABLED`
now defaults off, hides the selector and rejects pilot authentication server-side
before membership lookup. Explicit enablement still requires current assigned
membership; primary login is unchanged. Existing session revocation remains a
separate current-membership/session operation. Owned runners opt in only in their
isolated generated environment. Nine actual owned session integration cases and
two form-rendering cases pass, plus root typecheck and documentation checks.
These three additional cases are registered in G02 (755cases/140suites total).

The first composed four-project browser attempt passes five workspace cases but
fails the five upload cases in the first project: a pilot-only fixture still used
`selectOption` on the released searchable customer button. Its failures are
retained. That fixture now uses the same accessible picker helper as the released
UI tests. A fresh complete browser matrix remains required; neither these focused
checks nor historical catalog passes establish hosted readiness.


The corrected browser matrix passes all40cases across desktop/mobile light/dark
with no failures, skips or retries. Captures were inspected. Its receipt binds
working-tree digest `1a6e630c78fc5f181a3a05f6fb97c358f1143927aaf124e6d048a2b84fde9ca0`
and base commit5083ee2, before the subsequent hosted-authorization edits. It is not
final-source hosted acceptance or a managed scanner proof.

### Separately bounded Production hosted admission

The hosted driver no longer requires every execution to use the historical
Preview-only envelope. A version2 authorization binds an actual attributable
instruction, exact target/source/catalog and separate partitioned finite cap,
retaining32jobs/two-concurrent/300-second bounds and no model allowance/top-up or
billing change. Production cannot reuse the version1 Preview grant. Paid admission
requires the actual matching database budget digest/expiry/scope/pricing and rejects
unknown/exhausted accounting before dispatch. No approval is inferred from JSON.
Six contract cases pass, including source/target drift, expired/future/widened
windows and caps, and attempted legacy promotion. The new cases are registered
under G11; combined catalog is762cases/141suites. Actual hosted execution and its
concrete user-authorized envelope remain separate pending requirements.

The actual owned hosted-admission integration suite passes3/3, including a
Production-target authorization whose digest matches a separately provisioned
synthetic database budget. Missing authority, changed source and mismatched bytes
are rejected; the suite reserves/dispatches no paid work. This is local admission
proof, not an actual Production run or budget approval.


### Independent review correction and aggregate restore controller

Independent technical review found that the new authorization verifier used the
canonical recovery digest while the existing hosted runner/budget used
SHA256(JSON.stringify(raw)). The verifier and runner now share the original
insertion-order JSON convention. The regression independently calculates that
SHA256 and distinguishes it from the canonical recovery digest. All6authorization
unit and3actual owned admission cases pass; a second independent review finds no
remaining blocker. Existing version1 budget identities remain intact.

The complete composed273ad0b catalog fails at isolated-restore: its default120s
whole-file controller sends SIGKILL before the fixture's independently allowed
210s setup and three210s cases can finish. Original diagnostics are retained.
The same unchanged restore suite passes3/3 directly in61.84s under its existing
step/domain timeouts. The controller now has a registered finite900s whole-file
allowance covering those declared phases, without extending a hook, test, database
or restoration deadline. Three controller-bound/unknown-suite tests pass. The
registered catalog is now765cases/142suites and still needs a complete fresh run.

The killed child left one owned synthetic database container. Its exact ownership
label/database name and zero client backends were verified before removing only
that container and its anonymous volumes. Cleanup evidence is retained; selected
local state and sibling project directories are unchanged. Directory cleanup is
explicitly deferred until pilot hardening is finished, per the user's instruction.


### Released-schema failure coverage and independent runbook exercise (2026-10-18)

The existing positive schema077-to079 owned rehearsal is retained. Its expanded
three-case suite now also rejects a tampered dump before changing the target and
keeps both runtime roles unable to connect after accepted-content verification
fails. No migration through079 is attempted after that failure; the source ledger
remains077. All three actual disposable PostgreSQL18 cases and three controller
bound cases passed (6/6,66.33s). The controller allows a finite900s whole-file bound
for the declared210s setup plus three210s cases; per-case/domain limits are unchanged.
Private output: `local-artifacts/016/released-safety-077-expanded-private.log`.
The registered inventory is now767cases/142suites; the currently running complete
765-case checkpoint at1b25f6a predates this change and is not final-source proof.

The separately delegated technical reviewer exercised17 tests including all three
actual isolated physical-restore cases, backup verification, schedule admission and
physical timing. The documented schedule-check command also passed against an
owned synthetic schedule inventory. It retained `scheduleExecutionVerified:false`
and `restorationReady:false`. Private independent commands/results are under
`local-artifacts/016/reviewer-runbook-1b25f6a/`. Its two documentation findings
were corrected: current safety-copy v3 schema/target support and read-only managed
Workflow inspection schema support now match the implementations. The reviewer
performed no hosted write, model/provider call or source edit. This is attributable
independent technical review, not human participant feedback, actual backup cadence,
full recovery, incident RPO/RTO, or release approval. Those tasks remain pending.


### Complete long-suite controller audit (2026-10-18)

The delegated reviewer found additional concrete whole-file bounds below their
already-declared setup/case phases. For example, schema055 restore fell through
120s despite a210s setup plus five210s cases; work/Preview restore each allowed
420s inside120s; owned database restore allowed720s+420s inside720s. The controller
now has explicit finite overrides for the audited long suites, using their
existing declared totals plus startup/cleanup margin. Unregistered override names
fail at import; short suites retain120s. Domain, SQL, hook and per-case deadlines
are unchanged, as is the complete catalog's independent one-hour environment
limit. Controller tests pass3/3 and root typecheck passes. This removes contradictory
parent timers; it does not suppress failures, retry suites, establish performance,
or guarantee cleanup after a hard kill. The fresh full catalog is still required.

Native unpaid quality preparation at committeda2b6475 passed the actual installed
native pre-provider budget admission check with nine applicability catalogs,
zero paid dispatches and no real provider credential. Private receipt:
`local-artifacts/016/quality-preparation-a2b6475/preparation.json`. Later controller
source changes require fresh preparation before paid evaluation. Independently
reading the original shared journal showed131 historical dispatches,1806543
micro-USD charged, zero held/unknown, no Context dispatch or consumed credit,
and admission held under the expired original authorization. No allowance,
expiry, event, historical failure or provider settlement was reset.


### Partner review focus race found during current CI (2026-10-18)

Atd83e6ed, CI run39181383855 job117835027532 failed the partner-learning
WebKit journey at its90s test limit with focus/visibility signatures. The original
private diagnostic is retained at
`local-artifacts/016/ci-d83e6ed-partner-webkit-failure-private.log`.
Investigation found that canceling an exact checkpoint preview scheduled a single
animation-frame focus callback; an overlapping access refresh removed the button
before that callback, leaving no retained focus intent. This does not establish
that it was the only cause of the original CI timeout.

The regression retains ordinary Cancel coverage, then focuses Cancel, cancels
and triggers the real window-focus access refresh with100ms latency on the real
assignment GET. It substitutes no authorization response or domain data. Against
the unchanged component, desktop-light fails exactly at the forced-refresh focus
assertion (partner-learning.spec.ts:33:502); original failure retained in
`local-artifacts/016/partner-cancel-refresh-baseline-private.log` and its013 UI
report. The fix retains only a ref-bound focus intent through the transient
`view=null`, waits for an enabled committed Prepare button, and binds the intent
to assignment/version, checkpoint, attempt/revision and both actor identities.
Access-cleared events, a different known scope or deliberate focus elsewhere
retire the intent. Projection clearing, denied-state handling, abort/generation
checks and server/domain authorization remain unchanged.

The independently reviewed fix passes all12 tests in that complete development
file across the four CLI WebKit configurations, without failures or skips.
Private log: `local-artifacts/016/partner-cancel-refresh-fixed-private.log`;
013 source digest813651817a97256db2f0b3d0cbc124866cb94e31d24d2415f208b8a9c78983d6.
This diagnostic correctly emits `acceptance:false`; the complete five-file partner
UI acceptance and current-source CI/composed regressions still must pass.
Root typecheck and diff checks pass. No hosted write or provider call occurred.

Current read-only platform observation separately confirms Production remains
f8d196fad60a96698656188074d0abe668bc7991, PostgreSQL18, exact schema077/77-entry
ledger. The historical backup destination fails current binding verification and
is not adopted. A fresh repeated metadata inventory contains507 managed runs and
576 deployments (487 provider-only runs); it verifies neither old-deployment
protection nor paid-effect reconciliation. Private observations are under the
root checkout's `local-artifacts/016/resume-20261018/`. No schema, credential,
archive, traffic, deployment, run state or existing budget was changed.

### Complete historical catalog and current regression composition (2026-10-18)

The frozen1b25f6a catalog completed all765 cases across142 suites with zero
failures. Private execution receipt in the pilot-finish checkout:
`local-artifacts/016/run-0ef29aac-4eb4-4bc1-b533-c58b349078b6/execution.json`.
Source digest8b6ac19c10dc6ca62751a674adbb2d554d13e46bb4245370d3787ad406c3564e,
catalog digesta7c6881ec05c17389d5292cd5d8bb2cd2f6f2a001539bf725dd02a1abe411caf.
This predates the two additional released-schema safety failure cases and the
partner focus correction; it does not replace the current767-case catalog.

At committed069c1a7, the complete composed regression command passed all eight
015 predecessor groups, all39 current schema079/PostgreSQL18 checks and a fresh
40-case/four-project pilot WebKit run. Source digest
97d5eba51c2a8f568883b1e5bd4386ae28636ca97ff710607ca90eb1a7a1e2af,
catalog digest4dc3044a56434369bdc8fdde9ebaf36e4673f134f6ccb3a9b3046b50799dd5b4.
Private receipt in the recovery checkout:
`local-artifacts/016/regressions-d21fb284-727a-419d-9557-d1349c4e2860/completed.json`.
The complete partner UI gate also passed48/48 across all five files and four
projects. All these checks made zero paid calls and establish no hosted proof.

CI run39182896771 job117839587547 separately failed the014 draft journey's
unchanged serious/critical Axe assertion with `document-title`. That failure is
retained in `local-artifacts/016/ci-069c1a7-pilot-regressions-failure-private.log`;
it did not recur in the complete local predecessor gate. The journey now also
requires the authored `Turas` document title after destination URL/content checks
and before Axe. This adds a bounded metadata-readiness assertion without sleeps,
retries or rule exclusions. Static root metadata remains unchanged. The available
evidence does not establish the cause of the original missing-title observation.
Fresh validation of this assertion and current-source CI remain required.

The frozen38c72fa learning UI gate subsequently passed all32 cases in all five
journey files across all four WebKit configurations, zero failures/skips and
`acceptance:true`. The014 source digest is
179e9a045e4de65d7703e5890cf17ae65f4f8767858d1cf9e1f3d46ed42f5bb1.
Private recovery-checkout log:
`local-artifacts/016/learning-metadata-38c72fa-private.log`.
The earlier exploratory32-pass run was rejected by its source-change guard after
a comment edit and is not an acceptance receipt. Both observations are retained.

### Original evaluation journal continuation implementation (2026-10-18)

An explicit continuation path now binds an independently attributable approval
to the original budget, canonical journal root/head, prior authority digest and
exact current source. Only an already expired time window can be continued, for
at most24 hours. No money/credit cap field is accepted. A chained event retains
all original authorization/event bytes, charges, provider identities, consumed
credit dispatches and unknown holds. Pending or unknown effects prevent
continuation; a changed source, copied root or stale approval cannot dispatch.
Old runtimes/attempts are invalidated. The live controller requires the existing
original journal explicitly and retains all current full-catalog/native-admission
prerequisites; the runtime independently rereads derived current authority.

This implements an operator mechanism, not an approval. No real continuation
record was applied, original journal changed, allowance renewed or provider
called. The actual expired allowance and its historical charges remain unchanged.
Four added named accounting cases bring the registered catalog to771 cases in
142 suites. Fresh full-source validation and actual applicable approval are still
required before paid evaluation; T069 remains pending.

The complete pilot unit/contract set passes378/378 across65 files, including all
14 budget cases and28 budget/Gateway/Context accounting cases. Root and pilot
typechecks, authored documentation checks and diff checks pass. The delegated
reviewer found no implementation blocker. These are unpaid local checks; they
do not renew authority, prove semantic model quality or complete hosted recovery.

### Backup operator project discovery and current task authority (2026-10-18)

Atac31bb1 both exact local native-operations/knowledge and native-staged-4 gates
passed with zero paid provider calls. The preceding38c72fa CI failures remain
retained separately: operations timed out at its intervening-turn assertion;
staged-4 reported a proxy socket hangup and its provider-failure settlement limit.
The local passes do not establish their original causes. The complete771-case
ac31bb1 catalog remains source-bound to that frozen worktree.

The current operator package built locally, but its actual `eve link` invocation
failed project discovery before any cloud project creation: the generator placed
Eve only in development dependencies, while the installed CLI requires
`dependencies.eve`. The generator now places the same pinned0.67.1 dependency
there. Its existing eight-case work-backup suite passes, including the installed
project detector on the actual built package. Root typecheck and diff checks pass;
independent review found no blocker. A successful build alone did not prove link
or deployment, and no hosted scheduler is claimed from this correction.

In response to the concrete$2/48-hour dedicated backup operator proposal, the user
instructed proceeding without asking for task spending below$100. That actual
instruction is privately retained with a$99 aggregate ceiling and finite
allocations; historical charges and holds remain separate and unchanged. The
bounded operator recreation is now authorized. No original approval was edited,
real continuation applied, billing plan changed or top-up enabled by this record.
Every actual service budget still requires its exact target/source/pricing bound.


### Retained archive plan and recreated operator binding

The corrected cf6f930 package successfully linked through Eve to a new dedicated
operator project. The retained archive resource was connected only to that project
and its Production environment. Fresh credential readback matches the retained
Neon project. Actual inspection found the existing Launch plan; no plan change,
operator deployment, scheduled execution or archive write was performed.

The original v1 destination remains Free-only. A strict v2 destination binds the
explicit observed Free or Launch plan and rechecks it against platform metadata,
while preserving independent project, ownership, resource attachment, credentials
and 400 MiB capacity boundaries. Six focused destination cases pass, including
plan drift and foreign attachments. Plan identity grants no spending authority.
The current catalog contains773cases; the separate ac31bb1 run remains historical.


### Actual current Production077 safety copy and owned079 rehearsal

At fbab7fe, the live v2 destination verification passed after the recreated
operator's unexpected Git connection was removed and its absence independently
read back. The archive contract installation and400MiB capacity matched.
The first noninteractive disconnect returned without changing the connection;
only subsequent readback after the explicit confirmed CLI operation established
absence. Neither exit status nor the initial configuration was treated as proof.

A fresh read-only Production077 snapshot produced26,065,109encrypted bytes. The
command retained a new independent encrypted key in the dedicated operator,
copied the ciphertext, cold-downloaded it and authenticated its plaintext digest.
The separately invoked owned PostgreSQL18 rehearsal authenticated that retained
archive and key, verified all77source ledger entries and application content,
rehearsed078/079, quarantined authority and verified locked control/runtime
connection denial. It destroyed only its disposable target. Production was not
migrated, fenced or otherwise changed. Private receipts are
`resume-20261018/production-077-safety-fbab7fe/database-safety-copy.json` and
`resume-20261018/production-077-rehearsal-fbab7fe/rehearsal.json` in the core
checkout's ignored artifacts. T094 is complete. This remains a database safety
copy, not a matched service backup, current-denial reconciliation or full recovery.


The first disabled operator deployment attempt failed before deployment because
the generated project configuration and Build Output API both declared the same
cron. The generator now leaves cron ownership with the built output alone; the
actual package build test asserts one exact12-hour route across both files.
No scheduled execution or successful deployment is inferred from that failure.


### Disabled dedicated operator deployed and HTTP boundaries verified

The corrected280343b package deployed successfully through Eve to the independent
operator project. Fresh platform reads bind the ready Production deployment and
its alias to that operator, with no Git connection. Protected Production-only
configuration retains an independent random cron secret and execution flag0;
source credentials and enabled capture configuration were not installed.
Four actual HTTP checks pass: anonymous backup401, authenticated disabled503 with
`backup_disabled`, POST405 and unknown-path404. These are hosted boundary checks,
not hosted Function-byte inspection, a successful capture or scheduled cadence.
The private receipt is`resume-20261018/operator-280343b-disabled-http-private.json`.

An intervening deployment command was started from the wrong checkout and stopped
immediately. Subsequent platform reads show the application Production commit
still f8d196fad60a96698656188074d0abe668bc7991 and its newest deployment predating
that command. No application deployment resulted. The successful operator command
ran from the dedicated prepared package. Its default post-deploy development
environment pull wrote only inside that private package.


### Snapshot-bound current-release preservation

Separate readonly observations found Production's private backend still defaults
to local storage, with no Production Blob token/store binding and zero required
private-object references. This was not retroactively attached to the earlier
backup or treated as physical-byte or worker-drain proof.

Current077/079 safety captures now use an authenticated v4 context. It binds the
required-object digest/count/bytes, complete actual lease-column inventory and
active lease/upload/dispatch counts to the same read-only repeatable-read
transaction exported to pg_dump. Cold restoration recomputes the observations
at the authenticated capture time before migration. Historical v2/v3 contexts
remain unchanged. External admission, private-byte integrity and full-service
checkpoint claims remain explicitly false.

The first six-case integration pass covers077 snapshot stability despite a later
lease insertion, writable/isolation rejection,079 forward restore and altered
boundary rejection behind the runtime fence. Independent review found a missing
mid-scan cancellation check; the existing operator signal is now checked before
each query, and a deterministic regression proves no subsequent query is issued
after abort. Sixteen focused contract/deadline/cancellation cases pass. Final integration after that correction passes all seven cases across the
three files, including the existing missing-required-original denial. Both
TypeScript projects, documentation and diff checks pass. An actual v4 Production
capture remains pending. The current777-case/142-suite catalog requires fresh complete proof.
The released-restore whole-file ceiling covers setup plus four210-second cases
and cleanup; per-case, SQL and domain limits are unchanged.

T074 now states the implementable compatibility order: preserve the current077
release under an external maintenance perimeter, install078/079 before dependent
code, then prove the079 matched-service backup/recovery/cadence mechanisms before
pilot readiness. This corrects the previous pre-installation scheduling cycle;
no readiness, recovery, current-authority or participant gate was removed.


At d95c72e the actual Production077 v4 capture passed cold download/decryption.
Its authenticated snapshot reports zero required objects/bytes, zero active
leases, zero pending uploads and zero dispatching deliveries. A separate owned
PostgreSQL18 cold rehearsal recomputed that boundary successfully before078/079,
verified copied content/ledger, retained runtime CONNECT denial and locked
control, and removed the disposable target. Private receipts are
`resume-20261018/production-077-safety-d95c72e-v4/database-safety-copy.json` and
`resume-20261018/production-077-rehearsal-d95c72e-v4/rehearsal.json`. Production
remains077. No external-admission, managed Workflow, private-byte or complete
service recovery proof is inferred from these observations.

Fresh repeated metadata inventory finds576deployments and79aliases; five allowed
hosts independently resolve to current Production f8d196f. Preparation acquired
bypass cookies for649of650old hosts, with one redirecting host lacking a cookie.
No firewall configuration was applied. Fresh managed metadata retains507runs,
including171running; the21application conversations contain18attempts, ten bound
runs still running and one conversation unbound. No run was cancelled, initial
delivery retried, charge released or workflow closure claimed. The HTTP fence
proposal remains separate from effect reconciliation and full recovery.


The frozen ac31bb1 complete catalog stopped at its independent one-hour
environment watchdog:130 suites and722of771cases passed before the next suite
could start. No complete execution receipt was produced; this remains failed
partial evidence. The complete-catalog orchestration ceiling is now90minutes.
Individual suite, test, SQL, recovery and60-minute benchmark limits are unchanged.
A fresh complete run of the current777-case catalog is required.

The owned restored-target capability pins the actual loopback container, owner
connection and cluster identity, then binds the actual measured restore proof.
Scoped recovery configuration supports canonical authenticated reads of the
restored source without changing the selected process environment. Detached
configuration scopes fail closed. Ten focused integration/configuration cases
pass, including canonical accepted-profile reads, forged capability denial,
configuration isolation and revision drift. This is a recovery foundation; it
does not establish restricted HTTP service, effect reconciliation, complete
verification or permission to unlock the restored target.


CI at3983853 exposed an eve authored-module build regression: normal server
configuration imported the recovery operator module, whose dynamic imports made
the authored bundle contain multiple chunks. The standalone web build had passed.
The lightweight AsyncLocalStorage accessor now lives separately from the owned
operator constructor, leaving normal configuration free of restoration imports
and authored bundle splitting. The exact-source eve build passes after this
correction; the earlier CI failures remain recorded and require fresh CI.


The owned restored-runtime foundation rechecks the actual measured bytes and
closed grant boundary under recovery locks, applies authored runtime grants and
opens only a temporary direct restricted database connection. A nonblocking
owner-held database lease excludes separate capabilities for the same target.
The positive connection and control/DDL denials, pre-COMMIT rollback, lost COMMIT
acknowledgment, callback failure, cancellation and same-database lease exclusion
pass in the expanded existing work-restore case. Ten integration/configuration
cases passed; the final measured-integrity correction also passes the actual
work-restore integration case. Root/pilot TypeScript, web/eve builds, documentation
and diff checks pass. Independent review found no remaining blocker. No URL or
owner credential is exposed to the callback. Both runtime logins remain closed
afterward. This does not prove restricted HTTP service or complete T088 recovery.


The3983853 complete catalog failed owned production-build setup in load-mcp
after64successful suites/402passing cases. Its MCP case was not exercised and no
passing execution receipt exists. This source predates the65b0d98 authored-bundle
correction. A new final-source complete777-case catalog remains mandatory.

The fixed maintenance profile path now has actual HTTP proof through the direct
restricted runtime of an authenticated owned restore. Ten final integration/config
cases pass, including ordinary-route denial, missing session/secret, exact accepted
profile, concurrent reservations/finite ceiling, owner-transition ordering, atomic
concurrent retirement, expiry and wrong database binding. Twelve operational
admission cases, six properly provisioned055-to079/repeat-migration cases and
three rendered-report/owner-recovery cases also pass. An initial broader invocation
failed because it lacked the outer owned migration fixture and prepared renderer;
those exact checks were rerun with their real prerequisites, without skips.

Root/pilot TypeScript, web/eve builds, documentation and diff checks pass. Independent
review found and corrected lock-upgrade/fence-order issues and required explicit
admission-before-session locking. Runtime retains SELECT-only control access.
The unshipped079 migration/manifest adds owner-controlled HTTP admissions;001–078
are unchanged and Production remains077. Earlier079 receipts retain their original
source/manifest identity; a fresh exact-manifest cold rehearsal is required before
release. The issuer currently supports owned drills and profiles only. No private-
byte service, complete T085/T088 recovery, hosted acceptance or unlock is claimed.


### Canonical restored file-store materialization

The owned restricted-runtime preparation now materializes every measured restored
namespace into fresh private roots for the existing canonical local adapters,
cold-verifies full digest parity and rechecks the original opaque integrity
capability before granting the bounded runtime lease. Invalid canonical artifact
IDs and report/gap-report collisions fail before creation. Incomplete copies are
removed; runtime teardown removes successful temporary copies while retaining
the authenticated restored originals. The runtime-only child configuration
explicitly selects these roots and local storage.

The focused restored-runtime integration and object-restore unit suite passed
6/6 cases, including all-six-namespace parity and actual canonical artifact and
workforce byte reads. Root and pilot TypeScript checks and documentation checks
pass. Independent review found no remaining blocker. The final prepared focused run passed6/6 in162.14seconds, including explicit
success/failure/cancellation cleanup assertions. An intervening repeat failed
the unchanged60-second runtime lease: admission had been issued before rollback
preparation and cold app startup. Its failure is retained. The fixture now warms
only unauthenticated denied routes with both logins closed and random invalid
restricted credentials in both database variables, stops that child, and issues
the actual short-lived admission after the real restricted child is ready.
Startup and issuance are enclosed by child-stop cleanup. No lease, case or
fixture deadline was extended. These are filesystem
and owned runtime observations; maintenance HTTP private-byte reads, personnel
and report authorization, composed verification and hosted recovery remain pending.


### Expansion timeout diagnostics

The earlier574e241 CI WebKit structured-edit case exceeded its unchanged30-second
limit without a useful failing-operation location. No product race was established.
At the a6c3176 source plus named-phase/private-trace diagnostic diff, the owned
authoring matrix passed20/20 across all four WebKit projects, without retries,
with source digest77e250641fb8bbbab609f4009a6443b9c9d420a97e4dddfc60ee6d378db0fab6.
The desktop structured edit took19.1seconds: authentication/navigation11.8seconds,
initial creation2.9seconds, structured edit0.4seconds and accessibility/capture1.4seconds.
These timings do not establish the historical CI failure cause. The a6c3176 main
CI run39194860128 also passed, including expansion WebKit.

The runner now retains private failure traces and reports only whitelisted public
phase names and expansion source locations, with a sanitization assertion in the
existing diagnostic test. No timeout, retry allowance or assertion was relaxed.


### Canonical artifact maintenance HTTP bytes

The fixed artifact maintenance path extends the unreleased079 admission with
exact read kind/version/digest/size/generation. The actual owned encrypted
capture/cold restore contains a synthetic published artifact fixture and its
original bytes. Through the restricted child runtime, the canonical original
reader and same authenticated transaction returned the exact bytes. The final
focused integration passed1/1 in82.04seconds: both wrong-kind directions,
changed generation/digest, ordinary route denial, Range denial, corrupt copied
bytes503 and exhausted allowance429 after that failed read all passed. The
initial exploratory fixture failed because completed intent/version insertion
was outside a transaction; the existing deferred contract is now preserved by
committing the matching fixture together. No production schema/grants changed.

The subsequent17 admission/object-restore cases and6 explicit migration cases
passed, for24 focused passing cases including the actual artifact HTTP exercise.
Root and pilot TypeScript checks, authored-doc checks, and both web/eve builds
pass. Independent review found no blocking authorization, identity, request-limit or
lifetime issue. The response is fully buffered and final-authenticated inside
the live capability; it does not claim client-network revocation after return.
Personnel/report/gap byte HTTP coverage, hosted admission, current-denial/effect
reconciliation and complete recovery verification remain pending. Prior079
rehearsals retain their original identities; another final-manifest cold
rehearsal is required before release.


### Canonical published report maintenance bytes and local drain

The owned work-capture exercise now normally authors, renders and reviews report
artifacts with the explicit prepared immutable local renderer, then publishes a
monthly report through the governed preview/decision path. All four rendered
originals join the six-namespace inventory, producing10 objects. The independently
restored restricted child returns the actual published PDF through the canonical
report reader; its size and digest match the captured record. Exact report/revision
binding, wrong-type denial, ordinary-route denial, corrupted-copy503 and retained
request ceiling429 pass. The final integrated exercise passed1/1 in94.28seconds.

The expanded fixture exposed a real drain bug: completed local render jobs retain
immutable future lease timestamps, but the generic drain list omitted their
terminal `succeeded` state. Only that known local terminal case is now excluded;
running jobs and unknown/other tables remain conservative. Six checkpoint cases
pass, including a running job that blocks and the same terminal job that permits
capture. Explicit migration6/6 and admission/object-restore17/17 also pass, for
30 focused passing cases with the actual report HTTP exercise.

Earlier failures are retained: an incorrect preparation-manifest array lookup,
the completed-local-job drain failure, and503 `brand_unapproved` when the restored
fixture omitted the renderer identity used in the accepted brand digest. The
existing bounded manifest parser and explicit matching renderer configuration
correct the fixture; brand/source checks remain intact. Independent review found
no blocking scope, authorization, transaction or drain issue.

Report bytes are buffered and final-authenticated within the normal repeatable
read snapshot; the helper's ordinary behavior still uses fresh transactions per
chunk. This is owned recovery proof, not hosted admission, complete current
denial/effect reconciliation or client-network revocation. Workforce/gap byte
coverage and the composed recovery verifier remain pending. Migration079 is
unreleased and amended again; prior rehearsals retain their original identities.

Both TypeScript projects, authored-document checks and web/eve builds pass for
this report/drain change. The separate cdf6773 legacy CI WebKit/native-operation
failures remain unresolved and are not established as report-path regressions.


### Legacy acceptance failure diagnostics

The cdf6773 Legacy backend parity run39197365105 failed WebKit desktop-dark
retained-history at the combined reload/visibility line and native-operations
with `TimeoutError` inside the knowledge helper. The safe reports did not identify
a product defect: browser transport details were discarded, and the helper
filename was absent from the process-location allowlist. No raw run artifact was
available. Both failures remain historical failures; their causes remain unknown.

The existing sanitizer now permits that exact helper location and fixed knowledge
case/phase markers. The helper emits only these markers on failure. Retained-history
reload and visibility use separate named steps, and the legacy collector includes
standard bounded browser signatures and whitelisted phases. Three existing
sanitization cases pass with injected private strings, as do both TypeScript
projects, a native Node24 sanitizer import and controller syntax check. Independent
review found no privacy or behavior issue. No assertion, retry, timeout, product
behavior or raw-artifact publishing changed. Subsequent CI remains required.

### Workspace personnel maintenance bytes

The fixed workforce maintenance GET now has an explicit workspace scope with no
customer association. The amended unreleased079 admission binds the original
import, source, current version, generation, digest and size. The owner issuer and
runtime require the original owner membership, completed intent and clean
extraction; the canonical reader retains manager authorization and its post-IO
session/source recheck on the explicitly injected authenticated transaction.
Only that reader opts into read-only recovery admission; write paths remain closed.

The existing owned encrypted-capture/cold-restore case now creates a real workforce
CSV through normal intent/upload/completion and genuine prepared local scan/parse.
Its restored restricted HTTP runtime returns the exact original. Wrong session,
workspace, read kind, version and generation deny; the ordinary workforce route
stays locked. Corrupt copied bytes fail without restoring request allowance, and
the next exhausted request denies. Final integration1/1 passes in110.75seconds;
admission12/12, object-store5/5 and migration6/6 pass. Current pilot unit336/336
across61files, both TypeScript projects, documentation and web/Eve builds pass.
Independent code review found no blocker. This does not prove hosted processing,
participant approval, skills certification, gap-export HTTP coverage or composed
recovery readiness. Production remains077 and the operator remains disabled.
The amended079 still requires a final-manifest cold restore rehearsal before release.

### Approved gap-export maintenance bytes and consistent lease observations

The fixed workspace-scoped gap maintenance GET binds an existing reviewer-owned
export receipt to the exact current approved report/revision/version and original
size/digest. Explicit internal transaction injection preserves canonical reviewer,
disclosure, current-source and per-chunk checks and normal provenance headers.
No new export or paid work is admitted. The complete bounded file is consumed and
hash-checked before final authentication. Canonical rate/export lease/completion
accounting commits on success; failed reads roll it back while retaining the
separately committed maintenance reservation. A final composed state digest must
be measured after that accounting and probe retirement.

The encrypted-capture/cold-restore case now includes normally authored, prepared,
reviewed and export-admitted Markdown plus its prepared JSON peer. Final actual
restricted HTTP1/1 passes in105.69seconds: exact bytes and settled receipt, wrong
session/kind/revision/withdrawn approval denial, invalidated canonical source409,
corrupt copied original503, unchanged export bookkeeping after failures and
exhausted allowance429. All13 captured objects restore and temporary canonical
copies are removed. Existing canonical export regressions7/7 pass, including
session/source withholding and cancellation. These are owned local observations,
not actual hosted processing or human participant feedback.

The first gap capture correctly exposed another lease-classification defect: a
finished prepared gap job retained a future lease timestamp and blocked capture.
Capture and snapshot observations now share one predicate with table-specific
terminal exceptions for local succeeded and gap prepared jobs. Unknown states
remain conservative. All6 checkpoint cases pass, including actual running1 and
prepared0 snapshot counts and corresponding capture refusal/acceptance. Current
pilot unit336/336 plus database-safety2/2 pass across62files; migrations6/6, both
TypeScript projects, docs and web/Eve builds pass. Independent review found no
blocker in scope, canonical accounting or the shared predicate. Production remains
schema077. The final amended079 still needs its committed-manifest cold rehearsal.

At7a31144 all7 Legacy backend parity CI jobs pass, including WebKit/native
operations. The main product-gaps deterministic job failed before tests while
`retrieval:prepare --offline` hit its existing Docker120second setup timeout;
no test report was produced. Other main jobs were still running at observation.
No case deadline, assertion or retry policy was relaxed.


### Committed079 rehearsal and required-original coverage

The actual retained Production077 v4 archive cold rehearsal passes at committed
`d5ac68d`, with its final amended079 manifest: schema077→079, locked service and
retired runtime admission. The owned target is removed afterward; Production is
unchanged. This is database preservation/rehearsal evidence, not hosted release.

A further guard closes the gap between archive parity and ledger coverage. Before
temporary runtime grants, it derives every required original from actual restored
rows and verifies its key/digest/size against the authenticated cold inventory.
The existing actual restore case passes1/1 in106.10seconds with8 ledger-required
originals among13 physical objects, then all five maintenance surfaces. A deliberately
missing object reference in the disposable ledger denies, even though the physical
archive remains byte-perfect. The fixture restores its original reference and
triggers before continuing. Both typed target and original store checks remain;
no caller-supplied file list or healthy label is accepted. Independent review found
no blocker. Physical coverage alone cannot grant service readiness.


### Actual Workflow environment separation and terminal legacy tool history

Fresh read-only provider inspection at05acf54 found disjoint environment inventories:
Preview1613 (running398, completed1077, cancelled129, failed9) and Production507
(running171, completed319, cancelled14, failed3), with no overlapping run identity.
Repeated complete traversals took17pages per Preview pass and6 per Production pass.
These are observations, not cancellations, global admission closure or cost settlement.
The earlier Production-only507 inventory does not cover Preview.

Both contain legacy `workflow//eve//workflowToolRunWorkflow` histories:58 Preview
and5 Production, all completed. The existing four-name closure binding rejected
those terminal records and therefore prevented a complete inventory from reaching
its batches. The exact legacy name is now accepted only for terminal readback and
independent receipt retention. Active legacy runs fail before an intent; inventory
preflight checks every row before any batch cancellation. Unknown kinds still deny.
No legacy capability is installed, invoked, cancelled or resumed by this change.

The24 unit cases across3files pass. The11 actual two-owned-database batch cases
pass in22.60seconds, including53 runs with one terminal legacy history,52 once-only
cancellations and all53 independent terminal receipts; repeat reconciliation performs
no additional cancellation. An active legacy run blocks an earlier normal run with
zero cancellation intents. These providers are controlled fixtures, not hosted
cancellations. Independent code review found no blocker. Two new registered unit
cases make the current complete catalog779cases across142suites; no full current
execution receipt is claimed. Real provider writes and paid model dispatches remain0
for this resumption.

### Transaction-scoped request-fence audit

The owner audit now has an internal transaction-scoped entry point for the final
composed recovery decision. It requires an existing READ COMMITTED transaction,
retains both authority fences and table locks, and never commits or rolls back
its caller. Repeatable-read and serializable snapshots are rejected explicitly.
The standalone audit and committed-denial checkpoint keep their existing behavior.

Actual owned PostgreSQL verification: all 16 credential/denial integration cases
passed (92.13 seconds); the changed composition case passed again with both
isolation rejection cases (11.37 seconds). A separate owner could neither see
uncommitted reconciliation nor acquire its authority fence, and rollback removed
the reconciled fences. Root/pilot types and documentation checks passed. Independent
review found no remaining blocker. This is a composition foundation, not a complete
service/Workflow/effect verification or permission to resolve quarantine.

### Complete current local catalog and released credential repair (2026-10-19)

The complete local catalog passes on `e9d2c2142d672db9c05aabbc898fc6ba47a54433`:
779/779 cases across142 suites, with no partial receipt substitution. Its execution
source digest is `6d8dcee537506f0d889860a31819cc5e0a1cf8d4e396f8fea6d8cc541f96643c`;
the private run is `0ad185f4-2d10-4d5f-9193-356cecd5adf5`. This closes that local
catalog attempt, not hosted recovery or full pilot acceptance.

CI at the same commit retains separate failures: native-staged-4 timed out waiting
for its authenticated file preview; the main browser job timed out preparing a
research refresh; expansion WebKit timed out in structured benefit authoring.
A fresh isolated native-staged-4 reproduction passes with real browser/framework
and byte assertions, no paid provider calls. The earlier expansion/gap focused
reproductions also passed; intermittent causes remain unresolved. Assertions,
scenario deadlines and retry policy are unchanged.

An exposed deployment-protection automation bypass was replaced. Its exact existing
Production override now matches the replacement. The obsolete Preview override
for the deleted018 branch could not be edited because the provider rejects the
missing branch; after authenticated branch-absence verification and independent
review, that exact stale row was removed. Other environment identities, scopes
and update timestamps were unchanged. The corrected release uses existing main
`f8d196fad60a96698656188074d0abe668bc7991` at actual Production deployment
`dpl_2wM1dwDx5vV544AfaaEQPiURx8K5`, schema077. The preceding deployment attempt
and its unknown cost remain retained; the second build followed verified consumer
correction within the existing finite Production allocation.

Actual authenticated HTTP, CLI WebKit desktop/mobile and one owned empty native
session passed. The original native retirement was confirmed before and after
revocation; the exposed credential is absent and the replacement remains default.
The owned conversation was archived and temporary login revocation verified in
Postgres. Model response admissions and model calls were0. This is released-route
verification, not a signed-worker-path test or an016 release. No schema migration,
full-readiness verification, merge or Projects-directory cleanup occurred.

### Bounded UI orchestration and recovery batches

Expansion and support UI runners now await Playwright asynchronously, keeping the
supervised application's log pipes draining. The unchanged240-second runner limit
and10MB combined output bound terminate the owned process group on failure. Partial
bounded failures are rejected before parsing their private output. Three real
subprocess regressions pass:4MiB sibling log pressure while the UI child waits for
its response, forced termination of an unresponsive descendant, and combined output
limits. Catalog/readiness contracts plus these regressions pass32/32; root/pilot
types and documentation checks pass. Independent review found no blocker.

Actual isolated WebKit acceptance passes all20 expansion authoring cases across
four projects, with no retries/skips. The support proposal/review journey passes
1/1 with the asynchronous child. The research refresh case from the main CI failure
passes1/1 on mobile-dark in9.78seconds after correcting the private reproduction's
clone/dependency/fixture setup. These results do not establish the causes of the
historical CI timeouts. The actual native-staged-4 CI rerun also passes; its original
failed attempt remains recorded.

The e9d2c21 CI pilot catalog later exhausted the60-second temporary runtime lease
in the multi-surface restore fault test. The fixture now runs artifact/report and
workforce/gap batches in separate leases on the same target and locked revision.
All existing assertions remain; shared profile/concurrency checks repeat, and each
batch verifies retired admissions/sessions, closed roles, absent runtime backends
and removed canonical roots. Runtime60seconds, fixture180seconds and testcase
420seconds remain unchanged. The actual restore check passes1/1; the run took127.24seconds.
This proves two bounded maintenance batches, not one continuous full-service window.
Independent review found no blocker. The updated catalog is782cases across143suites;
the earlier complete779-case receipt remains bound to e9d2c21 and is not relabeled.

A fresh repeated hosted inventory finds578 deployments and79 aliases after credential
repair, with4 exact current Production hosts and653 other hosts. Read-only firewall
preflight confirms an empty preimage, current-host controls and effective worker-origin
coverage. The firewall is unchanged. This inventory/preflight is not old-host closure,
Workflow/effect reconciliation or a completed recovery verification.


### Applied old-host firewall and incomplete strict census

After the read-only preflight above, one project firewall rule was applied under
its finite $1 allocation. The active rule denies hosts outside the four exact
current Production hosts. Actual platform readback confirms version1, no draft,
and an unskippable custom stage; current Production HTTP controls remain healthy.
No schema migration or Workflow cancellation was performed.

The bounded census completed3,260 observations across653 noncurrent hosts:
all653 current-bypass header paths, all653 query paths and all652 available fresh
cookie paths returned403 with `x-vercel-mitigated: deny`. The remaining1,301
ordinary or retained historical-cookie requests returned deployment-protection
redirects. These are distinct from direct firewall denials or redirects to a
current application host. The strict receipt remains `complete:false` and
`httpOldHostClosureVerified:false`; policy configuration supports only an inference
about requests after those protection flows. Final platform binding and all eight
current-host controls pass. Total host requests were4,593 of the5,000 cap, with
original costs and unknown holds retained. No automatic provider mutation retry
occurred. Failed pre-admission binding checks are preserved separately.

This establishes measured denial for current bypass capabilities, not complete
old-host/execution closure, retired database roles, Workflow reconciliation or
recovery readiness. The active firewall must be retained during subsequent work;
future admitted deployment hosts require an explicit bound allowlist update.


### Gap command errors across refresh and scope changes

An actual owned missing-originals mutation returns409 with the expected domain
rejection. A deterministic CLI WebKit regression then dispatches focus and awaits
the real successful detail refresh: the previous client erased the rejection, and
the corrected client retains it while keeping zero impact observations. Command
errors are bound to namespace, scope generation and route, cleared on a new command
or reconciliation, and invalidated by a newer denied/error refresh or scope change.

A second regression holds the actual mutation response's JSON continuation,
performs a real partner login and denied refresh, then releases that old response.
Before the epoch fence it replaces the unavailable message; after the fix the
unavailable state remains and no private narrative returns. Immediate projection
clearing is retained. Both negative reproductions are preserved separately.

All44 authoring/revocation cases pass across four CLI WebKit projects with zero
retries/skips. Fixed-category diagnostic/unit checks pass7/7; root types and docs
pass. Independent review found no remaining blocker. Diagnostics admit only known
409 categories through an own-property lookup and public formatter allowlist.
The original CI gap failure still lacks its exact response category; this proves
the two reproduced races, not the historical failure's complete cause. Current
legacy CI on cccf85e passes; main CI still includes unresolved expansion/gap failures.


### Current Preview077 preservation and bounded expansion preparation

A fresh read-only inspection confirms Preview077 with all77 migrations. The first
safety-copy admission stopped at source-platform binding before source export or
independent key creation: the actual owner setting is sensitive, so it cannot be
read as an encrypted platform value. A separately journaled continuation uses the
existing protected-operator-connection contract and retains the original cost hold.

The actual encrypted Preview safety capture is31,394,367bytes. Independent key
retrieval, fresh-connection cold download/decryption and the snapshot-bound current
ledger/content/required-object/lease observations pass. A cold PostgreSQL18 restore
and explicit migration rehearsal through079 pass; its target remains locked and is
removed afterward. Preview and Production schemas/roles/configuration are unchanged.
This is current-release preservation and rehearsal, not matched service recovery.

The expansion harness previously readied only authentication/session and eve health
routes. It now prepares six fixed entry routes using unauthenticated asynchronous
GETs, manual redirects, expected per-route statuses and same-origin login redirects.
Requests carry no cookies/body and do not retry. Preparation has a60-second total,
15-second request bound inside the existing360-second fixture deadline; timings are
retained separately. Browser30seconds and child240seconds remain unchanged.
Actual authoring passes20/20 across four CLI WebKit projects with zero retries/skips;
preparation took at most5.205seconds per fixture. Root/expansion types pass and
independent review found no blocker. Cold compilation was a confirmed setup gap,
not a proven complete cause of the historical CI timeout.


### Independent single-surface recovery fault cases

Main CI on cccf85e still expires the temporary60-second runtime in the two-batch
restore test. Its original failed attempt is retained. The fault catalog now has
four independently captured/restored cases: artifact, report, workforce and gap.
Each repeats every shared physical/ownership/integrity/profile/concurrency control
and exercises exactly one original surface fault catalog. No assertion was removed.
Post-lease role/backend/admission/session/canonical-root checks now run in `finally`;
fixed surface/phase context is retained on failure.

All four actual encrypted-capture/restore cases pass: artifact106.65seconds,
report114.27seconds, workforce104.95seconds and gap111.42seconds. These are whole-case
timings, not runtime lease durations. Runtime60seconds, fixture180seconds and
case420seconds remain unchanged. The whole-file controller is1740seconds for four
420-second cases plus60seconds overhead; the full catalog deadline is unchanged.
All32 catalog/result/deadline/readiness contract checks and pilot types pass.
Independent review found no blocker. This is bounded test orchestration, not a claim
that the previous CI timeout's complete cause is known.

The registered inventory is now785cases across143suites. The running782-case
execution remains bound to30daadb and will not be relabeled as current acceptance.


### Explicit Preview runtime-retirement source binding

The protected work-runtime command previously accepted only the Production source
contract, preventing its use on the independently inspected Preview target. It now
accepts explicit matching Preview or Production sources only at schema079. The
protected input defaults to Production for backward compatibility; Preview requires
an explicit matching target. Project/environment/target/schema validation precedes
platform or database work. Receipts retain the source target. Existing exact owner,
locked recovery, role/password binding, once-only retirement and replacement
connection checks remain unchanged.

The existing six source-contract cases pass with added Preview079, legacy
Production default, cross-target, wrong-marker and older-schema checks. Pilot types
pass after correcting the private review checkout's dependency links; the initial
missing-package type failure is retained as setup evidence. Independent review found
no blocker. This is command support, not actual hosted role retirement or unlock.

### Complete frozen 30daadb catalog (2026-10-19)

The complete local catalog passed782 cases across143 suites at commit `30daadba78edb7c46781cb09180615a78c609d45`, source digest `5fd2f3148b05147ef23237f6f07c655dadef196716f085058b2234934f43f8eb`, catalog digest `bb8759247041b18bc749787988021d9c1d7759fbf9028000406de4c25f3afef2`. Private execution receipt: `local-artifacts/016/run-1a4fa02d-1014-4307-8af8-0eb3515987dc/execution.json` in the frozen catalog worktree. This result does not cover the subsequent785-case inventory or establish hosted pilot readiness. Legacy acceptance CI39214469814 passed on `ca3d47c`; its main CI39214469812 remains in progress.

### Restore command required-original coverage (2026-10-19)

The command now mints actual disposable-container/owner authority before replacing the runner marker, binds the opaque measured restore, and verifies the database-derived required originals in a repeatable-read transaction. Success adds a physical-only `requiredOriginals` receipt; no runtime access, unlock, service or current-authority proof is granted. All four independent artifact/report/workforce/gap recovery cases pass, each with eight required originals. Whole-case times were107764ms,102993ms,106931ms and96907ms, respectively. The existing missing-required-original corruption test remains exercised. Private report: `restore-cli-coverage-four-report-private.json` under the resume evidence directory. Pilot types and documentation checks pass; independent read-only review found no blocker. T088 remains incomplete pending required service/current-authority/managed-execution verification.

### Complete23e8b2c local catalog and CI browser corrections (2026-10-19)

The complete local catalog passed785 cases across143 suites at `23e8b2c2c1703129f5ffe32f09dd076bfeea8375`, source digest `a404b905bb4445c1574578733609b1a4afe9049be4af8c5148968f4f0b057e3d`, catalog digest `f8aae05a2d965cba80ebb1ee2bbcba60b10fa141f0bfb0c9d428c580e35766b9`. Receipt: frozen worktree `local-artifacts/016/run-ea605733-7b53-4c0a-accc-deda3f4c3d61/execution.json`. Full readiness remains false. Main CI39216994407 failed its verify research-cancellation case and deterministic hosted-browser mobile-dialog assertion; original logs are retained. The remaining main jobs completed without those failures.

Mobile navigation now disables its server-rendered trigger until mounted. The existing hosted-browser integration withholds actual script delivery, asserts the disabled server state, releases scripts and opens the dialog. The old code fails this controlled assertion; the fix passes the existing three-role/four-project browser catalog. This establishes the readiness defect, without claiming the historical CI failure's exact timing was measured.

The research preview/cancellation fixtures now explicitly use the live customer context created by ordinary schema064+ chats. The cancellation test advances the real synthetic customer's generation and verifies current context through the real conversation endpoint. With the old frozen-context flag, all four cancellation configurations fail at this assertion (eight other cases pass). With the corrected flag, all12 research WebKit cases pass, no retries/skips. No production authorization or stale-context policy is relaxed. Available CI logs do not establish which process changed the historical fixture's context. Private before/after reports and original failures remain retained.

### Authored maintenance application and coordinated child retirement (2026-10-19)

The isolated restore integration now uses the authored maintenance application launcher for actual profile/artifact/report/workforce/gap HTTP reads. All four independent surfaces pass with zero skipped cases: artifact88834ms, report75411ms, workforce73126ms and gap74551ms (whole-case durations). Private report: `owned-application-four-report-private.json` under the resume evidence directory. The three actual process-group cases and existing readiness/result/deadline contracts pass35/35. Pilot types pass, and independent read-only review found no remaining concrete blocker.

Actual cancellation tests keep canonical stores present while a SIGTERM-ignoring child remains alive, then verify cleanup after group closure. A controlled real process-group retirement refusal closes database roles, retains canonical stores and blocks a new lease; the disposable child is explicitly terminated and verified absent afterward. Opaque runtime environments and retirement resources reject serialized substitutes. Earlier cold-start/prototype failures and private child diagnostics remain retained. The launcher suppresses automatic development-agent startup only in its private maintenance child; no root model, selected database, selected workflow data, native/Workflow proof or Production state changes.

The current inventory is788 cases in144 suites. The complete785-case23e8b2c pass remains historical and does not cover this follow-up. Command-level exhaustive maintenance coverage, ordinary hosted recovery, current authority/managed execution reconciliation and full readiness remain incomplete.

### Command-level maintenance producer and guarded proof consumption (2026-10-19)

The owned restore command optionally reads a private exact-source maintenance configuration, retains its physical-only checkpoint before service work, derives eligible profiles/originals from the actual restored ledger, and runs authenticated loopback reads for every derived maintenance record. Unsupported current ownership/export authority fails instead of silently shrinking coverage. The verifier checks release identity, exact profile projection or original bytes, wrong-session/kind and ordinary-route denials, revoked probes, unchanged inventory and closed runtime authority. Its partial in-process proof cannot unlock service. A consuming READ COMMITTED owner transaction rederives inventory under ordered fences and rejects newly live runtime/probe authority before composition.

The actual artifact case passes with positive proof consumption, serialized-proof rejection, a newly issued probe rejection, owned LOGIN rejection and same-revision generation-drift rejection. The five actual process-group cases pass, including transient denied probes followed by verified closure and persistent denied probes refusing retirement. The existing result/deadline contracts pass10/10; root and pilot types pass. Private reports: `maintenance-artifact-v9-report-private.json`, `owned-process-probe-five-report-private.json` under the resume evidence directory, and authoring `local-artifacts/016/maintenance-suite-contracts-private.json`.

Earlier focused attempts and failures remain retained. One actual diagnostic records a group-zero `EPERM` while the owned child is still closing (`childClosed=false`, exact group process state `?Es`). A denied probe now remains classified alive within the unchanged finite deadline; only absent group plus actual child close establishes retirement. Signal failures still reject. The authored maintenance child now uses the installed documented programmatic Next server, with explicit listener/application cleanup, avoiding the development CLI's extra parent and detached shutdown telemetry path. This does not establish the historical EPERM cause beyond the recorded observation. Independent read-only review found no remaining concrete blocker after correcting exact catalog titles and the five-case whole-suite controller bound. Per-case, runtime, fixture and overall catalog deadlines remain unchanged.

The current inventory is791 cases/144 suites. The complete five-case recovery rerun passes5/5 with no skipped cases; fresh final-source local/CI proof remains pending. Private report: `maintenance-command-five-v10-report-private.json` under the resume evidence directory. Whole-case durations in milliseconds: artifact141541, report94353, workforce94399, gap80234, command115596. Main CI39258680739 at5cd5b7d fails all four old-harness restore cases on one unretired HTTP admission; its main verify job passes. The old finally sequence could skip probe retirement if application stop rejected. The authored launcher supersedes that sequence, but actual Linux acceptance remains required. Legacy CI39258680650 passes. Ordinary hosted service/current-denial/Workflow recovery, full accepted-work RPO/incident RTO, participant observations and readiness remain incomplete. No selected environment, Production schema, root model or hosted operator state changes here.

### Complete1972595 frozen catalog (2026-10-19)

The complete local catalog passes788/788 cases across144 suites at `1972595762c24e125600c9abe4628668faf8936b`, source digest `3e39541e4b98f8c520f7c5bd6dcae677f1e0a76d6974adb46a90c77486a9cf83`, catalog digest `166ccfca85af66c994970d915847f74cc99366143a2043e8373ba82efed0531a`. Private frozen-worktree receipt: `local-artifacts/016/run-2fdd52f2-097a-456b-9d67-377024b67fec/execution.json`. This includes the authored launcher/coordinated retirement checkpoint, not the subsequent791-case command-verifier follow-up. Full pilot readiness remains false; fresh final-source local/CI proof is required.

## Scoped hosted root budget follow-up

The default-off root-only transport guard reserves against an existing058 budget
only for finite fresh synthetic ordinary conversations. Its inner model wrapper
runs after ordinary prompt enrichment, preserves the selected model, disables
tools and rejects adversarial tool output before forwarding. An owner-only079
admission binds the actual READY deployment without a build-time deployment-ID
circularity. Immutable original provider identities and the existing dollar
reservations survive interruption; replacement environment budgets are rejected.
The explicit operator command performs platform/origin and direct-owner target
checks and never creates a budget or sends a message.

Four owned PostgreSQL18 integration cases pass4/4, zero skipped:
`local-artifacts/016/hosted-root-budget-v5-private.json`. They cover concurrent
admission, scope/target/source/native/cap denial, unrelated attempt exclusion,
Production-bound successful generate/stream settlement, immutable provider IDs,
owner-only deployment admission, original-budget replacement denial, denial
snapshot/replay metadata, adversarial generated/provider-executed stream tools,
and retained unknown reservations. Fixture providers make zero actual model calls;
these checks do not establish hosted streaming/resume/stop acceptance. Catalog
contract checks and typechecking pass. The current inventory is795 cases/145
suites; complete final-source local/CI verification remains required. At71aa399,
CI39270220721 has an execution deterministic restart-readiness failure; its
available public diagnostic identifies no startup signature. The corrected owned
execution-specific recovery rerun passes2/2 after verified process-group/pipe
retirement and a disposable-only linked-dependency Turbopack root adjustment.
Private report: `local-artifacts/008/deterministic-XDotEO/result.json`. This local
pass does not establish the historical Linux CI cause; fresh CI remains required. Hosted079
has not been applied, and no readiness or participant gate is completed here.


### Gateway identity and root accounting follow-up

The root adapter now keeps the Gateway generation ID separately from the upstream
response ID, including IDs supplied by actual SDK errors. Interrupted accounting
uses only the fixed read-only Gateway generation lookup; missing IDs, invalid or
nonterminal accounting remain unknown. Owner receipts and original058 settlement
commit together. Completion and reconciliation share budget-then-operation locks;
closed/recovered scopes keep their full ceilings. An authoritative conflicting
charge is recorded immutably and blocks dispatch without replacing the first
charge, increasing a cap, or reopening authority. Ordinary parity settlement is
unchanged. The updated inventory is807cases/146suites and needs complete proof
from its final committed source.

The optional hosted root browser producer performs two actual UI sends per
desktop/mobile conversation, requires a streaming reload with the same attempt
and deadline, observes native Stop cancellation, reconciles actual generations,
and requires exact native reset plus durable retirement before archive. No
actual hosted send or provider lookup has been performed for this follow-up;
root transport and full hosted readiness remain unverified.


The prior committed71aa399 complete local execution finished successfully with
791/791 cases across144 suites and owning cleanup process exit0. Its private
receipt is `turas-pilot-finish/local-artifacts/016/run-b5781b32-3da4-43af-b5a6-16250edb3247/execution.json`,
source digest5467d9be6840e5e3d81293ca55b29389f2830f5815aadacabcd7369ae6a8c717,
catalog digest420e5f2f94d69deefbef2606c74e0ac05b570e3de36eb044160f8439f72009e1.
The c6d9cbf795-case execution remains running separately; neither receipt can
substitute for complete acceptance of the newer807-case source. Ten updated
case-inventory/result/deadline contracts pass without provider calls.


Focused root identity/accounting checks pass16/16 with Node24 in
`local-artifacts/016/reviewer-root-accounting-fixes-v3-private.json`. The expanded
same-title discrepancy regression passes1/1 (nine intentionally filtered cases)
in `reviewer-root-accounting-discrepancy-final-private.json`; this narrow check is
not a complete catalog. Genuine runtime recovered-settlement denial, owner
reconciliation without refund, concurrent two-connection budget contention,
strict missing/blank/invalid/contradictory cost holds, receipt rollback and replay
are exercised. Independent review found the original accounting gaps, verified
the fixes and reviewed the root browser target binding and cleanup; no remaining
concrete blocker was reported in that scope. Root and pilot typechecks,243-file
documentation hygiene and whitespace checks pass. No provider call was made.

The c6d9cbf complete execution failed in suite84 at recovery-credential-denials:
the new root provider-identity replay trigger covered INSERT only, while the
existing audit requires INSERT and UPDATE. The audit correctly refused recovery
before the fixture's expected missing-fence error. Both new root replay triggers
now cover INSERT OR UPDATE; immutable-update triggers remain intact. The failed
execution is retained and cannot count as795-case acceptance. The complete16-case recovery-denial suite passes16/16, and the final077-to079
forward rehearsal passes4/4 against the corrected SQL. Private reports:
`root-provider-replay-audit-private.json` and
`root-replay-trigger-077-forward-private.json`.


### Fresh private images and store permissions — 2026-10-19

The previously published three private image/platform/configuration digests were
authenticated and reverified. An unauthenticated initial registry read returned403;
this did not establish missing images. Temporary registry credentials were then
removed. Fresh prepared Linux/amd64 images were published with scanner signatures
28156, and all three prepared OCI index/platform/configuration digests and actual
private project bindings were verified. `infra/pilot/images.json` now records those
actual immutable references and signature metadata.

Actual synthetic Sandbox scan, parse, PDF/PPTX render and Office edit/save/reopen
checks pass4/4 sequentially under the governed fixed programs, denied network, no
ports/persistence and original five-minute bounds. Office text/table checks pass;
chart checking is not applicable to this controlled document. The copied parser
preflight initially expected old signature28149 and failed before dispatch; its
zero-provider failure remains retained, and the corrected first provider attempt
requires28156. All four exact owned Sandbox names subsequently return actual404
with resume disabled; no creation/shutdown uncertainty is recorded.

Existing original registry/smoke holds remain$2. The new registry ceiling is$1
and four execution ceilings total$0.80; all$3.80 remain conservatively held within
the$5 partition. These are upper bounds, not invoice costs. No model call or
automatic paid retry occurred. Evidence: authoring-worktree
`local-artifacts/016/image-refresh-28156-98478fd/{publication,registry-verification,smoke-summary,provider-retirement-verification}.json`.

The existing work-project Blob store is private and connected to Turas. Actual
Preview project OIDC authenticated immutable writes, fresh-adapter cold reads and
verified exact-key deletion in all six active namespaces. Only controlled probe
bytes were used; no original was altered. A$0.01 ceiling remains held. Evidence:
`local-artifacts/016/blob-permission-98478fd/receipt.json`. The first probe refused
its preflight because Preview has no configured environment marker; no provider
dispatch occurred. The corrected isolated permission probe uses a distinct owned
probe marker, explicit Preview OIDC and the existing store. This proves store
permission only: application configuration, domain health, storage cutover, hosted
schemas and deployment remain unchanged and unverified for016.

The807-case run at98478fd remains separate source-bound local evidence. This new
image-manifest change requires its own final-source acceptance; no hosted pilot
readiness follows from these infrastructure checks.

### Hosted learning original-budget admission and accounting continuation

The original append-only quality journal now supports an exact hosted arm binding.
An owner admission can only consume an existing unresolved reservation from that
journal; immutable database tickets bind the original budget, authorization and
cap to the actual evaluation, case, native request/session, price, source and
deployment. Runtime consumption and the domain provider claim commit together.
Runtime cannot mint or alter owner admissions. Missing or removed configuration
continues to deny an already protected workspace; unrelated ordinary learning
remains outside the pilot guard. Early Gateway generation identities remain
separate from upstream response IDs, including SDK errors and streaming finish.

Read-only reconciliation uses the fixed Gateway lookup and requires agreement
with actual domain accounting before settling the original journal. Expired
spending authority does not prevent historical accounting or authorize another
call. Known overruns retain their observed exposure and cap; mismatched receipts
retain their original hold. Separate actual panel author/mcteer reviewer sessions
now author and review the pre-activation baseline through ordinary APIs.

Focused admission regression v3 passes6/6 and original quality-budget/catalog
checks pass24/24. The owned learning development runner passes6/6 native draft
checks, source849c66a21530f0c1e14830d4211c3c2c809e9b6d65a23d751feca7f2bf8ffc47.
A direct invocation of those six database tests without their owning runner
failed its expected ownership precondition; the failed report is retained.
The complete807-case run at98478fd stops at the historical denial fixture: its
synthetic downgrade incorrectly carried the enlarged current inventory into an
older bounded format. The fixture now explicitly models schema077 and the older
required table subset without widening historical verification. Its focused
rerun passes4/4. Current inventory is813cases/147suites and still requires fresh
complete source-bound local/CI acceptance. Later accounting and forward-restore
checks are recorded separately after completion.

No real quality-journal event, hosted learning model call, hosted migration,
Production release or selected local-state change occurred in this work. Hosted
J014 orchestration, its actual paired captures/review and the other mandatory
pilot gates remain incomplete.

Final focused accounting report `hosted-learning-accounting-v3-private.json`
passes6/6, including expired spending authority, fractional micro-dollar cost,
known provider overrun with mismatched domain settlement, rollback and replay.
`learning-bridge-077-forward-private.json` passes4/4 released077 cold restores
through079 with runtime perimeters. Root/pilot typechecks, authored documentation
and tracked-file hygiene pass. The delegated independent reviewer found no
remaining concrete bridge blocker after the fixes; this is implementation review,
not hosted execution or release acceptance.

### Ordinary learning preparation, bounded paired capture and native cleanup

The actual owned HTTP preparation exercise passes1/1: distinct panel/mcteer
sessions author and review a pre-activation baseline, then ordinary feedback,
same-contribution revision, candidate review, feedback linkage and evaluation
preparation preserve the published baseline. Its first preflight run rejected
an extra source-option label before revision; the corrected parser retains only
the governed lineage fields. No model was dispatched.

The capture orchestrator now uses exact platform/source/deployed database and
original-journal authority checks. It admits each sequential full provider step
against the unchanged remaining cap, not an invented smaller output limit or
sixteen simultaneous ceilings. Prepare/bind/send intents precede effects. Native
responses rely on actual platform and versioned authenticated API checks rather
than an unsupported native release header. Unknown acknowledgement reads only
original identities, retains accounting and registers/fences operational cleanup.
Cancellation between arms and finalization errors share the same bounded cleanup.

The controlled transport harness passes6/6 with a real synthetic append-only
journal, synthetic8/24USD-per-million price and16million-micro-dollar per-step
hold: all16ordered calls, unresolved-accounting stop, insufficient remaining
step budget, database mismatch, lost bind acknowledgement and between-arm
cancellation. This harness is not actual model or hosted proof. Bounded owner
connections are factory-created with5second server statements/connect and a
6second client timeout; final retirement polls exact actual worker receipts under
an independent90second cleanup clock.

The owned learning maintenance runner passes11/11, including a native session
bound before its first learning send: creating/reconciling stays pending, later
exact binding can retire without rewriting the attempt identity, and foreign
signed sessions are denied. The first accompanying learning typecheck exposed
a ProcessEnv typing issue in platform lookup; the type-only correction preserves
the runtime environment and subsequent learning/pilot typechecks pass.

A separate outer hosted-catalog cancellation wrapper accepts the intended bounded
two-hour catalog without changing recovery's15minute bound or any native/file
job deadline. Four existing cancellation cases include actual process signals,
cleanup and deadline checks. Current catalog is820cases/149suites; complete
source-bound acceptance remains required. No real quality-journal event, hosted
schema change, paid model or Production release occurred here.

Final combined capture/cancellation/catalog checks pass20/20 in
`hosted-learning-capture-final-private.json`. Connection URL timeout/options
overrides are refused; server/client deadlines cannot be removed by the parser.
The delegated independent review found no remaining concrete blocker in the
capture, cleanup or cancellation changes. These results remain focused local
implementation evidence; actual hosted captures and final-source complete
acceptance are still required.

### 2026-10-19 reporting setup diagnostics and operator OIDC verification

At10cab32, three reporting CI jobs fail without a surfaced test assertion; their
private logs do not establish a historical cause. The independent review identifies
a diagnostic gap in controller/setup failures. Fixed allowlisted stages, setup
operations and failure signatures now cover those paths and guarded setup process
receipts; raw exceptions and child output remain private. The three existing
privacy/bounds cases pass with additional setup assertions, and root types and
tracked documentation hygiene pass. No assertion, rendering binding or deadline
is weakened. A stale local renderer correctly fails its binding check; the actual
fresh prepared renderer passes the audience contract. The complete reporting
regression gate also passes locally with generated disposable credentials. Neither
local result relabels the failed CI jobs. Fresh source-bound checks remain required.

The dedicated disabled backup operator's new connection initially used a legacy
static-token API path. Two failed OIDC probes retain their ceilings and exact-key
reconciliation: all twelve nonce keys are actually verified absent. The installed
official CLI specifies the separate upgrade-to-oidc operation. That exact owned
connection upgrade and removal of its unused generated static token succeed.
A new bounded OIDC-only probe passes immutable write/cold-read/metadata/delete
checks in all six active namespaces. The temporary development scope is restored
to production-only, and the original application connection is unchanged.
The backup operator remains disabled; this local permission exercise does not
prove a Production Function invocation, a matched backup or scheduled cadence.
No quality-journal charge/hold is reset. The original journal remains at
1,806,543microUSD spent, zero held/unknown and four unused Context credits.

The subsequent c31bf63 CI reporting diagnostics identify the common setup
location `scripts/plan-eval-environment.ts:242`: resolution of the root and
artifact-extractor dependency directories. Reporting jobs install only root
packages, while the shared owned app setup requires both directories. The
reporting matrix now installs the pinned extractor lockfile as well. No runtime,
assertion, renderer binding or timeout changes are required for this setup fix.
Actual new CI results remain pending.

### Exact work-target denial entry point

T095's shared deny-only core and explicit work controller are implemented. The
original owned entry point retains Docker ownership checks. The work path checks
independently selected actual platform/owner/locked079 bindings, direct bounded
transport, retired legacy LOGIN/no backends and the existing authenticated cold
reader capability. It retains committed denials before a separate replay audit,
rechecks target/source/protected checkout and never opens service or clears holds.
The independent review found no concrete blocker. Combined9/9 tests pass:
four new actual-owned-PostgreSQL work-path cases with controlled reader authority,
four original owned command cases and one forged-reader rejection case. The first
positive attempt correctly rejected a remaining fixture runtime pool; the fixture
now closes that pool before declaring legacy retirement. Its failure is retained.
Root/pilot types pass. These results do not establish actual hosted reconciliation,
full required-service coverage or an authoritative unlock producer; T096/T097 and
the governing full recovery tasks remain open. Inventory is824cases/150suites.


### Accepted-plan recovery coverage — 2026-10-19

The historical frozen10cab32 full catalog passes820/820 cases in149 suites with
owned cleanup complete (run95ad9347-e09f-479f-ae05-294d34808179). Its source digest
is `ec8ace1713d2d47635b3b410163aac0040cfb077c0901fb100d8caa76e5f7ae3`; it does
not prove subsequent source.

The accepted-plan extension adds an exact fixed maintenance route using the same
canonical plan reader and actual runtime connection. Inventory derives accepted
plans before filtering; ordinary ingress remains locked and finite reservations
are committed before content reads. The existing five-case owned restore suite
passes with all six maintenance record kinds, including plan content. That pass
precedes two review corrections: an explicit nonnull plan metadata digest and
strict readable/accepted canonical byte/schema validation. Four new projection
unit cases and all four corrected HTTP/database cases pass, including the actual
SQL nonnull constraint. The corrected composed artifact restore case also passes
with all six maintenance kinds; the other four cases were deliberately not selected
for this narrow follow-up. Root/pilot types and docs pass. Independent review
finds no remaining concrete blocker in these corrections.
The current catalog contains832 cases in152 suites. No full-service or hosted
acceptance is inferred; T096/T097 remain open.

At c871108, reporting deterministic and regression CI jobs pass with the extractor
dependency fix. Reporting WebKit remains pending. Product-gap WebKit has two
retained failures: a loading page with no captured browser API responses, and a
created eligible record whose expected title heading is absent. Current diagnostics
do not establish their causes; no timeout or assertion is relaxed.

### Verified work-target foundation

The separate work-target capability now owns its bounded owner/runtime transports,
checks actual platform/deployment/origin and selected owner bindings, requires
clean committed source, exact locked079 scope and retired legacy credentials, and
expires with its exact callback/client lifetime. The original owned Docker path
is unchanged. Four actual-owned-PostgreSQL cases pass with controlled cloud/DNS
and source transport at the initial checkpoint; a follow-up adds dirty-source
rejection. The first fixture attempt used the wrong retirement API shape and
failed before target admission; it is retained. Root/pilot types pass after that
fixture correction. This does not establish real Neon/platform acceptance.

The foundation is not yet wired to session or HTTP admission issuers. Probe
reservation now durably records exact IDs before effects, and private bounded
reconnection retires exact sessions/admissions after closing the original writer,
independently of callback failure/cancellation. All six corrected controlled-cloud actual-PG cases pass, including a committed
session with no admission, callback failure, and cancellation of a callback that
never resolves. Root/pilot types pass. Independent review finds no remaining
concrete blocker in this foundation. Journal-based restart reconciliation and issuer
integration remain required. T096/T097 remain open. Current inventory838cases/153suites requires fresh complete
source-bound validation; prior catalog passes do not cover it.


### Probe restart reconciliation and concurrency

All nine corrected target cases pass on actual owned PostgreSQL with controlled
cloud/DNS/source transport. Separate private0600 original nonce files authenticate
restart cleanup against actual stored hashes; ordinary intents/receipts omit
secrets. Tests cover wrong operator credentials, forged journal preimages, original
admission cleanup, lost commit acknowledgement, idempotent retained receipts,
a pending cancelled callback and session-only effects. A four-way reservation
interruption retires every session;33parallel reservations admit exactly32and
retain/revoke all32. Independent review identified and the implementation corrected
the shared-registry overwrite race before this pass. Prior failed fixture/report
evidence remains retained. Current catalog841cases/153suites needs complete proof.

CI39301788519 at c6334b0 reports a retained pilot-regression predecessor failure in
014WebKit learning-draft line7 (30-second case timeout). Domain/native predecessor
phases pass. The CI gate remains unresolved; no assertion or deadline is relaxed.

The next product-gap failure diagnostic retains only bounded JavaScript error and
failed-request categories, API expected-title equality and a DOM heading-presence
boolean. It captures neither fixture prose nor raw error text. All seven existing
runner/privacy cases pass and root types pass. Actions, assertions, retries and
deadlines remain unchanged. Independent review found no concrete blocker. This
improves diagnosis; it does not establish a fix for the retained WebKit failures.


### Exact work-target session and HTTP issuers

The shared session core preserves the original owned Docker guard; the new work
constructor independently requires its genuine target and configured administrator
credential, reserves original identities/preimages before INSERT, and rechecks
creation time after persistence. The work HTTP issuer binds verified deployment,
origin, source and database metadata. Its existing fixed handlers and ordinary
ingress guards are unchanged. Canonical work reads now revalidate their actual
short-lived session after the callback; review caught and corrected that expiry
gap before acceptance.

Combined19/19 actual-owned-PG cases pass:12work target/issuer, four accepted-plan
HTTP and three original owned recovery-read cases. These include actual canonical
accepted profile content, runtime route-handler200, ordinary401, retired403,
forged target/wrong credential/deployment rejection, actual DB-clock expiry and
callback revocation while the target remains active. The first18-case attempt
passed16; its HTTPS test used a local cookie name and its old report fixture lacked
the explicit prepared renderer. Both failures are retained; the corrected run uses
the canonical secure cookie and prepared actual renderer. Root/pilot types and docs
pass. Independent review reports no remaining blocker in this auth increment.
Cloud transport remains controlled; this is not hosted service acceptance.
Current inventory844cases/153suites still needs complete current-source proof.
T096/T097 remain open for remaining service/role/SDK/Workflow/effect coverage and
the final genuine fenced verification producer. No real target was locked.


### Accepted execution recovery coverage

All five corrected actual-owned-PG execution route cases pass. The fixed reader
compares the accepted baseline against its canonical plan, inventories all accepted
execution heads before projection (including internal/older-baseline records),
selects explicit accepted revisions despite pending corrections, validates content
schema/digests and current milestone identity/version/state/eligibility, and retains
committed finite allowance after a missing-payload failure. Ordinary ingress stays
locked; changed generations and retired/foreign credentials are rejected. A normally
reviewed replacement baseline leaves historical accepted IDs in the inventory and
fails readiness while delivery needs reconciliation.

Review identified and corrected milestone-level review flags that top-level overview
flags did not cover. The first test-file parse failure and first five-case failures
are retained: an unnecessary immutable-baseline row lock lacked runtime write
privilege, and the replacement-plan fixture used an invalid command. The correction
keeps runtime grants unchanged, locks mutable heads, and uses the normal save/review
contract. Five focused cases now pass; root/pilot types and docs pass. The composed
owned restore check with seven record kinds remains pending. Current catalog is
849cases/154suites. No new hosted proof, work-target lock or unlock is inferred;
T096/T097 remain open for remaining role/SDK/Workflow/effect coverage and composition.
The earlier actual Neon079 rehearsal predates these unreleased079 metadata changes
and must be repeated before release.


The first seven-kind composed restore attempt correctly refused the execution
lookup: its legacy customer selector read the process environment rather than the
authenticated recovery configuration scope. It returned not-found across markers.
The selector now uses the existing governed configuration accessor, preserving
ordinary configured behavior and the selected process state. Both plan/execution
maintenance routes are warmed while runtime LOGIN remains closed before leases.
The corrected five focused execution cases pass, and the composed artifact
restore case passes with all seven kinds; four other restore cases were deliberately
unselected in this narrow follow-up. The original not-found failure remains retained.

### Participant and MCP work-recovery authentication — 2026-10-19

The actual platform-bound work target now supports independently authenticated
panel/partner canonical reads. Configured credentials select the fixed principal;
active membership, role, partner organization and short-lived session are read
from the database. Customer grants remain domain decisions. Probe cleanup and
restart reconciliation retain the actual principal plus original secret preimages;
legacy mcteer journals remain readable without granting authority. The thirteen-case
owned PostgreSQL target suite passes in `work-participants-v2-private.json`, including
wrong passwords, foreign customers, revoked grants and membership loss. The initial
run retained one strict-scope argument failure; narrowed scopes correct it without
relaxing validators.

A work-target MCP reader authenticates the actual persisted bearer and invokes the
same modern SDK handler as ordinary MCP. Its fixed origin/path, bounded body,
transaction deadline, category/customer policy and post-read credential validation
remain mandatory. Public MCP admission, quota leases and audit remain unchanged;
this private owner reader does not prove their hosted operation. The focused actual
SDK check passes in `work-mcp-v4-private.json` with accepted facts, two-page customer
scope and credential revocation. Earlier failed fixtures retained duplicate-profile,
deferred-scope and paired-revocation constraint errors. Eve bundle validation first
rejected dynamic imports; static imports pass `build:eve:check`. Additional same-read
revocation and wrong-bearer assertions and the complete target suite are pending.
The catalog also removes two accidental semicolon entries that were never tests;
no execution is inferred from catalog metadata. T096/T097 remain incomplete; no
actual work target has been locked, migrated or reopened by these checks.

The complete expanded work-target suite now passes **14/14**, with no skipped cases
(`work-participants-mcp-v5-private.json`). This includes wrong bearer, fixed-path
rejection and revocation inside the read before result release. The unchanged
ordinary MCP acceptance runner also passes **54/54 in19 suites**, including all three
actual SDK consumer suites and a local production runtime, with zero paid calls
and hosted proof false (`work-mcp-public-consumer-v1-private.log`). Root/pilot types,
Eve bundle validation and documentation checks pass. The suite deadline inventory
accounts for all fourteen declared210-second cases. Current catalog is851cases in154
suites; a fresh complete current-source catalog remains required.

### Learning draft timeout phase diagnostics — 2026-10-19

The c6334b0 pilot predecessor CI failed its30-second learning-draft case without
an action location; the cause remains unproven. Fixed test-step names now identify
open/prepare/verify/audit/cancel/partner-denial phases. The bounded shared browser
parser reads both single errors and error arrays, strips private prose and admits
only fixed phase names through both predecessor aggregators. Assertions, actions,
retries, accessibility rules and deadlines are unchanged. Existing diagnostic
privacy tests pass3/3. The affected journey passes4/4 across desktop/mobile WebKit
light/dark in its owned production runtime (`learning-draft-phases-webkit-v1-private.log`);
this development subset does not establish the complete predecessor gate or CI.
Root types and documentation checks pass.

### Real-target required-service ledger inventory — 2026-10-19

The real-work inventory now shares the bounded record/classification implementation
with owned restore verification, while retaining separate target constructors.
Owned callers still require the original exact restore and physical-byte proof.
Work callers require the genuine platform-bound client and ordered READ COMMITTED
fences, derive required descriptors and every record before owner filtering, and
explicitly return required-original verification, service health and readiness
false. Unsupported/missing owner scopes remain failures rather than reduced coverage.
The focused real-database work case passes1/1 (`work-inventory-v1-private.json`),
including removal of the owner scope; thirteen unselected cases are not counted.
Root types pass. The first composed owned attempt omitted its explicit preparation
input and failed before verification; its report remains retained. A corrected
seven-kind regression is running. T096/T097 remain open.

The corrected composed owned regression passes1/1 (`owned-inventory-shared-v2-private.json`),
covering the actual seven-kind maintenance application; four unselected surfaces
are not counted. Root/pilot types and documentation checks pass, and independent
review found no blocker. The work inventory continues to make no physical-byte or
service-health claim.

### Participant maintenance HTTP — implementation in progress

The work-only HTTP issuer now authenticates configured panel/partner credentials
and registers exact cleanup preimages through the shared session constructor.
Runtime admission reconstructs the current role from fixed principal IDs and live
membership/organization rows; canonical customer and audience policies remain the
retrieval authority. The original owned and mcteer-only issuers retain their guards.
Root types pass; the complete target suite is running with internal/partner HTTP
positives and grant-loss withholding. No hosted acceptance is claimed.

The complete participant HTTP target suite passes14/14 with no skips
(`participant-http-v1-private.json`): real restricted-runtime handlers return200 for
panel and an assigned partner, then404 after grant revocation, with every probe
retired. Root/pilot types, authored Eve bundle and independent review pass. This
handler/database execution is local controlled-cloud coverage, not hosted HTTP
acceptance or complete required-service/reopen proof.

### Restricted-runtime maintenance MCP transport — 2026-10-19

A fixed POST maintenance endpoint now requires a finite owner-issued HTTP admission,
its independently authenticated browser session and the actual MCP bearer for the
same principal, membership, workspace and sealed connection scope. Unreleased079
metadata binds the connection ID, scope digest and membership with explicit NULL
checks. The ordinary MCP endpoint remains closed during recovery. The dedicated
runtime capability rechecks the bearer and HTTP admission after the shared SDK
reader; MCP admissions cannot create the generic browser-read capability. Request,
response, transaction and absolute deadlines remain bounded, and admission allowance
commits before reader failure. Existing owned constructors retain their guards.

The actual SDK check through the restricted-runtime handler passes1/1 with thirteen
unselected cases (`mcp-http-v1-private.json`). The production application/actual HTTP
check also passes1/1 (`mcp-http-network-v4-private.json`): current identity and accepted
profile facts, foreign cookie/secret/Origin denial, bearer revocation, retired probe
denial and ordinary locked MCP denial. It executes actual local HTTP and both
production builds, not hosted acceptance. Failed attempts remain retained: a new
fixture TypeScript error; an added URL-origin equality check rejected the production
request; and a manual probe omitted required SDK protocol negotiation. Host and
configured deployment binding remain mandatory, and an explicit Origin header is
checked against configured app origin. The actual SDK performs negotiation without
retries. The complete target regression is running. Current catalog is852cases in155
suites; fresh complete proof and a new actual079 migration rehearsal remain required.

The complete current target regression passes14/14 with zero skips
(`mcp-http-target-v2-private.json`). Expanded actual network verification passes1/1
(`mcp-http-network-v5-private.json`), additionally rejecting a valid distinct MCP
connection paired with this admission, checking the serving code-version header,
and retiring both fixture connections. Root/pilot types, catalog/deadline tests,
production builds and documentation checks pass; independent review found no
remaining authorization blocker. Full required-service, Workflow/effect composition,
actual hosted acceptance and the authoritative reopen producer remain pending.

### Actual work maintenance HTTP batches — 2026-10-19

The work controller now owns finite one-to-eight-record measurements against its
independently verified exact platform/deployment/source/database target. Every
batch derives the whole seven-kind ledger before selecting records, compares
canonical accepted profile/plan/execution projections or exact original digest,
bytes and attachment headers, checks foreign-secret/wrong-kind/ordinary-route
and retired-probe denials, and requires the serving commit on every response.
It retires and independently rechecks all canonical and HTTP sessions; original
read and retirement failures are retained together. A capability is branded only
after the target constructor completes its final verification and cleanup.
Composition rejects JSON copies, stale or changed-target/current-inventory proof,
and live probes. Batches deliberately retain false full-service/readiness flags.

The complete target check passes15/15 (`work-http-batch-target-v3-private.json`),
including corrupt HTTP payload, changed inventory, forged proof and interrupted
record retirement with independent cleanup. Root and pilot types pass. Independent
review found no remaining blocker. The controlled target fixture runs actual route
and restricted-runtime domain code, not actual hosted HTTP. Current catalog is853
cases in155suites. The shared projection extraction preserves the owned verifier.
Two broad owned attempts retain their existing180-second environment interruption
failures; they do not count as passes. A further targeted run removes unnecessary
MCP precompilation from the seven-kind owned verifier; the independent actual MCP
network check remains separate. Full T096/T097, final current-source catalog,
hosted release/participant observations and cleanup remain pending.

The third attempt still exhausted the180s outer environment. This case composes
a120s boundary runner and separate150s all-record measurement inside that outer
bound. Artifact/command environments now have300s; the unchanged420s case and2160s
suite bounds,60s runtime leases,150s measurement and every assertion remain fixed.
The new in-transaction exact-union consumer rejects duplicate/missing records and
original bytes while retaining false full required-service/readiness.

The corrected composed owned regression passes1/1 (four intentionally unselected
independent surfaces) in `work-http-projections-owned-v4-private.json`; target
regression passes15/15 again in `work-http-batch-target-v4-private.json`. Exact-union
coverage, protected CLI, root/pilot types, documentation and suite-deadline checks
pass. Independent review found no concrete blocker. Earlier interruptions remain
retained as failures. This is local proof and does not complete hosted service.

### Five-category restricted-runtime SDK network coverage — 2026-10-19

The actual HTTP/SDK check now exercises all five read categories: accepted profile,
current original evidence passage and credential-bound citation, published shared
knowledge, accepted delivery plan and normally rendered/published weekly report.
The existing knowledge fixture optionally binds a validated active owned workspace;
its normal reviewed acceptance/publication flow is unchanged. Plan, execution,
report rendering, brand review and publication use the governing domain commands.
A separate finite admission/client follows retirement of the original probe; both
retain ten-request and59-second bounds. Synthetic deny-only source withdrawal
with the worker stopped withholds the earlier citation. Existing foreign credential,
Origin, ordinary locked MCP, revocation and retired-probe checks remain.

`mcp-http-network-v7-private.json` passes1/1 with actual local HTTP and production
builds. The v6 attempt failed before HTTP because the owned environment cleared the
explicit renderer setting; that original failure remains retained. This establishes
local restricted-runtime behavior, not actual hosted acceptance or real participant
observations. `work-http-batch-target-v5-private.json` separately passes1/1 with14
unselected cases, now measuring the remaining current profile records and consuming
the exact union successfully as well as rejecting partial/duplicate/forged coverage.
Catalog remains853cases/155suites. Post-quarantine fresh SDK credentials, complete
service/Workflow/effect composition and T097 remain pending.

### Fresh post-quarantine MCP probes — 2026-10-19

Captured MCP credentials intentionally remain permanently removed by authority
quarantine. The work-only issuer now applies genuine authenticated retained current
v7 denials before generating a new bounded MCP identity. Actual configured
participant passwords, active memberships/organizations and canonical current
customer ceilings remain mandatory. The original owned guards and ordinary MCP
management lock remain. Shared MCP issuance retains the ten-active-connection cap,
existing category/customer ceilings and scope digest. Probe connection, session and
HTTP admission are created atomically under a savepoint; bearer and admission
secrets are independently generated and journaled before insertion. All lifetimes
remain at most59seconds and ten HTTP requests.

Unreleased079 adds a durable original bearer digest and a probe-connection marker
to the existing owner-controlled HTTP admission. Runtime auth rechecks the original
bearer hash. Exact preimage/scope/creation/expiry/customer bindings constrain
independent cleanup and restart; global durable probe checks reject a surviving
connection even when a supplied journal omits its identity. Probe revocation clears
its credential while retaining original hash evidence. Existing v2 session/admission
journals remain supported; new MCP journals use v3 intent/v2 credential contracts.
Migrations001–077 remain unchanged; the079 manifest digest is updated.

`work-http-fresh-mcp-target-v1-private.json` passes1/1 with15unselected cases: actual current
v7 capture, encryption, a distinct owned archive database, immutable retention,
actual cold-reader capability, quarantine, rejected receipt clone/password,
restricted-runtime SDK profile read using a NEW bearer, and original-identity
retirement after lost acknowledgement and restarted reconciliation. Only provider,
key transport, DNS and deployment/source attribution are controlled; this is not
hosted independent placement or actual hosted acceptance. Complete target, ordinary
MCP acceptance, authored bundle, updated network and catalog checks are pending.
The full catalog now contains854cases in155suites. T096/T097 remain open.

The complete target checkpoint passes16/16 in
`work-http-fresh-mcp-target-v2-private.json`; actual production-build five-category
HTTP check passes1/1 in `mcp-http-network-v8-private.json`. Ordinary MCP acceptance
passes54/54 in19suites, including three actual SDK consumers and its production
build (`fresh-mcp-public-consumer-v1-private.log`). Review found one recovery-only
scope-validation omission: customer categories with no customers were accepted.
Recovery now reuses the normal category/customer schemas and shared refinement.
Contract/deadline checks pass6/6, and the corrected focused target passes1/1 with15
unselected cases in `work-http-fresh-mcp-target-v3-private.json`.

Expanded `work-http-fresh-mcp-target-v5-private.json` passes1/1 with15unselected:
actual fresh internal and assigned-partner bearer SDK identity/nonempty profile
reads, unassigned-customer denial, and grant-loss denial that does not revive the
revoked grant. The v4 fixture attempt failed before issuance on an automatically
created profile-state row; its idempotent setup correction retains the failure.
These focused post-review results supplement the earlier checkpoint rather than
relabeling its54-test source fingerprint as the final source. Types and docs pass;
final complete current-source catalog, actual079 rehearsal, hosted acceptance and
T096/T097 composition remain pending.


### Recovery decision transaction boundary — 2026-10-19

Added a separate exact-target decision transport while preserving the existing
measurement transport. The controller starts READ COMMITTED, retains the same
transaction, checks retired sessions/admissions/MCP probes, revalidates clean
source and actual platform/deployment identity, then commits. Cancellation or
failure closes the writer before independent cleanup. The callback receives only
SQL-string/parameter query IO; caller query objects, transaction commands and
unsupported quoting fail closed. The controller fixes standard string quoting.
Only the canonical local timeout settings are admitted.

Independent review identified query-object submission/getter bypasses and
PostgreSQL CR, Unicode-dollar-tag and escape-string continuation differences.
The wrapper no longer forwards query objects; unsupported escape, Unicode-quoted
and dollar-payload syntax is rejected. Regression cases exercise pending writes,
source/platform drift, cancellation, commit attempts, CR/dollar/escape payloads,
and untouched getter/submit hooks against actual owned PostgreSQL.

Protected authoring receipts: `recovery-decision-target-v2-private.json` passes
all17 target cases without skips (before the final parser restrictions);
`recovery-decision-target-v4-private.json` passes the final focused transaction
case with16 unselected; `recovery-decision-sql-v4-private.json` passes3/3 unit
cases. Pilot types pass. Current catalog858cases/156suites; no final catalog
execution is inferred. Frozen1e5e1b5 passed851/851; frozen7955427 (854cases)
continues separately. These receipts are local, not hosted acceptance.

T096/T097 remain incomplete. This transport does not produce a healthy
verification, resolve quarantines, open service or establish cross-platform
atomicity. The external maintenance perimeter and explicit release checks remain
required. Actual-target lock/release and cleanup have not occurred.


### Current work SDK category and scope measurements — 2026-10-19

Added actual fixed-origin SDK category walks compared before/after with the
canonical governed reader through the actual SDK. Category pages, records and
citations are exhausted; opaque capabilities are exercised, not trusted as
content. New distinct authenticated admissions keep original MCP expiry and
existing quotas fixed. Every original/additional session/admission/MCP identity
is journaled, retired and rechecked. Full service remains false.

Final consumption derives current role/workspace/customer category scope first,
rejects missing/duplicate/forged proofs, reauthenticates current credentials and
replays all canonical projections under ordered fences and table SHARE locks.
Credentials group up to100 current customers, allowing more than32 category
measurements without increasing the32 final-identity limit. Exact census and
credential-ceiling projection equivalence are checked. Current content/grant
changes and reactivated probes invalidate prior proof. The bounded30-minute
network observation window additionally requires a five-minute actual transport
canary per participant/customer chunk; it is not fresh HTTP for every category.
Actual hosted capacity remains unverified.

Protected authoring `work-mcp-category-target-v13-private.json` passes the final
focused local case in75.9seconds, with17 unselected cases at that checkpoint:
all3 roles (mcteer, panel and assigned partner),47 category scopes,5 published
knowledge records,12-call category admission rotation, exact union inside the
pending decision transaction, and drift/forgery/denial/retirement boundaries.
Earlier v1/v2 exposed hand-authored protocol-envelope failures; v3/v4 passed
canonical SDK and drift checks; v5/v6 had a controlled test-route mismatch; v7
passed; v8/v9 exposed the initial eight-call category bound; v10 passed distinct
admissions/grouped union; v11/v12 passed bounded fixture/rotation expansion.
Failed receipts remain retained. None is hosted participant proof.

The2 new recovery decision cases now live in their own480-second suite;
existing16 target cases keep their3540-second suite bound. The original strict
sub-hour suite contract, per-case/domain limits and90-minute catalog remain.
Current inventory859cases/157suites. Final full source catalog, managed
Workflow/effects, the authoritative producer and actual release remain pending;
T096/T097 stay open. Cleanup has not occurred.

The split suite now passes2/2 with no skips in
`work-recovery-decision-split-v1-private.json` (90.8seconds total case time).
`work-recovery-metadata-v1-private.json` passes6/6 deadline/SQL cases. Root and
pilot types and documentation hygiene pass. The earlier unsplit18-case receipt
remains a separate checkpoint; final catalog execution is still pending.

### MCP CI discovery import repair — 2026-10-19

The7955427 MCP WebKit failure was reproduced locally. Retained discovery output
identifies Node24 rejecting the recovery replay JSON import without a JSON import
attribute. Ordinary MCP management had eagerly loaded owner-only recovery
platform/CLI dependencies. Its recovery target import is now type-only, with the
genuine registry check loaded only when the private recovery issuer executes.
The replay JSON import also carries the required attribute. No authorization,
model, role, quota or ordinary MCP admission changes.

`mcp-ui-discovery-fix-full-v1-private.log` records32/32 WebKit cases across all4
configurations, zero skips. `mcp-discovery-fix-acceptance-private.log` records54/54
cases in19 suites, including3 actual SDK consumer suites against the production
runtime. Both bind source digest
`817b5496d2f1ad9d8590a4f99cac672d074d676f042705229939bf8f28cbead2`.
`recovery-mcp-import-fix-private.json` passes2/2 recovery decision/SDK cases after
the lazy import repair. The first discovery-only invocation selected nonexistent
filenames and reported no tests; the corrected manifest filenames discover with
zero errors. Discovery stdout/stderr/process metadata are now retained privately,
with fixed safe failure fields printed, so future import failures remain diagnosable.

The earlier unsplit target checkpoint `work-mcp-category-target-v14-private.json`
also passes18/18 with no skips. Its filename/case inventory predates the suite
split and is not the current catalog. Hosted checks, final source CI/catalog,
remaining Workflow/effect/authoritative producer and release remain pending.


### Automated role exercise contract — 2026-10-19

The user's explicit directive to automate operator/internal/assigned-partner
exercises supersedes the former human-only acceptance clarification. The spec,
plan, tasks, journey catalog and runbook now require actual hosted automated
observations, truthful method labels and independent capture review. A separate
release decision remains required.

`pilot-feedback-record-v2` preserves immutable hosted capture provenance with
`humanReported:false`; existing v1 human reports and their canonical digest order
remain compatible. G20/G21 use `automated-role-exercise`, requiring the same exact
hosted identity/schema/grant attribution and freshness as hosted receipts. The
recorder still validates current synthetic workspace, identities and partner grants.
No observation record grants release approval or proves its referenced capture by
itself. Actual hosted runs and independently reviewed capture evidence remain open.

All34 focused feedback/readiness/deadline checks pass, root and pilot typechecks
pass, and authored documentation checks pass. Independent review found no concrete
blocker. The first focused contract attempt exposed a canonical property-order
compatibility regression; it was corrected before the passing run. No actual
hosted exercise is claimed by this local validation.


### Recovery deadline ownership and nested evaluation setup — 2026-10-19

The decision transport owns one aggregate transaction deadline from the original
remaining target lifetime. Each canonical MCP request retains its independent
10-second bound; expiration cancels the actual pending writer and independent
cleanup verifies rollback. Callback SQL cannot reset `transaction_timeout`.
Completed read listeners are removed so their later expiry cannot cancel a new
read. All six focused decision/SQL cases pass, including all47 current role/customer
category scopes, two successive six-second statements after canonical reads, and
pending-write cancellation. Earlier compound fixture timeouts remain failures;
the fixture uses a140-second target and150-second input within its unchanged
180-second parent/210-second case bound. No domain/read/credential bound changed.

The frozen7955427 full catalog stopped at suite117: the nested evaluation app's
Turbopack filesystem root excluded the physical target of its dependency symlink.
The shared disposable-config helper now computes the common physical ancestor for
pilot/artifact/retrieval/plan copies, preserves authored options and rejects unsafe
file/configuration shapes. All five focused setup unit checks and all three
actual evaluation-source integration cases pass. These checks do not turn the
failed historical full run into a pass. A fresh complete862-case/157-suite run
remains required. Independent review found no concrete blockers in both fixes.


### Real-target physical integrity component — 2026-10-19

The new real-target component authenticates actual encrypted bundle bytes and
native client manifests, binds the candidate configuration to the actual work
project/private store, and compares the complete installed ledger, portable
restored database content, six-namespace original bytes and runtime grants.
Measurements exist only after the genuine target controller's final checks.
The final decision consumer rejects serialized copies and rechecks archive/key,
native/store/project identity, ledger, grants and current required originals.
It preserves the pre-quarantine physical content checkpoint separately from
current denial/probe changes; current service/Workflow/effect verification still
must compose before an authoritative verification can be written.

All four recovery-decision integration cases pass. The new case uses actual
owned PostgreSQL18, real licensed native asset hashes and actual authenticated
encryption/archive bytes; only cloud/platform and Blob SDK transport are
controlled. It rejects forged capabilities, altered original bytes, tampered
archives, wrong keys, changed runtime grants, unsupported OIDC input and capture
bound overflow. It confirms control remains locked and no recovery verification
is created. This is local component proof, not actual hosted recovery readiness.
The registered inventory is863cases/157suites; complete current-source verification
and actual hosted acceptance remain outstanding.


### Genuine terminal provider inventory — 2026-10-19

The real-target component now binds the actual managed provider internally,
requires every current application run identity in complete repeated provider
lists, verifies every enumerated run's terminal readback, inventories all project
deployments twice without target/status/branch filtering, and repeats the run
inventory after deployment traversal. Final consumption repeats actual live
observations under the genuine decision fences and rejects copied or changed
proofs. Unknown/active/omitted runs and missing referenced deployments fail closed.
This component performs no cancellation or other provider write.

All five decision integration cases pass, including actual owned PostgreSQL with
controlled cloud HTTP metadata and rejection of changed project/deployment/native
inventories. Root/pilot types and34 focused contract/deadline checks pass.
Independent review found no blocker for this scoped component. It remains drift
detection rather than a provider-atomic snapshot; old HTTP/cron admission,
independent closure journals, effects and the final authoritative producer remain
separate requirements. Its old-host/effect/readiness flags remain false.
The registered inventory is864cases across157suites; no full current-source or
hosted completion is claimed.


### Alias census and effective host-policy parser — 2026-10-19

The project-wide alias adapter traverses all aliases twice without branch or
target filtering, rejecting routing ambiguity, foreign bindings, duplicate
identities, cursor errors and inventory drift. The exact DNS parser rejects
URLs, paths, whitespace, credentials, wildcards and unsupported ports. The
effective-policy parser accepts only the first and sole enabled, valid,
unconditional host-not-in deny rule with an exact canonical allowlist; unknown
policy fields, bypass rules and IP overrides fail closed. Neither helper grants
HTTP closure or recovery readiness.

All18 focused alias, policy, deployment and deadline checks and pilot types pass.
A read-only actual project alias census returned80 entries in each complete
traversal, with identical digests. Active firewall version1 remains unchanged.
The conditional-bypass endpoint explicitly reports the feature unavailable for
this team; that diagnostic is retained rather than represented as an empty
inventory. The actual system-bypass endpoint returns an empty result. These
control-plane observations do not establish current HTTP admission closure.
Independent review found no blocker; its raw hostname delimiter comment was
addressed and checked. The registered inventory is872cases/159suites. Fresh full
source verification, composed current-host/old-host proof and hosted acceptance
remain pending.


### Complete host union and fixed policy reads — 2026-10-19

The genuine terminal metadata component now measures all project aliases and
the complete union of live alias and immutable deployment hosts. Missing listed
deployments cannot remove live alias hosts; conflicting ID-to-immutable-host
bindings and redirects fail closed. Final consumption rederives alias/host
digests and host count. The focused owned PostgreSQL18 integration passes,
including changed-alias rejection. Four host-union unit checks pass. Review found
and corrected an alias-only conflicting immutable-host binding; its regression
now passes.

A fixed GET-only Vercel policy adapter binds the actual project/team, reads the
active sole-deny policy and retains exact unsupported-conditional-feature and
empty-system-bypass observations. It rejects arbitrary authorization errors,
newly enabled unsupported feature states and nonempty/paginated exceptions.
All four adapter unit checks pass. The actual adapter read the current hosted
version1 policy without mutations; its private receipt explicitly reports HTTP
closure and restoration readiness false. Independent review found no remaining
blocker in these scoped components. Current root/pilot types pass. The registered
inventory is880cases/161suites. Actual approved-host bindings, valid bypass
controls, complete bounded HTTP traversal and final current-policy equality
remain required before an HTTP admission closure proof can be issued.

The complete five-case owned PostgreSQL18 recovery-decision suite also passes
after host-union integration, with no filtered or pending cases (private
`work-managed-host-union-v3-full-private.json`). The earlier v1 harness setup
failed before tests because it requested an upgrade of an already-current owned
fixture; its log is retained. Focused v2 and complete v3 use the current fixture
directly. This remains local component evidence.


### Actual approved-host bindings — 2026-10-19

The fixed read-only host binding adapter now resolves every exact allowlisted
host through Vercel's deployment API. Only the selected source/target deployment
or the actual project's current Production baseline is eligible. It checks
READY/source/project/team consistency, matching per-host deployment metadata,
selected-host coverage and a final current-Production project readback. Four
focused cases pass, including old/foreign/source/Production drift, malformed or
duplicate hosts, missing selected-host and cancellation rejection. Root/pilot
types and docs pass; independent review found no blocker.

The actual adapter resolved all four current allowed hosts to the real current
Production baseline, without application requests or mutations. Its private
receipt reports protection-credential verification, HTTP closure and readiness
false. This diagnostic does not prove the unreleased candidate and must be
repeated in final composition. The current registered inventory is884cases
across162suites; full current catalog and hosted acceptance remain outstanding.


### Version-bound protection controls — 2026-10-19

Provider-derived approved bindings now carry process-local provenance and a
five-minute exact-scope freshness limit; copied receipts cannot authorize
application probes. The control component requires an actual Vercel challenge
without credentials, then header, query and freshly provider-issued scoped
cookie access to the exact release's unauthenticated session boundary. Every
request requires admission before dispatch and a bounded response observation.
Foreign redirects, revoked tokens, unprotected hosts, wrong releases and denied
admission fail closed. Eight focused binding/control cases pass, with no
credential or cookie in resulting receipts; independent review found no blocker.

The actual baseline control failed after two requests, retaining both intents
and the original cost hold. A separately journaled single diagnostic within the
original five-request allowance reached401authentication_required but found no
code-version header on the currently deployed pre-pilot Production build. This
is a failed control rather than release proof; the version requirement remains.
Three requests total were dispatched in this local control journal, without
automatic retries, billing changes or resetting the historical strict census.
The initial local runner import error occurred before any request and is retained
separately. Actual candidate controls remain required after deployment.
The inventory is888cases across163suites; full current-source and hosted
acceptance remain incomplete.


### Private complete host and automation registries — 2026-10-19

The fixed project-host reader now privately registers actual complete repeated
deployment/alias host inventories, revalidates ownership, deep freezes host rows
and enforces an original-start five-minute freshness bound. A copied, foreign or
stale inventory cannot authorize credential-bearing probes. Active-policy reads
also retain the actual project's automation registry privately: only a fresh
genuine read can enumerate1–4 strictly supported current keys. Receipts contain
a registry digest rather than keys; empty, unknown-scope and unknown-field
registries fail closed.

Seventeen focused host-inventory, policy, binding and protection-control checks
pass, including forged/stale metadata and unknown-registry failures. Pilot types
pass. Independent review found no blocker in the metadata components and
identified a requirement for upcoming custom-domain probes: alias membership
alone does not authenticate the DNS transport destination. No automation secret
was sent to a custom domain. Safe provider-edge transport and actual complete
HTTP closure remain pending. The registered inventory is893cases/164suites.


### Bounded post-protection HTTP census components — 2026-10-19

The native HTTPS transport withholds credential-bearing headers until normal
certificate/hostname authorization and connected-peer checks succeed. Only a
genuine exact-release immutable provider-host response can mint a five-minute
edge pin. Custom-domain requests retain their own Host/SNI/certificate checks
but connect exclusively to that measured edge address, without custom DNS,
proxy, redirect, socket reuse or address fallback. Query/header/body/time bounds
fail closed. Five transport cases pass, including moved DNS, wrong peer or
certificate, pin forgery/expiry and cancellation before header flush. An actual
TLS diagnostic reached the existing pre-pilot Production401 boundary but
correctly refused a pin without its missing version header. It consumed the
fourth of the original five control requests, retaining the failed attempt and
unknown cost hold; no custom-domain credential request occurred.

The census components cover every excluded immutable/alias host and every
current automation key's header, query and newly provider-issued scoped-cookie
forms. Ordinary authentication challenges remain distinct; post-protection forms
require explicit edge403 with no application version or redirect. Workers abort
and settle completely on failure. A private sequential repeat and actual fresh
policy/alias/deployment reads started after its final response are required at
consumption; monotonic process order prevents cached receipts passing on a wall
clock tie. Six compound controlled-transport cases pass, including full coverage,
forged/incomplete inputs, boundary failures, stopped admission and current drift.
These are component checks, not actual full hosted HTTP closure.

The new cumulative private request journal spans controls and both censuses;
exclusive chained intents are file- and directory-synced before admission. Root,
parent, plan and observations also receive directory persistence. Review found
and corrected the missing directory-sync issue. Five real-filesystem cases pass,
including restart with consumed pending requests, concurrency, exact immutable
observations, stale instances, tampering and injected directory persistence
failure. A compound case records all25 controlled requests through one journal
and verifies25/25 observations, zero remaining capacity and identical reopened
state. No cost authority, settlement or release approval is granted by the
journal. Full scope/spending binding belongs to the pending genuine target
controller. Independent reviews found no remaining blocker in these scoped
components. The registered inventory is909cases/167suites; full current catalog,
actual candidate controls, real-work composition and hosted release remain open.


### Genuine work-target repeated HTTP admission — 2026-10-19

The work-target component now performs actual fixed-provider metadata reads and
protected controls under the genuine owner decision fences, then consumes a
distinct complete repeated census inside the final decision. Both phases share
one original factory-authenticated exact-project/team/source journal; its plan
is immutable and its protected on-disk digest is checked again at consumption.
Initial admission reserves enough remaining capacity for both measured phases.
Copied proofs, foreign journals, changed metadata and exhausted budgets fail
without granting unlock or verification authority.

All six owned PostgreSQL18 decision integration cases pass, including the new
controlled-provider/edge case: a29-request cap is rejected before HTTP, the
30-request original journal records15 initial plus15 final observations, copied
proofs fail, and exhausted admission sends no further requests. The database
remains locked with zero verification rows. Root/pilot types, documentation and
eight journal/deadline checks pass. These are owned integration results; actual
candidate hosted controls, cron/native admission, held-effect safety and full
service composition remain required. Inventory:910cases across167suites.


### Installed enforcement and conservative accounting audits — 2026-10-19

The genuine locked-owner decision now inspects14 authored hold, admission,
settlement and cost triggers, their actual function bodies/security/ownership,
the original output-used SQL function and effective table/column accounting
authority for both legacy and replacement runtime roles. An owned check rejects
a disabled trigger, a replaced guard or quota function, and direct column/table
grants to either runtime role. No migrations execute during the audit.

The typed-model audit compares all current and independently retained ordinary
and parity operations, holds and observations. Original ceilings, scopes,
baselines, known higher exposures and the retained parity reservation floor
cannot disappear. Baseline-only conversations are checked even without operation
or hold rows. Unknown amounts remain held; no settlement/refund or model call
is performed. A separate database audit rejects active attempts, send retries,
schedules, budgets, watchdogs, hosted/local jobs and the complete physical lease
inventory. Provider execution and ingress remain separate obligations.

Independent review found and corrected replacement-role grants, the retained
parity reservation floor, baseline-only quota resets and omitted hosted/worker
leases. It found no remaining blocker in these scoped components. The owned
eight-case decision suite passes before the final hosted-dispatch negative;
the latest focused case passes that negative and all typed-model boundary checks.
The final complete rerun atc2dd664 passes8/8 with zero pending cases. Root/pilot types and documentation checks
pass. The catalog is912cases/167suites. These audits do not establish all paid
effect accounting, provider/cron closure, required service, hosted acceptance
or unlock authority; T096/T097 remain open.


### Original operational service-cost accounting — 2026-10-19

The scoped service-cost audit consumes genuine fresh independently retained
metadata under the genuine owner decision. Exact original budget authority,
pricing, ceiling and expiry remain bound; every original reservation retains its
operation, provider job, dispatch identity and full unknown ceiling. Original
settlements require the same immutable receipt digest and matching charge/kind.
All original service budgets remain revoked; cardinality changes, substituted
identities or refunds fail closed. This never settles a charge or stops compute.

The retained v7 metadata capture now includes missing nonsecret budget/pricing
digests, operation/job IDs and typed learning ceiling fields. Old captures
missing required metadata cannot establish the new audit. Independent review
found no blocker in this scoped service accounting proof. The owned PostgreSQL18
case passes with one unknown reservation and one actually inserted controlled
settlement receipt; reducing an original ceiling with guards restored is refused.
No provider/model calls or real cost settlement occurred. Types pass; the new
inventory is913cases/167suites. Full current catalog and hosted acceptance remain
open, alongside original learning accounting, native/send effect identity,
execution/ingress closure and the authoritative producer.


### Original learning financial journal audit — 2026-10-19

The genuine owner audit now verifies every original learning budget's scope,
limit and price-contract hash, requiring closed/blocked state. Current and
independently retained reservation, settlement, provider-dispatch and release
inventories must have identical cardinality and complete immutable row digests.
This preserves native IDs, original ceilings and timestamps rather than
reconstructing or settling missing provider work. Every unsettled/unreleased
reservation retains a same-environment immutable hold; inherited holds cannot
change and held reservations cannot be released.

The owned PostgreSQL18 check passes with an actual governed synthetic learning
reservation. Removing its unknown-cost hold with enforcement restored before
the audit is refused; restoring its exact original bytes passes. Zero settlement
or release rows are created. Independent review found no blocker in this scoped
accounting audit. Root/pilot types pass. Inventory:914cases/167suites. No actual
model/provider work was dispatched. Native/send identity, execution/ingress,
full service composition and hosted acceptance remain pending.


### Original native and delivery business-key fences — 2026-10-19

The explicit replay contract and unreleased079 migration now include response
attempts, watchdogs, research runs/operations and report deliveries. Their full
unconditional ordinary unique keys are captured and fenced, including original
message IDs and publication/recipient pairs. A fresh row or provider key cannot
recreate the same original effect after a missing post-backup row. Partial and
expression indexes remain excluded; no conversation/actor-wide fence is added.
The manifest binds the revised079 bytes;001–077 remain unchanged. Both runtime
roles must lack table and column write authority over replay fences, including
TRUNCATE; a direct replacement-role grant is refused without executing it.

The current v7 verifier rejects explicit tables missing primary replay metadata,
and actual owner audits require their complete installed eligible index set.
Historical captures omitting new business keys cannot establish current proof.
The focused actual PostgreSQL18 native case passes: restored runtime watchdog
lease UPDATE and a fresh attempt ID for a missing original message receive the
specific replay denial; owner deny-only cleanup and a distinct new message
remain possible. Incomplete business-key metadata is refused. The real-domain
synthetic publication/recipient-policy/outbox case also passes: after removing
the original queued delivery, a fresh delivery/provider key for the same
publication/recipient receives the specific replay denial. No email was sent.

The initial outbox test used a stale local renderer tag and failed actual output
binding validation; it remains retained. The rerun uses the prepared immutable
76de renderer and normal reviewed/rendered records, without weakening validation.
The prior full nine-case decision suite at2dc774d passes9/9. Latest native and
outbox cases pass individually; full current916case/167suite and hosted proof
remain pending. This closes scoped replay omissions, not provider execution,
all effect reconciliation, required service or release acceptance.


### Sandbox terminal metadata and final-decision timeout composition — 2026-10-19

The work-target Sandbox component consumes actual fixed SDK metadata reads under
genuine owner fences, including both current and independently retained original
job/provider/creation-tag bindings. Two complete unfiltered project traversals
and individual non-resuming terminal readbacks must agree. A retained known
provider reference absent from the database/list requires an actual exact404
not-found read. Private proof provenance is registered only after outer platform,
source and cleanup checks; final consumption repeats actual measurements.
The fixed SDK transport permits only exact project/team metadata GETs, prevents
network retries, bounds bytes/pages/time and refuses unexpected resumption.

Owned PostgreSQL18 plus actual SDK protocol over controlled transport passes
pagination, provider-only resources, retained missing references, proof forgery,
active compute, cycles and failed-read one-wire-attempt checks. The latest
unexpected-resumption negative awaits the complete rerun. A read-only live
diagnostic exposed the provider's50-item page cap; initial400 diagnostics remain
retained and the reader now uses50. A subsequent actual project diagnostic
observes11stopped resources and zero active compute. Two real complete SDK
traversals plus individual non-resuming readbacks agree across24 metadata GETs.
This diagnostic has no locked-target proof or hosted-acceptance claim.

The component explicitly measures the whole project and applies no other-
environment exclusions. It cannot authorize pausing unrelated Production work;
if another environment has active resources, authenticated scope classification
would be needed before target-only composition. Resumption admission, paid
effects and restoration readiness remain false. No provider writes or model
calls occurred.

Maintenance inventory derivation now preserves the genuine controller's original
aggregate transaction timeout while retaining standalone60-second and local
lock/statement bounds. An owned integration case derives the actual inventory
and verifies the SQL timeout remains unchanged. Initial test instrumentation
used unsupported SHOW syntax; its corrected SELECT current_setting check passes.
Independent review found no blocker in these scoped components. Root/pilot types
pass. Inventory:917cases/167suites; full current catalog and hosted release remain
open.

### Recovery admission and interrupted plans — 2026-10-19

Restored prepared/running plan drafts now become unconfirmed during quarantine;
original attempt/model identities remain intact. The owned PostgreSQL regression
passes without provider dispatch. Current-schema unbound root model steps now
fail before returning a provider; supported normal/governed/planning bindings
retain their existing admission paths. This removes the naked fallback whose
resolver-only open check could race a later recovery lock. An actual authored
resolver regression passes for open079 denial, locked079 denial and preserved077
selected-model fallback. No model selection changed or provider calls occurred.
Pilot typecheck and docs pass. Inventory is919cases across167suites. The prior
646854a full13 recovery-decision cases and both builds passed; the expanded full
catalog and actual hosted release remain pending.

Native terminal measurement now requires genuine independently retained authority
and unions its original conversation bindings with current bindings. Original
identities therefore remain required after application-row loss. The owned test
passes for retained capability authenticity, missing-current-row coverage and
omitted-provider rejection. An initial fixture attempted an immutable association
update and was correctly rejected; the corrected loss fixture deletes its owned
synthetic row. All provider transport is controlled in this test; it makes no
hosted acceptance claim or provider writes.

### Canonical private conversation recovery reads — 2026-10-19

The normal owned-conversation reader now accepts its caller's actual transaction
and applies the canonical read-only actor gate before/after retrieval. Annotation,
artifact/retrieval eligibility and consumed-customer checks use that transaction;
normal callers still own their transaction. Shared customer/general authorization
SQL remains intact, and other callers retain their original operational SQL gate.
A genuine in-process authenticated recovery actor can read its own references
while locked without temporarily opening service or using a boolean exception.

The owned PostgreSQL case passes for mcteer, panel and partner reading their own
general/customer conversations, all cross-owner404s including admins, copied
actor503s, post-retirement503s and actual session revocation. Ordinary open reads
also pass in that fixture. Independent review found no concrete blocker. This is
a canonical read prerequisite, not full HTTP/hosted required-service acceptance.
No provider calls occurred. Inventory:920cases across167suites.

### Private conversation HTTP recovery composition — 2026-10-19 (in progress)

A fixed finite conversation-reference GET uses the existing recovery HTTP
admission, with exact owner/workspace/customer/row digest and actual revision
(including initial revision0). Unreleased079 adds this read kind and its explicit
metadata shape; its manifest checksum is updated. Normal ingress stays governed
by its existing operational gates. HEAD, query overrides, wrong secrets,
exhausted requests and retired credentials fail closed.

The new batch component derives the whole conversation inventory, authenticates
each selected record's actual owner, compares bounded serving-version HTTP with
its canonical projection or current404, verifies normal-ingress denial and probe
retirement, and brands only after independent cleanup. Final union consumption
requires every current record exactly once. Its canonical companion authenticates
all eligible configured roles, measures private ownership/current grant denial,
retires sessions and privately binds observations to the same final transaction
and full post-retirement state digest. HTTP/current-canonical matching does not
claim full required-service readiness. Subsequent role/grant/probe changes must
invalidate that canonical proof; it must run after other probes retire.

Independent review found no concrete blocker in these components. Canonical
case16 with the new auditor passed before the final HTTP matching additions.
Fresh final matching/HTTP execution remains pending. Initial HTTP fixtures exposed
revision0 and root-http/target-https cookie-name mismatches; the contract and
fixture now use the actual revision and target configuration. No hosted target
was locked or released and no provider calls occurred.

The previous full15 run at498773e produced13 passes and2 failures: the MCP matrix
failed near its finite target deadline under concurrent owned workloads, and the
report fixture did not inherit its prepared renderer through the outer owned
harness. The affected cases are rerunning serially with explicit prepared-image
binding; those failures are retained. The older4a01126 CI deterministic job failed
starting an isolated evaluation app. Its governing evaluation-source suite passed
all3 local cases on recheck. Bounded auth/eve/child/signature diagnostics were added
without increasing startup deadlines or adding retries; this is not a claim that
the older CI failure has been resolved. Inventory:921cases across167suites.


### Legacy Production pool exclusion — 2026-10-19 (component)

The released077 peer pool measurement now requires exact sourcef8d196f, current
Production deployment and both known cron bindings. Owner-issued finite nonces
are durably recorded before insertion, observed through the immutable runtime,
independently revoked and checked for actual denial. Exclusive phase admission
precedes all provider requests; repeated initial/final phases cannot reset the
six-app/eight-metadata request envelope. Direct owner URLs reject timeout and
transport overrides. Private namespace contents and parent entries are fsynced
before external work; restart cleanup uses the original identity and source.

Focused owned case18 passes (one executed, seventeen unselected), including
wrong routing/body/cron, copied proof, phase replay, original-nonce restart
cleanup and parent-directory sync failure with zero external work. Evidence:
`local-artifacts/016/legacy-production-pool-owned-v2-private.json`. Independent
read-only review found no remaining concrete blocker in this narrow component.
This is not password authentication, all-provider closure or hosted readiness.

At b747e76, the complete seventeen-case recovery-decision suite and both Eve and
Next builds pass. The older thirteen-of-fifteen failure and CI startup failure
remain retained; these newer local results do not establish fresh complete CI.
The current inventory is922cases across167suites. The whole-file recovery suite
bound is3900seconds: seventeen210-second cases, one270-second case and60seconds
for startup/cleanup. Individual domain and case deadlines are unchanged.
T096/T097, hosted acceptance and directory cleanup remain incomplete.

### Research worker recovery fence — 2026-10-19

Independent source review found that the research-maintenance cron could refresh
retained public pages or index embeddings while operational admission was locked.
The canonical positive-IO fence now encloses complete maintenance, refresh, cache
fetch, source-read, indexing and embedding operations before their first claim or
reservation through publication and terminal accounting. The actual configured
DB marker selects the schema079 fence; released schemas through077 retain their
behavior, while transitional/unknown schemas fail closed. Existing deny-only IO
keeps its separate cleanup authority. Caller cancellation reaches the embedding
provider with the original timeout, quota, model and zero-retry bounds preserved.

The new real PostgreSQL077→079 case passes: recovery cannot acquire its exclusive
fence during an admitted delayed embedding, publication completes before drain,
an aborted original operation becomes unconfirmed without retry, and locked cron,
cache, index and embedding calls create zero new work. Explicit deny-only IO still
runs. Evidence: `local-artifacts/016/research-io-fence-v1-private.json`. Root/pilot
typechecks and docs pass; independent review found no concrete scoped blocker.

The frozen74add5e recovery-decision run passes all18 cases with zero pending:
`local-artifacts/016/recovery-decision-74add5e-full18-private.json`. A separate
controller regression exposed its old universal60-minute assertion, inconsistent
with the eighteen declared case phases. The test now enforces this suite's exact
17×210s+270s+60s maximum and preserves60minutes for every other suite; all3 controller
cases pass. The complete-catalog90-minute deadline is unchanged. New case
registration brings the inventory to923cases across168suites; fresh full-source
catalog/build/CI remains required.

An initial predecessor launcher was rejected by the test/database separation
check. A corrected077 launcher passes retained-public maintenance but its six
session-dependent lifecycle cases require the current079 session schema and fail
on missing operations_control before their bodies. These failures are retained;
the current079 predecessor run is recorded separately when complete. No hosted
lock, provider call, migration, release, readiness decision or cleanup occurred.

The current079 predecessor run passes all7 research maintenance/cache lifecycle
cases: `local-artifacts/016/research-io-current079-regression-private.json`.

### Authenticated cron admission under the owner fence — 2026-10-19

The finite current cron measurement now tests fixed research-maintenance and
heavy-job routes with both incorrect and actual scheduler secrets, exact serving
source and bounded no-store JSON. It repeats those observations inside the final
genuine owner decision, accepts no copied or reused proof, and requires unchanged
locked business state. Production additionally rechecks the exact current three
cron definitions and deployment source before/after each phase. Preview explicitly
requires the independent legacy Production pool proof; watchdog cleanup remains
permitted. Jobs503/unavailable proves observed positive admission unavailable,
which may also reflect disabled processing/configuration, rather than uniquely
identifying the recovery lock as its cause.

The positive-IO helper first refuses closed mode before waiting for an exclusive
owner decision; the canonical shared fence still rechecks mode after acquisition.
The owned test passes for both Preview and Production, including altered schedule,
response and copied/reused proof failures (`cron-admission-owned-v2-private.json`).
The current IO/controller composition passes4cases; independent review found no
concrete scoped blocker. These controlled-cloud tests are not hosted observations.
Inventory:924cases across168suites. The decision suite's explicit whole-file bound
is now4110seconds (18×210+270+60); other per-suite and complete-catalog limits stay
unchanged. Frozen c8e8ae1 Eve and Next builds pass; its complete923-case catalog is
running separately. Full recovery/hosted acceptance and cleanup remain open.

### Original provider journals and effect composition — 2026-10-20

The provider-journal audit compares both actual and retained table-name sets,
then every original identity and raw PostgreSQL row digest for research/embedding
and plan/staffing/execution/support/expansion dispatch/usage journals. It preserves
unknown outcomes and original quota fields that are intentionally absent from
minimized status metadata. Staffing model-step usage receipts are now explicitly
included in fresh captures; an older capture missing that table cannot satisfy
this audit. Original ciphertext and historical captures remain unchanged.

The focused audit passes with altered embedding quota/outcome, missing row,
copied authority, renamed nonempty plan journal and renamed empty staffing journal
negatives (`provider-journal-owned-v2-private.json`). The initial fixture's UUID/text
parameter inference failure is retained. Independent review identified and then
confirmed the fix for omitted current tables; none can disappear from the audit.

The final-owner effect component now consumes genuine repeated cron/peer/old-HTTP,
native and Sandbox measurements plus original model/learning/service/provider
journals and permanent replay audits. A real-PG, controlled-cloud Production
composition passes with copied proof, changed state and different owner-connection
negatives (`effects-composition-owned-v1-private.json`). It records terminal
provider inventories and financial accounting preservation. Application resumption
admission and original native/send identity preservation remain explicitly false;
terminal Sandbox state alone does not prove a later resume path is closed. No
verification INSERT, quarantine resolution, unlock or hosted readiness is inferred.

Inventory:926cases across168suites. The decision suite's explicit declared phase
bound is4530seconds; the complete-catalog90-minute bound and other suite ceilings
are unchanged. T096/T097 and hosted automated exercises remain incomplete.


### Current job union and complete verification producer (2026-10-20)

Owned PostgreSQL18 tests establish original hosted/local business-intent fences
under fresh row IDs and controlled reopen, plus artifact-version/lifecycle fences
without fencing denial-only report cleanup. Current terminal jobs absent from the
newer retained source must also have every actual/semantic key fenced. The
current-only local-job negative, separate actual-SQL owner fencing and subsequent
positive passed (`current-job-union-owned-v1-private.json`,2/2). Unknown costs and
original journals are not settled by these actions.

Native/send auditing now requires every applicable stable metadata field,
including nulls, in genuine retained metadata. A genuinely encrypted/cold-read
historical capture missing `input_digest` is refused by this stronger audit;
general v7 reader compatibility is preserved. Native/send, aggregate-effects and
artifact focused checks passed (three cases in
`native-artifact-complete-v2-private.json`; artifact setup corrected and passed
`artifact-business-replay-owned-v3-private.json`). Independent review approved the
metadata and current-job union fixes.

The service composer exhausts current maintenance records, actual SDK category /
customer / participant scope, and private-conversation HTTP/canonical ownership.
Final MCP probe retirement precedes canonical conversation state binding. The
expanded three-role owned test passed (`service-composition-owned-v3-private.json`).

The new producer consumes genuine same-target integrity, retained denial,
service, resumption-admission, original native/send identity and external-effect
measurements inside the final16020→16017 transaction. Verification insertion stays
pending until the existing transport's final source/platform/cleanup checks and
commit. Read-only lost-ack reconciliation authenticates original cold bytes,
current physical objects and the immutable row's exact state/scope before any
new probes. An existing scope with a different bundle, stale verification or
changed state fails closed. The first complete owned producer test passed
(`producer-e2e-owned-v1-private.json`): actual verification commit, no-probe
acknowledgement recovery, postcommit probe refusal and changed-state refusal.

An explicit owner `pilot:control -- --mode locked --restart-verification true`
with the usual exact environment/recovery/revision/operation inputs advances a
previously verified locked scope to a new decision revision. It preserves prior
receipts, quarantines, holds and spending journals. Original quarantine revisions
are reusable only through the complete same-recovery locked-to-locked transition
chain; resolution rows remain append-only per verification. A fresh candidate,
current independent denials and all measurements are required for the new
revision. Control12/12 passed (`control-reverification-owned-v1-private.json`).
The actual CLI fresh-attempt→quarantine→verification→resolution→open test is still
pending; this source checkpoint does not establish hosted completion.

`pilot:recovery:authority -- --verify-work-recovery --configuration <private.json>`
produces its own measurements through fixed transports. It accepts paths and
exact target identity, never caller healthy flags, uses the original cumulative
HTTP journal and the existing15-minute cancellation limit, and performs the
committed-result check before physical baseline measurement or mutation.

Inventory:928cases across168suites. The decision suite has twenty-one210s cases,
one420s producer/CLI lifecycle case and one270s peer case, with60s controller
startup/cleanup allowance (5160seconds). Focused tests do not establish the full
current-source catalog. Actual Preview/Production remain at077; no real lock,
migration, deployment, release, backup-operator activation or directory cleanup
has been performed by this checkpoint.


#### Complete CLI fresh-attempt lifecycle passed

`producer-cli-reverification-owned-v4-private.json` passed1/1 selected, with22
unselected cases (231.9seconds case time). It executes the actual private
configuration entry point after a genuine first verification and changed-state
refusal: explicit owner locked-to-locked revision advance, fresh encrypted
candidate/current independently retained denials, original-quarantine chain,
complete HTTP/SDK/private-conversation measurement, new immutable verification,
read-only CLI acknowledgement, existing quarantine resolution and guarded open.
Both verification rows remain; the original cumulative request journal was
predeclared for20requests and covered both ten-request attempts without reset.
Earlier v2/v3 failures hit the original180s owned-fixture watchdog; those receipts
remain. Only this lifecycle fixture now explicitly receives450s owned preparation
allowance, with420s test and5160s file controller bounds; hosted/domain limits are
unchanged. Independent review found no remaining source blocker.

The fresh cold rehearsal used the actual encrypted Preview077 safety archive
captured2026-10-19T17:08:20.741Z. Current079 forward migration, restored application
content, locked/runtime denial and owned target removal passed in
`recovery-producer-31dd36f-preflight/cold-077-to-079/rehearsal.json`. The original
spending instruction retains a separate50000microUSD unknown-cost hold for this
one attempt. This is cloud-archive authentication plus an owned restore/migration
rehearsal; it does not establish an in-place hosted release or reopen.

Root/pilot type checks, documentation checks, migration079 manifest checksum and
catalog/deadline/result contracts (32/32) passed. The complete new-source catalog,
CI and actual Preview/Production release remain pending. The earlier c8e8ae1
frozen923-case run is historical source evidence, even if it completes afterward.


#### Recovery scale and browser teardown checkpoint

The actual Production077 inventory projects1,475 required MCP category selections
after the explicit078/079 migration. A separate, fixed read-only regional owner
probe measured20 SELECT1 samples (mean2.3115ms, p952.8737ms); its owned Sandbox
was stopped/deleted and provider404 verified. No existing hosted target was locked,
migrated or released. This latency measurement does not prove full recovery capacity.

Initial category verification now compares actual HTTP/SDK output once against the
canonical governed read, retaining exhaustive final replay. A finite owner window
returns only completed categories and preserves the original32 registered-probe
slots,64 tool calls,59-second credential, five-minute target and15-minute command
limits. Final canonical replay uses groups of at most eight walks in the original
owner transaction, actual per-tool authorization and unchanged cancellation. Group
admission claims its slot synchronously; SQL failure or read cancellation aborts
the owner, closes its writer, drains readers and independently retires probes.
Independent review found and verified the overlapping-group admission correction.

Before the final pipelined replay change, the complete recovery-decision suite
passed23/23. Pipelined locked-target tests pass16/16; two focused decision/SDK
cases pass, and the overlapping-group regression passes1/1 selected. Pilot types
pass. The complete final-source recovery suite and catalog remain pending.
Legacy055/077 denial replay retains its original index-key fences without requiring
unavailable079 job-business-key metadata; the full legacy restore suite passes5/5.

The original CI WebKit failures remain retained. The reproduced native-file route
response-disposal failure now has explicit after-test route draining; the full
legacy WebKit catalog passes96/96 locally. The gaps runner adds fixed, minimized
validity/event diagnostics with a negative privacy check (8/8 unit cases); its
fresh local WebKit catalog passes88/88. No browser result establishes hosted pilot
acceptance or conclusively attributes every earlier CI failure.

The complete pipelined recovery-decision attempt passed22/23; the existing
individual-read cancellation case exposed graceful pipeline shutdown waiting for
a pending three-second SQL call (3031ms against the original2500ms limit). The
failure/abort path now terminates only the owned writer before pg end, then
drains registered readers and performs independent exact-ID cleanup. Actual
owner/rollback/group and individual-deadline regressions pass2/2 selected after
this correction. Independent review found no remaining blocker in that change.
The original failed complete attempt remains retained; a fresh full-source
catalog is still required. A proposed parallel initial-probe optimization was
withdrawn because normal denial reconciliation correctly retires peer probes.
No denial exception was introduced. Initial actual SDK measurements remain serial.

## 2026-10-20 browser command synchronization and regional denial freshness

The native-operations disposable acceptance command, including its knowledge
journey, passes with zero paid provider calls at the `49061b6` diagnostic
checkpoint. Fixed CI diagnostics contain phases, bounded counts and booleans;
private messages, identifiers and form contents remain in protected evidence.

The complete Product Gaps runner passes **88/88** across the four WebKit projects
after the keyboard-authoring helper waits for the exact-origin creation POST and
asserts HTTP201 before checking the saved heading. The existing test deadline,
keyboard action, lost-acknowledgment case and authorization assertions remain
unchanged. The original failure showed a pending mutation at the five-second
heading assertion; it did not prove native navigation or a product submit-handler
defect. Bounded private application output is retained on future runner failures.
Private records are `ci-3915636/native-phase-actual-private.log` and
`ci-3915636/gaps-command-completion-actual-private.log` under the recovery
worktree's ignored `local-artifacts/016/`.

A separate synthetic capacity project runs exact source `1a3183f` on schema079;
existing Turas Production and Preview remain schema077. This is capacity work,
not pilot workflow acceptance. The regionally placed immutable verifier uses a
verified base391 image plus an authenticated exact1a source bundle. The prepared
directory failure issued no probes; independent zero-probe closure and provider404
were verified. Its corrected finite execution issued25 probes before the
independently retained denial snapshot reached the enforced five-minute freshness
limit. All25 original private probe journals were reconciled, independent session,
MCP and HTTP-admission retirement was checked, and provider404 confirmed executor
deletion. Neither failed attempt establishes full service verification. Their
original cost holds remain retained; no allowance was reset or replenished.

Current work adds a genuine same-lineage cold-denial continuation for MCP replay,
with unchanged five-minute authority freshness, thirty-minute transcript age,
per-probe limits and owner deadlines. Its exhaustive focused PostgreSQL regression passes (one selected case;22
unselected). The fresh full23-case run passes22cases, including stale-capability and
foreign-archive negatives. Its publication fixture failed before replay-fence
assertions because the standalone runner fell back to an older mutable renderer
tag. The focused rerun with the existing prepared immutable renderer passes
(one selected case;22unselected); this is separate from a complete-suite pass.
A fresh complete-source catalog remains pending. A new actual
regional run also remains pending. No schema cutover, operator cadence,
Production pilot readiness or completed directory cleanup is claimed here.

The subsequent native-send assertion checkpoint also passes the full disposable
native-operations/knowledge command locally, with zero database deadlocks, zero
statement timeouts and zero paid provider calls. The earlier CI503 remains a
separate unresolved result until new CI captures its exact fixed boundary code.

Independent regional-package review found that a parent AbortSignal deadline was
not propagated into fresh denial capture. The capture now combines that signal
with its unchanged180-second ceiling. Four cancellation cases pass, including
parent abort, already-aborted input, cleanup and restored process listeners.
Existing nested OS termination handlers already observed SIGTERM; the fix concerns
parent timer/AbortController propagation. The private driver must pass its
original signal. The superseded7c local catalog was explicitly interrupted; its
partial results are retained and do not establish current-source completion.

The exact38 regional capacity run completed47categories,214tool calls, the
independent canonical replay and probe retirement in644,688ms. Its local
controller then crashed during journal reconciliation. Cleanup recovered all53
original probe intents, reconciled their exact private preimages in smaller
transactions, independently verified no live login/MCP/HTTP probes and deleted
the executor with actual provider404. The original7Mmicro-USD Preview maximum
hold remains retained. This is capacity-only evidence; no full recovery, pilot
acceptance, schema cutover or scheduled cadence is established.

Independent code review identified a native ordinary-send race: projection could
mark the exact accepted input admitted before HTTP receipt persistence, which
then rejected the acknowledgement with409. Receipt persistence now verifies the
original projected delivery/session/input/turn and exact text, selected-source
or native-file envelope before adopting that already-admitted result. Immutable
receipt equality rejects altered acknowledgements without resending or renewing
admission. Four focused actual owned PostgreSQL cases pass, including4/10MiB
staged files and selected passages. Earlier fixture setup failures are retained
separately and are not counted as product failures or passes.

Three focused history/effect composition cases pass with the historical-only
cold reader. Historical bytes constrain retained identity/replay/financial data
and cannot authorize a credential. Fresh current authority still has its original
five-minute limit. CLI original-source capture/refresh wiring and auxiliary
PostgreSQL connection-error handling have type verification; broader current
source verification remains pending. The complete pilot inventory now includes
an additional original-source forgery boundary case (929cases/168suites), whose
focused unit check passes. This is distinct from complete frozen earlier-source
catalog results.

The mixed coverage path passes two focused owned PostgreSQL cases (21unselected),
including actual separately dumped/restored original-source capture, encryption,
independent archive retention, cold authentication, complete CLI verification,
read-only acknowledgement and explicit resolution/open. Missing hosted branches,
forged DTOs, changed accepted content and authorization drift are rejected. This
is controlled-cloud/DNS/key transport with real owned SQL/archive bytes, not a
hosted restoration claim. Three actual SDK consumer suites pass against an owned
Production-mode Next.js server; foreign existing-customer refusal is typed and
non-disclosing, while invalid input and other failures remain errors. Nine
focused privacy/current-denial/cancellation unit cases pass.

The separate-source check exposed nondeterministic unique-index collection order
after pg_dump/restore. Source capture now orders logical replay-key column sets,
and history comparison normalizes only that collection order while preserving
every key/digest, exact schema/primary key, row identity and full original SQL-row
digest. A genuine cold reordered-key continuation passes; changed replay digest,
missing original rows and altered immutable row hashes remain blocked. Earlier
failed fixture/configuration attempts are retained separately.

Current CI at3680470 passes native operations,4/10MiB native staging, Product Gaps
WebKit and pilot WebKit; other long suites were still running at this checkpoint.
The five mobile workspace cases also pass locally without retries. An independent
local wider UI attempt hit an upload-case timeout and is not a complete UI pass.
The fresh mixed regional scale run,079 existing-target cutover, actual backup
cadence, hosted automated observations and user-directory cleanup remain pending.

### Continued regional capacity and hosted learning authoring (2026-10-20)

The actual isolated ba7cb3a regional attempt reached all1,479 canonical selections
using21 credential groups, then correctly failed its final five-minute independent
snapshot freshness check. Its baseline capture preceded the first credential by
approximately113seconds; this run establishes no regional capacity pass or service
readiness. All21 original private intents were independently reconciled, live probe
credentials were absent, and the provider returned404 after owned executor deletion.
Original spending holds and failure bytes remain retained; no automatic paid retry
was started. Existing Turas Production/Preview remain schema077.

A subsequent owned PostgreSQL regression walks the same1,479 selections with nine
credentials using sixty-customer groups and the original twenty-item page size.
All nine actual retirement receipts and zero live session/MCP credentials are
verified. The public customer ceiling, credential lifetime, concurrency, calls,
intent allowance and owner deadline are unchanged. This is an owned capacity
regression, not a fresh regional result. Its first attempt reached the full scope
but failed a test assertion that used `retirement` instead of the actual `retired`
receipt filename; the corrected complete focused case passes1/1.

Hosted learning orchestration now uses the existing original journal, real paired
capture/retirement producer and normal administrator review/publication commands.
Activation runs on the exact verified bounded owner connection. A pinned descriptor
rejects a same-marker clone URL before domain/native/paid preparation. Fourteen
capture/request boundary unit checks and pilot type checking pass. Two owned HTTP
composition cases pass, including all eight immutable capture reviews, rejection
of wrong/incomplete capture inputs, a domain-derived equal-score/no-benefit failure,
zero new model dispatches during review and no release decision. Their model outputs
and scores are explicitly synthetic test inputs; they prove neither actual hosted
model quality nor human feedback. Actual capture review files must be independently
prepared from the full current batch and labeled automated. The hosted file catalog,
fresh complete933-case source validation and actual release evidence remain pending.

Maximum-file preparation/restart verification is now authored through normal
capability uploads and existing governed worker/Blob paths. The fixed harmless
PDF and workbook each parse successfully at exactly10,485,760bytes using the
installed parser (one PDF text unit, four workbook cells). That narrow local
check supplies neither antivirus nor hosted execution proof. Restart verification
reads actual provider creation metadata, immutable original row timestamps,
current scoped domain/job/image/cost records and complete uncached byte streams.
Five runtime-descriptor unit checks pass, including URL timeout overrides,
duplicate transport options, fragments, wrong role and missing credentials.
Pilot type checking passes. Actual hosted file preparation/restart, remaining
fault/catalog phases and the fresh complete933-case source run remain pending.

The frozenba7 complete-source run stopped at its actual hosted-SDK consumer
suite: the consumer expected an obsolete generic scope error instead of the
server's typednot_found refusal. The consumer now requires the exact current
contract and rejects generic errors/outages for foreign or withdrawn sources.
The earlier run remains a failure. The fresh focused owned Production HTTP/SDK suite passes all six cases. Two earlier focused attempts stopped at a Production-only CLI environment type error; that error is fixed. Repository and pilot type checking pass.
A one-original fault runner is authored for antivirus, malformed input and actual
running cancellation, with independent actual provider-absence reads and raw
original accounting identities. It explicitly does not certify financial hold
preservation, complete reconciliation or the broader hosted file catalog.
Independent read-only review cleared the image/accounting and typed-denial fixes;
actual cloud execution and the remaining file failure cases remain pending.

Maximum-file denial checks now cover anonymous, internal-member and partner
original reads; the response parser requires bounded, exact fixed application
failure messages and rejects outages, extra data and protected-content messages.
Its new registered unit case passes, bringing the deterministic inventory to
934 cases in 169 suites. Pilot and repository type checks pass.
A separate normal-command retirement phase is authored for the two maximum
originals, with actual store readback before withdrawal, current byte/text
withholding, six normal cleanup jobs and independent Blob/payload absence checks.
Independent review found no SQL/policy blocker; actual hosted execution is pending.
The fixed network case also passed independent review, but only local presence
of the required scanner executable was checked. No cloud network, deadline,
generated-output, full file-catalog or release acceptance is claimed.


The normal parser worker now supports an optional trusted in-process observation
of a validated output digest/length and copied claim. No request or environment
value installs it, and it receives no output bytes. The hosted `late-output` case
claims only its newly queued synthetic original, checks the current parser
source/lease/deadline, holds the actual result past the unchanged deadline and
requires normal publication continuation rejection, `parser_timeout`, no units
and actual provider absence. The real local pinned scanner/parser regression
passes through its original 120-second deadline; this is local execution evidence,
not a cloud execution claim. The callback does not attempt SQL publication or
claim the parser originally generated its output after expiry.

Versioned gate-verification observations correct the previous producer/checker
mismatch for overlapping suite intervals. Original execution proof bytes/times
remain immutable; actual evidence rereads occur after dependency observations,
with original hosted freshness and selected-attempt checks unchanged. Six new
regressions cover shared intervals, changed bytes/dependency digest, stale hosted
proof, missing observations/latest failures, and forged execution/source/time.
All 28 new/existing focused readiness cases pass. The inventory is now 941 cases
in 170 suites; a complete current-source pass and hosted release are still pending.


A subsequent frozen 934-case catalog stopped at isolated-restore setup with a
Docker port collision. Owned database startup now publishes an automatically
allocated Docker loopback port atomically and requires exactly one valid
`127.0.0.1` mapping on readback; app/native port leases are unchanged. The complete
three-case owned isolated-restore rerun passes, with independent review finding
no blocker. Selected database/configuration and root workflow state remain
protected. This focused rerun does not convert the earlier full catalog to a pass.


Generated-file preparation/resume is now authored as a separate first-deployment
normal linked chain and second-deployment read-only verification. It binds the
original journey proof, four actual normally published report rows, current domain
eligibility and six original worker/image/cost receipts; no paid job is repeated.
All actual bytes must match after a new actual same-code deployment. Six adapter
regressions pass for intact reuse, changed proof/rows/configuration/bytes/code,
duplicate identities, missing worker receipts, source withdrawal and changed row
times. These tests use controlled adapters and are not cloud/restart proof. The
947-case/171-suite inventory includes them. Actual generated maximum-byte boundary,
actual cloud preparation/restart and full file catalog remain pending.


The generated preparation now reaches the normal 40-slide renderer boundary using
legal synthetic annotations through original-author revision commands; separate
administrator review/publication remains ordinary. It validates the actual revised
payload before paid rendering, and checks the real stored artifact validations.
Two layout regressions and six generated-file adapter cases pass. The complete
owned HTTP source/planning/delivery/report journey passes with two real normal
40-slide renderings, publication, four full byte reads, MCP checks and withdrawal
withholding. An earlier run reached the final assertion but retained the old
10-command expectation; the updated two-revision journey has 12 commands and its
complete rerun passes. The inventory is 949 cases across 172 suites. These are
local results, not cloud restart or exact 10 MiB generated-byte proof.


Four report-byte component cases pass on owned PostgreSQL using actual report
write/read/delete wrappers, the actual shared Blob adapter and only a controlled
provider SDK transport. They cover exact 10 MiB report-namespace bytes/full hash,
private uncached SDK access, overflow/empty/changed-size/hash rejection, immutable
writes, changed-identity cleanup refusal and exact removal, plus separate per-file
10 MiB / pair 15 MiB serialization caps without sending mail. These synthetic
storage bytes are never published or described as normal renderer output.

The spec/plan now define the reviewed compositional measurement method: real
40-slide normal report retention and real exact-10-MiB original retention must
both occur after the same actual new deployment using the identical deployed
shared Blob byte implementation, physical store and configuration. The composer
also requires the complete current-source catalog and exact registered wrapper
suite, records implementation digests/actual sizes, and explicitly labels the
inference with `actualReportAt10MiB:false`. Independent read-only review found the
method defensible; the actual hosted composition and unrelated file faults are
still unverified. Inventory: 953 cases in 173 suites.

The full catalog producer now records a versioned ordered evidence index with
SHA-256 of every successful suite's actual result and process files. The byte
composer requires the complete current index, exact original owned run/source/
local-scope binding, selected latest complete G03 role proofs and full named case
coverage, plus the component's original result/process digests and clean exit.
Both actual retention receipts must match their manifests' exact IDs, formats,
kinds, sizes, digests and original/shared new deployments. Read-only independent
review cleared the corrected bindings. No prior catalog without this index is
silently promoted to current component evidence.


Scoped release aggregation is authored separately from strict one-environment
runs. Eleven bundle regressions and five auxiliary-evidence regressions pass,
together with 28 existing gate/readiness checks (42 total). They cover honest
cross-scope composition, Preview/Production separation, original attribution,
required typed workload/UI evidence, stale original times, missing/source-mismatched
references, latest failed attempts, final-record execution ordering and independent
original Production run IDs. Auxiliary checks recompute actual fixed workload
metrics and reject healthy flags with a missing measured class, foreign capture
source, changed original bytes and a UI summary lacking four project captures.

The real workload and UI runners now emit original source/environment and raw
artifact indexes plus canonical partial scoped runs after complete execution.
Their newly indexed full current-source executions and actual final hosted bundle
are still pending. Private artifact reads retain ownership/mode/no-symlink/no-link
checks with an explicit 64 MiB sample/report bound; ordinary evidence remains
limited to 1 MiB. Inventory: 969 cases across 175 suites.

Scoped release-bundle review corrections: final Preview/Production platform and
origin checks now repeat under the original 120-second deadline immediately
before final evaluation. Typed auxiliary validation returns frozen, privately
tracked results bound to the original run/source/scope/gate; caller-created or
cloned summaries cannot qualify. Reference identities and inputs must form a
bijection. Sixteen focused cases pass, including forged-summary and duplicate
inventory rejection, with pilot typecheck and documentation checks passing.
Independent read-only review found no remaining blocker in this scoped change.
These are local implementation checks, not actual hosted release acceptance.

The hosted executor now enforces the same clipped program timeout passed to its
SDK command, preserving explicit deadline classification rather than reducing
an interrupted parser to a generic failure. The program timer ends when command
wait/log capture completes; subsequent output retrieval retains its original
domain deadline. Cleanup uncertainty continues to override timeout success.
Fourteen executor cases and three emitted-observer process-identity cases pass.
The actual hosted deadline fault suspends only an exactly identified normal
parser, retaining PID/start ticks/UID/executable/argv identity and original job,
source, pinned image and deadline; provider absence remains mandatory. It does
not assert per-program timer attribution from a generic timeout result.
An owned actual-image suspension attempt remains failed/unverified because local
Rosetta injects an extra Node argument. The hosted exact-argv rule was preserved;
no local or hosted timeout acceptance is inferred from that attempt. Independent
read-only scoped review found no remaining concrete blocker. Current inventory:
974 cases across 176 suites; complete current-source and cloud execution remain
pending.

The hosted chain now preserves its separately authenticated member author for
reports and requires that author callback explicitly. Support, expansion and gap
proposals now use a nested normal member session while retaining the original
administrator reviewer session and normal logout. Learning capture is correctly
identified as J014. Six generated-file adapter cases and the actual owned HTTP
linked report/support/expansion/gap/withdrawal case pass; pilot typecheck passes.
Independent read-only review found no concrete caller or identity regression.
Actual hosted behavior remains pending.

The actual owned pinned SDK driver now exercises a current assigned-partner grant
revocation through the normal admin PUT API: the existing connection retains its
workspace identity, lists no revoked customer, withholds its profile, and then
retires its exact credential. Seven owned HTTP/SDK cases pass. The first new
fixture attempt exposed a stale synthetic report after changing its grant
inventory; its controlled report read-state was rebuilt against that inventory
and the complete seven-case suite passed. This fixture is not hosted publication
proof. No normal hosted authorization rule was relaxed.

A partial G19 producer now binds the complete twelve-case member and twenty-two-
case assigned-partner SDK inventories to original capture/preflight byte digests,
actual scope/deployment/schema/grants, distinct connections, current source/grant
boundaries and original execution intervals. Four producer/integrity regressions
and eleven release-bundle regressions pass. Readiness and ordered verification
reopen typed original evidence; the exported bundle evaluator requires frozen
private validation provenance. Independent scoped review found no concrete
blocker. Main still records full hosted acceptance as blocked; G17/G18 and all
other mandatory gates remain separately required. Inventory:979 cases/177 suites.

CI on23d9b75 recorded a native-operations knowledge approval failure with SQLSTATE
57014 and subsequent UI timeout. The exact local disposable native-operations
command passed, with zero deadlocks/statement timeouts and zero paid calls. The
original CI failure is retained; its cause remains unresolved and the local pass
does not establish that it is fixed.

G19 role receipts now retain each actual SDK execution's separately captured
start/completion interval, bounded by the original preflight and enclosing capture;
they do not use the broader whole-run interval. The fifteen scoped SDK/bundle
regressions and pilot typecheck pass after this tightening.

Native boundary diagnostics now retain a fixed owner/authority/worker/context/
forward stage and bounded total boundary elapsed time. CI summaries allowlist
those fields and discard arbitrary stage names, prose and payloads. Forwarded
approval promise errors remain inside the existing failure catch without a new
or retried dispatch. Three privacy diagnostic cases and the actual disposable
native-operations command pass with zero deadlocks/statement timeouts or paid
calls. Independent read-only review found no privacy/flow blocker. This improves
future diagnosis and does not establish the cause or resolution of the earlier
CI57014 failure; no original timeout or approval limit was increased.

The frozen complete cbfc04c catalog passed941/941 cases across170 suites with no
skips or retries, source digest52982b02e279843627c71fadef932ba511f155168929281dccb999eba72f22ff
and catalog digest145b8c2072669bfca54907049144cc2b9e52b0e2e6c2cc059ddd78e905b3f71f.
Its private original run is76d83270-7bdf-42b1-8128-c29ee90ff834 in the frozen
cbfc04c worktree. This establishes that exact historical source, not later edits
or hosted readiness.

Canonical partial G18 evidence now requires original assigned guide/demonstration
role captures, all sixteen actual model outputs and their distinct settled
original budget/provider identities, retained independent scored review bytes,
eight original normal review commands/receipts, a recomputed verdict matching the
server-derived publication/rejection and generation, and exact native retirement.
No-benefit rejection is valid; it cannot be changed to publication success by a
flag. Partner source-credit withholding and internal-evaluation denial are also
required. Both role receipts retain original execution intervals and bind every
required original file through the artifact root. The combined hosted run retains
G18/G19 while other gates remain absent and full hosted acceptance stays blocked.
Four controlled partner integrity cases, four SDK integrity cases and eleven
release-bundle cases pass. The actual owned normal HTTP training case passes;
root/pilot types pass. Independent scoped review found no concrete blocker.
No actual hosted/model G18 exercise has run in this iteration. Inventory:983 cases
across178 suites; complete current-source acceptance remains required.

Cost admission and operational capacity summaries now retain the original upper
bound for a settled estimated charge; only a confirmed actual charge replaces
that bound. Released and unresolved reservations retain their existing behavior.
The existing owned PostgreSQL cost-command case passes with both estimated and
confirmed-actual health projections, and root types pass. The database trigger
already enforced this conservative rule; no cap, hold, ledger or migration changed.

The core hosted recipes now exercise normal accepted plan revision and original
acceptance replay; a separate exact plan preview is prepared before source
withdrawal and its subsequent acceptance is denied without accepted-state changes.
Normal staffing checks independently deny overload and stale competency, verify
current matching output and preserve the existing commitment. Delivery adds
member-authored/reviewer-accepted RAID, scope, handoff and explicitly not-measured
outcome records, plus separately reviewed synthetic time with explicit exceptions
and immutable replay. Expansion retains the original unknown-benefit denial,
then qualifies a separate proposed qualitative discovery benefit using normal
reviewed dated synthetic exercise observations. No actual customer benefit,
adoption, receiving acknowledgement or measured outcome is inferred.

Owned HTTP training, workforce/time and complete reports/expansion/source-withdrawal
checks pass. Intermediate failures exposed an obsolete expected command count,
missing fixed diagnostic codes, cross-session citation-token reuse and undated
manual evidence; the recipes now retain separate author identity and use dated
reviewed observations without transferring session-bound citation tokens.

The partial G17 producer binds the original full normal chain and its manifest,
actual desktop/mobile root transports, native/archive/browser cleanup, actual
role intervals, current private-conversation/WebKit checks, source acceptance
denial and SDK provenance. File restart evidence must match every original byte
identity and the shared adapter composition is recomputed from the original owned
execution/index/result/process/proofs and current implementation hashes. This is
compositional byte-boundary evidence; it does not claim a normal renderer emitted
a ten MiB report. Typed private verification is required by CLI gate evaluation
and release-bundle composition. G17 writes core-run.json separately from G18's
hosted-run.json and retains G18/G19 receipts.

Twenty-four focused core/partner/SDK/bundle cases pass; root/pilot types and docs
pass. Independent scoped review cleared the recipes and the stricter file-proof
verification. The current inventory is988 cases across179 suites. No new paid
dispatch, target schema change or directory cleanup occurred in this batch, and
actual current-source hosted acceptance remains pending.

Successful deterministic CI now retains only its source-bound `ci-*.json` catalog
records through a pinned upload action. The G14 importer requires an actual
successful main push workflow, exact current source/attempt, authenticated
repository run/job/artifact metadata, retained original ZIP hash and size, bounded
fixed archive inventory, every registered original suite digest and complete
result, and the actual types/docs/catalog/build/upload steps. It preserves the
original workflow interval; CLI gate and bundle verification reauthenticate the
metadata and archive binding. Forged or cloned summaries cannot substitute for
verified provenance. It performs no provider/model dispatch or billing change.

Sixteen focused CI metadata/archive/bundle cases pass, including tampered archive
rejection; root/pilot types and docs pass. Independent scoped review found no
concrete blocker. No actual completed current main artifact has been imported
yet. The frozen23d9b75 catalog separately passed969/969 cases across175 suites;
this is historical source evidence. The frozen dd02b97 988-case run is active.
The current inventory after CI checks is993 cases across180 suites; current-source
complete acceptance, hosted release and cleanup remain pending.

Hosted role cleanup now verifies an actual HTTP401 using the original logged-out
cookie. Every role also requests an existing primary-workspace profile and must
receive a version-bound non-disclosing JSON404. The separate normal membership
exercise disables/restores only the synthetic panel membership, verifies inactive
cookie/login denial, rejects the old cookie after restoration and confirms a
fresh login. Its optional normal-command session fence is checked atomically by
the governed domain under the principal lock shared with session issuance; it
refuses any unrelated live session. Existing unfenced command digests are intact.
Original mutation intents and keys are retained for acknowledgement reconciliation
and cleanup, without new-key retries or a process-crash cleanup claim.

Two focused owned PostgreSQL18/actual-route cases pass (nine other cases were
unselected): the complete three-role read/foreign/logout/membership exercise and
a raced additional session that remains authorized while membership disable is
denied. Root/pilot types pass. Independent scoped review found no concrete
blocker. No real hosted exercise, paid dispatch, schema change or cleanup was
performed in this batch. Inventory:994 cases across180 suites.

### Automated training observation recording — 2026-10-20

The hosted runner now records separate internal-member and assigned-partner
initial automated observations from the original completed normal training capture,
before the subsequent SDK exercise revokes the partner grant. Recording rechecks
current synthetic workspace, identities and explicit assignments, and binds the
original capture bytes, source and deployment. Records remain pending independent
capture review and disposition; this does not complete G21 or claim human feedback.
Feedback appends also preserve all original source identifiers. Nine focused unit
cases and pilot typecheck pass, including changed source, withdrawn assignment and
mismatched training identity rejection. Independent read-only review found no
scoped blocker. Actual hosted execution remains pending.

The0500866 actual Legacy backend parity CI native-operations job reproduces
SQL57014 at5185ms during the intervening send, before an intervening attempt
exists. Native question, file and WebKit jobs pass. The broad native-route stage
did not identify the exact database boundary. Additional fixed, payload-free
session/implicit-question/ordinary-dispatch stages narrow the next observation;
original statement deadlines and acceptance remain unchanged. Three diagnostic
privacy tests pass. This is diagnostic authoring, not a resolved CI failure.

### Governed automated observation evidence — 2026-10-20

The G21 producer now requires the original hosted training capture and complete
G18 validation, exact initial automated observations, three immutable history
records per observation, and an independent capture review. Resolution consumes
an actual selected passing G18 proof of the correct role with original source,
scope, bytes and times; arbitrary JSON cannot serve as correction evidence.
Deferrals must remain future-dated at every final branded consumption. Unknown
histories, changed original capture fields and cloned validation brands fail.
Fifteen producer/bundle cases, including three new registered cases, pass; a
separate expiry-bound consumption check also passes. Independent read-only review
found no remaining scoped blocker. Current inventory is997 cases across181 suites.

The feedback CLI preserves strict current assignment checks for initial records.
When appending a validated immutable prior record, it permits the original partner
scope after deliberate revocation or deactivation while retaining active internal
follow-up ownership and existing historical grant rows. It changes no authority.
Five actual owned PostgreSQL18 scope cases pass. Actual hosted observations,
independent review and dispositions remain pending; G21 is not yet accepted.

The canonical producer command is
`node --import tsx scripts/pilot-hosted-feedback-evidence.ts --run <private-core-run.json>`.
The same private directory must contain the original observation manifest,
`role-observations-review.json`, every referenced immutable disposition/recheck,
and original G18 captures/proofs. Output is `role-observations-run.json`; CLI,
gate observation and release bundle consumers revalidate its typed provenance.

### Pending-response hydration boundary — 2026-10-20

The e92dc82 Legacy backend CI intervening send passes, while the later fresh-login
knowledge include approval times out without a native route database error. The
request card previously rendered enabled before client event handlers were ready.
Its controls now remain disabled until hydration, preserving all existing exact
input and server authority checks. This closes a demonstrated UI initialization
gap; the earlier SQL57014 cause remains unproven.

Five unit cases pass, including disabled server-rendered approval and escaped exact
inputs. The full actual owned CLI WebKit/eve exercise with `--knowledge` passes:
include, publish, apply, revoke and withdraw; normal fresh-login approval, original
request/reload, intervening turn, source change, member refusal and native retirement.
Provider calls:0. Root typecheck and docs pass. Independent read-only review found
no scoped blocker. This is local actual-runtime evidence; current final-source CI
and hosted release remain required. Private log:
`local-artifacts/016/native-hydration-owned-knowledge-private.log`.

The139ad1a actual CI diagnostic narrows SQL57014 to `ordinary-prepare`
(5268ms), before the intervening attempt is created. The independently passing
owned full `--knowledge` run does not resolve this CI-only failure. Fixed inner
prepare boundaries now distinguish feature/environment/owner/admission/planning/
context/source/replay/quota/write steps without SQL text or values. Root typecheck
and three diagnostic privacy cases pass. Original timeouts, locks, quotas and
dispatch behavior remain unchanged.

### 2026-10-20 operator source-upload containment

The4e2d4fa disabled operator deployment passed actual401/503/405/404 HTTP
boundaries. Independent authenticated file-metadata review then found the
protected Production environment pull in its deployment source inventory.
These HTTP results never established source-file exclusion. The exact affected
owned deployment was deleted successfully; its private metadata and original
financial ceiling remain retained. The environment file was moved outside the
deployable package. No scheduled backup or app schema change occurred.

The package preparer now emits an explicit upload allowlist for the authored
build/runtime/native files, with final environment/credential/private-file
exclusions. The existing actual operator build/transport test also verifies
gitignore matching for arbitrary environment-pull names and injected files under
admitted directories. All8 operator cases, root/pilot typechecks and docs pass.
Independent fix review, credential containment, fresh deployment and actual
remote source-inventory verification remain required. Retained archive keys must
remain recoverable; replacing a key cannot decrypt its original immutable archive.

The first excluded-source replacement failed before serving: Vercel uploaded only
five root files and could not find `src/source.json`. Its walker checks bare
directory paths, so trailing-slash directory exceptions did not admit traversal.
The corrected exceptions admit bare directories. All8 operator cases pass with
an empty-root matching check that covers this distinction. A separate check using
the actual installed Vercel CLI file-tree builder admits all20 required files and
excludes synthetic environment/credential/private injections, without provider IO.
The failed deployment and its original cost ceiling remain retained; hosted
replacement verification is still pending.

Authenticated API now confirms the original affected deployment is absent. The
operator CRON secret and archive access password were replaced. The old archive
password is rejected; the new cold connection verifies the exact installation and
unchanged archive/chunk inventory. All8 store-bound connection/password settings
were updated, and current destination binding passes. All13 historical decryption
keys compare unchanged. The old destination configuration is retained as history,
and the current protected configuration uses the replacement password. Automatic
reconnect credential refresh at the integration provider remains unverified; the
operator stays disabled. No application database or billing configuration changed.

### 2026-10-20 native CI input-authority investigation

The6b037e5 Legacy backend run39401299235 fails native-operations job118556386137:
fresh approval reports SQL57014 at input-authority after5123ms. Its intervening
attempt completed and the original attempt remained waiting_input. The failure
is retained; it does not establish that the earlier prepare timeout is fixed.

The full owned PostgreSQL17 AMD64/WebKit/native knowledge exercise passes without
provider calls. A separate instrumented disposable copy measured the first exact
input-binding query: cost51.39, planning51.452ms and execution11.535ms with JIT
enabled, but no JIT compilation. The diagnostic copy later encountered duplicate
output filenames; it supplies the retained plan only and is not acceptance proof.
Those local results do not explain the CI timeout or justify changing locks,
authorization, application statements or deadlines.

The native-operations CI harness now starts a sequential read-only observer on
its exact owned loopback source and strictly named derived test databases. It
samples at most twice per second for ten minutes, retains at most64KiB, and
reports only fixed query categories, bounded wait types/timings and blocker
categories. SQL, parameters, names, process IDs and arbitrary errors are excluded.
The parent handles observer errors and bounded termination/reaping in finally;
monitoring cannot turn a failed native check into a pass. Three existing privacy
cases and root/pilot typechecks pass. Actual instrumented CI remains required.

The actual owned CI command with PostgreSQL17 AMD64 passes its full native
knowledge exercise with0 paid calls,0 statement timeouts and0 deadlocks. Its
observer records273 samples; six membership-lock samples reach1252ms, with fixed
blocker labels only. This verifies the owned observer path, not the CI failure's
cause. Independent review found and resolved observer spawn/reaping handling;
no application behavior or timeout was changed.

The corrected6b037e5 operator replacement is actually READY. Its four HTTP
boundaries pass, and independent authenticated source/output metadata review
confirms required source files, no environment/private/credential files, only the
backup Function and the authored twelve-hour cron metadata. Remote Function bytes
were not downloaded or independently hashed. Execution remains disabled, so this
does not verify a scheduled capture. Other retained operator deployment inventories
contain no matching protected files; their source commit attribution is unavailable.

### Actual Preview maintenance — 2026-10-20

On89fd94d, independent read-only platform review confirms the active firewall
admits only the four verified current Production hosts; the Preview deployment
remains excluded. Independent cold connections and an owner audit confirm distinct
physical Preview/Production clusters and the exact schema077 Preview marker.
The custom legacy009 role has no table writes, role memberships or schemaCREATE;
its eight executable SECURITYDEFINER functions return trigger. Provider-managed
administrative roles are excluded from the application-role fence and retained.

The exact Preview owner journals the deny-only intent, commits old-runtime
NOLOGIN, terminates only that role's Preview backends, and verifies an actual cold
old-credential rejection. Production remains schema077 with its runtime LOGIN
unchanged. Both targets have fresh independently encrypted database-only safety
copies and successful owned077→079 restore rehearsals; these do not prove private
bytes, managed Workflow or complete service recovery.

The unchanged rehearsed migrations078/079 and explicit runtime grants complete
on Preview. Normal control transitions reach locked revision3. The existing
retirement command verifies a separate restricted replacement login by actual cold
connection. Five encrypted settings are created only for016-recovery-completion:
the two replacement runtime URLs, exact environment marker, pilot-login0 and
hosted-jobs0. Global/Production settings are preserved. A new deployment binding,
managed closure, matched service recovery and unlock remain unverified.

The separate finite Preview completion allocation is5,000,000microUSD under the
standing user authority. Aggregate allocated ceilings are70,193,457microUSD of
the original99,000,000 task cap; historical charges and unknown holds remain.
No new model authority or automatic retries/topups are created.

Actual native-operations CI passes on89fd94d. Its observer records385 samples,
one membershipLock sample497ms and one commitIO sample163ms. These observations
do not explain the earlier intermittent timeout. All seven legacy acceptance jobs
pass; the broader46-job run and exact-source997-case local catalog are in progress.


The actual94c9e31 immutable Preview is READY with the five encrypted branch
settings verified by protected CLI readback. Its governed short-lived mcteer
probe measures the actual deployed restricted runtime against locked schema079
revision3. Release-bound typed401 canaries confirm ordinary session and anonymous
status admission are denied; the exact probe is retired. The active host policy
is version2 and preserves all four current Production hosts while adding only
this immutable Preview host. Earlier serialization-order and numeric-version
activation failures are retained; the installed CLI transport uses the draft
resource with JSON{}. No provider cancellation or full recovery follows from
this bootstrap observation.

The first managed closure attempt stops in batch0 before provider PUT dispatch;
its35 provider reads, original plan and verified probe/client retirement remain.
Its original error was not retained at sufficient detail to attribute a cause.
A later one-completed-run diagnostic records genuine terminal metadata and an
independent receipt with0 PUTs, but fails final source verification after a local
source edit; it is partial evidence, not completed closure. No cancellation retry
or full-service assertion is admitted from either attempt.

An exact full checkpoint succeeds in40.529s across492 queries. A separate actual
locked Preview repeatable-read comparison runs the earlier portable-content
implementation and the bounded16-table implementation in the same snapshot:
both produce the identical digest. Earlier content verification takes36.423s /
469 queries; batching takes3.328s /34 queries. SQL/transaction deadlines, complete
table contents, locks, sequence state and final digest format remain unchanged.
The existing two-case integration suite now also compares the original per-table
format across batch boundaries, quoted identifiers, Unicode, null values, large
numerics, binary bytes and sequences; both cases pass. Pilot typecheck passes.
This measured optimization does not explain the first managed-batch failure or
the earlier intermittent native CI timeout. Complete current-source catalog and
hosted recovery acceptance remain required.

All six focused owned released-schema/owned restore cases also pass with the
batched portable digest. The new private store is connected only to Preview,
verified from actual project environment metadata. A bounded adapter exercise
lists all seven empty namespaces, writes64 random owned bytes, cold-reads their
exact digest, observes an unauthenticated denial and verifies deletion of the
owned canary. It uses no customer bytes and does not establish application
configuration cutover, byte migration, hosted job execution or recovery readiness.


### Preview state-query correction — 2026-10-20

The exact bb0b440 Preview deployment is READY and authenticates to the locked
schema079/revision3 restricted runtime. The sole firewall policy now retains the
four Production hosts and replaces the prior immutable Preview host with this
one. Actual old-host403 includes `x-vercel-mitigated: deny` with no redirect.
All13 branch backend settings have exact scoped metadata checks; known encrypted
values, immutable image and cost/signature bindings were read back privately.
The provider token has sensitive metadata confirmation only. Jobs and pilot
login remain disabled; no Sandbox budget has been provisioned or job dispatched.

The bb managed reconciliation stops at its first database checkpoint with actual
SQL57014 in `currentRecoveryStateDigest`, before cancellation:35 GETs,0 PUTs,
probe retired and both clients closed. Its original error and fixed subphase
are retained. The released monolithic state query also exceeds the unchanged
five-second limit in a separate read-only diagnostic. The earlier94 failure
remains unexplained. State content queries now use at most16 UNION arms, retaining
all locks, table order, row serialization, schema authority and final hash format.
The exact prior implementation is retained as a test oracle: both existing
integration cases pass, including same-snapshot digest equality and a negative
mutation check. An actual locked Preview full checkpoint then passes in10.962s
across85 queries; its maximum individual query is2.568s. Actual old/new Preview
state parity was not produced because the old statement timed out. Root and
pilot typechecks pass. This does not establish managed closure or recovery.

The denial capture command now accepts the existing explicit Preview/Production
source union, preserving exact target/platform/owner checks. Regression checks
exercise both target parsers through the producer's pre-network mismatch guard.
No denial capture, restored authority, service unlock or Production mutation is
inferred from that parser correction. Current-source full catalog, exact-source
hosted verification and all remaining release gates are still pending.


### 2026-10-20 recovery continuation and operator corrections

The exact6266f31 source completed its full deterministic catalog:997/997 cases,
181/181 suites, all processes successful and owned cleanup complete. The original
360-workflow Preview inventory was reconciled to actual terminal states in four
partitions. Two pre-wire failures were independently audited against complete
ordinal/hash manifests; exclusive durable first-wire markers admitted one actual
cancellation for each affected run. No uncertain dispatched cancellation was
retried. Complete current-provider, old-host and external-effect verification remains
separate and pending.

An independently retained matched encrypted capture was cold-restored to a distinct
hosted cluster. Actual ledger/content equality and a fresh restricted-runtime login
passed; the service remains locked. The fixed regional native restore completed in
23.510s and forwarded93,392,213 application bytes. Its application byte cap was
enforced; on-wire retransmission cost remained conservatively reserved. The owned
Sandbox was stopped/deleted and provider absence verified. This is physical restore
proof, not complete service recovery or pilot readiness.

Two Product Gaps WebKit cases that failed CI passed a fixed-event narrow diagnostic.
The complete unchanged local WebKit gate then passed88/88 across four projects,
without skips or retries. The original CI failure remains retained; exact-source
checks still gate release.

The first new live quality batch stopped in002 after an actual provider error. Its
original unknown dispatch, charges and full worst-case hold remain in the original
journal; no actual-model quality acceptance is claimed. The reviewed-resumption
change adds explicit, independently reviewed additive authority and conservative
uncertainty encumbrance without resetting original history or retrying that request.
Failure diagnostics distinguish actual Gateway metadata from upstream response IDs.

The local operator's CLI-issued OIDC token identified development and Blob denied
its access to the Preview-only store. Two separately bounded ephemeral Preview
identity attempts returned no credential and were actually canceled. No hosted
OIDC claim is made. Version3 verification now accepts the same explicit store-bound
credential used for the actual matched capture; v2 retains its OIDC-only contract.
Candidate/target/source binding and actual inventory/content checks are unchanged.
Fresh full-catalog and hosted results for these corrections remain pending.
The actual `17769b0` hosted work attempt authenticated the encrypted backup,
captured database content and private Blob inventory, then retained and cold-read
a fresh independent denial snapshot (5,292,963 minimized bytes, 112 tables).
Quarantine failed because its composition selected the disposable-only denial
helper. The owner transaction rolled back; no probes or unlock were issued.
The correction composes quarantine through the platform-bound owner transport
and authenticated retained-denial helper while preserving the owned-test guard.
The focused platform-bound SDK/denial regression passed (one selected case;
23 unselected cases), with the disposable-runner flag absent during quarantine.
All seven existing quarantine/current-grant regressions passed, as did root
type checking and documentation checks. The independent transaction review
found no blocker. Fresh exact-source full catalog and hosted verification
results remain required.

The actual `78dcf63` hosted continuation authenticated a fresh independent denial
snapshot, then exceeded the existing 290-second quarantine owner deadline and
rolled back. A fresh owner read confirmed zero quarantine rows and no probe
credentials were issued. `pg_stat_statements` was unavailable; no per-attempt SQL
profile is claimed. Cold-reading the retained snapshot for aggregate diagnosis
found 8,936 rows, 8,929 replay keys and 1,239 parity operations. The original
per-row queries were a likely network-round-trip bottleneck. The correction
batches immutable holds, readbacks, observations and replay writes at 256 rows
and 1 MiB, without changing the deadline or any denial/index/identity check.
The focused 258-hold regression passed across a batch boundary, and all 16
credential-denial regressions passed, including 300 additional replay rows.
Fresh exact-source full catalog and hosted completion remain required.

The `78dcf63` CI Product Gaps WebKit failure occurred while establishing the
held-command-body fixture, before the revocation exercise. A local instrumented
dark-WebKit case passed and observed JSON entry, transport completion, JSON
completion and then the held body. This does not establish the prior CI cause.
The test now waits for the exact impact POST's 409 and completed transport body
before its unchanged held-body assertion and revocation assertions. Its release
promise is registered before submission and released in cleanup; fixed phase
booleans survive document changes in diagnostics. Root type checking and all
eight diagnostic-privacy unit cases passed. No product timeout or authorization
guard changed; fresh browser and CI outcomes remain required.

The first full local WebKit rerun stopped in the confirmed-impact authoring
case while its POST remained pending: the fixed diagnostic showed the request,
a busy form, no impact response and no error message. This does not establish a
missing-message product defect or a database/network root cause. That test now
waits for the exact impact POST's 409 and finished body before its unchanged
rejection-message and focus-refresh assertions, within the existing 30-second
case budget. The failed run remains retained; a new complete browser run is
required.


## Native CI blocker transaction diagnosis

Exact e360516 hosted verification passed physical integrity and committed the
seven denial quarantine scopes, then stopped because MCP was disabled. No service
was opened. The independent fresh successor preserves that quarantined database;
its first public-schema restore found the missing vector extension prerequisite.
All 86 partial tables were independently verified empty before applying the
explicit migration019 extension prerequisite. Complete restored parity remains
pending; no successful full recovery or release is inferred from these steps.

The same-source native-operations fixture passed locally with the actual runtime
and CLI WebKit. Legacy CI attempt1 failed at input-authority with55P03; attempt2
failed at prepare-owner with57014. Both observed membership lock contention, but
the prior fixed query labels did not identify blocker transaction state or age.
The owned read-only CI observer now adds bounded fixed blocker state, query and
transaction ages, and one-hop operation classes. Raw SQL, identities, application
names, timestamps and customer content remain excluded. This diagnostic change
does not alter authorization, quotas, transaction clocks or test expectations;
the repeated CI failure is unresolved pending actual blocker observations.

Narrow validation for the blocker observer: root typecheck, three existing privacy
unit cases, documentation hygiene and diff checks pass. Independent read-only
review found no blocker. No new hosted behavior or full-catalog pass is claimed.


## Authority readers and writer serialization

The bounded blocker observer reproduced the actual CI failure: input-authority
failed with55P03 while the blocking login-session transaction was idle in
transaction, with no downstream blocker. Its longest observed transaction age
was2859ms. The evidence supports reader/writer authority-lock contention; it does
not establish slow SQL, compilation or provider behavior as the cause.

Workspace actor validation now holds SHARE authority locks for both reads and
writes. Write admission remains operational write admission. Ordered principal
and workspace advisory transaction locks preserve writer serialization, including
principal quotas across workspaces. Actual authority mutations still need UPDATE
locks and cannot race the validating SHARE transaction. A nested read-to-write
transition uses nonblocking writer-lock acquisition; contention aborts PostgreSQL's
transaction, preventing a caught error from permitting partially serialized work.
The transaction-local scheduling marker resets on rollback. Prelookup and locked
membership/principal identity sets must match exactly. The recovery SQL guard
allows only the exact canonical local scheduling-marker statement; its
transaction-control restrictions remain intact.

All16 support-policy and grant-concurrency integration cases pass in owned local
disposable databases, including coexistence with a held authority reader, blocked
session revocation, denial after revocation, aborted nested contention, quota races,
conflicting grant decisions and final-administrator preservation. Existing recovery
SQL guard cases pass with narrowly scoped scheduling-marker acceptance and denial
vectors. Root typecheck passes. Independent read-only review found no remaining
blocker. The actual unpaid native-operations/runtime/CLI WebKit fixture also passes with
zero observed deadlocks or statement timeouts; its260-sample observer records no
contended query. Current-source CI, complete catalog and hosted recovery remain
required; these local checks do not establish release completion.


The first broader local domain run retained233 passing cases and one failure:
batched public-learning recall used29 queries against its unchanged26-query limit.
The correction combines timeout configuration, prior transaction-mode capture and
the constrained read/write marker into one fixed statement. A MATERIALIZED CTE
captures the prior mode before updating it. The recovery SQL guard accepts only
that exact shared statement; modified values or adjacent SQL remain denied.
All16 support/grant cases, the existing SQL guard cases and root typecheck pass
after this correction. Independent review found no blocker. The repeated complete
domain run passes with no paid provider calls. The corrected actual native/runtime/CLI WebKit fixture also passes with no paid
provider calls, deadlocks or statement timeouts. The initial failed query-budget
run is retained and its threshold is unchanged.


## Partner guide command settlement

On eff7f03, all seven Legacy backend parity CI jobs pass. The main CI partner
WebKit job118735902352 timed out after90034ms in the first guide journey on
mobile-dark. A complete local reproduction independently failed on desktop-light
at partner-guides.spec.ts:14:406: the browser was signed in as partner, but its
protected guide body was unavailable and the published lesson was absent.
No database error code was recorded in that owned runtime log.

The journey's broad published-text assertion was already satisfiable before the
publish command completed: Original Evidence Dates renders the literal word
published even for a submitted guide. The fixture now registers the exact guide
and action-specific command response before each click, requires HTTP200 and the
finished response body, and checks the direct review-state paragraph for published,
submitted and rejected. Revise and submit acknowledgments also complete before
changing the browser's authenticated role. Existing role/privacy assertions and the
90-second case deadline remain unchanged; retries remain zero.

The complete corrected five-file/four-project CLI WebKit matrix passes48/48,
with zero failed or skipped cases. Root typecheck and independent read-only review
pass. The initial failed CI/local runs remain retained. One initial correction run
was explicitly interrupted after the matcher source changed; it is not a pass.
A new exact-source full catalog and CI are still required before release; no
hosted recovery or Production behavior is inferred from these local checks.


### Forecast utilization response boundary (2026-10-20)

The df10dfb execution WebKit CI job failed its mobile-light forecast journey at
the visible 12.50% utilization assertion after 59,002 ms. This is an actual failed
case, not evidence of a calculation defect. An initial local attempt stopped in
setup because the recovery checkout has no .env.local; it never ran the case.
The unchanged journey then passed all three mobile-light handoff cases on an
owned PostgreSQL 18 source with no retries. The prior CI cause is not established.

The fixture now waits for the exact selected dates and period actual of 60 minutes
after applying the period, registers a utilization GET response before clicking,
and verifies the actual date/resource scope and HTTP 200 before the existing
12.50% visible-result assertion. The case limit of 240 seconds, assertions of 30 seconds
and zero retries remain unchanged. The complete handoff matrix passes 12/12 across
four WebKit projects with no failures or skips. Product calculations, resource
selection and calendar setup remain unchanged; no unobserved cause is asserted.

A narrowly scoped CI diagnostic decodes only the fixed inline utilization
attachment, bounded to 2 KiB. It publishes status, whether dates and resource match the fixture, whether
the result equals the expected percentage and allowlisted states/error codes. Attachment paths,
raw response text, percentages, labels and identifiers are excluded. Malformed,
oversized, path-only and private-token vectors and repeated sanitization pass
inside the existing three-test diagnostic unit suite. Root typecheck passes.
Full CI and catalog checks for the new commit and actual hosted acceptance remain required.

### 2026-10-20 complete catalog and maximum-byte assertion

The frozen `b134d69` local execution `11f86d3c-1d91-4101-8482-a1a2ae684d01`
passes all 1,006 cases across 181 suites without failures. Its Turas CI run
`39469060834` finishes with 45 passing jobs and one failure: the first exact
ten-MiB report roundtrip exceeds its unchanged 15-second test timeout. Legacy CI
`39469060845` passes. These outcomes remain separate.

An independent, credential-free Node 24/Vitest measurement of two equal copied
ten-MiB Buffers takes 12,076 ms for the deep-equality assertion and 0.346 ms for
native Buffer comparison. A changed final byte is rejected by the latter. This
establishes assertion overhead; it does not establish every contributor to the
CI timeout. The roundtrip now compares the complete returned bytes with
`Buffer.compare`, retaining all four cases, byte limits, integrity checks and the
15-second timeout. Fresh complete local and CI results are required for this
change.

The latest isolated native restore verifies the original candidate's complete
content and schema ledger, separate physical target, restricted verify-full TLS
read and actual executor removal. Full hosted recovery remains unverified. A
subsequent verifier failed before its producer started because its output
directory had been precreated; complete journals and actual filesystem snapshots
were retained. Its finite deadline expired before a reviewed continuation ran,
and the target's timeout guard disabled both runtime logins and CONNECT access.
These failures do not establish restored service or pilot readiness.

The changed report-wrapper suite passes all four cases on an owned PostgreSQL18
environment with no provider calls. Root typecheck and documentation checks pass.
Independent review finds no coverage, deadline or byte-integrity regression.

### Evidence scan continuation (2026-10-20)

The `1b728f3` regional verifier exported all 217 original journal files, independently
confirmed zero live owned sessions/MCP credentials/admissions with historical
credentials unchanged, and verified removal of its executor and owned snapshots.
It failed during canonical evidence-list traversal; service remained locked.
A subsequent read-only census found profile state for all 184 customer references,
and confirmed that quarantine had changed the candidate content. Fresh native
restore/integrity evidence is required before another full recovery attempt.

An isolated PostgreSQL18 clone restored the retained matched candidate dump and
verified exact accepted-content parity before adding rollback-only local diagnostic
credentials/control fixtures. The original domain evidence reader returned
`unavailable/incomplete` for the reproduced 133-candidate groups. This was local
diagnosis, with no model calls or hosted readiness claim. The repaired reader scans
at most the same 100 candidates, returns an opaque bound continuation even when
all scanned passages are withheld, and leaves the unscanned candidate for the next
page. It returns `empty` only after genuine exhaustion. Both reproduced groups
now complete through an available empty continuation and an exhausted empty page.

All five evidence integration cases pass, including a first page of 100 withheld
candidates followed by real eligible evidence, and later all-withheld exhaustion.
Root typecheck passes. The exact current-schema regression composition increases
from 39 to 40 cases to include this regression. Complete fresh committed catalog,
CI and hosted recovery checks remain required. The `1b728f3` CI failures in mobile
WebKit visibility and expansion restart status remain retained, not erased by
these narrow local checks.

### Root reservation/request output limit (2026-10-20)

Review found a concrete request/admission mismatch: when maxOutputTokens was
absent, root admission calculated its reservation using 8,192 tokens but forwarded
an absent limit. The governed root wrapper now forwards the same effective limit
used in that calculation. An explicit limit remains unchanged; an unrelated
attempt retains its original parameters and creates no root budget operation.
The selected model, tools refusal, unknown holds, provider identity capture and
post-dispatch reconciliation remain unchanged.

All six owned PostgreSQL18 root-budget cases pass. The existing generate/stream
case captures actual synthetic provider parameters and verifies fallback 8,192,
explicit 700, and unrelated undefined values. Typecheck passes. These fixture
calls make no real provider requests; this does not prove provider adherence,
reduce the shared worst-case reservation, or establish hosted readiness. Fresh
committed complete checks remain required.

### Canonical MCP credential batch expiry (2026-10-20)

The actual `8f85a89` regional run passed persistence/source checks and transferred
its scoped inputs. Its first canonical 60-customer batch outlived the original
short-lived MCP credential; it failed authentication and left service locked.
Independent cleanup verified zero live owned sessions, MCP credentials and
admissions, historical credentials unchanged, and executor/snapshot deletion.
This is a failed recovery observation, not a successful negative test.

Canonical batches now contain at most 20 customers, with the same 59-second
credential lifetime, exhaustive selection/record/citation traversal, and original
32-probe aggregate limit. The existing 1,479-selection fixture requires 21 probes
instead of nine and verifies their retirement. That focused owned case passes
in 56.6 seconds; typecheck, documentation checks and independent review pass.
Hosted recovery remains required;
no deadline extension or incomplete-scope acceptance is introduced.

### Deterministic original-deadline fixture (2026-10-20)

The retained `8f85a89` CI deterministic job failed the existing real-time
30-millisecond deadline assertion. Transfer could consume that interval before
the command began, producing an abort rather than the command-phase deadline
message. The fixture now waits for actual synthetic command admission before
advancing a controlled clock through the unchanged 30 milliseconds. The same
case also verifies transfer-phase expiry refuses command admission and still
stops/deletes compute. All 14 executor unit cases pass. Runtime code, cleanup,
deadlines and the named case inventory are unchanged; original CI failure is
retained and fresh committed complete checks remain required.

### Regional guard failure and idle recovery clients (2026-10-20)

The actual `e6c04d0` regional verifier failed its conservative proposed-wire
reservation guard. Provider-reported egress was approximately 88.9 MB; this is
not evidence of actual transfer-cap exhaustion. The private guard charged both
TLS layers, local socket writes and 1 KiB per JavaScript write. Its synchronous
rejection escaped the awaited verifier cleanup. All original failure evidence
is retained. A separately reviewed cleanup recovered 689 original journal files,
verified zero live owned sessions/MCP/read admissions, and confirmed the executor
and all five snapshots deleted or absent. No verifier or model retry occurred.

Independent review also found reachable recovery-owned pg Clients without idle
error ownership in denial capture/read and Production peer measurement. Those
clients now abort a local controller combined with the existing cancellation
signal, and the caller checks cancellation before returning proof. Existing query
bounds and independent finally cleanup remain. The existing minimized-snapshot
case additionally terminates a real idle backend and checks cancellation and
cleanup. The focused owned case passes in 10.37 seconds; pilot typecheck,
documentation checks and independent source review pass. These changes
and local guard fixtures do not establish hosted recovery or release completion.

### Exhaustive recovery timing and bounded measurement groups (2026-10-20)

The actual `56ed2e6` run failed its900-second command bound. Salvage durably
retained15,398,462 original export bytes covering1,414 files before parsing. It
recorded36 MCP probes across approximately501seconds, followed by192 canonical
and HTTP session intents for96 profile records across approximately220seconds.
It did not establish full maintenance, conversation or service coverage.

Restart cleanup initially exceeded a shared290-second configuration scope while
reopening a constructor for each four-probe group. A separately reviewed
deny-only owner census verified the exact228 original identities already closed;
no additional revocation writes or role enabling occurred. The expiry guard
disabled both runtime roles and CONNECT. A deletion-only continuation verified
the stopped executor404 and both actual snapshots deleted/absent. The complete
failure and raw journals remain retained; this cleanup does not rehabilitate the
failed recovery verification or establish provider compute suspension.

Bounded measurement groups and transaction-bound conversation freshness are
undergoing focused verification. The first mixed composition test caught a
neighbor-credential failure: per-MCP denial reconciliation revoked other lanes'
new probes. The corrected design completes one genuine reconciliation before any
group callback can issue credentials. The original failed test remains retained.
Focused checks now pass: all four cancellation cases, the existing real-owner
case extended with32 issued/retired probes and rejection of a ninth lane slot,
peer failure with a pending writer, the mixed full recovery command, and the
conversation transaction-binding case. The latter retains original timestamps,
rejects copied capabilities, mutated batch arrays and reuse on another target,
and checks current canonical authorization after consuming freshness in the
original transaction. The mixed case verifies exactly one reconciliation for
four16-call MCP neighbors, revocation of an uncaptured old session, survival and
retirement of new probes, no callbacks on forged preparation, and no new sessions
for substituted genuine denial authority. The unchanged1006-case/181-suite
catalog at `56ed2e6` also completed successfully; it predates this fix. Whole
committed catalog, CI, actual timing/freshness and hosted recovery proof remain
required; passing concurrency fixtures cannot substitute for them.

### Synthetic research cancellation transport (2026-10-21)

The original599db93 CI verify job failed at the Product field in the mobile-light
research-cancellation test. Its original log is retained; the cause of that
particular field failure remains unproven. A narrow unchanged owned Postgres18
reproduction separately timed out at Confirm and start: setup reached the scope
preview in2.874seconds, but the synthetic nonexistent native session left the
SDK non-ready and the production start guard correctly disabled.

The fixture now supplies only its exact synthetic native stream with valid empty
v25 NDJSON and tail index−1, denies its exact native delivery with503, and checks
that the idle stream was read and Confirm becomes enabled. It retains the real
authenticated application and database context, research HTTP fixtures, keyboard
cancellation, checked findings and accessibility assertions. Production guards,
per-test deadlines and retry settings are unchanged.

The exact correction passed the narrow mobile-light case in3.88seconds. Its full
four-project WebKit matrix passed24 cases with four existing skips, zero failures
and zero retries in72.02seconds. These are controlled local UI observations with
zero provider calls; they neither explain the original Product-field CI failure
nor establish hosted model, recovery or release acceptance. Independent review
verified the exact fixture and retained capture. Complete committed-source
catalog, CI and hosted evidence must be refreshed for this correction.

### Undrained cancellation fixture and clone dependencies (2026-10-21)

The complete599db93 catalog stopped after153 attempted suites:152 passed and the
locked-target suite had15 passing cases and one failing cancellation assertion.
The fixture intentionally awaited a promise that never settles. The bounded
callback-drain behavior added in T111 therefore correctly returned an aggregate
instead of the previously expected cancellation-only error. An independent owned
Postgres18 reproduction captured exactly the controlled cancellation and the
undrained-callback error, then verified actual independent credential retirement.
There was no database-end or credential-retirement error. The original failed
catalog and diagnostic remain retained; no runtime drain guard is being relaxed.
The corrected assertion and all16 affected owned cases pass with unchanged
deadlines. Complete committed-source and hosted checks remain required.

The first7a1f478 frozen-clone catalog also failed during setup. Its clone lacked
the extractor dependency directory required by owned Next dependency resolution.
The existing dependency bytes were preserved in the main project's private
artifact directory and linked into the clone without changing tracked source or
deleting the original dependency tree. A fresh owned setup matching prior55 and
query-statistics settings passed the legacy preparation and current079 migration
sequence. An earlier diagnostic used an incompatible prior-schema setting and is
retained separately. This setup check is not a passing full catalog. Paid model,
hosted recovery and release gates remain pending.
