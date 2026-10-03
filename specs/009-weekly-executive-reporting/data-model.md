# Data Model: Reporting v1

All domain rows carry environment/workspace/customer scope except workspace-owned
brand/sender configuration. Composite foreign keys prevent cross-scope joins.
Metadata identity is immutable; source-derived prose, addresses and file bytes live
in separate private payloads that can be purged without deleting allowed audit.

## Normative Field Constraints

These constraints are quoted in the implementing tasks. Strict schemas reject
unknown fields and invalid values; no silent truncation or permissive coercion.

- **C01**: All report, revision, publication, policy, job and request IDs are UUIDs; versions are positive integers; digests are 64 lowercase hex characters; decision rationale is 1–2000 characters; every mutation requires a request key and expected version, except create which requires expected version 0.
- **C02**: Report kind is weekly, monthly or quarterly; audience is delivery, account_team or leadership; timezone is a valid IANA name; weekly scope has exactly one engagement; executive scope has 1–20 unique engagements and 0–20 unique accepted workload UUIDs belonging to one customer, with includeCustomerLevel=true required for engagements without an assigned workload.
- **C03**: Period dates are real ISO dates; a weekly period is Monday–Sunday, monthly is a calendar month and quarterly is a calendar quarter; periods contain 7–92 inclusive dates; asOf is a server-owned UTC capture instant; future periods are rejected and a current incomplete period requires partial=true.
- **C04**: A structured report is at most 1 MiB of canonical JSON, with title 1–200 characters, annotation 1–2000 characters, at most 20 annotations, at most 1000 selected delivery records and at most 2000 exact source references; overflow returns scope_too_large without a partial publication.
- **C05**: Recipient policy contains 1–20 unique normalized addresses of at most 254 characters, no display-name/header syntax or control characters, one configured sender ID, one report scope and audience; internal recipients require active internal membership IDs and delivery recipients require an explicit customer-entitlement rationale of 1–500 characters.
- **C06**: A schedule is weekly only, with one approved policy, IANA timezone and local time HH:mm; default is Monday 09:00 for the preceding complete week; state is active, paused or revoked; there is at most one active schedule per scope, audience and timezone.
- **C07**: PDF and PPTX files are each at most 10 MiB and together at most 15 MiB; PDF has at most 40 pages and PPTX at most 40 slides; PPTX ratio is 16:9; weekly HTML and plain text are each at most 256 KiB; total encoded email request is at most 22 MiB.
- **C08**: Lists have page size 1–50 and cursors expire after 10 minutes; JSON command bodies are at most 128 KiB and ordinary read responses at most 1 MiB; review/send previews expire after 5 minutes; all authenticated responses use private, no-store.
- **C09**: Draft/render jobs have at most 3 attempts with delays of 10 and 60 seconds; draft deadline is 30 seconds and render deadline is 120 seconds; leases last 180 seconds with a heartbeat every 15 seconds; the renderer has at most 2 concurrent jobs, 2 CPUs and 2 GiB per job, with no network access.
- **C10**: One delivery row identifies one publication and normalized recipient address; transport timeout is 15 seconds; at most 3 send attempts use the same provider key and identical request bytes; no retry starts 23 hours or more after first dispatch; uncertain outcomes after this boundary require operator reconciliation and are never automatically resent.
- **C11**: A brand profile contains versioned asset/font/template hashes, source provenance and approval state draft, approved or revoked; only bundled reviewed SVG/PNG logos and static TTF/OTF fonts are allowed; a missing approved font or unsupported glyph blocks release.
- **C12**: Unpublished report payloads expire after 30 days without a new revision, published payloads and recipient addresses expire after 365 days, render scratch files expire after 1 hour, and minimal audit metadata expires after 730 days; withdrawal queues immediate ineligibility and cleanup within 24 hours; cleanup batches contain at most 100 exact payload/file identities.

C12 is a documented synthetic-demo default, not an organizational private-customer
retention approval. Policy expiry is visible. Recipients cannot be reconstructed
from retained hashes after address purge; no retry is possible after expiry.
Request/delivery identities survive for the audit horizon and expired resources
cannot be resurrected by replay. Retention changes need a future versioned policy.

## Scope Selection and Period Identity

A policy/schedule binds a period-independent selection: customer, kind, engagement/
workload IDs, timezone and audience. A report instance adds one canonical period
and capture time. The schedule may therefore prepare the next week without changing
its approved customer/engagement selection. A send still binds an exact publication
for one period and receives fresh approval. Existing 003 workload identities are
reused; this feature does not introduce another workload catalog.

