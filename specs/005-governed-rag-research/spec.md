# Feature Specification: Governed retrieval, research and evidence quality

**Feature Branch**: `005-governed-rag-research`
**Created**: 2026-09-28
**Status**: Local implementation and validation complete on the unmerged feature branch; internal-administrator publication confirmed; hosted release remains out of scope
**Input**: Roadmap 005, the evidence policy, and the request to run specify, clarify, plan, tasks and analyze before switching models for implementation.

## Scope and intent

Let members and Turi find relevant, eligible evidence with exact citations; let
all active platform members use reviewed, sanitized product learnings; and let
users request bounded public research without turning supplied claims into facts.
005 builds on the merged identities, profile review, private conversations and
artifact source lifecycle in 002–004. Similarity and evidence quality never grant
access, approve a claim, or establish that a recommendation fits a customer.

Included: combined semantic and keyword search, claim-level evidence quality,
customer and shared knowledge search/inspection, an exact-revision shared
publication workflow, attributed public research, distinct recon/practice/fit
research responsibilities, refresh and contradiction handling, and retrieval,
citation and agent evaluations. Use synthetic customers and public information.

Excluded: hosted provisioning/deployment, private real-customer rollout, new
identity providers, whole-file partner sharing, external report sends, accepted
or tracked delivery plans (006), staffing/competency import (007), aggregate
cross-customer statistics and adaptive practice automation (012/014), and MCP (015).
Private draft attachments remain available only through 004's explicit unverified
selection flow; ordinary search does not search private chat history or unapproved
originals. Existing model selection and original-file visibility remain governed
by 002–004.

## Clarifications

### Session 2026-09-28

- Q: Who should be allowed to publish shared product learnings in 005?
  A: Internal administrators only (user confirmed 2026-09-28).

One question was asked and answered. FR-009 and the publication contracts use the
confirmed authority. Remaining categories are covered by existing governance or
bounded defaults below. Provider selection and execution budgets are plan decisions.

| Clarification category | Status | Basis |
| --- | --- | --- |
| Functional scope and roles | Resolved | User confirmed internal-administrator publication; recorded in FR-009 |
| Domain and data model | Clear | Exact revisions, provenance, private lineage and lifecycle entities |
| Interaction and UX | Clear | Four journeys, required failure states and accessibility matrix |
| Quality attributes | Clear | Measured relevance/latency, denial, recovery and output-review criteria |
| External dependencies | Clear | Public-only bounded research; provider implementation is a plan decision |
| Edge cases and failures | Clear | Scope/origin, concurrency, revocation, partial work and ambiguous calls |
| Constraints and tradeoffs | Clear | Local synthetic/public scope, selected model and 002–004 boundaries |
| Terminology | Clear | Accepted fact, attributed research, Pending submission and published learning stay distinct |
| Completion signals | Clear | Eight testable success criteria; runtime completion not claimed |
| Placeholders | Clear | No unresolved requirement markers or publication-authority question |

## User Scenarios & Testing

### User Story 1 - Find evidence and inspect what supports it (Priority: P1)

A member searches within a selected customer or the shared library, and Turi uses
the same eligible evidence to answer a customer question. Each result explains
its source, dates, quality, review state and limitations and opens the precise
retained passage or document location the member is allowed to see.

**Why this priority**: Reliable, permission-aware evidence is the prerequisite for
research reuse and later delivery plans.

**Independent Test**: With synthetic reviewed profile claims, approved artifact
excerpts and attributed research, an internal member and an assigned partner
retrieve useful exact passages; a partner cannot discover an unassigned customer
or internal-only field through results, citations, counts or errors.

**Acceptance Scenarios**:

1. **Given** eligible evidence with different wording from a question, **When** a
   member searches the customer, **Then** relevant semantic and keyword matches
   are combined, deduplicated and ranked, with stable source/revision citations.
