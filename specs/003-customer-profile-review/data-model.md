# Data model: customer profiles and governed context

Status: Phase 1 design, 2026-09-27. Names below are proposed additions to existing
PostgreSQL tables. All timestamps are UTC instants; displayed observation periods
retain their supplied date precision. IDs are server-created UUIDs. No client or
model selects workspace, author, accepted status or trusted origin.

## Shared envelope and scope

All customer-scoped entities carry `workspace_id`, `customer_id` and, where
applicable, `workload_id`. Composite foreign keys enforce matching workspace and
customer. IDs are never sufficient authorization. Every user-facing read applies
current session and customer access before payload, search, counts and pagination.
No raw cross-customer evidence link is permitted in 003.

| Entity | Fields and relationships | Invariants |
| --- | --- | --- |
| Existing `customer_references` | Existing stable ID, workspace, display name, synthetic flag; existing grants/conversations keep their references | Accepted customer-detail name changes synchronize `display_name` in the approval transaction; submitted names do not change the directory |
| `customer_profile_state` | One row/customer; `version`, `internal_generation`, `delivery_generation`, timestamps | Generation changes are transactional; hidden internal-only changes do not advance delivery generation |
| `customer_workloads` | Stable ID, customer/workspace, accepted display name, lifecycle, optional `merged_into_id` | Merge target is same customer, no cycles; preserve historical scope and IDs, never relabel old evidence as belonging to target |
| `customer_stewards` | Customer, internal membership ID, active state, version, assigned by/at | Unique customer/membership; active internal members only; admin role remains override; partner never steward |
| `profile_records` | ID, scope, immutable `kind`, accepted-head `version`, private candidate sequence, `current_accepted_revision_id`, created by/at | One accepted head per record; hidden candidate submissions do not change partner-visible head versions; scope/kind changes require a new record with explicit relation |
| `profile_revisions` | ID, record, private monotonically increasing revision number, `base_accepted_revision_id`, payload schema version, typed payload, author, origin, audience, data category, observed/effective/review dates, source references, content digest | Payload/provenance immutable; unique record/revision; manual input always pending until a decision |
| `profile_review_decisions` | Revision, accept/reject, reviewer membership, rationale, partner-safe reason, partner-safe restricted-source attestation, timestamp, command receipt | Unique revision: one initial review outcome; no accepted pointer may refer to a rejected revision |
| `profile_lifecycle_events` | Record/revision, event type, previous/new head, actor, rationale, command receipt, time | Append-only supersede/retract/identity-merge events; these do not overwrite initial review decisions |
| `profile_retraction_requests` | Accepted revision, requesting contributor, reason, state open/resolved/declined, resolving event/decision | Request does not change eligibility; exact target must still be current when resolved |
| `profile_command_receipts` | Workspace, customer, actor, request UUID, action, canonical payload digest, response IDs/version and status | Unique workspace/actor/request key; different digest/action is 409; authorization rechecked before replay |

`pending`, `accepted`, `rejected`, `superseded` and `retracted` are derived from
immutable review/lifecycle records plus the accepted head; a mutable status index
may be maintained transactionally but is not an independent truth source.
A later retract event is compatible with the spec's one initial effective
accept/reject decision per revision.

Candidate sequence numbers are internal-only. Partners receive opaque revision IDs
for their own proposals and delivery-visible accepted heads, not global revision
counts. `expectedRecordVersion` refers to accepted-head concurrency; candidate
decisions also check the exact immutable candidate ID and absence of an initial
decision. Hidden pending/rejected activity never changes partner-visible versions,
cursor contents or stale-error details.

## Canonical record identity and current selection

Enforce server-derived natural keys with database unique indexes, including NULL
workload scope as one customer-wide scope (NULLS NOT DISTINCT or equivalent):

| Kind | Unique record key within workspace/customer |
| --- | --- |
| `customer_details` | Kind; workload must be null |
| `workload_details` | Kind + required workload ID |
| `product_use` | Kind + nullable workload ID + immutable product key |
| `maturity_assessment` | Kind + nullable workload ID |
| Other seven kinds | Independent server UUID; multiple records are intentional |

