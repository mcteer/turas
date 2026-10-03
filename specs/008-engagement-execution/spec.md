# Feature Specification: Engagement execution and delivery logs

**Feature Branch**: `008-engagement-execution`

**Created**: 2026-10-02

**Status**: Implementation in progress through T049 (forecast, handoff and outcomes); governed advice and final release gates remain pending.

**Input**: Run specify, clarify, plan, tasks and analyze for roadmap 008, then hand off before implement. Scope derives from TR-01, TR-02, TR-10, TR-11 and TR-15 after merged 006 and 007.

## Scope and outcomes

Delivery teams need a truthful record of what was done, which commitments have been
accepted, how much approved effort was spent, and what remains. 008 extends an
existing accepted engagement with reviewed execution records. A planned milestone,
confirmed resource booking, submitted log and accepted deliverable are different
things. Time spent does not by itself establish progress, acceptance or maturity.

Include an execution workspace tied to exact accepted baselines/work packages;
activity and time submission/review/correction; milestone evidence and decisions;
risks, assumptions, issues and dependencies (RAID); decision and scope-change logs;
entered estimates to complete; deterministic actual/forecast effort; handoff,
closeout and measured outcomes; and bounded read-only Turi explanations of reviewed
execution data. Reuse current customer grants, source review and staffing identities.

Exclude report generation and sending (009), TAM automation (010), expansion (011),
product-gap aggregation (012), partner training/workflow administration (013), shared
learning (014), MCP (015), new integrations, automatic data import, timers, payroll,
invoices, actual-cost/revenue recognition, commercial commitments, HR scoring,
customer login or electronic signatures. 007 finance scenarios remain planned.
No change to the selected model or hosting/deployment is part of this slice.
Automated engagement-phase progression is deferred; reviewed execution status
and closure do not change customer maturity or the broader delivery-phase model.

## Clarifications

### Session 2026-10-02

- Q: Who may approve logs/time, milestones, scope changes and handoff/closeout? → A: **mcteer only** (user confirmed). Contributors submit their own work; delegation is deferred.
- Other ambiguity categories are covered by the requirements and assumptions: role separation, actual-versus-planned quantities, source lifecycle, baseline reconciliation, local environment and bounded evaluation. No blocking clarification marker remains.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Establish an evidence-backed execution view (Priority: P1)

An internal delivery lead opens an accepted engagement, records planned milestone
dates and accountable owners, and submits dated activity/evidence. A reviewer
accepts an exact activity revision or a milestone decision. The view explains
reviewed progress and outstanding evidence without converting effort into completion.

**Why this priority**: Logs and milestone decisions are the basis for delivery status and later reporting.

**Independent Test**: Start from a real accepted 006 plan, submit and review an activity,
then accept one milestone using exact eligible evidence; confirm the status and lineage.

**Acceptance Scenarios**:

1. **Given** an accepted baseline, **When** execution is first opened, **Then** its
   milestones retain exact baseline/item identities and remain not started until
   reviewed execution supports a change; repeated setup creates no duplicates.
2. **Given** a contributor's submitted activity, **When** a reviewer accepts its exact
   revision, **Then** approved delivery status may cite it; pending/rejected text
   remains outside accepted status, ordinary customer context and Turi advice.
3. **Given** completed work and acceptance criteria, **When** the reviewer accepts
   completion with eligible evidence, **Then** an internal acceptance decision is
   recorded, without claiming a customer's signature or commercial acceptance.
4. **Given** a replaced baseline or withdrawn source, **When** current execution is
   read, **Then** affected records show review required, protected source text is
   withheld, and historical identities and approved time remain auditable.

### User Story 2 - Submit and approve actual time (Priority: P1)

A linked delivery resource records dated whole-minute effort for work on an
engagement. A reviewer approves exact entries, rejects them with rationale, or
approves a correction. Contributors can see their own entries and approval state;
authorized delivery readers see approved engagement totals.

**Why this priority**: Actual effort must be attributable, reviewed and counted once.

**Independent Test**: A resource with a confirmed 007 allocation submits time;
review it, correct it, replay the decision and race another approval for the same day.

**Acceptance Scenarios**:

1. **Given** a currently authorized contributor linked to one resource, **When** they
   submit effort for a resource-local past/current date, **Then** ownership, exact
   engagement/work package and optional allocation revision are retained; no other
   contributor's private entries are returned.
2. **Given** pending entries, **When** the reviewer approves an exact batch, **Then**
   its minutes enter actuals once, atomically; a rejected row rolls back the batch.
3. **Given** an approved entry, **When** its author proposes a correction, **Then**
   the prior approved version continues to count until its exact replacement is
   approved; reversal removes it through a new decision and never deletes history.