2. **Given** an accepted artifact claim supported by selected PDF pages or sheet
   cells, **When** its result is opened, **Then** only the approved excerpt and
   its exact original locations are shown; approval does not release adjacent text.
3. **Given** Pending, rejected, retracted, superseded, withdrawn or unsupported
   evidence, **When** ordinary search or Turi requests factual support, **Then**
   that evidence is ineligible even if an old search copy exists.
4. **Given** a stale, weak or disputed result, **When** inspected or used by Turi,
   **Then** the caveat and component rating remain visible; it cannot establish a
   decision-critical current claim or a settled answer to a material conflict.
5. **Given** no adequate support, **When** asked to answer, **Then** Turi identifies
   the missing evidence or offers a research/discovery step without inventing a citation.

### User Story 2 - Publish and reuse a sanitized learning (Priority: P1)

A member with source access prepares a private contribution containing a reusable
product practice or solution. An authorized publisher reviews the exact sanitized
revision, its reuse rights, applicability and restricted lineage, then publishes
it. Every active platform member can search and cite that published revision.

**Why this priority**: Reuse across customers is valuable only when it preserves
customer confidentiality and retains a correction path.

**Independent Test**: A partner assigned only Cedar can use a published learning
from Juniper, while receiving no Juniper identity, customer count, artifact link,
private lineage or contribution draft. Internal and partner readers see the same
published payload. Publication is separately authorized from customer fact review.

**Acceptance Scenarios**:

1. **Given** eligible sources visible to a contributor, **When** a sanitized
   contribution is saved, **Then** it remains private and non-searchable until an
   exact-revision publication decision records rights and sanitization rationale.
2. **Given** a candidate containing a customer domain, repository URL, unique
   configuration or identifying outcome, **When** publication is attempted,
   **Then** the reviewer must remove identifying material in a new revision and
   approve that exact content; removing the customer name alone is insufficient.
3. **Given** a published entry, **When** any authenticated active platform member
   reads it, **Then** its own stable ID/version, product/version, problem,
   prerequisites, solution, reasoning, applicability, limits, validation and
   public-safe quality dates are visible, without source-customer attribution.
4. **Given** a candidate or old revision changes while review is open, **When** a
   decision is submitted, **Then** it fails as stale without publishing a different
   revision; an identical request replay returns the original receipt.
5. **Given** a dependent source is corrected or withdrawn, **When** that change
   commits, **Then** affected published revisions leave current retrieval and
   require renewed review before a new eligible revision can be published.

### User Story 3 - Request bounded public research and explain fit (Priority: P2)

A member asks Turi to research a customer public identity, a product practice, or
how existing findings fit the selected customer's constraints. Research retains
attributed passages and separates newly found research from accepted internal facts.

**Why this priority**: Current evidence fills genuine gaps without making every
user claim factual or every task an unrestricted web search.

**Independent Test**: Run one public-source synthetic customer case through each
research responsibility, with observable progress and cancellation; verify exact
passages, origin, dates, budgets and failure outcomes. No public service receives
private customer text or internal commercial/personnel data.

**Acceptance Scenarios**:

1. **Given** a selected canonical customer and confirmed public identity, **When**
   recon runs, **Then** it researches only that public identity and attributes
   findings; similar company names cannot silently select a different entity.
2. **Given** a general product/version question, **When** practice research runs,
   **Then** queries contain public product concepts only; results do not copy
   private customer questions or automatically enter the published shared library.
3. **Given** recon, eligible customer evidence and published practices, **When**
   implementation research explains fit, **Then** it synthesizes those inputs,
   states prerequisites and gaps, and proposes a bounded follow-up research
   request for the user to start when evidence is missing.
4. **Given** a URL or claim supplied by a member, **When** research fetches or
   paraphrases it, **Then** its origin remains user submission and factual use
   remains Pending; separately discovered corroboration is linked separately.
5. **Given** a provider failure, ambiguous identity, unsupported passage, blocked
   URL, partial run or exhausted budget, **When** the run ends, **Then** status and
   retained valid findings reflect the limitation; no completed-research claim is made.
