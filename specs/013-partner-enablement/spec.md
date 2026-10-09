# Feature Specification: Partner Delivery and Enablement

**Feature Branch**: `013-partner-enablement`

**Created**: 2026-10-09

**Status**: Specified and clarified; implementation not started

**Input**: Proceed with roadmap 013 through specify, clarify, plan, tasks and analyze, then hand off for implementation after a model switch. Provide a partner workspace for assigned-customer delivery, the existing plan method, what/how/why lessons and training checkpoints with published shared knowledge and explicit access boundaries.

## Context and Scope

013 makes the delivery capabilities already available to partners discoverable in one workspace and adds reviewed, customer-scoped enablement guides with individual learning checkpoints. It serves existing authenticated partner members and internal delivery staff; it does not introduce partner federation or customer self-service accounts. The existing planning, execution, factual review, shared publication and support authorities remain authoritative.

A partner can propose their own delivery plan and contribute their own delivery records through existing workflows. A guide explains how to carry out a specific accepted delivery plan: what to do, how to do it, why it is appropriate, prerequisites, alternatives, validation and when to ask an internal owner for help. Guide publication is a human review decision. A verified checkpoint records a reviewed learning demonstration for one partner and exact guide revision; it is not customer acceptance, maturity, a staffing qualification or an external certification.

New guides are bound to one customer, one engagement and one accepted delivery-plan revision. Internal members propose guide revisions; the designated internal reviewer publishes/retires guides, assigns eligible partner members and verifies checkpoint submissions. Existing grant administrators continue to manage customer access. Guides never create or broaden grants. Shared practices remain separate, sanitized publications readable by every active member, including a partner with no assigned customers.

## Clarifications

### Session 2026-10-09

- Q: How should a partner's training checkpoint become complete? → A: mcteer verifies submissions. Partners submit demonstrations; canonical active internal administrator `mcteer` verifies them. Learning progress stays separate from delivery acceptance and skills certification.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find Assigned Delivery Work (Priority: P1)

A partner opens a dedicated workspace, sees only assigned customers and eligible delivery work, and moves to existing plan, execution, support and shared-knowledge screens with customer context intact. Internal staff can inspect the same governed delivery content without impersonating a partner.

**Why this priority**: The first useful increment makes existing partner delivery usable without inventing new approval or access rules.

**Independent Test**: A partner assigned customer A opens the workspace, follows an accepted plan, proposes their own plan change and delivery update, reads accepted support guidance and finds a published practice. Customer B, internal economics and another user's private conversation remain inaccessible.

**Acceptance Scenarios**:

1. **Given** an active partner with a grant to A only, **When** they list or search assigned work, **Then** only A and its eligible delivery records appear, including in counts, pagination and empty/error states.
2. **Given** an accepted delivery plan and an internal-only plan for A, **When** the partner opens plan links, **Then** the existing plan rules expose the accepted delivery content and their own allowed working proposals, but never the internal-only plan or another author's private draft.
3. **Given** an eligible partner contribution, **When** it is saved through the existing delivery workflow, **Then** it remains proposed until its existing internal reviewer accepts it; no new approval shortcut is introduced.
4. **Given** no customer grant, **When** the partner opens their workspace, **Then** it explains that no customer work is assigned while published shared knowledge remains usable.
5. **Given** a grant, membership, organization or session revoked during an open view, **When** another read or action occurs, **Then** access fails closed and the browser removes customer content on its next refresh or focus check.

### User Story 2 - Publish and Follow a Reviewed Guide (Priority: P2)

An internal author drafts a guide for an accepted delivery plan, selects eligible sources and requests review. The reviewer publishes an exact revision. Authorized partners can then read its what/how/why lessons, prerequisites, alternatives, validation and escalation path, with usable citations and explicit unknowns.

**Why this priority**: Partners need the reasoning and checks behind a delivery method, not just a list of activities.

**Independent Test**: An internal member proposes a guide based on A's accepted delivery plan and a shared practice derived from B. The reviewer publishes it. A's partner can follow the guide and cite the sanitized practice without learning B's identity or private lineage. A withdrawn source withholds dependent guide content even with background cleanup stopped.

**Acceptance Scenarios**:

1. **Given** an accepted, delivery-visible plan, **When** an internal author saves a guide, **Then** it records the exact plan revision, structured lessons, checkpoints, sources and unknowns as a proposal.
2. **Given** a proposed revision, **When** the reviewer publishes it, **Then** the decision binds the exact content, original evidence, plan baseline and audience; a concurrent edit invalidates the review.
3. **Given** a published guide, **When** an author drafts changes or a proposal is rejected, **Then** the prior eligible published revision remains readable and draft content remains internal.
4. **Given** only an internal-only plan/source or an unaccepted claim supports a guide, **When** publication is attempted, **Then** it is refused with actionable missing-evidence reasons visible only to authorized internal staff.
5. **Given** an accepted plan is replaced, a required source is withdrawn or a shared practice ceases to be published, **When** the guide is read, **Then** its affected prose is withheld and the user is told that the guide needs fresh review; historical identity is preserved.
6. **Given** a partner's grant to A, **When** they follow a guide's shared citation, **Then** they reach the eligible shared revision itself, never a private source-customer link.

### User Story 3 - Demonstrate and Review Learning (Priority: P2)

The reviewer assigns an eligible partner member an exact published guide. That partner records a checkpoint demonstration with evidence or an explicit blocker. The reviewer marks the exact submission verified or requests another attempt. Both users can see what remains to be learned without confusing self-reported work with accepted delivery progress.

**Why this priority**: A learning path is useful only if its checkpoints, gaps and human feedback are visible and attributable.

**Independent Test**: Assign two partners the same guide, submit a demonstration for one, request changes, then verify a corrected submission. Only that member's verified current checkpoints affect their progress. Revocation, guide replacement and assignment withdrawal prevent stale verification or inherited completion.

**Acceptance Scenarios**:

1. **Given** a currently granted partner member and eligible guide, **When** the reviewer assigns it, **Then** the assignment binds that person, customer, engagement and guide revision without granting any new access.
2. **Given** an assignment to partner P, **When** P saves and submits a checkpoint demonstration or blocker, **Then** it is clearly self-reported and only P plus authorized internal staff can read that submission's prose.
3. **Given** a submitted checkpoint, **When** the reviewer verifies it or requests changes, **Then** an attributable decision binds the exact submission and guide checkpoint with rationale; no other domain's accepted state changes.
4. **Given** a lost acknowledgment, **When** the user checks the request's status, **Then** the same authorized receipt is returned without a duplicate assignment, submission or review.
5. **Given** a replacement guide revision or accepted plan baseline, **When** a learning path is reopened, **Then** it requires explicit reassignment to the current reviewed revision; prior verification remains dated history and is not carried forward automatically.
6. **Given** a withdrawn assignment or revoked member, **When** an old link, saved request or reviewer page is used, **Then** no further contribution or verification is allowed and inaccessible prose is not disclosed.

### Edge Cases

