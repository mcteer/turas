# Feature Specification: Delivery plans and technical designs

**Feature Branch**: `006-delivery-plans`
**Created**: 2026-09-29
**Status**: Planning package prepared; implementation has not started
**Input**: Roadmap 006 and the request to run specify, clarify, plan, tasks and analyze before changing models for implementation.

## Scope and intent

Enable members to turn governed customer context and eligible shared practices
into a reviewable delivery plan and technical design, accept an exact revision
into the selected customer, and preserve a baseline when the plan changes.
This completes the planning part of the 002–006 trusted-context journey.

The plan follows all twelve sections of delivery-plan-v1: executive charter;
current state and maturity; scope and acceptance; options and recommendation;
technical design; delivery work plan; staffing and economics; RAID and decisions;
enablement and handoff; measurement and learning; evidence appendix; decision.
A plan states what is known, proposed, assumed or still unknown and why the work
fits the customer's desired capability. Acceptance is an internal delivery
baseline decision, not customer sign-off, staffing assignment or a commercial
commitment.

Included: structured draft authoring, bounded Turi drafting from eligible context,
versioned architecture diagrams and design decisions, exact-revision review,
customer engagement linkage, milestone baselines, revisions and change summaries,
source lineage and invalidation, customer-scoped UI and governed agent tools.

Excluded: staffing/capacity matching and economics calculations (007), execution
logs, progress updates and stage-gate delivery decisions (008), document/report
export and external sends (009), partner training workflows (013), new research
providers, customer self-service approval, hosted release and private real-customer
rollout. Staffing sections contain required roles/skills and explicitly proposed
effort; they do not make assignments, approved quotes or financial forecasts.

## Clarifications

### Session 2026-09-29

One optional product-policy question was offered: who may accept, reject or request
changes to a plan. No user answer has been recorded at this checkpoint. The
specification adopts the explicit bounded default of internal administrators only;
this is a planning assumption, not user confirmation. It is concrete enough to
implement and can be revised if the user chooses delegation or broader authority.

The legacy review additionally resolved three design-sensitive boundaries: 003's
engagement references are descriptive, existing internal chats are not delivery-safe,
and search receipt IDs cannot serve as permanent shared plan citations. These are
recorded as requirements and elaborated in the plan, not additional user approvals.

| Clarification category | Status | Basis |
| --- | --- | --- |
| Functional scope and roles | Clear | Four journeys; explicit administrator review default and partner draft/read rules |
| Domain/data | Clear | Immutable revisions, canonical engagement, exact baseline and source lineage |
| Interaction/UX | Clear | Manual and Turi authoring, exact review, revisions and failure recovery |
| Quality attributes | Clear | Denial, race, latency, bounded generation, UI and recovery gates |
| External dependencies | Clear | Reuse existing model/evidence services; no new research or deployment integration |
| Edge cases/failures | Clear | Changed authority/source, ambiguous calls, invalid inputs and concurrent decisions |
| Constraints/tradeoffs | Clear | Synthetic/local scope, immutable audience and later-feature exclusions |
| Terminology | Clear | Proposal, accepted baseline, maturity and delivery progress remain distinct |
| Completion signals | Clear | Eight measurable outcomes and explicit actual-output review |
| Placeholders | Clear | No unresolved behavior marker; administrator authority is an explicit default |

No additional formal questions are needed to proceed with these bounded defaults.
The quality checklist remains 16/16; no checkbox state changed during clarification.

## User Scenarios & Testing

### User Story 1 - Author and inspect a delivery plan (Priority: P1)

A member selects one customer and workload, creates a plan, fills the versioned
sections, and saves draft revisions. A technical design includes a readable
component/data-flow diagram and recorded alternatives and decisions. The member
can identify gaps, evidence and required next decisions without reading chat.

**Why this priority**: A durable, understandable plan is the basis for review and acceptance.

**Independent Test**: Author a complete synthetic plan without invoking Turi,
reload it from the customer profile, inspect its design and citations, and confirm
that missing required sections and conflicting edits are surfaced.

**Acceptance Scenarios**:

