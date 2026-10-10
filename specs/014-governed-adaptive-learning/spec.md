# Feature Specification: Governed Adaptive Learning

**Feature Branch**: `014-governed-adaptive-learning`

**Created**: 2026-10-09

**Status**: Implementation in progress; acceptance and release pending

**Input**: Proceed with specify, clarify, plan, tasks and analyze for roadmap 014,
then stop before implementation for a model switch. Extend reviewed shared
knowledge with feedback, Turi-drafted improvements, representative evaluation,
publication/rollback, refresh monitoring and privacy-preserving learning metrics.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn feedback into a reviewed practice candidate (Priority: P1)

An active member flags an unclear, stale or ineffective practice or an authorized
piece of delivery work. An internal steward resolves the original evidence,
prepares a bounded Turi drafting request and saves a proposed improvement. The
feedback author can track disposition without gaining access to private sources.

**Why this priority**: Captures operational learning without allowing an anecdote,
partner demonstration or generated answer to become an accepted fact.

**Independent Test**: Submit feedback from internal and assigned-partner accounts,
triage it and save a draft based on eligible originals. Confirm that a second
partner cannot read the submission and that no shared publication changes.

**Acceptance Scenarios**:

1. **Given** a member can read an exact practice or assigned delivery record,
   **When** they submit feedback, **Then** it remains proposed, private to its author
   and currently authorized internal reviewers, with the exact target recorded.
2. **Given** a report, product gap or training checkpoint suggests an improvement,
   **When** a steward proposes shared reuse, **Then** the system requires eligible
   original evidence and separate reuse review; the triggering record grants neither.
3. **Given** an internal steward selects eligible evidence and an explicit budget,
   **When** Turi drafts an improvement, **Then** citations, limitations and unknowns
   remain visible and an explicit human save creates only a private candidate.
4. **Given** access or supporting evidence changes during drafting, **When** output
   would be displayed, saved or replayed, **Then** the stale output is withheld.

### User Story 2 - Evaluate, publish and safely replace a practice (Priority: P1)

An internal administrator reviews a candidate's reuse rights and sanitization,
runs Turi against fixed representative cases with both the baseline and candidate,
reviews every result and publishes the exact eligible revision. A failed version
can be withdrawn immediately or replaced through a reviewed rollback candidate.

**Why this priority**: Makes improvement measurable while retaining human release
control and existing shared knowledge access.

**Independent Test**: Use one synthetic customer's eligible originals and an
existing publication. Execute the fixed cases, review results, release an exact
revision, invalidate one dependency, then withdraw or prepare a rollback without
relying on cohort metrics or refresh workers.

**Acceptance Scenarios**:

1. **Given** a reviewed candidate and fixed cases, **When** baseline and candidate
   are evaluated, **Then** every actual response, citation, failure and usage status
   is retained privately for administrator review; Turi cannot grade itself into release.
2. **Given** a failed, missing or skipped mandatory case, **When** publication is
   requested through any existing or new path, **Then** publication is blocked.
3. **Given** every safety and fidelity gate passes and the intended improvement is
   demonstrated, **When** an authorized administrator publishes, **Then** active
   users receive the same sanitized practice without private feedback or lineage.
4. **Given** a newer draft exists, **When** an administrator withdraws the currently
   published revision, **Then** withdrawal succeeds independently of the draft or
   evaluation; retrieval withholds it even while cleanup is stopped.
5. **Given** a historical version is selected for rollback, **When** its originals
   have expired or reuse rights were revoked, **Then** it cannot be reactivated;
   replacement requires a new reviewed, evaluated revision with current originals.

### User Story 3 - Inspect comparable cross-customer outcomes (Priority: P2)

Internal users inspect a fixed quarterly outcome summary supported by comparable,
accepted observations and separate measurement-reuse approval. Small cohorts and
revised subsets remain withheld. Partners continue to use shared practices without
receiving customer counts or aggregate outcome statistics.

**Why this priority**: Separates evidence of observed change from anecdotes, product
usage, maturity and causal or commercial claims.

**Independent Test**: Load synthetic accepted measurements from five independent
customers under one fixed protocol, release the quarterly aggregate, then revoke
one contribution. Confirm suppression for four customers and no replacement subset.

**Acceptance Scenarios**:

1. **Given** five or more eligible independent customers with comparable paired
   observations, **When** an administrator releases a completed quarter, **Then**
   internal users can see the deterministic equal-customer mean change and its
   limitations, without identities, exact contributor counts or drilldown.
