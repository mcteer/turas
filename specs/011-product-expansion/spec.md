# Feature Specification: Product expansion opportunities

**Feature Branch**: `011-product-expansion`
**Created**: 2026-10-08
**Status**: Implemented locally; release acceptance in progress
**Input**: Roadmap 011 and product blueprint TR-03: explain new-product and usage-expansion hypotheses using documented use, outcomes, constraints and engagement fit; rank transparently, qualify with the account owner, retain dismiss/defer decisions and re-evaluate on new evidence. User requested specify, clarify, plan, tasks and analyze, then a model handoff before implementation.

## Scope and decision boundaries

Give internal account teams, TAMs and delivery practitioners a customer/workload workspace for proposed expansion that starts with customer benefit. A hypothesis is a proposition to investigate. Qualification records the responsible account owner's judgment that it is worth pursuing; it does not establish product adoption, customer consent, revenue, a sale, accepted delivery work or higher maturity.

011 includes human authoring, evidence review, explicit qualification/disposition, explainable ordering, changed-evidence review and on-demand Turi proposals. It uses the existing profile, research, shared-knowledge, plan and execution domains. Public research can support an attributed hypothesis even when private context is absent; unknown adoption and customer intent stay unknown. No bulk generation across the customer directory is part of this slice.

## Clarifications

### Session 2026-10-08

- Q: Who should be allowed to qualify, defer, dismiss, or reopen an expansion hypothesis in 011? → A: Designated internal account owner per customer; `mcteer` manages assignments. The model has one active internal owner per customer. `mcteer` may explicitly assign themselves but has no implicit qualification override. No owner is backfilled automatically. Owner changes invalidate in-flight decisions and require the new owner to review previous qualifications.
- Other ambiguity categories are resolved by the bounded roadmap scope and the assumptions below: internal-only visibility; per-customer on-demand generation; original evidence approval; no CRM or outbound actions; no assumed adoption/intent; explicit lifecycle, bounds, performance and verification criteria. No further critical question was identified.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Explain a customer-benefit hypothesis (Priority: P1)

An internal practitioner opens one customer, chooses customer-wide or workload scope, and records a new-product or expanded-use hypothesis with a benefit, measurable validation criterion, known use, constraints, prerequisites, alternatives and dated evidence. They can see why it is suggested and which questions still need discovery.

**Why this priority**: A useful, traceable proposal is the minimum valuable increment.
**Independent Test**: Create two synthetic hypotheses, one with supported product/customer fit and one based only on public research; inspect their original citations and explicit unknowns without an assistant or an engagement.

**Acceptance Scenarios**:

1. **Given** eligible customer evidence and current product guidance, **when** a practitioner saves a hypothesis, **then** it is an unqualified proposal with benefit, validation criterion, prerequisites, constraints and original source references.
2. **Given** no accepted private configuration or intent, **when** a public case study is cited, **then** the claim remains attributed and private adoption, need and intent remain unknown.
3. **Given** an unmentioned product or missing telemetry, **when** a candidate is authored, **then** absence of evidence is not treated as non-adoption or an expansion gap.
4. **Given** a pending user claim, another customer's source or a superseded source, **when** used as factual support, **then** it is rejected without disclosing hidden content.

### User Story 2 - Qualify, defer or dismiss with an accountable owner (Priority: P1)

The account owner reviews an exact proposal, records qualify/defer/dismiss with a rationale, and later reopens or updates it when circumstances change. The team can distinguish pending edits from the version on which the last decision was made.

**Why this priority**: Human accountability makes proposed expansion usable without creating implied commercial commitments.
**Independent Test**: Seed a synthetic hypothesis; qualify an exact revision, propose an edit, defer it to a dated checkpoint, dismiss and reopen it; verify authority, concurrency and retry behavior.

**Acceptance Scenarios**:

1. **Given** the authorized qualification reviewer and a current, sufficiently supported revision, **when** they qualify it, **then** the decision binds that exact revision and records rationale, accountable owner and next validation step.
2. **Given** missing decision-critical customer need or product suitability, **when** qualification is attempted, **then** it is blocked with the missing prerequisites identified; discovery remains possible.
3. **Given** a deferred hypothesis, **when** its revisit date arrives, **then** it is visibly due for review; it is not automatically reopened or regenerated.
4. **Given** a dismissed hypothesis, **when** new evidence is attached or Turi proposes the same fit, **then** the dismissal remains until an explicit reopen decision; related proposals are shown for comparison.
5. **Given** simultaneous edits/reviews or a lost response, **when** requests are reconciled, **then** one exact decision succeeds or an explicit conflict is returned; no duplicate action is created.