## Entities and Relations

| Entity / Proposed Table | Identity and Required Fields | Relations and Invariants |
| --- | --- | --- |
| Report / `report_scopes` | ID; customer; kind; period; timezone; audience; scope digest; author; current revision; aggregate version | Unique normalized scope/period/audience/timezone; generation reuse does not prevent an explicit new correction revision |
| Revision / `report_revisions` | ID; report; revision number; schema/template/projection/formula versions; asOf; partial; content digest; source-set digest; brand version; scope-generation watches; created by | Immutable; parent scope cannot change; exact predecessor on corrections |
| Revision Payload / `report_revision_payloads` | Revision ID; structured document; restricted payload access; expiry | Database access restricted; purgeable, never update in place; C04 |
| Dependency / `report_dependencies` | Revision ID; source kind/ID/revision/decision/generation/digest; eligibility class; restricted source locator | Indexed reverse lookup; source location is not copied into external document properties; transitive original closure required |
| Calculation / `report_calculations` | Revision ID; formula version; period; integer inputs/results; units; missing reasons; input digest; exact time decisions | No floating currency arithmetic; current ledger values alone are insufficient lineage |
| Artifact / `report_artifacts` | ID; revision; format; bytes digest; size; private object key; renderer/font/brand/template digests; validation receipt | Unique finalized format per render attempt; visible only after exact source/render checks; staged output not downloadable |
| Validation / `report_validations` | ID; document/artifact digests; validator version; required-section/parity/layout/font/link results; timestamp | Required for publication; no user-controlled boolean can bypass it |
| Decision / `report_decisions` | ID; actor; current role authority; action; exact preview digest; versions; rationale; time; request key | Actions publish, reject, withdraw, approve_brand, approve_policy, pause_policy, revoke_policy, authorize_send, reconcile; scoped per entity |
| Publication / `report_publications` | ID; report/revision; publication number; decision; artifact/mail digests; audience; correction-of ID | Immutable identity; current visibility is derived, not baked into published status |
| Brand / `report_brand_profiles` | ID/version; asset manifest; font/template digests; usage provenance; state; approval decision | Workspace configuration; approved profile is immutable; revision needs a new decision; no user arbitrary remote asset URL |
| Sender / `report_senders` | ID; provider; configured address reference; verification/readiness; environment | Secrets stay outside DB/commits; sender material changes invalidate policy/send previews |
| Policy / `report_recipient_policies` | ID/version; report scope; audience; sender ID; schedule fields; approval decision; active/paused/revoked | Versions immutable; current head and state mutable under exact checks; C05/C06 |
| Recipient Payload / `report_policy_recipients` | Policy revision; private normalized address; recipient digest; membership or entitlement rationale; expiry | Addresses are operator-private; no CC/BCC or mailing list expansion; normalize domain case only, preserve local-part case, reject duplicate exact normalized addresses |
| Schedule / `report_schedules` | ID; policy revision; due period; next run UTC; timezone/local time; owner decision; state | Unique due-period job; pause/revoke prohibits future jobs; timezone change creates new revision and requires review |
| Job / `report_jobs` | ID; kind; exact input revision; state; lease token/expiry; attempts; deadlines; failure code; output digest | Immutable input binding; fenced completion; owner/policy/source recheck at claim and finalization |
| Delivery / `report_deliveries` | ID; publication; policy revision; recipient digest; sender; authority decision; exact payload digest; provider key; first dispatch; state | Unique publication + recipient digest across policy versions, preventing a policy edit from resending the same publication to the same address |
| Attempt / `report_delivery_attempts` | ID; delivery ID; attempt number; dispatch time; lease token; request digest; response class; private provider message ID | Persist dispatch intent before network; immutable evidence; no new provider key on retry |
| Event / `report_delivery_events` | Provider event ID; verified at; provider message ID; recipient digest; type; occurred at | Unique provider/environment/event ID; append-only minimized evidence; no raw webhook body retention |
| Cleanup / `report_cleanup_jobs` | ID; exact payload revision/file digest; cause identity/generation; lease token; status | Stale jobs cannot delete replacement content; orphan catalog recognizes report objects only |
| Command Receipt / `report_command_receipts` | Scope; actor; request key; action; canonical input digest; result IDs; timestamp | Same key/body replays permitted current projection; changed body conflicts; never stores protected output JSON |