Product keys are trimmed lowercase ASCII identifiers matching
`[a-z0-9][a-z0-9._-]{0,79}`; display names are not keys. Changing product identity
requires a new record and explicit relation, never mutating the key. Existing
identity/bootstrap paths use these same roots. Merge preserves old workload keys
and evidence; it does not merge or transfer product/maturity heads.

`propose_record` resolves or creates the keyed root under the customer guard, then
adds a Pending candidate even if that root already has hidden candidates. It never
returns a duplicate-exists signal, hidden counts, or another candidate. Reuse must
pass normal audience/category policy; it cannot widen an internal root. Hidden-only
roots remain private until an authorized projection permits them. First acceptance
uses explicit null head/version 0; later acceptance requires the actual current
head/version. A race cannot create two roots or overwrite a head silently.

The overview reads only each root's accepted pointer. Product state and the complete
six-dimension maturity assessment change together by accepting a replacement
revision; observation windows are revision data, not new record keys. The most
recently approved replacement is current, never a timestamp-based selection or an
average across records. Older observation windows require an explicit reviewer
acknowledgment before replacing newer ones. Retraction leaves the slot Unknown;
it never falls back to an older revision. Retracting details also resets the
denormalized directory/workload label to `Unknown customer/workload` in the same
transaction; stable IDs and grants remain intact. Other seven kinds display all authorized
current heads as a list, not an inferred singleton.

## Typed profile payloads

Every kind uses the same manual review gate. Payload schemas reject unknown fields.
Shared bounds: title 1–160 characters, narrative at most 8,000, rationale 1–2,000,
at most 20 evidence references, payload at most 32 KiB; command body at most 64 KiB.
Use record IDs for links and allow only `https` public source URLs without embedded
credentials. No URL is automatically fetched in 003.

| Kind | Required/optional domain fields |
| --- | --- |
| `customer_details` | Proposed display name; optional business description, objectives, region and aliases; no inferred adoption |
| `workload_details` | Proposed name, purpose, owner reference, boundaries; optional merge-target relation requiring steward review |
| `stakeholder` | Name/role, delivery responsibilities, optional synthetic contact detail; explicit delivery/internal classification |
| `product_use` | Product key/display name; actual/evaluating/planned/retired/unknown state; usage description, scope, observed time, owner reference |
| `maturity_assessment` | Scope, observation start/end, assessor, rubric version, optional justified journey stage; six dimension entries, next capability and review date |
| `risk` | Category, description, owner, likelihood 1–5, impact 1–5, severity low/medium/high/critical with rationale, mitigation, open/mitigating/resolved/accepted status, observed/review dates |
| `engagement_reference` | Title, past/current/future timing, optional dates, authorized reference ID and independent delivery phase; no time entries, allocation or execution controls |
| `decision` | Decision statement, rationale, effective date, accountable owner, evidence |
| `outcome` | Outcome statement, measure/unit/period if quantified, baseline and comparison if supplied, evidence; unknown baseline remains explicit |
| `next_review` | Subject/record reference, review owner, due time and action; administrative completion is tracked without inventing outcome facts |
| `claim` | Exact submitted claim text, optional title, declared source/excerpt and scope; optional private chat lineage |

Identity shells are administrative anchors, not accepted facts. For an ordinary
new customer/workload, create a pending details revision and use a neutral
`Pending customer/workload` label until approval; only internal admins create new
customer anchors, and internal contributors may propose workloads. Do not grant
partners new customer shells before identity acceptance. Existing 002 synthetic
names are backfilled with fixed `authorized_system` provenance. Demo provisioning
must be idempotent, synthetic-only and unable to overwrite accepted user revisions.
Manual renames follow the normal pending lifecycle for all entry points, including
maintenance scripts.

