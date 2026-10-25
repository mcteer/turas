# Implementation Plan: Pilot Hardening and Launch Readiness

**Branch**: `016-pilot-hardening` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: `specs/016-pilot-hardening/spec.md`. Implementation is in progress. Execution incorporates released main f8d196f on schema077; the original planning baseline was015 on schema055.
016 migrations have been exercised in owned disposable local environments and
the isolated synthetic Preview database. No 016 hosted application release has run.

## Summary

Make the existing product operable for a controlled internal/assigned-partner pilot.
Bind sessions to workspace membership and isolate a synthetic Production workspace;
provide durable private file storage and bounded hosted scan/parse/render execution;
make every maintenance class observable; rehearse consistent recovery and lifecycle
rules; collect exact-version readiness evidence and attributable automated role observations.

Use existing domain authorization, review, job/lease, deletion and evaluation paths.
The readiness checker reports eligibility, not human approval. No broad customer
authentication, onboarding, new business capability or automatic external send.

## Technical Context

**Language/Version**: Node 24, TypeScript 7.0.2; explicit SQL migrations.

**Primary Dependencies**: Existing Next 16.3.8, React 19.2.6, eve 0.67.1, pg 8.23.1,
Zod 4.5.4 and MCP SDK 2.3.1. Add reviewed/pinned public `@vercel/blob` and
`@vercel/sandbox` SDKs only for verified 016 adapters. Read installed Next auth,
route-handler and upload guides and installed eve deployment/sandbox/auth pages
before code. Registry discovery found no suitable domain-store integration.

**Storage**: Existing Postgres/pgvector with explicit 078 session/pilot isolation
and 079 operational control/worker/hosted-job metadata (reconfirm free numbers).
Private Blob for hosted artifact/workforce/report/gap bytes; existing local adapters
for development. Workflow remains eve's actual configured backend. Private operator
evidence and backup manifests are separate from customer truth.

**Testing**: Required deterministic contracts/integration, full affected predecessor
suites, native synthetic-provider boundaries, four CLI WebKit configurations,
actual pinned MCP SDK, hosted Blob/Sandbox checks, recovery/lifecycle/fault drills,
bounded load, source-bound CI and explicit post-merge Production validation.
Actual-model evaluation follows its governing feature and applicable budget/review.

**Target Platform**: Existing Vercel app/eve project and Postgres. New private Blob
store and digest-pinned Sandbox images are active requirements, provisioned only
within the concrete authorized implementation/release and admitted infrastructure
cost envelope. No provider key or data changes in this planning turn.

**Project Type**: Existing full-stack app plus operator CLI and bounded hosted jobs.

**Performance Goals**: 25 sessions/250 customers/10,000 passages; each ordinary-read
class p95 ≤2s, admitted MCP class p95 ≤1s, unexpected failures <1%. RPO ≤24h,
RTO ≤4h. Detection of a stopped maintenance class ≤5min. Existing tighter domain
limits and quotas remain in force.

**Constraints**: [C01–C16](data-model.md); private immutable bytes; exact current
membership, source and generation rechecks; no runtime DDL; no customer/pilot mixing;
no filesystem durability assumption; no paid retry after uncertain dispatch;
no source-digest relabeling; no host browser. Model selection remains unchanged.

**Scale/Scope**: Five stories, 25 functional requirements and 10 success criteria.
Split implementation into the stages below; whole-pilot approval requires all core
gates. Production workflow proof and independently reviewed automated role observations retain distinct records.

## Constitution Check

| Principle | Before research | After design |
| --- | --- | --- |
| I — Specify first | Bounded readiness outcomes and explicit audience | Spec, research, contracts, model, tasks and handoff precede code |
| II — Customer outcomes | Synthetic pilot is not actual customer benefit | Separate workspace/publication eligibility and excluded populations |
| III — Evidence lifecycle | Existing approval and withdrawal rules retained | Store transport and recovery preserve lineage/current eligibility |
| IV — Authorization | Membership/grant/owner limits are mandatory | Bound sessions; pilot fence and domain rechecks across UI/native/jobs/MCP |
| V — Human decisions | mcteer owns release, domain reviewers retain decisions | Checker only computes eligibility; no CLI owner-string approval |
| VI — eve core | Installed docs read; registry investigated | Public bounded job SDK adapter; existing eve agent/runtime/model preserved |
| VII — Verification | Access/storage/worker changes need behavior checks | Full affected gates, actual hosted services, recovery and WebKit evidence |
| VIII — Operability | Costs/time, failures, migration and privacy bounded | Leases, exact receipts, explicit 055→078→079/grants and recovery fence |

All design gates pass. No constitution exception. Infrastructure provisioning,
automated role capture evidence, controlled sends and live-model budget are execution-time inputs,
not facts to invent or approvals obtained by this plan.

## Project Structure

### Documentation (this feature)

```text
specs/016-pilot-hardening/
  spec.md plan.md research.md data-model.md quickstart.md tasks.md handoff.md
  checklists/requirements.md
  contracts/readiness.md contracts/hosted-runtime.md contracts/recovery-lifecycle.md
  contracts/pilot-journeys.md
```

### Source Code (repository root; planned additions marked in tasks)

