# Feature Specification: Customer profiles, maturity and context review

**Feature Branch**: `003-customer-profile-review`
**Created**: 2026-09-27
**Status**: Clarified and planned — analysis findings remediated; implementation pending
**Input**: Roadmap slice 003 and the platform brief: rich customer profiles, maturity history, governed context review, and partner delivery-only visibility.

## Scope

Build the canonical customer profile on the identity and grants established in 002. It records scoped product use, maturity, research, risks, engagement references, decisions, outcomes and review dates. Manual context requires review before factual use. Independently discovered research has distinct provenance and quality labels. Only synthetic customers and public research are permitted in this slice.

File attachment/extraction is 004; research discovery, retrieval and publication of sanitized cross-customer learnings are 005; delivery plans and execution are 006–008. 003 may display engagement references but does not run engagements. No new unused eve integration, private real-customer data or deployment is required.

## Clarifications

### Session 2026-09-27

- Q: When someone manually edits a customer’s product use, maturity assessment, risk, or other profile fact, should that edit require a steward’s approval before guidance treats it as fact? → A: Yes. Every manually entered factual profile change requires steward approval before it becomes accepted guidance context.
- Q: For an assigned customer, should a partner see pending or rejected submissions made by other contributors? → A: No. Partners see only their own pending or rejected submissions, plus all accepted facts relevant to delivering that customer's engagement regardless of source or contributor. Internal staffing, utilization, reporting metrics and other operational data remain hidden.
- Q: Who should be allowed to retract an accepted customer fact so future guidance stops using it immediately? → A: The assigned customer steward or `mcteer` administrator may retract it. Other contributors may request retraction but cannot withdraw accepted context themselves.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand a customer in one profile (Priority: P1)

As an internal employee, I can open any customer in my workspace and distinguish its workloads, product use, maturity, open concerns and history without treating missing information as a negative assessment.

**Why this priority**: The profile is the context foundation for later delivery guidance.

**Independent Test**: Populate a synthetic customer with two workloads and different product use; open and revise its profile as `panel`, then inspect current and historical records.

**Acceptance Scenarios**:

1. **Given** a customer with two workloads, **When** an internal user opens the profile, **Then** customer-level and workload-specific identity, product use, maturity, risks, research, engagement references, decisions, outcomes and next reviews are distinct.
2. **Given** a sparse new customer, **When** its profile opens, **Then** missing fields show Unknown or empty, without inferred maturity or adoption.
3. **Given** a manually revised product-use or risk record, **When** it is submitted and history is opened, **Then** the old accepted value remains current until the new revision is approved, while both values, scope, source, dates, actor and review state remain inspectable.
4. **Given** a new customer in the workspace, **When** `panel` or `mcteer` opens the directory, **Then** that profile is available without a delivery assignment; another workspace remains inaccessible.
5. **Given** concurrent proposals for the same customer details or scoped product, **When** reviewed, **Then** they share one canonical record, only one version can replace a given accepted head, and the directory and overview agree without disclosing hidden candidates.
6. **Given** a retracted canonical record, **When** the overview opens, **Then** the slot is Unknown until another revision is accepted; list kinds still show their other current items.

---

### User Story 2 - Assess a scoped maturity journey (Priority: P1)

As an internal practitioner, I can assess a customer's or workload's maturity with evidence, see change over time and define the next capability, without reducing independent dimensions to one score.

**Why this priority**: Guidance needs consistent, inspectable maturity separate from purchases and engagement phase.

**Independent Test**: Assess two dimensions on a workload, leave another Unknown, then create a later assessment and compare the journey stage, dimension states and history.

**Acceptance Scenarios**:

1. **Given** a workload, **When** an authorized user submits an assessment, **Then** each assessed dimension has its own state, rationale, observation window, assessor, rubric version, eligible evidence, next capability and review date; the assessment remains Pending until steward approval.
2. **Given** only some dimensions assessed, **When** the summary opens, **Then** the others remain Unknown and no average or product-count proxy appears.
3. **Given** a revised assessment, **When** history opens, **Then** the prior revision remains inspectable and the current revision is clear.
4. **Given** an engagement reference in a delivery phase, **When** maturity is viewed, **Then** the phase has not automatically changed a journey stage or dimension.
5. **Given** multiple assessment proposals for one scope, **When** one is approved against the current head, **Then** its complete assessment becomes current and older windows remain historical; replacing it with an older observation window requires explicit reviewer acknowledgment.

---

### User Story 3 - Review submitted customer context (Priority: P1)

As a customer steward, I can accept or reject an exact version of a manually submitted claim. Contributors see its state and rationale; pending material never silently becomes accepted fact.

**Why this priority**: Chat claims and manual submissions can be useful but need an approval gate.

**Independent Test**: Submit synthetic claims from a customer conversation and profile; accept, reject, correct and retract revisions, checking the profile and assistant context after each decision.

**Acceptance Scenarios**:

1. **Given** an authorized contributor submits a claim, pasted text or user URL, **When** it is saved, **Then** its exact content, source, submitter, customer/workload scope and time are Pending.
2. **Given** a pending claim or structured profile edit, **When** its authorized steward accepts or rejects it with a rationale, **Then** that exact revision receives one attributed decision and only acceptance makes it eligible factual context.
3. **Given** an accepted claim, **When** a contributor proposes a correction or requests retraction, **Then** accepted context does not change until an authorized steward or administrator decides; a proposed correction requires separate approval and prior history remains.
4. **Given** an accepted fact, **When** its assigned steward or `mcteer` retracts it with a rationale, **Then** it immediately becomes ineligible for future factual guidance while the retraction decision and prior revision remain auditable.
5. **Given** a retried or stale decision, **When** it is processed, **Then** no duplicate or conflicting effective decision occurs and the reviewer receives the current outcome.
6. **Given** a conversation bound to customer context, **When** relevant accepted context changes or its snapshot expires at the next freshness boundary or 24-hour cap, **Then** continuation/replay stops; subsequent app/native reads withhold stale assistant/tool bodies and generated snippets while authorized owner messages remain with a historical notice. Hidden internal-only changes do not invalidate partner context.
7. **Given** a historical conversation, including an unbound 002 conversation, **When** its owner explicitly starts a new conversation for the still-authorized customer, **Then** fresh context is loaded without rebinding the old session or copying its generated summary. Revoked access denies both history and new conversation creation.

---

### User Story 4 - Judge research and evidence quality (Priority: P2)

As an internal practitioner, I can attach independently discovered public research with provenance and quality signals, and distinguish what its source directly supports from a private customer claim.

**Why this priority**: Public evidence can improve context but cannot establish private delivery or commercial facts.

**Independent Test**: Add dated public research through an authorized research path, compare it with a user-supplied URL and contradictory accepted claim, and inspect labels and freshness.

**Acceptance Scenarios**:

1. **Given** public research passing identity, source-integrity, scope and content checks, **When** attached, **Then** its researcher, source, publication/observation and retrieval dates, supported claim, scope and quality are visible as Research.
2. **Given** a user-supplied URL, **When** fetched or summarized, **Then** its origin remains manual and still requires approval.
3. **Given** a public source discussing a company, **When** used, **Then** it does not establish private staffing, financial, engagement or deployment facts absent direct support.
4. **Given** stale or conflicting evidence, **When** a profile or assistant addresses the topic, **Then** age or conflict appears rather than a settled claim.
5. **Given** manual evidence with omitted or proposed quality inputs, **When** submitted, **Then** explicit unknown defaults or supplied ratings are included in its immutable digest and labeled Proposed; accepting that version confirms them, while changing them requires a new Pending revision.
6. **Given** trusted fixture research or a rating correction, **When** scored, **Then** the exact input revision, rating actor, rationale and date basis are traceable, F/Q are server-computed, and a correction cannot silently mutate accepted or independently researched evidence.

