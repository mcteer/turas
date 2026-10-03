# Delivery, Scheduling and Recovery Contract

**Version**: `report-delivery-v1`.

## Authority and Recipient Policy

Only canonical mcteer may approve a policy, publication, brand profile or send.
Contributors may prepare reports. An approved policy binds one customer/report scope,
audience, configured verified sender, exact normalized recipients and schedule.
Delivery addresses require an explicit customer entitlement rationale. Internal
account-team/leadership recipients must additionally bind to an active internal
member whose current customer access passes. No inferred domain-wide grants,
mailing-list expansion, CC/BCC or recipient selection by report text.

Sender identity is configured separately by an operator. The implementation records
verification/readiness without provisioning a domain or exposing credentials. A
material sender/recipient/audience/scope/cadence change requires a new approved policy.
Pause/revoke is immediately checked by all claims/dispatches. Changing a policy
never retargets an existing delivery. Existing successful/uncertain delivery to the
same publication/address prevents duplicate send through a new policy revision.

A send preview binds publication/revision, actual mail and file digests, active
policy version, all recipient identities, sender version, brand/template and current
source set. It expires in five minutes. Authorization commits all intended recipient
rows or none, with one auditable decision. Partial success refers to later transport
outcomes, not a partially recorded authorization.

## Exact Mail

Weekly: subject with customer/engagement, week and correction label if applicable;
validated HTML plus plain text with all required content. Executive: concise reviewed
summary plus exact PDF/PPTX attachments. Freeze mail subject/body/attachments and
request digest before send review. Send attachment bytes from private storage, not
public or provider-fetched URLs. Tracking pixels and click rewriting are disabled.
Do not include recipient lists in shared content, document properties or logs.

## Outbox Dispatch and Retry

1. Atomically claim an authorized eligible row with lease/fence; check active policy,
   durable authority, sender, publication/source/brand validity and suppression.
2. Load exact artifact bytes, verify their hashes, and recheck eligibility just before
   committing `dispatching` intent. Store first-dispatch timestamp/provider key and
   immutable request digest before any network activity.
3. Send one exact request to Resend, one recipient, 15-second timeout. Persist provider
   response evidence; acceptance becomes `provider_accepted`, never `delivered`.
4. HTTP validation/auth errors are permanent failures. Explicit provider rate-limit/
   definitive non-acceptance may retry with the same key/body at 60 then 300 seconds,
   respecting bounded Retry-After up to 1 hour. Conflicting idempotent payload is fatal.
   Treat server errors/transport reset/timeouts conservatively as uncertain unless
   provider evidence proves non-acceptance.
5. An uncertain request may use same-key recovery inside 23 hours from first dispatch
   with current eligibility and at most three total send/recovery attempts. This is
   provider deduplication recovery, not a fresh send. Never extend the clock on retry.
6. At/after 23 hours, do not POST again. Reconcile using a known provider message ID,
   verified event or documented operator evidence. Missing evidence stays uncertain.
   No “force retry” bypass exists. A correction is a new reviewed publication and
   explicitly warns about any unresolved prior delivery.

The provider's documented deduplication period is 24 hours; the 23-hour application
boundary leaves margin. Local uniqueness persists beyond it. These rules prevent
blind duplicates but do not claim universal exactly-once email delivery.

The dispatch-intent commit is the point after which Turas may no longer prevent an
external side effect. A revocation committed earlier blocks the call; a concurrent
later revocation stops further work/retry, records the race and settles any actual
provider outcome. Never claim to recall an already-dispatched email.

## Receipts and Reconciliation

Webhook endpoint accepts only bounded raw signed requests; verify via the SDK with
timestamp tolerance 5 minutes, event ID and configured signing secret before parsing.
Maximum raw body 256 KiB. Persist only matched metadata for the configured environment,
known sender and delivery/recipient, never arbitrary webhook body or content.
Deduplicate event ID; quarantine bounded unmatched IDs for up to 24 hours for response
races, without addresses/content. Unknown events cannot manufacture a sent report.

Maintain append-only facts and a deterministic status projection. A late acceptance
cannot downgrade delivered; a later bounce/complaint remains visible. Out-of-order
or repeated events do not trigger sends. Sender API configuration without working
receipt verification gives `provider_accepted`, not proof of delivery.

Authenticated server reconciliation may GET a known provider ID without a new send.
Rate: at most one lookup per delivery per minute, five automatic lookups in 24 hours;
then operator review. Operator evidence records the lookup/provider ID/event/rationale
and reviewer, but cannot invent delivery. No open/click tracking or read receipt claim.

## Schedule Semantics

Weekly schedules create drafts, never send. Compute prior complete Monday–Sunday
using the policy timezone. For a nonexistent local scheduled time, run at the first
valid instant after the gap; for repeated time, run only at the earlier occurrence.
The unique scope/period/audience identity prevents duplicated periods across ticks.

On recovery generate only the latest due complete week, mark earlier missed periods
as missed and let the user explicitly request them. No backlog burst. A policy or
schedule change invalidates outstanding scheduling authority. Authorizing a report
send later remains an explicit action independent of draft creation.

## Runtime Bounds and Readiness

- Worker poll every 5 seconds; claim at most 10 jobs/tick; render concurrency 2,
  mail dispatch concurrency 2, cleanup batch 100. Fair selection across customers.
- New work limits: per member 5 draft/render requests per 10 minutes, 30 decisions
  per 10 minutes and 120 reads per minute; per workspace 20 new reports/hour and
  100 recipient deliveries/day. Atomic counters; exact replays do not consume a
  new generation/send allowance. SDK transport retries are disabled; domain owns retries.
- Durable queue limits: 100 pending draft/render jobs and 500 pending recipient rows
  per workspace. Refuse new work with Retry-After rather than silently discard.
- Worker heartbeat every 15 seconds; stale after 45 seconds. Readiness reports
  schema, store, renderer/fonts, worker, sender and brand independently without secrets.
- Feature disabled: refuse new generation/policy/publication/send authorization;
  allow authorized status, cancellation, delivery evidence reconciliation and cleanup.
- Cleanup checks exact revision/digest/generation/lease; expired lease does not
  authorize deletion of newer files. No broad DELETE or directory-wide purge.

## Recovery and Release

Back up DB plus report-store manifest/bytes consistently, preserving existing stores.
On restore, quarantine any row with dispatch intent but no conclusive outcome;
never reset it to unsent. Reconcile provider evidence under its original identity.
Offline render jobs may safely retry from identical inputs if current sources pass.
A prior valid publication whose files are missing shows unavailable, not a new
unreviewed render masquerading as the approved bytes.

Real-send validation needs a verified sender, secret configuration, exact approved
synthetic report, and explicit authorization for the test recipient. Never send to
addresses discovered in files. Record provider acceptance/delivery separately and
keep private evidence out of Git. Hosted send readiness additionally needs actual
worker/storage/webhook/recovery proof; local simulation cannot satisfy it.
