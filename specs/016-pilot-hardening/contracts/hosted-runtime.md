# Hosted Runtime Contract

## Workspace-bound authentication and synthetic isolation

Existing credentials authenticate the same principals. `POST /api/auth/login`
accepts an optional workspace UUID (or fixed primary/pilot choice resolved server
side). Missing choice selects only the current primary workspace. Validate an active
membership/organization before issuing a session bound to membership and workspace;
never enumerate other members or grant access from the submitted selector.

Add an accessible Primary Workspace / Pilot Workspace choice to the existing login
form only when the operator has enabled the pilot. Show the selected synthetic
workspace label in the shell. Existing primary login remains the default. Failed
selection returns the existing generic denied response. Re-login is required to
switch; old sessions, conversations and MCP scopes do not move.

Migration 056 adds compatible nullable session-binding columns as a pair and
backfills only unambiguous primary memberships. New code issues bound sessions and
rejects unresolved legacy sessions. Complete recheck/backfill/revocation before
adding second memberships. Retire or protect historical deployments using the old
unbound-session code before enabling pilot memberships; verify their ordinary
login paths cannot admit ambiguous sessions. No old-code rollback after enablement.

Pilot classification is inherited by revisions, projections and downstream outputs.
Use one shared eligibility fence for primary vs pilot reads/publications and
aggregate inputs, applied before retrieval and rechecked before returning content.
Shared primary sanitized practices remain available to pilot members; pilot shared
practices are confined to that pilot workspace. Pilot facts cannot contribute to
primary cohorts, gap impact, staffing economics or business outcome totals.

## Private object interface

Backend choice is explicit (`local` for owned development, `blob` for hosted pilot).
No fallback on error. Operations are stage/put-immutable, stat/read-stream,
finalize-verified, delete-exact and bounded-list. Namespaces separate artifacts,
workforce and reports; gaps use governed report objects. Metadata binds environment,
opaque key, expected size/digest and current domain object identity.

Domain policy runs before reads and rechecks during streaming. App responses use
`Cache-Control: private, no-store`. Use uncached private Blob reads. Neither a Blob
URL nor possession of a key grants user access. Original filenames appear only in
authorized content disposition, never storage keys, routine metrics or public URLs.

For existing maximum-size uploads, use a direct private staging upload authorized
by the existing artifact/import intent. Proposed routes:

- `POST /api/artifacts/intents/[intentId]/upload`
- `POST /api/staffing/imports/[importId]/upload`

Require current session, CSRF/origin checks, exact intent ownership/state/generation
and existing quotas. Capability is exact-path, upload-only, no overwrite, expiry
≤min(intent expiry, ten minutes), size ≤declared size and existing feature maximum.
The browser sends bytes directly to staging; the existing completion endpoint
independently reads and hashes the object, checks size/type/source generation and
current authority, then finalizes. Provider completion callbacks only trigger
reconciliation; they never approve facts or trust callback-supplied URLs/identity.
Reject foreign paths, wrong environment, oversized bytes, stale callback, revoked
owner, digest mismatch and replay with different bytes. Successful replay returns
the original receipt without duplicate records or processing.

Orphan cleanup uses bounded pagination and exact owned-prefix verification. Failure
to delete remains a retryable cleanup record; withholding does not wait for deletion.
Migration from existing local objects compares inventory/digests while writes are
fenced; cutover occurs only after parity, with no mixed silent fallback.

## Isolated execution

Implement local Docker and hosted Sandbox adapters behind the same fixed job
contract. Reuse current scanner/parser/renderer programs, output schemas, quotas,
image provenance and domain publish/fail commands. Record actual hosted image
OCI digest and scanner-signature/OCR assets; local image IDs are not hosted proof.

A trusted dispatcher claims a current DB job and budget reservation, creates a fresh
nonpersistent sandbox, transfers verified input bytes, runs explicit fixed commands
under denied network/no ports/no credentials, obtains bounded outputs and verifies
format/digest before publishing through the current lease/source fence. No user
text becomes command arguments that select executables or arbitrary paths.

At most two heavy jobs/environment. Execution ≤300s and the existing domain deadline
if tighter; dispatcher ≤360s including startup/transfer/cleanup. Lease renewal cannot
extend the original deadline. Persist provider ID and unique creation tag; on lost
response or process death reconcile the exact tagged job and stop it before retry.
Lease loss/cancellation forbids publication. Always stop/delete owned compute in
finally; a separate watchdog reconciles stranded jobs. Snapshots/persistence are
disabled and no customer inputs remain in reusable images.

Protected finite heavy dispatch is separate from the existing short maintenance
watchdog. Use an authored eve maintenance channel route `/eve/v1/turas/jobs`, exact
scheduler bearer authentication (no application cookies), fixed server catalog,
no arbitrary request command/URL, and bounded response. Add its schedule through the
existing deployment configuration after installed eve documentation review. It may
process already-admitted scan/parse/render jobs only; no model/research or email work
is admitted merely because cron fired. Existing uncertainty/retry rules still apply.

## Maintenance registry and health

One class registry covers conversation cancellation; artifact reconciliation,
cleanup/native retirement; workforce imports/cleanup/reservation expiry; retrieval
projection/cleanup; research freshness; knowledge suspension; plans cleanup;
execution/support/expansion settlement/retirement; report/gap render/cleanup;
partners; learning; MCP. Finite ticks call existing domain functions and preserve
each class's tighter batch/deadline. Domain cleanup remains active while authoring
is disabled. A class failure must not starve conversation deadlines or other cleanup.

Record actual start/completion/success, lease and safe failure category, bounded
backlog/count truncation, duration and code version in 057. Expected classes are
fixed by configuration/catalog; absence is unhealthy. Hosted and local runners use
the same registry. Heavy work has independent durable admission.

`GET /api/health/ready` returns only minimal ready/unavailable status without private
configuration, class names or customer data; keep prior safe response compatibility
where possible. Readiness verifies the exact supported schema ledger and runtime
grants plus configured critical capability/worker freshness. Failure returns 503.

`GET /api/operations/status` requires the current canonical mcteer administrator
session. It returns safe per-class status, backup age, configured storage/image
readiness and bounded counts; no keys, private URLs, names or payloads. Panel,
partner, anonymous and MCP credentials cannot retrieve it. Recovery mode remains
visible to this operator route without allowing normal domain work or unlock.

## Failure and rollback

Missing schema/grants/configuration/private object or stale worker yields a truthful
unavailable state. No request creates schema or storage roots. Recovery fence is
checked by shared access/session/MCP/native and worker dispatch boundaries, with
explicit protected cleanup/status exceptions. Runtime cannot unlock. Stop new work
before backend/code rollback; keep private objects and replay identities intact.
