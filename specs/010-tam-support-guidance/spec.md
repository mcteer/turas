# Feature Specification: TAM and Support Guidance

**Feature Branch**: `010-tam-support-guidance`
**Created**: 2026-10-04
**Status**: Implementation in progress; required acceptance gates remain open
**Input**: Run specify, clarify, plan, tasks and analyze for roadmap 010, which delivers customer-scoped support readiness, recommended actions, evidence, ownership, escalation boundaries and disposition tracking. Product requirement TR-05; prerequisites 005 and 008.

## Overview

Give internal TAM/account and delivery users one customer/workload view of operational readiness and next actions. Ground judgments in reviewed customer context, assessed maturity and current engagement evidence. Preserve unknowns, show accountable owners, and distinguish an action recorded in Turas from an external support ticket actually resolved.

The reviewed planning artifacts are checked in under `specs/010-tam-support-guidance/` in the isolated implementation worktree. The user authorized implementation and merge; completion still requires the acceptance gates below. This does not authorize a hosted feature 010 release.

## Clarifications

### Session 2026-10-04

- Q: Who should approve TAM guidance and confirm action outcomes? → A: `mcteer` only; `panel` can propose changes.

## User Scenarios & Testing

### User Story 1 — Review Support Readiness (Priority: P1)

An internal user selects a customer and optional workload, reviews six operational readiness areas, and proposes an evidence-backed assessment for `mcteer` to accept.

**Why this priority**: A reliable current picture is useful before any assistant generation or ticket integration.
**Independent Test**: Create and review an assessment for a synthetic customer, then view it as each demo role without a model call.

**Acceptance Scenarios**:

1. **Given** accepted customer context and reviewed engagement handoff/risk records, **when** a user opens Support Guidance, **then** they see the selected scope, source dates, maturity context, readiness checks and unknowns without treating delivery progress as readiness.
2. **Given** missing operating ownership or runbooks, **when** an assessment is proposed, **then** those checks remain unknown or gaps with named follow-up needs; missing records never imply ready.
3. **Given** a pending assessment, **when** `mcteer` accepts its exact revision and evidence, **then** it becomes the accepted assessment; `panel` cannot perform that decision.
4. **Given** a delivery-visible accepted assessment, **when** an assigned partner opens it, **then** only that representation and eligible delivery citations are returned; internal drafts, notes and hidden counts are absent.
5. **Given** changed or withdrawn supporting evidence, **when** the accepted view is read again, **then** its effective state requires review and unsupported content is withheld without waiting for cleanup.

### User Story 2 — Own and Track Recommended Actions (Priority: P1)

An internal user proposes a concrete next action with rationale, evidence, priority, owner and review date. `mcteer` accepts the action and subsequent disposition changes.

**Why this priority**: Guidance must support accountable follow-through rather than becoming another static summary.
**Independent Test**: Use a seeded accepted assessment to progress an action through open, in progress, deferred and completed, including conflicting edits and lost acknowledgements.

**Acceptance Scenarios**:

1. **Given** an ownership gap, **when** a proposed action is accepted, **then** the action shows its intended outcome, suggested owner, next review and validation criterion; an unknown owner is explicit.
2. **Given** a pending completion proposal by `panel`, **when** an ordinary reader opens the action, **then** the last accepted disposition remains authoritative until `mcteer` reviews the new revision.
3. **Given** no eligible outcome evidence, **when** completion is attempted, **then** it is refused; completing a Turas action never changes external ticket state, engagement acceptance or customer maturity.
4. **Given** concurrent updates or a retry after a lost acknowledgement, **when** commands are repeated, **then** stale updates conflict and the same request creates at most one revision/decision.
5. **Given** a dismissed or completed action, **when** new evidence warrants reopening, **then** a reviewed new revision preserves the former disposition and rationale in permitted history.

### User Story 3 — Understand Escalation and Handoff Boundaries (Priority: P2)

A TAM records when an issue should be escalated, to which accountable role through an evidenced route, and what information a human should provide. A human may separately record that contact or handoff occurred.

