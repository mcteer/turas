# Recovery, Lifecycle and Operational Acceptance

## Full inventory and backup boundary

Inventory all current tables and feature manifests, artifact staging/originals,
workforce files, report/gap objects, derived indexes/caches, workflow backend,
configuration/key **references**, versioned parser/renderer images and scanner assets.
An absent required store/backend/key has state blocked. An empty store requires a
verified inventory; it is not inferred from no fixture records.

The owner operation records source marker and exact versions, enters `quiescing`,
stops new work and drains/cancels active leases with bounded reconciliation. Reach
`locked` before capture. Never kill an uncertain provider/send and silently mark it
unperformed. Capture database plus immutable object inventory at one proven boundary;
record any consistent backend checkpoint and its semantics. Unmatched files,
in-flight uploads or unaccounted writes invalidate the snapshot.

Use the server-compatible pg_dump/pg_restore version, verify-full transport and
explicit roles/grants on restore. Key availability is tested without recording keys.
Encrypt completed backups under a separately controlled operator key and retain an
independent copy outside the source failure domain. New 016-managed backups run
12-hourly and expire at seven days; overdue >24h blocks the RPO claim. Do not delete
older operator archives under this rule. Test encryption restore and expiry on owned
copies. Backups are private even when they contain only synthetic pilot records.

Managed Workflow may not support a database-style export/restore. Record its actual
supported capability. Accepted application state remains authoritative in Postgres
and durable object storage; incomplete conversations/jobs are reconciled to explicit
interrupted/unknown status and new sessions only after current authority and paid/
send receipts are checked. Never claim uninterrupted native-turn restoration unless
it is actually proven. If a required accepted record exists only in an unrecoverable
workflow store, the full recovery gate is blocked and that persistence defect must
be corrected before readiness.

## Restore and prevent resurrection

Restore only to a separately identified owned target, isolated from user traffic,
provider dispatch and production aliases. Set recovery lock before starting any app,
eve or worker process, regardless of the snapshot's prior control value. Compare
source/target identities; refuse self-restore, unexpected schema or unowned target.

Restore matched bytes and schema, apply forward migrations/grants explicitly, then
verify inventory and content digests. Reconcile a separately protected current
manifest of revocations, withdrawals/deletions, expired grants, permanent request
receipts, exact report-send states and paid native attempts newer than the snapshot.
Bind its watermark and timestamp; a snapshot-derived copy is not current proof.

If current state is unavailable, revoke restored sessions and MCP credentials,
quarantine affected sources/outputs/grants, stop uncertain external/paid attempts
and keep those scopes closed. Never silently accept reconstructed facts or blindly
replay jobs. A conservative restricted recovery can prove denied service, but cannot
pass the full ready gate for a required quarantined workflow. Operator review or
current provider reconciliation must resolve it first.

Unlock is owner-only, exact-revision, explicitly requested and contingent on current
schema/grants, integrity, denial and replay verification. Cleanup/reconciliation
runs under its own bounded authority while locked; ordinary UI/native/MCP reads and
writes remain denied. The backup command never promotes a target or changes DNS.

A fixed maintenance profile endpoint may perform canonical reads while locked
only with an actual owner-issued admission and its separately bound live mcteer
session. It binds the exact database endpoint, release/deployment, workspace,
customer, recovery UUID/revision, expiry and finite request ceiling. Runtime may
reserve requests but cannot create or alter admission identity. Every phase takes
the recovery fence before admission/session row locks. Whole-read deadlines and
post-read authorization apply; teardown revokes both admission and session.
Ordinary login/routes and all domain writes remain closed. The current issuer is
owned-drill-only and covers profiles; it is not complete hosted service recovery.

## Required recovery cases

- Empty initialization and 055→078→079 with exact migration manifest/runtime grants.
- Full matched snapshot with profiles, objects, plans, execution, reports, training,
  shared knowledge, learning and MCP. Verify content/history, not merely row counts.