1. **Given** access to a selected customer, **When** a member creates a plan,
   **Then** customer, workload, owner, audience and template version are explicit;
   required empty sections show actionable validation errors.
2. **Given** an incomplete draft, **When** saved, **Then** work is retained with
   explicit unknowns/discovery tasks; it cannot be submitted as complete by leaving
   required sections blank or using unexplained “not applicable” labels.
3. **Given** a technical design, **When** inspected, **Then** a versioned diagram,
   accessible textual equivalent, components, interfaces, flows, decisions,
   alternatives and rollback approach remain linked to that plan revision.
4. **Given** concurrent edits, **When** the later save names an obsolete revision,
   **Then** it is rejected without overwriting either accepted history or current work.
5. **Given** an assigned partner, **When** accessing an eligible delivery plan,
   **Then** only its authorized delivery content and published shared citations
   are visible; internal content and private chat history are absent.

### User Story 2 - Ask Turi to draft from governed context (Priority: P1)

A member asks Turi to prepare or revise a proposal for a selected customer and
workload. Turi combines eligible customer evidence and shared practices, explains
fit and alternatives, and persists a draft for human review.

**Why this priority**: Drafting should turn the evidence work in 005 into useful
planning while preserving source fidelity and human decisions.

**Independent Test**: Use a synthetic customer with accepted facts, attributed
research, one published shared solution and deliberately missing inputs. Verify
a saved proposal cites the exact sources, preserves unknowns, and makes no
unsupported commitment or acceptance decision.

**Acceptance Scenarios**:

1. **Given** accepted customer context and eligible shared practices, **When** Turi
   drafts, **Then** the result uses delivery-plan-v1, explains applicability and
   alternatives, and links factual assertions to exact eligible evidence.
2. **Given** Pending claims, private chat attachments, weak/stale critical evidence
   or material contradictions, **When** drafting, **Then** Turi records a labeled
   assumption or discovery task; it cannot convert those inputs into accepted facts.
3. **Given** missing product evidence, **When** Turi identifies a gap, **Then** it
   can propose the existing bounded research flow; drafting itself does not start
   new external research or approve a finding.
4. **Given** provider failure, cancellation, timeout or ambiguous completion,
   **When** the attempt ends, **Then** the member sees an accurate outcome and any
   saved draft receipt; retries do not create duplicate plans or revisions.
5. **Given** access or supporting evidence changes before save or replay,
   **When** output is released, **Then** affected content is withheld and the
   proposal requires fresh authorized context.

### User Story 3 - Review and accept an exact plan revision (Priority: P1)

An authorized reviewer inspects a complete proposal, its source readiness and
milestones, then accepts, requests changes or rejects that exact revision with a
rationale. Acceptance makes it the customer's baseline and creates or links one
canonical engagement in the same customer and workload.

**Why this priority**: Plans must become explicit, durable decisions that later
staffing and execution can use without duplicate engagements or hidden commitments.

**Independent Test**: Review a complete proposal, accept it twice with the same
request, and race two different requests. Exactly one engagement, one accepted
baseline and one logical decision result; stale or unauthorized decisions fail.

**Acceptance Scenarios**:

1. **Given** a complete current revision, **When** an authorized reviewer accepts
   its exact content and source state, **Then** the decision records identity,
   rationale and time, and atomically links the accepted version, engagement and
   milestone baseline to the selected customer.
2. **Given** another revision or source update arrives during review, **When** the
   old acceptance is submitted, **Then** the system requires renewed review;
   it cannot accept unseen content or changed supporting evidence.
3. **Given** a timed-out response after acceptance, **When** the request is replayed,
   **Then** the original receipt is returned under current authority without a
   second engagement, milestone set or decision.
4. **Given** a plan with unresolved decision-critical assumptions or contradictions,
   **When** acceptance is attempted, **Then** it is blocked with the specific
   discovery or evidence action required; noncritical unknowns remain visible.
5. **Given** a request for changes or rejection, **When** recorded, **Then** that
   revision and rationale remain in history and a new revision can address it.

### User Story 4 - Revise a baseline and respond to changed evidence (Priority: P2)

