# 016 Data Model and Invariants

No customer business entity is replaced. Add explicit operational metadata and
session/workspace isolation; keep file bytes in the selected private backend.
Implementation validates every boundary with strict schemas and database constraints.

## Fixed constraints

These exact constraints are referenced and repeated in implementation tasks.

| ID | Constraint |
| --- | --- |
| C01 | Contract version is `pilot-readiness-v1`; run, attempt, job, feedback and recovery IDs are UUIDs, and digests are lowercase 64-character SHA-256 hex. |
| C02 | Gate state is exactly `pass`, `fail`, `blocked` or `unverified`; missing evidence is never `pass`. |
| C03 | A run contains at most 128 gates, 512 receipts and 1 MiB of JSON metadata; each gate has exactly one selected complete attempt. |
| C04 | Private evidence files are regular non-symlink files with mode 0600 under an owned mode-0700 run directory. |
| C05 | Hosted receipts require deployment ID, deployed commit, canonical origin, environment marker, schema ledger digest and runtime-grant result. |
| C06 | Session membership, principal and workspace must match one active membership; absent selection means the existing primary workspace only. |
| C07 | Pilot workspace classification is immutable after provisioning; synthetic pilot publications and outcomes cannot enter primary results. |
| C08 | Object keys contain opaque environment, namespace and object identities; immutable bytes must match expected size and SHA-256 digest. |
| C09 | Upload capability is restricted to one staging path, declared size and at most ten minutes; it grants no read or overwrite permission. |
| C10 | At most two heavy jobs run per environment; each job has a durable lease, exact provider ID and a deadline no greater than 300 seconds. |
| C11 | Hosted jobs use nonpersistent isolated execution, denied network, no exposed ports and no application/provider credentials. |
| C12 | Operational samples retain no payloads, URLs, filenames or secrets and expire after 90 days; recovery and replay fences do not expire with samples. |
| C13 | New managed backups run every 12 hours, must be no older than 24 hours, and expire after seven days; existing operator archives are not auto-deleted. |
| C14 | Recovery mode is `open`, `quiescing` or `locked`; only an explicit owner operation can unlock after integrity and authority reconciliation. |
| C15 | A feedback item has a UUID, one journey, a named participant reference, severity `blocker`, `major` or `minor`, and a disposition with an owner. |
| C16 | The checker returns technical eligibility only; human approval requires an attributable mcteer decision bound to the exact scope and bundle digest. |

Catalog gate/journey/class IDs use the fixed catalog enums, not UUID validation.
Provider/deployment IDs are opaque non-secret strings (1–256 characters); Git
commits are full 40-character lowercase hex for this repository. These constraints
are validated with the foundational schemas, never interpreted as URLs/commands.

Existing tighter size, role, audience, quota, timeout and retention rules always
apply. Ten minutes does not extend an earlier intent expiry. The 300-second job
ceiling includes command execution; provider creation/transfer/cleanup must fit a
separate bounded dispatcher envelope of at most 360 seconds. Reject admission when
current platform duration/resources cannot honor this envelope. No hidden retries.

## Persistent application metadata

### Workspace and session (migration 078)

Add workspace classification `primary | synthetic_pilot`, default `primary`, and an
operator-owned pilot provisioning identity. A partial unique index permits one
active 016 pilot workspace per environment. Use real workspace/membership IDs, not
an in-memory fixture switch. All customer references in the pilot are synthetic;
normal reviews create accepted/published revisions with explicit synthetic labels.

Add compatible nullable session `membership_id` and `workspace_id` as a pair, with a composite foreign key matching
`memberships(id,principal_id,workspace_id)` (already available from 055). Backfill
only unambiguous primary membership; revoke ambiguous/unresolvable legacy sessions.
New code rejects unresolved legacy sessions and issues/resolves through the exact
selected membership. Complete legacy reconciliation and retire/protect old unbound
deployments before adding second memberships. Membership
revocation invalidates a session immediately; switching requires a new login/session
and does not transfer a conversation or grant. A new membership does not affect
existing sessions. Canonical reviewer principal identity stays unchanged.