4. **Given** work outside an allocation or beyond scheduled capacity, **When** it is
   approved with an exception rationale, **Then** actuals retain it and show the
   variance; total approved minutes above 1,440 per resource-local date are refused.
5. **Given** a revoked contributor, hidden customer or changed source, **When** a
   read or receipt replay is attempted, **Then** current permissions are enforced;
   historical approved minutes are not silently erased from authorized totals.

### User Story 3 - Control delivery changes and open concerns (Priority: P1)

Delivery contributors record RAID items, decisions and proposed changes with
owners, dates, evidence and impact. A reviewer controls which revisions become
accepted and how a new accepted baseline maps to existing execution work.

**Why this priority**: A changing plan must not rewrite historical progress or approved effort.

**Independent Test**: Review a risk and a decision, submit a scope change, accept a
replacement through the existing plan workflow, and explicitly reconcile execution.

**Acceptance Scenarios**:

1. **Given** a new risk/issue/assumption/dependency or decision, **When** submitted,
   **Then** it is visibly pending; only an exact reviewer decision promotes it into
   the current reviewed register or closes/reopens an accepted concern.
2. **Given** a scope-change request, **When** approved for planning, **Then** it stays
   a reviewed proposed change until a linked exact replacement plan is accepted;
   it cannot alter a baseline, staffing, dates or commercial terms itself.
3. **Given** a new accepted baseline, **When** the reviewer maps old to new items,
   **Then** historical logs/actuals retain their original identities; completion
   does not transfer automatically, and each carried milestone needs fresh acceptance.
4. **Given** a withdrawal or changed head during review, **When** a decision is
   submitted, **Then** stale inputs fail without partial mutations and the UI can
   reconcile a lost acknowledgement without issuing another mutation.

### User Story 4 - Review actuals, handoff and outcomes (Priority: P2)

A delivery lead sees approved actual effort, current entered effort estimates,
planned allocation, acceptance and open concerns together. A reviewer records a
handoff and closeout against explicit criteria. Outcome observations retain their
measurement window and limitations rather than implying customer success.

**Why this priority**: Reliable closure and remaining-effort information prepare the inputs for 009 reports.

**Independent Test**: Approve measured effort and explicit estimates, verify exact
forecast arithmetic, review handoff evidence and reject closure with missing conditions.

**Acceptance Scenarios**:

1. **Given** approved actuals, a reviewed numeric effort budget and current estimate
   to complete, **When** a summary is read, **Then** actual, remaining, forecast and
   variance are distinct, with units, scope, time basis and formula version.
2. **Given** missing estimates/calendar coverage or zero availability, **When**
   actual billable utilization or forecast is read, **Then** missing is not zero,
   zero availability yields not applicable, and over-capacity actuals remain visible.
3. **Given** unresolved required milestones, blocking issues or unreviewed time,
   **When** closeout is proposed, **Then** it cannot be accepted until criteria are
   satisfied or each permitted exception has an explicit reviewer disposition.
4. **Given** an outcome or handoff statement, **When** reviewed, **Then** it retains
   source IDs, dates, measurement basis and recorded acknowledger; no customer sign-off,
   maturity update or public reusable learning is inferred.
5. **Given** a late correction after closeout, **When** approved, **Then** history is
   preserved and current closeout becomes review required rather than silently restated.

### User Story 5 - Explain reviewed execution through Turi (Priority: P2)

An internal user starts a fresh explanation for one engagement. Turi reads only
current, eligible, reviewed execution data and deterministic summaries, cites exact
versions, and explains blockers and missing inputs. Human decisions remain explicit.

**Why this priority**: Explanations should reflect the same facts as the delivery workspace.

**Independent Test**: Review actual outputs for eight fixed synthetic cases covering
normal status, missing inputs, corrections, withdrawal, privacy, injection and cancellation.

**Acceptance Scenarios**:

1. **Given** reviewed execution and approved actuals, **When** Turi explains status,
   **Then** every completion, acceptance and numeric claim is supported by visible
   exact records; tentative bookings or time spent never become proof of completion.
2. **Given** pending notes, personnel evidence, rates or another customer's data,
   **When** a prompt requests them, **Then** they are absent from context and tools.
3. **Given** source/authority changes after context consumption, **When** a stream,
   history, reconnect or result replay releases content, **Then** stale or restricted
   content is withheld; deterministic workspace results remain available if eligible.
4. **Given** cancellation, deadline, restart or uncertain provider outcome, **When**
   the request settles, **Then** no second paid turn, approval or other write occurs.

### Edge Cases

