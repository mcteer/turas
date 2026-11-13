# Feature Specification: Fresh guidance and retained learning

**Feature Branch**: `022-fresh-guidance-learning`
**Created**: 2026-11-13
**Status**: Implemented and Preview-validated; actual-model acceptance and Production release unverified
**Input**: Turas should learn as it is used and provide current guidance. The user
selected automatic research within existing access and spending limits, and
reaffirmed a seven-day trigger for searching for more current results. Repair the
retired-evidence cleanup defect discovered while examining this lifecycle.

## User Scenarios & Testing

### User Story 1 — Obtain fresh guidance (Priority: P1)

A member asks for guidance. Turi consults retained evidence and automatically
researches missing or older-than-seven-day support within its existing authority.
It reports gaps when current support cannot be established.

**Why this priority**: Retained knowledge must not silently become obsolete advice.
**Independent Test**: Request the same guidance with recent, eight-day-old, missing,
undated and withdrawn evidence; observe reuse, bounded research or an explicit limit.

**Acceptance Scenarios**:
1. Given eligible recent support, a guidance request reuses it with attribution.
2. Given support older than seven days or missing/invalid dates, Turi automatically
   uses the existing research preparation and specialist path without asking the
   user to request refresh again. Earlier cache/review deadlines still apply.
3. Given equivalent research already running or recently completed, reuse/join it;
   do not repeatedly force a new search when the earlier attempt found no newer evidence.
4. Given exhausted budget, missing authorized scope, cancellation, uncertain cost or
   provider failure, report the gap without treating old material as current support.
5. Given private customer facts needing an update, request an internal update;
   public documentation cannot establish private commitments or customer deployment.

### User Story 2 — Retain learning and history (Priority: P1)

New verified research improves later answers. Older evidence remains available for
historical questions. Customer facts and reusable practices retain their review gates.

**Why this priority**: Learning requires reusable evidence with trustworthy provenance.
**Independent Test**: Reuse checked findings on a later request, retrieve dated history,
and confirm that an unreviewed assertion or practice cannot become published truth.

**Acceptance Scenarios**:
1. Verified research persists through existing source and retrieval services and
   can be reused by an authorized later request.
2. Rechecking an old article preserves its publication/event dates. A current
   observation of live documentation is distinguished from an old historical event.
3. An explicit historical/discovery request can retrieve eligible older evidence
   with dates and caveats; default guidance excludes expired supporting passages.
4. Feedback and private practice candidates still require the existing source,
   reuse-rights, evaluation and publication decisions. Private chats are not mined.

### User Story 3 — Remove obsolete search copies (Priority: P1)

Retired evidence is immediately unavailable for current use and its search copies
are eventually removed across bounded cleanup batches.

**Why this priority**: A growing knowledge store needs reliable removal as well as additions.
**Independent Test**: Retire 101 synthetic sources, include earlier already-empty
retired records, and run the actual maintenance twice.

**Acceptance Scenarios**:
1. Two batches remove all 101 eligible obsolete copies without revisiting empty records.
2. Current and newly retired records retain their existing eligibility/grace rules.
3. Withdrawal blocks retrieval even with cleanup stopped; late indexing cannot
   restore obsolete content as current evidence.

### Edge Cases

- Exactly seven days, future/unknown dates and earlier review/cache deadlines.
- Old publications with useful historical context or unchanged current documentation.
- General product questions without a canonical authorized research account.
- Repeated requests, in-progress work, unchanged results, denial and cancellation.
- Source/access loss during research or answer delivery.
- Empty retired records ahead of pending deletion and multiple cleanup batches.

## Requirements

### Functional Requirements

- **FR-001**: Default Turi guidance retrieval to current verified evidence. Retain
  explicitly requested historical and discovery modes with dates and limitations.
- **FR-002**: Apply a seven-day trigger for searching for newer guidance support.
  Missing/invalid dates and earlier existing deadlines require checking too. This
  trigger is separate from the existing claim-quality age rubric and cache lifetime.
- **FR-003**: Automatically use the existing research admission and specialist
  workflow for missing/due support, preserving access, budgets, deduplication,
  cancellation, uncertain-cost controls and honest unavailable outcomes.
- **FR-004**: Exclude expired public-reference passages from current guidance as
  well as ordinary governed evidence. Do not silently fall back to historical mode.
- **FR-005**: Preserve verified-research persistence, original dates, conflicts,
  confidentiality, source lineage and reviewed shared learning. No model training,
  automatic acceptance of user claims or automatic practice publication.
- **FR-006**: Keep immediate withdrawal/replacement/access checks and late-write
  rejection independent of cleanup; preserve eligible audit metadata.
- **FR-007**: Make bounded physical cleanup advance past already-empty retired
  records until every eligible obsolete search copy is removed.
- **FR-008**: Verify seven-day boundaries, fresh/history retrieval, research reuse
  and denial, and multi-batch deletion. Separate local checks from hosted proof.

### Key Entities

- **Evidence**: exact accepted/verified source, scope, original dates and passages.
- **Refresh**: due-or-missing support and existing admitted research, with reused,
  working, completed or unavailable outcome.
- **Learning**: existing private candidate or reviewed published practice revision.
- **Retired search copy**: obsolete content awaiting deletion, separate from audit identity.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Current-guidance scenarios exclude expired references; explicit history
  retains authorized dated material, including the seven-day boundary cases.
- **SC-002**: Representative agent scenarios seek fresh evidence automatically or
  explain a concrete admission limit, without repeated forced refresh or false success.
- **SC-003**: Verified findings remain reusable and no test bypasses fact/publication review.
- **SC-004**: 101 eligible retired copies are removed in two bounded cleanup passes.

## Assumptions

- This covers guidance requested through Turi, not unlimited recurring whole-library
  research. Existing maintenance and reviewed-learning workflows remain in place.
- Seven days triggers revalidation; it does not promise instant knowledge of every
  real-world change or delete useful historical evidence.
- A recently completed bounded search may find no newer support. Preserve the gap
  rather than repeat searches or present the old assertion as current fact.
- Existing research may require a canonical customer scope. Report missing scope;
  never invent an account or bypass admission for a general product question.
- No model/dependency changes. Local tests use isolated synthetic data; hosted
  release acceptance must be recorded separately.

## Clarifications

### Session 2026-11-13

- Missing fresh support: research automatically within existing access/spending limits.
- Maximum age before seeking newer information: seven days, as reaffirmed by the user.