Mark publication provenance with its origin workspace/classification, including
shared knowledge and retrieval projections. Existing published revisions backfill
to their actual source workspace; unknown lineage is withheld, not defaulted to
primary. Eligible primary sanitized knowledge may be read from pilot; pilot
publications require the same pilot workspace. Recheck at direct read, search,
citation, derived output and MCP boundaries. Aggregations must filter synthetic
sources before grouping; an accepted synthetic result cannot count as real benefit.

### Environment control (migration 079)

`operations_control`: one row per environment; mode (C14), monotonically increasing
revision, nullable recovery UUID, updated timestamp, owner operation digest, nullable
last verified bundle digest. Runtime has SELECT only. Explicit owner commands use
compare-and-swap revision updates and append minimal transition receipts. Missing
row or unsupported schema causes operational admission to fail closed.

Transitions: `open → quiescing → locked → open`. Quiescing stops new public/native/
MCP work and waits for recorded active operations to drain; deadline expiry remains
locked/blocked. Cancellation and known cleanup may continue before the snapshot,
then must reach a verified capture boundary. An isolated restore starts locked
before application traffic is bound; an old snapshot's `open` value is never trusted.
Unlock checks current ledger/grants, matched bytes, denial/replay reconciliation and
allowed scope. It never dispatches pending paid work or sends.

### Maintenance status and hosted job lease (migration 079)

`operations_maintenance_status`: key `(environment_id, class_id)` from a frozen
server catalog; generation, current lease/expiry, last start/completion/success,
last safe failure category, bounded backlog count plus `truncated` boolean, duration
and observed code version. Database time determines freshness. A started tick is
not a success heartbeat. Missing configured classes are unhealthy; intentionally
unconfigured optional external-send jobs are explicitly disabled, not green.

`operations_hosted_jobs`: UUID, environment, domain kind/opaque domain job ID,
source generation/digest, lease UUID/expiry, provider ID, immutable image digest,
state `admitted | starting | running | reconciling | succeeded | failed | cancelled`,
start/deadline/finish, input/output digests and sizes, budget reservation reference,
safe failure category. Unique active claim per domain job plus serialized
environment admission enforces C10. Provider creation uncertainty moves to
`reconciling`; no second dispatch until exact identity and charge are resolved.
A creation tag with the local job UUID supports finding a created sandbox after a
lost response; inability to reconcile blocks retry. Domain publish requires current
lease/source/generation and accepts only bounded validated outputs.

`operations_local_jobs` records immutable job/environment/source/image identities, original deadline, exact lease and `running | reconciling | succeeded | failed | cancelled` state. Local admission and hosted admission share one serialized two-heavy-job capacity fence. A crashed local command has fixed image-level timeout and exact environment/job container labels; uncertain cleanup keeps capacity held until ownership and absence are verified. Terminal rows cannot change or lose their replay identity.

Runtime privileges allow bounded worker status/job writes, never control unlock or
schema initialization. Owner provisioning is separate. Add indexes for due leases,
old samples and per-environment admission. Retain minimal terminal identity/replay
metadata under the domain's existing policy; C12 removes operational payload-free
samples, not domain tombstones.

`operations_cost_budgets` and `operations_cost_reservations` hold only durable
operational admission/reconciliation metadata, separate from customer truth.
Owner-provisioned budgets bind environment, service category, authorization/scope/
pricing digests, expiry and an integer micro-USD cap. Runtime cannot provision,
increase, revoke or settle budget authority. Serialized reservations bind each
program/image/source/deadline operation digest, its documented upper bound and
one hosted job. Dispatch is recorded before provider contact. Unknown charges
hold new admissions; only an explicit owner reconciliation can settle them.
Estimates retain at least the original upper bound and are never invoices. The
actual instruction, documented pricing and charge evidence remain private operator
records; a digest or owner-name string cannot create release authority.

## Private bytes and adapter objects

`PrivateObjectRef`: backend `local | blob`, namespace `artifacts | workforce |
reports`, opaque key, environment, digest and size. Gap export bytes use the report
namespace with existing domain ownership. No customer name, original filename,
public URL or bearer capability belongs in an object key or routine log.

Staged object → independently verified immutable object → revoked/retired eligibility
→ physical deletion. DB intent/revision state is authoritative throughout. Copy or
write uncertainty remains staged and reconciles against exact bytes; it never
creates an accepted source. Reads stream with current eligibility checks and
`private, no-store`; direct Blob read credentials never leave the server.

