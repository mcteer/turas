# 008 data model

Status: implementation in progress. Explicit migrations 036–038 have been exercised
in owned disposable databases from empty, 034 and 035 fixtures. Preview execution
upgrade remains pending. All tables belong to the existing governed Postgres domain.

## Canonical identities and storage groups

Every aggregate carries `environment_id`, `workspace_id`, `customer_id` and
`engagement_id`; workload derives from the existing engagement. Composite foreign
keys include those scope columns. Never trust customer/workload IDs supplied beside
an aggregate ID. Retain 006 `engagements`, `milestone_baselines`, accepted plan
revisions and 007 resource/allocation/calendar identities as references, not copies
with new authority. A baseline item is `(baseline_id,item_kind,item_key)`: 006 stores
string keys inside immutable content, not separate item UUIDs.

| Migration | Tables and purpose |
| --- | --- |
| `036-execution-records.cjs` | `execution_workspaces`, `execution_baseline_bindings`, `execution_baseline_items`, `execution_records`, `execution_record_revisions`, `execution_record_payloads`, `execution_record_sources`, `execution_review_decisions`, `execution_review_payloads`, `execution_milestone_heads`, `execution_milestone_events`, `execution_milestone_payloads`, `execution_reconciliations`, `execution_reconciliation_items`, `execution_command_receipts`, `execution_rate_windows` |
| `037-execution-time-effort.cjs` | `execution_time_entries`, `execution_time_revisions`, `execution_time_payloads`, `execution_time_decisions`, `execution_time_decision_payloads`, `execution_resource_days`, `execution_actual_days`, `execution_effort_heads`, `execution_calculation_receipts` |
| `038-execution-advice-lifecycle.cjs` | `execution_advice_bindings`, `execution_advice_attempts`, `execution_advice_dependencies`, `execution_advice_reads`, `execution_advice_steps`, `execution_advice_usage`, `execution_cleanup_jobs`; add source-invalidation/cleanup indexes and narrow role grants |

Header/revision/decision metadata is immutable except explicit mutable head and
state columns. Put user-authored prose/evidence excerpts in separately purgeable
payload tables. Runtime cannot UPDATE/DELETE immutable revisions/decisions; heads
change through guarded transactions. Cleanup role owns payload deletion and its
queue, not numerical actuals or decisions. Audit metadata may contain only IDs,
bounded categorical codes, dates, units, hashes and amounts of minutes—not titles,
notes, names, acknowledgement prose, source URLs or financial amounts.

## Normative field constraints

Each C clause is quoted in its implementation task. Additional state/transaction
rules below are equally normative.

**C01**: All IDs are UUIDs except baseline item keys, which use the existing 006 key grammar; revision numbers and expected versions are positive integers, digests are 64 lowercase hex characters, request keys are UUIDs, and every mutation rejects unknown fields and requires an exact current version plus a 1–2000-character rationale for review decisions.

**C02**: Record kind is activity, raid, decision, scope_change, effort_budget, estimate, handoff, closeout or outcome; title is 1–200 characters, narrative is 1–8000 characters, audience is internal or delivery, references are 0–20 exact eligible source revisions, optional work-package and 0–20 milestone links use keys from the same bound baseline, and record state is draft, submitted, accepted, rejected, superseded or retracted.

**C03**: Execution date strings are real ISO calendar dates; event timestamps are UTC instants; evidence event dates cannot be future dates in their declared IANA timezone; planned dates may be future; owner membership is nullable with a required 1–500-character unknown-owner reason, and any selected owner must be active in the same workspace with current access to the customer.

**C04**: Milestone identity is an exact accepted baseline plus milestone key; status is not_started, in_progress, blocked, ready_for_review, accepted or waived; decisions are start, block, resume, request_review, accept, waive or reopen; accept requires 1–20 eligible reviewed evidence references and waiver requires a 1–2000-character rationale; changing owner or planned date creates a reviewed execution revision without altering the plan baseline.

**C05**: Time revision includes resource ID, author membership ID, exact baseline/work-package key, service date, resolved IANA timezone and timezone-data version, 1–1440 integer minutes, billable boolean, one activity revision ID, optional allocation revision ID, and a 1–2000-character private note; on-behalf entry and each unplanned, over-capacity, unknown-capacity, unavailable-source or post-closeout exception require separate 1–2000-character reviewer rationale.

**C06**: Time state is draft, submitted, approved, rejected, superseded or reversed; only one approved revision per entry counts; approval batches contain 1–25 distinct entry/revision pairs and are atomic; approved daily minutes across all customers cannot exceed 1440 for one resource and service-date key; an exact correction replaces the old counted revision in the same transaction.