---

### User Story 5 - Deliver within a partner boundary (Priority: P2)

As a partner assigned to one customer, I can see the context relevant to that delivery and propose context, without seeing another customer's profile or internal-only fields.

**Why this priority**: Partner access is customer-specific, while later shared learnings will have separate reviewed publication.

**Independent Test**: Grant `partner` one of two synthetic customers. Compare directory, profile, search, history, assistant and direct-record access with internal accounts, then revoke the grant.

**Acceptance Scenarios**:

1. **Given** a current grant to customer A, **When** `partner` opens A, **Then** delivery-relevant identity, workloads, maturity, product use, accepted context, delivery risks and engagement references are shown regardless of which contributor or eligible source supplied each accepted fact.
2. **Given** no grant to customer B, **When** `partner` searches or requests B or its related records directly, **Then** no content, count, snippet or existence detail is disclosed.
3. **Given** A has internal staffing, utilization, reporting metrics, commercial, cost, personnel or unrelated account notes, **When** `partner` views A or asks the assistant, **Then** those fields and facts derived from them are withheld.
4. **Given** the grant is revoked, **When** `partner` next reads or submits, **Then** current authorization denies the operation.
5. **Given** several contributors have pending, rejected and accepted submissions for A, **When** `partner` opens submission history, **Then** it sees its own pending/rejected content and status, every delivery-relevant accepted fact regardless of origin, and no other contributor's unaccepted content, count or decision detail.

### Edge Cases

