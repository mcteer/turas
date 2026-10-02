# Feature Specification: Skills, staffing and services operations

**Feature Branch**: `007-skills-staffing`

**Created**: 2026-09-30

**Status**: Locally implemented and validated; review-head CI and PR review remain. See tasks.md and validation.md.

**Input**: User request to complete specify, clarify, plan, tasks and analyze for roadmap feature 007, then hand off before implementation. Scope derives from TR-01/TR-12 and the 007 roadmap entry after merged feature 006.

## Scope and outcomes

Delivery operations needs to know which people have reviewed skills, when they can
work, why a proposed match is feasible, and who committed capacity to an accepted
engagement. Feature 007 adds a governed staffing lifecycle and explicit planning
forecasts. Accepted delivery plans remain separate from staffing approval, and
planned allocation remains separate from actual work and customer outcomes.

In scope: a restricted workforce roster and skill taxonomy; reviewed structured
CSV/XLSX competency imports with exact source locations; dated working calendars,
leave and protected time; baseline-bound staffing demand; explainable deterministic
matches; tentative reservations and manager-confirmed allocations; planned capacity,
utilization and contribution scenarios; a bounded read-only Turi advisory path.
Internal managers can maintain internal and partner delivery resources. Partner
self-service workforce management and broad partner roster discovery are deferred.

Out of scope: approved work/time logs and actual utilization (008), billing,
payroll, invoicing, revenue recognition, FX conversion, HR performance assessment,
automated hiring or price commitments, annual business planning, external calendar
or HR connectors, partner organization administration (013), report sending (009),
MCP (015), deployment and Production database access. Only synthetic personnel and
customer data is used in this slice's validation.

## Clarifications

### Session 2026-09-30

- Q: Who should be allowed to confirm staffing and access rates, costs, and contribution forecasts in 007? → A: `mcteer` only for both; defer delegation.

In 007, “staffing manager” and “finance user” mean the currently authenticated,
active canonical `mcteer` internal administrator. These are distinct policy checks
with the same authorized identity, not delegable capabilities. Another internal
administrator does not inherit either permission. `panel` can propose customer
staffing demand and allocations and see the permitted operational projections.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a reviewed competency roster (Priority: P1)

A staffing manager creates delivery-resource records and a versioned skill
vocabulary, uploads a competency sheet, maps each row to an exact person and skill,
and reviews the proposed assessments. Accepted competencies retain their source,
assessment date and reviewer; unknown identities and stale assessments are visible
rather than guessed into the roster.

**Why this priority**: A staffing recommendation cannot be trustworthy without a
reviewed identity, skill and evidence foundation.

**Independent Test**: Import a synthetic two-sheet workbook, resolve ambiguous
people and skills, accept selected exact rows, and verify only those assessments
appear in current eligible skill reads with their original cells.

**Acceptance Scenarios**:

1. **Given** an active staffing manager and a valid import, **When** they map rows,
   **Then** the preview shows person, skill, level, assessment date, evidence and
   original sheet/row/cell locations without accepting any row automatically.
2. **Given** duplicate names, an unknown skill, invalid dates or a partial extraction,
   **When** the manager opens the batch, **Then** affected rows require explicit
   correction or rejection and approval cannot silently omit unread content.
3. **Given** an exact candidate assessment, **When** an authorized manager approves
   it twice with the same request, **Then** one accepted revision and decision exist;
   a changed row, source or request under the same key is rejected.
4. **Given** accepted evidence later withdrawn or a resource made inactive, **When**
   current matching or a source view is requested, **Then** the assessment cannot
   support a new staffing commitment; history retains only permitted audit data.

### User Story 2 - Find feasible people for dated delivery demand (Priority: P1)

An internal delivery lead creates a staffing request against an exact accepted
engagement baseline and work package, states required skills and levels, dates,
hours and working constraints, and compares candidates with explicit reasons.

**Why this priority**: Leads need a useful matching and capacity view before making
any commitment.

**Independent Test**: Use a reviewed roster and calendars to rank a synthetic demand,
then change one skill, leave day and availability review date; verify eligibility,
remaining capacity and reasons change deterministically.

**Acceptance Scenarios**:

1. **Given** a current accepted engagement baseline, **When** a lead qualifies a
   staffing demand, **Then** the request records the exact baseline/work-package
   identity, role, required skill levels, work dates, effort and working constraints.
2. **Given** multiple candidates, **When** a lead asks for matches, **Then** hard
   constraints are evaluated before ranking and each result explains skill coverage,
   dated capacity, freshness and missing evidence without an opaque suitability score.