### User Story 3 - Prioritize and revisit on evidence changes (Priority: P2)

An internal user compares a bounded list within the selected customer/workload scope, sees the evidence behind its ordering, and revisits judgments when sources, prerequisites or account ownership change. A qualified hypothesis can point to a separately reviewed delivery plan or engagement.

**Why this priority**: Explicit ordering and evidence lifecycle keep the list useful after its first review.
**Independent Test**: Seed supported, discovery-only, due, dismissed and source-invalidated candidates; inspect deterministic ordering and explainers, change a source and confirm immediate withholding and review flags.

**Acceptance Scenarios**:

1. **Given** candidates with different customer benefit, prerequisite readiness and evidence sufficiency, **when** the user views them, **then** a published ordering rule and its inputs explain their order; no probability of sale or invented revenue is shown.
2. **Given** a withdrawn, corrected or superseded dependency, **when** a dependent record/history/assistant answer is read, **then** ineligible prose is withheld immediately and the hypothesis is marked review required.
3. **Given** merely aging but otherwise eligible evidence, **when** the record is viewed, **then** its original date, caveat and overdue status remain visible; reading it does not refresh evidence age.
4. **Given** an existing same-customer plan or engagement, **when** an authorized user links its exact eligible reference, **then** the reference is recorded without accepting the plan, staffing it or changing execution state.

### User Story 4 - Ask Turi for grounded expansion proposals (Priority: P2)

An internal user requests on-demand advice for one customer/workload and explicit sources. Turi proposes up to five hypotheses, explains benefit and alternatives, cites evidence and identifies missing knowledge. The user explicitly saves a selected proposal for human qualification.

**Why this priority**: Generation builds on the human workflow and cannot replace its evidence or decision rules.
**Independent Test**: Exercise a fresh owner-private conversation using supported, sparse, contradictory and withdrawn evidence; save one retained proposal and verify that it remains unqualified.

**Acceptance Scenarios**:

1. **Given** supported use/outcome/constraint and product inputs, **when** generation completes, **then** proposed benefit and engagement fit cite the exact supplied evidence and clearly separate facts, attribution, hypotheses and unknowns.
2. **Given** public-only, stale or contradictory inputs, **when** Turi responds, **then** it proposes bounded discovery or no supported hypothesis rather than inventing adoption, savings, intent or suitability.
3. **Given** a completed eligible response, **when** its owner explicitly saves a proposal, **then** a proposed revision is created with original source lineage; model output never qualifies it.
4. **Given** cancellation, lost authority, invalidated evidence or uncertain provider dispatch, **when** release/replay/recovery occurs, **then** ineligible content stays withheld and uncertain paid work is not automatically repeated.

### Edge Cases

