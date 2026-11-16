# Feature Specification: Eve runtime peer maintenance

**Feature Branch**: `023-eve-runtime-peers`
**Created**: 2026-11-16
**Status**: Released in PR72 as `70a5870f`; full CI and authenticated Preview/Production accepted
**Input**: Investigate and implement the Dependabot notification for eve (PR #56).

## User Scenarios & Testing

### User Story 1 — Keep private research out of telemetry (Priority: P1)

As a user, I can request governed research without my prompts, evidence, tool inputs,
answers or raw provider payloads entering general diagnostic telemetry.

**Why this priority**: The peer update adds effective filtering across diagnostic subscribers.
**Independent Test**: Execute real installed-SDK calls with a synthetic provider and
capture diagnostic events, while independently inspecting the returned answer and usage.

**Acceptance Scenarios**:
1. Given a research request containing private fixture text, when it completes, then diagnostic events exclude input/output content and raw provider metadata, while the caller receives its unchanged result and usage.
2. Given a provider failure containing private details, when diagnostics observe it, then the failure event uses a generic message and does not disclose those details.
3. Given direct specialist decision/search or public customer research calls, when they are assembled, then each uses the shared content-free telemetry policy.

### User Story 2 — Preserve the governed runtime (Priority: P1)

As a user, I retain private conversations, research accounting and cancellation after
reviewed runtime peer updates.

**Why this priority**: Shared dependencies can change provider behavior without changing eve itself.
**Independent Test**: Run existing provider budget/cancellation tests, typechecking and both builds.

**Acceptance Scenarios**:
1. Given PR #56, when implemented, then both exact peer versions are installed, eve stays at 0.91.0, and the root agent model remains unchanged.
2. Given interrupted provider work, when it finishes without completion evidence, then unknown accounting holds remain intact.
3. Given the reviewed upgrade, when a release is proposed, then local, CI and authenticated hosted evidence remain distinct and incomplete checks remain explicit.

### Edge Cases

- A group named eve-runtime contains no eve package update.
- A changed SDK tool-error default must not bypass Turas's own disclosure rules.
- Heartbeat stream parts must not count as completion or usage.
- No registered telemetry exporter does not guarantee no diagnostic subscriber exists.
- Optional Connect capabilities must not introduce unused integrations.

## Requirements

### Functional Requirements

- **FR-001**: Assess every intervening release for both PR #56 packages before dependency edits, with selected capabilities and explicit exclusions.
- **FR-002**: Apply a shared content-free telemetry policy to all direct application research generation calls, including the public research operator; preserve full application results and accounting metadata.
- **FR-003**: Verify installed-SDK diagnostic privacy on successful and failed generation and streaming, without contacting a paid provider.
- **FR-004**: Pin AI SDK 7.0.172 and Connect 2.9.2, preserve Eve 0.91.0, root model, auth, source approval, budgets, retention, credentials and stored workflow state.
- **FR-005**: Verify interrupted completion, cancellation, budget admission and heartbeat compatibility with existing checks plus focused regressions where required.
- **FR-006**: Record actual checks, source identity and rollout/rollback; require existing full CI, authenticated Preview profiles/WebKit and maintainer review before merge, then Production verification before release completion.

### Key Entities

- **Telemetry policy**: Content recording disabled for both inputs and outputs; structural diagnostics remain available.
- **Upgrade assessment**: Package/version, upstream source, capability disposition and verification evidence.

## Success Criteria

### Measurable Outcomes

- **SC-001**: No synthetic private marker appears in captured installed-SDK telemetry for successful or failing calls; returned successful results retain that marker and usage.
- **SC-002**: All direct research generation call sites use the shared policy and both requested package versions resolve from the lockfile.
- **SC-003**: Relevant local regression checks, typechecking and both builds pass before implementation is recorded locally validated.
- **SC-004**: Release status identifies all outstanding CI, Preview and Production checks, without claiming local checks prove hosted behavior.

## Assumptions

- Implement the existing notification's exact versions rather than expand to a new Eve major upgrade or unrelated Dependabot groups.
- No schema changes, new connector or exporter, auth changes, UI redesign, model change, credential rotation or firewall changes are needed.
- Existing review and hosted acceptance rules continue to govern release.