2. **Given** duplicates, missing denominators or conflicting measurements, **When**
   the cohort is assessed, **Then** duplicates cannot inflate eligibility and
   incomplete/conflicted customers cannot be selected opportunistically.
3. **Given** a released cohort loses a source or reuse approval, **When** any reader
   requests it, **Then** the whole release is withheld immediately; another reader,
   alternate filter or replacement subset cannot recover a revised aggregate.
4. **Given** a partner requests aggregate metrics, **When** access is checked,
   **Then** the metrics are unavailable without revealing suppressed counts.

### User Story 4 - Keep learning current and operable (Priority: P2)

Internal stewards see separate evidence-quality, release-evaluation and operational
views. Bounded maintenance marks due evidence and prepares review work. Previously
admitted research can be refreshed within its approved scope and budget; refreshed
claims and proposed improvements still require their ordinary review gates.

**Why this priority**: Prevents a released practice or dashboard snapshot from
silently outliving the evidence and rights that support it.

**Independent Test**: Advance synthetic time and change source rights with workers
stopped, then resume maintenance. Verify immediate withholding, unchanged original
claim dates, bounded cleanup and useful operational status.

**Acceptance Scenarios**:

1. **Given** evidence becomes stale, **When** a due review appears, **Then** original
   dates and unknowns are preserved; a refresh is not factual acceptance or publication.
2. **Given** a worker restarts or delivery acknowledgment is lost, **When** work is
   reconciled, **Then** one admitted operation is recorded and no paid call or
   publication is repeated automatically under uncertainty.
3. **Given** new learning work is disabled, **When** withdrawal, reconciliation or
   cleanup is needed, **Then** those protective operations continue.

### Edge Cases

- Feedback on a withdrawn target remains a private issue record with its target
  body withheld; target authorization is checked again before disclosing content.
- An administrator loses authority after review or during a paid evaluation.
- Candidate wording stays unchanged while lineage, rights, fixtures or the baseline change.
- A newly eligible source does not make an old rejected/withdrawn revision valid again.
- No baseline exists: use an explicit no-practice baseline and still execute all cases.
- The provider times out with unknown cost, cancellation races final output, or a
  client loses the save/publication acknowledgment.
- Source correction affects both a shared practice and a released aggregate while
  indexing and cleanup are stopped.
- One customer contributes several workloads; the fixed protocol's predeclared
  whole-population rule applies, never selection of the most favorable workload.
- Zero, unchanged, negative change, unknown and unavailable are distinct.
- Existing shared publications predate 014; they remain subject to existing source
  fences and are labeled not evaluated under 014, without fabricated pass records.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Preserve existing authorities: active internal administrators govern
  shared publication; internal members propose and triage within current source
  access; partners submit feedback on accessible targets and see only their own
  submissions. Shared practices remain available to every active member. Existing 005 private
  contribution-authoring rights remain unchanged; new 014 drafting/review queues
  are internal.
- **FR-002**: Accept bounded feedback tied to an exact authorized practice, report,
  reviewed product-gap observation, partner guide or the author's checkpoint
  submission; preserve provenance and proposed status. Never mine private chats.
- **FR-003**: Support auditable feedback dispositions open, under review, linked to
  candidate, deferred and dismissed, with rationale and current-version checks.
  Do not disclose other authors, hidden targets or private reviewer discussion.
- **FR-004**: Require original eligible accepted customer facts or verified research
  for a shared candidate, independent reuse rights and minimization. Derived report
  prose, engineering-disclosure approval and checkpoint verification cannot substitute.
- **FR-005**: Reuse the existing shared-practice contribution and immutable revision
  lifecycle. Each candidate remains bound to one source customer and 1–20 eligible
  originals; cross-customer statistical contributions use their separate workflow.
- **FR-006**: Allow internal stewards to request bounded, budgeted Turi drafting from
  explicitly selected eligible inputs. Generated wording must preserve citations,
  applicability, limitations and unknowns; explicit save creates a proposal only.
- **FR-007**: Require an administrator's exact-revision rights and sanitization
  review before evaluation. Bind review to wording, original-source closure and
  rights; any material change requires renewed review.
- **FR-008**: Execute eight fixed representative cases against the exact baseline
  and candidate using Turi, with captured actual outputs and explicit usage/cost
  status. Candidate content or model output cannot choose cases, expected outcomes
  or passing grades. A missing baseline is represented explicitly.
