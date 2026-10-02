# Data model: Skills, staffing and services operations

Status: proposed contracts, not installed schema. Migrations 032–034 extend schema031.
All identifiers and references below are scoped to environment/workspace; customer
records additionally retain customer/workload scope. C01–C14 are the normative
field/limit clauses and are copied into implementation tasks to prevent silent
implementation-time choices.

## Contract clauses

### C01 — Shared envelopes

IDs are UUIDs; environmentId and workspaceId are required; revision and aggregateVersion are positive safe integers; digests are lowercase 64-character SHA-256 hex; timestamps are ISO 8601 with offsets; business dates are valid YYYY-MM-DD in 2000–2100; requestKey is 8–128 ASCII letters/digits/underscores/hyphens; rationale is trimmed 1–2000 characters; unknown properties are rejected; revision payload is at most 131072 UTF-8 bytes; contractVersion is staffing-v1.

### C02 — Authority

Staffing-manager and finance actions each require the canonical mcteer principal, a current active internal/admin membership in the same workspace, an active principal/workspace and a live owned login session; another admin is denied; no delegation endpoint or capability grant table exists in 007; internal members may propose customer demand and allocations; partners may only read confirmed delivery-safe assignments on currently granted delivery engagements.

### C03 — Resources and taxonomy

A resource has displayName 1–160 characters, externalKey 1–100 ASCII letters/digits/underscores/hyphens unique per workspace, kind internal or partner, state active or inactive, nullable unique membershipId, IANA timezone, and regionCode 1–32 ASCII letters/digits/hyphens; partner resources require an active same-workspace partnerOrganizationId and explicit dated customer eligibility, plus any linked member's current customer grant; skill key matches [a-z][a-z0-9_-]{0,63}, name is 1–160 characters, definition is 1–2000 characters, and state is active or retired; levels are 0 unassessed, 1 assisted, 2 independent, 3 advanced, 4 mentor.

### C04 — Import bounds

A workforce import accepts one UTF-8 CSV or XLSX original of at most 10485760 bytes, 20 sheets, 50000 cells, 5000 candidate rows and 500000 extracted code points; scan timeout is 30 seconds, parse timeout 90 seconds and attempt deadline 120 seconds; at most two open imports per manager and ten queued/running imports per workspace; original storage quota is 1 GiB per workspace; mapping covers one explicitly selected table range per sheet with fixed header and mapped columns; hidden/merged/formula cells and partial coverage are explicit; partial extraction cannot be approved; formula or cached-result identity/level/date inputs require a corrected literal candidate; CSV date convention is ISO, DMY or MDY selected explicitly, and XLSX serial dates retain the 1900/1904 date system with impossible dates rejected.

### C05 — Competencies

A candidate binds exact resourceId, skillId, sourceVersionId or manualEvidenceId, extractionRunId when imported, mappingRevisionId when imported, rowKey, contentDigest and locators; level is an integer 0–4; assessmentDate is not future-dated; evidence text is 1–4000 characters; nextReviewDate is required and not before assessmentDate; states are pending, accepted, rejected, superseded or retracted; only one current accepted competency per resource/skill exists; manual evidence is a dated accountable assessment note with no remote fetch; approval binds the exact candidate revision and source generation; one bulk decision covers 1–100 rows atomically and duplicate resource/skill rows in that decision are rejected.

### C06 — Calendars and freshness

Calendar revisions cover 1–91 inclusive resource-local dates and contain at most 8 contracted intervals per date with minute-resolution half-open endpoints; cross-midnight inputs are split into local dates; local endpoints require a valid IANA timezone and reject ambiguous/nonexistent times unless a valid explicit offset resolves ambiguity; resolved UTC endpoints and runtime timezone-data version are retained; daily contracted elapsed time is at most 960 minutes; holidays, approved leave and protected time are interval sets with at most 16 entries per date; leave reason is an optional manager-only category, never medical free text; observedAt is not future-dated and certification covers an explicit date interval; availability is recent through 7 days and aging through 14 days at decision time, shortened by a required nextReviewAt not before observedAt; competencies are recent through 90 days and aging through 180 days, shortened by nextReviewDate, and must be eligible through the work interval; later unavailability creates visible needs-review state without deleting confirmed time.

### C07 — Demand

