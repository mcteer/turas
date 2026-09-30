# Data model: Delivery plans v1

Contract names: `delivery-plan-v1`, `plan-content-v1`, `plan-command-v1`,
`plan-context-v1`, `plan-diagram-v1`, `plan-diff-v1`. Reuse `evidence-quality-v1`.
All identities are scoped to the selected database environment and workspace.
Canonical content/request hashing normalizes text to NFC and LF, sorts object
keys, preserves array order and hashes UTF-8 JSON. Content digests exclude mutable
review/readiness projections, server decision sections and transient preview IDs.
Versioned canonicalization and diff logic must share these rules.
Planned migrations are 029–031, following merged schema 028.

## Normative validation constraints

The following quoted constraints are copied into their implementation tasks so
limits and state semantics are not left to implementation-time discretion.
Structural constraints (scope, enums, sizes, safe markup, referenced identity and
source authorization) apply to every save. Completeness requirements for section
content, unknown-owner/action fields and the minimum usable design/work plan apply
at submission; an incomplete draft may omit these fields and exposes validation
errors. A supplied factual assertion still requires eligible support at save; an
unsupported assertion must be labeled as an assumption, never accepted_fact.

- **C01 — Scope**: "IDs are UUIDs; customerId and workspaceId are required; workloadId is nullable and, at creation/mutation, references an active accepted workload in the same customer/workspace; audience is internal or delivery and is immutable; ownerMembershipId is an active same-workspace member with current customer access."
- **C02 — Text and size**: "Title is trimmed 1–160 characters; narrative is 1–4,000 characters when present; rationale/changeReason is 1–2,000 characters; stable element keys match [a-z][a-z0-9_-]{0,63}; revision payload is at most 131,072 UTF-8 bytes; unknown object properties are rejected."
- **C03 — Version and time**: "Revision numbers and aggregateVersion are positive safe integers; digests are lowercase 64-character SHA-256 hex; timestamps are ISO 8601 with offsets; asOf is not in the future; planned dates are YYYY-MM-DD or null with a reason; start date cannot follow target date."
- **C04 — Sections**: "Exactly twelve distinct section keys are required: charter, current_state, scope_acceptance, options, technical_design, work_plan, staffing, raid, handoff, measurement, evidence, decision; content sections use content, unknown or not_applicable; unknown requires an owner role and discovery action, and not_applicable requires a reason; evidence and decision are server-derived sections."
- **C05 — Assertions**: "At most 100 assertions and 40 durable source dependencies per revision; assertion kind is accepted_fact, attributed_research, shared_practice, proposal, estimate or assumption; each factual assertion has 1–10 source dependency IDs; assumptions/estimates have an owner role and validation action; decisionCritical is boolean; critical facts require current adequate support and critical unresolved assumptions block acceptance."
- **C06 — Design**: "At most 3 diagrams, each with 1–40 uniquely keyed nodes and 0–80 uniquely keyed edges; edge endpoints reference existing nodes; diagram kind is context or container; labels are plain text 1–160 characters and textEquivalent is 1–4,000 characters; at most 20 design decisions; no HTML, arbitrary SVG, scripts, embedded resources or executable diagram syntax; links are governed artifact references or HTTPS URLs without credentials."
- **C07 — Work and milestones**: "At most 50 work packages and 50 milestones with distinct stable keys; each has title, ownerRole, exitEvidence and track value, production or both; milestone dependencies reference existing milestone keys and form a directed acyclic graph; effort is either unknown with reason or hours with 0 <= minimum <= maximum <= 100000; each milestone has a planned date or unknown reason and customerValidation text."
- **C08 — Solution fit**: "At most 10 reused solutions; each references a durable shared-practice dependency and exactly one assessment for technology, security, delivery, process, adoption and effort_capacity; fit state is compatible, adaptation_required, unknown or incompatible; each assessment has rationale and validation action; recommendation-critical unknown/incompatible fit blocks acceptance."
- **C09 — Decisions and receipts**: "Decision action is accept, request_changes or reject; decision requires exact revisionId, contentDigest, expectedAggregateVersion, reviewPreviewId and rationale; delivery acceptance requires deliverySuitabilityConfirmed=true; requestKey is 8–128 ASCII letters/digits/underscores/hyphens; a review preview expires after 10 minutes and binds actor session, revision and current source-state digest."
- **C10 — Drafting**: "Drafting state is prepared, running, saved, failed, cancelled, expired or unconfirmed; exactly one response attempt and at most one saved revision per drafting attempt; deadline is 120 seconds after dispatch; at most 6 model steps, 4096 output tokens per step, 4 retrieval calls, 24,576 total evidence-context bytes and 40 consumed source dependencies; user instructions are at most 8,000 characters; no automatic paid retry."
- **C11 — Review lifecycle**: "Revision review state is draft, in_review, changes_requested, rejected, accepted or superseded; only a current draft can be submitted; a content edit creates a new draft; only the current in_review revision can receive a first decision; accepted revisions can only become superseded through replacement acceptance; accepted and working pointers are separate."
- **C12 — Pagination and admission**: "List/history page size is 1–50 with default 20 and an opaque scope-bound cursor; plan writes are limited to 30/minute per membership/customer; drafting admission is limited to 5/hour per membership with at most one active attempt per plan; existing conversation concurrency and send limits also apply."