6. **Given** a research result asserting private deployment, savings, staffing or
   financial terms from public marketing, **When** evaluated, **Then** it cannot
   become accepted internal context or stronger evidence than its passage supports.

### User Story 4 - Refresh, resolve conflicts and revoke derived context (Priority: P2)

A steward reviews due evidence and material contradictions, requests refresh,
corrects or withdraws sources, and sees affected shared entries and conversation
context become ineligible. Operators can recover interrupted search indexing and
research work without duplicated results or hidden provider retries.

**Why this priority**: Correct citations are only useful while their current
eligibility and dates remain accurate.

**Independent Test**: Pause indexing, revise/withdraw a source and revoke a grant,
then resume stale work. Current search, source detail, in-flight output and replay
must deny obsolete content. An authorized fresh revision becomes searchable once.

**Acceptance Scenarios**:

1. **Given** an overdue or undated source, **When** freshness is evaluated,
   **Then** the original date basis and evidence-quality-v1 window apply; retrieval
   time does not rejuvenate the underlying assertion.
2. **Given** a requested refresh returns unchanged content, **When** recorded,
   **Then** retrieval history grows without inventing a new publication date or
   silently approving a user-origin claim.
3. **Given** conflicting supported assertions about the same scope and period,
   **When** flagged, **Then** a steward sees both eligible sources and records a
   versioned resolution; confirmed material conflict blocks settled guidance.
4. **Given** access, source or shared publication eligibility changes during a
   response or before replay, **When** content is released, **Then** server checks
   stop/redact affected generated content and require fresh context as in 003–004.
5. **Given** interrupted indexing, refresh or cleanup, **When** recovered,
   **Then** retries are bounded and idempotent and cannot republish an older generation.

### Edge Cases

- Search phrase contains prompt injection, quoted secrets, long input, empty text,
  unsupported language or terms unique to another customer; no cross-scope leak.
- An approved selection covers disjoint locations, partial OCR or repeated sheet
  labels; citations preserve those boundaries and extraction warnings.
- High similarity with low quality, unknown dates, future dates, copied sources,
  or unmatched product versions; ranking cannot overrule hard eligibility gates.
- Publication author loses access, reviewer authority changes, two reviewers race,
  or the source changes between preview, embedding and publication.
- Shared readers have no grant to the source customer or belong to a different
  workspace; publication is globally readable, restricted lineage is not.
- A partner loses a customer grant while a research job or answer is running;
  shared reading remains independently authorized, customer work fails closed.
- Redirects to private addresses, DNS changes, excessive pages, auth walls,
  downloads, malicious HTML and document instructions; research reports blocked
  or incomplete content without executing it or bypassing access controls.
- A provider times out after accepting a call, or a developer restart loses a
  native run; no automatic repeat of an ambiguous paid request.
- A source withdrawal invalidates many descendants; logical denial is immediate,
  with bounded physical cleanup and explicit failed-job visibility.

## Requirements

### Functional Requirements

- **FR-001**: Bind each customer query to one canonical environment/workspace/customer
  and optional workload using current server authority. Shared-only search requires
  an authenticated active membership; combined search authorizes both scopes separately.
- **FR-002**: Customer search includes current accepted profile projections, approved
  artifact evidence excerpts and verified attributed research only. Preserve delivery
  field projections and transitive support eligibility. Private chats, unapproved
  originals and Pending user claims are excluded from ordinary factual retrieval.
- **FR-003**: Combine semantic and keyword relevance with deterministic ranking,
  deduplication and stable tie-breaking. Search relevance never changes acceptance,
  classification, conflict or quality; an unavailable semantic component is labeled.
- **FR-004**: Preserve exact source/revision, retained passage digest and original
  page/section, slide, sheet/row/cell or line location for every result. Citation
  resolution reauthorizes the current reader and never expands an approved excerpt.