Demand binds customerId, nullable workloadId, engagementId, baselineId, planRevisionId, baselineDigest and one workPackageKey; title is 1–160 characters and role is 1–100 characters; required and desired skill lists each contain at most 20 unique active skill IDs with minimumLevel 1–4 and no skill duplicated across lists; required skills contain at least one entry; a demand covers 1–91 dates and has 1–960 requiredMinutes on each working date with at most 87360 total minutes; service dates are labels interpreted in each candidate resource timezone, not fixed UTC appointments; overlap constraint is absent or one explicitly zoned IANA demand-time interval per service date plus minimumOverlapMinutes 1–960 measured against that resource day, and allowedRegions contains at most 20 region codes; billable is boolean; states are draft, qualified, fulfilled or cancelled; qualification requires the current readable accepted baseline without reviewRequired; confirmation dates cannot precede today in the resource timezone; editing demand creates a draft revision while existing allocations retain the previous binding.

### C08 — Matching

Matching evaluates at most 500 active visible resources for one exact demand revision over at most 91 dates and returns at most 50 rows per page; status is eligible, needs_review or ineligible with typed reasons for every hard constraint; eligible candidates cover the full requested daily minutes, required skill levels, explicit region/overlap constraint and current partner eligibility; sort eligible rows by desired-skill count descending, minimum daily remaining minutes after the request descending, then resourceId ascending; needs_review and ineligible groups follow in that order and sort by resourceId; no cost, protected attribute or model score enters ranking; result identity binds demand, input versions, formula version and asOf, and expires after 10 minutes or any dependency change, whichever occurs first.

### C09 — Allocation decisions

An allocation proposal binds one resource, one demand revision and 1–91 resource-local dates with integer minutes 1–960 per date; states are proposed, tentative, confirmed, released, cancelled or expired; tentative expires at the earlier of creation plus seven days or the first work date's local midnight; a reservation whose expiry is already reached is rejected; confirmed remains capacity-consuming when needsReview is true; confirmation, amendment, release and cancellation require mcteer, an exact revisionId/contentDigest/expectedAggregateVersion, rationale, requestKey and a reviewPreviewId valid for ten minutes; preview binds actor session, demand/baseline, source/calendar/capacity generations and the union of old/new resources/dates for amendment; confirmed time may not exceed either resource schedulable time or remaining demand minutes; the demand/date ledger counts confirmed time across all revisions of the stable demand identity until explicit release or replacement; release/cancel may remove today-or-later commitments using authorized identity-only history even if source/baseline eligibility is lost, without requiring renewed feasibility; past ledger dates are immutable; no overload override or retroactive confirmation exists; cancelling an unconfirmed own proposal is allowed to its internal author.

### C10 — Capacity arithmetic

Formula version is staffing-capacity-v1; contracted minutes measure the union of resolved working intervals; available minutes subtract the union of holiday and approved-leave intersections; protected minutes measure protected intervals intersected with remaining availability; schedulable remaining equals available minus protected minus confirmed minutes; tentative minutes are separate; negative remaining is retained; planned billable allocation ratio is confirmed billable minutes divided by available minutes, rounded half up to two percentage decimals, and is null with reason zero_available when the denominator is zero; actual utilization is unavailable; every result includes period, resource timezone, asOf and input revision IDs.

### C11 — Economic inputs and scenarios

Formula version is staffing-economics-v1; supported currencies are USD/EUR/GBP/CAD/AUD with exponent 2 and JPY with exponent 0; all money is a nonnegative integer minor-unit decimal string up to 1000000000000 and rates are minor units per hour up to 100000000; intermediate arithmetic uses BigInt and derived signed totals are bounded to absolute 1000000000000000; rate periods are [fromDate,toDate) by resource-local date with no overlap per resource/rate-kind/currency; rate kinds are loaded_cost or service; a scenario covers one engagement baseline and 1–91 dates, stores exact confirmed allocation/rate/revenue/nonlabor revisions and has status complete, incomplete or stale plus policyApproval approved or unvalidated; group minute-times-rate numerators by resource/local-date/rate-revision, divide by 60 and round half away from zero once per group before summing; contribution equals entered contracted revenue minus delivery cost minus entered nonlabor cost; margin is contribution divided by entered revenue rounded half up to two percentage decimals and is null for zero revenue; mixed currencies or missing rates/revenue/nonlabor inputs yield incomplete results; service-rate revenue is a separate hypothetical estimate; mcteer's policy approval binds the exact formula/input-policy digest and never approves a quote or actual profit.