- Customer rename or workload merge preserves stable identity and history; evidence is not silently rebound.
- A product can be used in one workload and only evaluated in another; actual, evaluating, planned, retired and unknown remain distinct.
- Missing trustworthy dates, future evidence dates and elapsed review windows yield Unknown, invalid or Stale labels; retrieval alone never refreshes age.
- Public research repeating a user claim retains separate origins and cannot launder the manual claim into accepted status.
- A strong quality score cannot override pending/retracted state or access restrictions.
- An accepted record classified as internal-only remains hidden from partners, including its source and review history; approval does not widen its audience.
- Contradictory accepted evidence is flagged; no unqualified settled summary is presented until resolved.
- Retries and concurrent updates yield one logical change, without duplicate audit decisions.
- Revoking a partner grant while a view or assistant response is open denies subsequent protected actions; already displayed information cannot be recalled.
- Unavailable sources or partial profiles show the limitation and a retry or review action rather than fabricated completion.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Maintain stable workspace-owned customer and optional workload identities, with name/scope history. Do not silently move evidence or engagement references when scope changes.
- **FR-002**: Show a canonical profile of identity, relevant stakeholders, product-use records, maturity, engagement references (past/current/future), research, risks, decisions, outcomes and next review actions. Mark customer-wide versus workload-specific records and distinguish unknown from negative. Maintain one canonical details record per customer/workload, one product-use record per product and scope, and one maturity record per scope; other kinds may contain multiple independent items. Current values come from accepted heads, never inferred timestamp ordering or historical fallback after retraction.
- **FR-003**: Record product use as actual, evaluating, planned, retired or unknown, with scope, time, source, owner and material usage description. Product use alone cannot determine maturity.
- **FR-004**: Record the six journey stages Explore, Activate, Accelerate, Optimize, Scale and Transform as evidenced summaries. Assess six independent dimensions—outcome/ownership, delivery/collaboration, experience/adoption, operational trust, platform/organization, innovation/AI—using Unknown, Emerging, Established, Measured, Scaled or Adaptive. No average, purchase proxy or automatic advancement.
- **FR-005**: Preserve assessment scope, observation window, assessor, rubric version, rationale, eligible evidence references, next measurable capability, review date and revision history.
- **FR-006**: Keep engagement delivery phase separate from journey stage, maturity dimensions and plan administrative state. 003 shows engagement references, not an execution workflow.
- **FR-007**: Record risks with scope, category, likelihood, impact, severity, owner, mitigation, status, evidence, dates and history; distinguish delivery-relevant risks from internal account concerns.
- **FR-008**: Save every manually entered factual profile change—including customer/workload details, product use, maturity, risks, stakeholders, engagement references, decisions and outcomes—and customer claims from profile entry or customer-bound chat as Pending exact revisions with source type, submitter, scope and time. The prior accepted revision remains current until a replacement is approved. User-provided URLs remain manual even if later fetched or summarized.
- **FR-009**: Permit assigned customer stewards to accept or reject exact pending revisions with actor, time and rationale. `mcteer` can assign stewards and act as one; `panel` can review only assigned customers; `partner` can propose only for granted customers and never approve. Stewardship changes are auditable.
- **FR-010**: Allow contributors to propose corrections and request retractions without changing current accepted context. Corrections start Pending and require steward approval. Only the assigned customer steward or `mcteer` may retract an accepted revision, with recorded actor, time and rationale; that revision immediately becomes ineligible for future factual use. Superseded/retracted revisions remain in history. Reject stale decisions and reconcile repeat requests to at most one effective decision per revision.
- **FR-011**: Show contributors their submission status and stewards a review queue with source, scope, submitter, age, conflicts and history. Partners may see only their own pending/rejected submissions and associated decisions; other contributors' unaccepted submissions, counts and decision details are hidden from them. Saving a draft or extraction is not approval.
- **FR-012**: Attach independently discovered public research after identity, source-integrity, scope and content checks. Preserve origin, source location, researcher, supported claim and publication, observation, event and retrieval dates. Label it attributed Research, not a customer-approved private fact. Discovery tooling belongs to 005.
- **FR-013**: Rate evidence using versioned, claim-specific reliability (40%), freshness (30%), directness (20%) and corroboration (10%), each 0–4, producing a rounded 0–100 score according to the [evidence policy](../../docs/evidence-policy.md). Label 80–100 Strong, 60–79 Usable, 40–59 Weak, 0–39 Insufficient. Preserve component ratings, rationale, version, rating actor and assessment date; score never grants approval, access or truth. Contributors may propose immutable rating inputs; the steward confirms the exact inputs on acceptance. Missing inputs remain explicit unknown/zero defaults. Rating corrections require a new reviewed revision; trusted research ingestion records its own inputs and actor. Freshness and totals are computed server-side.
- **FR-014**: Use review windows of 7 days for account status/blockers/staffing; 14 for product availability/limits/pricing; 30 for product capabilities/practices; 90 for adoption/process/competency; 180 for architecture. Label Recent through one window, Aging through two, Stale beyond two, Unknown without a trustworthy evidence date. Apply the policy's freshness component bands and overdue-review cap. Retrieval/review does not reset age; future evidence dates are invalid and future events distinct.
- **FR-015**: Preserve provenance, classification, revisions, quality history, conflicts and decisions. Distinguish accepted context, attributed research, estimates, assumptions, pending, rejected, superseded and retracted content wherever a profile or assistant could treat it as evidence. Unresolved contradictions cannot be presented as settled.
- **FR-016**: Enforce active workspace/customer authorization on every profile, field, search, history, review, research and assistant-context read/write. `panel` and `mcteer` can view every workspace profile, but only `mcteer` administers access and neither gains another user's private chat. Partners require current explicit customer grants and receive all accepted facts and eligible, attributed public research relevant to delivering their assigned engagement, regardless of source or contributor. Exclude internal staffing, utilization, reporting metrics, commercial, cost, personnel and unrelated account notes. Each profile record has an audience classification; acceptance alone does not authorize a field for partner delivery views.
- **FR-017**: Apply partner projections to derived results, counts, snippets, assistant responses and direct record requests. Denials cannot reveal ungranted customers' existence. Recheck grants on every protected operation.
- **FR-018**: Supply downstream customer context only from current accepted manual profile facts and claims, plus eligible, explicitly attributed research within requester scope. Pending/rejected/superseded/retracted content is never presented as accepted fact; chat text alone never updates a profile fact. Context-generation changes or expiry stop continuation and replay of the old conversation. Preserve stored history, but withhold stale assistant/tool bodies and generated titles/snippets from subsequent reads; owner messages remain accessible only under current authorization. Require explicit new conversation creation without copying a summary. Unbound 002 conversations receive the same historical treatment.
- **FR-019**: Provide empty, loading, denied, conflict and unavailable states in the reference visual style at mobile and desktop widths in both themes. Review controls and provenance labels are keyboard accessible and distinguishable without color.
- **FR-020**: Restrict the demo to synthetic customer content and public research; visibly identify fixtures. No real private-customer ingestion, new external service or deployment is required for 003.

