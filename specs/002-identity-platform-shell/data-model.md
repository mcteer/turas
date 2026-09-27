# 002 data model

Design, not applied schema. Postgres owns domain facts and native eve owns execution.
All times are UTC; UUID identifiers are server-generated; client account/role values
never establish authority. See [application contract](contracts/application.md).

## Entities and relationships

| Entity | Required fields and relationships | Constraints |
| --- | --- | --- |
| Environment | singleton environment_id, schema_version | Must match configured environment; separate DB per data environment |
| Principal | id, login_name, display_name, active, revision, created_at | Unique login; three seeded demo principals; credential values outside table/source |
| Workspace | id, name, active | One visible demo workspace; additional test fixtures |
| Partner organization | id, workspace_id, name, active | Workspace-scoped; no automatic grants |
| Membership | id, principal_id, workspace_id, kind internal/partner, partner_org_id, role admin/member, active, revision | Unique principal/workspace; partner kind requires organization in same workspace |
| Customer reference | id, workspace_id, display_name, synthetic, created_at | Nonempty name <=200 chars; synthetic fixture marker; no maturity/profile fields |
| Customer grant | id, membership_id, workspace_id, customer_id, state active/revoked, revision, granted_by, changed_at | Unique membership/customer; composite FKs enforce common workspace; partner members only |
| Login session | id, principal_id, token_hash, created_at, expires_at, revoked_at | Unique 32-byte SHA-256 token hash; absolute 8h lifetime; no plaintext token |
| Conversation | id, environment_id, workspace_id, customer_id, owner_principal_id, eve_session_id nullable, creation_operation_id, binding_state, projection_next_index, title, revision, created_at, updated_at | Immutable owner/customer/workspace; unique native session and operation ID; projection_next_index starts at 0; title <=120 chars |
| Submitted message | id, conversation_id, request_key, body_digest, text, created_at | Unique conversation/request key; <=16 KiB text; immutable after admission |
| Response attempt | id, conversation_id, message_id, dispatch_state, response_state, native_delivery_id nullable, native_turn_id nullable, dispatch_start_index nullable, input_event_id nullable, dispatch_started_at nullable, deadline_at nullable, last_error_code, revision, timestamps | One nonterminal attempt per conversation; every dispatch tied to accepted message; cursor, normalized input digest and deadline persisted before native send |
| Event projection | native_event_id, conversation_id, native_session_id, stream_index nullable, event_type, turn_id, step_index, visible_payload, emitted_at | Unique event ID; only visible message/progress/terminal projection; no routine reasoning mirror |
| Watchdog job | attempt_id, deadline_at, state, lease_owner nullable, lease_expires_at nullable, next_attempt_at, failure_count, last_error_code nullable, updated_at | Unique attempt FK; deadline matches attempt; pending/leased/cancel_requested/settled/needs_attention; 15s reclaimable maintenance lease never authorizes resend |
| Maintenance worker | environment_id, worker_id, last_seen_at | Heartbeat every scan; new sends require a heartbeat no older than 15s |
| Maintenance nonce | environment_id, nonce_digest, consumed_at, expires_at | Unique environment/nonce digest; atomic consume; 60s retention; no signing secret stored |
| Access audit | id, actor_principal_id nullable, actor_session_id nullable, scope_ids, action, outcome, correlation_id, created_at | Append-only under app role; omit content and credentials; unknown login actor may be null |
| Rate window | environment_id, key_hash, category, window_start, count, expires_at | Unique category/key/window; atomic update; no raw password/token/IP |
| Migration ledger | migration identifier, applied_at plus release digest manifest | Managed by migration CLI; runtime cannot mutate |

`mcteer` is an internal Vercel admin representing FDE/PS leadership; `panel` is an
internal Vercel employee/member. `partner` is a partner/member attached to an active
synthetic partner organization in the same workspace. Active internal membership
permits all current and future workspace customer profiles without individual grants;
partner customer grants represent assignments to help those customers and cover a
limited subset with at least one shared granted customer and one ungranted customer.
Subsequent creation of customer references
is an explicit setup command in 002, not a public profile-creation feature. Creating a
new reference is visible to internal members automatically; partner access requires
an explicit assignment/grant. No wildcard partner grants.

## Authorization invariant