Maturity rubric `customer-maturity-v1` preserves stages Explore, Activate,
Accelerate, Optimize, Scale, Transform. Stage is an evidenced narrative choice,
never a computed average. Dimension keys are outcome_ownership,
delivery_collaboration, experience_adoption, operational_trust,
platform_organization and innovation_ai. Each has state Unknown/Emerging/
Established/Measured/Scaled/Adaptive, rationale, evidence revision IDs and next
capability. Unknown requires a missing-evidence explanation rather than a fabricated
citation. Non-Unknown assessments require eligible support. A versioned authored
rubric documents state definitions and the legacy stage evidence criteria without
copying unrelated product recommendations. Observation start must not exceed end;
review date must follow the observation window. A future review is valid; a future
observation is invalid.

## Evidence, quality, lineage and conflicts

| Entity | Fields and relationships | Invariants |
| --- | --- | --- |
| `evidence_sources` | Stable source ID, scope, origin, immutable canonical location, creator/research actor | Origin is server-assigned and immutable |
| `evidence_source_revisions` | Source version, location/title, retained passage, supported claim, digest, publication/observation/event/retrieval dates, rights, audience, active/withdrawn state through events | Exact retained passage supports claim; no mutable URL-only proof; origin cannot be changed by fetching a manual link |
| `evidence_source_events` | Exact source revision, lifecycle version, withdraw/supersede event, actor, rationale, receipt and time | Append-only; withdrawal works for research with no profile record and invalidates dependent context atomically |
| `profile_evidence_links` | Exact profile revision → source revision or supporting profile revision; support role, scope explanation | Same authorized customer; no cycles; source revisions are pinned, not silently upgraded |
| `research_checks` | Source revision, trusted ingest identity, check version, identity/scope/integrity/content results and rationale | All required checks pass before `researched` eligibility; no client/model origin selection |
| `evidence_quality_snapshots` | Claim/source revision, rubric version, R/D/C, rationales, information type, date basis, `as_of`, computed F/Q/band/freshness | Append-only historical snapshot; current quality recomputed with clock, not assumed from latest stored Q |
| `evidence_conflicts` | Exact conflicting revision pair, scope, open/resolved state via events, rationale/resolution actor | No hidden counterpart metadata in partner projection; resolution needs current steward/admin authority |
| `evidence_conflict_events` | Conflict ID, monotonic version, flag/confirm/resolve event, actor, rationale and time | Append-only conflict decision history; the conflict row is a current-state pointer |
| `profile_private_lineage` | Submitted claim revision → owner conversation/message ID and exact span/digest | Internal service validation only; stewardship does not grant access to another user's chat |
| `profile_audit_events` | Actor, action, scope, opaque target IDs, receipt, state transition and time | Append-only; minimal authorized user-facing projections, no raw private chat content |

Research has origin `independent_research` and evidence state `researched`; it is
never relabeled `accepted` merely because checks passed. Manual changes to research
produce manual pending claims/corrections. Trusted fixture ingestion is a separate
non-public domain entry point with captured checks and provenance; it cannot be
called through an ordinary user request.

### Rating input ownership and lifecycle

Each claim/source revision carries immutable `qualityInput`: rubricVersion
(`evidence-quality-v1`), R/D/C integers 0–4, a rationale (1–2,000 characters) for
each, informationType (`account_status`, `product_availability`,
`product_capability`, `adoption_process`, `architecture`, or `unknown`), and dateBasis
(`observation`, `publication`, or `unknown`) with an exact supporting revision ID
when the date comes from linked evidence. Date values must match retained evidence;
retrieval/event dates cannot be selected. Unknown informationType or dateBasis
produces F=0/Unknown; it cannot silently select a favorable window.

Contributors, including the proposal tool, may supply tentative inputs; omitted
inputs become R/D/C=0 with explicit missing-input rationales and unknown type/basis.
Those defaults are persisted in the candidate and its digest, not filled after
approval. Server provenance records proposer identity/time. Steward/admin acceptance
confirms the exact rating inputs with the rest of the candidate; no separate
rating-write or score-override permission exists. UI labels unaccepted ratings
Proposed. A steward changing any rating, rationale, type or basis must create a new
Pending revision and approve that exact revision. The old accepted input remains
current until replacement. F/Q are server-computed and rejected as client inputs.