### Key Entities *(include if feature involves data)*

- **Customer / Workload**: Stable workspace-scoped identities with name and scope history.
- **Profile record**: Scoped, versioned product-use, stakeholder, decision, outcome, engagement reference or next-review item with author, dates, provenance and audience classification.
- **Maturity assessment**: Versioned journey statement and independent dimension states with evidence, rationale, assessor, rubric and next capability.
- **Risk**: Scoped concern, likelihood/impact, mitigation, owner, state, evidence and history with audience classification.
- **Context claim / evidence source**: Exact statement, origin, location, dates, scope, revisions, classification, quality and conflict links.
- **Review decision / steward assignment**: Authorized person and scope, exact claim revision, disposition, rationale, time and audit history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With two workloads and 25 mixed records, at least 90% of internal reviewers identify current product use, known maturity states, the top open delivery risk and next review action within three minutes without confusing Unknown with negative.
- **SC-002**: In scripted internal, assigned-partner, unassigned-partner and revoked-grant journeys, 100% of ungranted customer, other-contributor unaccepted context and internal-only field attempts are denied across directory, profile, history, search, review and assistant paths without identifying metadata; accepted delivery facts remain visible to the assigned partner regardless of contributor.
- **SC-003**: Across submission, accept, reject, correct, retract, retry and concurrent-decision journeys, 100% of pending/rejected/superseded/retracted revisions are absent from accepted-fact context, with at most one effective decision per revision.
- **SC-004**: Every displayed maturity assessment exposes scope, window, assessor, rubric, evidence, rationale and next capability; no dimension is inferred from product count or delivery phase.
- **SC-005**: For a fixed synthetic dated-source set, all quality bands and freshness labels match the published rubric, including future/unknown dates; scores never bypass approval or visibility.
- **SC-006**: At least 90% of five internal walkthrough participants distinguish accepted claims, research, pending submissions and conflicts, and complete a routine review within two minutes.
- **SC-007**: With 100 synthetic profiles and 25 records each, 95% of authorized profile opens present the current view within two seconds in local testing; mobile and desktop views in both themes complete read/review flows without horizontal overflow or inaccessible controls.

## Assumptions

- The three 002 demo principals, workspace memberships, grants and private chat ownership remain the identity baseline; full authentication and production data are later work.
- `mcteer` is initial steward for synthetic customers and may delegate per customer to `panel`. A steward may review their own submission with visible attribution; stricter separation can be introduced before real customer data.
- Customers may lack workloads, assessments, research, risks or engagements; absence is not a fact to infer from.
- The six-stage and six-dimension model is the initial version proposed in the product blueprint; later changes preserve historical rubric versions.
- Evidence-quality v1 applies to structured claims/research here; 004 extends it to artifacts and 005 adds retrieval and reviewed shared publication. 003 does not expose cross-customer raw sources.
- The Vercel project remains disconnected; local and CI evidence suffice until replacement readiness.
