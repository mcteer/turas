# Feature Specification: Eve Runtime Upgrade and Specialist Continuity

**Feature Branch**: `chore/eve-dependabot-composer` (existing PR #52, retained at the user's request)
**Created**: 2026-11-01
**Status**: Draft
**Input**: Upgrade Eve from 0.67.1 to 0.91.0, configure Dependabot, refresh the chat composer and capitalize README section headings. The user subsequently requested a dedicated upgrade spec that includes useful new framework capabilities wired into Turas. These changes remain in the same branch/PR.

## User Scenarios & Testing

### User Story 1 — Keep Existing Conversations Reliable (Priority: P1)

As a Turas user, I can send messages and files, answer questions, interrupt work,
reload and recover from a failed response without losing input, duplicating work,
or weakening customer access and approval rules.

**Why this priority**: The runtime upgrade must preserve the platform's working behavior.
**Independent Test**: Run ordinary and governed conversations through completion,
failure, interruption, reconnect and restart with real runtime execution.

**Acceptance Scenarios**:
1. Given a current conversation, when text, links or supported files are sent, then the exact owned input reaches the permitted workflow once and remains readable after reload.
2. Given a response that fails after partial work, when the conversation is reloaded and a new message is sent, then the prior input and eligible retained output remain visible and unknown usage stays reserved.
3. Given several pending questions, when the user explicitly replaces the response with another message, then the old question branch stops with terminal evidence before replacement work begins; stale answers cannot reopen it.
4. Given a lost acknowledgement or interrupted process, when recovery runs, then accepted work is reconciled from its actual recorded state without resending an uncertain operation or renewing its allowance.
5. Given a conversation from an incompatible earlier runtime, when its owner opens it, then saved history remains readable and the user starts a new conversation for further work. Historical decisions never become new approval authority.

### User Story 2 — Continue a Specialist's Work (Priority: P1)

As a user, I can ask a customer-recon, implementation-research or Vercel
best-practices specialist to refine its current assignment without starting
unrelated duplicate research or re-explaining the entire assignment.

**Why this priority**: Iterative research should preserve useful working context while retaining domain safeguards.
**Independent Test**: Complete an assignment and two follow-ups with each of the
three specialists; verify continuity, identity, access, source eligibility and
cumulative accounting, including a process restart between follow-ups.

**Acceptance Scenarios**:
1. Given an eligible specialist discussion in my conversation, when I request a refinement, then the same specialist discussion receives the follow-up and retains its authorized working context.
2. Given another pending refinement of the same assignment, when a duplicate request or lost acknowledgement occurs, then the original work is followed and no duplicate specialist is launched.
3. Given a specialist that is idle and eligible for a follow-up, when the application restarts, then the next follow-up can recover its identity without replaying completed paid calls.
4. Given changed customer access, withdrawn sources, expired authority or a closed discussion, when continuation is requested, then the system blocks reuse and explains that a fresh authorized assignment is needed. It does not silently restart paid work.
5. Given a follow-up, when it is admitted, then its permitted work is charged within the existing conversation and specialist limits. Continuation does not reset spent amounts, unknown holds or the original authority's expiry.

### User Story 3 — Follow and Control Specialist Tasks (Priority: P1)

As a user, I can see which specialist assignments are working, waiting, available
for follow-up, completed, failed or cancelled, and stop one assignment without
stopping unrelated work.

**Why this priority**: Durable work needs truthful progress and precise cancellation to remain understandable and controllable.
**Independent Test**: Run two different specialist assignments in one owned
conversation, cancel one, and verify the other completes with independent results
and accounting. Repeat after reload and with a different user/partner account.

**Acceptance Scenarios**:
1. Given background specialist work, when its state changes, then concise progress appears without exposing private reasoning, raw tool arguments, credentials or inaccessible customer content.
2. Given two active assignments, when I stop one, then only that assignment stops; the other may complete. An acknowledgement alone is not displayed as confirmed cancellation.
3. Given a waiting question, when a human response is required, then the UI shows that state instead of presenting continuing model work.
4. Given completed specialist work, when its result reaches Turi, then the requested synthesis continues once without manual polling, duplicate completion delivery or an unsolicited new assignment.
5. Given another user's or another conversation's task reference, when it is submitted for inspection, continuation or cancellation, then access is denied before task content is retrieved or work is changed.
6. Given a closed conversation or a global Stop, when cancellation is confirmed, then its owned specialist work cannot continue spending under the cancelled authority.

### User Story 4 — Use the Updated Composer and Preview (Priority: P1)

As a reviewer, I can use the requested streamlined composer in an authenticated
Preview using my usual production `mcteer` credentials.

**Why this priority**: The user requested this visual change and a usable Preview in the same PR.
**Independent Test**: Inspect desktop/mobile layouts in both themes and exercise
keyboard submission, attachment selection, customer choice and normal sign-in.

**Acceptance Scenarios**:
1. Turi sits above the rounded composer. A left-hand + opens the attachment menu, the Customer selector appears inside the right side and the send arrow remains at the far right.
2. The microphone and standalone paperclip/link controls are absent. An unselected customer field says `Customer`, with no optional suffix.
3. File selection, paste/drop, removable attachments, links, eligible source selection, multiline input, ongoing drafts and Stop retain their supported behavior.
4. Preview inherits the existing production `mcteer` credential rather than substituting local/test credentials. Deployment protection and application sign-in remain distinct.
5. Preview verification identifies the exact reviewed source and uses actual authenticated requests. Production is not changed merely to publish a Preview.

### User Story 5 — Operate and Maintain the Upgrade (Priority: P2)

As a maintainer, I can understand what the upgrade enables, apply compatible data
changes, verify recovery, and review future dependency updates before release.

**Why this priority**: Maintenance automation must not conceal behavior changes or claim unverified readiness.
**Independent Test**: Rehearse explicit migrations with recovery evidence, review
release notes and the adoption assessment, and inspect dependency-update configuration.

**Acceptance Scenarios**:
1. The PR identifies the capabilities implemented, those inherited from the framework, and those excluded or deferred with reasons and acceptance evidence.
2. Required schema changes and runtime permissions are explicit, target-verified and rehearsed. Old runtime bindings and accounting records are preserved.
3. Dependency-update proposals cover maintained application/package dependencies and CI actions without automatic merging of unreviewed runtime changes.
4. README headings use Title Case, and setup/status information matches the delivered behavior.
5. Local, CI, Preview and Production evidence remain distinguishable. Production release requires its own verified source, schema and authenticated behavior checks.

### Edge Cases

- Parallel questions, freeform text that could be mistaken for an answer, and explicit replacement of a waiting response.
- Several committed observations at one source position, failed model and terminal-turn records in one commit, overlapping replay and partial commits.
- A completed assignment whose specialist discussion remains eligible for follow-up versus an expired or explicitly closed discussion.
- Repeated follow-ups, duplicate request keys, acknowledgements lost after admission and results arriving after cancellation.
- Customer reassignment, partner grant revocation, source withdrawal, changed evidence versions and expired context during specialist work.
- Unknown provider usage, partially completed work, exhausted cumulative limits and a restart while an operation is in flight.
- Incompatible historical conversations, missing private objects and active failure histories with an empty native resume.
- A local runtime dependency missing during shutdown; agent execution must not install packages on demand.

## Requirements

### Functional Requirements

- **FR-001**: Preserve existing ordinary, customer, partner and governed workflow behavior through the selected runtime upgrade.
- **FR-002**: Preserve durable source identity and ordering for every committed observation, including multiple observations within one source unit; overlapping recovery must be idempotent.
- **FR-003**: Keep incompatible historical conversations owner-readable without changing their original native binding or treating saved history as execution authority.
- **FR-004**: Enforce current authorization, eligible sources, explicit approvals and finite accounting before each paid call or governed effect, including after resume and specialist continuation.
- **FR-005**: Never automatically resend uncertain paid work, reset unknown usage to zero, renew a cancelled authority or erase held costs through cleanup.
- **FR-006**: Wire specialist discussion continuity for all three existing specialist types into user-requested follow-ups, with a stable owned reference and explicit eligibility/closure rules.
- **FR-007**: Preserve each discussion's customer, owner, parent conversation and specialist purpose; reject a reference used to cross any of those boundaries.
- **FR-008**: Keep continuation spending cumulative and bounded; idle eligibility for a follow-up must not itself invoke a model or launch polling work.
- **FR-009**: Expose concise specialist progress and task-specific cancellation, with current ownership checks on every status read and control request.
- **FR-010**: Deliver each assignment result to its requesting workflow once and distinguish finished work from a still-open specialist discussion.
- **FR-011**: Require actual terminal evidence before claiming cancellation or forwarding work that depends on a prior question branch stopping.
- **FR-012**: Preserve the existing conversation-wide Stop while supporting cancellation of one specialist assignment independently.
- **FR-013**: Implement the requested composer layout and retain existing attachment, customer selection, keyboard, draft and recovery behavior.
- **FR-014**: Make Preview use the existing production `mcteer` credential record without rotating production credentials, changing firewall rules or sharing production data resources for new Preview work.
- **FR-015**: Include explicit compatible migrations, grants and recovery verification; never migrate during a request or silently rebind an existing native session.
- **FR-016**: Configure reviewed dependency-update proposals and document the new large-upgrade specification/adoption gate.
- **FR-017**: Prepare required runtime dependencies during installation/build rather than installing them inside an agent turn or shutdown.
- **FR-018**: Keep the selected model and reasoning configuration unless separately authorized. Do not add providers, channels or integrations without a selected use case and verification.
- **FR-019**: Keep production-only application safeguards in the PR; do not restore private-pilot features, synthetic-pilot controls or custom firewall work.

### Key Entities

- **Conversation**: An owner-private discussion with fixed customer scope, runtime binding and retained history.
- **Specialist Discussion**: A stable, owned specialist working context with purpose, parent conversation, eligibility, expiry, cumulative limits and closure state.
- **Assignment**: One initial request or authorized follow-up, its admission identity, progress, outcome and result-delivery evidence.
- **Task Reference**: An opaque reference to owned work; possession alone grants no read, continuation or cancellation authority.
- **Interaction**: A current question or approval with an authenticated decision, terminal status and original authority.
- **Execution Observation**: A durable source observation with a complete position and replay identity.
- **Usage Reservation**: A finite allowance whose actual or unknown usage survives failure, cancellation and cleanup.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All three specialist types complete one assignment and two authorized follow-ups while preserving discussion identity and avoiding duplicate research.
- **SC-002**: The continuity and ownership checks pass after a process restart; every tested cross-user, cross-customer, revoked-access and expired-reference request is denied.
- **SC-003**: With two concurrent assignments, cancelling one produces terminal evidence for that assignment while the other completes; no cancelled authority admits a later paid call.
- **SC-004**: Each tested specialist result is delivered once; a completed result becomes available to the requesting conversation within five seconds in controlled fixtures, without a new paid assignment.
- **SC-005**: Every ordinary/governed failure and recovery acceptance case preserves the original input, bound authority and known or held usage, with zero duplicate paid dispatches.
- **SC-006**: Composer and task interactions pass keyboard and desktop/mobile checks in both supported themes without horizontal overflow or lost subsequent drafts.
- **SC-007**: The exact Preview source is authenticated and reviewable using the established account configuration; required checks and independent review pass before merge.
- **SC-008**: Migration rehearsal, recovery evidence and the actual target's required schema/permissions are recorded before any authorized release is called complete.

## Assumptions

- The selected upgrade is Eve 0.67.1 → 0.91.0. Implementation details belong in the plan.
- The user explicitly authorized the existing branch/PR to contain the composer, README and Dependabot work alongside the upgrade specification.
- The three existing specialists are the initial continuation scope; this feature does not introduce new specialist roles or external integrations.
- Continuation requires current authority and context. An expired or incompatible discussion needs a fresh authorized assignment; no deadline or budget is silently extended.
- New work is reviewed in Preview before Production promotion. Existing production accounts, default firewall behavior and the selected model remain intact.

## Capability Adoption Assessment

| Newly Available Capability | Decision and User Value |
| --- | --- |
| Durable specialist conversations and resumable task controls | **Implemented, locally verified; release pending.** Owned specialist follow-ups and task-specific cancellation across the three existing specialist types. |
| Structured task/interaction/session observations | **Implemented, locally verified; release pending.** Truthful progress, exact commit/fact positions and cancellation/result-delivery evidence. |
| Delivery acceptance separate from execution results | **Adopt** throughout dispatch, specialist work and recovery so acknowledgement never masquerades as completion. |
| Improved client session state | **Adopt** in the composer, pending questions, failure recovery and specialist progress. |
| Framework cancellation, approval, Anthropic and memory/performance fixes | **Inherit and verify** the portions exercised by Turas; maintain application authorization and accounting fences. |
| Hook-driven automatic next turns | **Exclude from additional feature scope**: specialist task completion already provides the requested result handoff. A second continuation mechanism would risk duplicate turns and paid work without a distinct user need. |
| Approver-specific credentials for external connections | **Defer**: current application approval workflows already identify the actor; there is no selected external connection requiring a separate approver credential. |
| New Clear Chat behavior | **Defer**: New Chat and retained private history already have established semantics. A separate destructive/context-clearing control needs an explicit product requirement. |
| Additional messaging, computer-use or external connectors | **Exclude**: no active authorized use case in this slice. |

## Dependencies and Scope Boundaries

Build on the existing identity, evidence, research, governed workflow and
[chat interaction](../019-chat-interaction-parity/spec.md) contracts. Follow the
[constitution](../../.specify/memory/constitution.md) and
[evidence policy](../../docs/evidence-policy.md). This feature does not mark the
separate pilot-hardening specification complete, reintroduce removed pilot work,
or authorize unrelated platform changes.