- **FR-005**: Apply permissions and source eligibility before retrieving candidates
  and recheck after ranking, before model context and at each output/replay boundary.
  Hidden records must not influence result counts, snippets, citations or ranking.
- **FR-006**: Reuse deterministic evidence-quality-v1 weights, bands, date bases,
  review windows and hard gates. Show component values and rationale per claim;
  copied/syndicated sources do not count as independent corroboration.
- **FR-007**: Label accepted facts, attributed research, published shared practices,
  and explicit draft discussion distinctly. Abstain from unsupported current or
  decision-critical claims and unresolved material contradictions.
- **FR-008**: Maintain separate private contribution, published sanitized revision
  and restricted lineage records. Every active platform member, including partners,
  can read the same eligible published shared payload independently of customer grants.
- **FR-009**: Permit source-authorized members to submit candidates. Only an active
  internal administrator may publish, with current access to
  every lineage source; other members cannot publish, revise a publication head,
  reject for publication, or withdraw shared entries. Publication decisions require
  exact revision/digest, reuse-rights attestation, sanitization rationale and idempotency.
- **FR-010**: A published entry contains product/version, problem, prerequisites,
  solution, reasoning, applicability, limitations, validation and public-safe quality
  metadata. Source identity, lineage IDs/links/counts and identifying configurations
  or outcomes must be absent from its reader projection and public citations.
- **FR-011**: Edits create immutable revisions. Publish, reject, correct, withdraw
  and replay use current authority, version checks and auditable receipts. A source
  correction/withdrawal invalidates dependent publications pending renewed exact review.
- **FR-012**: Offer user-initiated customer recon, product-practice research and
  implementation-fit synthesis with distinct permitted inputs/tools. Customer recon
  requires a confirmed public identity; practice research uses public product topics;
  synthesis uses governed inputs and delegates missing research through bounded jobs.
- **FR-013**: Construct outbound search/fetch requests from approved public fields
  and explicit public topics. Never transmit private customer context, uploads,
  private lineage, commercial terms, personnel details or chat history to research
  providers. External query preview explains what will be sent; starting it
  authorizes that public query scope and bounded run. A tool cannot broaden it.
- **FR-014**: Record requested/discovered origin and a server-verifiable research
  receipt. Fetching a submitted URL preserves user origin; independent corroboration
  is separate. Trusted research requires identity, scope, integrity and content checks
  against retained passages before it becomes attributed evidence.
- **FR-015**: Permit bounded public read access only. Validate destinations and every
  redirect, prohibit local/private/reserved network targets and authenticated sources,
  enforce content/size limits, strip active content and treat all source instructions
  as data. A search snippet alone cannot substantiate a retained factual claim.
- **FR-016**: Persist research states and checkpoints, bounded time/call/content budgets,
  cancellation, partial results and safe error reasons. Reauthorize at execution and
  publication; an ambiguous paid call is reconciled or ends unconfirmed, never blindly retried.
- **FR-017**: Track due reviews and user-requested refresh without resetting evidence
  age. Scheduled local maintenance may mark due/invalidate expired context; new external
  research requires a user-initiated bounded request in 005.
- **FR-018**: Support versioned conflict flags and steward confirmation/resolution
  across eligible accepted claims, research and shared entries. Confirmed material
  conflicts remain visible and cannot be presented as settled guidance.
- **FR-019**: Version search projections and derivations. Correction, withdrawal,
  deletion, publication changes and authorization revocation invalidate search copies,
  caches, answer dependencies and ongoing/replayed output; stale asynchronous writes
  cannot restore eligibility. Physical cleanup retains only permitted minimal audit.
- **FR-020**: Preserve useful loading, empty, denied, degraded, partial, failed,
  cancelled, due and stale states in search, source detail, publication and research
  UI, with keyboard access, mobile layouts and both themes.
