# 016 Validation Run Guide

Planning artifact: commands prefixed `pilot:` and the new runners are to be built.
Do not report their presence or results until implementation. Use Node 24, the
canonical checkout, explicit feature selection and owned resources only.

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/016-pilot-hardening
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
```

Read spec → plan → tasks → contracts. Preserve selected `.env.local`, `agent/agent.ts`
and root `.eve/.workflow-data`. Do not run root dev or predecessor commands against
the selected Preview/Production database. New harnesses create isolated databases,
stores and app processes under ignored `local-artifacts/016`; no sibling worktrees.

## 1. Readiness contract and owned foundation

```sh
npm run check:docs
npm run typecheck
npm run test:pilot
```

Expected: complete registered case inventory, strict evidence failures rejected,
provider keys absent and no paid dispatch. Test stale/tampered receipts, duplicate
attempts, missing hosted identity, arbitrary owner strings and fail→resume history.
Verify new 078/079 schema, explicit runtime grants and locked-runtime denials on
empty and 055 databases. Do not initialize any existing target database.

## 2. Workspace and hosted storage/execution adapters

Run the registered workspace/auth, synthetic publication, private-object and executor
suites through `test:pilot`. Check primary default, exact session membership, revoked
memberships, all direct-ID/search/MCP paths, and no synthetic counts in primary views.

Validate existing maximum file sizes including >4.5 MiB upload, exact staged path,
wrong digest/expiry/owner callback, cancellation/replay, malicious file and private
stream revocation. Local adapters remain covered. Fake Blob/Sandbox transports prove
contract failure behavior only; they do not pass actual hosted gates.

Before actual hosted checks, prepare a concrete versioned private-store/image/scope
manifest and finite infrastructure cost reservation. Pin official SDKs/images,
verify scanner freshness, apply explicit target migrations/grants and configured
least-privilege credentials. Use eve for provisioning/deployment operations where
supported; do not link/reconnect a different project or expose store tokens.

## 3. Recovery and lifecycle

```sh
# Use the explicit owned capture/isolated restore inputs in docs/pilot-operations.md.
# Lifecycle execution requires an admitted exact target and new private evidence directory:
npm run pilot:lifecycle:check -- --environment <exact-marker> --output <new-private-directory> --execute
```

Acceptance requires all recovery cases in the contract, current denial state newer than the
backup, zero duplicate paid/sent work, encrypted matched restore, tested missing
key/object rejection, bounded interrupted cleanup, original deadlines and permanent
request fences. Preserve owned run receipts after cleanup; never output backups.

The current isolated restore remains locked and quarantined, and does not yet
complete this acceptance catalog. Do not use the lifecycle execution receipt as
proof of full lifecycle/backup expiry.

Validate scheduled backup cadence separately: two actual scheduled runs ≥12h apart,
one restore ≤24h old, measured ≤4h recovery and no >24h accepted-work loss. An
accelerated clock or local ad hoc dump cannot substitute for observed hosted cadence.

## 4. UI, workload, quality and regressions

```sh
npm run pilot:ui:check
npm run benchmark:pilot -- --disposable
npm run pilot:regressions
npm run build:web:check
npm run build:eve:check
```

Four WebKit configurations: desktop/mobile × light/dark. Verify login workspace
choice, visible pilot context, keyboard/focus/errors/overflow and changed upload
flows. Inspect synthetic screenshots; hosted private screenshots/logs stay ignored.

Load uses the exact fixed classes/shape in the recovery contract. Report admitted
latency and natural quota waiting independently; no quota resets, hidden retries or
aggregate-only percentiles. All affected existing feature catalogs run complete.
Do not rerun unrelated expensive suites after green without a new change/failure.

Use governing eval commands/verifiers only when required by the quality catalog.
Prepare the exact synthetic cases, unchanged model, provider bounds and independent
reviewer before asking for any missing budget. Reuse applicable existing
permission; do not seek a second approval for the same admitted run. Unknown spend
is held for reconciliation under the existing contract, never guessed to zero.

`npm run pilot:quality:live -- --prepare --images <preparation.json> --output
<new-private-directory>` exercises native admission with a synthetic credential
and a one-microdollar denial budget; it dispatches no paid provider request.
After the complete current deterministic catalog passes, `--live` requires
`--images`, `--output`, `--authorization`, `--deterministic-proof`, `--preparation`
and the exact `--budget-usd`. The authorization records the actual applicable
operator instruction, expiry, dollar cap, four existing Context credits and
independent review authorization. Infrastructure authorization does not admit
model evaluations. Context Auto-Topup must be disabled; credits are recorded
separately without an invented dollar conversion.

All nine catalogs run in fresh owned synthetic environments. The canonical
private `local-artifacts/016/quality-budgets/<approval-id>` journal survives failed
attempts and retains their spending. Corrected full batches use the remaining
original allowance; copying an authorization or selecting another output cannot
reset it. An unresolved provider charge blocks both providers and corrected
attempts. Captures remain awaiting independent review and cannot approve release.

## 5. Synthetic Preview and Production pilot

Private Blob configuration always names the exact connected `BLOB_STORE_ID`.
On Vercel, the pinned SDK obtains fresh project OIDC identity; no static read-write
token is required. A protected operator outside Vercel supplies an explicit
`VERCEL_OIDC_TOKEN`, or an exact store-matched `BLOB_READ_WRITE_TOKEN`. Verify the
actual private store and all governed namespaces before cutover. These credentials
never authorize domain records, and provider denial never selects a local store.


After current CI is green and release/merge authorization covers the step:

1. Verify exact target marker, alias, current/required schema and runtime grants,
   current matched backup, storage backend, image digests and worker placement.
2. Use compatible disabled-first migration/code order; verify Preview first. Retire
   or protect historical unbound-session deployments before second memberships.
   `pilot:recovery:authority -- --retire-work-runtime --source <private-source.json>
   --input <private-retirement.json> --output <new-private-directory>` requires
   the exact Production work project, schema 57 and locked recovery revision.
   The private input contains the replacement secret; never put it in command
   arguments. The operation disables the legacy login before terminating its
   backends, preserves its restricted permission role, and verifies a fresh
   replacement connection. Exact-input reconciliation cannot replace its password
   or adopt an unrelated existing role. It does not update deployment credentials,
   close provider runs, reconcile paid effects or unlock service. Complete those
   separate steps before enabling the replacement deployment.
3. Run the explicit idempotent provisioner against the admitted target to create
   the marked pilot workspace, existing-principal memberships, synthetic customers
   and reviewed scope of partner grants. Record receipts; never bootstrap over
   existing Production or auto-approve business records.
4. Enable only ready hosted adapters/workspace. Use normal authenticated reviews
   for the catalog J002–J015; actual scan/parse/render and SDK reads must return
   retained bytes/revisions. Synthetic fixture names remain visible.
5. Verify cold/restarted and separate hosted instances can read the same private
   object; inspect all configured class freshness and cleanup behavior.
6. Run the exact post-merge deployed version through role-bound HTTP and CLI WebKit,
   including Product Gaps refresh, assigned-partner journey and MCP five-category
   positive reads/citations/revocation. Check actual backing requests and errors.
7. Keep outbound mail disabled. Any later controlled send needs 009's exact
   sender/recipient/payload approval and provider receipt; no implicit sends.
8. Record actual internal and assigned-partner participant feedback; an agent
   cannot supply it. Fix/recheck blockers and assign all other feedback.
9. Run `pilot:check` with the explicit private run manifest. Obtain/record the actual
   mcteer decision for that scope only when the bundle is eligible. If authorization
   was already given for that exact action, record it without asking again.

Low-rate Production journeys do not establish the local benchmark's hosted capacity.
Do not advance all tasks to complete while a required participant, budget, storage,
backup or hosted proof remains missing; report the specific pending gate.

## 6. Closeout

Update README/roadmap/spec validation with separate local, CI, actual-provider,
hosted and human outcomes. Include deployed commit, schema/grants and remaining
limits. Revoke only owned test credentials, stop owned sandboxes/processes and
expire/remove pilot payloads through normal lifecycle policy after evidence capture.
Keep customer records, allowed audit and permanent replay receipts. Preserve original
configuration/workflow/model hashes. After each successful merge, keep PR closed,
delete associated local/remote feature branch and verify README on main.