- Baseline replacement while a log, milestone decision, scope reconciliation or closeout is submitted.
- Two first time approvals racing on the same resource/date across different customers.
- A correction changes date/resource/work package; both old and new totals are locked and updated atomically.
- Resource inactivation or grant loss after real work: authorized reviewer corrections remain possible without restoring contributor access.
- Leap dates, daylight-saving transitions and a resource timezone change after submission.
- Partial periods, unknown calendars, zero denominators, absent numeric budgets/estimates, negative variance and actuals over planned capacity.
- Pending correction, reversed time, source withdrawal and content purge after a prior accepted decision.
- Partner-visible concerns whose linked evidence becomes hidden; no private titles/counts leak through lists or errors.
- Lost acknowledgement, conflicting same-key replay, duplicate batch item and stale review preview.
- A cancellation racing a native response or a closed engagement receiving late actuals.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Enforce current environment, workspace, member/session, customer and
  resource authority before reads, commands, review, replay and model release.
  Internal visibility does not grant review; partners require current customer grants.
- **FR-002**: Bind execution to an existing accepted engagement and exact baseline,
  milestone/work-package IDs. Setup is idempotent; baseline replacement creates an
  explicit reconciliation obligation and never rewrites historical bindings.
- **FR-003**: Keep contributor-owned draft/submitted activity revisions separate from
  accepted delivery records. Accept/reject/correct/retract with exact version, actor,
  rationale and idempotent receipt; a pending correction does not replace accepted content.
- **FR-004**: Track milestone state as not started, in progress, blocked, ready for
  review, accepted or waived through reviewed evidence and explicit human decisions.
  Waiver requires rationale; acceptance/reopening retains exact criteria/evidence.
- **FR-005**: Contributors may submit time only for their uniquely linked resource
  in an authorized engagement. A reviewer may enter attributed time for an unlinked
  or inactive resource with an on-behalf rationale; the author and subject stay distinct.
- **FR-006**: Record whole minutes (1–1,440), resource-local service date, resolved
  timezone, billable/nonbillable classification, engagement/work package, activity
  reference and optional exact allocation revision; reject future dates and ambiguous identity.
- **FR-007**: Approve/reject/reverse exact time revisions atomically, with authorized
  receipt replay. Corrections replace one approved version only on approval; enforce
  a cross-customer 1,440-minute daily ceiling under concurrent first writes.
- **FR-008**: Preserve truthful approved actuals across source, allocation, baseline,
  grant and resource changes. Mark unplanned/over-capacity/source-review exceptions;
  require reviewer rationale rather than deleting actuals or relaxing privacy.
- **FR-009**: Maintain reviewed RAID and decision registers with exact revisions,
  owners, dates, severity/impact, status, linked evidence and rationale. A user log
  does not silently approve an existing customer-profile claim.
- **FR-010**: Keep scope-change review distinct from 006 baseline acceptance and 007
  staffing decisions. Reconciliation explicitly maps/retire/adds items with version
  checks; transferred completion always requires a new human decision.
- **FR-011**: Record reviewed numeric effort budgets and current estimates to complete
  per current work package, with as-of date and assumption notes. A 006 effort range is not a point budget; select a reviewed value explicitly. Do not parse numbers
  from narrative estimates or default missing estimates to zero.
- **FR-012**: Calculate approved actuals, planned allocation, remaining estimate,
  forecast effort and budget variance deterministically; expose formula, minute unit,
  baseline, date basis, coverage and input versions. Financial actuals remain out of scope.
- **FR-013**: Calculate actual billable utilization as approved billable minutes divided
  by resource-local available minutes from approved calendars; keep planned utilization
  separate, return not applicable for zero and incomplete for missing coverage.
- **FR-014**: Provide a current reviewed execution summary with explainable milestone
  counts, open blockers, overdue items, evidence age and latest reviewed activity.
  Do not invent percent complete, a maturity score or a green status from silence.
- **FR-015**: Version handoff/acceptance/closeout records with explicit criteria,
  deliverables, receiver, recorded acknowledgement, remaining obligations and review
  decisions; distinguish an internal record from external signature or customer acceptance.
- **FR-016**: Review outcome observations with measure/unit, baseline/comparison values
  when known, measurement window, source, limitations and owner. No automatic maturity,
  commercial opportunity or shared-knowledge update follows from review.
- **FR-017**: Revalidate source eligibility and hide withdrawn/restricted prose on
  current reads and historical replay, while preserving permitted audit identities and
  approved numerical actuals. Purge content by exact revision without deleting newer content.
- **FR-018**: Offer delivery-safe partner projections and contributor-owned time views.
  Raw time/personnel detail is limited to its author/subject and reviewer; authorized
  delivery readers receive approved engagement totals, never other-customer, cost or leave data.