C02 narrative constraints apply to every narrative value below, including section
text, descriptions, evidence explanations, fit rationale and textual equivalents,
unless a narrower C06 label constraint applies. C01–C03 apply to all persisted
identity/scope/version/digest/time fields; C09 applies to decision/receipt fields.
JSON null is used for optional values; do not represent an unknown as a made-up
zero, blank string or current date. Validation returns a stable code and field path.

## Entities and relationships

### delivery_plans

Identity and pointers only: `id`, `environment_id`, `workspace_id`, `customer_id`,
nullable `workload_id`, immutable `audience`, `owner_membership_id`,
`created_by_membership_id`, `aggregate_version`, nullable `working_revision_id`,
nullable `accepted_revision_id`, nullable `engagement_id`, `created_at`, `updated_at`.
Title lives in payload so source withdrawal cannot leak it through list metadata.
Creation always inserts an initial draft revision atomically. A later workload
merge blocks new authoring/acceptance without silently rebinding scope; authorized
historical reads still show the original scoped identity under source gates. Pointer targets must
belong to the same plan; scope and audience never change. A partner can mutate
only a delivery plan it created, while internal authors can mutate any scoped plan.
Owner changes require current owner eligibility and a new revision/audit event.
A partner cannot edit a working head authored by someone else and hidden from it;
return a generic review-in-progress conflict rather than its content or version.
A new draft from an accepted baseline is allowed only when no hidden working head
would be overwritten.

`UNIQUE(engagement_id)` when non-null enforces one plan per engagement. It does not
prevent multiple separate plans/engagements for one customer. Composite scope keys
and foreign keys prevent cross-customer/workload linkage.

### plan_revisions and plan_revision_payloads

Immutable revision metadata: `id`, `plan_id`, `revision_number`, nullable
`parent_revision_id`, nullable `base_accepted_revision_id`, `author_membership_id`,
`template_version`, `content_schema_version`, `content_digest`, `context_digest`,
`evidence_quality_version`, `as_of`, `created_at`, `origin` (`manual` or `agent`),
nullable `drafting_attempt_id`. Enforce unique `(plan_id, revision_number)` and
unique non-null drafting attempt result. Parent/base must be earlier same-plan
revisions. `origin=agent` requires a drafting attempt; manual forbids it.

Separately deletable payload keyed by revision ID contains title, section
content, assertions, diagrams, design decisions, work packages, milestones,
solution fits and changeReason. An initial revision has null changeReason;
every later revision requires it. Payload content cannot be updated. Controlled
cleanup deletes payloads; the revision digest and allowed decision metadata remain.

Content references exact profile/source/artifact/shared revisions, never a URL as
proof. External design URLs are inert references and never fetched during save.
The actual plan uses source-linked assertions; prose cannot bypass their eligibility.

### plan_source_dependencies

Immutable dependency records: plan revision, local dependency ID, source kind
(`accepted_profile`, `approved_excerpt`, `verified_research`, `shared_knowledge`),
original revision identity, generation, content digest, sanitized locator, assertion
keys, quality/date inputs and whether included in model context. Use original
source IDs and permitted minimal metadata, not an FK to an expiring search receipt.

All model-consumed dependencies form a revision-wide union, even if the final
proposal cites only a subset. Expand transitive support into separate restricted
`plan_private_dependencies`, readable only by policy code/current source reviewers.
Shared reader DTOs never contain private lineage IDs, customer names or counts.
Source identity/digests survive allowed content purge as minimal dependency audit;
retain no raw source excerpt in these metadata rows. Resolve current allowed
passages from original sources when the reader asks for a citation.

### plan_revision_events and plan_review_previews

Append-only events record revision transition, actor, timestamp and operation ID.
Rationale and change explanation reside in separately purgeable event payloads;
a source-sensitive rationale is not placed in a permanently public receipt.
Read state from latest event under aggregate version checks. A saved edit marks
an older in-review draft `changes_requested` with a system supersession reason,
then points to the new draft; it does not reject or supersede an accepted baseline.

A review preview is created by an explicit authorized POST and stores ID, session,
member, plan/revision, digest, aggregate version, source-state digest, expiry and
used decision ID. It does not contain prose. All decision actions require it;
acceptance additionally requires passing readiness and audience attestation.
Idempotent replay can return the original decision after preview expiry; a new
operation cannot use an expired or already-used preview.

### plan_decisions and plan_command_receipts

A decision records exact plan revision/content digest, actor member/principal,
action, source-state digest, time, nullable engagement/baseline IDs and the receipt
key. Rationale is stored in a purgeable decision payload with the revision's access
and source fences. One first human decision per submitted revision. A rejected or
changes-requested revision is repaired by a new revision, never decided again.