**C07**: RAID type is risk, assumption, issue or dependency; status is open, monitoring, resolved or accepted_exception; severity is low, medium, high or critical; each item has a due/review date or explicit unknown-date reason, an owner or unknown-owner reason, and closure requires reviewed evidence or an explicit accepted-exception rationale; decision records contain decision date, decider, rationale and optional 1–20 superseded decision IDs.

**C08**: Scope-change state is proposed, approved_for_planning, rejected, implemented or withdrawn; its exact old baseline is mandatory, replacement baseline is optional until implementation, and reconciliation maps each old work-package/milestone key once to one new key or retired while each new key is mapped once or added; many-to-one and one-to-many mappings are rejected in version 1.

**C09**: Effort budgets and estimates are whole integer minutes from 0 to 6000000 per work package; budgets bind an exact baseline/work-package key, estimates add an as-of UTC instant and explicit zero-remaining assertion when zero; estimates older than 7 UTC calendar days or preceding a current baseline reconciliation are stale; missing or stale inputs yield incomplete forecast values.

**C10**: Handoff/closeout records contain 1–50 deliverable/criterion references, receiver kind internal or external, a 1–200-character receiver label in private payload, acknowledgement state not_recorded or recorded with an event date and eligible evidence when recorded, 0–50 open-obligation IDs; outcome records have status observed, not_measured or inconclusive, and outcome decimal values are signed strings with at most 12 integral and 6 fractional digits, measure/unit are 1–80 characters, and measurement start is not after end. Observed outcomes require a current measured value, measure/unit, ordered measurement window and 1–20 eligible evidence references; baseline/comparison values may be null only with a 1–2000-character unknown reason; not_measured/inconclusive outcomes require a 1–2000-character limitation reason and must not invent values or dates.

**C11**: List page size is 1–50, execution view periods are 1–91 inclusive dates, JSON command bodies are at most 128 KiB, read responses at most 256 KiB, record history at most 50 revisions per page, review previews expire after 5 minutes, cursor tokens expire after 10 minutes, and list/snapshot overflow returns an explicit error rather than silently omitting eligible data.

**C12**: Advice binds one fresh internal conversation to one engagement and active baseline, one 1–91-date period and one execution generation; limits are 6 provider steps, 6 tool reads, 4096 output tokens per step, 120 seconds, 24576 cumulative UTF-8 bytes across initial context, tools and procedure loads, 200 dependency identities and 5 admissions per hour per membership; settlement remains available after cancellation, revocation and disable without releasing content.

## Aggregate rules

### Workspace and baseline bindings

Unique `execution_workspaces(environment,workspace,engagement)` tracks revision,
current execution baseline and generation. It starts `active`, later `closed` or
`review_required`; this is administrative execution state, not a maturity stage.
Setup can only materialize readable current accepted baseline items. Metadata keys
are immutable; copied titles/criteria are purgeable and retain exact source lineage.
The latest 006 baseline pointer is authoritative on every read/write, so a missed
worker notification cannot make old execution current. Reconciliation retains old
bindings, creates a new binding and marks all carried milestone completion unaccepted.

### Reviewed records

One stable header, immutable authored revisions, one current proposal pointer and
one accepted pointer. A correction creates a new pending revision; it does not change
the accepted pointer. Accept atomically supersedes the prior accepted revision.
Reject affects the submitted candidate. Retract clears current acceptance, retaining
identity. Accepted RAID resolution/decision supersession is itself a reviewed
revision. An owner label is not an authorization delegation. Partner drafts are
forced to delivery audience, visible only to the author and reviewer before review.
Internal drafts are likewise author/reviewer only. Review cannot broaden a source's
original audience; internal evidence requires an internal record. Independent
research may support attributed statements, never unverified private events.

### Milestones and dates

Milestone heads point to append-only events and accepted execution records. Allowed
transitions: not_started→in_progress (start); in_progress→blocked (block);
blocked→in_progress (resume); in_progress/blocked→ready_for_review (request_review);
ready_for_review→accepted (accept); any nonterminal→waived (waive);
accepted/waived→in_progress (reopen). Each event is a reviewer decision except
request_review, which contributors may propose and the reviewer accepts as an event.
No automatic transition on logged hours, date passage, allocation or tool output.
Accepted status with lost supporting eligibility becomes `reviewRequired=true`;
visible status is `review_required`, a projection overlay, not an invented event.

### Time entries and date ledgers

A subject resource has at most one linked member, using 007 uniqueness. Contributor
access is current; historical subject linkage and attribution are immutable. Raw
notes/revisions are visible to reviewer and current author/subject only when customer
scope allows it. Reviewer can use identity-only subject selection after inactivation.
Contributors cannot change subject resource; reviewer on-behalf correction can with
rationale. No deletion endpoint exists for approved entries.