- No engagement, workload, product-use record, known account owner or accepted private context.
- Several workloads use the same product differently; product renames do not create artificial opportunities.
- A practitioner chooses an already qualified/deferred/dismissed product/problem combination; duplicate warnings do not automatically merge distinct outcomes.
- Account owner becomes inactive or is replaced during review; an administrator's read access is not qualification authority by itself.
- New evidence conflicts with a previously qualified hypothesis; a dismissed candidate is not revived automatically.
- Draft edit, qualification, source withdrawal and evidence-refresh actions race each other.
- Stale product availability or pricing is mistaken for current support; unknown benefits are assigned invented numeric scores.
- External URLs, source instructions and model prose attempt to bypass approval or expose another customer.
- Feature disabled, migration absent, worker paused, request replay after retention, oversized dependency closure, timeout and lost save acknowledgement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide a customer-bound expansion workspace with optional workload scope. Preserve distinct scope identities and work without an engagement or maturity assessment.
- **FR-002**: Restrict all 011 records, counts, citations, tools and decisions to currently authorized internal workspace members. Partners receive no 011 access, even when assigned the customer. Enforce environment, workspace, customer and owner-private conversation boundaries before retrieval and again at release/replay.
- **FR-003**: Internal members may author and propose changes. Maintain an explicit account-owner qualification authority distinct from customer read access and stewardship. Canonical `mcteer` alone assigns, replaces or removes one active internal owner per customer. Only that currently assigned owner may qualify, defer, dismiss or reopen; self-review is allowed with a recorded rationale. There is no automatic assignment or administrator override. Owner changes require fresh owner review of earlier qualifications. A displayed customer contact is never a login permission.
- **FR-004**: Each revision must distinguish new-product from usage-expansion intent and include product identity, problem/opportunity, customer benefit, validation criterion, current-use evidence or unknown, prerequisites, constraints, alternative including retaining current practice, proposed engagement or discovery step, accountable owner or unknown-owner reason, original evidence, and next review date.
- **FR-005**: Every asserted customer/product fact requires eligible exact evidence; otherwise record it as an explicit unknown or assumption for investigation. Public research remains attributed. Missing product mentions do not prove non-adoption. User-entered claims, links and attachments follow existing factual approval; qualifying a hypothesis does not approve its sources.
- **FR-006**: Use stable product identifiers with aliases and recorded product/version labels. A bounded, versioned vocabulary may be curated from published product knowledge; unavailable or retired choices remain readable in history but require current product evidence before new qualification. Do not hard-code adoption recommendations from a product list.
- **FR-007**: Preserve immutable revisions, separate working and decided heads, exact actor/rationale/time decisions and permitted history. An edit after qualification is a proposed revision and does not inherit qualification.
- **FR-008**: Support dispositions proposed, qualified, deferred and dismissed. Qualification requires an active authorized account owner, explicit supported customer need, benefit and validation criterion, current decision-critical product suitability, and each prerequisite satisfied or assigned to a concrete validation step. Public-only marketing assertions cannot establish private need or intent. Usage-expansion qualification additionally requires evidenced actual use of that product in scope; known actual use cannot be qualified as new-product adoption for the same scope.
- **FR-009**: Defer requires rationale and future revisit date; dismiss requires rationale; reopen requires rationale and returns to proposed. Due dates only flag review. Re-qualification and disposition changes bind an exact revision; no autonomous reopening, qualification or dismissal.
- **FR-010**: Transparently order active candidates by review urgency and discrete customer-benefit, prerequisite and evidence-readiness categories using one published, deterministic versioned rule. Unknown inputs remain unknown; do not calculate sales probability, revenue, maturity or a combined customer-success score.
- **FR-011**: Show same-scope related hypotheses for the same product and normalized problem key, including deferred/dismissed records. Exact retry is idempotent; user-declared distinct hypotheses may coexist with an explicit duplicate acknowledgement. Never merge by model similarity alone.
- **FR-012**: Bind original source revisions, locations, dates, quality, conflicts and scope. Recheck them on read, preview, decision and assistant release. Withdrawal/correction/supersession immediately withholds dependent prose; overdue/stale evidence and ownership changes mark review required and block qualification until refreshed or resolved. Current-source gates work even if background maintenance is delayed.
- **FR-013**: Allow explicit linking of same-customer eligible plans, baselines and engagements. Revalidate links and preserve exact source identity. Linking or qualification does not create or accept plans, commit staffing, alter execution, update maturity or create a CRM opportunity.
- **FR-014**: Enforce optimistic versions and actor/environment/workspace-scoped idempotency for every mutation. Same key and digest returns a currently authorized receipt; changed input conflicts. Unknown save outcomes require receipt reconciliation. Expired keys remain content-free uniqueness fences and cannot recreate a prior action.
- **FR-015**: Let internal users request bounded on-demand Turi proposals over one bound scope, explicit eligible evidence and zero to ten selected engagements. Use original dated context and exact citations, with at most five structured proposals or an explicit no-supported-hypothesis result. Generation has no write, qualification or external-action tool.
- **FR-016**: Admit at most six model steps, six reads, 4,096 output tokens per step, 24,576 context bytes, 200 dependencies, five requests per user per rolling hour, one active request per user/scope and a 120-second deadline. Provide stop and honest failed, expired and unconfirmed states; no automatic paid retry after ambiguous dispatch.
- **FR-017**: Only the conversation owner may save a selected proposal from a completed, retained, currently eligible response. Save preserves the source map and creates a proposed revision after current validation; it cannot qualify, approve facts or silently discard a conflicting/dismissed predecessor.
- **FR-018**: Provide accessible customer navigation, lists, details, editing, evidence inspection, qualification/disposition, related-record comparison and advice. Include loading, empty, unknown-owner, denied, stale, conflict, invalid-source and saving-unknown states; support keyboard and mobile/light/dark presentation.
- **FR-019**: Bound lists to 50 items per page, direct evidence to 20 references per revision, selected engagements to ten and total source dependencies to 200. Reject excess rather than silently truncating decision inputs. No cross-customer expansion ranking or bulk generation in this slice.
- **FR-020**: Preserve current eligible records and immutable decision identities. Withhold invalidated content immediately and purge dependent payloads within 24 hours; expire abandoned/superseded working drafts after 90 days and assistant payloads after 30 days. Keep content-free decision/receipt identifiers for 365 days, references needed by retained records, and minimal request-key fences for the environment lifetime.
- **FR-021**: Record content-free correlation IDs, event categories, latency, usage and failure states. Keep customer prose, source passages, prompts, URLs and credentials out of routine telemetry.
- **FR-022**: Use explicit recoverable schema changes and least privilege. Disabling 011 prevents new mutations and generation while current authorized reads, receipts, cancellation, settlement and retention continue. Preserve selected databases, private artifacts and durable agent state.
- **FR-023**: Verify authorization/source denial, exact decisions, replay/concurrency, deterministic ranking, lifecycle cleanup, bounded generation, responsive keyboard journeys and migration/recovery with synthetic fixtures. Actual-output review and measured performance are required; record local, CI and hosted evidence separately.
- **FR-024**: Keep CRM connectors, outbound messages, customer outreach, pricing/ROI calculators, forecasting, cross-customer mining, scheduled generation, partner expansion views, product-gap aggregation, adaptive learning and MCP outside 011. Preserve the selected Turi model and existing external-send controls.

