# Independent work backup operator

The undeployed `turas-recovery-operator` project was retired on 2026-10-14 at the
user's direction. Its recovery keys were preserved separately and its existing
Neon archive remains. This package is retained source/reference; the preparation,
linking and deployment examples below do not authorize recreation. No scheduled
operator is currently deployed.

On2026-10-18 the user authorized proceeding with task spending below$100 in
response to the concrete$2/48-hour operator recreation proposal. That instruction
now permits its bounded recreation; retain the original retirement and previous
archive/key history. Current preparation and actual hosted schedule execution are
separate evidence. Do not infer a running schedule from a locally built package.

The deterministic Function in this package is published separately from Turas.
It takes no customer request body and exposes no conversation or model transport.
Vercel Cron calls `/api/backup` every twelve hours in UTC. The handler requires the
exact `CRON_SECRET` bearer value, a matching Production operator project, an
explicit enable flag and current owner-provisioned hosting/Blob budgets.

Prepare a fresh package in the core checkout with
`node --import tsx scripts/prepare-pilot-recovery-operator.ts --output local-artifacts/016/operator-NEW`.
From that package, use `eve link --non-interactive --project turas-recovery-operator
--team <work-team>` and `eve deploy --non-interactive --yes` after the release gates
and applicable budget admission. Never link the primary checkout to the operator.
The package's Eve channel denies all conversation traffic; its build publishes
only the protected deterministic Function and licensed PostgreSQL tools.

`build.mjs` emits Vercel's [Build Output API](https://vercel.com/docs/build-output-api/primitives).
Cron authentication follows [Vercel's documented `CRON_SECRET` header](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
Eve is a pinned runtime dependency of the prepared package: the installed CLI's
project discovery does not accept an Eve entry only in development dependencies.
The prepared runtime and all native files are bound by SHA-256. The source
provenance and migration ledger come from the exact canonical preparation source.
Local build output is not hosted execution proof.

Protected operator variables:

- `CRON_SECRET`: independent random bearer secret, at least 43 URL-safe characters.
- `TURAS_WORK_BACKUP_ENABLED`: `1` only after explicit provisioning and acceptance.
- `TURAS_WORK_BACKUP_CONFIG`: encrypted `pilot-work-backup-config-v1` JSON; includes
  the unpooled, verified source and separate archive connections, exact projects,
  store, installation, bounded inventory and separately provisioned cost bindings.
- `TURAS_RECOVERY_MASTER_<version>`: a separately retained 32-byte key as lowercase
  hex in this work project. Its reference/version must match the configuration.

Each archive gets an HKDF-SHA256 key bound to its installation, environment and
archive ID. Keep every required master-key version outside the archive database;
never silently replace an old version or delete keys needed by operator archives
or independent denial/replay retention. Cold recovery must retrieve the actual
work-project key separately and verify the placement binding. Runtime availability
alone does not prove durable key retention.

Install archive migrations 004, 005 and 006 explicitly with the independent owner;
handlers cannot initialize schemas or grant budgets. The source requires schema
079 and retirement of its old runtime login. Routine captures hold the exclusive
IO fence and require drained leases while keeping open service control unchanged.
Busy sources fail within the deadline. There is one admitted operation at a time,
no automatic retry of a twelve-hour slot, and unknown work costs hold admission.
Conclusive operations retain their complete published cost ceilings as estimates.

The operator captures database and all six private object namespaces, encrypts
them, copies to the independent archive, cold-downloads and authenticates them,
and retains minimal immutable capture audit. Only expired managed archives are
removed; independent authority holds and existing operator archives are preserved.
Temporary plaintext, downloaded bytes and key files are removed after the job.

Managed Workflow remains interrupted reconciliation, never copied native state.
Backup bytes alone do not establish current authority, replay safety, restricted
restoration or a release decision. Actual scheduled invocations, key retrieval,
full restore and cadence/RTO must still be collected independently in Production.

The Function uses the standard 2 GB Fluid Compute configuration and a 300-second
platform deadline. Cost admission reserves against a conservative 4 GB/two-CPU
maximum for that deadline. The protected handler disables Blob SDK retries with
`VERCEL_BLOB_RETRIES=0` before dispatch; an ambiguous provider operation holds
its reservation instead of starting another request.

Provision the separate archive's category budgets with the protected command:

```sh
npm run pilot:backup -- --provision-work-cost --destination <private-destination.json> --authority <private-cost-authority.json> --output <new-private-output>
```

The strict authority splits a single applicable operator cap between hosting and
Blob, binds both to the same installation/environment/scope/pricing/expiry, and
requires distinct budget IDs. Repeating identical authority preserves accounting.
Replacing IDs or increasing an existing cap fails; this command neither deploys
nor enables the scheduler.

Backup Blob reads validate each complete metadata page against the aggregate
256-object/24 MiB allowance before downloading any object on that page. The
read-only adapter admits at most 32 list requests, 1,280 reads, and five reads per
object. Over-bound inventories, changed metadata and extra requests fail; it never
writes to or deletes from the source store.

Current published iad1 pricing is verified from three official documents before
each hosted capture. It includes on-demand CPU/memory, invocations, Blob and CDN
operations, transfer and a storage allowance, without subtracting free credits.
A changed/missing rate holds accounting. The prepared reservation ceilings are
$0.10 hosting and $0.05 Blob per bounded invocation. These are conservative
estimates, not invoice proof or authorization to spend. Category budget admission
and the separately applicable operator cap still govern every invocation.

Migration 006 requires an immutable explicit review before an unknown operation
can settle. Use the protected review command with independently attributable
operator review and charge-evidence digests:

```sh
npm run pilot:backup -- --review-work-cost --destination <private-destination.json> --review <private-review.json> --output <new-private-output>
```

It charges both retained full ceilings as estimates, preserves original budget
and reservation identities, and records the review permanently. An exact replay
retains receipts; changed evidence or review fails. It cannot release an unknown
charge as unused, fabricate an invoice, dispatch a provider or reset spend.