3. **Given** stale or unknown competencies or availability, **When** matching runs,
   **Then** it labels the person as requiring review and does not present them as
   confirmed-feasible; refresh does not invent a newer assessment date.
4. **Given** time off, a zero-capacity week or timezone change, **When** capacity is
   viewed, **Then** working time, deductions and overload are explicit and consistent
   with the resource's local calendar; negative remaining capacity is not hidden.

### User Story 3 - Commit staffing with a human decision (Priority: P1)

A delivery lead proposes named allocations, and a staffing manager reviews exact
people, demand, dates and daily hours before confirming. Changes create new reviewed
versions. Concurrent commitments cannot silently consume the same remaining time.

**Why this priority**: A useful proposal must become an auditable, conflict-safe
commitment without turning plan acceptance or model wording into staffing authority.

**Independent Test**: Race two confirmations for the same scarce capacity, retry an
accepted decision, cancel a reservation and replace a plan baseline. Verify exactly
one conflicting confirmation succeeds and existing commitments remain traceable.

**Acceptance Scenarios**:

1. **Given** feasible demand, **When** a lead reserves a candidate, **Then** the
   reservation is visibly tentative, expires after seven days or the first work date
   (whichever is earlier), and does not reduce confirmed schedulable capacity.
2. **Given** a tentative proposal and current manager authority, **When** the manager
   confirms its exact reviewed version, **Then** the system rechecks current baseline,
   source eligibility, skills and all affected daily capacity before one atomic write.
3. **Given** two requests competing for the same hours, **When** they confirm at once,
   **Then** at most the available capacity is committed, the loser receives a useful
   conflict, and retries never duplicate an allocation.
4. **Given** a confirmed allocation, **When** leave, evidence withdrawal, a resource
   deactivation or baseline replacement makes it invalid, **Then** the commitment is
   preserved for history but visibly needs review; it is never silently reassigned.
5. **Given** a partner with a customer grant, **When** viewing that customer's delivery
   engagement, **Then** only current confirmed delivery-safe assignments are visible;
   other customers, roster candidates, leave reasons and costs are absent.

### User Story 4 - Inspect planned capacity and economics (Priority: P2)

A staffing manager reviews planned capacity, confirmed and tentative load, and
exceptions over a selected period. An authorized finance user manages
versioned rates and commercial assumptions and inspects a reproducible contribution
scenario with transparent inputs, missing values and formula version.

**Why this priority**: Staffing decisions need capacity and cost consequences while
preserving the boundary between a forecast and recognized financial results.

**Independent Test**: Calculate a known synthetic scenario, revise a rate, cross a
month boundary and omit a cost; verify exact arithmetic, immutable prior results,
clear incompleteness and role-specific projections.

**Acceptance Scenarios**:

1. **Given** a dated calendar and confirmed allocations, **When** planned utilization
   is shown, **Then** it states period, timezone, units, as-of time, formula version
   and denominator; a zero denominator is not applicable, never zero or infinity.
2. **Given** a user without finance authority, **When** they request operations data
   through any supported surface, **Then** costs, rates, revenue, margins and derived
   financial rankings are unavailable, including through errors and aggregate counts.
3. **Given** compatible reviewed rates and entered revenue/nonlabor assumptions,
   **When** finance calculates a scenario, **Then** it stores the exact inputs and
   formula version and labels planned contribution as a scenario, not actual profit.
4. **Given** missing rates, incompatible currencies or unknown revenue, **When** a
   forecast is requested, **Then** it is incomplete with explicit reasons; no zero
   defaults, implicit conversion or model-estimated numbers fill the gaps.

### User Story 5 - Ask Turi for a governed staffing explanation (Priority: P2)

An authorized internal user asks Turi about the current staffing demand, candidate
tradeoffs or capacity. Turi uses the same domain facts and calculations as the UI,
cites exact versions and asks for human review rather than committing staffing.

**Why this priority**: Turi should explain the operational data without becoming a
second calculation engine or bypassing personnel access and decision rights.

**Independent Test**: Run bounded synthetic questions covering current, stale,
missing, restricted and changed staffing inputs and inspect actual outputs against
the same stored results used by the UI.

**Acceptance Scenarios**:

1. **Given** an internal lead and an exact customer-bound demand, **When** Turi explains
   matches, **Then** it uses current authorized results and cites their versions and
   as-of time; it does not invent skill levels or claim a reservation is confirmed.
2. **Given** a partner, a normal customer chat or revoked staffing authority,
   **When** staffing context or a tool is requested, **Then** restricted personnel and
   economics are excluded before retrieval and denied after authority changes.
