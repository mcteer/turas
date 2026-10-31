# Production operations and recovery

The private pilot programme has been cancelled. Synthetic workspace provisioning,
participant-feedback collection, the private G01–G22 approval bundle, and aggregate
model-evaluation runs are retired. They are not prerequisites for ordinary
Production use or future releases. Historical receipts retain their original
sources, failures, costs and limitations; cancellation does not turn them into
passes, release cost holds or authorize deleting evidence.

This file keeps its existing path so operational links continue to work. Several
retained commands and environment variables also have a `pilot` prefix. That
legacy name does not make normal backup, storage, processing, security or recovery
controls optional, and does not authorize synthetic provisioning in Production.

## Deployed state and remaining limits

On 2026-10-31, `https://www.turas.dev` serves main commit
`11240b6f11500109ae3a88c1e880f85d061b7783` on schema 081. Its application tree
matches the tested `8f6f5c6` hardening changes. The serving configuration includes
the Production scanner-signature attestation and the restricted
`turas_runtime_016` database login. Test-workspace login and evaluation-only Root
and Learning bindings remain disabled.

Actual normal-role/privacy checks, streamed chat/reload/Stop, and a small private
text-file upload, Sandbox scan/parse and exact-hash download have passed. The file
was deleted through its normal lifecycle, its conversation archived and its login
session revoked. The observed domain `deleted` state is not an independent audit
of physical Blob deletion. These results do not establish every file format,
renderer, restore scenario or service recovery objective.

At the main112 deployed checkpoint, `/api/health/ready` returned HTTP 503 because
its old composite also required recent execution and backup evidence. That result
must remain in the execution record; it does not negate successful authenticated
workflows. The current implementation separates actual service availability from
retained assurance. Verify the changed endpoint after its release rather than
assuming that a local code change changed Production.

Public `{ready}` checks database/schema/runtime capability, open admission, no
required recovery quarantine, critical maintenance freshness and valid dispatch/
cost configuration, including fresh scanner attestation. Invalid capabilities,
unknown cost and real recovery fences still fail closed. Administrator-only
`/api/operations/status` additionally exposes `assurance.ready` and the unchanged
strict store/image/backup observations. An idle namespace or an older Git-bound
sample remains unverified assurance, without requiring artificial file writes or
jobs to keep an otherwise available service online. Full service restoration and
observed backup cadence remain unproven. The 24-hour RPO/four-hour RTO are targets,
not current guarantees.

## Target, credentials and schema

Before an operational change, record the actual project, team, deployment,
canonical origin, database environment marker, schema ledger and runtime role.
Use Production's own private-store connection and finite operational budgets.
A Preview store attachment, budget, credential or successful test does not confer
Production authority. Keep normal primary-workspace membership and owner-private
conversations intact; partner reads require explicit current customer grants.

Use a least-privilege runtime connection for the application and a separately
supplied owner connection for migrations, grants and recovery control. Keep
credentials, keys, customer content, `.env.local` and operator configuration out of
Git and routine logs. Protected directories are mode 0700; private regular files
are mode 0600 and must not be symlinks or hard links. Use verified TLS for remote
database connections. Do not expose database or application credentials to jobs.

Current code requires the complete schema-081 ledger and explicit runtime grants.
For an existing target, take and verify its recovery copy, rehearse the forward
migration on a disposable target, then use `npm run db:migrate` and
`npm run db:roles` with the explicitly selected owner configuration. Never run
`db:init`, demo seeding or test fixture installation against Production. Request
handlers never migrate. Check runtime privileges and actual authenticated behavior
afterward; a migration exit code alone is insufficient.

Schema 080 retains durable conversation-level named-content dependencies and
coverage metadata. Preserve those tables, their restricted functions and grants
through capture/restore. A legacy coverage gap cannot be made complete by a fresh
read or by rebuilding active citation arrays. Source withdrawal and revoked access
must still withhold dependent content and stop continuation. Schema 081 distinguishes
verified, undispatched Native rejection from uncertain delivery; uncertain provider
work keeps its accounting hold. Historical snapshots retain their original schema
identity and require the appropriate compatibility path.

