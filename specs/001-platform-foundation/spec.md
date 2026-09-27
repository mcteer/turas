# Feature Specification: Turas platform foundation

**Feature Branch**: `001-platform-foundation`
**Created**: 2026-09-26
**Status**: Proposed for foundation review
**Input**: Establish GitHub Spec Kit, review the old demo, and define the fresh
platform's governance, plan and roadmap before implementation.

## User Scenarios & Testing

### User Story 1 — Consistent contribution workflow (Priority: P1)

A contributor can discover the project's principles, create a bounded feature spec,
plan and tasks, and submit a PR with consistent validation and documentation guidance.

**Why this priority**: The build must avoid the demo's unstructured development.
**Independent Test**: From a checkout, follow README, resolve the foundation feature,
and identify the contribution/review rules without relying on this conversation.

**Acceptance Scenarios**:

1. **Given** a checkout, **when** a contributor opens its guidance, **then** Spec Kit
   configuration, constitution, AGENTS, contribution guide and PR template are present.
2. **Given** credentials exist locally, **when** preparing a commit, **then** private
   environment and runtime files are excluded and documented checks identify forbidden
   tracked paths. Authorship is not attributed to any coding harness.
3. **Given** a behavior/setup change, **when** preparing and merging its PR, **then**
   the contributor records README impact and the maintainer verifies freshness.

### User Story 2 — Review a complete, ordered platform plan (Priority: P1)

The product owner can trace each requested capability to a delivery slice, understand
its dependencies and acceptance gate, and see what remains undecided.

**Why this priority**: Planning is the requested deliverable before feature coding.
**Independent Test**: Map all 15 blueprint requirement groups to roadmap entries and
inspect the first implementation handoff.

**Acceptance Scenarios**:

1. **Given** the requested features, **when** reviewing the blueprint, **then** profiles,
   approvals, artifacts/RAG, operations, planning, reports, TAM, expansion, feedback,
   partners, learning and MCP each have an explicit scope and delivery order.
2. **Given** delivery/status/executive-report generation is planned, **when** reviewing
   its contract, **then** versioned templates define required content and decisions.
3. **Given** unresolved identity or resource decisions, **when** reviewing the roadmap,
   **then** owners and decision deadlines are visible without invented commitments.

### User Story 3 — Reuse the demo deliberately (Priority: P2)

A feature implementer can find reusable instructions, skills, specialists, UI patterns
and test expectations, while recognizing demo-only data and missing capabilities.

**Why this priority**: Preserve valuable learning without importing demo assumptions.
**Independent Test**: Inspect the reference audit and locate each reuse recommendation
in the old project's source map.

**Acceptance Scenarios**:

1. **Given** the reference demo, **when** its concepts are mapped, **then** maturity,
   engagement stage and approval state are separated and known contradictions recorded.
2. **Given** unused demo integrations, **when** the foundation is prepared, **then** none
   is installed merely for future use; existing model selection remains unchanged.
3. **Given** upcoming UI work, **when** its design contract is read, **then** demo visual
   patterns and CLI Playwright/WebKit verification expectations are clear.

### Edge Cases

- Empty remote repository needs a baseline commit to make the first PR reviewable.
- Local secrets and existing model/channel files must not be overwritten by setup.
- Old documentation can contradict newer code; record the conflict, not false certainty.
- Tooling templates contain placeholders by design; authored planning artifacts do not.
- Infrastructure-dependent build preparation is distinct from offline compile checks.

## Requirements

### Functional Requirements

- **FR-001**: Provide pinned, reproducible Spec Kit setup and checked-in feature artifacts.
- **FR-002**: Provide constitution, AGENTS, contribution guide and PR template.
- **FR-003**: Cover every requested platform capability with dependencies and exit criteria.
- **FR-004**: Document reuse/rewrite decisions and preserve the demo's visual direction.
- **FR-005**: Define approval, provenance, quality scoring, retrieval and learning boundaries.
- **FR-006**: Define delivery, weekly/executive and product-feedback artifact templates.
- **FR-007**: Provide meaningful foundation validation and secret-file exclusions.
- **FR-008**: Keep roadmap capabilities visibly planned; do not implement/provision them here.
- **FR-009**: Require README maintenance with each relevant change and after-merge verification.
- **FR-010**: Forbid speculative integration installation and coding-harness authorship credits.

### Key Entities

Foundation artifacts are a constitution, requirement group, roadmap slice, feature
spec/plan/task, decision, reference finding and versioned product template. Runtime
domain entities are proposed separately in [data model](data-model.md); no data is migrated.

## Success Criteria

- **SC-001**: All 15 blueprint requirement groups have roadmap coverage and exit evidence definitions.
- **SC-002**: A contributor can follow setup and resolve this feature's artifacts from a clean checkout.
- **SC-003**: Every reviewed demo subsystem has a retain/adapt/rebuild/omit disposition.
- **SC-004**: All five product templates and the evidence quality rubric have defined required fields.
- **SC-005**: Foundation validation passes; no secrets, runtime output or unused new integrations are committed.
- **SC-006**: The first PR is reviewable without starting a product feature or deploying resources.

## Assumptions

- The old project is a reference, not a migration source or production correctness guarantee.
- Identity, resource selection, budgets and pilot scale are decisions for the relevant feature gate.
- The foundation may open a PR; product implementation follows foundation review and merge.
- CLI UI testing uses Playwright/WebKit. No UI implementation ships in this slice.