- **FR-021**: Use one governed domain boundary for UI and eve tools/jobs. Preserve
  conversation ownership, selected model and existing approval controls. Tool output
  is bounded, source-linked and unavailable after its recorded context is invalidated.
- **FR-022**: Record safe operational metrics for retrieval coverage/latency,
  source/citation eligibility, projection lag, research usage and cleanup failures.
  Queries, source text, credentials and hidden customer identifiers stay out of logs.
- **FR-023**: Require explicit recoverable migrations, a disposable local upgrade/
  restore drill, representative retrieval/citation/denial fixtures and bounded live
  research/agent evaluation before claiming implementation complete. Update README,
  roadmap and feature status in the feature PR and stop before hosted deployment.

### Key Entities

- **Search projection**: eligible source revision, scope, permitted passage, original
  locators, lifecycle generation, content digest and versioned search representation.
- **Retrieval receipt and citation**: query scope, selected exact revisions,
  evidence state/quality, context generation, expiry and permitted locations.
- **Shared contribution/revision**: private authoring state, sanitized content,
  current publication state, reviewer decision and public-safe evidence metadata.
- **Restricted shared lineage**: source revisions, reuse rights and source-generation
  dependencies, readable only by currently authorized contribution reviewers/authors.
- **Research request/run/observation**: actor and public scope, origin, bounded
  responsibility, external-call receipts, verified passages, dates and outcomes.
- **Refresh/conflict record**: due date, observed source change, related exact
  revisions, steward decision, impact and invalidation progress.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A fixed corpus with at least 40 judged queries spanning lexical,
  paraphrased and document-location questions achieves recall@5 of at least 0.85;
  all returned citations resolve to the exact allowed passage and location.
- **SC-002**: Every denial fixture passes for cross-customer, cross-workspace,
  partner field, private-conversation, Pending, revoked, withdrawn, unsupported
  and stale-write cases; hidden sentinel text/IDs/counts never reach output.
- **SC-003**: A partner assigned only customer A can find and cite a published
  learning derived from B with zero B identity, source URL or private-lineage
  disclosure; draft/rejected/withdrawn versions are never returned.
- **SC-004**: At 5,000 eligible passages and five concurrent local readers,
  95% of searches show results within two seconds of obtaining the query's
  semantic representation. Newly eligible sources converge within 60 seconds
  with a healthy worker; revoked/ineligible sources disappear immediately.
- **SC-005**: Quality/freshness boundary fixtures match evidence-quality-v1
  deterministically, including unknown/future dates, overdue reviews and copied
  corroboration; refresh never changes an underlying claim's age without evidence.
- **SC-006**: At least 12 bounded agent/research scenarios meet every authority,
  source-integrity, origin and citation hard gate and score at least 7/8 for
  fidelity, uncertainty, relevance and next-action usefulness. Failed, cancelled
  and partial runs are described accurately; provider usage stays within plan budgets.
- **SC-007**: Replay, concurrent review and restart fixtures produce one logical
  publication/result per idempotency key; obsolete jobs cannot revive content,
  and revocation stops subsequent output and generated-history replay.
- **SC-008**: Scripted search, source inspection, contribution review, research
  cancellation and refresh journeys pass desktop/mobile, light/dark and keyboard
  checks with no serious/critical accessibility findings on the affected screens.

## Assumptions

- 005 is a local synthetic/public-data release, with the three existing logins and
  server authorization. All active platform memberships may read published shared
  knowledge; private customer data remains environment/workspace/customer bound.
- Publication authority is restricted to internal administrators, confirmed in
  clarification. Account names are examples, never authorization rules.
- Ordinary retrieval uses approved excerpts, not blanket artifact approval. The
  original/private draft inspection contract remains the 004 contract.
- No separate paid infrastructure is provisioned while planning. The implementation
  plan must verify provider availability and state required configuration explicitly.
- Versioned evidence-quality-v1 is a starting rubric. Synthetic evaluation verifies
  behavior and thresholds, not real-customer statistical calibration.