Stable `execution_resource_days(environment,workspace,resource,date)` rows are
created with INSERT ON CONFLICT before approval and locked in sorted order. They
store the date's canonical timezone identity established by the first approval;
later approvals on that resource/date must use it, despite later calendar changes.
Before a day key exists, resolve timezone from the eligible approved resource
calendar for that date. If coverage is unknown, require reviewer-entered IANA
timezone with the unknown-capacity rationale; contributors may draft with a valid
declared timezone, but approval must resolve/confirm it. A submitted timezone that
differs from the established day key requires a revised entry and fresh review.
Approval checks the service date is not future using that captured timezone. The
1440 cap is a policy ceiling even on a 25-hour daylight-saving day. Time entries are
daily quantities; no claim of nonoverlapping clock intervals is made.

`execution_actual_days` keeps the counted current revision by entry and its exact
old baseline/item. Correction/reversal adjusts both old/new stable resource-day
rows and entry contributions atomically, credits replacements only inside that
transaction, and bumps every affected engagement generation. Closed work can accept
reviewer-only late corrections/actuals with rationale; those set closeout review
required. Do not infer an hours cap from a booking or erase actual work on withdrawal.
Time approval verifies current accepted activity and baseline source eligibility,
or uses a documented unavailable-source exception to approve numerical effort only;
it never accepts withheld activity prose. Missing allocation, mismatch of resource/
work package/date/billable class, or no confirmed allocation creates an unplanned
exception. Calendar shortage/unknown coverage creates a separate over-capacity or
unknown-capacity exception. Exceptions are shown to the reviewer before decision.

### Budgets, estimates and reconciliation

Effort budgets and estimates use the common record revision/review lifecycle but
have dedicated strict payloads and unique accepted head per baseline/work package.
006's structured min/max hour range is provenance only. Enter an exact minute
budget and approve it independently; no midpoint or maximum is chosen automatically.
Estimates are explicitly remaining effort at their accepted as-of date. At read time
newly approved time after that as-of instant makes the estimate stale until reviewed
again, avoiding actual-plus-old-remaining double counting. The seven-day rule is an
additional freshness bound. Approval does not reset the entered as-of date.

Reconciliation is one-to-one or retired/added in v1; choose retired/added for splits,
which remain a visible allocation-of-history gap. Whole-engagement actual totals
include every historical baseline exactly once. Current work-package breakdown uses
explicit mapping chains, with retired/unmapped actuals shown separately; no title
matching or duplicate carry. Budget variance is incomplete if retired/unmapped
actuals cannot be assigned to a reviewed current whole-engagement budget. No overhead reassignment is built in v1; variance stays incomplete for retired or
unmapped actuals. See the calculations contract for exact scope and null rules.

### Handoff, outcome and closeout

Handoff acknowledgement records an internal assertion with evidence, never a new
external signature. Closeout preview binds the current baseline, accepted/waived
milestone set, open blocking issues/dependencies, submitted time/corrections,
accepted handoff and exact obligations. Require all milestones accepted or waived,
all high/critical open issues/dependencies resolved or accepted_exception, no
submitted time/correction pending, and an accepted handoff with a recorded receiver
acknowledgement. No exception bypasses missing acknowledgement or pending time.
Waivers and accepted RAID exceptions retain rationale and follow-up owner/date.
Outcome measurement is optional for closeout but unknown/inconclusive is explicit.
Any later accepted execution/time/source change invalidates closeout's current
summary. Reclose requires a new exact review, never an overwritten snapshot.

## Indexes, source lifecycle and grants

Indexes cover aggregate scope/kind/state/current heads, resource/date ledgers,
entry approved pointers, engagement/as-of actuals, source revision reverse lookup,
command key uniqueness, cursor ordering and leased cleanup. Source dependencies
must connect through existing profile/artifact/plan eligibility, and reverse lookup
must include execution records consumed by derived records and advice.

Immediate eligibility fences live in reads/decisions/release; workers only purge
payloads and reconcile metadata. Withdrawn prose disappears before cleanup. Purge
requires exact `(revisionId,payloadDigest,sourceGeneration)` and a lease token;
newer revisions never match old work. Payload retention is 30 days after becoming
ineligible, with a maximum 100 jobs/tick; delayed cleanup does not restore eligibility.
Immutable time quantities and audit IDs remain without private notes. A content
purge does not recompute accepted actuals or erase the numerical audit.

Explicit role setup grants feature runtime reads/inserts/head updates only as needed;
cleanup is separate. No schema work inside request handlers. Feature readiness is
schema 038 for 008 only; do not raise existing feature/global minimums. Disable
`TURAS_008_DISABLED=1` blocks new drafts, reviews and advice but leaves authorized
reads, cancellation, receipt lookup, terminal reconciliation and cleanup available.
