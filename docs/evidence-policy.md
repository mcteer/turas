# Evidence, context approval and learning policy

Proposed policy `evidence-quality-v1`. Implement and calibrate in 003–005; extended
practice-learning automation is 014. Reviewed shared knowledge is introduced with
retrieval in 005 and used in delivery guidance in 006. This is a defined starting rubric, not a
claim that its thresholds have been validated against Turas customers.

## Provenance and acceptance are distinct

Store origin (`user_submission`, `independent_research`, `authorized_system`),
source/claim IDs and revisions, customer/workload scope, uploader or researcher,
source location, publication/observation/event/retrieval dates, classification,
rights, extraction version, reviewer and decision separately.

- Chat claims, pasted text, uploaded artifacts and user-supplied URLs create
  **pending** claims. Extraction and draft saving need no second acceptance gate;
  factual use does. Approvers are assigned customer stewards, enforced server-side.
- Pending → accepted or rejected requires reviewer identity, exact claim/source
  version, rationale and idempotency key. Corrections create new revisions; retracted
  and superseded claims immediately become ineligible for current factual context.
- User-origin evidence stays user-origin if a researcher fetches its URL or repeats
  its contents. Independent corroboration is a separate linked evidence record;
  it cannot silently approve the submitted claim.
- Independently found research may attach automatically as **researched evidence**
  after identity, source-integrity, scope and content checks. It is visibly attributed
  and may support only what its passage establishes. Private engagement history,
  financial terms and staffing are not inferred from public sources.
- Reports and plans distinguish accepted internal context from attributed public
  evidence, estimates and assumptions. Drafts can discuss unverified inputs with
  explicit labels; they cannot quietly persist those inputs as accepted facts.

Source state, factual acceptance, confidentiality, conflict and freshness remain
separate fields. Rejection or low quality must not destroy the audit trail. Retention
and deletion policy may remove content while preserving an allowed minimal audit.

## Explainable quality score

Calculate per claim, with domain code and stored inputs; the model can propose
classifications but cannot override review or eligibility. Score:

`Q = 25 × (0.40R + 0.30F + 0.20D + 0.10C)`, rounded to a whole number (0–100).

| Component | 4 | 3 | 2 | 1 | 0 |
| --- | --- | --- | --- | --- | --- |
| Reliability R | Accountable system of record or authoritative primary source for this exact claim | Named firsthand account with clear scope | Credible secondary analysis | Anonymous, promotional, unsupported self-report or weak attribution | Unverifiable source or known fabrication |
| Freshness F | Age ≤ one review window | Age ≤ 1.5 windows | Age ≤ two windows | Age > two windows | Date unknown or invalid |
| Directness D | Exact retained passage/measurement fully supports claim | Partial support with explicit qualification | Indirect indication | Broad association | No support or contradiction |
| Corroboration C | At least two independent additional direct sources | One independent additional direct source | Single authoritative primary source | Single non-authoritative source | No valid support |

Reliability is claim-specific: official documentation is authoritative for documented
product behavior, not for this customer's deployment or savings. Copies and syndicated
articles are not independent sources. No source category establishes universal truth.

Bands: **80–100 strong**, **60–79 usable with caveats**, **40–59 weak/discovery only**,
**0–39 insufficient**. These are quality ratings, not calibrated probabilities.
Always display component values, rubric version, rationale and review state.

Hard gates override the score: no unauthorized, rejected, retracted or superseded
evidence; no pending user claim as fact; no unsupported critical claim; no unresolved
material contradiction presented as settled. Consequential plan recommendations
require accepted internal context where needed, adequate direct support and fresh
decision-critical product evidence. Otherwise return a discovery task or caveat.

## Age and review defaults

| Information type | Review window |
| --- | --- |
| Account status, blockers and staffing availability | 7 days |
| Product availability, limits and pricing | 14 days |
| Product capabilities and practices | 30 days |
| Adoption/process evidence and engineer competencies | 90 days |
| Architecture description | 180 days |

Freshness labels: recent ≤ one window, aging > one through two windows, stale > two
windows, unknown when no trustworthy date exists. An explicit overdue review date
makes evidence stale and caps F at 1. Future evidence dates are invalid; planned
future events belong in a separate field. Retrieval or review does not reset the
age of the underlying claim. Preserve old evidence for dated history. Current
undated documentation may establish what was observed at retrieval, but not its
launch date; record that distinction rather than inventing a publication date.