3. **Given** a changed source or canceled turn, **When** a saved response is replayed,
   **Then** the same current-eligibility rules apply and no stale restricted content
   escapes through native history or stream replay.
4. **Given** provider failure or a context budget limit, **When** advisory work stops,
   **Then** the UI still exposes deterministic domain results and no automatic paid
   retry or staffing write is claimed.

### Edge Cases

- People with identical names, no login, multiple engagements, inactive membership,
  or a partner resource whose customer grant is absent or revoked.
- Duplicate/conflicting import rows, multiple sheets, locale-dependent dates,
  formula cells, spreadsheet injection text, malformed archives and hidden rows.
- Import cancellation, source withdrawal during review, a replacement file with
  a different digest, and an old cleanup job running after a newer revision.
- Competency age crossing a review boundary between matching and confirmation;
  a reviewer cannot make old evidence new by changing its review timestamp.
- Partial-day leave, overlapping leave/holidays, protected enablement time, dates
  across daylight-saving changes and periods spanning calendar versions.
- Missing capacity is unknown, not fully available; zero and negative remaining
  capacity have explicit meanings; tentative reservations can conflict visibly.
- Concurrent manager sessions confirm, amend or cancel the same allocation simultaneously, or
  authority is revoked before a same-key decision replay.
- A plan's accepted baseline changes while demand or confirmation is in progress;
  a working draft alone does not invalidate the accepted baseline.
- Empty resource pools, no feasible matches, missing cost inputs, mixed currencies,
  negative contribution, zero revenue and amounts near supported numeric limits.
- Read-only historical records after content purge, unavailable dependency stores,
  process restart, native stream reconnect and disabled intake.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Enforce current workspace, customer, membership and resource authority
  on every read, import, search, calculation, decision, background operation and
  agent path. Broad internal customer visibility does not grant personnel evidence
  or finance access. Partners cannot search the workforce roster or manage staffing.
- **FR-002**: Maintain canonical delivery resources independently of login identities,
  with active state, internal/partner type, optional unique member link, display name,
  timezone, region and explicit manager authority. Identity resolution is exact;
  names or uploaded text cannot create an implicit identity or access grant.
- **FR-003**: Maintain a versioned skill taxonomy and explicit proficiency definitions:
  0 unassessed, 1 assisted, 2 independent, 3 advanced, 4 mentor. A competency records
  one resource/skill, level, assessment date, evidence, next-review date and revision.
  Approval, freshness and factual support are separate; 0 cannot satisfy a requirement.
- **FR-004**: Accept bounded CSV/XLSX competency imports in a restricted workforce
  area with private originals, malware/parsing controls, explicit column mapping,
  durable batch/row identities and sheet/row/cell provenance. Do not execute formulas
  or macros, infer identity from name similarity, or index personnel in customer RAG.
- **FR-005**: Import/manual candidates remain pending until a staffing manager accepts
  or rejects an exact revision with rationale. Correction creates a new candidate;
  one accepted current assessment exists per resource/skill. Duplicate retries are
  idempotent, conflicting rows require resolution, and invalid/partial batches cannot
  be approved as complete. Manual assessment needs a dated accountable evidence note.
- **FR-006**: Recheck evidence and resource eligibility on current reads, matching and
  confirmation. Withdrawal, retraction or supersession excludes dependent competency
  content immediately without relying on cleanup; authorized history shows warnings
  or withheld content, and cleanup targets exact revisions. No source-content leaks
  through citations, import errors, match explanations, saved advisory output or logs.
- **FR-007**: Use the evidence policy's 90-day competency and seven-day availability
  review windows. Recent and aging evidence are distinguished; stale, undated,
  future-dated or overdue-review evidence cannot support a feasible commitment.
  Matching and confirmation evaluate competency validity through the proposed work
  dates. Availability freshness is checked at decision time against an explicitly
  certified future calendar interval, so a recent 13-week calendar can support
  future scheduling without inventing a future observation date.
- **FR-008**: Record resource-local dated contracted work schedules, holidays, approved
  leave and protected non-delivery time in exact minutes. Overlapping deductions
  cannot double count time. Changes are versioned, reviewed by a manager, and expose
  conflicts with existing allocations rather than silently changing commitments.
- **FR-009**: Create customer/workload-scoped staffing demand from an exact accepted
  engagement baseline and work-package identity. Record role, required/desired
  skills/levels, date range, daily effort, billable classification, region/timezone
  overlap and rationale. Only a current baseline with readable sources can qualify
  demand; no plan acceptance automatically creates or confirms an allocation.
