# Controlled pilot operations

016 is in implementation. None of this document establishes hosted readiness.
The `08ef152` checkpoint passed its historical 640-case local catalog and
43 CI jobs. Current integration targets schema 079 while Production remains
on released schema 077; fresh complete source-bound verification is in progress. The exact source and retained failed attempts
are recorded in [validation](../specs/016-pilot-hardening/validation.md).
Storage cutover, complete recovery/current-authority reconciliation and hosted
journeys remain unfinished; the operational blockers below are not waived by CI.
No Production migration, release enablement, participant feedback or scoped
mcteer readiness decision is implied by this checkpoint.

| Component | Current implementation | Required hosted capability | Readiness blocker |
|---|---|---|---|
| Database | Released ledger through 077; pilot 078/079 authored | 078/079 forward migration and exact grants | Not applied to hosted targets |
| Original artifact bytes | Private local artifact store | Private Blob, verified inventory cutover | Hosted adapter/cutover pending |
| Workforce bytes | Private local workforce store | Private Blob with immutable digest verification | Hosted adapter/cutover pending |
| Reports and gap reports | Private local report store | Private Blob, authorized uncached streaming | Hosted adapter/cutover pending |
| Processing | Local scanner/parser/renderer containers | Pinned nonpersistent Sandbox jobs | Images/executor not validated |
| Local workflow | Root `.eve/.workflow-data` | Preserve independently during owned checks | Export/reconciliation not validated |
| Hosted workflow | eve-managed Workflow capability | Reconcile uncertain unfinished work; accepted domain state in DB/store | Provider capability verification pending |
| Maintenance | Local domain workers; hosted conversation/learning/MCP watchdog | Every required finite class and independent short cleanup | Hosted class coverage incomplete |
| Recovery | Prior feature-specific recovery checks | Matched encrypted backup, current denials, locked isolated restore | Full restore/cadence unproven |

Keys are inventoried by configuration name only: `TURAS_MAINTENANCE_SECRET`,
`TURAS_REPORT_RECIPIENT_HMAC_KEYS`, `TURAS_REPORT_RECIPIENT_HMAC_KEY_ID`,
`TURAS_010_RECEIPT_HASH_KEYS`, `TURAS_012_RECEIPT_HASH_KEYS`,
`TURAS_014_RECEIPT_HASH_KEYS`, `CRON_SECRET`, and the new private-store/backup
credentials. Retain old fence keys for the environment lifetime. Provider keys must
never reach isolated processing jobs or evidence summaries.

Provisioning, migration, storage cutover and unlock require an explicit target;
there is no local fallback. Protect old unbound-session deployments before adding
second workspace memberships. Prepare and validate Preview before Production.

Storage cutover must fence writes, inventory exact identities, copy immutable bytes,
verify size/digest parity and retain the old store for reconciliation. Never delete
originals as a side effect of copying. Rollback must reference a verified populated
store, never an empty local directory.

New managed backups require two actual scheduled captures twelve hours apart,
maximum age 24 hours and seven-day expiry. Existing operator archives remain outside
managed deletion. Current denial/replay authority must survive independently.

## Current integrity verification command

The operator can verify a completed private encrypted bundle without changing a
selected database or granting restore/unlock authority:

```sh
npm run pilot:backup -- --verify --environment <exact-environment-marker> --ledger-digest <expected-ledger-sha256> --manifest <private-directory>/manifest.json --bundle <private-directory>/bundle.encrypted --key-file <separate-key-directory>/private.key --output <new-private-evidence-directory>
```

Directories must be owned and mode 0700; manifest, bundle and the separate binary
32-byte key must be regular non-symlink mode-0600 files. The key directory must sit
outside captured stores and archives. The command checks ciphertext size/SHA-256,
AES-256-GCM authentication, exact archive provenance and database/object/workflow
byte inventories, then removes its temporary plaintext. Its receipt explicitly
leaves restoration, current authority and outside-failure-domain proof unverified.
It neither unlocks an environment nor establishes the scheduled backup gate.

The database capture primitive uses an owner-held locked revision and an exported
server-compatible PostgreSQL 17 or 18 snapshot while excluding private writes/cleanup IO. The fixed pinned
client receives database credentials only for this operator backup operation;
those credentials never enter scanner/parser/renderer jobs or evidence summaries.
Its owned container is stopped and removed before releasing the capture operation.
PostgreSQL's [snapshot synchronization contract](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION)
requires the exporting transaction to stay open while the dump imports its snapshot.
The full capture/current-authority/restore commands and actual outside-domain
retention/cadence verification remain in implementation.

## Schedule inventory check

```sh
npm run pilot:backup -- --schedule-check --environment <exact-environment-marker> --inventory <private-directory>/inventory.json --output <new-private-evidence-directory>
```

The private inventory is an array of exact `id`, `environmentId`, `ownership`
(`managed-016` or `operator`), `capturedAt`, `expiresAt`, and nullable `verifiedAt`
records. The checked-in `infra/pilot/backup-schedule.json` fixes the 12-hour interval,
24-hour freshness limit and seven-day managed retention. The assessment rejects
mixed environments, duplicate identities, future verification and changed managed
retention. Only verified managed captures count toward freshness. It lists expired
managed identities separately from retained operator archives and never authorizes
deletion of either archives or independent denial/replay authority.

This is an inventory check, not a scheduler or proof of actual scheduled execution.
Capture spacing and verified scheduler execution remain separate receipt fields.

## Observe maintenance health

Run one finite observation against the explicitly selected environment:

```sh
node --import tsx scripts/pilot-health.ts --environment "$TURAS_ENVIRONMENT_ID" --output local-artifacts/016/NEW_HEALTH_OBSERVATION --observe
```

The output directory must be new. The command validates the actual environment and
schema, records all fifteen cleanup classes under the exact code version, writes
private source-bound evidence and exits unsuccessfully if any class is unhealthy.
It records bounded immutable samples and expires at most 100 samples older than
ninety days. It does not run customer authoring, provider calls or cleanup payload
work. The maintenance worker runs this observation in an independent sixty-second
lane; a failure does not stop other cleanup lanes. Its safe log identifies the
affected classes and enumerated states, without customer content.

Maintenance health alone does not establish complete readiness: backup, current
authority, store/image and hosted workflow proofs remain separate mandatory checks.

## Record operator cost authority and reconciliation

Use a separately supplied database-owner connection and an explicit private input:

```sh
npm run pilot:cost -- --environment "$TURAS_ENVIRONMENT_ID" --input local-artifacts/016/PRIVATE_INPUT/request.json --output local-artifacts/016/NEW_COST_RECORD
```

The input is a strict `pilot-cost-operation-v1` document with action `status`,
`provision` or `reconcile`. Provisioning requires an immutable `pilot-cost-v1` budget
with its exact environment, service category, authorization/scope/pricing digests,
finite integer micro-USD cap and expiry. The operator must supply actual applicable
authorization and pricing evidence privately; the command does not obtain approval,
expand an existing cap or reuse another feature's model budget. Hosting, Blob,
registry, Sandbox, model, research, embedding and email remain distinct categories.

Reconciliation binds the exact budget/reservation/operation, expected dispatched or
unknown state, charge amount/kind, charge-evidence digest and operator-review digest.
The owner commits an immutable receipt and matching settlement together. Exact
replay is idempotent; changed proof, review or amount is refused. Estimates retain
the greater of the reserved bound and estimated charge for subsequent admission.
An unknown charge holds the entire applicable budget until explicit reconciliation;
confirmed over-cap costs are recorded honestly and hold further admission. Revoked
budgets are never revived by replay. Receipts retain permanent replay metadata.

The private output preserves the exact request before mutation and writes a
source-bound ledger result afterward. If recording fails after a commit or the
source changes, inspect the exact owner ledger and immutable receipt before retry;
do not infer that a charge was unperformed. This command makes zero provider calls
and has no dispatch, send, retry-paid-work or release-approval action. Its records
are accounting evidence, not proof of hosted invoices or production readiness.

## Private participant feedback

`npm run pilot:feedback -- --environment E --input /private/request.json --output /private/new-record-directory` records explicitly supplied human observations only. The input and prior records use the existing private evidence guards (directory 0700, file 0600, no symlinks or hard links). The command never contacts participants, creates accepted facts or approves a release.

The request contains `record` and, for an append, `previous: {file, digest}`. The previous file digest is the exact SHA-256 returned as `fileDigest`; the record’s `previousDigest` is the canonical `recordDigest`. Each append writes a new directory and preserves the original observation, scope and transition prefix. Scope contains the exact environment and synthetic workspace, customer UUIDs and distinct named internal and partner participant references with actual principal and membership UUIDs. All listed customers must have active explicit grants for each listed partner; a narrower feedback cohort needs its own separately recorded scope. Current database membership, principal, partner organization, workspace and grant eligibility are checked at every recording.

Each UUID feedback item identifies J002–J015, participant, observed time, private observation reference and severity. The state advances `recorded → triaged → resolved | deferred`, with an internal follow-up owner. Blockers cannot be deferred. Resolution requires the supplied recheck reference and digest; nonblocker deferral requires rationale and a future follow-up. These are retained operator reports, not automatic verification of the referenced recheck. G21 acceptance still requires review of the actual participant observations and underlying current journey proof; synthetic fixture feedback cannot satisfy it. No real participant observations have been supplied by this implementation.