A member proposes a revision to an accepted plan and sees changes to scope,
architecture, milestones, effort assumptions and supporting evidence. A reviewer
accepts the replacement explicitly. Earlier baselines and decisions remain intact.

**Why this priority**: Accepted plans must survive change without losing their
original commitments or pretending that source corrections never occurred.

**Independent Test**: Change a plan and withdraw one supporting source. Confirm
the previous baseline is preserved, the draft is visibly affected, acceptance
requires repaired evidence, and accepting a replacement keeps one engagement.

**Acceptance Scenarios**:

1. **Given** an accepted plan, **When** a member revises it, **Then** a new draft
   references the accepted baseline, explains the change and preserves stable
   milestone identity for unchanged milestones.
2. **Given** an unaccepted revision, **When** an engagement is viewed, **Then** its
   accepted baseline remains current and the proposed changes are clearly separate.
3. **Given** a reviewed replacement, **When** accepted, **Then** one transaction
   supersedes the prior baseline, versions the milestone set and retains the same
   engagement, previous decisions and change summary.
4. **Given** corrected, retracted, deleted or withdrawn supporting material,
   **When** any plan read, drafting or acceptance occurs, **Then** current eligibility
   is rechecked, affected guidance is marked for review, prohibited source content
   is withheld and historical acceptance is not silently rewritten.
5. **Given** an access revocation, **When** a prior URL, citation, receipt or Turi
   response is reopened, **Then** it obeys current authority, including partner
   field scope; preserved history is not a bypass.

### Edge Cases

- Customer and workload mismatch; customer merge/retirement; deleted or unassigned
  owner; engagement belonging to another customer or workload.
- Save, submit, accept, reject and revise races; reused request key with a different
  payload; lost response after a successful transaction; restart during drafting.
- Empty section, unexplained omission, excessive text, invalid dates, negative
  effort, dependency cycles, duplicate milestone IDs and target before start date.
- Prompt injection in source excerpts or diagram labels; unsafe links or active
  diagram content; references to another customer's private artifact.
- Shared practice withdrawal or hidden source lineage invalidation; inaccessible
  historical source; unknown or future evidence dates; conflicting product versions.
- A partner grant changes while viewing, drafting or replaying; an internal plan
  uses restricted evidence that a delivery-only reader cannot receive.
- A revision removes a milestone or changes estimates: prior baselines remain
  inspectable without implying work completion, staffing or realized outcomes.

## Requirements

### Functional Requirements

- **FR-001**: Bind every plan to one environment, workspace, canonical customer and
  one optional workload; enforce current scope on reads, mutations, citations,
  agent tools and replay. Workload and engagement must belong to that customer.
- **FR-002**: Permit active internal members to author customer plans and assigned
  partners to author delivery plans. Use an immutable internal or delivery
  audience. Internal members can inspect customer drafts; partners can inspect
  their own authored drafts and accepted delivery revisions for assigned customers.
  Release of a delivery revision to other partners requires the reviewer's exact
  content and audience check; never expose internal plan content or another
  author's unaccepted draft through a partner projection.
- **FR-003**: Validate all twelve delivery-plan-v1 sections. Drafts may be incomplete;
  submission requires populated content or a reasoned not-applicable entry per
  section. Required metadata includes owner, template/version, as-of time, context
  snapshot, evidence-quality version, audience and review state.
- **FR-004**: Store immutable content revisions with exact identity, author, creation
  time and content digest. Edits require the current revision and never overwrite
  accepted content; list and inspect authorized revision history.
- **FR-005**: Distinguish accepted facts, attributed research, published shared
  practices, proposed work, estimates, assumptions and discovery gaps. Factual
  assertions retain exact source revisions/locations and dates; drafting and plan
  acceptance never approve a customer claim or publish shared knowledge.
- **FR-006**: Use current evidence eligibility and quality policy for context,
  citations, submission and acceptance. Unsupported decision-critical claims,
  stale critical product evidence and material conflicts block acceptance;
  explicit noncritical unknowns require an owner and follow-up action.