```text
lib/contracts/pilot-readiness.ts
lib/server/operations/{control,maintenance,health,hosted-jobs}.ts
lib/server/storage/{private-objects,local-objects,blob-objects}.ts
lib/server/jobs/{executor,local-executor,sandbox-executor}.ts
lib/server/auth/{credentials,sessions}.ts
lib/server/access/{service,policy}.ts
lib/server/knowledge/ + lib/server/retrieval/ + lib/server/learning/ + lib/server/mcp/
lib/server/{artifacts,staffing,reports,gaps}/  existing governed file/job adapters
app/api/health/ready/route.ts
app/api/operations/status/route.ts
app/api/artifacts/intents/[intentId]/upload/route.ts
app/api/staffing/imports/[importId]/upload/route.ts
agent/channels/maintenance.ts + lib/server/conversations/hosted-watchdog.ts
migrations/078-pilot-workspace-sessions.cjs
migrations/079-pilot-operations.cjs
scripts/pilot-{source,catalog,environment,readiness,backup,recovery,lifecycle,hosted,feedback}.ts
scripts/pilot-catalog.json scripts/pilot-suites.json
scripts/{test-pilot,benchmark-pilot,check-pilot-ui,check-pilot-regressions}.ts
scripts/{maintenance-worker,reports-worker,artifact-worker,db-migrate,db-roles}.ts
scripts/provision-pilot-workspace.ts
scripts/pilot-ci-evidence.ts
infra/artifacts/ report-renderer/  existing images and validation programs
infra/pilot/  image build manifests, backup schedule and operator configuration
vercel.json .github/workflows/ci.yml package.json .env.example
 tests/{unit,contracts,integration,fixtures}/pilot/ tests/ui/pilot-*.spec.ts
 docs/pilot-operations.md docs/pilot-lifecycle.md
```

The new workforce upload route extends the existing staffing import route tree
and retains its authorized import intent. No duplicate
business service or public readiness dashboard is introduced. Add operational
metadata to 079, not a parallel customer/plan/report data model.

## Design and execution stages

1. **Evidence foundation / US1**: Freeze the gate and source catalog, strict private
   receipts, run/resume semantics, owner-independent eligibility checker and owned
   harness. A CLI can report blockers before hosted changes exist.
2. **Pilot isolation / US3 foundation**: Apply 078 with session membership backfill;
   retain primary default and add explicit Pilot Workspace login choice for already
   assigned users. Bind every resumed session to its membership. Pilot knowledge,
   metrics, jobs and MCP stay in their eligibility lane; normal sanitized shared
   knowledge remains usable in pilot, with no pilot-to-primary output flow.
3. **Hosted persistence / US3**: Add Blob/local interface and direct upload path;
   migrate artifact/workforce/report/gap callers without changing domain authority,
   immutable digests or limits. Add protected finite dispatcher and nonpersistent
   Sandbox adapters around existing fixed scan/parse/render programs. Add 079,
   source-fenced provider identities/leases, per-class health and runtime grants.
4. **Recovery / US2**: Back up matched DB/object inventories/workflow capability and
   separate current denial/replay state. Recovery fence is persisted and denies
   normal traffic/dispatch before any restored runtime starts. Restore only to an
   isolated target; reconcile or quarantine before an explicit verified unlock.
   Schedule new 016 backups every 12h; maximum valid age 24h, retention seven days.
   This applies to new managed backups, not deletion of existing operator archives.
5. **Lifecycle/access / US3 completion**: Verify all existing periods and stores;
   common hosted/local registry invokes the existing bounded cleanup methods.
   Correct any failed boundary at its governing service with targeted regression.
6. **Operations / US4**: Complete per-class health, strict readiness/schema/grants,
   safe metrics, natural-quota load, failure injection and operator runbooks. Gather
   current quality/cost evidence without inferring free/unknown service use.
7. **Pilot/release / US5**: Provision the separately marked workspace idempotently
   with owned records and exact grants; run normal proposals/reviews, actual hosted
   file processing and five-category SDK reads. Collect automated role observations per the 2026-10-19 directive, fix blockers,
   finish target migrations/grants and exact-version post-merge checks; record the
   mcteer decision and owned cleanup. Record actual hosted captures as automated observations, never as human
   comments; retain independent capture review and the separate release decision.

Stages can use multiple PRs. A feature branch may be replaced after each merge to
honor branch cleanup; keep `SPECIFY_FEATURE_DIRECTORY` fixed and tasks cumulative.
No intermediate PR advertises the full pilot as ready. Local and CI evidence may
complete before Production or hosted role exercises; report those states separately.

## Architecture boundaries

- **Session selection**: Credentials still authenticate existing principals. An
  optional selected workspace must match an active membership; absent selection
  resolves only the existing primary workspace. Session row stores membership and
  workspace. Legacy ambiguous sessions are revoked, not guessed. Native and MCP
  actors retain their existing distinct authority types.
- **Private storage**: Domain services authorize before opening streams and recheck
  while returning data. Blob capabilities allow only an owned staging upload with
  size/time/path limits. Server completion validates actual bytes and intent state.
  No public or reusable private read URLs. Local paths are temporary executor inputs.
- **Execution**: DB jobs/leases and source fences own state; Blob/Sandbox only store
  bytes/run fixed programs. Admission is capped at two heavy jobs/environment.
  Fresh, nonpersistent, deny-network sandbox; no DB, Blob or model credentials.
  Failure/timeout/lease loss cancels or reconciles the exact provider ID; no blind
  replay. Keep short cleanup separate from long rendering and paid research.
- **Recovery control**: Owner CLI changes a versioned environment control row via
  explicit operator connection; runtime can read, not unlock it. Shared browser,
  native, MCP, worker and provider-dispatch admission checks honor the fence.
  Protected health and authenticated cleanup/reconciliation remain available;
  recovery writes are owned and separately bounded. Drain active operations before
  snapshot; inability to quiesce or reconcile blocks the snapshot/promotion.
- **Evidence**: Receipts are operator evidence, not a cryptographic third-party
  certification. Strict byte/source/time/method validation prevents accidental
  stale/cherry-picked proof; human review establishes trust in the executing operator.
- **Approval**: Attributable mcteer instruction/review plus exact eligible bundle is
  recorded by the operator. Programmatic output remains `eligible`, never self-issued
  `approved`. Existing user authorization is reused when it covers the concrete step.

## Release, migration and recovery order