For chat access: valid unexpired login session AND active principal AND active
membership AND matching workspace/customer AND (internal membership OR an active
partner customer grant) AND conversation owner. Partner membership must match an active organization in that workspace.
Administrative operations check admin membership but do not drop the owner predicate
on chat reads. Check policy within write transactions as well as at request entry.
Cross-scope foreign keys backstop validation; database credentials alone never imply
end-user access. No browser may select its own owner or role.
System maintenance has a separate narrow authority to reconcile/cancel an existing
attempt after user revocation. It derives all scope from stored associations, exposes
no transcript, and cannot create/send messages or change access. See the
[recovery contract](contracts/recovery-and-validation.md).
Customer reference responses project only ID, display name and synthetic label;
do not serialize full persistence rows into partner-facing responses. Future rich
profiles add delivery-relevant partner projections in 003. Internal profile access
does not grant another user's private chat history. Shared published learnings have
a separate access scope in 005; they do not expand these customer grants or require
unused knowledge tables in 002.

## State transitions

- Principal/membership: active → disabled; explicit authorized reactivation only.
  Prevent disabling the final active admin using a locked workspace/admin decision.
- Grant: absent → active → revoked → active, with expected revision and audit.
  Stale revision returns conflict; bootstrap never overwrites an existing decision.
- Login session: active → expired or revoked; no revival or sliding expiry.
- Conversation binding: unbound → creating → bound; uncertainty → reconciling;
  known unrecoverable failure → failed. Canonical native ID must be bound before send.
  A terminal eve session remains readable history; new chat gets a new domain record.
- Dispatch: prepared → dispatching → admitted; proven pre-admission failure → retryable
  or rejected; lost receipt → uncertain → admitted when evidence arrives. An uncertain
  claim is not automatically recycled. A known failure can be shown without resending.
- Response: pending → running → completed / cancelled / failed. Cancellation requested
  is a separate control state until `turn.cancelled` confirms it. Timeout requests
  cancellation but does not fabricate a runtime terminal event.
- Watchdog: pending → leased → cancel_requested → settled on terminal evidence.
  Expired maintenance leases may be reclaimed; failed operations use bounded backoff
  then needs_attention. Never recycle the separate uncertain dispatch claim.
- Projection: apply each native event once; replays are safe. `message.completed`
  may be intermediate; only terminal turn events finish a response. Native provider
  retries may leave multiple attempt fragments; retain accurate partial status rather
  than claiming event-ID deduplication removes all provider retry output.

## Transactions and conflict handling

Partner grant/disable updates lock current rows, validate expected revision and authority,
write the change and audit event together. Admission locks conversation/principal
budget rows; stores message, attempt and counters together before network dispatch.
Use unique constraints for request keys and one outstanding attempt; a reused key with
a different digest returns 409. Do not hold a DB transaction open during a model call.

Native session creation and Postgres commits are not a distributed transaction.
Record the stable create operation before contacting eve, serialize creation, then
bind only its reconciled canonical result. Candidate workflows never receive model
input before binding. Under the single-outstanding-attempt reservation, capture native stream tail+1
and persist it as dispatch_start_index with the normalized message digest before
dispatch. Commit dispatch_started_at, deadline_at and its watchdog job atomically
with the send claim. On unknown follow-up acceptance, replay from that cursor and
match the first ordinary message.received using session, exclusive attempt and digest;
persist input_event_id/native turn identity. Optional delivery IDs corroborate but
are not required. Repair projection and projection_next_index atomically. Missing or
conflicting evidence leaves the attempt blocked; a crash cannot justify a blind resend.

## Indexes and ordering

Index active membership/grant lookups, token hashes, owner/workspace/customer +
updated_at/id history pagination, conversation request keys, active response attempts,
watchdog state/next_attempt_at/deadline_at, maintenance nonce expiry,
and audit workspace/time/id. Title search is owner-scoped and bounded; scan within
that index for the 1,000-conversation acceptance size before adding a search extension.
Use stable timestamp+UUID history cursors. Native event ID deduplicates; absolute native
stream index orders replay. Hooks without index do not advance a replay cursor.

## Lifecycle and recovery

Bootstrap uses fixed identities and deterministic synthetic references; rerun inserts
missing initial records only and never re-enables disabled/revoked records. Do not
silently seed on application startup. Separate migration and runtime credentials.

Retain demo records until explicit environment teardown. Purge expired login-session
and limiter rows with a maintenance command; the local worker prunes expired
maintenance nonces and scans persisted response deadlines; no new scheduled integration in 002.
Future private-data retention/deletion is a separate policy decision. Back up domain
DB and preserve local eve Workflow storage for restart/restore validation. Reconcile
missing visible-message projections from native events; do not use a browser cache
or reconstructed transcript as a replacement for native continuation state.