- **FR-009**: Require administrator review of every case under a versioned rubric:
  all safety, citation and authority checks pass; each candidate case scores at
  least 7/8 for fidelity, applicability, unknown handling and usefulness; no case
  regresses against baseline and at least one relevant case improves. Missing,
  failed, cancelled, skipped or unreviewed cases block publication.
- **FR-010**: Enforce evaluation eligibility and the final human decision on every
  publication path. Bind release to candidate, baseline generation, rights, sources,
  fixture/rubric versions and execution identity; prevent races and stale replay.
- **FR-011**: Withdraw a published revision immediately even when newer drafts or
  evaluations exist. Rollback creates a new revision with historical wording,
  current originals, renewed review and passing evaluation; never revive old authority.
- **FR-012**: Preserve the sanitized shared projection across roles. Private feedback,
  source identities, reviewer identities, fixtures, customer counts and evaluation
  outputs must not appear in public practices, search, citations or conversations.
- **FR-013**: Enforce current authority and original-source eligibility before and
  after retrieval and before display, model dispatch, save, publication, history or
  replay. Withdrawal, source correction, material conflict, expiry and rights loss
  withhold affected outputs synchronously, independently of cleanup/index workers.
- **FR-014**: Maintain explicit per-operation cost, input/output, step and deadline
  limits; cancellation, disabled admission, unknown dispatch or insufficient budget
  prevents further paid work. Reconcile uncertain calls without automatic retries;
  distinguish actual cost from an explicitly reviewed conservative cost bound.
- **FR-015**: Permit separately reviewed measurement contributions from exact,
  accepted observed outcomes and their original evidence under versioned comparison
  protocols. Require explicit reuse approval and comparable population, unit,
  windows, scope and denominator; do not infer approval from existing delivery reviews.
- **FR-016**: Ship fixed protocols for deployment lead time in minutes and change
  failure rate in percentage points, comparing the first and last 14 days of one
  completed UTC calendar quarter. Include all predeclared eligible workloads for
  a customer and one eligible contribution per customer/protocol/quarter.
- **FR-017**: Calculate customer change and equal-customer mean change
  deterministically, rounding only the final value. Include unchanged and negative
  outcomes; missing/invalid denominators and incomparable observations are ineligible.
  Zero is not missing. No relative uplift, causal impact, revenue or maturity inference.
- **FR-018**: Restrict aggregate metrics to internal users. Release only a fixed
  completed-quarter cohort with at least five independent eligible customers and
  approved measurement reuse; disclose neither identities, exact counts nor hidden
  omission counts. Individual practice publication does not require five customers.
- **FR-019**: Enforce one workspace-wide release per metric/quarter family across protocol versions, with
  stable replay across readers; prohibit arbitrary filters, subsets, rolling windows,
  complementary totals and drilldown. Withhold a release after source/rights loss
  without publishing a replacement subset for that family.
- **FR-020**: Provide separate currently authorized evidence-quality, evaluation and
  operations views. Preserve evidence-quality-v1, original evidence dates and
  explicit missingness; never present quality as factual approval or probability.
- **FR-021**: Mark due evidence and schedule bounded review work without automatically
  accepting sources or releasing practices. External refresh requires the existing
  explicit research admission, scope and budget; no unbounded recurring research.
- **FR-022**: Make transitions, decisions, model admission and refresh jobs auditable,
  versioned and idempotent. Identical retries reconcile to one action; changed
  payloads conflict; denied requests reveal no hidden record existence.
- **FR-023**: Bound private payload retention, preserve earlier source deadlines,
  and remove invalidated retained context including native agent storage. Individual
  access loss denies that actor without globally deleting otherwise eligible content.
- **FR-024**: Deliver accessible, responsive feedback, review, evaluation and internal
  dashboard interactions with useful empty, unavailable, conflict and cancellation
  states; clear protected content when access or source eligibility changes.
- **FR-025**: Preserve customer maturity, engagement acceptance, partner certification,
  commercial state, private conversations and the selected Turi model. No new
  external sends, model training, self-modifying instructions or automatic publication.
- **FR-026**: Provide explicit migrations, runtime grants, recovery and disable
  procedures. Coordinate code/schema compatibility and verify affected Production
  workflows after an authorized merge/release; local checks alone do not prove it.

### Key Entities *(include if feature involves data)*

- **Learning feedback**: private attributed observation, exact target, author,
  proposed status and disposition history.
