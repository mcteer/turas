# Production hardening quickstart

The private pilot programme is retired. Do not provision synthetic workspaces,
collect participant-feedback approvals or build a private readiness bundle to use
or release Turas. Historical evaluation commands and results remain references;
they are not normal Production prerequisites. Retain the implemented security,
private-storage, bounded-processing and recovery controls.

The actual main112/schema-081 deployment and its unresolved readiness503 recovery
gap are recorded in the [handoff](handoff.md). Operational procedures are in the
[Production operations runbook](../../docs/pilot-operations.md). Those records
separate application-path checks from full backup/service recovery assurance.

## Development setup

Use Node24 and the existing protected environment. On macOS include `/usr/sbin`
for owned-process checks:

```sh
export PATH=/opt/homebrew/opt/node@24/bin:/usr/sbin:$PATH
export SPECIFY_FEATURE_DIRECTORY=specs/016-pilot-hardening
npm ci
npm ci --prefix packages/artifact-extractor
```

Read the governing specification and contribution rules for the selected change.
Preserve `.env.local`, `agent/agent.ts` model selection and root
`.eve/.workflow-data`. Create or migrate only the explicitly selected development
or disposable test database; never point fixture, demo or initialization commands
at Production. Use separate runtime and owner authority, verified TLS remotely,
and explicit migrations/grants. Current runtime/schema-dependent checks require
schema081; older archive identities remain historical inputs to their specific
compatibility paths.

## Verify the change that is being made

```sh
npm run check:docs
npm run typecheck
npm run test:unit
```

Use the narrow relevant feature integration, concurrency, security and UI checks
when needed. Run builds for runtime changes. Use command-line Playwright/WebKit
with the relevant desktop/mobile and light/dark configurations for UI changes;
do not operate the host browser for testing. Preserve original deadlines,
assertions, cancellation and owned cleanup. A failed or incomplete attempt remains
failed; a retry must not conceal it or replay uncertain paid work.

Deterministic tests use disposable marked databases/stores, blank provider keys
and owned processes. Relevant retained `test:pilot` cases may still test shared
Production protections; the script name is not an instruction to run the cancelled
pilot programme. CI remains required for merge. A mock proves its contract scope,
not actual hosted processing, load, model behavior or recovery.

An actual-provider check needs an applicable finite allowance and the existing
source, pricing, admission and strict-output guards. Select only the behavior
needed for the change. Do not add a whole paid catalogue or a private pilot bundle
as a new release gate. Preserve charges, credits, immutable journals and full
unknown-cost holds; no automatic retry, refund, top-up or authority reset follows
from failure or programme retirement.

## Normal Production checks

After the authorized release, verify the actual canonical origin, Git commit,
environment marker, schema081, runtime grants and changed behavior. Use the normal
primary workspace and current Production credentials. Do not pass a pilot workspace
selector or copy Preview budgets, tokens or evaluation-only bindings.

For a storage/processing change, a specifically selected small harmless private
file can exercise the normal signed upload, scheduled scan/parse and exact original
download hash. Verify actual provider/domain receipts, not only a successful PUT.
Then use normal source deletion, conversation archive and session logout. Record
whether asynchronous domain deletion completed; do not infer independent physical
Blob deletion from a database state. No model request is required for this file
path. The existing Production scheduler owns dispatch; do not bypass cron auth.

For a changed chat or Support path, use a focused normal request and inspect its
actual stream/output, owner/session boundaries, strict validation, Stop/retirement
and accounting as applicable. A single schema-acceptance check is not a claim that
an entire feature suite or every hosted workflow passed. Outbound mail remains
subject to its separate exact sender/recipient/content authority.

Read `/api/operations/status` as the canonical administrator and report its
components separately. `/api/health/ready`503 remains an honest unresolved
operational/recovery assurance signal even when application checks pass. Keep
missing backup, store/image, maintenance or recovery evidence visible; do not
manufacture observations or remove real safety controls to make the signal green.

## Database and recovery operations

Before a schema-dependent release, verify the target and recovery copy, rehearse
forward migrations on a disposable database, apply explicit migrations and exact
runtime grants, then check actual restricted-runtime behavior. Never initialize an
existing target or migrate in a request handler.

For a recovery incident, use the runbook's exact-target owner fencing, drain and
lock procedure. Authenticate the matched encrypted archive and private objects,
restore into an isolated target, retain current denials/replay metadata, reconcile
uncertain provider work and quarantine unsupported scope. Verification, quarantine
resolution and reopening remain separate explicit actions. A database safety-copy
rehearsal or working login is not full service recovery. Preserve original incident
clocks and report the measured RPO/RTO rather than planned times.

## Closeout

Update README and the relevant feature/validation record with the actual source,
checks and limitations. Retire only resources owned by the selected check and
preserve financial/audit/replay records. Do not delete Production stores, firewall
rules, credentials or historical evidence as incidental programme cleanup.
After an authorized merge, leave the PR closed, remove its feature branch and
verify README on main. No participant-feedback or private pilot approval step
follows this closeout.