Trusted fixture research ingestion supplies the same required input envelope with
captured ingest identity/time and checks; it cannot inherit trust from a source
label. Re-ingestion creates a new immutable source revision through the trusted
path. A human correction to research ratings follows the manual Pending claim path,
never edits the independently researched revision. Existing pinned dependents are
not silently upgraded. Snapshots reference the exact target/input revision and its
proposer or ingest actor, plus the acceptance decision where applicable; clock-only
recalculation changes no R/D/C inputs. Store claim-specific ratings, not a universal
rating for a URL. Projection recomputes from visible support and suppresses private
rating rationales; hidden evidence cannot inflate a partner-visible score.

Quality uses Q = round(25 × (0.40R + 0.30F + 0.20D + 0.10C)). R/D/C meanings and
review windows follow `docs/evidence-policy.md`. Derive age from the retained,
explicitly chosen observation/publication basis; never retrieval alone. F is 4
through one window, 3 through 1.5, 2 through two, 1 beyond two, and 0 for unknown or
invalid dates. An overdue explicit review caps F at 1 and labels Stale; missing date
remains F=0. Retain separate future event dates. Current reads return `asOf` and
`validUntil`, the next future score/freshness/review boundary, capped at 24 hours
after the snapshot. Ignore already elapsed transitions when choosing this deadline;
already stale or empty context remains usable with accurate labels until a future
boundary or that cap, rather than immediately invalidating each new conversation.
Partner projections recompute only from authorized supporting data.

Retraction, source withdrawal and supersession invalidate the old source for
current use. Do not rewrite an approved assessment's payload: show it historically
with `unsupported`/`conflicted` status and omit it from settled factual guidance
until re-reviewed. A material conflict blocks a settled claim even when scores are
high. Source eligibility and audience apply transitively to derived records.
A visible fact whose private source cannot be shown may have a restricted-source
label and safe reviewer attestation; never expose a hidden URL, passage, actor or
conflict counterpart. If no safe visible support/attestation exists, omit it from
partner factual guidance and show a non-identifying limitation.

## Audience and authority

`internal` is the default candidate audience. `delivery` means needed for the
assigned customer engagement and must be confirmed in the exact accepted revision.
A separate data category identifies delivery context, internal operations,
commercial, personnel or other internal content. Stewards inspect prose and source
material when confirming category/audience; the application rejects incompatible
category/audience pairs and never relies on model-driven redaction as that decision.
A reviewer changing payload/audience creates a new candidate and reviews that
version; nothing is edited in place. Internal staffing, utilization, personnel
costs, commercial notes and internal reporting metrics are hard-excluded, regardless
of a requested delivery flag. Contributors cannot declassify internal accepted data.

Internal readers can see all workspace customer profiles and their profile review
history, but never another user's private chat. Partners see current delivery
accepted records and eligible research, plus their own pending/rejected submissions
and safe decision reasons. Other contributors' pending/rejected/superseded/retracted
content and internal decision notes are not returned. Historical delivery versions
that are no longer current are not partner factual context. Counts/cursors follow
the same filtered set; no unfiltered total or internal audit endpoint is exposed.

## State transitions and transaction rules

1. Submit creates an immutable pending candidate and receipt; it does not change the
   accepted pointer or factual context generation. Authorized users can propose an
   exact owner-chat span; surrounding chat stays private.
2. Accept requires current steward/admin authority, exact candidate ID/digest,
   `expectedRecordVersion` and `expectedAcceptedRevisionId`. Validate sources and
   audience, write initial decision, supersede old head, set new head, sync approved
   identity names and bump affected generations atomically.
3. Reject creates one initial decision and safe reason; accepted head is unchanged.
4. Request retraction creates a request only. Steward/admin retraction verifies the
   exact current head/version, records rationale/event, clears head and invalidates
   dependent context. Declining a request records a reason without withdrawing facts.
