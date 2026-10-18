# Feature Specification: Complete legacy backend parity

**Feature Branch**: `018-legacy-backend-parity`

**Created**: 2026-10-15

**Status**: Complete — audited backend scope merged through PR39 and verified in Production on schema077; evidence limits remain explicit

**Input**: “AUDIT ALL OF LEGACY. COPY BACKEND MECHANISMS.” Continue through working implementation, validation and merge without repeated approval requests. The reference is `../turas-back` at `fd1e205d7fd258676d6fb12b3ade8a431d53a6af`.

## Scope and assumptions

Audit every authored legacy backend mechanism and its application/agent entry points. Restore its working behavior in the current application. This includes mechanisms behind pages as well as named tools; matching tool names or copying leaf functions does not establish parity. Existing partial audit completion claims require evidence again.

Preserve the current visual theme and selected root model. Do not substitute a labeling redesign for a backend port. Keep existing server-enforced ownership, workspace/customer/partner authorization, human-source review and independent-research acceptance. The legacy repository remains read-only. Credentials, databases, private artifacts and fictional demonstration customers are not implementation assets. Where legacy exercises a real mechanism against fictional records, connect that mechanism to the current governed real-data domain rather than omitting it or importing the fiction. Framework-removed APIs require a documented supported equivalent.

All existing legacy runtime behavior is in scope, including admission, execution, persistence, retrieval, projections, invalidation, cancellation, retries, maintenance, approvals, source provenance, documents, preferences and backend calculations. New roadmap capabilities that have no legacy mechanism are outside this parity slice. This does not claim completion of unrelated feature-016 pilot acceptance.

## User Scenarios & Testing

### User Story 1 — Receive consistent accumulated customer knowledge (Priority: P1)

As a user, I can ask about a named customer and obtain the same source-backed account knowledge used by its profile, with newly checked research retained automatically and reused on later questions.

**Why this priority**: The reported failure exposes disagreement between chat, retained research and the product footprint.

**Independent Test**: Replay the same source passages, dates and account state through legacy and current account readers, then exercise research completion, profile reload and a subsequent question without reseeding data.

**Acceptance Scenarios**:

1. **Given** no known product evidence, **When** requested research completes, **Then** eligible original findings update the account automatically and the final answer reflects those retained findings and their actual scope.
2. **Given** a general announcement, reverse integration, historical evaluation or explicit non-use, **When** account evidence is assembled, **Then** original passage selection, ordering, bounds and qualifications are preserved; unrelated product names do not become an unqualified customer deployment claim.
3. **Given** a known framework in eligible stored evidence, **When** a later user asks about product use, **Then** the reader does not report an empty inventory because a different projection or page omitted it.
4. **Given** changed, withdrawn, conflicted or stale evidence, **When** any consumer reads it, **Then** current eligibility and original dates are rechecked consistently without silently resetting history.

### User Story 2 — Use every legacy research and reusable-solution workflow (Priority: P1)

As a user, I can use the original research specialists, retained source library, reusable practices, solution decisions and customer adaptations with the same effective behavior and decision rights.

**Why this priority**: Partial ports leave tools present but their underlying reservations, handoffs or persistence unavailable.

**Independent Test**: Exercise admission/reuse/join, three-specialist handoff, exact citations, source/date conflicts, bounded provider failure, signed artifact retrieval and explicitly approved reuse/adaptation with existing and newly retained evidence.

**Acceptance Scenarios**:

1. Existing eligible research is reused, concurrent equivalent work is joined, and an uncertain delivery is not restarted.
2. The original specialists receive their actual governed account context and publish usable signed outputs through the normal workflow.
3. Sources retain exact quotations, publication/event/check dates, attribution and freshness; discovery receipts alone establish no fact.
4. Solution publication, target adaptation and learning contributions retain distinct explicit authority, versions, idempotency and source invalidation.

### User Story 3 — Complete ordinary work through the original backend mechanisms (Priority: P1)

As a user, I can use the original private conversations, native questions/corrections, documents, preferences, customer history, account learning and delivery operations without losing state or bypassing decisions.

**Why this priority**: These mechanisms connect the legacy backend to actual product use.

**Independent Test**: Exercise each discovered entry point with authorized, unauthorized, duplicate, interrupted and resumed operations; compare persisted effects and observable results with legacy.

**Acceptance Scenarios**:

1. Login, logout, private history/search/title/archive, native session binding, streaming, Stop, retirement, reconnect, question answers and corrections preserve their original state semantics.
2. Supported document/image/file formats and preference operations work through their original runtime mechanisms, with bounded storage/provider use and existing source rules.
3. Customer journey, context intake/review/revision/retraction, hybrid retrieval, semantic/keyword fallback and account/quarter learning preserve original contracts and deterministic calculations.
4. Portfolio, engagement and intervention tools execute the actual legacy mechanisms against authorized current records; fictional records are not installed and model text cannot approve an action.
5. Maintenance, retry, expiry and recovery preserve original records and fail visibly when an outcome cannot be established.

### User Story 4 — Trust a complete parity audit and released result (Priority: P1)

As the maintainer, I can inspect an exhaustive mechanism ledger and its evidence, then use the merged result in the hosted application.

**Why this priority**: Earlier broad completion claims did not prevent the reported regression.