The owned workflow staging primitive rejects indirect/hard-linked/writable entries, takes bounded SHA-256 byte inventories before and after staging, and removes only its new partial destination on interruption. It retains source files. Stable file bytes alone do not prove a stopped native process or database-matched boundary: the returned `workflowRuntimeStoppedVerified` and `matchedCheckpointVerified` remain false. The operator capture must independently stop/protect the relevant native runtime before using those entries in a full recovery manifest. Managed Workflow must use its verified interrupted-reconciliation capability; no generic local-files export is inferred for it.

## Actual hosted target inventory and database major

The read-only 2026-10-11 target inspection found PostgreSQL **18** on both targets: Preview at schema **38**, Production at schema **55**. These values are dated observations, not deployment approval or evidence of migrated schemas. The selected connection and records were not changed. Verify markers again immediately before any later mutation; do not treat Preview as already through 055.

Recovery clients now select separately pinned PostgreSQL 17/18 images from actual server metadata. Capture binds the actual major; the dump checks it independently and verifies the process version, and restore refuses a mismatched target major before altering grants. The [PostgreSQL 18 pg_dump contract](https://www.postgresql.org/docs/18/app-pgdump.html#APP-PGDUMP-NOTES) forbids dumping a newer major with an older client and does not guarantee loading newer-client output into an older server. The [official pgvector image documentation](https://github.com/pgvector/pgvector#docker) supplies the prepared 18 image; executions use its exact manifest digest with no implicit image pull. Owned checks remain available for both 17 and 18; a passed 17 check is not Production compatibility proof.

The minimal public readiness response is `{ready: boolean}`, with 503 for failed or unverified readiness. Protected diagnostics require the canonical mcteer bound session and remain available during recovery lock. Readiness requires exact schema/runtime grants, open admission, no unresolved recovery scopes, completed fresh maintenance, and current deployment/store/image/backup observations. Application Blob adapters record a namespace observation only after immutable upload and uncached digest-verified read; every active namespace needs a sample within 24 hours and after the latest recovery lock. Image health requires a domain-validated successful Sandbox job for each configured image on the current code version, within 24 hours and after recovery; stale scanner signatures or a newer incomplete job withhold health. The backup operator records owner-only observation after cold archive and capture-provenance authentication, temporary-byte cleanup and settlement of both independent cost reservations. Capture must be within 24 hours and after recovery. Status reads perform no paid provider operations. Historical resolved quarantines remain in the audit but do not count as unresolved after verified unlock. Diagnostics include the deployed commit, two-job capacity, and at most 20 active or unknown cost budgets with explicit upper-bound commitment and unknown-cost holds; incomplete budget inventory or unknown reservations withhold readiness. Paid job readiness also requires the enabled dispatcher and its exact current Sandbox scope/pricing budget, with enough remaining upper-bound allowance for each configured job and no unknown reservation. Known expired/revoked budgets do not indefinitely fill the diagnostic inventory. These operational observations do not prove scheduled cadence, current denial reconciliation, restore readiness or pilot acceptance; target environments remain unverified until their actual producers run.

### Isolated physical restore and absent-authority fallback

The current restore command is restricted to separately provisioned, owned loopback 016 databases on PostgreSQL 17 or 18. It does not restore Preview or Production and does not initialize the target, start processes, change aliases, or unlock. Set the explicit target owner/runtime environment through the owned runner; keep the selected checkout environment untouched. The target must already have schema 079 and be locked.

Run `npm run pilot:recovery:check -- --restore-isolated --environment <source-marker> --ledger-digest <source-ledger-sha256> --manifest <private-manifest.json> --bundle <private-encrypted-bundle> --key-file <separately-controlled-key> --source-database <owned-source-database-name> --output <new-private-result-directory>`. Source and target markers/database names must differ. Recovery manifests and authenticated archive provenance bind `acceptedContentDigest`, covering every captured domain table and sequence except control/observational recovery tables. The ledger digest hashes the canonically ordered `SELECT name FROM turas_migrations ORDER BY name` rows. Recovery metadata digests canonicalize object property order; array order remains significant.

The command authenticates/decrypts the private bundle, restores with the matching pinned PostgreSQL client, verifies captured content and exact ledger, reapplies explicit runtime grants, verifies every object namespace, and retains authenticated workflow bytes. A failed or interrupted restore stops its owned container before removing runtime table privileges. Do not serve a partially restored target. Keep its diagnostic files private and retry only into a newly provisioned, separately identified owned target; this command does not overwrite an existing restore result or prove interruption resume.

Successful physical restore still has `restorationReady: false`. With no independently current authority/replay proof, it automatically revokes restored login sessions, permanently removes MCP credential hashes, revokes active partner grants, and leaves all required scopes locked. It preserves captured fact/decision histories and replay receipts; captured receipts do not prove that all newer receipts are available. MCP credential removal uses the existing irreversible database fence rather than inventing a human revoker membership. The management view reports those unusable credentials as revoked, with no fabricated human revocation timestamp.

The same conservative action can be run explicitly with `npm run pilot:recovery:authority -- --quarantine --environment <exact-marker> --recovery-id <uuid> --expected-revision <locked-revision> --output <new-private-directory>`. Actual database-owner authority and the exact locked recovery scope are required; runtime cannot run it. Repetition does not extend expiries or repeatedly increase grant generations. Its private receipt records restricted recovery only. It cannot establish full current-authority verification, full RTO/readiness, or authorize unlock.

Missing-authority quarantine now persists all seven required scopes in immutable owner-admitted records. Neither the domain unlock nor a direct database update can reopen an environment with unresolved quarantine records. Dispatched, unreconciled operational charges are held as unknown; settled charges and their permanent receipts remain intact. A verification label does not resolve missing proof. The independently current proof and resolution producers are still unfinished; do not delete quarantine records or bypass the unlock fence.

Migration 057 rejects nonowner login-session INSERTs while quiescing/locked, including legacy inserts that omit workspace binding. This does not replace stopping/protecting every older deployment and unfenced worker before capture or release. Do not reopen a target solely because physical restoration and credential quarantine passed; the independently current denial/replay and Workflow reconciliation producers and full eight-case recovery catalogs remain unfinished.

Maintenance backlog reports due work, including elapsed retry/lease boundaries, and
excludes work scheduled for a future time. Counts cap at 1,000 and expose truncation;
the oldest actual due timestamp is selected before the cap. A fresh completed tick
is insufficient when that timestamp exceeds the class freshness bound: status is
`backlogged`. Inspect the governing queue and its existing retry/uncertainty policy;
do not reset its deadline, quotas or paid-attempt state to clear an alert. Published
knowledge is inspected in persisted oldest-inspection order at least once per minute;
inspection never accepts new facts or bypasses synchronous lineage eligibility.
Operational observations retain timestamps and counts for ninety days, with no
customer labels or payloads.

### Work-controlled Neon archive destination

**Operator retired on 2026-10-14 at the user's direction.** The undeployed
`turas-recovery-operator` Vercel project was removed after all 13 recovery keys
and archive credentials were cold-read and retained in a private work directory
outside this checkout. Its separate `turas-recovery-016` Neon archive remains
available and is no longer connected to a Vercel project. The existing project
references in historical receipts/configurations are retired; the platform-bound
capture, key retrieval and scheduler commands below cannot establish current
operator availability. Do not recreate or deploy an operator without a new user
instruction. Retiring this project does not establish 016 recovery acceptance.


During initial 016 preparation, the work account received a separate Neon Free resource, `turas-recovery-016`, previously connected only to the now-removed `turas-recovery-operator` project. The selected application project and `.env.local` are unchanged. Its explicitly installed schema is [neon-archive.sql](../infra/pilot/neon-archive.sql); application requests cannot install it. The current adapter bounds an encrypted archive to 64 MiB and total retained ciphertext to 400 MiB after the explicit owner migration [neon-archive-002-capacity.sql](../infra/pilot/neon-archive-002-capacity.sql). It rejects capacity exhaustion and never upgrades the plan automatically. This bounded destination is not a verified complete Production backup or a guarantee against a provider or regional failure.

`npm run pilot:backup -- --copy-neon-candidate --environment <owned-marker> --candidate <private-candidate.json> --bundle <private-encrypted-bundle> --key-file <separate-private-key> --destination <private-operator-config.json> --output <new-private-evidence-directory>` accepts only the existing owned synthetic candidate contract. The strict private destination configuration binds the work team, separate operator/source project IDs, exact resource/name, Neon project, schema installation UUID, capacity and explicit `verify-full` database connection. Keep its credentials in protected operator configuration. Before and after copying, the command verifies actual platform/project/resource/credential bindings and the exact declared plan. The original v1 descriptor remains Free-only. A strict v2 descriptor explicitly binds either `free_v3` or `launch_v3`; this describes identity, not pricing or spending authority. Current inspection found the retained resource already on Launch. The recreated dedicated operator is linked and connected to that resource, but has not been deployed or scheduled. No billing plan was changed. Finite spending authority and actual usage accounting remain separate requirements. It authenticates the candidate using the separately supplied key, preserves immutable chunk identity, verifies the complete ciphertext through a fresh connection and leaves restoration readiness false. It cannot capture or qualify Production recovery.

`npm run pilot:backup -- --expire-neon-managed --destination <private-operator-config.json> --output <new-private-evidence-directory>` removes at most 100 expired managed archives using the actual database clock and seven-day deletion fence. It does not inspect or remove existing operator archives, keys, independent current-denial/replay data or application tables. A run does not prove recurring scheduling. Keys are never uploaded alongside encrypted archives. Independent current-authority storage/reconciliation, complete Production capture, independently verified failure-domain coverage and twelve-hour execution observation remain separate unfinished requirements.

### Production database safety copy and migration rehearsal

An actual read-only schema-055 Production dump has been encrypted, copied to the work Neon archive and downloaded/authenticated through a fresh connection. Its separately retained key was an encrypted environment variable in the then-undeployed work operator project. That historical project/key availability must be reverified before use; its old receipt does not establish current recovery capability. Temporary plaintext and key staging are removed. Neither the application project nor its selected local connection is changed.

```sh
npm run pilot:backup -- --database-safety-copy --source <private-source-config.json> --destination <private-operator-config.json> --output <new-private-evidence-directory>
npm run pilot:recovery:check -- --restore-database-safety-copy --receipt <private-copy-directory>/database-safety-copy.json --destination <private-operator-config.json> --output <new-private-evidence-directory>
```

The source configuration binds the exact Production project/environment/schema and explicit unpooled Neon `verify-full` connection. A readable platform connection must match. When the platform withholds a sensitive Production variable, only the explicitly designated `protected-operator-connection` binding is accepted; the receipt retains `platformConnectionBindingVerified: false`. This does not change the variable's secrecy or infer a connection from the selected checkout.

The safety-copy context authenticates the exported snapshot's application-content digest, full migration-ledger digest, source database identity, server major and dump bytes. Current captures use v3, binding an explicit Preview or Production target and schema 055, 057, 077 or 079; schema 038 is Preview-only. The restore command also retains support for historical schema-055 v2 contexts. Every input must be at most 24 hours old with an unexpired archive. It retrieves the key independently, authenticates the cold archive, provisions a disposable matching-major database, denies both runtime roles and public connections before restoration, verifies copied content/ledger and explicitly rehearses the remaining checked-in migrations through 079. It revokes/quarantines restored authority, verifies the lock and destroys the owned target. The earlier actual Production-copy rehearsal covered schema 055 and then-current 056/057 only. A fresh actual Production077 database safety copy and owned PostgreSQL18 forward rehearsal through079 now pass, including copied content/ledger and locked runtime denial. Production remains schema077; this pilot release still requires a matched service backup/recovery verification and explicit078/079 upgrade. Owned 077 fixture checks are separate from an actual current Production backup.

This is a database-only safety copy and forward-migration rehearsal. Private objects, managed Workflow, independently current denial/replay reconciliation, scheduled execution, full RPO/RTO and complete service restoration remain unproven. The archive is a separate work resource in the same region; provider/regional failure independence is not established. Current Neon [Free-plan limits](https://neon.com/blog/neon-free-plan-1-gb-per-project) informed the bounded capacity policy; the operator migration does not upgrade billing or make an unbounded storage claim.

### Independently retained minimized denial/replay snapshots

The independent archive has an explicitly installed [retention migration](../infra/pilot/neon-archive-003-authority-holds.sql). Held metadata snapshots and their ciphertext cannot be updated or deleted, including by managed backup expiry. Ordinary elapsed backups still expire. The same bounded capacity applies; exhaustion blocks capture rather than changing billing or removing independent authority.

```sh
npm run pilot:recovery:authority -- --capture-work-denials --source <private-source-config.json> --destination <private-operator-config.json> --output <new-private-evidence-directory>
```

This command uses an actual owner-held read-only repeatable-read source transaction. Its current v7 inventory covers required credential/grant/source/publication metadata, conversation-to-native-run bindings and watchdog status, paid/native/provider attempts, operational charges at schema 079 and permanent request/management/lifecycle identities and row digests. It records exact primary keys, schema digests, lifecycle status and a transaction watermark. It omits source text, accepted facts, addresses, filenames, result payloads and credential bytes; a credential-presence bit does not confer authorization. Every required table must exist. More than 10,000 rows/table, 128 tables or 8 MiB fails rather than truncating proof.

The command binds the explicit work source/destination, encrypts the minimized snapshot, creates a unique separately encrypted work-project key, authenticates a fresh-connection download/decryption, validates a fresh independently bound snapshot digest and places only those minimized encrypted bytes under permanent retention. Temporary plaintext and keys are removed. The actual Production schema-055 v2 run captured 60 tables and 775,172 minimized bytes. No full database dump is permanently held under this procedure.

A snapshot establishes current state at its captured watermark only. Verification rejects a proof older than the recovery boundary, older than five minutes, in the future, in another environment, changed or incomplete. Capture/retention never updates a restored database, reconciles replay or clears quarantine. Current-provider reconciliation, replay reapplication, ongoing capture scheduling and full recovery verification remain required. The initial v1 retained metadata snapshot has narrower coverage and cannot substitute for the v2 verifier. Keys and independently retained metadata survive ordinary seven-day backup expiry.

### Physical restore timing is not verified-service RTO

Both isolated restore commands retain `startedAt`, `finishedAt` and a `pilot-physical-recovery-timing-v1` diagnostic. This measures the exact capture age at restore start and physical restore duration, with explicit comparisons to 24 hours and four hours. Capture age is only a conservative accepted-work boundary; the command start is not the incident start. The physical completion timestamp is not authenticated restricted service. Clock reversal or a capture later than restore start is rejected. `rpoVerified`, `rtoVerified` and `fullRecoveryReady` remain false even for a fast restore. Required quarantined scope, current denial/replay/provider reconciliation and actual incident-to-service checks must be resolved before T057 or full recovery acceptance can pass.

### Owned storage-copy rehearsal

`npm run pilot:storage:copy -- --copy-owned --environment <test-pilot-marker> --recovery-id <uuid> --control-revision <locked-revision> --source-root <private-unified-source> --destination-root <private-unified-destination> --output <new-private-evidence-directory>` copies only a marked owned database's unified local object namespaces. The caller must provide separate existing private directories and the exact owner-locked recovery revision. Every source namespace must exist; missing directories are incomplete inventory. The command keeps the database IO fence throughout full byte verification and repeats parity checks through fresh clients. An exact retry uses a new evidence directory and reconciles the existing destination without replacing matching objects. Conflicting destination bytes stop the copy and are retained for operator review.

For an owned legacy layout, use `--copy-owned-legacy` with the same environment/recovery/control/output arguments, replacing `--source-root` with `--artifact-root`, `--workforce-root` and `--report-root`. All source roots, destination and evidence must be separate direct private directories. Existing legacy environment markers are required; the command never initializes a source. Both report ledgers classify opaque report IDs under the exclusive database checkpoint, with a 100,000-row bound. Collisions, unknown report IDs, unsupported files and unfinished bytes fail closed. A fresh retry uses a new evidence directory and retains previous failure evidence and matching destination bytes. Failures after connection write a content-free `failure.json`; they do not delete partial copies or unlock service.

This rehearsal retains all originals and leaves configuration unchanged. It supports owned legacy-store classification but does not perform hosted Blob copying, provider cost admission or a deployment cutover. Those parts of T045 remain pending. Do not use a local parity receipt to switch Production storage or to authorize an empty local fallback.

### Owned dependency-fault catalog

`npm run pilot:faults` runs the fixed nine-suite deterministic fault catalog, followed by an actual owned PostgreSQL stop/start with role-bound HTTP checks. It accepts no filters. Each suite uses a fresh marked PostgreSQL 18 environment; its fixed case counts and titles must pass without skips. Remote sandbox/store fault cases use controlled SDK/domain fixtures and dispatch no paid provider request. The database outage actually stops the labelled owned container, verifies unavailable database health, rejects profile retrieval without returning data, and requires minimal 503 readiness. A 401 admission denial is safe when the database cannot verify the session; the checker does not mistake it for a successful read. Restart must preserve the bound session and ordinarily reviewed profile.

The wrapper verifies unchanged source and owned cleanup. Its measured incident-to-profile-recovery interval is not full-service RPO/RTO, hosted provider-fault proof, or an independent operator runbook exercise. Actual hosted service verification and the human exercise remain separate gates.

### Encrypted owned capture candidate


Verify a captured candidate with `npm run pilot:backup -- --verify-candidate --environment <exact-owned-marker> --candidate <private-capture-directory>/candidate.json --bundle <private-capture-directory>/candidate.encrypted --key-file <separate-key-directory>/private.key --output <new-private-evidence-directory>`. The verifier authenticates the archive header and every database dump, object and workflow entry, checks inventory digests, and removes temporary plaintext on success or failure. It rejects a wrong key, changed authenticated provenance and forged readiness claims. Its receipt records whether the captured source matches the verifier source. Database name and catalog digest are not authenticated archive fields. Integrity verification does not prove database restoration, current authority, workflow resumption or an outside-domain copy, and cannot authorize unlock.

Run `npm run pilot:backup -- --capture-owned --environment <owned-marker> --recovery-id <uuid> --control-revision <locked-revision> --source-root <private-unified-object-root> --workflow-root <private-workflow-root> --key-file <separate-private-32-byte-key-file> --key-reference <operator-reference> --key-version <version> --output <new-private-evidence-directory>` only against a marked disposable local database. This command is not available for Production capture. The three data/output roots must be separate; the key must be outside all three, in an owner-only 0700 directory with a single-link 0600 file.

The actual owner checkpoint must already be locked with the exact recovery UUID/revision and drained leases. The command holds its exported database snapshot through matching-major dump and all six verified object namespace inventories, stages stable workflow bytes, and authenticates/encrypts the archive. The receipt is written only after the checkpoint transaction and fence release succeed. A signal or failed check removes only the new plaintext staging and partial encrypted candidate; originals remain. Do not infer completion from an encrypted file alone: require the immutable candidate receipt and authenticated verification. A candidate records current authority, stopped/resumable workflow, scheduled execution and outside-domain copy as unverified, so it cannot replace a complete recovery manifest or authorize unlock.

### Incident response checklist

The incident owner is mcteer. An internal responder may collect protected diagnostics and propose actions; only actual database-owner recovery authority changes the global fence. Record incident time, exact environment/deployment/source/schema, operation and recovery UUIDs, control revision, affected maintenance classes, safe failure category and private evidence references. Exclude customer payloads and credentials. Keep the original observations and failed attempts.

| Incident | Safe response | Required recheck and stop condition |
| --- | --- | --- |
| Database unavailable or schema/grants mismatch | Stop admission and keep the public readiness check unavailable. Preserve the database and selected connection; restore connectivity or explicitly apply the reviewed migration/grant sequence. Do not initialize schema in a request. | Verify actual marker, full ledger, runtime grants and authenticated scoped reads. Stop on a foreign target, unexpected ledger or inability to prove ownership. Database restart alone is not full recovery. |
| Maintenance stale, failed or backlogged | Identify the exact class and governing queue using protected health. Restart only its identified worker/service and preserve due timestamps, leases and retry deadlines. | Require successful bounded ticks and backlog age within its class limit, then verify withholding and bounded cleanup. Stop on persistent lease loss, unknown provider work or changing deployment identity. |
| Object missing, conflicting or scanner/image unavailable | Withhold dependent content; retain originals and conflicting destination bytes. Correct the actual backend/configuration or exact pinned image/signature installation. | Verify the full namespace inventory, domain metadata and a cold authenticated read. Stop on any digest mismatch; never enable an empty fallback to silence the alert. |
| Customer source withdrawal/deletion | Use its existing authorized domain lifecycle action; preserve its exact request receipt and generation. Consult the lifecycle matrix for the relevant source class. | Check immediate denial in UI, domain, native tools, jobs, exports and MCP before physical purge. Recheck bounded cleanup and minimal audit/replay retention separately. Stop if any surface still returns the withdrawn content. |
| Partner grant, session or MCP revocation | Use the current authorized membership/grant or MCP management action; retain the immutable decision/replay identity. Never rewrite the role or credential hash directly to simulate a user decision. | Verify the old credential/session and old handles are denied, including an in-flight stream after grant loss; verify an unaffected permitted actor separately. Stop on stale deployment bypass or inconsistent generation. |
| Budget exhausted or charge unknown | Stop new admissions in the affected service category. Inspect the exact reservation and provider evidence; use the owner cost command for an explicitly reviewed reconciliation. | Require an immutable matching reconciliation and finite remaining admission. Stop if cost remains unknown, a request might have dispatched, or authorization/pricing is absent. Never clear a reservation or increase a cap to resume automatically. |
| Report delivery or paid native attempt uncertain | Preserve the permanent request/attempt identity and current unknown/dispatched state. Obtain current provider reconciliation without creating a replacement attempt. | Require evidence for the exact provider/request before deciding any further action. Stop while uncertain; timeout, worker restart and missing local output do not prove no send or no charge. |
| Native runtime interruption | Keep provider dispatch fenced; preserve application records and workflow bytes. Reconcile incomplete conversations/jobs under their existing interruption policies. | Verify current authority and paid/send receipts before creating new sessions. Stop if accepted application data exists only in an unrecoverable backend. File-copy parity does not prove resumable native turns. |

For an incident requiring a global fence, first run `npm run pilot:control -- --environment <exact-marker> --mode status` with the separately supplied owner connection. Record its revision and use a fresh operation UUID with `--mode quiescing --expected-revision <observed-revision> --recovery-id <incident-uuid> --operation-id <operation-uuid>`. Re-read status, drain/reconcile the affected workers without dropping uncertain receipts, then request `--mode locked` with the new exact revision and the same recovery UUID. A failed transition retains the fence; inspect its immutable transition before retrying rather than guessing a revision. Stop/protect older deployments and unfenced workers too. A database control transition does not itself stop an external process.

### Release and follow-up response

The preliminary hosted reader runs with `npm run pilot:hosted:check -- --scope <private-scope.json> --run <private-run.json> --configuration <private-configuration.json>`. Its strict scope binds the run UUID, Vercel project/team/deployment, HTTPS origin, environment marker, synthetic workspace, Preview or Production target, and exact source/catalog digests. The run's scope digest is the evidence SHA-256 of `JSON.stringify` on the parsed scope. Use a clean committed checkout and an explicitly supplied Neon runtime connection with `sslmode=verify-full`; it never selects `.env.local` implicitly. Supply all three synthetic pilot account passwords through protected operator configuration.

The reader verifies actual Vercel deployment and alias metadata, schema 079, runtime grants and the exact synthetic workspace before logging in. It then checks session binding, internal and assigned-partner customer visibility, protected operations access, Product Gaps access and the serving commit header. Each created session must be revoked through normal logout and verified in the actual database. Cancellation retains this cleanup path. Private receipts contain identifiers and counts, never passwords, cookies or customer bodies.

After the bound role checks, the current runner also selects ordinarily accepted delivery records within that role’s visible synthetic customers and exercises the actual pinned MCP SDK across profiles, evidence, knowledge, accepted plans and published reports. It checks citation identity, a customer outside the individual connection ceiling, and exact credential revocation. Connection creation uses normal management requests; a damaged response is reconciled by its original request key and the exact created credential is revoked without reissuing it. Every SDK/management response must match the serving commit; credentials and customer prose stay out of receipts. The administrator hook also proposes a distinct synthetic product-use record, checks that pending content is absent from facts, reviews its exact digest/version, accepts a correction, then retracts the corrected revision through ordinary profile commands. An uncertain mutation response is reconciled by its original request key without another mutation. This boundary demonstration leaves no current accepted fact of its own and does not supply the linked chain. These role and SDK reads are not the accepted cross-feature hosted journey catalog. The command deliberately exits unsuccessfully with an incomplete-catalog receipt after successful role reads until the remaining journeys are implemented. Do not use a preflight or role-read receipt to claim hosted acceptance, scheduled recovery, publication, readiness or permission to release.

Before release, bind all private gate receipts to the final source/catalog and actual deployment/configuration/schema. Run `npm run pilot:check -- --run <private-run-manifest>`; an ineligible result is a stop condition. Successful local tests cannot replace hosted checks, scheduled backup observation, independent operator exercise, model review or real internal/assigned-partner feedback. Resolve blocker feedback with a successful recheck; record any permitted deferral with its actual owner and follow-up. Obtain the actual mcteer decision for the exact eligible bundle and distinct merge authorization. Do not manufacture either from a script's actor field.

The role hook also exercises parked conversation creation, exact original-key replay, ownership reads, archive and restore using normal authenticated APIs. Actual database reads verify the synthetic workspace, active session, persisted ownership and archive state; they do not author domain state. Each role denies reads and archive writes for prior roles' test conversations. On interruption or a damaged creation response, cleanup locates only the original creation key under that exact actor/scope and archives it through the normal API before logout. No message is submitted and no native binding or provider call is admitted. Completed role boundary receipts are retained even if a later catalog stage fails.

Headless command-line WebKit then checks the actual parked UI and backing requests for all three role sessions in desktop/mobile and light/dark. It verifies reloads, synthetic workspace context, keyboard navigation, overflow, serious/critical accessibility findings and foreign-owner API/page denial. It blocks foreign-origin traffic and mutations, records no screenshots, traces, cookies or customer bodies, and closes every browser context. This is a J002 boundary subset: streaming, resume/stop, membership invalidation, cross-workspace checks and the other core journeys remain necessary. These checks never turn the runner's incomplete-catalog result into hosted readiness.

The administrator hook selects an ordinarily accepted delivery plan with its exact decision and active milestone baseline in the synthetic workspace. It verifies the same accepted head through the authorized plan API. A fresh support scope then proposes and reviews an unknown-readiness assessment, an open owned action, and its separately reviewed deferral. Unknown escalation routes remain unknown; no external ticket or handoff is claimed. The expansion hook requires a fresh hypothesis scope and unassigned account owner, performs normal owner assignment, proves that unknown benefit cannot be qualified, and exercises defer/reopen/dismiss/reopen with exact source/version/assignment previews. Existing support records or account assignments are not overwritten to obtain a pass.

The Product Gaps hook uses two explicitly synthetic customer-independent definitions and suspected observations, exact reviews, exhaustive merge/split mappings, a normally queued private report, both actual approved export formats and an explicitly unsent synthetic manual handoff record. Its report counts its own synthetic pilot customer within that workspace. A separately logged-in primary session proves those gap/report IDs are denied and their registry entries absent, then verifies exact logout; it performs no primary customer mutations. The report worker must complete under its existing configured authority and deadline. Polling preserves normal quotas, and export reads verify source commit, byte bounds and digests. Streamed gap export headers now include the actual serving commit while retaining per-chunk source withholding. None of these boundary receipts supplies real participant observations, implicit paid model/research/send/load authority, full hosted acceptance or a release decision.

After an authorized green merge, verify the deployed commit and apply required migrations/roles explicitly before exercising the scoped Production journeys, including Product Gaps and partner access. Record authenticated role-specific results and cold object reads against that deployment; a green CI or local page is insufficient. Keep the merged PR closed, delete only its associated local/remote feature branches, and verify README on main. If a Production journey fails, record failure, contain the affected scope and use a reviewed forward fix; do not mark the release complete or rerun destructive schema initialization. This runbook is an operational procedure, not evidence that an independent human has exercised it.

### Rehearse current credential denials with a legacy database copy

Capture a fresh minimized denial snapshot using the work-denial command above, then run the legacy safety-copy rehearsal with `--denial-receipt <private-snapshot-directory>/snapshot.json` appended. The proof must postdate the database backup and remain less than five minutes old when applied to the restored target. The reader verifies actual permanent retention, independent key binding, authenticated bytes and exact source scope; a receipt alone cannot authorize recovery.

The actual Production-copy rehearsal reapplied credential denials after explicit 055→057 migration and removed the disposable target. It revoked 17 restored sessions. Credential/grant reconciliation never grants authority or clears quarantine. This does not establish source/publication/replay/provider reconciliation, unlock eligibility or full hosted recovery.

### Owned old-runtime credential retirement rehearsal

For a disposable owned schema-079 target already locked at an exact recovery UUID/revision, run `npm run pilot:recovery:authority -- --retire-owned-runtime --input <private-input.json> --output <new-private-directory>`. The protected input contains `environmentId`, `recoveryId`, `controlRevision` and a separately selected 43-character random base64url `password`. Do not commit or paste it.

The command disables LOGIN on the legacy permission role, terminates its backends, and creates a separately bound replacement login inheriting the existing restricted grants. Exact repeats preserve the same credential; conflicts never rotate or adopt an existing role. It does not edit hosted environments, unlock recovery, or authorize a Production cutover. The actual owned command and five-case catalog passed. Hosted credential retirement and old-deployment HTTP denial must still be proven before pilot memberships are enabled.

### Read-only managed Workflow identity inspection

```sh
npm run pilot:recovery:authority -- --inspect-managed-workflow --source <private-source-config.json> --team <work-team-id> --auth-file <protected-vercel-cli-auth.json> --output <new-private-evidence-directory>
```

The explicit source contract selects Preview schema 038, 055, 057, 077 or 079, or Production schema 055, 057, 077 or 079, with verified unpooled TLS transport. Inspection is read-only at every supported schema; the separate managed inventory closure command requires schema 079 and its own finite closure authority. The command checks actual database owner/marker/schema and current work-project binding, reads only conversation/attempt identity and lifecycle metadata, and verifies each exact bound native ID through the managed Workflow provider. It repeats the application inventory after the provider reads and verifies the unchanged source and protected checkout. Provider bodies, model inputs/outputs, customer labels and credentials never enter the receipt. Missing provider runs remain explicitly unavailable; invalid or over-bound inventories fail. It creates no native run, model call, provider write, membership, retry, authority grant or unlock. Its private receipt is an inventory, not a verified recovery checkpoint.

The installed eve [execution model](../node_modules/eve/docs/concepts/execution-model-and-durability.mdx) supports a settled deployment handoff that preserves the original session ID and stream. It does not move live turns, pending input/authorization, queued messages or active tasks/subagents. Target checkpoint validation can fail and leave the original deployment executing the delivery. Recovery therefore requires independently current source/authority checks, actual settled-work and checkpoint validation, original-stream/deployment availability, and exact provider/paid/send reconciliation before relying on handoff. A provider run marked `running` alone proves none of these conditions. Do not rerun the initial agent workflow as a substitute for a recovered conversation.

### Work capture restore rehearsal

The cold work-capture inspector retrieves ciphertext and its authenticated metadata
from the separate archive, deriving its key from the separately retained encrypted
operator master. Keep its output and an independently retrieved 32-byte archive
key in separate private directories. Key retrieval and archive inspection do not
restore a database or authorize application access.

Within the owning 016 disposable PostgreSQL runner, use:

```sh
npm run pilot:recovery:check -- --restore-work-isolated --environment <captured-environment> --candidate <private-candidate.json> --bundle <private-candidate.encrypted> --key-file <separate-private-key> --output <new-private-output>
```

The target must be a fresh, locked schema-079 PostgreSQL 18 database in its own
disposable cluster. The command authenticates the complete archive before SQL
restoration, restores the public application schema without copied grants, checks
the exact migration ledger and accepted-content digest, and restores all six
private-object namespaces into a new local store. Both runtime roles remain
NOLOGIN with connection, schema, function and table access revoked. Restored
sessions, MCP credentials and partner grants are revoked; seven required scopes
remain quarantined. Source ciphertext and original object bytes are retained.

This rehearses application data recovery. Provider and legacy database schemas,
runtime grants, current authority, permanent replay reconciliation, managed
Workflow recovery, hosted service and full RTO remain separate requirements.
The command cannot start, unlock, promote or modify Production/Preview. Failed
verification retains the database lock and never applies runtime grants.

Recovery request fences in the unreleased 057 migration cover INSERT and UPDATE,
including report provider keys. Runtime updates cannot resume a fenced request.
An actual database owner may update a recovered row only while its recovery
control is locked, so reconciliation can retire work without weakening runtime
protection. New request identities remain subject to ordinary admission; they do
not clear any recovery quarantine.

Native SDK run pinning and explicit rerun boundaries are documented by [Vercel's versioning guide](https://github.com/vercel/workflow/blob/main/docs/content/docs/v5/foundations/versioning.mdx). The eve session handoff is its own framework contract; a generic fresh SDK run does not preserve the eve session stream. No inspector result above authorizes one.

### Resolve quarantines after complete current verification

After the owner verifier has recorded a fresh complete verification for the exact locked restored target, run `npm run pilot:recovery:authority -- --resolve-quarantines --environment <exact-marker> --recovery-id <recovery-uuid> --expected-revision <locked-revision> --verification-id <existing-verification-uuid> --output <new-private-directory>` using the separately supplied protected owner connection. The command accepts an existing verification identity; it cannot manufacture missing provider, integrity, denial, replay, or health proof from operator labels.

Resolution appends immutable receipts and retains every original quarantine. It checks the current content and authorization state before writing; missing, partial, stale, foreign or changed-state proof leaves the holds unresolved. Exact repetition preserves receipts. This command never opens service. The separate explicit `pilot:control` open transition must name the verified bundle and recheck freshness, all scope resolutions, drain and unchanged current state. Current actual Production rehearsal receipts still have incomplete verification and cannot pass this command.

### Source-independent work archive rehearsal

Once an actual matched work archive exists, use its protected destination and
separate key reference to run the composed cold rehearsal:

```sh
npm run pilot:backup -- --rehearse-work-capture --destination <private-destination.json> --key-reference <private-key-reference.json> --archive-id <archive-uuid> --environment <captured-environment> --output <new-private-output>
```

This command retrieves the archive and master independently, derives a temporary
key outside the evidence directory, restores into a new owned PostgreSQL 18
cluster, verifies application content and all six private-object inventories,
quarantines authority, and destroys its disposable target and temporary key.
It rechecks the separate project/archive bindings and protected source state.
It does not access or restore over the live source database. A successful local
rehearsal still excludes provider/legacy schemas, runtime grants, current authority,
managed Workflow, service availability and full RTO.

Current denial snapshots use `pilot-denial-replay-snapshot-v6`, including workspace
classification, partner organization status, and membership role/revision. Recovery
never reactivates a disabled principal, workspace, organization or membership.
Restored authority that differs from independently current metadata is deactivated,
so a revoked session cannot be replaced by a fresh sign-in through a stale account.
Older snapshots lacking workspace/organization proof keep restored authority denied.
Historical captured application facts and decision receipts remain intact.

Recovery records immutable holds for every restored, unsettled learning
reservation, blocks its old budget, and retires active learning attempts without
inventing a provider dispatch or charge. Both database enforcement and maintenance
exclude held reservations from automatic undispatched release. Existing actual or
explicitly reviewed conservative settlements remain the accounting path; a
settlement cannot restart the recovered attempt or erase its recovery hold.

Every restored service budget is also revoked, including budgets that appear unused. Charges made after the capture may be absent from its ledger. Their original authorization, cap, expiry, reservations and settlement receipts remain intact; revocation cannot be reversed. Runtime workers cannot automatically release a reservation under revoked authority. Separately evidenced owner accounting remains available, and does not reopen the budget. Establish the applicable reviewed authority before enabling further paid service work.

### Bounded managed Workflow retirement

Install the independent archive migrations `neon-archive-007-native-closure.sql` and `neon-archive-008-closure-source.sql` explicitly under archive-owner authority before using the closure command. The latter refuses to invent source provenance for existing observations. Neither runs from a request handler. Current work archive installation is separate from Turas's primary database. Cancellation intents and terminal observations retain minimal immutable replay metadata; neither stores prompts, message bodies or provider credentials. Both tables are capped at 10,000 rows, and new records are withheld at the independent database's 400 MiB bound.

Prepare a protected `pilot-managed-workflow-closure-input-v1` file containing the current Git commit, source and catalog digests, a capture timestamp no older than five minutes, and at most 50 exact run bindings. Every binding names the same work project/team, environment, recovery ID and locked control revision, plus its run ID, original deployment and one of the four installed eve Workflow definitions. Derive bindings from fresh lazy provider metadata; never resolve or persist native input/output bodies.

```sh
npm run pilot:recovery:workflow -- --close-managed-workflows \
  --source /protected/production-source.json \
  --destination /protected/independent-archive.json \
  --input /protected/current-run-bindings.json \
  --auth-file /protected/operator-auth.json \
  --runtime-scope /protected/exact-hosted-scope.json \
  --session-file /protected/exact-operations-session.json \
  --output local-artifacts/016/exact-closure-attempt
```

The source must already be schema 79, locked at the exact supplied revision, drained, and have the legacy database login disabled with no legacy backends. The command verifies current work project/archive bindings and holds the owner capture fence during the bounded batch. It checks the dedicated owner connection before every provider operation and before retaining terminal proof; loss of that connection stops further requests and leaves the independent intent held. Each cancellation intent commits durably in the independent archive before the single provider request. Existing intents permit reconciliation reads only. A cancelled response alone cannot establish closure: a subsequent lazy provider read must confirm the same run/deployment/definition is terminal. An interrupted or uncertain request remains held; retain the lock and reconcile rather than sending another cancellation.

The provider paths and methods follow [Vercel Workflow's run adapter](https://github.com/vercel/workflow/blob/main/packages/world-vercel/src/runs.ts). All requests forbid redirects/retries and bound each request to ten seconds and its response to 1 MiB. Terminal observations bind the source commit, source digest and catalog digest. A receipt for one batch does not establish closure of every provider run or old deployment, settled model/send effects, recovered conversations, full service recovery, or permission to unlock. Complete fresh project-wide inventory and separate paid/send reconciliation remain required. Production's schema-55 target has not been passed to this command.

## Inspect independently retained permanent request fences

`pilot:recovery:authority -- --audit-work-request-fences` reads the current encrypted
work-archive snapshot through the independent destination and cold key, then checks
an exact locked schema-079 owner target. Supply `--environment`, `--recovery-id`,
`--expected-revision`, `--denials` (the retained snapshot receipt), `--destination`
(the protected archive configuration), `--backup-captured-at` and a new private
`--output` directory. It accepts no raw-snapshot healthy flag or supplied context
hash. Stale, older-schema, foreign, unretained or unauthenticated snapshots fail.

The audit inspects the actual authored replay function, row trigger, current unique
indexes, immutable fence protection, runtime write denial and every captured or
inherited request-key fence. It writes a source-bound request-fence receipt without
changing application data, resolving quarantines or opening service. Missing guards,
changed functions and incomplete keys fail. Temporary decrypted bytes and cold key
buffers are removed on every exit. This proves the inspected request fences only;
current source/access denials, uncertain sends and charges, managed workflow closure
and complete owner verification remain separate required recovery work.

## Apply independent denials to an owned isolated restore

After isolated restore, retain its locked recovery UUID/revision and provide the
owning disposable cluster's explicit owner configuration. Its owned database name
and Docker ownership label remain the target identity; `--environment` names the
actual restored source marker. Never replace that owner connection with the live
source connection.

```sh
npm run pilot:recovery:authority -- --reconcile-owned-work-denials \
  --environment <restored-source-marker> \
  --recovery-id <locked-recovery-uuid> --expected-revision <locked-revision> \
  --denials <private-retained-snapshot-receipt.json> \
  --destination <private-independent-archive.json> \
  --backup-captured-at <exact-original-capture-timestamp> \
  --output <new-private-evidence-directory>
```

The command rejects hosted/unowned connections and checks actual owner, marker,
schema and locked revision before contacting the independent archive. It retrieves
and authenticates current encrypted bytes and their independently retained key,
requires the complete schema-079 v7 inventory, applies credential/grant/source/
publication denials and permanent request fences, then audits actual database
functions, indexes, triggers and immutable protections. Proof older than the backup
or five minutes, unavailable bytes and incomplete inventories cannot authorize
mutations. It never grants authority, clears quarantine, starts providers or opens
service. No primary or Preview database is changed by this owned-only command.

`denials-applied.json` records committed denial changes before the audit. If a
subsequent audit fails, those denials stay committed and `failure.json` records
`denialsApplied:true`; there is no successful reconciliation receipt. Keep the lock,
correct the actual guard defect and repeat the complete command with fresh proof
and a new output directory. Repetition cannot revive credentials or repeat effects.
Temporary decrypted files are removed on both success and failure. Successful
`reconciliation.json` establishes this isolated denial/fence step only; unknown
charges/sends, managed Workflow, full service verification and RPO/RTO remain
separate requirements.

## Human operator and participant walkthrough

`mcteer` is the nominated human operator/reviewer for the next exercise. This is
an assignment, not a completed observation. In an owned isolated environment,
follow the capture, cold restore, current-denial application and failure/resume
commands above. Record your actual start/end times, which step was unclear, the
observed locked/denied behavior and whether another operator could repeat it.
Keep observations and supporting receipts private under `local-artifacts/016/`.
An unresolved quarantine or unavailable required scope remains a blocker; do not
test unlock by bypassing the owner verification path.

For hosted pilot feedback, use distinct current internal and assigned-partner
member identities in the synthetic pilot workspace. Follow the linked journey
catalog in [pilot journeys](../specs/016-pilot-hardening/contracts/pilot-journeys.md)
with normal proposals, reviews and explicit grants. Each participant supplies
their own observed result and difficulties. Bind each observation to its journey,
time and exact deployment; assign an internal follow-up owner and severity.
Record the protected `pilot-feedback-record-v1` input with
`npm run pilot:feedback -- --environment <exact-marker> --input <private-input.json>
--output <new-private-directory>`. Blockers require correction and an evidenced
recheck; other dispositions require an owner. Automated synthetic outcomes and
operator nomination cannot supply participant observations or release approval.


## OrbStack and generated-data closeout

At implemented-feature closeout, inventory the feature's owned OrbStack containers,
volumes and image tags, and generated local environments. Remove unnecessary owned
containers/volumes, unused owned images and temporary copies after their evidence
has been captured. Verify ownership labels and active references before removal;
record the exact cleanup inventory privately. Preserve the selected database and
private stores, `.env.local`, the root workflow directory and model, required
recovery/acceptance evidence, permanent denial/replay records and unsettled paid-work
journals. Backup expiry follows its existing managed policy. Do not use a global
Docker prune or delete all local artifacts: unrelated services, selected stores
and required recovery authority may share the host.

The PostgreSQL dump/restore client cleanup verifies the actual immutable owner
label and exact container identity, then removes that container with its anonymous
volumes. Docker's named volumes and bind mounts are retained. Ownership/inspection
or removal failure remains an error; absence must be positively recognized. The
real PostgreSQL 17/18 cleanup check verifies anonymous volume removal and continued
named-volume existence before removing only its explicitly created test volume.

The private hosted configuration uses `pilot-hosted-configuration-v1` and binds the exact environment marker, project/team, private Blob store, three immutable OCI images, enabled Sandbox dispatcher and unchanged job resource limits. The runner checks the actual authenticated administrator diagnostic readback before its first journey write. The diagnostic exposes an allowlist of configured identities only: it never exposes tokens or proves provider permission, file processing, backup health or acceptance. Missing or differing configuration blocks the journey. Preview provisioning and any additional cost authority must be reviewed separately; Production release remains a separate decision.

Fresh hosted configurations require an explicit `maximumDispatches` in `TURAS_PILOT_JOB_COST_JSON`, also bound into the `pilot-sandbox-bounds-v1` pricing digest. Cost admission serializes on the existing budget row and counts every held or completed reservation; only a never-dispatched release frees count capacity. Settling a cheaper job cannot silently admit more jobs than the approved count. Existing configurations without this field retain their original digest and accounting, but cannot satisfy the fresh hosted configuration readback requirement.

Copy and capture must derive required live originals from the matched database ledgers and verify their exact physical keys, sizes and digests. Equal empty stores are insufficient when a required original is missing. Required metadata does not grant source eligibility after recovery: independently current denials still apply. The copy primitive supports explicit object, byte and page bounds across all inventories, retaining originals on failure. Hosted copy/cutover remains a separate admitted operation.

For the separately authorized Preview safety copy, use an explicit Preview source manifest and direct unpooled verify-full owner connection. The capture supports source schema 38, 55 or 57, independently verifies exact platform/owner/marker/ledger binding, and emits a target-bound v3 encrypted context; Production remains restricted to 55/57. Its separately retained key uses the independent operator project’s Preview environment. The existing restore-database-safety-copy command rehearses exact context/content/ledger in a matching disposable owned target, migrates explicitly to 57 and keeps every existing runtime denied and recovery quarantined. Old v2/055 records remain readable. Database-only safety capture/rehearsal does not certify private objects, Workflow resumption, full service recovery, schema deployment or readiness.

The Preview-only hosted validator requires four explicit private inputs: `--scope`,
`--run`, `--configuration`, and `--authorization`. Its configuration readback binds
actual budget ID/scope/pricing identities before normal hosted source/report work.
The linked infrastructure check refuses a configured embedding key; this plan
adds no model allowance. Failed runs with potentially dispatched jobs record
unknown paid-call counts and require scoped cost-ledger reconciliation. Completion
of this partial chain does not satisfy the full hosted catalog or recovery gates.

Automatic Git pushes count as real Preview deployments. The 016 branch disables
that automation in `vercel.json`; verify the provider inventory after a push.
The approved two-deployment count has been exceeded by one automatic deployment,
and its original allowance is exhausted. Retain the actual retrospective record
and build envelope; do not call unknown provider charges zero, reset the approval,
or manually deploy until a concrete additional deployment is authorized after
implementation/recovery prerequisites pass.

Hosted Blob operations require `VERCEL_BLOB_RETRIES=0`. The pinned SDK otherwise
retries up to ten times; unknown effects must not initiate another paid operation.
The configuration diagnostic reports the zero-retry value and validation compares
it before writes. Original uploads use the same prepared capability, narrowly
issued client token and authenticated finish as the UI; no store-wide credential
is passed to the uploader. Workforce originals/located cells remain separate from
customer retrieval and shared knowledge. The linked validation chain requires
six admitted program jobs (source scan/parse, workforce scan/parse, two renders),
within the unchanged 32-job total. This partial chain is not full catalog proof.

## Hosted private-store copy and configuration readback

The operator path supports a finite hosted copy without deleting the retained
source or opening service. Actual Blob acceptance still requires the admitted
hosted run; isolated local-adapter tests prove only the shared copy mechanism.

Prepare a private `pilot-storage-cutover-plan-v1` manifest using
`lib/contracts/pilot-storage-cutover.ts`. Bind the exact source commit/digest,
environment, Preview/Production target, origin, distinct source/destination
stores, full expected hosted configuration, existing Blob budget/scope/pricing
and complete upper-bound reservation. Set finite object/byte limits and expiry.
Keep credential values outside the manifest. The original store stays readable;
rollback means keeping service locked and re-copying verified retained originals
under a new admitted operation after accounting, never an empty hosted local store.

1. While operational control is open, provision only an already authorized,
   applicable Blob budget with `pilot:cost`. Then run
   `npm run pilot:storage:copy -- --admit-hosted --plan /private/plan.json --output /private/admission`.
   This durably holds the entire ceiling before any provider IO. Repeating an
   admitted operation cannot dispatch it twice or reset its cost hold.
2. Use the explicit control/release procedure to quiesce, drain and lock the
   exact environment, and deploy the target configuration while it stays locked.
   Use eve for the deployment. Retain the source store and the admission receipt.
3. Supply the exact owner connection and environment, a current mcteer session in
   `TURAS_STORAGE_ADMIN_COOKIE`, and `VERCEL_BLOB_RETRIES=0`. Supply source/destination
   credentials separately through `TURAS_STORAGE_SOURCE_BLOB_TOKEN` /
   `TURAS_STORAGE_DESTINATION_BLOB_TOKEN` or the corresponding `_OIDC_TOKEN`
   variables. The CLI resolves each origin through the authenticated platform
   before attaching a cookie; redirects and another commit/project/team fail.
4. Run `npm run pilot:storage:copy -- --copy-hosted --plan /private/plan.json --output /private/copy --reservation <uuid> --recovery-id <uuid> --control-revision <revision>`.
   The command checks owner/schema/cost identity, takes the existing exclusive IO
   fence, checks required original ledgers and full inventories, copies immutable
   bytes and repeats parity with fresh clients. Authenticated configuration
   readback must match before and after, including the same actual deployment.
5. Retain the successful receipt and original source inventory. The full cost
   ceiling remains held as unknown until an explicit applicable `pilot:cost`
   accounting receipt; a conclusive copy is not a provider invoice. Failure also
   preserves the hold and service lock. A new paid attempt requires reconciliation
   and new applicable authority; do not repurpose or reset the old reservation.
   Complete the existing required-service/recovery verification and explicit
   unlock procedure before allowing writes. A copy receipt never unlocks service.

Before any configuration change, retain a private allowlisted readback of the
original deployment/commit and storage/executor settings with the original store
inventory. A copy plus destination readback is not the complete cutover receipt:
release verification must also retain that original readback and prove required
service after explicit unlock.

Executable forward rollback before unlock uses the same copy command: retain the
lock and use a separately budgeted exact rollback plan/operation admitted before
the initial lock. Prepare that bounded fallback alongside the forward operation;
an unknown forward charge cannot fund it or reset its allowance. Reconcile any
old reservation explicitly before reusing its budget. Deploy the corrected destination configuration with
eve, and execute `--copy-hosted` against the retained original bytes. If the old
source was Blob, a reverse migration can instead bind the current complete Blob
store as source and the retained old Blob store as destination; the command
requires exact digest parity and rejects conflicting destination objects. After
service has accepted new writes, do not use a stale pre-cutover source: capture
and verify the complete current destination first, then use that current inventory
for the reverse copy. Preserve both stores and both accounting histories throughout.

If no applicable rollback reservation was admitted before locking, keep service
closed and preserve both stores. Do not briefly open service merely to obtain
cost admission or bypass an unknown charge. An unavailable rollback envelope is
a release blocker, not permission to reuse a dispatched operation.

### Locked recovery read probe and original output allowance

The internal owner probe requires an explicit caller-owned transaction, a live
credential-matched mcteer session, exact recovery UUID/revision and a deadline
within five minutes. It holds the operational fence and authority rows for the
transaction, grants only governed reads on that same client/actor, and removes
the capability when its callback ends. It does not open public login or allow
writes. Revoke temporary sessions before calculating the final recovery-state
digest. Normal authenticated HTTP/WebKit verification after explicit unlock
remains required; this helper alone produces no recovery verification receipt.

Ordinary chat accounting preserves the authenticated immutable conversation
baseline and counts each operation ID once across current rows and retained
recovery holds. Unknown usage consumes its full original ceiling. Admission
uses the original 20,000-token limit under the conversation lock; it neither
creates a fresh allowance nor revives a captured native request/attempt.

### Complete managed-run metadata traversal

`--inspect-managed-workflow` now requests every run page without workflow/status
filters, using lazy metadata in the explicit source environment. It performs two
complete traversals, bounded to 10,000 runs and 200 pages each, and checks their
run/deployment/workflow/status inventories agree. A missing conversation binding,
duplicate row, non-advancing cursor, incomplete page contract, changed inventory
or exceeded bound fails the command. Provider-only child/orphan runs are retained
for reconciliation. Native input/output bodies are discarded before receipts.

The operator adapter follows the canonical provider [run-list
implementation](https://github.com/vercel/workflow/blob/main/packages/world-vercel/src/runs.ts)
and [pagination contract](https://github.com/vercel/workflow/blob/main/packages/world/src/shared.ts),
checked 2026-10-17. Actual hosted API compatibility remains a separate check.
Repeated pagination is not an atomic provider snapshot. The inspection never
cancels a run, closes an old deployment, settles a charge, resumes work or grants
recovery readiness; all of those proof boundaries remain explicit.

### Physical restore checkpoint and current grant reconciliation

An isolated work restore authenticates the encrypted candidate again and measures
the restored ledger, accepted database content and all six private object namespaces
before quarantine changes authority. Measurement acquires both recovery fences and
table locks before reading current state. It binds the actual owned database
cluster and private store directory. Serialized receipts cannot substitute for the
in-process checkpoint; later verification rechecks the target and object bytes.
Source grant provenance and the closed target's runtime grants are recorded
separately. This checkpoint does not establish service health or unlock readiness.

`--restore-work-isolated` accepts paired `--denials` and `--destination` options
for an independently retained current denial archive. The reader authenticates
that archive, binds it to the candidate capture time and rechecks freshness in the
locked owner transaction. Only existing unchanged current partner grants survive.
Newer revocations and permanent replay fences apply atomically after restored
sessions, MCP credentials and effects are retired. No grant is created or
reactivated. Without that authenticated proof, quarantine revokes every restored
grant. A failed reconciliation rolls back the entire quarantine transaction and
leaves global admission closed.

The request-fence audit also measures current state after its authority fences and
table locks. Its receipt includes that digest; a later mutation requires a new
audit. The receipt alone cannot resolve quarantine or open service.

Canonical profile probes retain the original authenticated actor through nested
research reads; separate research metadata must match that exact session and
workspace. A successful actor lock alone is not proof of a successful profile
read. The owned probe requires the actual accepted profile revision in the result.

### Authenticated reads after owned quarantine

```sh
npm run pilot:recovery:authority -- --probe-owned-service --scope <private-current-scope.json> --credential <private-credential.json> --output <new-private-directory>
```

The strict scope contract is defined in
`scripts/pilot-owned-recovery-read.ts`. It binds the current source commit and
digests, exact environment/recovery/revision/workspace/customer, accepted profile
revision IDs, accepted plan/revision pairs and an expiry within five minutes.
The separate private credential file uses contract
`pilot-owned-recovery-credential-v1`, `loginName: mcteer` and the configured password.
Both files require a direct private directory and mode 0600. Never put the
password in CLI arguments, receipts or commits.

The command accepts only the exact selected owned local cluster and a locked
schema-079 target. It checks the actual configured credential and live admin
membership, creates a short-lived transaction-local session, performs canonical
reads and revokes the session before committing. Callback SQL failures roll back
the read savepoint and retire the session; command failures roll back the whole
transaction. SQL and operator deadlines remain bounded by the original expiry.
Receipts contain response digests and identities, never credentials or profile
prose. All seven quarantine scopes remain unresolved. This partial profile/plan
diagnostic proves neither complete required service nor authenticated HTTP,
managed Workflow reconciliation or unlock readiness.

For exact current publication reads, scope contract
`pilot-owned-recovery-read-scope-v2` adds a nonempty `acceptedReports` list of
`{id, revisionId}` pairs. It permits explicitly empty profile-revision and plan
lists for a report-only diagnostic; the customer profile is still authorized and
read. Version 1 retains its original nonempty profile/plan requirements. Version 2
receipts bind the actual current publication ID and validated report digest.
Neither version infers that omitted required service is healthy.

Current report verification uses the normal authenticated browser read and
requires published/current state and the exact latest publication revision.
MCP's separate narrower projection is not used to judge internal service health.

### Finite complete managed-run inventory closure

After the exact source is schema 079 and locked, the read-only managed inspection
command emits `closure-plan.json`. Its identity digest binds every enumerated
run/deployment/workflow name without binding the status that cancellation changes.
It records the exact source commit/digests, target/project/team/environment,
recovery UUID/revision, observed count and page/run bounds, and a fifteen-minute
expiry. Open or historical-schema inspection never emits a cancellation plan.

```sh
npm run pilot:recovery:workflow -- --close-managed-inventory --source <private-current-source.json> --destination <private-independent-archive.json> --input <inspection-directory/closure-plan.json> --auth-file <protected-operator-auth.json> --runtime-scope <private-exact-hosted-scope.json> --session-file <private-exact-operations-session.json> --output <new-private-directory>
```

The command requires committed source and retired legacy login admission. It
re-reads all provider metadata before dispatch, validates every workflow kind,
and processes at most 50 runs per batch using the existing independently durable
once-only intents and terminal observations. Each batch has an immutable private
receipt. A repeat with the same identities reads terminal state and retained
receipts; an existing uncertain intent never authorizes another cancellation.
Use a fresh output directory on resume, retain all earlier receipts and obtain a
fresh read-only plan if its original expiry passed. This does not renew paid
operation authority or release any unknown charge.

A final complete repeated traversal must contain the same identities, unchanged
application bindings/source state and only terminal states. New identities,
source/control drift, unsupported workflow names, missing archive, a lost owner
connection or uncertain cancellation stops the command. New runs are never
automatically added to the cancellation set. A verified empty inventory still
requires the actual independent archive contract. Enumeration closure is not
proof that old deployments cannot create future work: old-deployment retirement,
paid-effect reconciliation and full recovery remain separate gates. The command
never opens service, deletes deployments or resumes a captured turn.

Both cancellation modes require an exact `pilot-hosted-scope-v1` runtime scope
and a private `pilot-hosted-operations-session-v1` file containing `origin`,
`cookie` and optional `protectionBypass`. The cookie must be the real
`__Host-turas_session` cookie from an authorized mcteer operations session
established before locking. Protect these files with mode 0600; never place
cookies, passwords or bypass credentials in CLI arguments or receipts.

Before sending that cookie, the command verifies the deployment and alias through
the platform API. The authenticated operations status must then identify the same
committed source, locked schema-079 environment/recovery/revision and database
endpoint as the owner connection. A fresh endpoint digest excludes passwords and
role names; the observation must separately show a direct runtime login, rather
than an owner connection using SET ROLE. The complete-inventory command repeats
this binding before every batch and after closure. An unavailable protected
configuration value or a supplied healthy JSON document cannot replace this
authenticated observation. These checks do not open service.


### Complete project deployment metadata before retirement

The existing `pilot:recovery:authority -- --inspect-managed-workflow` operator now
also reads the complete selected project's deployment collection across both
Preview and Production. It uses a fixed timestamp cutoff, up to 100 pages/10,000
identities, bounded metadata bytes and two equal complete traversals. The provider
omits workflow-target headers and branch/state/target filters for this collection.
Private receipts discard unrelated metadata and list referenced deployments absent
from the collection as unlisted, without claiming they were deleted or retired.

This read-only inventory does not protect deployments, close aliases, revoke old
credentials, cancel workflows, settle paid effects or approve retirement. Existing
schema 079/owner/runtime-binding prerequisites still gate any cancellation plan;
schema 077 inspection remains read-only with no closure plan. A stable collection
is not an atomic provider snapshot or proof that an old deployment cannot admit
work. `oldDeploymentsClosed`, `deploymentProtectionVerified`, `retirementAuthorized`
and `restorationReady` remain false. Preserve current active deployments and all
original evidence until the separately verified retirement procedure is complete.


### Disabled-first pilot login

`TURAS_PILOT_LOGIN_ENABLED` defaults to disabled. Missing/`0` keeps the primary
native login form and rejects direct pilot-login requests on the server. After
schema078/079, historical-deployment admission protection and target-bound
workspace/membership verification, explicitly set it to`1` for the admitted target.
The selector creates no membership or grant. Disabling new pilot login does not
revoke an existing bound session: revoke the session/membership through the normal
access path when that is required. Primary login remains independent. Owned pilot
runners enable this flag only inside their isolated generated environment.


### Exact-target hosted execution authority

The original `pilot-preview-infrastructure-user-authorization-v1` remains
Preview-only with its original48-hour/$10/32-job envelope and digest. It cannot
be promoted into Production or have its expiry reset. For a separately approved
execution, `pilot-infrastructure-user-authorization-v2` binds the actual instruction
reference, exact project/team/environment/target and source/catalog identities,
48-hour window, partitioned finite cap, at most32Sandbox jobs, two concurrent jobs,
300-second job deadline, two deployments and one private store. Production requires
its own explicit Production target and permission. Model allowance, billing changes
and automatic top-ups remain excluded.

A proposed private JSON file is not user approval. The operator records an actual
attributable instruction before provisioning the corresponding immutable budget.
The hosted runner rechecks the exact authorization bytes/expiry, active synthetic
workspace and open target, and matching database budget authorization/scope/pricing
identities. It rejects unknown charges, exhausted budgets and dispatch counts before
calling paid adapters. Each job still uses normal serialized reservation admission.
The new contract never modifies or settles old budgets, charges or unknown holds.

### Continuing an expired evaluation authorization

The quality controller never edits an original approval or starts a replacement
allowance to avoid an expired journal. If the owner explicitly approves a new
time window for its remaining allowance, retain that attributable instruction in
a private `pilot-quality-continuation-v1` record. Bind its UUID, original budget
UUID, exact canonical `ledgerRoot`, `originalAuthorizationDigest`, current
`previousAuthorityDigest` and `journalHeadDigest` from the original ledger's
`currentAuthority()` result. Bind the final `sourceCommit`, `sourceDigest` and
`catalogDigest`, `userInstructionReference`, `recordedAt` and `expiresAt`.
The prior authority must have expired; the new window is at most24 hours.
Proposed JSON is not approval. Never populate an approval reference from an
assumption that permission persists beyond an explicitly bounded expiry.

Run the ordinary complete `pilot:quality:live -- --live` command with its original
`--authorization` and original `--budget-usd` cap, adding both
`--continuation /absolute/private/approved-continuation.json` and
`--budget-ledger /absolute/path/to/the/original/journal`. All existing images,
current complete deterministic proof and current native preparation inputs remain
required. A continuation cannot create a missing journal. A003 step authorization,
when needed, must bind the effective continuation digest and its exact expiry.

Under the existing accounting lock, the controller appends a chained continuation
event; it does not rewrite authorization or earlier events. It rejects stale
heads, copied roots, changed original identities, unapproved fields, future or
expired windows, and any pending or unknown dollar/credit dispatch. Caps,
historical charges, provider generation identities and credit dispatch counts
remain cumulative. The new authority invalidates the old attempt/runtime and
requires a fresh complete source-bound attempt. Reusing the identical current
continuation does not append it twice or extend its expiry. Source corrections
outside its exact scope require separately applicable authority. No continuation
settles an unknown charge, releases a reservation, tops up a cap, changes billing,
changes the selected model or authorizes hosted infrastructure.
