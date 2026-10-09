# Feature Specification: Product Gaps and Engineering Feedback

**Feature Branch**: `012-product-gap-feedback`

**Created**: 2026-10-08

**Status**: Implementation complete; local acceptance passed; hosted rollout pending

**Input**: Complete specify, clarify, plan, tasks and analyze for roadmap 012; stop before implementation for a model switch.

## Context and Scope

Turas needs evidence-backed records of unmet product capabilities and their customer impact. Repeated notes and engagements must not inflate affected-customer counts. Engineering readers need reviewed problems, evidence, workarounds and requested decisions, with traceable human-reported handoffs.

This slice delivers an internal gap registry, reviewed customer impact, canonical merge/split decisions, transparent ordering, detailed and portfolio report templates, and manual handoff receipts. Product gaps remain distinct from defects, documentation gaps, enablement needs, expansion hypotheses, support tickets and roadmap commitments.

Active internal members propose and read permitted records. Canonical active internal administrator `mcteer` alone reviews gaps/impact, confirms merge/split, approves report disclosure and records/corrects engineering handoff. Account owners, stewards and other administrators do not inherit this authority.

## Clarifications

### Session 2026-10-08

- Q: Who should approve product gaps, confirm merges/splits, and authorize engineering report handoffs in 012? → A: mcteer only; internal members propose.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture and Review a Customer Product Gap (Priority: P1)

An internal delivery/account user records an unmet capability, customer/workload, desired outcome, current product/version, evidence and workaround. The reviewer classifies the problem and confirms exactly what the evidence establishes.

**Why this priority**: Trustworthy gap and impact records are the foundation for counts and reports.

**Independent Test**: Create and review one gap/impact; inspect the exact reviewed revision, citations and unknowns without changing accepted profile facts.

**Acceptance Scenarios**:

1. **Given** an active internal member and permitted customer, **When** a gap and impact observation are saved, **Then** both remain proposed until review and missing evidence remains unknown.
2. **Given** accepted customer-need evidence and current direct product evidence, **When** the reviewer confirms exact revisions with rationale, **Then** reviewed heads advance with receipts and the customer contributes once to confirmed current impact.
3. **Given** only public attribution, chat claims, stale critical evidence or unresolved contradictions, **When** confirmation is attempted, **Then** it is refused while a suspected observation can remain for investigation.
4. **Given** reviewed content, **When** it is edited, **Then** a new proposal preserves the old reviewed head and never silently inherits approval.

### User Story 2 - Reconcile Duplicates and Explain Impact (Priority: P2)

A reviewer consolidates duplicate gaps or separates distinct needs. Internal readers see current confirmed, suspected-only and resolved/historical impact with explained counts and dates.

**Why this priority**: Repeated reports must not distort engineering priorities.

**Independent Test**: Merge/split two gaps with repeated observations for two customers; verify distinct counts and immutable lineage and deny information leakage to forbidden callers.

**Acceptance Scenarios**:

1. **Given** three observations across two workloads for one customer, **When** impact is counted, **Then** the customer counts once per canonical gap and current confirmed suppresses current suspected-only membership.
2. **Given** reviewed duplicate gaps, **When** the reviewer accepts an exact merge preview, **Then** one canonical identity remains, old identities redirect without cycles, original observations survive and counts are recomputed.
3. **Given** a gap containing two needs, **When** a reviewed split explicitly assigns each observation, **Then** lineage survives and no observation is implicitly copied to inflate both gaps.
4. **Given** withdrawn evidence or a resolved impact, **When** current totals are read, **Then** unsupported current impact is excluded immediately and resolved impact is separate even with the cleanup worker stopped.

### User Story 3 - Prepare Reviewed Engineering Reports (Priority: P2)

An internal user prepares a detailed gap report or portfolio summary. The reviewer approves its exact revision, audience and customer disclosure before export for handoff.

**Why this priority**: Consistent reports make engineering feedback actionable and evidence limitations visible.

**Independent Test**: Generate both templates from synthetic reviewed records, compare counts/citations, approve exact disclosure scope, download, then invalidate access through a material source change.

**Acceptance Scenarios**:

1. **Given** a reviewed gap, **When** a detailed report is prepared, **Then** every product-gap detail template v1 section, source citation, impact classification and unknown is represented.
2. **Given** selected products and a cutoff, **When** a portfolio report is prepared, **Then** template v1's gap table, unique counts, explained ordering, decisions and method/limits are present; incomparable trends say unavailable.
3. **Given** a draft or changed audience/source snapshot, **When** export or handoff is attempted, **Then** release is denied pending exact authorized review.
4. **Given** identifying customer material, **When** engineering disclosure is approved, **Then** every included customer has an explicit disclosure decision for the exact report/audience; this grants no public/shared-learning rights.

### User Story 4 - Track Engineering Handoff and Follow-up (Priority: P3)

The reviewer records manually handing a specific approved report to a named engineering recipient/team, with event time, reference and requested decision. Follow-up distinguishes reported acknowledgment/investigation from proven resolution or product commitments.

**Why this priority**: Feedback needs accountable follow-up without fictitious external delivery.