## Private storage and bounded jobs

Production uses private Blob storage and nonpersistent Sandbox jobs around the
existing scanner, parser and renderer. Set the exact `BLOB_STORE_ID` and verify its
application connection allows Production. On Vercel, use the current project's
OIDC identity; a protected external operator needs separately authorized,
store-matched credentials. Provider denial must not select a local or public store.

File intake requires all of the following in the serving deployment:

- Explicit Blob/Sandbox backends and enabled normal dispatch.
- Pinned scanner/parser/renderer image references and the matching scanner-signature
  JSON attestation. `TURAS_PILOT_SCANNER_SIGNATURE_JSON` must be present in
  **Production**, match the scanner digest and be no more than seven days old.
- Current project execution credentials, open operational admission and an active
  Production-specific cost budget with the runtime's exact scope/pricing digests.

`artifactInfrastructureReady()` converts a failed intake prerequisite into HTTP
503 before creating a batch. Inspect that prerequisite and retain the error;
do not repeatedly create conversations or upload bytes to diagnose it. Configured
image references are distinct from evidence that those images executed.

Normal `GET /eve/v1/turas/jobs` scheduling prepares one bounded domain job per
tick. The separate watchdog handles maintenance and reconciliation; it is not a
substitute for heavy-job dispatch. Existing Production scheduling supplies the
protected cron bearer. Do not copy a Preview bearer, put it in a URL, or disable
authentication to invoke a worker. Jobs keep the existing two-job concurrency
fence, per-kind cost ceilings, at most 300 seconds, bounded inputs/outputs,
denied network access, no exposed ports and no application/model credentials.
Verify actual provider IDs, image/output digests, domain publication and owned
shutdown when diagnosing processing. Failed or uncertain work is not an automatic
retry instruction.

Private uploads use the normal prepared capability, signed PUT and finish protocol.
The capability is limited to one staging path, declared size and expiry; it grants
no read or overwrite permission. For browser PUTs, do not add
`x-add-random-suffix` or `x-allow-overwrite`: those constraints are already signed,
and the extra headers fail Blob CORS preflight. Check actual WebKit transport when
changing browser uploads. A Node upload alone does not prove browser CORS.

Verify a processed original by an authorized uncached stream, exact byte count and
SHA-256 against the immutable source and domain record. Use normal delete/withdraw,
conversation archive and session revocation for validation cleanup. Retain failures
and distinguish requested cleanup, observed domain deletion and independently
verified provider deletion. Do not remove shared stores or customer content as
incidental test cleanup. See [retention policies](pilot-lifecycle.md).

## Finite cost accounting

Normal hosted processing uses the generic cost-budget contract. Its selected
finite expiry, scope and pricing must match Production; the separate historical
48-hour Preview infrastructure authorization is not its contract. The existing
operator command records status, explicit provisioning or reviewed reconciliation:

```sh
npm run pilot:cost -- --environment <exact-marker> --input <private-request.json> --output <new-private-directory>
```

The strict input identifies the service category, applicable authorization,
scope/pricing digests, cap and expiry. Model, research credits, hosting, Blob,
Sandbox, registry and email accounting remain separate. This command makes no
provider request and grants no authority to dispatch or send.

Reconciliation binds the exact reservation, operation, prior state, charge and
review evidence. An estimate retains at least its reserved ceiling. Unknown
charges remain held; a successful operation does not prove an invoice or release
its reservation. Revoked budgets cannot be revived by replay. Preserve original
journal/event bytes and inspect a possibly committed receipt before retrying an
operator command. Cancellation of the pilot does not erase any charge or hold.

## Backup integrity and scheduled retention

Keep backups on work-controlled infrastructure with encryption keys separately
retained from ciphertext and application failure domains. Personal storage is not
a recovery destination. Reverify the actual operator, key access, capacity,
provider plan and scheduler; old project names or historical copied archives do
not establish current availability. Never create, deploy or reconnect an operator
merely because a historical receipt names it.

The retained integrity verifier does not modify a database or unlock recovery:

```sh
npm run pilot:backup -- --verify --environment <exact-marker> --ledger-digest <expected-ledger-sha256> --manifest <private-manifest.json> --bundle <private-bundle.encrypted> --key-file <separate-private-key> --output <new-private-directory>
```

It checks ciphertext size/digest, AES-256-GCM authentication, archive provenance
and database/object/workflow byte inventories, and removes temporary plaintext.
Keep the binary 32-byte key outside captured stores and archives. A database dump
uses a server-compatible client and the same exported snapshot as its bound
metadata; keep the exporting transaction open until its consumer finishes.
Integrity verification does not prove restoration, current authority, service
availability, outside-domain independence or recurring scheduling.

Use the existing explicit database safety-copy and disposable forward rehearsal
before a schema-changing release:

```sh
npm run pilot:backup -- --database-safety-copy --source <private-source-config.json> --destination <private-operator-config.json> --output <new-private-directory>
npm run pilot:recovery:check -- --restore-database-safety-copy --receipt <private-copy-receipt.json> --destination <private-operator-config.json> --output <new-private-directory>
```

Bind actual source identity, server major, complete ledger/content digests and the
required-original inventory. A database-only safety copy does not include all
private object bytes or managed Workflow state. Never label its physical-copy
duration as full service RTO. Use the complete work-capture contract and its
matched object/Workflow inventories for service recovery; owned synthetic capture
commands cannot capture or qualify Production.

The managed backup policy uses a 12-hour interval, 24-hour freshness and seven-day
managed retention. Inspect actual verified captures rather than assuming the
checked-in schedule ran:

```sh
npm run pilot:backup -- --schedule-check --environment <exact-marker> --inventory <private-inventory.json> --output <new-private-directory>
```

Existing operator archives, independent denial snapshots and permanent replay
fences are outside ordinary managed expiry. Capacity exhaustion must stop capture,
not delete held authority, change billing or enable automatic top-up. A failed
scheduled slot remains failed; a separately authorized manual capture is recorded
as manual and does not replace scheduled-cadence evidence.

## Incident fencing and isolated recovery

For a real incident, retain the original timestamp and exact owner control
revision. Inspect status, explicitly quiesce, drain/reconcile, then lock the target:

```sh
npm run pilot:control -- --environment <exact-marker> --mode status
npm run pilot:control -- --environment <exact-marker> --mode quiescing --expected-revision <revision> --recovery-id <incident-uuid> --operation-id <operation-uuid>
```

Use the resulting revision for the explicit locked transition. A control change
does not stop external processes: fence the old deployment, runtime credentials,
managed Workflow and Sandbox consumers as well. Commit old-role `NOLOGIN` before
terminating its backends, confirm actual exit and a fresh backend census, and keep
the environment closed if retirement is uncertain. Do not give the normal
Production role a short test expiry or grant it owner privileges for convenience.

Retain current minimized denial/replay authority independently of the backup:

```sh
npm run pilot:recovery:authority -- --capture-work-denials --source <private-source-config.json> --destination <private-operator-config.json> --output <new-private-directory>
```

The snapshot records required credential/grant/source/lifecycle/replay metadata
and transaction watermarks without raw facts or secret bytes. It establishes
state only at that watermark; stale, truncated or foreign snapshots cannot restore
current authority. Keep request fences and uncertainty holds even when payloads
have expired.

Restore into a distinct, locked owned target using the authenticated capture,
separate key, matching database major and complete object inventory. Never restore
in place over the running Production database. Recompute contents and ledger,
apply current migrations/grants in the documented compatibility order, reconcile
newer denials and every original paid/send request identity, and conservatively
quarantine unsupported scope. Do not replay a paid request, mail send or native run
to discover whether it completed. Managed Workflow inventory/retirement must cover
every page and report uncertain identities explicitly.

For a planned drill, leave live Production open. Create a distinct private Blob
store and fresh owned Neon branch, restore the authenticated archive with its
separate key, and keep that target's runtime closed until verification. The drill
must not inspect or modify firewall rules or require a hostname allowlist.