- **Practice candidate/revision**: existing sanitized shared-knowledge proposal with
  exact eligible originals, rights and immutable content.
- **Candidate review**: administrator's rights/minimization decision bound to the
  exact revision and its supporting closure.
- **Draft/evaluation attempt**: admitted scope, budget, execution identity, usage,
  private outputs, current eligibility and terminal or uncertain outcome.
- **Evaluation protocol/case review**: fixed scenarios, expected behavior, rubric,
  baseline/candidate pair and administrator's per-case assessment.
- **Learning release**: exact evaluated revision, final publication decision and
  optional historical rollback intent, preserving withdrawal history.
- **Measurement contribution**: exact observed outcome, comparison protocol,
  customer/quarter, complete paired measurements and separate reuse approval.
- **Cohort release family**: fixed protocol/quarter population and immutable release
  receipt with synchronous withholding after dependency loss.
- **Review/refresh work and quality view**: due work, original dates, eligibility,
  evaluation results and operational status kept as distinct concepts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All authorization scenarios pass for internal author, administrator,
  assigned partner, same-organization peer, revoked member and cross-workspace user;
  no private original, feedback or aggregate reaches an unauthorized reader.
- **SC-002**: Eight actual baseline/candidate case pairs are captured and independently
  reviewed before feature acceptance. Each mandatory safety/fidelity gate passes,
  every candidate scores at least 7/8 and no case regresses. Verify the exact FR-009
  publication verdict separately: demonstrated improvement may qualify, while a
  safe comparison without scored improvement must be rejected and remain unpublished.
  Either correctly enforced outcome establishes feature proof; a fixture or mock
  is not evidence of actual-model behavior. FR-009 publication thresholds remain unchanged.
- **SC-003**: Every release is traceable to its exact current review, evaluation and
  sources; stale, missing, failed or replayed decisions cannot bypass the gate.
- **SC-004**: Deterministic fixtures prove five customers can qualify and four cannot,
  duplicates do not inflate size, calculations include adverse/unchanged results,
  and revoked families cannot release a replacement subset.
- **SC-005**: With workers stopped, all subsequent read/search/citation/model/history
  release checks withhold invalidated content. After restart, bounded cleanup meets
  applicable retention deadlines without resetting original evidence age.
- **SC-006**: At least 100 operations per class across feedback read/write, candidate
  review, evaluation admission, publication, cohort read and dashboard read have
  p95 under 1,000 ms in an owned acceptance environment with production quotas;
  model generation and external research time are reported separately.
- **SC-007**: All four desktop/mobile and light/dark WebKit configurations pass
  accessible core journeys, denial and recovery scenarios. An authorized release
  records deployed revision, required schema/grants and actual Production checks.

## Assumptions

- Dependencies 005, 009, 012 and 013 supply the reviewed source and domain services;
  013 merged in PR 24. Existing source-access policy is retained.
- Internal administrators retain 005 publication authority; this is not a new
  mcteer-only authority. Model evaluation informs human judgment and does not prove truth.
- Pre-014 publications remain readable under existing fences, visibly marked as not
  evaluated under 014 in private review views. Every new/replacement publication
  after enablement requires the new gate; no fabricated historical evaluations.
- Fixed single-cohort summaries are the first aggregate release. Intervention-group
  comparisons, arbitrary metric builders and corrected re-release of a withdrawn
  family require a later privacy design; they are outside this slice.
- Lack of eligible production measurements produces an honest empty state, not
  synthetic customer outcomes. New accepted measurement capture outside existing
  outcomes is not part of this feature.
- No paid calls, 014 implementation or release is authorized by this planning turn.
  Implementation evaluation needs a new explicit operator budget.

## Clarifications

### Session 2026-10-09

- Q: Who should see cross-customer learning metrics? → A: Internal users only;
  partners retain reviewed shared practices without counts or aggregate outcomes.
- Q: Should Turi draft improvements and evaluate representative cases under an
  explicit budget, with administrators reviewing and publishing? → A: Turi drafts
  and evaluates; administrators publish.
- Q: Should feature acceptance recognize a safe actual-model comparison that
  correctly rejects an unproven improvement? → A: Yes. Accept correct no-benefit
  rejection as feature proof; publication still requires a scored improvement.
  This changes SC-002 only, after two independently reviewed catalogs produced
  perfect baseline/candidate scores. Prior failures remain visible and are not regraded.