**Independent Test**: Record/replay a manual handoff, append a correction and follow-up, and show one original receipt bound to the report/audience.

**Acceptance Scenarios**:

1. **Given** an eligible approved report, **When** manual handoff is recorded, **Then** an immutable human-reported receipt identifies its report, audience, reporter, time and reference.
2. **Given** a lost client acknowledgment, **When** an identical request is retried, **Then** the same currently authorized receipt returns without another record or external action.
3. **Given** no engineering response evidence, **When** the receipt is viewed, **Then** it claims no external acknowledgment, ticket status, shipping date or resolution.
4. **Given** reported engineering resolution, **When** customer impact is updated, **Then** each customer's resolution requires a separate reviewed observation; the handoff changes no impact or maturity automatically.

### Edge Cases

- Cross-environment/workspace IDs, partner access, inactive sessions, source removal and authority races fail closed before counts, retrieval, previews, exports and writes.
- Canonical customer identity governs counting; subsidiaries remain distinct unless the customer system says otherwise. Anonymous public cases never confirm named-customer impact.
- Concurrent merge/split, cycles, stale previews, changed-input replay and overlapping merge sets cannot partially update records or duplicate receipts.
- Confirmed current impact suppresses suspected-only impact for the same customer/gap; historical resolution can coexist with a later recurrence without duplicate current counting.
- Unknown product versions, absent workarounds and unknown dates remain unknown. Account value and product footprint never substitute for evidence or severity.
- Record limits and pagination never silently truncate a report. Merged identities retain permitted lineage and do not count as separate live gaps.
- Withdrawal with a stopped worker immediately withholds dependent prose/export; bounded minimal audit cannot expose withdrawn passages.
- Already downloaded material cannot be recalled. Corrections block future release and flag historical handoffs for human follow-up; 012 sends no notification.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide internal workspace gap and customer-impact views. Enforce current environment, workspace, active internal membership, customer and source authorization before every operation. Partners receive no gap content, counts, existence/relationship hints, reports or receipts.
- **FR-002**: Separate canonical identity, immutable revisions, proposed working and reviewed heads, impact observations, decisions, reports and handoffs. Editing never inherits review or promotes customer facts.
- **FR-003**: Internal members may propose/read permitted records. Only canonical active internal administrator `mcteer` may review, reclassify, defer/dismiss/reopen, merge/split, approve disclosure and record/correct handoff. No account-owner, steward or other-admin override is implied.
- **FR-004**: A gap records product/capability/version (unknown allowed), problem, workflow, desired outcome, reproduction conditions, constraints, severity rationale, workaround/limits, proposed capability, acceptance criteria, alternatives, unknowns, owning triage team and requested decision. Kind distinguishes product gap, defect, documentation and enablement.
- **FR-005**: Impact records canonical customer, optional workload/engagement, observation dates, suspected/confirmed/resolved classification, severity, consequences, workaround burden and original evidence. Distinguish accepted facts, attributed research, estimates and unknowns; never infer ARR, intent, adoption or roadmap promises.
- **FR-006**: Preserve source identity/revision, exact locators, original dates, quality, conflicts, rights and eligibility. Confirmation requires accepted customer-need/impact evidence and current direct product evidence. Public research alone can support suspected impact only. Gap review never approves source claims or refreshes their dates.
- **FR-007**: Decisions bind exact revisions, current sources/authority, rationale and expected versions. Reviewed disposition is open, deferred or dismissed; defer requires a future revisit date and reopen is explicit. Product-resolution evidence never automatically resolves customer observations.
- **FR-008**: Merge/split is an explicit atomic reviewed action with exact preview, rationale and immutable lineage. Forbid automatic similarity merging, history rewriting, cycles and implicit observation duplication. Corrections are follow-on decisions.
- **FR-009**: Count distinct canonical customers per canonical gap, never notes/workloads/engagements. Separate current confirmed, current suspected-only and resolved/historical counts. Eligible current confirmed suppresses suspected-only membership. Use currently authorized eligible evidence, visible cutoff and a versioned method.
- **FR-010**: Portfolio aggregates are restricted to active internal members and their permitted customer/source set. No partner/public/shared-knowledge aggregate is delivered. Filters, deltas, links and suppression cannot expose hidden customers. Recompute both trend periods under the same current access and method, or report unavailable.
- **FR-011**: Explain deterministic ordering using reviewed severity, confirmed breadth, workaround feasibility and due-review flags, with stable tie-breaks; display evidence freshness as a separate review signal. Do not invent weighted business scores, ARR benefit or commercial priority.
- **FR-012**: Prepare versioned detailed/portfolio reports matching the existing product-gap templates from reviewed eligible data. Preparation is deterministic; authored narrative remains labeled and reviewed. Include required sections, scope/cutoff, comparison method, unknowns, lineage and count methodology, including valid zero-result reports.
- **FR-013**: Review binds exact report content, included gaps/customers, source closure, template/method versions and named engineering audience. Customer-identifying disclosure requires explicit per-customer reviewer attestation for that exact use. Export requires current approval/disclosure/source eligibility, private bounded artifacts and receipts; forbid public URLs and shared-learning publication.
- **FR-014**: Record human-reported manual handoff/follow-up only, tied to an eligible approved report/audience. Never claim provider transmission, external acknowledgment or resolution without separately attributed evidence. Corrections append. External references are inert display links and trigger no fetch or send.
- **FR-015**: Mutations are version-checked, idempotent and transactional. Lost acknowledgments reconcile by opaque request identity with authorization rechecked. Material source, membership, relation or disclosure changes invalidate dependent previews/reviews before release.
- **FR-016**: Withdrawal/correction/access changes immediately invalidate affected current prose, counts, report downloads and new handoffs. Bounded retention preserves permitted minimal identities/decision lineage while expiring derived report content and diagnostics; delayed jobs cannot restore access.
- **FR-017**: Provide accessible registry/detail, impact, duplicate review, report and handoff views with loading/empty/denied/stale/failed states. Preserve desktop/mobile light/dark design, keyboard use and customer context. Pending UI storage contains only opaque reconciliation identity, never private prose.
- **FR-018**: Bound inputs, selected records/source closure, pagination, artifact size, concurrency, retries and duration. Return explicit over-limit/incomplete states. Asynchronous preparation/export supports cancellation and never repeats ambiguous external actions; none are introduced here.
- **FR-019**: Use explicit versioned migration, recovery and disable procedures, preserving selected database/workflow data. Disable blocks new authoring/review/preparation/handoff but permits authorized metadata, cancellation, reconciliation and retention. Logs contain only safe identity/category/timing/count data.
- **FR-020**: Supply targeted automated access, lifecycle, canonicalization, counting, report/disclosure, race/replay, retention and recovery checks; validate complete journeys across four desktop/mobile light/dark browser configurations with synthetic data and no paid model calls.
- **FR-021**: Preserve Turi's selected model and behavior. No model generation/clustering, new agent tool, automatic research, ticket connector, email send, shared learning or MCP endpoint is added. Future model-assisted proposals require their own bounded contract and evaluations.
- **FR-022**: Keep documentation/tasks/evidence current and distinguish planning, local, CI, Preview and Production. This planning request authorizes no hosted migration or rollout.