Reconfirm latest main and free migration numbers. 078 backfills each old session to
its unique active primary membership and revokes ambiguity; 079 adds operational
controls, worker runs and hosted job leases. Update migration manifest, explicit
runtime grants and each feature readiness/activation compatibility check for exact
new versions. Never simply allow all future schemas.

Rehearse empty and 055 upgrades plus matched restore in owned isolation. Before a
schema-dependent target release, record marker/current ledger and backup evidence;
apply compatible additive migrations/grants before code depends on them. Keep pilot
workspace and new hosted adapters disabled until schema, store/image/executor and
quota/cost readiness pass. Provision private storage/images with versioned receipts,
then verify Preview and exact Production deployment through eve/Git release rules.

After all required CI checks are green and merge is authorized, merge, confirm the
actual deployed commit, run authenticated role/workspace/UI/SDK/processing checks,
then record readiness and limitations. Do not use auto-merge as proof checks waited.
When rolling back, fence new work, revoke staged capabilities/leases, retain exact
objects and receipts, and use forward corrections. A rollback must not switch Blob
content to an empty local store, drop session binding, revive sources or replay work.
Revoke owned test credentials and stop owned sandbox jobs; preserve permanent audit.

The runbook covers Blob migration by copying exact verified objects while source
writes are fenced and switching only after inventory parity. Keep the old store
readable for reconciliation until the verified transition closes; do not silently
move or delete existing customer originals during operator cleanup.


## Authorized resumption — 2026-10-17

The user requested completion of all remaining hosted workflow and operational-readiness work through release. Resume PR32 from650f5f4 against released main34eb05c; the earlier schema055 planning and evidence above remain historical. The immutable released migration ledger001–077 is preserved. Pilot workspace/session changes now use078 and operational controls use079. Exact current-schema guards, archive provenance, predecessor fixtures and recovery consumers must agree before any hosted migration.

Preserve all018backend and019chat mechanisms, current appearance and root model. Shared maintenance must retain ordinary native retirement/upload-byte expiry with actual backlog, Preview's180-second worker and real claim/heartbeat admission, plus a separately admitted embedding lane outside cleanup authority. No selected environment or workflow files may change.

Expired016quality/infrastructure and separate parity budgets remain unchanged, including every unsettled dollar/token hold. Prepare concrete current source/target/cost manifests before paid admission; no automatic top-up or reuse of the narrower Notion allowance. Current-source backup coverage must include the newly released ordinary/provider/replay records, not only the original055 table inventory. Historical signed receipts remain historical; schema labels cannot turn them into current evidence.

Finish implementation and owned validation first, then target-bound Preview/Production acceptance and cleanup. A fresh actual backup and isolated restore, plus an enabled stable recurring schedule, remain required. The explicit 2026-10-24 user directive removes the 12-hour observation wait from release acceptance; two genuinely spaced captures remain an unobserved operational follow-up. Authorized automated operator/internal/assigned-partner observations retain their attribution and independent review; automation cannot impersonate humans. Reuse applicable user authorization without repetitive permission prompts, and request only information or material authority actually absent after the work is concrete.

### Hosted storage completion (T085)

Use the existing governed Blob/local adapters, required-original inventory and
exclusive recovery IO checkpoint. A private exact-source cutover plan binds the
full target configuration, finite byte/object bounds and an applicable Blob cost
budget. Admit/hold the complete operation while open, then quiesce/lock and
release the configured deployment. Copy with fresh clients and cold digest
parity under the existing fence; authenticated platform and runtime readbacks
must agree before/after. Preserve originals and unknown cost ceilings on failure
or success until explicit accounting. Configuration deployment and verified
service unlock remain distinct explicit release operations. The implementation
belongs in `lib/server/operations/storage-cutover.ts` and the existing storage
operator entry point; tests use actual isolated database/bytes without claiming
that local adapters establish hosted Blob behavior.

### Recovery bootstrap and original chat allowances (T087/T088/T093)

A restored database remains closed until real verification is produced. Resolve
bootstrap with a credential-verified, owner-locked, deadline-limited in-process
read-only probe bound to the exact database client, actor and recovery revision;
never accept a JSON actor/healthy label as a capability or open public login for
preflight. Revoke temporary probe sessions before the final state digest.
Actual normal login/HTTP/WebKit after explicit unlock is still required for
verified-service timing.

Preserve an ordinary conversation's original 20,000-token allowance using its
independently captured immutable baseline and an operation-ID-deduplicated union
of local model operations and recovery holds. Unknown operations consume their
entire original ceiling; authenticated known usage is retained without inventing
zeroes or restoring spent allowance. Enforce the same deterministic used amount
under the conversation row lock in database admission. Missing immutable baseline
metadata must fail closed. Captured control/question/native request identities
remain permanently fenced; this accounting does not revive interrupted attempts
or establish that a cancelled native workflow can resume. That capability needs
its own actual supported execution proof, or the scope stays restricted.

### Managed execution inventory before closure (T087/T088)

The explicit operator provider adapter lists unfiltered lazy run metadata with
bounded pages and byte counts in the selected Preview/Production environment.
Traverse the entire run catalog twice, require stable run identities/metadata,
retain provider-only child/orphan identities and reject missing application
bindings, cursor cycles, duplicate rows and any overflow. The existing managed
inspection command includes this graph before its final unchanged-application
check. This is observed repeated pagination, not an atomic provider snapshot or
proof that old deployments cannot admit work. Durable exact-run cancellation,
complete deployment retirement and effect reconciliation must precede any
composed recovery verification writer.


Recovery completion implementation now separates pre-quarantine physical integrity
from subsequent deny-only transformations. Current grant preservation requires the
actual authenticated retained-reader object and composes effect retirement and
permanent denial/replay fences in one owner transaction. These mechanisms are
implemented; they are not a completed recovery verification producer, hosted drill,
or authorization to unlock service.