```sh
npm run recovery:drill -- --start --source <current-production81-owner.json> --output <new-private-start-directory>
npm run recovery:drill -- --verify --configuration <private-isolated-drill-configuration.json>
```

The start command reads the actual live database clock and identity. Retain that
original start receipt when fixing a verifier and restoring the isolated target
again; do not restart its elapsed-time clock. The final verifier and Preview must
match the current clean commit, and the result separately records the source
revision that started provisioning. Name the new
branch `turas-recovery-drill-<drill-id>` and create it after that observation.
The verifier authenticates provider branch/endpoint identity, distinct target
connection, cold archive, complete contents, schema/grants, required private bytes,
current denial/replay state and the closed runtime before explicit target-only
admission. It cannot open the live source or manufacture a full failover record.
Missing current authority remains a stop condition. Empty records or file sets
pass only when the independently governed database projection and authenticated
capture agree; do not create fictional business records to obtain positive reads.

Before restoring, inventory the backup's referenced roles. Recreate required
non-login ownership/cleanup roles on the isolated branch; preserve runtime role
attributes and keep both runtime logins closed. Use a compatible PostgreSQL18
client and an explicit trusted system certificate bundle for verified TLS.

Neon provider-owned default ACLs may be unrestorable by the database owner.
The observed Production081 archive contains two such TOC entries: public table
and sequence defaults owned by `cloud_admin`, granting `neon_superuser` grant
option. If those exact entries must be excluded, retain the original TOC and
record the exclusions. Do not exclude application ownership or ACLs. Compare
Source and restored application metadata and effective runtime/cleanup-role
permissions, including control-table update denial and cleanup-function execution.
Record provider-default differences separately; a target-only digest is insufficient.

Use actual partner assignments. A partner with no assigned customers must receive
an empty customer directory and denial for an unassigned customer. Verify its
knowledge-only MCP connection against the same credential's governed domain
projection, exact permitted tool catalogue and revocation denial. Do not create
customer assignments or business records to obtain positive drill results.

Run the verifier in a dedicated child environment with both database variables
set to the selected target runtime URL, the actual environment marker and preview
origin, normal account credentials, a valid maintenance secret and MCP enabled.
Disable automatic paid producers on the isolated deployment. Never overwrite the
selected checkout's `.env.local`, copy a Source budget into new spending authority,
resume an old paid/send request, or let canonical domain reads fall back to Source.

Actual authenticated primary-role HTTP, pinned-SDK reads, owner/customer denials,
private-byte parity and exact probe-credential retirement establish restricted
restored service. On a failed or uncertain target admission, refence that same
owned target and report uncertainty; do not mark the drill successful. Record
backup age and full provisioning-to-verification drill duration separately from
an actual incident's RTO. A successful drill does not claim that a real outage or
canonical production failover occurred. Remove the temporary deployment, branch,
store and target credentials after retaining private receipts.

## Monitoring and release checks

Use `/api/operations/status` for bounded administrator diagnostics. The watchdog
and domain workers retain separate per-class success, backlog and lease evidence;
a chat heartbeat does not establish all cleanup health. Do not reset quotas,
request identities or deadlines to clear an alert. Safe logs contain correlation
IDs, stages, enumerated failure codes and counts rather than customer prose,
headers, tokens or raw database connections.

For a normal release, run the relevant deterministic, authorization, concurrency
and UI checks, require green CI for merge, and verify the deployed commit/schema
and changed behavior with authenticated HTTP and command-line Playwright/WebKit.
Use a finite applicable budget for a necessary actual-provider check. Preserve its
strict domain validation and report its precise scope; a single configured-provider
schema request is not a full feature suite or hosted Production proof. No private
pilot readiness bundle or participant approval is required.

The former synthetic provisioning, participant-feedback, whole-catalog model
programme and scoped pilot-decision procedures are historical material in Git and
[validation](../specs/016-pilot-hardening/validation.md). Do not reactivate them or
create their infrastructure as part of normal operations. Keep the remaining
Production recovery gap visible in the [handoff](../specs/016-pilot-hardening/handoff.md).