5. A repeated authorized request with identical action/digest returns its receipt.
   Reusing the key for different content is 409. An older accepted-head/version is
   409 with safe current version information; no last-write-wins overwrite.
6. Review rejection is terminal for that candidate; a revised proposal gets a new
   immutable revision and new initial decision. Withdrawing a source never revives
   a superseded profile revision.

Use one lock order for affected profile, access and conversation paths: acting and
affected membership rows in sorted ID order; then principal, login session,
workspace and partner-organization rows; then customer profile-state rows in sorted
ID order; then grant/steward rows; then conversation/attempt rows; then profile
record/source rows in sorted ID order. Acquire the customer guard before looking up
or creating a steward row. Refactor `access/service.ts` and
`conversations/binding.ts` (including callers that currently lock conversations
first) to this common order. Membership revocation can stop at its authority guard;
grant/steward changes use the customer guard. No profile mutation locks a native
session or waits on runtime work.

Approval checks exact supporting source revisions, lifecycle and confirmed conflict
state while holding the same customer guard as source withdrawal/conflict changes.
Thus approval cannot commit against concurrently withdrawn support. Validate
accept-versus-source-withdrawal and accept-versus-steward-revoke explicitly.

After authority locks, acquire a transaction-scoped advisory lock for the actor and
request key, then check for a final receipt. For a new request, perform the mutation
and insert its completed immutable receipt in that transaction. There is no committed
unfinished reservation and no receipt update privilege. A unique key is a second
guard; advisory-key collisions only serialize unrelated commands. Roll back all
changes on failure.
Set bounded lock/statement timeouts and return retryable unavailability for exhausted
contention. Never hold those locks over model/network calls.

## Conversation context fence

Extend conversations/attempts with internal-or-delivery generation, snapshot schema
version, `valid_until` and reference to server-bound authority (login session ID,
membership, owner/customer/environment). Do not store auth cookie tokens. Snapshot
citations identify exact accepted/source revisions supplied to a turn. An attempt
cannot choose its own customer or authority through tool arguments.

`context_snapshot_receipts` records attempt/conversation, authority reference,
audience generation, `as_of`, `valid_until`, schema version, projected snapshot
digest, exact citation IDs and completeness/truncation. It is private server state,
not a partner-readable count or audit feed. Resolve the first snapshot through the
shared domain at `turn.started` and inject labeled user-role context; the
`step.started` guard validates the receipt and current authority before every model
step. Preserve original user-message digests. Tests must prove failed/missing
injection cannot permit a model step with an unvalidated snapshot.

Approved/retracted/reclassified/withdrawn material and material conflict changes
advance internal generation; advance delivery generation only when delivery context
is affected. Changes to a hidden source used by a delivery fact also count as a
delivery change, with only a generic “context updated” notice. Time expiry is checked
independently of writes. Authentication and grants are always checked separately.

A mismatch or expired deadline denies continuation/model-step/tool/native replay, stops future
stream release and marks the turn/context stale. No automatic retry or summary
transfer. The owner starts a new conversation with fresh context. Preserve old
messages in storage; stale generated/tool bodies are not re-served through app or
native history, even if a native compacted summary exists. Owner-authored messages
can remain visible with a context-updated banner under current customer access.
No current accepted head is inferred from old conversation text.

## Migration, indexes and immutability

Add 007 for profile/evidence/review tables and 008 for fences/attempt authority.
Update manifest, schema readiness, runtime grants and fixture initialization.
Protect revision payloads, decisions, receipts and events with insert/read-only
runtime privileges or invariant triggers; mutable pointers use separate tables.
Existing migrations stay unchanged. The runtime role must not gain schema control.

Index customer/workspace/kind/current-head, workload/customer, pending candidates,
submitter/audience, stewardship, conflict endpoints and source dependency links.
Use stable `(created_at,id)` keyset pagination and scoped `ILIKE` text search for
this bounded dataset; no vector index or cross-customer raw search. Apply permission
predicates before limit/count. Two concurrent accepts, accept versus revoke,
retract versus read/stream, and duplicate source ingestion require integration tests.
