# Evidence, context approval and learning policy

Proposed policy `evidence-quality-v1`. Implement and calibrate in 003–005; extended
practice-learning publication is 014. This is a defined starting rubric, not a
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

Filter permissions and evidence eligibility before hybrid keyword/vector retrieval;
recheck current source revision and grants after ranking. Similarity indicates
relevance only. Reject stale asynchronous index writes. Correction/deletion must
invalidate chunks, summaries, cached answers, report/plan dependencies and shared
pattern eligibility. Keep already-sent report history with an explicit correction
process; do not silently rewrite it.

## Learning release loop

New evidence → score and conflict analysis → candidate change to a practice/template
→ steward review → representative evaluation → versioned release → monitored use.
Feedback and measured outcomes improve retrieval and guidance through reviewed
records, not self-modifying prompts or automatic model training. Retain rollback.

Customer-specific learning stays scoped. Cross-customer patterns require explicit
reuse authority, minimized comparable measurements, provenance and a minimum cohort
policy. Start with the demo's five-independent-customer suppression proposal, then
review privacy and differencing risks in 014. Product-gap counts in 012 use their own
role-scoped authorization; partners must not infer hidden customer identities/counts.