`ExecutorInput/Output`: fixed job kind, image and parser/template versions, input
refs, command identifier, deadline/resource limits, output contract and safe status.
The executor receives verified bytes and no domain authority. Temporary files are
owned, private and removed; fresh Sandbox storage is nonpersistent.

## Private operator evidence (not customer-domain tables)

### Catalog, scope and run

Catalog contains version, sorted gate definitions, dependencies, required method,
roles and scope. Run contains UUID, catalog digest, selected source commit/digest,
start/finish, scope digest, receipt inventory and all attempt identities. No
arbitrary executable command or URL can be supplied by evidence JSON.

Pilot scope names the synthetic workspace and participant/member references,
customer IDs, allowed journeys, platform limits and applicable budgets privately.
No names, credentials or customer text appear in committed summaries. Scope changes
create a new digest and invalidate dependent receipts; they cannot bypass a core
isolation, data-loss, storage, cleanup or source-fidelity gate.

### Gate receipt

C01–C05 plus gate/attempt/run IDs, exact method, role/workspace class, timestamps,
input/output evidence digests, expected/actual cases, failed/skipped/flaky counts,
private evidence paths and enumerated failure categories. Local, CI, hosted,
actual-model-reviewed and human-feedback are distinct methods. A local result
cannot satisfy a hosted gate. Unverified is used for missing observation; blocked
for known unavailable prerequisites; fail for an executed check that failed.

Readiness is `ineligible` until every mandatory gate for the fixed scope passes.
Reject duplicate receipts, source/catalog/environment mismatch, malformed metadata,
changed bytes and partial attempts. Preserve superseded failures. Hosted receipts
must be produced within 24h of decision, with a final identity/role/worker check
within 30min; deployment/config/schema changes invalidate affected receipts sooner.
Recovery cadence evidence covers at least two scheduled backups 12h apart and one
restored backup ≤24h old. Historical actual-model evidence stays historical unless
its governing verifier establishes unchanged behavior/source applicability.

### Recovery manifest

C01/C04/C13/C14 plus incident/capture/recovery timestamps; source/target markers;
server/client versions; exact schema ledger/grants; object inventory/chunk digests;
workflow backend and supported checkpoint/reconciliation evidence; image/signature
versions; key **names/versions only**; separately stored denial/replay watermark;
RPO boundary and RTO stop time. Store encrypted backup content outside the failure
domain under owner access; encryption keys are provisioned separately and never
embedded in the manifest. Key references are not proof that recovery keys exist.
Missing key availability blocks restore. Verify cryptographic recovery in the drill.

### Feedback and release decision

Feedback follows C15; private participant comments and observed outcomes are not
customer facts. State progresses `recorded → triaged → resolved | deferred`.
A blocker requires fix and successful recheck; major/minor deferral records rationale,
owner and follow-up. A report cannot manufacture a participant response.

Release decision follows C16: immutable bundle digest, exact scope, owner attribution
reference, time, outcome `approved | declined | pending`, explicit exclusions and
post-merge evidence. It is an operator record of an actual human decision, not a
server permission or a trusted JSON `actor` claim. Merge authorization and launch
approval are separately recorded according to their actual scope.

### Direct staging upload capabilities (079)

`operations_upload_capabilities` binds an opaque staging identity to environment,
workspace, existing principal, exact membership/session, artifact/workforce intent,
source generation and declared size. Immutable issue/expiry timestamps limit each
upload capability to ten minutes. One prepared capability is admitted per intent;
replacement revokes the old header rather than changing its identity. Provider
callbacks accept no facts. A current authenticated completion verifies actual
bytes through the governed domain service before marking the capability finished.
No private read URL, token, filename or customer content is stored in this header.
Runtime receives SELECT/INSERT/UPDATE, no DELETE; session binding and open-operation
admission are enforced by the database.

### Immutable operator cost reconciliation

Draft migration 079 also stores `operations_cost_reconciliations`, keyed permanently
by reservation UUID. Each receipt binds the exact parsed request digest, charge
evidence digest, operator review digest, integer micro-USD amount and charge kind
`actual | estimate`, with a server timestamp. Owner accounting inserts the receipt
and settles its matching reservation in one transaction. Settlement without an
exact receipt is rejected; runtime has read-only receipt access and cannot settle
charges. Update/delete is forbidden, and a changed evidence/review digest is not an
exact replay. These metadata receipts are not ninety-day health samples.

