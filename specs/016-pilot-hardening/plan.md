# Implementation Plan: Pilot Hardening and Launch Readiness

**Branch**: `016-pilot-hardening` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: `specs/016-pilot-hardening/spec.md`. Implementation is in progress. Baseline is released 015 on schema 055;
016 migrations have been exercised only in owned disposable local environments.
No 016 hosted release has run.

## Summary

Make the existing product operable for a controlled internal/assigned-partner pilot.
Bind sessions to workspace membership and isolate a synthetic Production workspace;
provide durable private file storage and bounded hosted scan/parse/render execution;
make every maintenance class observable; rehearse consistent recovery and lifecycle
rules; collect exact-version readiness evidence and attributable user feedback.

Use existing domain authorization, review, job/lease, deletion and evaluation paths.
The readiness checker reports eligibility, not human approval. No broad customer
authentication, onboarding, new business capability or automatic external send.

## Technical Context

**Language/Version**: Node 24, TypeScript 7.0.2; explicit SQL migrations.

**Primary Dependencies**: Existing Next 16.3.4, React 19.2.6, eve 0.67.1, pg 8.23.0,
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
gates. Production synthetic proof and actual user feedback are distinct.

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
real-user feedback, controlled sends and live-model budget are execution-time inputs,
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
   file processing and five-category SDK reads. Collect user feedback, fix blockers,
   finish target migrations/grants and exact-version post-merge checks; record the
   mcteer decision and owned cleanup. Never mark human-feedback tasks complete from
   automated or agent-generated participant comments.

Stages can use multiple PRs. A feature branch may be replaced after each merge to
honor branch cleanup; keep `SPECIFY_FEATURE_DIRECTORY` fixed and tasks cumulative.
No intermediate PR advertises the full pilot as ready. Local and CI evidence may
complete before Production or human feedback; report those states separately.

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

Finish implementation and owned validation first, then target-bound Preview/Production acceptance and cleanup. Two scheduled backups at least12hours apart and genuine operator/internal/assigned-partner observations remain distinct actual acceptance requirements; automation cannot impersonate them. Reuse applicable user authorization without repetitive permission prompts, and request only information or material authority actually absent after the work is concrete.

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
