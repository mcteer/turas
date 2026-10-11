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
Verify new 056/057 schema, explicit runtime grants and locked-runtime denials on
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
npm run pilot:recovery:check -- --disposable
npm run pilot:lifecycle:check -- --disposable
```

Expected: all recovery cases in the contract, current denial state newer than the
backup, zero duplicate paid/sent work, encrypted matched restore, tested missing
key/object rejection, bounded interrupted cleanup, original deadlines and permanent
request fences. Preserve owned run receipts after cleanup; never output backups.

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

## 5. Synthetic Preview and Production pilot

After current CI is green and release/merge authorization covers the step:

1. Verify exact target marker, alias, current/required schema and runtime grants,
   current matched backup, storage backend, image digests and worker placement.
2. Use compatible disabled-first migration/code order; verify Preview first. Retire
   or protect historical unbound-session deployments before second memberships.
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