### Private feedback records

`pilot-feedback-record-v1` binds a fixed `pilot-feedback-scope-v1` (actual environment, synthetic workspace, customer UUIDs and distinct internal/assigned-partner principal/member references) to one immutable observed-journey item. New private artifacts append one transition and the canonical previous-record digest; exact file digests separately protect bytes on disk. Current active database memberships and partner assignments are rechecked before recording. Blockers require correction/recheck; other deferrals retain rationale, internal owner and future follow-up. Recorded human assertions and recheck references are not accepted domain facts or release approval.

## Immutable recovery quarantine resolution

`operations_recovery_quarantine_resolutions` appends a scope resolution to its original environment/recovery/scope quarantine and an existing owner verification UUID. Original quarantine and resolution rows are immutable. Runtime receives SELECT only; the insert trigger also denies delegated writers. Admission requires the target to remain locked at the verification's exact recovery UUID/revision, with all required verification dimensions true and a timestamp within the existing 30-minute window.

The owner domain operation verifies the unchanged current state before appending resolutions. Resolution rows are observational receipts excluded from the content-state hash to avoid a circular proof; their table schema, grants, functions and triggers remain part of that hash. The subsequent explicit control transition rechecks current state and requires a qualifying resolution for every retained quarantine. A resolution does not create verification, revive credentials, open service, or prove an actual hosted recovery.

### Infrastructure health observations (migration 079)

`operations_store_observations` retains environment, active namespace, exact store
binding hash, code version and verified-write proof hash with database sample time
and 90-day expiry. Runtime can insert proof fields, never sample timestamps, update
or delete retained proof. The adapter produces proof only after actual immutable
write/read verification. All six namespaces must have current observations within
24 hours and after the most recent recovery lock.

`operations_backup_observations` retains archive UUID, environment/store binding,
source code version, capture time and a hash binding the authenticated encrypted
archive, capture candidate and settled operator reservation IDs. Only the source
owner records it after the complete cold-copy pipeline. Runtime reads it and can
invoke bounded expiry, but cannot author or modify it. Current capture is required
within 24 hours and after recovery. Both observation tables expire in batches of
at most 100 and are excluded from accepted-content/current-authority hashes.

Hosted job identity includes immutable `code_version`. Image health requires the
latest job for each configured image to have succeeded through domain validation
on that code version after recovery and within 24 hours. No observation implies
scheduled invocation, provider invoice verification or recovery acceptance.

## Independent managed Workflow replay metadata

The work-controlled Neon archive retains immutable `native_cancel_intents` keyed by project/run. An exact environment/recovery/control/deployment/Workflow binding digest admits at most one automatic cancellation attempt; a repeated claim authorizes reads only. Terminal `native_closure_observations` retain exact binding, current source commit/source/catalog digests and terminal metadata proof digest. They contain no conversation or model payloads and do not settle paid effects or grant readiness. Both collections have a 10,000-row bound and explicit owner migrations; runtime has no access. The trusted closure producer holds the exact primary recovery fence and requires retired legacy database admission before provider operations.

### Gate verification observations

A run may reference up to 22 private `pilot-gate-verification-v1` files. Each has a
unique UUID, run/gate/selected-attempt identity, source/catalog/environment/scope
binding, actual verification start/completion, exact original receipt IDs/digests
and unchanged execution intervals, and dependency observation IDs/digests. The
verifier reopens every original proof before writing its observation. Dependency
chronology applies to these verification operations; execution freshness and
operation-specific ordering remain attached to the original evidence. A reread
never renews an execution or grants runtime/paid-operation authority.


### Scoped release aggregation

`pilot-release-bundle-v1` references at most 32 immutable strict scoped runs, exact
source/catalog, and distinct actual Preview/Production scopes. Each hosted run
reference includes its own original scope and run ID while binding the same actual
required target release. No per-scope attribution constraint is relaxed. Aggregate
coverage is keyed by gate, required method, role and required environment.

`pilot-release-gate-observation-v1` binds bundle UUID/canonical digest, original
run/attempt/receipt/proof identities, environment/workspace/scope and execution
intervals, plus dependency observation IDs/digests. Original execution freshness
is retained. The final result computes technical eligibility and cannot approve
release, grant context authority, admit paid work or alter runtime state.