- **FR-010**: Compute candidate eligibility deterministically from current approved
  competencies, exact dates, daily capacity, resource status, customer grants and
  declared region/working-hour constraints. Explain each passed/failed/unknown hard
  constraint and rank eligible candidates by documented versioned tie-breakers.
  Costs, protected attributes and model opinion do not influence matching.
- **FR-011**: Separate draft demand, qualified demand, tentative reservation and
  confirmed allocation. Reservations expire after seven days or their first work
  date, whichever is earlier; they show contention but do not consume confirmed
  capacity. Confirmation is an explicit staffing-manager decision on an exact
  proposal/version and current review preview; there is no overload override in 007.
- **FR-012**: Atomically recheck and serialize confirmation/amendment against every
  affected resource/date, current source/calendar/baseline versions and manager
  authority. No accepted action may exceed daily available capacity after protected
  time. A failed check changes nothing. Revocation, conflict, wrong digest, expiry
  and same-key/different-request replay return safe, distinguishable outcomes.
- **FR-013**: Amend, release or cancel through immutable revisions and decisions.
  Existing confirmed allocations remain bound to their reviewed baseline after
  baseline replacement; mark them needs-review until explicitly remapped/reconfirmed.
  New invalidations flag existing commitments and block new incompatible commitments;
  no silent reassignment, retroactive edit or duplicate engagement is permitted.
- **FR-014**: Provide operational projections scoped to the current user. Internal
  leads see approved skill summaries and schedulable capacity, not private evidence,
  leave reasons or finance. Partners see only confirmed delivery-safe assignments
  on granted delivery engagements, without roster counts or other-customer load.
- **FR-015**: Calculate planned operations with a versioned deterministic formula:
  available time is contracted time minus the union of holidays and approved leave;
  schedulable remaining subtracts confirmed allocation and protected time; planned
  billable allocation ratio divides confirmed billable time by available time.
  Display tentative time separately, negative remaining as overload and zero
  denominator as not applicable. Actual billable utilization stays unavailable in 007.
- **FR-016**: Restrict versioned cost rates, service rates, commercial revenue and
  nonlabor assumptions, scenarios and all derived economics to separate finance
  authority. Rates have currency, effective period, unit and provenance; missing or
  incompatible inputs yield incomplete results, not inferred values or conversions.
- **FR-017**: Store reproducible planned contribution scenarios tied to exact baseline,
  allocation and input revisions. Planned delivery cost uses confirmed time and
  applicable loaded cost rates; contribution subtracts delivery and entered nonlabor
  cost from explicitly entered contracted revenue; zero-revenue margin is undefined.
  Draft scenarios are labeled unvalidated until finance explicitly approves the
  formula/input policy; approval never becomes invoicing, actual profit or a quote.
- **FR-018**: Provide accessible roster/import review, resource/calendar, demand/match,
  allocation decision and operations/scenario journeys, with responsive light/dark
  layouts, keyboard focus, evidence/freshness labels, denied/empty/error/loading
  states, unsaved-work protection and recoverable optimistic-concurrency conflicts.
- **FR-019**: Turi staffing advice uses a fresh server-bound internal-only staffing
  conversation with a fixed customer/demand and explicit capability projection.
  Deterministic read tools expose approved summaries and calculated results; the
  model cannot approve competencies, alter calendars, reserve/confirm staffing or
  update economics. Ordinary customer/planning chat receives no personnel context.
- **FR-020**: Revalidate advisory authority and all consumed source/calculation
  dependencies before each tool read, model step, native output release and replay.
  Persist bounded dependency/version receipts, fail closed on withdrawal or outage,
  and preserve the configured model and reasoning selection. Cancellation and
  restart must not start a second paid turn or commit any staffing state.
- **FR-021**: Bound imports, pagination, matching, writes, advisory context, model
  steps and deadlines. Support visible cancel/failure/reconciliation states, no
  automatic paid retry, scoped idempotency, audited decisions and redacted metrics
  for duration, source exclusion, capacity conflict, import failure and model usage.
- **FR-022**: Use explicit recoverable storage upgrades and a feature intake switch
  while eligible historical reads remain available. Validate only in marked test
  databases or owned clones; inspect Preview identity before any later upgrade and
  require disposable gates first. Never connect to Production, link Vercel or deploy.
- **FR-023**: Require automated boundary, authorization, source lifecycle, deterministic
  calculation, concurrency, replay, migration and recovery checks; a real synthetic
  accepted-plan→competency-review→match→confirmation→operations journey; CLI WebKit
  and actual-output Turi evaluation; representative performance evidence. Incomplete
  checks remain explicitly incomplete and implementation tasks remain unchecked.

