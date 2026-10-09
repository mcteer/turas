# Partner delivery operations

Feature 013 adds reviewed customer-scoped guides and private individual learning
assignments. Learning verification does not accept delivery work, change customer
maturity or certify skills. Existing grants and 005 shared publications remain
separate governed sources.

## Release prerequisites

Use Node 24 and the installed lockfile. Apply explicit migrations 050 and 051 through
the existing migration operator, then apply the checked-in runtime role grants.
Never migrate from a request handler or change hashes of applied migrations.
Missing schema fails closed. Hosted migration and deployment require their own
release authorization and verification; local synthetic checks do not prove them.

Canonical active internal administrator mcteer publishes, rejects and retires
guides, assigns individuals, withdraws/replaces assignments and verifies or requests
changes on submissions. Internal authors can draft guides and read eligible learning
records. Partners can author only their own assigned attempts. Another partner
cannot read those attempts, including within the same organization.

## Disable and recover

Set `TURAS_013_DISABLED=1` to block new work. Authorized reads, guide retirement,
assignment withdrawal, request status/resolve and cleanup remain available.
Keep the same selected database and `.eve/.workflow-data` during restart and forward
recovery. Do not recreate schema, reset generations or restore expired authority.
After a grant, organization, baseline or published guide changes, old assignments
remain unavailable or obsolete; explicit replacement creates a new identity with
zero inherited verification. Retired guide identities cannot be reopened.

A mutation uses a UUID request identity, exact version and input digest. On a lost
acknowledgment, read its status before issuing another action. If absent, explicitly
resolve it to an abandoned tombstone; a late original cannot execute. Browser
storage contains only opaque request/target identities, never submitted prose.
Keep environment-lifetime tombstones; do not delete them to retry an old request.
Review previews bind exact content, source closure, action and session for five
minutes. An expired preview requires a new preview; committed receipt replay never
repeats a decision.

## Evidence and retention

Current eligible bodies remain available. Original source withdrawal, authority
loss and expiry withhold affected bodies synchronously before release, regardless
of worker state. Shared citations reveal published sanitized passages only; private
contributor lineage stays server-side. Transaction-scoped repeated source checks
reuse completed locks only within one transaction and recheck expiry. Original
profile support and conflict checks use bounded batches with the same governed
predicates; closure discovery runs afresh before and after original locking.

The maintenance worker runs independently of reporting and feature enablement,
with at most 100 records per tick and a ten-second deadline. Globally ineligible
payloads are due within 24 hours; obsolete/withdrawn payloads after 90 days.
Previews expire after five minutes and cursors after fifteen. Decision/receipt
metadata is minimized after 365 days, preserving lifetime request tombstones.
Failures retry after sixty seconds, up to five minutes, without moving the original
deletion deadline. Bounded content-free queue telemetry reports overdue count and
oldest age. Monitor overdue work and restore the worker instead of extending dates.

## Local verification

Run the complete [quickstart](../specs/013-partner-enablement/quickstart.md).
The domain, five-file/four-project WebKit, recovery, exact earlier-domain regression,
owned web/eve build and seven-class load gates reject incomplete acceptance.
Load measurement respects production quotas and records pacing separately.
Runners refuse unowned targets and remove only their own subprocesses, synthetic
containers and checkout copies beneath ignored `local-artifacts/013/`.
Do not point these runners at customer data or use the host browser for UI testing.