### C12 — Advisory

A staffing conversation is fresh, owner-private and immutably bound to one customer/demand revision, operational or finance mode, and an optional same-engagement scenario in finance mode; finance mode requires mcteer; at most one native response attempt is admitted per advisory request with five requests/hour per membership, 8000 instruction characters, six model steps, six domain read calls, 24576 context bytes, 200 dependency identities and 4096 output tokens/step; deadline is 120 seconds from dispatch and unresolved attempts settle unconfirmed within five minutes; model is spacexai/grok-4.7 and reasoning is low; only staffing read tools and the staffing skill are available, all mutation/research/file/sandbox tools are denied, and no paid retry is automatic.

### C13 — Lifecycle and audit

Source, revision, decision, request-digest and lineage identities are immutable; personnel prose, filenames, cells and extracted payloads are separately purgeable; withdrawal disables current reads and dependent staffing/advisory eligibility synchronously, while cleanup deletes only exact retired generations; pending/cancelled/rejected import payloads expire after 30 days and withdrawn payloads are purged within 24 hours of the next healthy worker run; accepted evidence is retained until withdrawn; audit metadata/decision IDs survive without original text; worker lease is 30 seconds with heartbeat every 10 seconds, at most three automatic pre-publication scan/parse retries for transient infrastructure failure, and no retry of a cancelled/withdrawn source; cleanup claims at most 20 jobs per tick; import authority is rechecked at claim and publication, while retention cleanup uses scoped maintenance authority and exact source ownership/generation and continues after uploader revocation.

### C14 — Transport and telemetry

Lists use pageSize 1–50 default 20 and an opaque scope-bound cursor; ordinary writes are limited to 30/minute per membership/workspace and imports to five starts/minute; batch operations are atomic within their explicit limits; error responses contain safe code/message/correlationId without private values or existence/count leaks; telemetry permits operation kind, outcome, duration, counts, scoped opaque IDs, conflict category and model usage, but excludes names, evidence, filenames, leave details, prompts, rates and money; API and agent reads return server projections and never unrestricted row JSON.

## Persistence groups

### 032 — Workforce and governed competencies

- `workforce_resources`: immutable identity/scope/type/member link; active flag,
  aggregate version and current profile revision pointer. Link eligibility changes
  require a new reviewed revision. `workforce_resource_payloads` holds display fields.
- `workforce_partner_eligibility`: resource/customer/date interval with manager
  decision identity; current partner organization and linked grants are rechecked.
- `workforce_skills` / `workforce_skill_revisions`: stable skill key and immutable
  names/definitions/proficiency rubric; retirement blocks new use but preserves history.
- `workforce_sources` / `workforce_source_versions` / `workforce_source_payloads`:
  source generation/state, digest and opaque object owner; filenames/bytes separate.
- `workforce_import_intents`, `workforce_import_jobs`, `workforce_extractions`,
  `workforce_extracted_cells`, `workforce_mapping_revisions`: staged upload,
  fenced worker attempt, typed manifest, locators and exact mapping.
- `workforce_competencies`, `workforce_competency_revisions`,
  `workforce_competency_payloads`, `workforce_manual_evidence`:
  resource/skill head, provenance identity and purgeable supporting text.
- `workforce_review_decisions`, `workforce_command_receipts`,
  `workforce_cleanup_jobs`: exact review identity, request digest and generation-safe
  retention work. The distinct workforce store has its own ownership reconciler.

### 033 — Calendars, demand and staffing commitments

- `resource_calendars`, `resource_calendar_revisions`, `resource_calendar_intervals`:
  approved dated schedules and certification. Current per-date selection is unique;
  changing a range retires only overlapping old current selections, retaining history.
- `staffing_demands`, `staffing_demand_revisions`, `staffing_demand_payloads`:
  exact accepted-plan identity, skills and effort; current revision is separate from
  existing allocation bindings. `staffing_demand_days` tracks current committed totals.
- `staffing_allocations`, `staffing_allocation_revisions`, `staffing_allocation_days`:
  state head, exact proposal and confirmed minute ledger. Release replaces future
  current ledger entries atomically; previous revisions remain immutable.