### Key Entities

- **Delivery resource**: Canonical person/resource identity, scope, membership link,
  type, active state and working location; no salary or HR evaluation fields.
- **Skill / competency revision**: Versioned vocabulary and assessed level with exact
  provenance, dates, reviewer decisions and current eligibility.
- **Competency import**: Private source, immutable extraction/map revisions,
  candidate rows and their exact review outcomes.
- **Resource calendar revision**: Dated local working intervals, approved deductions,
  protected time and accountable availability review.
- **Staffing demand revision**: Customer/workload, accepted engagement baseline,
  role/skills, working constraints and dated required time.
- **Allocation revision / decision**: Exact resource/demand/date/time proposal,
  tentative expiry or confirmed/released state, manager and idempotent receipt.
- **Staffing review preview**: Expiring exact-version decision view binding actor,
  calendar, source, capacity and baseline state.
- **Economic input / scenario**: Restricted effective rates, revenue/nonlabor inputs,
  formula policy decision and reproducible calculation with explicit incomplete state.
- **Advisory binding / dependency receipt**: Fixed staffing scope and capabilities,
  consumed versions, bounded usage and native cancellation/replay validity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scripted synthetic user can import and approve competencies, qualify
  accepted-plan demand, inspect matches, confirm one allocation and read its capacity
  effects; persisted source, baseline and decision identities agree at every step.
- **SC-002**: All access, source-withdrawal, stale-evidence and hidden-personnel sentinel
  cases return no prohibited content across UI, history, matching, calculations,
  advisory context, active output and replay, including while cleanup is paused.
- **SC-003**: Repeated and concurrent confirmation/amendment/cancellation tests create
  exactly the intended decisions and allocations; two competing requests never
  commit more daily capacity than allowed, even with a concurrent calendar change.
- **SC-004**: The versioned arithmetic corpus produces exact expected values for
  partial leave, overlapping deductions, protected time, timezone/daylight-saving
  boundaries, zero/missing inputs, rate changes, rounding and negative contribution.
- **SC-005**: At 500 resources, 50 skills, 20,000 competency revisions and 10,000 dated
  allocation entries over 13 weeks, the 95th percentile for paginated roster/detail,
  a 50-row match result from that resource pool and an operations view is at most two seconds; confirmation
  acknowledgment is at most two seconds, with five concurrent users and 100 measured
  calls per class after warm-up, zero correctness failures and recorded as-of bounds.
- **SC-006**: All eight fixed synthetic live advisory cases pass source fidelity,
  personnel/finance isolation, deterministic-number agreement, uncertainty and no
  unauthorized-write gates; each completes or safely terminates within 120 seconds,
  six model steps, 4,096 output tokens per step and six read-tool calls. No paid retry.
- **SC-007**: The import-to-allocation and restricted operations journeys pass CLI
  WebKit in desktop/mobile and light/dark, keyboard-only review/confirmation, no
  horizontal overflow at 390px and zero serious/critical accessibility violations.
- **SC-008**: Disposable empty and schema-031 upgrade/role checks and a paired recovery
  drill preserve current sources, decisions and native advisory scope. Restart and
  cleanup races produce no duplicate commitment or access widening. Preview remains
  unchanged until disposable gates pass and its identity is freshly inspected.

## Assumptions

- 002–006 are merged dependencies; schema 031 is the last verified Preview version.
  This planning workflow performs no database connection, migration or live model call.
- Existing temporary logins remain. Only `mcteer` holds staffing-manager and finance
  authority for 007; delegation, capability administration and partner workforce
  management are deferred. `panel` can propose customer demand and allocations.
- The initial roster may include internal and partner resources managed by internal
  managers; a resource need not have a login. Partner-resource customer eligibility
  must be explicit and never inferred from a name or import row.
- CSV/XLSX are the supported competency inputs; no model-based sheet mapping,
  external calendar/HR sync, CV scraping or embedding-based personnel ranking.
- Staffing eligibility requires current competency evidence valid through the work
  interval and currently fresh availability certification covering that interval;
  stale evidence requires reassessment first. Changes after confirmation flag a
  commitment for review; 008 will own execution-time revalidation.
- Economics are planning-only. No formula is represented as finance-approved until
  a separately authorized human records approval; synthetic fixtures can demonstrate
  that workflow without claiming real finance acceptance.
- Recommended capacity/metric/import limits and currency details are finalized in
  the design contracts. They are implementation bounds, not industry benchmarks.