Use an HMAC recipient digest with an environment-scoped key, not a plain enumerable
email hash. Rotation retains key IDs for audit/reconciliation, with no clear addresses
in telemetry. The same canonical recipient identity drives per-publication uniqueness;
rotation must not create a second send identity. Do not merge plus aliases/dots.

## Newly Admitted Sources

Snapshot identity also records the relevant customer/engagement generation watches.
A newly accepted period log/time contribution or changed milestone may not appear
in the old dependency list. Such changes mark the report as needing a fresh review
and surface a late-update/correction indication. New sends wait for a fresh
publication; the old dated snapshot remains readable only if its own sources and
current audience authority still pass. Existing original-source changes
also trigger exact dependency invalidation. Pending/rejected submissions alone do
not change the factual snapshot. A new source never silently enters old content.

## State Machines

### Revision and Publication

`preparing → draft → rendering → review_ready → published`.
Preparation/rendering can end `failed` or `cancelled`. Rejection records a decision
and returns an unmodified revision to draft selection; editing always creates a new
revision. Published identity never changes. Derived visibility overlays are
`current`, `review_required`, `withheld`, `expired`; none rewrites an old approval.
Weekly review_ready requires validated HTML/text; executive requires PDF/PPTX plus
mail body. Brand approval is required to publish, with synthetic fixture approvals
limited to the owned test environment.

### Policy and Schedule

Policy version `draft → approved`, then `paused` or `revoked`. Resuming paused
requires an exact current mcteer decision and current recipients/sender validation;
revoked is terminal and replacement requires a new policy version. Changing any
recipient, scope, audience, sender or timezone/cadence makes a new unapproved version.
Schedules prepare drafts only and require an approved active policy. A pause/revoke
cancels queued undispatched deliveries even when a send was previously authorized.

### Delivery

`authorized → queued → dispatching → provider_accepted → delivered`.
Before dispatch: `blocked`, `cancelled`, `expired` are terminal for that attempt.
After a definitive non-acceptance: `retryable_failure` or `permanent_failure`.
After a timeout/crash post-intent: `uncertain`; never return directly to queued.
A same-key provider recovery attempt inside the safe window may settle uncertainty
only while all authority/source checks still pass. Beyond the boundary, only
verified provider evidence or explicit operator reconciliation can settle it.
A user cannot mark delivered without provider evidence. Operator-confirmed absence
requires evidence/rationale, not a checkbox guess; unresolved absence remains uncertain.

Record later `bounced` or `complained` outcomes without discarding earlier delivered
facts. Fold event history deterministically by provider occurrence/identity, not
arrival order. A later acceptance event cannot downgrade delivered/bounced/complained.
Suppress further dispatch to bounced/complained addresses until a new authorized
policy resolves the suppression; ordinary retry cannot bypass it.

## Transactions and Concurrency

Follow existing source lock order: environment/current actor or durable grant,
customer, sorted original source headers, report scope/current revision, then exact
policy/publication/receipt rows. Publish and send authorization recheck captured
versions under those locks and commit immutable decision/receipt/outbox atomically.
Never call a renderer/provider while holding the transaction. Use skip-locked leased
job claims with a monotonically changing fence token; stale completions discard
staged bytes and cannot alter active output. Bound database-only deadlock retries to
two; external effects never inherit automatic transaction retries.

Scheduled work receives a dedicated server-owned capability containing environment,
workspace, customer, owner decision and policy ID. Do not synthesize a CurrentSession.
New grants cannot expand an existing capability; lost active membership/customer
rights immediately block it. Completed audit remains access-controlled.

## Migration and Access Plan

- 039: scopes, immutable revisions/payloads, dependencies, calculations, artifacts,
  validations, brands, decisions and command receipts.
- 040: senders, versioned recipient policies/payloads, schedules, publications,
  deliveries, attempts and verified events with uniqueness/indexes.
- 041: bounded jobs, worker heartbeat, retention/cleanup functions and grants.

Reserve these numbers against current main schema 038; recheck before implementation
and renumber new files if main has advanced. Runtime gets only required insert/read
and head/state update rights; immutable payload triggers forbid mutation. Cleanup
functions validate environment, lease, exact payload/digest/cause before deletion.
No startup/request migration. Empty and 038 upgrade/recovery tests are mandatory.