- **FR-019**: Provide accessible execution, logs/time, review, change/RAID, forecast and
  handoff views with keyboard interaction, responsive light/dark layouts, dirty-input
  preservation, current-denial clearing and receipt reconciliation after uncertain saves.
- **FR-020**: Turi execution explanations use a fresh, internal-only, single-engagement
  binding and a bounded set of read-only execution tools. Exclude drafts, rates, raw
  time/personnel notes and generic mutation/research/filesystem paths.
- **FR-021**: Fence model/tool/stream/history/reconnect/replay releases against every
  consumed dependency and current authority. Bound each advice request to six model
  steps, six reads, 4,096 output tokens per step and 120 seconds; never retry paid work automatically.
- **FR-022**: Bound bodies, lists, review batches and writes; apply rate limits and
  exact-key receipts, deadline/cancellation/recovery and redacted telemetry. Disable
  new intake/writes/advice while preserving eligible reads, settlement and cleanup.
- **FR-023**: Use explicit storage upgrades with empty and prior-schema disposable
  validation, runtime-role denial and paired recovery. Inspect Preview before any
  later upgrade and only after required disposable gates; exclude Production and deployment.
- **FR-024**: Require automated authorization/source/race/arithmetic/replay/migration
  checks, a real accepted-plan→staffing→approved-log/time→handoff journey, complete
  browser/accessibility cases, representative load and eight reviewed actual Turi
  outputs. Record unrun checks honestly; this planning pass executes no runtime gate.

### Key Entities

- **Execution workspace / baseline binding**: accepted engagement and current reconciliation state.
- **Activity revision / review decision**: dated submitted work narrative, evidence and exact acceptance.
- **Time entry / revision / decision / daily ledger**: attributable minutes and immutable approval/correction history.
- **Milestone execution / decision**: baseline item, owner, planned dates, reviewed state and criteria evidence.
- **RAID item / decision record / scope change / baseline reconciliation**: concerns, human choices and controlled plan changes.
- **Effort budget / remaining estimate / summary**: reviewed numeric inputs and reproducible current actual/forecast values.
- **Handoff / closeout / outcome observation**: dated responsibilities, acceptance criteria and measured evidence.
- **Execution advice binding / dependency receipt**: immutable scope, consumed approved versions and bounded native usage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A synthetic user completes the real accepted-plan and confirmed-staffing
  journey through approved activity/time, milestone acceptance and handoff; all stored
  references resolve to the exact reviewed sources and decisions without seeded approval shortcuts.
- **SC-002**: Every denied-role, partner, cross-customer, withdrawn-source, pending-data
  and hidden-personnel sentinel check passes, including content already shown before revocation.
- **SC-003**: Concurrent approval/correction/reversal and replay checks never double
  count minutes, exceed the 1,440-minute daily ceiling or publish partial decisions.
- **SC-004**: An independent arithmetic corpus exactly matches approved actual,
  utilization, remaining/forecast effort and variance, including zero/missing inputs,
  corrections, leap/DST/timezone cases and incomplete baseline mappings.
- **SC-005**: At 1,000 engagements, 500 resources, 50,000 time revisions, 20,000
  execution-record revisions and 10,000 decisions, with five simultaneous users,
  paginated views, summary reads and review acknowledgements each meet p95 ≤2 seconds
  over 100 measured calls per class after ten warmups, with zero correctness failures.
- **SC-006**: All eight fixed live explanation cases pass evidence fidelity, numeric
  agreement, privacy, uncertainty and no-write gates within the FR-021 bounds; each
  is captured and reviewed once with no automatic paid retry and unknown usage left unknown.
- **SC-007**: Every critical journey passes desktop/mobile light/dark browser checks,
  keyboard review, zero serious/critical accessibility violations and no overflow at 390 px.
- **SC-008**: Disposable upgrade/role and paired restart tests retain approved actuals,
  exact receipts and newer source content; interrupted advice settles or remains
  explicitly unconfirmed without redispatch, and no private content enters routine logs.

## Assumptions

- Temporary identities remain; canonical `mcteer` is the confirmed sole 008 reviewer
  and may review their own submissions with a recorded rationale. Delegation is deferred.
- Partners may submit their own delivery activity/time for a currently granted
  customer and a linked resource; 008 provides this basic delivery function, while
  partner enablement and administration stay in 013.
- Service-date time is entered as daily minute quantities, not wall-clock start/end
  intervals. Timezone identity is captured at submission and cannot silently drift.
- Unplanned actual work is supported through explicit reviewer exceptions. No external
  approval system, customer portal, signature verification or payroll authority is implied.
- Preview was last verified at schema 034 during 007. That is historical evidence;
  implementation must inspect it freshly before any explicit later upgrade.