Managed closure now has a finite inventory orchestrator in addition to the
explicit-run batch command. The locked schema-079 inspector stages a source-bound
plan; execution repeats the provider inventory, preserves each independent intent
and terminal receipt, and rechecks the entire identity/application/source set at
completion. This automates batches without expanding the set after drift or
retrying uncertainty. It does not establish old-deployment retirement or effect
settlement, and therefore does not produce full recovery verification.


Project deployment discovery now complements the complete managed-run inventory.
The same read-only inspector traverses all project targets twice at a fixed cutoff,
with finite identity/page/byte limits, unchanged application/source checks and
private stripped metadata. Unlisted run-referenced deployments remain unresolved.
This supplies metadata for T087/T091; actual current deployment/alias/credential
protection and paid/workflow reconciliation remain necessary before verification
or unlock. No new retirement authority is inferred from the inventory.


Credential retirement must independently establish the actual provider credential
scope; a key name, deployment list or aggregate spend does not establish exclusive
Turas authority or reconcile an original operation. The read-only Gateway key
inventory currently reports one selected-team key without a project binding or
finite expiry. Other consumers and historical/OIDC credentials remain unverified.
Do not rotate it, clear holds or mark old deployments closed from that metadata.

### Completion resumption — 2026-10-18

Reconcile with actual released main `f8d196f` before final checks, preserving the
completed PR43–46 fixes and their historical proof. Existing pilot migrations
078/079 remain additive after the immutable released001–077 ledger. Final-source
validation and target-bound hosted recovery/storage acceptance remain required;
expired budget envelopes are not renewed by a source merge. Actual hosted automated role
observations remain required. Under the 2026-10-24 user directive, actual backup/restore and an enabled stable recurring schedule are required without waiting for the 12-hour spacing observation.

## Recovery measurement composition and refreshed denial authority

Long verification must retain the original15-minute command bound,59-second
credential bound,290-second owner bound,32 owned probe slots,64 tools per category
and five-minute freshness of current denial authority. Refresh current authority
only between fully retired measurement windows, through a finite governed capture
from the explicit original source. Verify that source against its platform binding
and reject the restored target as the capture source. Every capture observes the
original parent cancellation signal. Cold-read its encrypted independent archive
and separate key; a JSON receipt alone cannot refresh authority.

To reduce repeated platform and inventory latency, independent measurement groups
may run at most four genuine owner transports. Enforce eight lifetime probe
reservations per lane and32 across the group at issuance; retirement never frees
a slot. Every lane uses the same exact source, target and shared deadline. Before
any callback starts in a group containing MCP, one genuine owner transaction must
apply the exact authenticated retained denial capability. All constructors await
that transaction. Only duplicate reconciliation within that exact prepared group
may be skipped; repeating it after issuance would revoke neighboring new probes.
Per-probe authorization and current denial freshness remain mandatory.

Each callback must retire its own sessions, admissions and MCP credentials before
the group barrier. Only then may constructors perform their existing global
retirement and final platform checks. Publish no measurement brands or results
until every constructor and independent cleanup succeeds. Abort all lanes on any
failure, drain within40seconds for existing cleanup, and permanently quarantine
that process's recovery writers if a lane does not drain. This drain cannot
extend a work/credential deadline or count as verified service.

At entry to the final fenced owner transaction, consume the original maintenance
and conversation HTTP freshness. Derive its complete maintenance inventory once
and check every original batch and retired credential against it. Conversation
consumption is an opaque capability bound to the exact client, target, transaction
and immutable batch identities, retaining all original timestamps. After MCP
replay, require unchanged conversation inventory and current canonical participant
authorization in that same transaction. A later transaction cannot reuse that
capability. Recent genuine MCP observations may satisfy existing canary predicates
without an unconditional duplicate read; all current consumers still enforce
their participant/chunk/category freshness and complete coverage requirements.

Keep an opaque historical-denial capability alongside the latest genuine cold
read. Every accepted continuation must retain every prior table/identity/replay
key, including newly observed identities from earlier continuations. Require
unchanged full minimized rows and original row hashes for effect, provider,
financial and permanent-receipt inventories. Only the explicitly classified
current-authority tables may change their status/row hash. This conservative
rule may block legitimate history mutation; it must never discard an earlier
hold, ceiling, unknown exposure, native/send binding or request fence. Validate
the whole continuation before updating its private capability. Final verification
consumes both preserved history and fresh current authority, reruns all existing
financial/provider/replay audits, reconciles current denials and retires probes
before computing the final state. Do not cache an earlier transaction's audit as
final proof or relabel a new snapshot as original accounting evidence.

The existing Cartesian customer/category remote measurement is an implementation
choice, not a requirement to mint a separate network credential for each customer.
A future composed implementation may combine exhaustive actual canonical content
and authorization walks for the complete current ledger inventory with actual
hosted SDK coverage of every distinct role, workspace, category and policy branch.
It must bind transport records to the exhaustive inventory, exercise real eligible
records/pages/citations, empty/withheld and current-denied/foreign branches, and
recheck complete current scope, source, runtime, platform and expiry under final
fences. Customer-specific policy requires its own measured class or an explicit
unsupported failure. Contracts must distinguish exhaustive canonical coverage from
actual hosted SDK branch coverage; subset transport proofs must not satisfy the
existing exact-union contract silently. This design does not waive original byte,
Workflow, financial, replay, old-deployment or quarantine gates.


### Composed generated-byte boundary measurement

The normal renderer limits content to 40 slides and fixed approved assets; its
actual file sizes may remain below the report store's 10 MiB cap. Do not pad
renderer outputs or create fake published reports to make those sizes equal.
Measure the real maximum-layout domain path and its post-deployment reads. In the
same actual new deployment, measure full exact 10 MiB uploaded-original reads in
the same configured physical Blob store. Both normal paths use the identical
`BlobPrivateObjects` byte implementation and the same 10485760-byte cap; namespace
changes key/authorization routing, not byte handling. Bind code file digests,
source/deployment, store/environment/configuration, original rows and full hashes.