A command receipt is uniquely keyed by environment/workspace/actor/requestKey;
its canonical request digest includes action and all scoped inputs. It stores
only object IDs, resulting versions and outcome code. Scope authorization precedes
receipt lookup/output. Retain the request digest/key tombstone after any payload
retention so key reuse cannot recreate work. No memory-only fallback.

### engagements

Canonical ID, environment/workspace/customer, nullable workload, linked plan ID,
nullable active baseline ID and created/updated timestamps. One linked plan ID is
unique; baseline and plan have the same scope and immutable audience. Creation
from acceptance requires no extra fact-approval step and inserts no profile claim.
Descriptive 003 engagement references remain unchanged and cannot be passed as a
canonical engagement ID without a matching canonical row.

The 006 public projection exposes identity, accepted plan version, baseline and
current review-required status, plus eligible title/summary. Execution phase and
progress are absent; future 008 will introduce them separately.

### milestone_baselines and milestone_baseline_payloads

Immutable baseline identity, engagement ID, plan/revision ID, baseline number,
content digest, decision ID and accepted time; unique accepted revision and
`(engagement_id, baseline_number)`. Payload contains the exact accepted milestones,
work packages and their stable keys. Same revision source fence controls this
payload, including derived title/effort/exit text. Baseline state is current or
superseded via engagement pointer and append-only acceptance history; no in-place
rewrite or actual progress fields. Removed milestones remain in the earlier set.

### planning_conversation_bindings and plan_drafting_attempts

Planning binding has unique owned conversation ID, customer/workload, effective
audience and plan ID. It is immutable and inserted before native context capture.
Do not transform an existing conversation; create a fresh one. One admitted attempt
references exact plan/base revision, owner/session, response attempt, instructions
payload, request digest, deadline, step/retrieval counters, context bytes and source
union, nullable result revision, safe error category and timestamps.

Admission is an explicit user action through the authenticated UI/API. The server
creates and dispatches the owned turn using 002's durable send path; model-supplied
scope is never authority. `prepared → running → saved|failed|cancelled|expired|unconfirmed`.
A cancellation wins over a later save by locking the attempt; saved is immutable.
A lost acknowledgement after save remains saved, with separate conversation status.
A crash after uncertain provider admission yields unconfirmed and no automatic new
turn. A new user retry uses a new attempt/key and current evidence.

`plan_model_step_receipts` records attempt/turn/step identity, admitted operation,
provider start/completion state and observed usage, without prompt/output content.
A step is admitted once, consumed once and never reissued after an ambiguous
provider outcome. The model wrapper clamps every planning call's output token
setting, and a throwing dynamic model resolver prevents a seventh model step.

### Cleanup and telemetry

Extend existing bounded maintenance with plan payload tombstones/cleanup jobs;
new table only if the existing job envelope cannot represent the entity. Jobs
carry exact revision/generation, reason and retry state. Logical denial happens
on each read immediately, independent of the cleanup queue. Delete affected
payload copies, event/decision rationale and baseline copies in batches of 100;
retries use exact IDs and cannot delete replacement revisions.

Keep accepted history until existing authorized source/customer retention actions
require payload deletion. No new broad TTL silently deletes accepted plans.
Unused review previews expire after ten minutes and can be removed after 24 hours;
terminal drafting instructions can be purged after 30 days, while minimal result/
request-key metadata remains. Metrics include safe operation ID, state transition,
latency, conflict/invalidation code and reported usage; no title, query, URL or prose.

## Submission and acceptance semantics

Submission requires every content section resolved to content or a justified
not-applicable/unknown envelope, with no blank required narrative. The charter
names the proposed problem, desired outcome and accountable delivery owner;
work plan includes at least one milestone; technical design includes at least one
diagram, one alternative, one decision and rollback/testing/ownership considerations.
Unknown real-world sponsor, baseline or target is represented as discovery work,
never invented. The reviewer must mark recommendation dependencies explicitly;
any unresolved dependency material to the proposed commitment blocks acceptance.
A plan scoped to discovery may commit only to the discovery work, not an unsupported
implementation outcome. Evidence and decision sections are generated by the server;
“pending decision” is a valid section before the human decision exists.

Stable milestones survive revisions through explicit keys; reusing a key for an
unrelated deliverable is rejected by comparison unless the revision describes it
as a replacement (new key). Content diff is deterministic `plan-diff-v1`, never
model-generated evidence of what changed.

## Read projection and immutability

The currently authorized audience and source closure are rechecked for list titles,
detail, history, diff, citations, engagement/baseline reads, tools, stream and replay.
A partner receives accepted delivery revisions and its own drafts only; another
author's working head is not exposed through counts, diff or pointer metadata.

Source prohibition or inaccessible dependencies suppress the entire dependent
body; show only scope-authorized minimal metadata and generic review-required
reason. Freshness-only aging exposes the historical body with dated warnings, but
not as a current recommendation. Retention may remove body permanently; both states
have recovery actions without disclosing a hidden source. Enforce immutability
with database constraints/triggers and narrow runtime grants as well as domain code.