- **FR-007**: Keep plan source lineage and context snapshot durable and recheck them
  on every release boundary. Source or publication changes flag affected guidance
  for review; denied content is withheld from current reads and agent replay.
  Historical decision identity is preserved without preserving disallowed content.
- **FR-008**: Version technical design with the plan: bounded diagrams plus a text
  equivalent, components/interfaces/data flows, alternatives, chosen approach,
  rationale, security/operations/testing/rollback considerations and design decisions.
  Diagrams and links cannot execute source-provided instructions or active content.
  For each reused solution, assess technology, security, delivery, process,
  adoption and effort/capacity fit; unresolved material incompatibility becomes
  discovery work rather than an approved recommendation.
- **FR-009**: Model work packages and milestones with stable identity, owner role,
  planned effort range, dependencies, target or explicitly unknown date, measurable
  exit evidence and customer validation. Detect invalid ranges and dependency cycles.
- **FR-010**: Limit staffing/economics content to required skills/levels, proposed
  role options and qualified effort/capacity assumptions. No staffing confirmation,
  rate-card arithmetic, commercial approval or forecast calculation is introduced.
- **FR-011**: Provide draft, in-review, changes-requested, rejected, accepted and
  superseded states with explicit allowed transitions. A content change after
  submission creates a new draft revision and invalidates the pending review.
- **FR-012**: Acceptance, changes-requested and rejection are explicit human review
  actions. The initial planning policy gives active internal administrators this decision
  authority. Record exact revision/digest, current authority, rationale and time;
  Turi may propose and explain, but cannot perform a plan decision.
- **FR-013**: Accept atomically into the selected customer: create a canonical
  engagement or link a same-scope eligible engagement, set the accepted plan
  revision and freeze its milestone baseline. One plan has one engagement; an
  engagement has one active plan baseline. Acceptance does not advance delivery
  progress, change maturity, commit staff, send a report or record customer sign-off.
- **FR-014**: Make saves, submissions, decisions and revisions idempotent with
  optimistic concurrency and durable receipts. Same key/same request replays the
  original outcome; same key/different request conflicts. Competing decisions
  cannot duplicate an engagement or accepted baseline.
- **FR-015**: Revising an accepted plan retains its engagement and prior baseline.
  Show changes to scope, designs, milestones, estimates and evidence; replacing
  the baseline requires an explicit exact-revision acceptance decision.
- **FR-016**: Turi drafts only through the same governed domain used by the UI.
  Bind the request to the owned conversation and selected customer/workload;
  use eligible context and shared knowledge without searching private chat history
  or unapproved originals for factual support. Preserve the selected model.
  A fresh planning conversation binds the intended audience and workload before
  any model context is loaded; an internal chat cannot be relabeled delivery-safe.
- **FR-017**: Persist bounded drafting attempts, observable status, cancellation,
  errors and any resulting revision receipt. No blind retry of an ambiguous model
  call; current source/authority checks apply before save and output/replay.
- **FR-018**: Missing research can be proposed using 005's existing flow; a drafting
  request does not authorize additional external search, publication or deployment.
- **FR-019**: Expose plan list/detail/edit, source readiness, exact review, version
  comparison and accepted engagement baseline in customer context. Support loading,
  empty, denied, invalid, stale, conflicted, failed and cancelled states with
  keyboard access, mobile layouts and readable light/dark themes.
- **FR-020**: Preserve permitted audit records and source dependency metadata while
  honoring existing retention/deletion rules. Access revocation and source changes
  take effect logically before asynchronous cleanup; interrupted cleanup cannot
  restore content or an obsolete baseline.
- **FR-021**: Record safe operation IDs, durations, decision transitions, invalidation
  reasons and drafting budget usage; exclude customer prose and credentials from
  routine logs. Expose failed/unconfirmed attempts for authorized reconciliation.
- **FR-022**: Validate migrations/recovery on a separate disposable environment;
  inspect the app Preview database before any explicit upgrade. Production is
  never connected to or changed; no hosted deployment is part of this slice.