Complete the report-specific wrapper boundary with actual `writeReportObject`,
`readReportObject` and `deleteExactReportObject` calls through the common adapter;
only the provider SDK transport is controlled in that component test. Cover exact
size/hash, no cache/public access, immutable writes, overflow, wrong identity,
cleanup and separate 10 MiB per-file / 15 MiB pair serialization bounds. The hosted
composer requires the complete current-source catalog and its exact registered
component suite, not a caller assertion. Record `sharedAdapterBoundaryComposed:true`
and `actualReportAt10MiB:false`; keep maximum renderer byte output unclaimed.
This method creates no deployed probe endpoint, accepted-data insertion, new
storage permission, padding of generated bytes or exception to domain policy.

## CI catalog orchestration amendment (2026-10-21)

Actual `1c34d96` CI passed49 jobs but its90-minute outer catalog watchdog
aborted recovery MCP HTTP suite154. The preceding independently audited full
local run used about87 minutes. This identifies narrow batch margin, not an MCP
assertion failure or a measured inner-phase bottleneck.

T132 explicitly supersedes only the CI batch preservation in T114/T128/T130/T131:
use a fixed120-minute GitHub Actions controller and retain90 minutes locally.
Keep every case/file/application/readiness/model deadline, cleanup escalation,
financial/provider limit, all1,022 cases across185 suites and the existing
300-minute workflow job ceiling. Select the fixed class only after existing
parent CI source/run provenance validation; environment claims do not authenticate
a CI import. Emit run/source-bound suite start/completion elapsed/remaining owned
budget and verified case counts without private paths, customer/credential IDs,
child output or payloads.
Require fresh exact-source complete catalog/CI, artifact and cleanup proof.
No filters, retries, partial/historical acceptance or hosted/model waiver.


## Ordinary unauthenticated fast-denial correction (T135)

The actual eb15b39 CI artifact startup reached auth-handler entry without session
completion; no precise SQL/transport cause is established. An ordinary request
without a Cookie header or with an empty header cannot carry a session token.
Return unauthenticated before consulting SQL admission for that exact case.
Preserve purpose validation, all nonempty-cookie checks, special-purpose paths,
the existing401 readiness predicate and every original clock. Verify the old-code
negative regression, authenticated/revocation integration boundaries and fresh
full committed-source catalog/CI. All original cases remain required; the two
new regressions join the existing boundary suite (1,027 cases/186 suites).

## Enforced artifact evaluation request limit (T136)

The e83034f actual-model batch completed stages002/003, then failed stage004
when one step reported1,205 output tokens against its unchanged1,200-token
acceptance ceiling. Its evaluation fixture used a1,000-token SDK default, which
defined caller parameters can override. Enforce that intended request maximum
with a parameter transform that preserves a smaller caller limit and every other
parameter. This fixes request enforcement; absent captured request parameters,
it does not establish which limit the failed provider request received or promise
provider compliance. Preserve the failed capture, charges, selected model, all
cases and existing clocks. Three transport regressions and a staged-agent import check join the complete catalog
(1,031 cases/187 suites). Fresh source-bound validation remains required.

## Clock-bounded recovery probes (T137)

The19f7e5b catalog exited1 after906 passes and two probe-lifetime failures.
The historical error combines three expiry checks, so its exact clock delta is
unproven. A deterministic existing-case regression with the app clock1000ms
ahead fails against old code at the database59-second upper bound. Validate the
requested expiry against the unchanged app/target limits, then shorten it to
`min(requestedExpiry, databaseNow + 59000)`. Require the issued expiry to remain
future on both clocks. Never extend the request, target or any credential limit.
The original two issuances and all1,031 cases/187 suites remain required.

## Bounded CI package transport (T138)

Actual19f7e5b host dependency installs stalled before tests, including a cancelled
native-staged-4 job after roughly90 minutes. Install `infra/ci/apt.conf` into the
ephemeral runner before Node/dependency setup:30-second HTTP/HTTPS connection/data
inactivity and one failed-file retry. Existing package sources, authentication,
test commands and all deadlines remain unchanged. Continuing slow transfers can
still exceed30 seconds overall; unavailable dependencies fail normally. Renderer
Docker image preparation uses an independent filesystem and retains its original
20-minute bound and failed attempt. Fresh complete source CI remains required.


## Slow continuing CI package transfers (T139)

Actual6bd04d0 file-preferences WebKit dependency installation was cancelled at
its original job boundary while Azure mirror transfers continued slowly. The
30-second inactivity bound cannot bound a transfer that keeps making progress.
Reuse the repository's existing exact Azure URL replacement with Ubuntu's primary
HTTPS archive in all14 host setup definitions. Apply the same selection and
`infra/ci/apt.conf` inside the pinned renderer image: host configuration cannot
configure Docker's filesystem. Preserve suites, components, signing keys, package
list and every operation/job/test deadline; unavailable packages still fail.
The isolated image producer copies only static `infra/ci` source alongside its
existing allowlist. Keep original CI interruptions and the unrelated candidate
checkbox failure separate. A full88-case local WebKit pass is additional local
proof, not a diagnosis or replacement for fresh CI and hosted acceptance.


## Numeric-only owned-root observations (T140)

Use `lsof -n -P` for both existing cwd and recursive open-file observations.
Hostname and port-name resolution are unnecessary for PID/path proof. Preserve
recursive inode-based `+D` selection (including alternate hardlinks), Linux
root visibility, strict statuses/errors/stderr, the shared5-second finite window
and all parent/domain clocks. Timeout remains unverified absence and must fail.
The actual5a92d5c timeout cause is not established; require genuine open-file
and hardlink refusal plus complete fresh-source execution before acceptance.


## APT mirror-list indirection (T141)