- Two members of the same partner organization have different customer grants: neither inherits the other's customer access or individual checkpoint submissions.
- A partner changes organization, their grant is revoked and later restored, or a former member is reactivated: old assignments do not silently resume and completed history is not transferred to a different person or organization.
- Customer, engagement, workload, plan, guide and evidence identities do not match: refuse the operation without revealing which hidden identity exists.
- A guide has no published revision, rejected changes, retired content, expired evidence, a replaced plan or a withdrawn shared source: show a precise authorized state and no stale guidance.
- A newer published guide coexists with an older assignment: show the revision mismatch and require explicit assignment renewal; preserve the old learning record as history.
- A submission has missing evidence, a future observation time, unsatisfied prerequisite, blocked validation or unsupported completion wording: it cannot become verified through prose alone.
- Concurrent edits, duplicate requests, expired review previews and revocation between preview and commit: enforce one decision, current authority and exact-version checks.
- Browser back/forward navigation, background tabs, focus regain and lost responses: refetch current authorized content; retain only opaque pending-request identities in browser storage.
- A previously visible customer disappears: exclude it from current lists/counts without exposing removed names or hidden totals.
- Bounds are exceeded: reject explicitly or paginate deterministically; never silently omit records while presenting a complete progress total.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide a partner workspace listing only currently assigned customers and their eligible delivery work, with scoped search, stable pagination and clear empty/loading/unavailable states. Internal readers can inspect customer-scoped enablement under their existing workspace authority.
- **FR-002**: Reuse the existing customer-plan, execution, support and shared-knowledge workflows and their decision rights. Partners may create/revise/submit their own permitted delivery plans and contribute their own permitted execution records; support guidance remains accepted, delivery-visible and read-only to partners.
- **FR-003**: Enforce current environment, workspace, session, principal, membership, organization and individual customer-grant authority before discovery, retrieval, counting, actions and every content release. Organization membership never grants customer access by itself.
- **FR-004**: Exclude internal commercial notes, margins/rates, personnel details, ungranted customer identities, private lineage, internal expansion/gap portfolios and other users' conversations from all partner surfaces, links, totals and errors. A dashboard must not broaden an existing domain projection.
- **FR-005**: Let internal members propose customer-scoped enablement guides bound to one engagement and exact accepted delivery-plan revision. Each lesson states objective/what, how, why, prerequisites, alternatives, limitations, validation and an internal escalation instruction; unsupported details remain explicit unknowns.
- **FR-006**: Maintain immutable guide revisions with separate working and published heads. Publication, rejection and retirement require the designated internal reviewer, exact-version review, a rationale, current source checks and explicit acknowledgment for reviewing one's own authored content.
- **FR-007**: Partners may read only current eligible published guides for their granted customer. Internal users may read proposals under existing workspace policy. Draft/rejected content never replaces the published partner view.
- **FR-008**: Select only authorized original evidence and published shared-knowledge revisions, retaining exact citations, original dates, quality and classification. Guide publication must not promote unaccepted customer claims or treat public research as accepted private customer fact.
- **FR-009**: A shared practice citation resolves to the sanitized published revision. It must not reveal source-customer identity, counts, artifact URLs or private lineage. Shared knowledge remains available to active members without customer assignments.
- **FR-010**: Source withdrawal, conflicting or expired critical evidence, plan replacement, guide retirement and current authorization changes withhold ineligible guide/submission prose synchronously at read/review time, independently of cleanup. Historical identities and minimal decision receipts remain attributable.
- **FR-011**: Let the designated internal reviewer assign an exact published guide to one currently granted partner member in its customer/engagement scope, or withdraw/replace that assignment. Assignment records bind the member's current organization and grant revision; changes require explicit renewal and never create grants.
- **FR-012**: Let the assigned partner create immutable revisions of their own checkpoint demonstration, including what was attempted, result, original observation time, eligible evidence and blockers. A partner cannot read or alter another person's submission prose, even within the same organization and customer.
- **FR-013**: Let the designated internal reviewer verify or request changes to an exact checkpoint submission against its published criteria and prerequisites. Verification requires attributable supporting evidence and rationale; requester prose alone is insufficient. A request for changes allows a new attempt without rewriting prior decisions.
- **FR-014**: Show deterministic learning progress as verified required checkpoints divided by required checkpoints on the exact current assigned guide revision. Pending, blocked, unreviewed, withdrawn and obsolete work remains distinct. A verified learning checkpoint never changes maturity, skills, time approval, delivery acceptance, support status or certification.
- **FR-015**: Preserve prior assignment/revision history when a guide or plan changes. Renewing an assignment requires explicit current review; no automatic copying of prior checkpoint verification. Withdrawn/revoked assignments cannot accept new submissions or review decisions.
- **FR-016**: All new mutations require current authorization, optimistic version checks, idempotent request identity and safe reconciliation. Repeating a successful request returns a minimal currently authorized receipt; changed input under the same identity conflicts. An uncertain request is checked before another action is admitted.
- **FR-017**: Expose the guide review, assignment, checkpoint contribution and review journeys with responsive light/dark presentation, keyboard access, visible focus, usable long text, clear source/unknown states and current-grant loss handling. Browser persistence contains no customer prose or evidence.
- **FR-018**: Bound authoring, discovery, selected evidence, assignments, review previews, request rate and retention. Define exact limits before implementation. Keep private payloads separate from minimal immutable audit, apply explicit deletion deadlines, and preserve original withdrawal deadlines across retries.
- **FR-019**: Provide a disable switch for new 013 authoring, assignments, submissions and decisions while current-authorized reads, withdrawal, request reconciliation and retention continue. Recovery preserves the selected database, private state, immutable receipts and existing features.
- **FR-020**: Record content-free operational outcomes and bounded latency metrics with correlation identities; never log customer names, lesson prose, sources, submission notes, credentials or unbounded labels.
- **FR-021**: Verify the full feature with targeted domain/access/race tests, complete desktop/mobile light/dark browser journeys, source-lifecycle checks with cleanup stopped, bounded representative-load checks, explicit migration/forward-recovery checks and relevant earlier partner/privacy regressions. Keep local, CI and hosted evidence separate.
- **FR-022**: Use authored, reviewed guide content and existing deterministic projections. This slice adds no new model generation, changes to Turi's selected model, external ticket/message integrations, automatic shared publication, automatic partner grants or autonomous verification.