**Why this priority**: Operational escalation needs clear ownership and honest receipt semantics.
**Independent Test**: Create an escalation recommendation with a synthetic route, record a human-reported handoff, then verify that no ticket, message or resolution claim was produced.

**Acceptance Scenarios**:

1. **Given** a reviewed risk or operating gap, **when** escalation guidance is proposed, **then** it states the trigger, observed impact, responsible role, route, minimum evidence and next checkpoint; unavailable entitlements or service levels remain unknown.
2. **Given** an urgent concern but no verified route, **when** guidance is requested, **then** it recommends a human confirm the route and use their established incident process, without inventing contact details, response guarantees or severity classifications.
3. **Given** a human-recorded external reference, **when** `mcteer` accepts the handoff update, **then** the UI says “Human-reported handoff,” identifies the observation date, and explicitly retains unknown external acknowledgement/resolution.
4. **Given** an internal-only escalation detail, **when** a partner requests delivery guidance or follows a direct URL, **then** the restricted body, route and external reference are not exposed.

### User Story 4 — Ask Turi for Bounded Support Guidance (Priority: P2)

An internal user requests an on-demand explanation of an exact customer/workload readiness view and its selected evidence. Turi proposes next steps with citations and uncertainties; a human chooses what to save for review.

**Why this priority**: Synthesis is useful once the underlying records and decision boundaries exist.
**Independent Test**: Run the native assistant journey against synthetic eligible, sparse, conflicting and withdrawn evidence, then save one suggestion as a pending action.

**Acceptance Scenarios**:

1. **Given** eligible maturity, product/practice and execution inputs, **when** Turi explains readiness, **then** its advice reflects the workload's assessed capabilities, active engagement constraints and customer operating ownership, with exact citations.
2. **Given** missing or stale decision-critical evidence, **when** Turi responds, **then** it proposes discovery/verification work rather than declaring readiness, ticket resolution or support entitlement.
3. **Given** a suggestion, **when** a user explicitly saves it, **then** a pending action with original source lineage is created; model wording cannot approve facts or outcomes.
4. **Given** cancellation, source withdrawal or session revocation during generation, **when** output would be released or replayed, **then** current permissions and source state govern release; uncertain provider work is not automatically rerun.

### Edge Cases

- Customer has no engagement, no maturity assessment or multiple workload-specific engagements.
- Same user can read internal material but requests a delivery-visible representation.
- A source is corrected, its review date expires, a baseline is replaced, or a partner grant is revoked between preview and acceptance.
- External reference is malformed, contains credentials, or is mistaken for proof of delivery/resolution.
- Named owner becomes inactive, a review date passes, or all readiness checks are not applicable.
- Reusing one request key with different content, concurrent reviews, feature disable, restart during generation and cleanup lease replay.
- Sources contain instructions to bypass approval or leak another customer's information.

## Requirements

### Functional Requirements