The actual Ubuntu runner resolves `file:/etc/apt/apt-mirrors.txt` before
selecting Azure. Extend the existing exact replacement to this file when
present, in addition to ordinary source files. Keep other mirrors/entries,
packages, signing/TLS checks and all clocks unchanged; verify selected source
URLs in actual fresh CI, not only the authored substitution command.


## Fixture cleanup containment (T142)

Retirement and pool closure must be attempted independently. Restore process
environment even when retirement, absence proof or log writing fails; retain
all errors, including an original domain error. Retain owned roots/containers
without complete proof. Clear both cached pool references before attempting
both closures so one failed close cannot preserve a stale database selection.

One numeric recursive `lsof +D <root> -x f -Fp` observation covers file inodes
and directory instances including cwd, crossing filesystems without following
symlinks. Keep Linux root visibility, strict status/error/stderr checks and the
shared5-second finite window. Direct tests cover cwd/hardlinks and empty final
state; nested mounts are documented semantics, not an exercised claim.


## Owned quality stage interruption (T143)

Every quality command uses the existing genuine owned-process capability rather
than an unsupervised detached child. Install parent signal and fixture abort
listeners before spawn, recheck registration, and await the existing bounded
retirement (SIGTERM, escalation after5 seconds, verification within10 seconds).
The original absolute command deadline marks expiry first, captures genuine
descendant groups through the existing1-second-bounded inventory while the
root is alive, and always sends SIGKILL to the owned root group, even if capture
fails. Cached descendant retirement is awaited; capture failure remains failure.
This is cleanup proof, never extra accepted command allowance. Preserve bounded
private output/redaction, original errors, all stage/case/model/financial limits
and no automatic retry. Remove listeners/timers on every terminal path only
after retirement is awaited. Failed retirement remains failure, with resources
and unknown charges retained; a monitor's parent signal alone proves no closure.

T143 normal stage completion uses a Node exit control handshake: only the directly
spawned stage activates the preload, and its PID/nonce request holds the root
alive for bounded genuine descendant capture before acknowledgement. Missing or
invalid capture prevents successful command acceptance. Opt-in control pipes do
not alter other owned-process callers. The original absolute deadline remains
active during command execution and this handshake. Separate existing bounded
retirement follows; it adds no accepted command allowance.

T143 control-protocol fault scope is fail-closed command acceptance, not universal
containment of a stage that deliberately removes its hook or closes its control
pipes. Genuine natural and explicit Node exits retain the live-root capture
handshake. Deliberately missing/closed control faults can leave unverified
resources requiring explicit operator identity review and reconciliation; they
must not be reported as verified cleanup, successful quality, settled unknown
charges, or permission for automatic retry. Failed diagnostic harness artifacts
and their exact manual cleanup observations remain retained.


## Host absence observation allowance (T144)

The current666aeec catalog stops after69 passes and one provisioning cleanup
probe timeout; eight suites ran and181 were not executed. Its nested recursive
open-file observation returned no output before the internal5-second limit.
The historical cause is unproven. Representative original and numeric-UID
observations finish around250ms; adding `-l` is not justified by those results.

Superseding only the internal5-second allowance in T140/T142, allow up to20
seconds for the same strict recursive inode/cwd/hardlink observation, capped by
the unchanged absolute fixture deadline. Keep Linux visibility, status/error/
stderr validation, post-observation deadline checks and refusal to delete without
proof. Do not change any suite, fixture, application, provider, stage or process
retirement limit. An interrupted observation remains failed/unverified, including
when the existing outer process escalation interrupts cleanup. This allocation
may reduce host-inspection timeouts; focused checks are not proof that it fixes
the historical cause or substitutes for a complete fresh run.

## Deterministic MCP tamper window (T145)

The actual5c7261e local catalog passes1,040 cases/189 suites with independently
verified owned cleanup; four unrelated container replacements remain qualified.
Its CI fails in the MCP category network-tamper phase and separately in learning
WebKit. The category window intentionally returns completed selections when less
than65 seconds remains before another category. A late negative test cannot
assume that a second category will execute. The original shared failure location
does not distinguish its single-category and two-category expectations.

Run those existing negatives immediately after the initial positive category,
before the long replay and coverage work. Count the actual tampered identity
responses and the intervening untouched identity, require the projection mismatch
and verify retirement. Reset injection state in finally. Preserve the original
late broad all-read-admissions retirement assertion after the intervening work.
A real64-second shortened target must return only the completed profiles category
without attempting plans; this prefix remains explicitly not healthy/not ready
and cannot substitute for exhaustive recovery coverage. Preserve the original
absolute target deadline, signal, case/fixture/catalog limits, every existing
assertion and the production window's bounded-prefix behavior. Require focused
actual execution and a fresh complete committed-source catalog/CI; the prior local
pass and failed CI remain historical evidence, not acceptance of the changed test.


## Isolated hosted private-object binding (T146)

Use the existing admitted hosted storage copier for authenticated cold archive
objects into a distinct private Blob destination. Original-store parity alone
is supplementary preservation evidence. Verifier input v4 keeps the original
candidate unchanged and supplies the original store ID only as the preimage of
its authenticated configuration digest. The destination remains bound to actual
Blob reads and the exact platform-verified serving deployment configuration.
Physical capture content is measured before temporary configuration-read session
writes. Final new verification requires genuine in-process configuration evidence
and the exact measured material. Persist the canonical mapping in the existing
scope digest; no mapping preserves the v2/v3 serialization. An existing committed
verification checks its unchanged state, freshness and mapping before cold archive
and destination reauthentication, without creating a configuration session.
Immutable deployment identity must remain exact on every transport. No new cost,
copy, unlock, provider or readiness authority comes from configuration JSON.


## Current evaluation criteria and original CI receipt retention (T153)

Version the 002 save-profile criterion for the current governed Pending-proposal
contract. Preserve the prompts, roles, repetitions, rubric and approval/privacy
hard gates. Require a fresh affected evaluation; the old criterion conflict is
retained and cannot be silently regraded as a version-1 pass.