- `staffing_capacity_days`: stable resource/date locking and generation rows; zero
  allocations still have rows so concurrent first commitments serialize.
- `staffing_review_previews`, `staffing_decisions`, `staffing_command_receipts`:
  exact decision snapshots, terminal receipts and actor-scoped digest tombstones.

### 034 — Economics and bounded advisory

- `staffing_economic_inputs` / `staffing_economic_input_revisions`: effective rates,
  explicit revenue/nonlabor assumptions, source note and finance-only payload.
- `staffing_finance_policy_decisions`: exact versioned formula/input policy approval.
- `staffing_scenarios` / `staffing_scenario_inputs` / `staffing_scenario_payloads`:
  immutable input identities and computed snapshot, current stale classification.
- `staffing_conversation_bindings`, `staffing_advisory_attempts`,
  `staffing_advisory_dependencies`, `staffing_model_step_receipts`: fresh scope,
  one-response binding, consumed input/generation receipts and provider admission.

## Referential and concurrency invariants

Every resource/skill/source/calendar/demand/allocation reference uses a composite
scope FK. Partner member/org links cannot cross workspace. Demand baseline FK also
binds engagement, plan, customer and accepted revision; workPackageKey is validated
against the exact retained baseline payload under its plan/source locks. A member
link is unique across active and inactive resource identities, preventing duplicate
capacity through recreation. Current accepted competency is a unique head pointer;
revisions retain scoped source references even when payloads disappear.

An allocation's `needsReview` is a current projection from baseline, resource,
source, freshness, grant and calendar state, not a mutable truth supplied by a job.
A calendar reduction may create a negative remaining value; it never auto-releases
work. All new confirmations and replacement amendments must satisfy both daily
resource and demand limits. Allocation edits, including single-day changes, create
new revisions. Old plus new ledger effects occur in one transaction. A reduced demand
can expose overcommitted demand minutes without silently releasing older allocations;
new confirmations remain blocked until the overcommitment is resolved. Allocation
revisions retain the resource timezone/calendar identity used at confirmation; a
timezone change requires review rather than reinterpreting historical work dates.

Runtime role cannot update/delete immutable revisions or decisions. Narrow mutable
head/lease/ledger paths and payload deletion use explicit grants/functions. Receipt
replay checks current authority first; historical receipts return safe IDs/state and
do not grant access to old payloads. Transactions may abort/retry bounded database
conflicts using the same request key; provider dispatch never retries automatically.

## State machines

Import: uploading → quarantined → processing → ready | partial | failed; ready →
reviewed; any non-deleted state → cancelled/withdrawn → deleting → deleted. Partial
requires a replacement complete source before approval. Each row independently has
pending → accepted/rejected; acceptance can supersede one current competency; later
retraction/withdrawal removes current eligibility without rewriting the decision.

Demand: draft → qualified → fulfilled; edit → new draft; cancel is explicit and does
not erase confirmed allocations. Fulfilled means required minutes are committed,
not delivered. Baseline replacement adds needs-review and blocks new confirmation
until an exact revised demand is qualified.

Allocation: proposed → tentative → confirmed → released; proposed/tentative →
cancelled; tentative → expired; direct proposed → confirmed is allowed for mcteer
through the same exact preview (useful for work starting today). Amendment of a
confirmed allocation is a new proposal whose acceptance atomically replaces the
current future ledger; release/cancel history is retained. Internal authors may
cancel only their own unconfirmed proposal. All commitment-changing actions belong
to mcteer. A released allocation cannot become confirmed by replay.

Advisory: prepared → running → completed | failed | cancelled | expired | unconfirmed.
The native response is the durable result, not a staffing mutation. Dependency or
permission changes deny subsequent reads/output/replay while permitted metadata stays.

### Demand lifecycle audit extension

`staffing_demand_events` retains the exact demand/revision, aggregate version, state,
action, content digest, actor/session and request identity for create, revise, qualify
and cancel. Its rationale is stored separately in `staffing_demand_event_payloads`.
Events are immutable, payload updates are denied, and runtime payload deletion is
revoked. Qualification and cancellation change state without replacing the bound
demand revision or resetting stable demand/date commitments.