- **FR-001**: Provide a customer-bound support workspace, optionally narrowed to one workload, with current accepted assessment, actions and eligible engagement references. Customer-wide and workload-specific records remain distinct. Support works without an engagement.
- **FR-002**: Enforce current environment/workspace/customer authority on every read, command, citation, assistant step, stream and replay. Conversations remain private to their owner.
- **FR-003**: `mcteer` alone accepts, rejects or withdraws guidance and confirms action dispositions, including own proposals with a rationale. `panel` may propose/edit drafts. Partners have read-only access to accepted delivery-visible guidance for assigned customers; no partner generation or proposal workflow in this slice.
- **FR-004**: Maintain separate internal and delivery-visible representations. Delivery guidance must be composed solely from delivery-eligible customer inputs and published shared knowledge; generating internally and redacting afterward is insufficient. Do not expose hidden counts, private source lineage, personnel or commercial data.
- **FR-005**: Assess exactly six readiness areas: operating ownership; support route and escalation; observability and triage; safe change and recovery; runbooks and knowledge; handoff and open obligations. Each records ready, gap, unknown or not applicable, with rationale, evidence, observation date and next review. Ready/gap require direct support; not applicable requires reviewer rationale.
- **FR-006**: Calculate the effective summary by a published versioned rule: review required if accepted inputs changed or are overdue; otherwise gaps take precedence over unknowns; otherwise ready when at least one applicable check is ready; otherwise not applicable. Show per-check results, not an averaged maturity/readiness score.
- **FR-007**: Show accepted maturity dimensions and current engagement/handoff context as separate, dated inputs. Explain recommendation fit without changing maturity, engagement stage, milestone acceptance or commercial opportunity.
- **FR-008**: Actions require a desired outcome, rationale, priority, validation criterion, source references, owner or explicit unknown-owner reason, and next review date. Ownership names responsibility; it does not grant authorization or commit resources.
- **FR-009**: Keep action dispositions open, in progress, blocked, deferred, completed and dismissed separate from draft/review state. Confirm all disposition changes through exact `mcteer` review. Deferral requires a revisit date; blocking/dismissal/reopening require rationale; completion requires dated eligible outcome evidence.
- **FR-010**: Escalation recommendations include trigger, observed impact, accountable role, known route or unknown-route explanation, evidence to provide and next checkpoint. Product severity, entitlement and response-time promises must have eligible supporting evidence or remain unknown.
- **FR-011**: Permit a dated human-reported contact/handoff reference; label it as human-reported, retain provenance and distinguish it from independently verified external acknowledgement. This slice neither sends messages nor creates, updates, resolves or synchronizes tickets.
- **FR-012**: User-entered customer facts, links and attachments must follow the existing pending-to-accepted context path. A support judgment approves the judgment only; it cannot promote a cited pending source. Independent product research remains attributed research, not proof of this customer's configuration.
- **FR-013**: Preserve exact original source revisions, locators, dates, quality and audience. Revalidate source eligibility and conflicts at preview, review, read and assistant release. Stale critical evidence causes verification work; withdrawal/correction/supersession withholds dependent prose and marks review required immediately. History never bypasses these checks.
- **FR-014**: Store immutable revisions and exact human decisions with optimistic version checks and actor-scoped idempotency. Request replay rechecks current access; a reused key with changed input conflicts. After receipt retention expires, keep a content-free opaque uniqueness fence for the environment lifetime and reject the expired key rather than recreating its action. Corrections preserve permitted history without duplicate accepted actions.
- **FR-015**: Support on-demand internal Turi guidance over one bound scope and explicit inputs. Results separate facts, researched practices, recommendations and unknowns. Only an explicit human save creates a draft; no assistant approval or external action.
- **FR-016**: Bound assistant work to six model steps, six reads, 4,096 output tokens per step, 24,576 context bytes, 200 distinct source dependencies, five admissions per user per rolling hour, one active request per scope/user and a 120-second deadline. Provide cancellation and honest failed/expired/unconfirmed states; no automatic paid retry after uncertain dispatch.
- **FR-017**: Present scope, evidence, review state, ownership, disposition and next review in the shared responsive design. Include keyboard access and empty/loading/denied/error/stale/conflict/saving-unknown states. A failed save must support receipt lookup without silently resubmitting.
- **FR-018**: Provide paginated scope-limited lists, a maximum 50 items per page, and bounded inputs: at most ten selected engagements, twenty direct evidence references per revision and 200 transitive dependencies. Reject oversized scope explicitly rather than silently truncating decision inputs.
- **FR-019**: Withhold ineligible content immediately. Purge withdrawn/invalidated dependent payloads within 24 hours; expire abandoned/rejected drafts after 90 days and assistant content after 30 days. Retain content-free decision/receipt identifiers for 365 days; minimal foreign-key references may remain while their accepted record is still retained, without prose or request bodies. Staleness alone marks review required without deleting otherwise eligible historical evidence.
- **FR-020**: Record content-free event category, correlation identifier, latency, usage and failure state. Never log prompts, guidance prose, source passages, credentials or external-reference URLs in routine telemetry.
- **FR-021**: Use explicit recoverable schema changes and runtime-role least privilege. Disabling 010 blocks new mutations and generation while authorized eligible reads, receipts, cancellation, terminal settlement and retention continue. Preserve selected databases, private artifacts and durable workflow state.
- **FR-022**: Verify domain rules, authorization, concurrency/replay, source lifecycle, migration/recovery, browser journeys, bounded generation and representative performance using synthetic data. Record actual command/results and separate local, CI and hosted evidence.
- **FR-023**: Provide customer-visible ordering within an authorized scope: overdue reviews first, then explicit priority, then stable creation order. Display computed overdue/unknown-owner flags without asserting incident severity or an external service-level breach.
- **FR-024**: Keep ticket connectors, external notifications, automated escalation, recurring generation, partner enablement/training, expansion, product-gap aggregation, adaptive learning and MCP outside 010. Preserve the selected model and the deferred/default-off reporting mail boundary.

