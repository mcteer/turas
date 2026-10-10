# Data Model: Read-only MCP Service

Design only; explicit migration 055 and runtime grants are implementation tasks.

## Bounds and invariants

- **C01**: IDs are UUIDs; digests are 64 lowercase hexadecimal characters; generation integers are 1–9007199254740991; timestamps are UTC. Output revisions are exact identities, never client authority.
- **C02**: Credential secret is 32 random bytes encoded base64url, with a non-secret UUID lookup ID; SHA-256 storage, constant-time verification, Authorization header only. Name is 1–80 characters; lifetime is 1–30 days, default 7; at most 10 active connections per membership. No plaintext replay/storage.
- **C03**: Categories are `profiles`, `evidence`, `knowledge`, `plans`, `reports`; 1–5 distinct categories. Customer scopes are at most 100 distinct currently authorized UUIDs; customer categories require at least one. Knowledge-only may have no customers. No wildcard, grant creation or client-supplied role.
- **C04**: Request at most 16 KiB, response at most 128 KiB, list limit 1–20, cursor/citation handle at most 256 characters. No silent truncation; overlarge record is unavailable with a safe reason. No arbitrary search, URL, filesystem path, query or tool forwarding.
- **C05**: Continuation/citation handles use 32 random bytes and hashed lookup, expire within 15 minutes, bind environment/workspace/principal/membership/connection/category/customer/section and scope digest. Positions are immutable metadata only; no source prose. Same-member different-connection swapping is denied.
- **C06**: All authenticated protocol requests count toward fixed UTC-minute limits: 30 per connection, 60 per membership, 240 per workspace; at most 2 concurrent reads per connection, 4 per membership, 16 per workspace. HTTP 429 supplies integer Retry-After 1–60; concurrency release/lease expiry is idempotent. Request deadline 10 seconds, statement timeout 5 seconds, lock timeout 2 seconds; no automatic retries.
- **C07**: Management create/revoke keys are UUIDs; exact replay returns safe receipt/metadata only, never a lost secret. Changed replay is conflict. Concurrent creation cannot exceed active cap. Scope edits/rotation require revoke and new connection; never widen a live credential.
- **C08**: Usage metadata retains at most 90 days; expired handles/leases are deleted in batches of at most 100. Revoked/expired credential hashes are purged within 24 hours after revocation/expiry, leaving minimal revocation identity and create/revoke tombstones for environment lifetime. No source content, credentials, arguments, source locations or customer names in audit/logs.
- **C09**: Authorization is checked at admission and final projection in one transaction, with shared actor/member/customer/source locks and established revocation ordering. No cached private prose; already delivered bytes cannot be recalled. MCP read authority never becomes browser/native write authority.
- **C10**: Schema readiness requires exact environment and minimum 055 plus required tables/grants; no DDL on requests. Operator default is disabled. Transport, identity, quotas, grants or final eligibility uncertainty fails closed.

## Connection and customer ceiling

`mcp_connections`: ID, environment, workspace, principal, membership, name, category
set, scope digest, credential hash, created/expiry/revocation timestamps, revoker,
last safe use. Foreign keys bind existing identities. Credential identity and scope
are immutable. `mcp_connection_customers` binds selected customer ceiling to the
same workspace. Current grants are independently intersected on each read.

State: created active → explicitly revoked or time-expired → secret hash purged.
No restoration. Create and revoke under existing browser authority; self ownership
or canonical mcteer revocation checks use the common domain layer.

## Authority

`CurrentReadActor` is explicit browser/MCP authority with current member identity.
Browser authority retains actual login session checks; MCP authority locks exact
connection plus current member/principal/workspace/org. Existing write commands
retain browser/native `CurrentSession` requirements and reject MCP authority even
if a caller attempts direct reuse. Token verification cannot select another actor.

## Handles and leases

`mcp_handles`: hashed handle, type cursor/citation, exact scope/identity bindings,
operation/filter digest, immutable position or source revision/generation/passage
digest, creation/expiry. Never precomputed result prose. Reauthorize each resolve;
revision/source changes return unavailable or invalid continuation, not substitute.

`mcp_rate_windows`, `mcp_read_leases`: durable independently committed UTC-minute
counters and bounded expiring concurrency admission; lease bound is the request
10-second deadline. Denial rollback does not undo quotas. No retries after uncertain
admission without reconciliation; release/expiry does not grant duplicate work.

## Operational receipts

`mcp_management_receipts`: exact actor/connection/action/request digest and outcome,
no secret. Creation response loss requires revoke and recreate with a new key.
`mcp_management_cursors`: hashed opaque continuation, current browser principal/member,
environment/workspace, own/admin/usage operation, optional usage connection identity,
immutable position and 15-minute expiry. These let disabled/revoked-access management
remain usable without requiring an active MCP credential. They contain no prose or
credential, and cannot be accepted as external MCP context handles.
`mcp_access_receipts`: connection/member/workspace, allowed operation category,
result category, time, duration and correlation UUID; no raw arguments/prose or
hidden record names/counts. Nonmember denial telemetry contains only fixed failure
categories and random correlation identity.

## Domain projections

No duplicate customer truth tables. Profiles use accepted revisions and paginated
summary/workloads/facts. Evidence uses eligible passages and opaque bound citations.
Knowledge uses sanitized publication without private lineage. Plans use current
accepted baseline/design revision. Reports use current authorized publication and
correction state. Output schema strips UI action flags, private lineage, artifact
paths and download metadata. Existing source eligibility is rechecked for every
output family before serialization; no workers are needed to withhold content.

## Migration, cleanup and recovery

055 is additive and versioned in `migrations/manifest.json`; owner-run runtime
grants permit operational metadata only through intended functions/tables. Existing
customer truth remains unchanged. Cleanup runs through the maintenance worker with
owned environment markers, idempotent batches and restart-safe leases. Revocation
and source denial do not rely on cleanup. Preserve selected local environment,
private store and workflow pair. Recovery disables service, restores/reconciles
owned metadata, preserves revoked identities and never reactivates expired access.