- Post-snapshot session/MCP revocation, partner grant withdrawal, source deletion,
  publication invalidation, expiry and permanent replay records remain effective.
- Uncertain paid attempt and uncertain report delivery never dispatch twice.
- Wrong marker, missing object, changed digest, missing key, incompatible image or
  workflow checkpoint fails before serving traffic.
- Interruption during capture, restore, reconciliation, cleanup and unlock is
  resumable from exact receipts without widening scope or extending TTLs.
- Runtime cannot update control/unlock or DDL; locked UI/eve/MCP/dispatch denies.
- RPO measures accepted-work checkpoint age; RTO runs from incident start through
  integrity, authority, grants and authenticated restricted-service checks. Full
  pilot service must also have no unresolved required quarantined scope.
- Two scheduled backups ≥12h apart plus successful restoration of one ≤24h old
  establish observed cadence; one ad hoc release dump cannot establish it.

## Lifecycle matrix

Implement `docs/pilot-lifecycle.md` from the current governing policies inventoried
in [research](../research.md#r05--preserve-lifecycle-policy-verify-actual-placement).
For every class record stores/derivatives, authority to withdraw/delete, immediate
withholding, physical purge deadline, batch limit, worker placement, retry behavior,
minimal audit/replay retention and backup expiry. Accepted histories without a TTL
stay lifecycle-controlled; do not invent a global customer-delete feature.

Test before-cleanup withholding through browser/domain/Turi/jobs/exports/MCP;
then stop the worker, cross the expiry, restart and verify bounded idempotent purge.
Check missing Blob object, partial deletion, stale index completion, native retirement
failure and in-flight stream grant loss. Count payload removal and preserved fence
identities separately. Removing a source does not erase independently submitted
claims or typed private messages unless their own governing lifecycle requires it.

A deletion receipt reports `active removed`, `minimal audit retained`, `backup
expiry pending/completed` as separate facts. Never promise erasure from a retained
backup based solely on active-store cleanup. Restoration reapplies newer deletions.

## Health and load definitions

Critical maintenance class stale threshold is three missed scheduled intervals,
capped at 180s; a checker runs at least every 60s, making detection ≤240s. Existing
stricter conversation/feature readiness thresholds still apply. Success timestamps
advance only after a successful bounded tick. Backlog shows overdue count (bounded
at 1,000 plus truncated flag), oldest due age and safe failure category; no payload.
Validate alert/status observation and an operator incident response, not just emit logs.

Load runs in owned isolation: 250 synthetic customers, 10,000 eligible passages,
representative accepted/published records for all read classes, 25 authenticated
sessions (15 internal, 10 explicitly assigned partner), two warmup minutes plus ten
measured minutes. Report each class with ≥100 completed samples after warmup:
profiles, evidence/passage/citation, plans, execution, reports, support, expansion,
gaps, partner workspace/training, learning and MCP's five read categories.
Partner-disallowed classes use internal sessions only; denial probes are separate.

Each ordinary class p95 ≤2,000ms; each admitted MCP category p95 ≤1,000ms;
unexpected failures <1% overall **and** per class; no missing required samples.
Choose fixed request distribution before running and pace within existing actor/
workspace quotas. If quotas prevent 100 samples within ten minutes, extend only
quota waiting (report separately) up to a 60-minute total bound; otherwise fail the
workload completeness gate. Never reset quota state or omit slow/error samples.
Capture p50/p95/max, queue/quota wait, admitted latency, platform resource shape,
DB query counts and all failure categories. Local results do not prove hosted load;
Production checks are low-rate scoped journeys, never an unapproved load test.

Run bounded outage cases for database, Blob, sandbox launch, class failure, lease
loss, denied network, budget exhaustion and unknown cost. New paid infrastructure
checks require explicit cap/admission; deterministic runs spend zero provider dollars.