### Key Entities *(include if feature involves data)*

- **Expansion scope**: environment/workspace/customer and optional workload.
- **Product vocabulary entry**: stable key, version/aliases and active/retired availability for selection, separate from factual capability claims.
- **Hypothesis and revision**: immutable customer-benefit proposition with working/decided heads and evidence-backed or unknown inputs.
- **Account-owner assignment**: current internal authority for qualification, separate from named customer stakeholders.
- **Qualification/disposition decision**: exact revision, current reviewer, rationale, review/revisit checkpoint and immutable outcome.
- **Evidence dependency / linked delivery reference**: exact original revision, permitted locator and current eligibility.
- **Command receipt**: current-authorized retry identity with a content-free uniqueness fence after payload expiry.
- **Advice attempt**: owner-private context, budgets, source map, structured proposals and terminal state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the synthetic journey, an internal practitioner creates an evidenced hypothesis and the authorized owner records a qualification or a justified discovery/defer decision within five minutes, excluding generation time.
- **SC-002**: Every role/scope/source-lifecycle acceptance case passes with zero unauthorized content, citations, hidden counts or private conversations disclosed, including mid-generation revocation.
- **SC-003**: All ranking fixtures produce the specified order with visible input explanations; unknowns never become positive fit or quantified commercial predictions.
- **SC-004**: Retry, concurrent edit/review and restart scenarios yield exactly one result or an explicit conflict, with zero duplicate accepted decisions or ambiguous paid re-dispatches.
- **SC-005**: At 200 customers, 1,000 scopes, 10,000 hypotheses, 50,000 revisions and five concurrent users, each list/detail/decision-acknowledgement class has p95 at most two seconds over 100 operations after ten warmups, with zero correctness errors; setup and model latency are excluded.
- **SC-006**: Eight defined synthetic actual-output cases pass citation, customer-benefit, alternative, unknown and decision-boundary review; every attempt stays within admission limits. Deterministic cases separately cover cancellation, malicious inputs and provider failures.
- **SC-007**: Desktop/mobile light/dark WebKit journeys pass without missing, skipped or retried acceptance cases; keyboard flows succeed and zero serious/critical automated accessibility violations remain.
- **SC-008**: Disposable upgrade/restart/cleanup checks preserve current decisions and request identity, prove immediate withholding and specified purge deadlines, and leave the selected application database and agent state unchanged.

## Assumptions

- This is a planning-only handoff; no application implementation or Production mutation is authorized by this request.
- Roadmap dependencies 006 and 008 are merged. Existing 003/005 evidence and 010 native advice patterns are reusable foundations, with their existing local/hosted proof limits retained.
- Internal-only expansion content is the least-privilege starting point. Partners continue to receive separately governed delivery plans through existing features.
- Product knowledge comes from existing eligible research/shared knowledge. Users may explicitly run existing research separately; 011 does not install an integration or scrape a new product catalog.
- English and the current temporary internal logins are sufficient for this slice. No new identity-provider or general sales-role hierarchy is introduced.
- No product/customer has to yield an opportunity. An honest no-supported-hypothesis result is successful behavior.

## Implementation status

Local implementation is under release validation. Migrations 046–047, all four story implementations and deterministic local checks are available. See [validation.md](validation.md) and [tasks.md](tasks.md) for source-bound receipts and remaining gates. Configured-provider evaluation, independent actual-output review, CI and hosted migration/release are not established by local fixtures.