- **FR-023**: Prove the full trusted-context journey with synthetic data: reviewed
  source → eligible retrieval → cited plan → explicit acceptance → customer
  engagement and baseline. Required automated gates cover denial, source lifecycle,
  concurrency/replay, recovery and UI; representative Turi output must be reviewed.

### Key Entities

- **Delivery plan**: Stable scoped identity, title, audience, owner, current draft
  and accepted baseline pointers, optional workload and canonical engagement link.
- **Plan revision**: Immutable template content, diagram/design revisions, context
  snapshot and source references, author, digest, validation state and change reason.
- **Plan decision**: Human reviewer, exact revision, accept/request-changes/reject,
  rationale, time and idempotent outcome receipt.
- **Plan source dependency**: Exact eligible source or shared publication revision,
  claim/location, quality and date basis, current usability and invalidation reason.
- **Engagement**: Canonical customer/workload delivery identity and accepted plan
  pointer, distinct from an existing descriptive profile engagement reference.
- **Milestone baseline**: Immutable accepted milestone set with stable milestone
  keys, dependency graph, effort assumptions and exit criteria; no actual progress.
- **Drafting attempt**: Owned request scope, context snapshot, bounded execution
  status, cancellation/error state and durable result reference.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A scripted member journey creates, edits, submits and accepts one
  complete synthetic plan from the customer profile without editing stored data
  directly; all twelve sections and a readable technical design survive reload.
- **SC-002**: Across internal, assigned-partner, unassigned-partner and revoked-user
  cases, zero unauthorized plan text, source content, lineage, receipts or counts
  are disclosed, including direct links, raced changes and replay.
- **SC-003**: Twenty concurrent/repeated acceptance requests and an interrupted
  response produce exactly one engagement, accepted baseline and logical decision;
  a stale version or different payload under the same key never commits.
- **SC-004**: Source correction/withdrawal and grant revocation prevent affected
  current guidance or acceptance on the next access, even with maintenance paused;
  the prior decision remains auditable and replacement requires a new review.
- **SC-005**: For 1,000 plans with up to 20 revisions each and five concurrent
  readers, plan list/detail and decision acknowledgments complete within p95
  two seconds, excluding model generation and external evidence retrieval.
- **SC-006**: Each admitted Turi drafting attempt reaches a saved proposal or a
  visible terminal/unconfirmed outcome within five minutes. In eight representative
  reviewed outputs, every asserted customer fact and critical product recommendation
  has eligible support or is explicitly withheld pending discovery, with zero
  unauthorized acceptance, staffing or commercial commitments.
- **SC-007**: All primary journeys pass keyboard and responsive checks at desktop
  and mobile widths in light and dark themes; denied/stale/error outcomes preserve
  useful recovery actions and do not lose an unsaved form silently.
- **SC-008**: A disposable upgrade and paired restart/recovery exercise preserves
  accepted versions, engagement links and decision receipts and cannot duplicate
  an interrupted operation or release invalidated source content.

## Assumptions

- 002–005 are merged prerequisites. Existing temporary identities, customer grants,
  context stewardship, evidence rules and private conversations remain authoritative.
- The twelve-section template is the product baseline; 006 makes it enforceable.
  English authoring is the initial acceptance scope; there is no translation service.
- An internal administrator is the initial plan decision-maker under the explicit
  planning default above. Authorship and plan decisions are separate capabilities; self-review
  is allowed in this demo and does not imply independent or customer approval.
- Plans may be internal or delivery-visible. Delivery-visible content is assembled
  only from delivery-visible customer evidence and published shared knowledge;
  a plan's audience cannot be widened in place. A separate delivery plan must be
  authored from eligible delivery context if an internal plan is unsuitable.
  Partners' own drafts remain proposals; acceptance releases the reviewed delivery
  revision to other assigned partners. Review includes a delivery-suitability
  attestation for manual text that source filtering alone cannot classify.
- Initial data is synthetic customer content and public research. The existing Neon
  Preview app and separate disposable Neon test database are retained; ignored
  credentials and private runtime state never enter planning artifacts or Git.
- Planned dates and effort are estimates. Only an accepted revision is a baseline;
  completion, stage progression, staffing and actual outcomes wait for later slices.