Keep the existing CI catalog artifact byte format and publish a separate artifact
with all original JSON from the owned runner, including run, execution, image-
preparation, individual suite/process and referenced per-gate proof receipts. Authenticate the producing run, attempt, source and bytes
before use. This does not change either execution class: local remains 90 minutes
and GitHub Actions remains 120 minutes. The three failed Mac catalogs remain
failed; retaining original CI receipts is not a claim that those runs passed.
All live-model, hosted release, scheduled-backup and recovery gates remain required.

The observed 004 output overrun requires actual request-boundary evidence before
choosing a fix. Record only the fixed model identity and bounded numeric requested
output limit before provider dispatch. Preserve the 1,000-token fixture request
and 1,200-token observed assertion, complete cases, clocks and accounting. Never
subtract unobserved reasoning tokens or infer a provider cause from the total.


## Baseline mapping state ownership (T154)

The b332596 desktop-light Execution case completed its native selection action
but failed the following value assertion after 30 seconds. Its retained fixed
observations do not expose the selected value or baseline IDs. A separate CLI
WebKit ordering probe reproduces a change to delivery followed by a passive reset
under unchanged IDs, and transient stale mapping/Review eligibility at a new
baseline pair. This establishes a state-ordering defect, not the exact CI cause.

Give each exact old/new baseline pair its own mapping-state component identity.
The first displayed controls then have their initial empty state, and replacing
that pair clears both mapped and added choices before interaction. Refreshes of
the same pair preserve choices. Keep every existing mapping constraint, human
review payload and server expected-version check. The durable owned regression
uses real baseline acceptance and an explicitly adversarial browser event order;
it is automated evidence, not a human observation. Original cases and deadlines
remain unchanged; fresh complete acceptance is still required.


## Expansion entry failure observations (T155)

Observe the original Expansion browser cases without changing their actions or
clocks. On failure, retain fixed New Hypothesis visibility/enabled/hit-target
flags, initial session/overview and JavaScript module transport phases, bounded
pending ages and classified page errors. Strictly validate attachments before
printing fixed CI metadata. A passing local case does not explain the earlier CI
failure. Current release status lives in the PR record; README validation notes
remain explicitly historical, preserving the final tested source during release.


### Recovery child failure visibility (T156)

The 15f87f3 full CI attempt ended with 49 main jobs passing, one deterministic
pilot job failing and all seven legacy jobs passing. Its managed-workflow-batch
child exited 1 without a signal or suite deadline. The unchanged local eleven
cases passed; this does not establish the CI cause. Extend only the existing
bounded failure summary with fixed connection/unhandled-error signatures and
validated numeric reporter counts. Missing, invalid and oversized sibling reports
remain explicit. No test, library, timing or retry behavior changes are justified
by this observation. Fresh complete committed CI remains required.


### Catalog-to-suite integrity (T157)

All 57 CI jobs passed for 3055ac8, but original owned proof verification correctly
refused G06. Its catalog referenced eleven managed-edge transport cases even
though both the introducing commit and current unchanged file contain five.
Remove only nonexistent IDs 006–011. No actual test or assertion is removed.
At catalog import, validate every referenced ID against all registered suites,
including contract suites, before any owned environment is created. Reject
duplicate files/titles, ambiguous canonical IDs and duplicate gate references.
Use the same ID generator in admission and original receipt production. Extend
the existing inventory test with the historical invalid mapping and missing,
duplicate and ambiguous inventory negatives. All 1,040 cases and 189 suites remain
required, followed by fresh committed CI, complete original gate proofs, model
evaluations and hosted release verification.


### Confirmed learning preparation navigation (T158)

The 4deea5f CI read-only MCP regression job timed out during learning draft
preparation. The unchanged original case passed locally in all four projects;
the historical CI action and cause remain unproved. A separate controlled owned
WebKit probe confirmed one actual committed preparation and zero paid
reservations, then held only customer-list reads: the browser remained on New
Learning Draft after 30 seconds. The mutation hook awaited that unrelated read
before returning the receipt to its navigation caller.

Opt only draft preparation into navigation after validating the exact committed
receipt's contract, action, request ID, positive version and governed target.
Explicit status reconciliation uses the identical validation and never repeats
the POST. Default callers, failure refreshes and abandoned/retired requests keep
their existing refresh policy. The destination obtains fresh session and draft
reads; navigation does not grant authority or start a paid draft. Invalid or
missing acknowledgements remain pending.

Keep the original browser case byte-identical. Add separate real owned cases for
read-stall navigation, lost acknowledgements, invalid targets, foreign request
IDs, noncommitted outcomes and authentication loss. Each added case creates its
own governed synthetic workspace and actors using existing fixtures. Retain real
read/write quotas, the original 30-second case limit and zero retries. Verify the
complete learning UI suite and all fresh committed release gates.

### Artifact evaluation reasoning fidelity (T159)

The 5dbc51c model batch completed stages 002/003, then stopped after six of eight
stage 004 cases when one step reported 1,290 output tokens against the existing
1,200 ceiling. Its serialized Gateway request did contain the intended 1,000-token
limit. The artifact fixture replaces the root agent configuration but omitted
the root's authored `reasoning: "low"`. Preserve that setting in the fixture;
the production agent, selected model and reasoning level remain unchanged.

Extend the existing staged-import regression to compare the actual fixture with
the root configuration. Demonstrate its old-code failure and verify the staged
fixture's low reasoning and 1,000-token limit at a denied SDK boundary. Retain all
original assertions, cases, deadlines, costs and unknown holds. This corrects
configuration fidelity; it does not guarantee provider output totals or replace
fresh source-bound model, semantic and hosted verification.

### Actual scheduled capture spacing (T160)

