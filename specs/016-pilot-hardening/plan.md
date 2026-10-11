# Implementation Plan: Pilot Hardening and Launch Readiness

**Branch**: `016-pilot-hardening` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: `specs/016-pilot-hardening/spec.md`. Planning only; no implementation or
hosted action has run. Baseline is released 015 on schema 055.

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

**Storage**: Existing Postgres/pgvector with explicit 056 session/pilot isolation
and 057 operational control/worker/hosted-job metadata (reconfirm free numbers).
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
| VIII — Operability | Costs/time, failures, migration and privacy bounded | Leases, exact receipts, explicit 055→056→057/grants and recovery fence |

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
migrations/056-pilot-workspace-sessions.cjs
migrations/057-pilot-operations.cjs
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
metadata to 057, not a parallel customer/plan/report data model.

## Design and execution stages

1. **Evidence foundation / US1**: Freeze the gate and source catalog, strict private
   receipts, run/resume semantics, owner-independent eligibility checker and owned
   harness. A CLI can report blockers before hosted changes exist.
2. **Pilot isolation / US3 foundation**: Apply 056 with session membership backfill;
   retain primary default and add explicit Pilot Workspace login choice for already
   assigned users. Bind every resumed session to its membership. Pilot knowledge,
   metrics, jobs and MCP stay in their eligibility lane; normal sanitized shared
   knowledge remains usable in pilot, with no pilot-to-primary output flow.
3. **Hosted persistence / US3**: Add Blob/local interface and direct upload path;
   migrate artifact/workforce/report/gap callers without changing domain authority,
   immutable digests or limits. Add protected finite dispatcher and nonpersistent
   Sandbox adapters around existing fixed scan/parse/render programs. Add 057,
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

Reconfirm latest main and free migration numbers. 056 backfills each old session to
its unique active primary membership and revokes ambiguity; 057 adds operational
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