### Key Entities

- **Support scope**: environment/workspace/customer and optional workload; selected engagement inputs are explicit.
- **Readiness assessment**: immutable six-check judgment with separate accepted and working revisions, audience and exact evidence.
- **Support action**: proposed next step with accountable owner, validation criterion, priority and reviewed disposition.
- **Escalation guidance / human-reported handoff**: optional structured action detail; no external ticket lifecycle.
- **Decision and command receipt**: exact revision, authorized reviewer, rationale and retry identity.
- **Source dependency**: original source identity/revision/location and current eligibility; no independent new factual approval.
- **Advice attempt**: owner-private bound request, budgets, sources, cancellation and terminal state.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In the synthetic end-to-end journey, an internal user can propose a six-area assessment, have `mcteer` accept it, and identify the next owner/action within five minutes, excluding generation time.
- **SC-002**: All role/scope/source-lifecycle acceptance cases pass with zero unauthorized fields, citations, counts or private conversation content disclosed, including revocation during generation and replay.
- **SC-003**: Repeated identical commands and concurrent reviews produce one accepted result or an explicit conflict, with zero duplicate revisions/decisions attributable to retry.
- **SC-004**: For 100 customers, 500 support scopes, 5,000 actions, 20,000 revisions and five concurrent users, each list/detail/review-acknowledgement class has p95 at or below two seconds over 100 measured operations after ten warmups, with zero correctness errors. Setup and external model latency are excluded.
- **SC-005**: All eight defined synthetic assistant scenarios pass citation/unknown/ownership/escalation review using captured actual-model responses; each attempt meets the specified limits. Deterministic fixtures separately prove denied actions, stop, replay and failure handling.
- **SC-006**: All four desktop/mobile light/dark WebKit projects pass the defined user journeys without missing, skipped or retried acceptance cases; keyboard tasks succeed and no serious/critical automated accessibility issue remains.
- **SC-007**: Disposable upgrade and restart/recovery checks preserve accepted guidance and command identities, prevent uncertain generation from being duplicated, and prove immediate withholding plus the defined cleanup deadlines.

## Assumptions

- Existing demo identity and customer grants remain in use; approval authority above is the user's one clarification answer.
- Partners only read accepted delivery guidance now; dedicated partner authoring/enablement is 013. This is a planning default, not a separately confirmed user answer.
- Guidance is requested on demand; ordinary deterministic reads need no model. External support references are manually entered, never fetched or synchronized.
- Missing maturity, sources, owners or engagement history yield explicit unknowns and discovery actions; they do not block opening a support workspace.
- Existing evidence-quality/freshness policy applies. The readiness assessment's default next review is seven days after observation and may be set to another explicit future date by its reviewer; reviewing does not refresh the source observation date.
- 005 and 008 are functional dependencies. 009 is merged on the current base but mail delivery is not a prerequisite. Uncommitted reporting/tooling work is outside 010 and must be preserved during handoff.