**Independent Test**: Compare a pinned complete legacy source inventory with the audit ledger, follow each entry point to its current implementation and tests, and verify the exact hosted release.

**Acceptance Scenarios**:

1. Every authored legacy backend source and consumer is covered by a mechanism row with current wiring, differences and evidence; nothing disappears because it is inconvenient or already marked done.
2. Each actionable gap is implemented and has a regression covering the observed behavior; module similarity alone is insufficient.
3. Governance/framework adaptations identify the exact source behavior and supported current equivalent, including real-data replacements for fictional demonstrations.
4. Merge requires passing relevant complete CI and actual authenticated Preview checks. Release completion requires the deployed commit, required schema/grants and authenticated HTTP/CLI WebKit verification in Production.

### Edge Cases

- A provider-failed or cancelled active native session has no transient messages after reload. Recover authorized application-owned display messages by exact event/turn/step identity without replaying them or reviving purged file bytes. Keep prior display history when a later turn starts.
- A staged ten-MiB file expands past a hosted durable stream chunk limit before provider admission. Stream compact immutable references/summaries while verifying original bytes at the separately authorized model boundary; preserve inline files, mixed batches, steering, private previews and metadata-only retired history.
- A durable native step is interrupted after accepted input projection and before provider admission; its retry emits a new event ID for the same delivery. Recovery must keep the original input, file metadata, deadline and allowance, and one visible send. A changed envelope, expired authority or any prior model reservation must not admit a new alias.
- A research result arrives after an initial empty read but before the final answer/profile reload.
- Multiple passages from one page, a truncated quote, incidental navigation/product names, reverse integrations, dated evaluations and source-specific ordering produce different product lists.
- A source changes or authority is revoked between discovery, retrieval, handoff and publication.
- A worker, browser or host stops after admission but before a receipt; original holds and ambiguous outcomes survive.
- Runtime/framework replacements differ from authored legacy files, or a tool works only in a special channel and is unavailable to ordinary chat.
- Legacy has missing-data or fictional-data behavior; current real empty states must remain truthful while the underlying mechanism still works.

## Requirements

### Functional Requirements

- **FR-001**: Inventory all authored legacy backend sources, consumers, tools, workers, channels, hooks, skills, connections, handlers and maintenance paths at the pinned reference.
- **FR-002**: Trace each mechanism through admission, authority, execution, persistence, retrieval/projection and failure/recovery; record actual current wiring and behavioral differences.
- **FR-003**: Port original mechanisms and contracts rather than independently redesigning equivalent-looking behavior. Preserve current-theme presentation unless required to expose the restored behavior.
- **FR-004**: Make customer research, source retention, profile product projection, account evidence and subsequent chat reads agree on eligible account knowledge and original scope/dates.
- **FR-005**: Restore every legacy research discovery/cache/fetch/attribution/freshness/maintenance, duplicate-work, specialist, artifact and decision mechanism with its original limits and observable outcomes.
- **FR-006**: Restore private conversation/native runtime, preference and document mechanisms, including state preservation and reconciliation before retry.
- **FR-007**: Restore customer journey/context, hybrid retrieval, reusable solution/application and account-learning mechanisms with their original ordering, pagination, approvals and deterministic calculations.
- **FR-008**: Connect original portfolio/engagement/intervention mechanisms to current governed records and make them available through the intended ordinary entry points.
- **FR-009**: Preserve current authorization, independent-versus-human source provenance, explicit human decision rights, model selection, secrets exclusion, explicit migrations and environment isolation.
- **FR-010**: Give every discovered mechanism a current mapping and evidence-based disposition. A renamed tool, local mock, source-identical module or planned task alone cannot establish hosted parity.
- **FR-011**: Add tests that distinguish the original working mechanism from the observed regression; validate changed user journeys against actual hosted responses without substitution.
- **FR-012**: Complete required release migrations/grants with backup/rehearsal and compatibility-safe deployment; verify Production behavior, merge status, branch cleanup and README freshness.

### Key Entities

- **Mechanism entry**: Pinned legacy paths and entry points, current paths/wiring, contract/state/authority/persistence rules, differences, tasks and evidence.
- **Parity scenario**: Controlled inputs and starting state, legacy/current observations and stored effects, bounds, failure/recovery outcomes and result.
- **Account evidence**: Canonical customer/workload identity, original selected source passages and dates, current eligibility, approved internal records and separately attributed research.
- **Operational receipt**: Exact source/deployment/schema, exercised scope, actual result and preserved unresolved outcomes; private content stays outside authored artifacts.

## Success Criteria

- **SC-001**: One hundred percent of discovered authored legacy backend sources and consumers have traceable audit coverage; zero unclassified entries remain.
- **SC-002**: Zero actionable missing, partial or contradictory legacy mechanisms remain at completion; every adaptation has an implemented supported equivalent and evidence.
- **SC-003**: The reported research-to-product-footprint scenario and its later-read/reload variants pass with retained evidence, source qualifications and consistent account knowledge.
- **SC-004**: All changed workflow scenarios pass their authority, idempotency, persistence and interrupted/recovery checks without weakening limits or replacing real hosted data with fixtures.
- **SC-005**: The final merged release passes its complete required checks and authenticated Preview/Production acceptance, with remaining non-parity pilot limitations stated accurately.