Nominal twelve-hour cron slots do not guarantee twelve-hour spacing between
actual snapshots: a slower first capture and faster second capture can shorten
the interval. Read the latest owner-admitted archive receipt for the exact
installation, project and environment, including earlier releases, and compare
its timestamp with the source database clock. Wait once for at most sixty seconds
without database connections or physical IO locks. Keep the existing caller and
platform deadlines. A wait failure retains its issued reservation for explicit
review when no connected archive client remains.

Pass the resulting lower bound into the scheduled checkpoint and reject an
actual exported snapshot before it. Do not rewrite timestamps, relax the original
schedule assessor or substitute local tests for hosted cron observations. Keep
the independent native cold-copy and scheduled-run fixtures in explicitly
different synthetic project scopes, retaining the original cold-copy receipt.

### Confirmed canonicalization read retirement (T161)

The cd09e26 CI mobile-dark canonicalization journey failed. A separate owned
WebKit experiment proved one concrete defect: one real merge committed, but
withholding only the following detail response kept stale mapping controls
visible beyond the original five-second assertion. Releasing that same response
restored the UI. This does not establish the other preview-visibility failure's
internal cause.

After receipt validation, invalidate the prior canonicalization view before
awaiting a fresh read. Keep one current read, a ten-second total headers/body
deadline, and sequence/path checks before publication. Expiry clears eligible
content and leaves an explicit read-only refresh available. Preserve pending
uncertain commands, reconciliation and write receipt validation; never replay a
POST. WebKit may report a timed abort as AbortError, so distinguish timeout from
ordinary supersession using the owned timer's flag.

Preserve the three original browser cases unchanged and add one owned stalled-read
case across all four profiles, with an actual server merge and one receipt.
Passive diagnostics distinguish preview/decision transport phases and bounded
control-state scalars, never IDs, values, URLs, response bodies or private errors.
No existing request, test, fixture, stage or retry policy is extended.

An absent-view read-only refresh remains available while an uncertain command
is pending, once its transport has settled. It restores current authorization
before receipt reconciliation; it does not enable or replay a POST. A second
new owned browser case commits once, loses the acknowledgement, invalidates the
view, then restores and reconciles the original request with one stored receipt.
The earlier four-case matrix passed 92 cases; the final five-case canonicalization
file increases the six-journey matrix to 96 cases without changing any original
scenario or global clock. Final source-bound checks remain required.

### Partner receipt settlement before protected reread (T162)

The 52c647d CI partner-learning lost-acknowledgement case reached its unchanged
thirty-second limit without an operation trace. One original-case production
WebKit diagnostic passed in 2.7 seconds; this does not explain that CI timeout.
A separate controlled fault did establish a defect: after the real committed
receipt arrived, withholding only its subsequent real assignment response kept
the request pending and disabled beyond the original five-second confirmation
assertion. Releasing that response restored the original outcome.

On a valid current-namespace receipt, invoke protected refresh to synchronously
retire the old projection, then clear the pending intent and publish only request
confirmation before awaiting the read. An acknowledgement does not make the
protected content current. Bound response headers and body to ten seconds;
preserve generation, endpoint and identity checks, fail closed on expiry, and
leave an explicit read-only refresh available. Uncertain commands retain their
existing fence, and no POST is replayed.

Strengthen the original browser case with the actual read barrier, expiry and
manual recovery while preserving its storage privacy, single-command and single
DB-attempt assertions. Keep its original thirty-second case and other existing
clocks/retries. Fixed phase names identify fixture forwarding, receipt loss and
reconciliation without private values; reject the deferred fixture barrier if
its forwarding fails rather than masking that failure as an unlabelled timeout.

T163 corrects one registered test title after the `547322b` catalog rejected the
strengthened T159 test's new name. Retain all 1,041 cases and 189 suites, the
original assertions and deadlines, and the failed source's actual results.
Verify the final three original suites with the strict title verifier before
fresh complete CI. No application, model or authorization behavior changes.

T164 fixes the lost-acknowledgement test's receipt sequencing. One persistent
handler returns the original unavailable response to the old document; a
main-frame navigation event enables actual receipt forwarding for the target
reload. Capture eligibility at handler entry and preserve the existing
pre-fulfilment assignment barrier. Remove the event listener in cleanup.
This is a scoped fixture sequence, not general document authentication. Keep
every original assertion and clock, and use fixed nested phases to distinguish
the grouped reconciliation operations without exposing private data.

T165 retains the `a67cc81` execution job's actual cancellation and 57 successful
single-case summaries. Its two-hour duration strongly supports the configured
120-minute job deadline as the cause; the log contains only a generic cancellation
message and does not identify the next case. No assertion failure is established.

Use the existing complete-project argument of `check-execution-ui.ts` in four
matrix jobs, each retaining the 120-minute deadline and all 15 original cases.
The existing deterministic and regression gates remain in that matrix. Preserve
the required `execution (webkit)` status as an aggregate that runs even after a
dependency failure and succeeds only when the entire execution matrix succeeds.
Do not change the controller, case clocks, assertions, quotas or retries. The
resulting workflow has 54 main jobs and seven legacy jobs; fresh all-61 evidence
is required alongside the unchanged 1,041-case, 189-suite owned catalog.

### T166: preserve the active product-gap read deadline

The `3008306` CI Product Gaps WebKit job failed the existing stalled-refresh
regression on desktop-light after an acknowledged canonicalization. Its retained
observations do not establish the historical cancellation cause. A separate
controlled real-browser comparison reproduces deadline renewal in the old client:
periodic polling cancels an active read and creates a new ten-second timer.

Skip background polls while a read controller is active. Keep the existing
ten-second read deadline, fifteen-second polling interval, explicit refresh and
authority-change behavior. Preserve the original regression and add a post-commit
polling fault case that requires the same timeout, retired controls and exactly
one committed decision. Require four-profile comparison, current-source CI,
model evaluation and hosted verification; historical source passes are not
substitutes.