### Key Entities *(include if feature involves data)*

- **Product gap/revision**: canonical workspace identity, product/capability, immutable narrative, working/reviewed heads, reviewed disposition and relation generation.
- **Impact observation/revision**: canonical customer and optional workload/engagement, observed interval, classification, severity and original evidence.
- **Review/canonicalization decision**: exact inputs, source/authority versions, rationale, actor, transition and explicit merge/split assignments/lineage.
- **Impact projection**: deterministic current/historical distinct-customer counts and ordering under one authorization/method/cutoff.
- **Engineering report revision**: template, selection, eligible source snapshot, disclosure decisions, audience, approval and private artifact lifecycle.
- **Handoff receipt/follow-up**: human-reported report/audience-bound event, correction chain, time, recipient/team, reference and evidence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Author/reviewer complete capture → evidence review → canonical gap → classified impact without changing accepted profiles; every decision identifies exact revisions and rationale.
- **SC-002**: The complete negative-access corpus exposes zero forbidden identities, content, counts, relationship hints or export bytes across environment/workspace, partner, revoked-member and withdrawn-source cases.
- **SC-003**: Every prescribed counting case (repeats, workloads, merge/split, recurrence, resolved impact, source removal and partial visibility) matches independently specified totals; racing/repeated requests create zero duplicate decisions or assignments.
- **SC-004**: Both reports pass required-section/count/citation/disclosure checks, including zero-result, missing-date, changed-source and maximum-selection cases. Unapproved/invalidated reports release no export bytes or valid new handoff.
- **SC-005**: With 200 customers, 2,000 gaps, 10,000 observations and 40,000 revisions and five concurrent internal readers, 95% of ordinary list/detail/review operations finish within two seconds; a bounded 100-gap report prepares within 30 seconds with no silent truncation.
- **SC-006**: All author/reviewer/report/handoff browser journeys pass four viewport/theme configurations with keyboard access, no horizontal page overflow and zero serious/critical accessibility findings.
- **SC-007**: Empty and prior-version upgrade/restart checks preserve identities, review/receipt history and selected environment/workflow markers; retention/disable checks cannot resurrect withdrawn material.

## Assumptions

- 005, 008 and 009 are merged implementation dependencies; their hosted acceptance is separate. 003/004 supply customer/original evidence identities. 011 product/source patterns may be reused without inheriting expansion-owner authority.
- Temporary internal principals remain `mcteer` and `panel`; partners gain no access. The user confirmed mcteer-only review authority.
- Reports are private operational material for an explicitly reviewed engineering audience. No public/partner aggregate or automatic delivery is included; internal counts claim no anonymity threshold.
- Versioned reports display in-app and export as UTF-8 Markdown plus a machine-readable JSON manifest. New PDF/slides rendering and scheduled gap reports are deferred; existing template sections are mandatory.
- Capture/canonicalization/report preparation is human-authored or deterministic. Model-assisted clustering/prose is a later scope decision.
- Legacy is read-only reference; no automatic import of its data, instructions or fixtures.