### Key Entities

- **Partner delivery workspace**: A current authorized view of a member's assigned customers and eligible delivery work; not a new tenant or copy of customer records.
- **Enablement guide and revision**: Stable customer/engagement identity, exact accepted plan revision, authored lesson/checkpoint content, original evidence, distinct working/published heads and review history.
- **Lesson and checkpoint**: Stable local identities within a guide revision, ordered explanation and measurable demonstration criteria, with explicit prerequisites and required/optional status.
- **Guide review decision**: Reviewer, exact revision/evidence/plan binding, publication/rejection/retirement action, rationale, time and self-review acknowledgment.
- **Learning assignment**: One partner member, organization, customer grant revision, engagement and published guide revision; active/withdrawn identity with optional supersession and dated history.
- **Checkpoint submission and decision**: One assignment/checkpoint and author's immutable reported attempt, original evidence and observation date, with a separate exact verification/request-changes decision.
- **Request receipt and lifecycle metadata**: Idempotent operation identity, version outcome, restricted audit lineage and minimal reconciliation state independent of deletable prose.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every tested cross-customer, cross-member, organization, inactive-session and internal-field attack is denied without hidden identifiers, counts or source content; no partner grant is inferred from organization membership.
- **SC-002**: A partner completes the assigned-work → accepted-plan → reviewed-guide → checkpoint-submission journey in each supported viewport/theme with keyboard access, no horizontal page overflow and no serious/critical accessibility violations.
- **SC-003**: A complete draft → exact guide publication → assignment → changes-requested → corrected submission → verification journey produces exactly one attributable decision per request and correct independent progress totals, with zero unintended changes to other domains.
- **SC-004**: Current reads/actions withhold revoked or ineligible content even with cleanup stopped. A visible page clears protected content before revalidation at least every 15 seconds and on focus/visibility regain; unavailable revalidation fails closed, and late responses cannot restore withheld content.
- **SC-005**: At the declared representative workload, 100 complete workspace/list/detail operations per class with five concurrent readers achieve p95 at or below 2 seconds; 100 review/assignment/submission operations per class achieve p95 at or below 2 seconds while preserving production rate limits. No complete view uses silently truncated scope.
- **SC-006**: Empty setup and upgrade from the merged predecessor both preserve existing data and workflow state; interrupted commands, expired previews, source withdrawal and cleanup recovery cause no duplicate action or restored withheld prose.
- **SC-007**: The canonical test manifests and all browser journeys pass without skipped or empty suites, and all acceptance evidence binds one final source revision. Documentation distinguishes this evidence from hosted rollout and from future learning/identity capabilities.

## Assumptions

- Dependencies 006, 008 and 010 are merged; 003/005 access/evidence/shared publication foundations are reused. 012 is merged in PR 23. Existing Production/Preview readiness is not established by these dependencies' local tests.
- The designated reviewer for new guide publication/retirement, learning assignments and checkpoint decisions is canonical active internal administrator `mcteer`, consistent with existing execution/support review. The user confirmed checkpoint verification by mcteer on 2026-10-09. Existing plan/grant/shared-publication authorities are preserved.
- Internal members author guides; partners contribute their own checkpoint attempts and use existing plan/delivery proposal routes. Organization administration, invites, SSO/federation, delegated partner approvers and customer self-service are outside 013.
- Guide explanations are manually authored and reviewed. Existing Turi features may remain accessible only under their existing permissions, but no new advisory tools/prompts, live provider evaluation or paid call is required for 013 acceptance.
- New learning evidence stays customer scoped. Shared publication and adaptive learning continue to use 005 and future 014; no new cohort claims, resource certification, partner billing, internal cost views, PDF export or outbound handoff is included.
- Boundaries and dates use explicit original evidence and current authority. Local validation uses synthetic owned environments in the canonical checkout, with no sibling worktrees, hosted migrations, deployment or real-customer writes.