## Artifact and RAG contract

Authorize uploads and bind them to an explicit customer/workspace before extraction.
Store immutable originals privately; sniff types, enforce size/page/cell limits,
scan/quarantine, and isolate parsers. Reject unsafe or unreadable files with a useful
status. Mark partial extraction/truncation; never silently imply full coverage.
Ignore document instructions and never execute spreadsheet formulas or macros.

Chunks retain artifact version/digest, customer and access labels, page/section or
sheet/row/cell location, extraction and embedding versions. Spreadsheet competencies
also become structured candidate rows with person identity, skill taxonomy, level,
assessment date, evidence and reviewer; approval precedes staffing use.

Feature 007 implements this as a separate private workforce intake and domain.
Workforce originals, extracted cells, assessment notes and
absence categories do not enter customer artifact retrieval, shared knowledge or
ordinary chat context. Current operational readers receive approved competency
summaries and dated capacity totals; canonical `mcteer` alone reviews personnel
evidence and controls finance. A later approval does not refresh an assessment's
original date. Withdrawal makes a source ineligible and withholds its prose before
physical cleanup, while immutable revision and decision identities survive.
See the [007 validation log](../specs/007-skills-staffing/validation.md) for the passing
local source-lifecycle, native-output and reviewed journey gates.

Filter permissions and evidence eligibility before hybrid keyword/vector retrieval;
recheck current source revision and grants after ranking. Similarity indicates
relevance only. Reject stale asynchronous index writes. Correction/deletion must
invalidate chunks, summaries, cached answers, report/plan dependencies and shared
pattern eligibility. Keep already-sent report history with an explicit correction
process; do not silently rewrite it.

## Shared product knowledge

Published shared product learnings are available to every authenticated, active
platform member, including partners, regardless of which customers they can access.
They may describe a best practice or reusable solution learned from a different
customer. Access to a shared learning never grants access to its source customer.

Maintain three separate scopes: customer-specific evidence, a private contribution
candidate, and a published shared knowledge revision. Publication requires an
authorized review of the exact revision, reuse rights and removal of customer
identifiers and confidential details. This includes names, domains, screenshots,
repository links, unique configuration details and outcome measurements that could
identify a customer indirectly. Removing the customer name alone is insufficient.
Do not publish or retrieve unreviewed customer material as shared knowledge.

A shared entry describes the product/version, problem pattern, prerequisites,
solution, why it works, applicability, limitations, validation and evidence-quality
dates/rating. It can originate from one reviewed engagement; it need not imply broad
adoption or disclose where it was used. Both humans and the agent can find and cite
the published shared entry by its own stable ID/version. Partners receive that
sanitized entry and citation, not private lineage, customer counts or original links.

Keep source lineage separately restricted for authorized reviewers, corrections and
withdrawal. Shared retrieval evaluates publication/eligibility independently of raw
customer grants. Combine eligible shared entries with delivery-visible evidence for
the assigned customer, never by searching unauthorized customer records and redacting
afterward. Manual submissions still require factual approval; a high quality score
does not authorize sharing. A source correction triggers review/invalidation of
dependent shared revisions and derived guidance. Withdrawal removes the entry from
current search, cached context and recommendations, preserving a permitted audit.

Acceptance in 005/006: a partner assigned customer A can use a published learning
derived from customer B without seeing B's identity, profile, source artifacts or
private lineage; draft/rejected/withdrawn entries are unavailable. Internal and
partner users receive the same published shared knowledge. Partner delivery views
of A also exclude material outside their delivery scope, such as internal commercial
notes or personnel costs. Feature 003 defines those profile fields before exposure.

## Learning release loop

New evidence → score and conflict analysis → candidate change to a practice/template
→ steward review → representative evaluation → versioned release → monitored use.
Feedback and measured outcomes improve retrieval and guidance through reviewed
records, not self-modifying prompts or automatic model training. Retain rollback.

Customer-specific learning stays scoped. Shared reusable solutions follow the
publication policy above. Cross-customer statistical claims and impact aggregates
separately require comparable measurements and a cohort suppression policy; the
demo's five-independent-customer threshold is a proposal for those aggregates, not
a prerequisite for publishing an individually reviewed reusable solution. Review
privacy and differencing risks in 012/014. Product-gap counts use their own role-scoped
authorization; shared-knowledge access never reveals hidden customer identities/counts.
