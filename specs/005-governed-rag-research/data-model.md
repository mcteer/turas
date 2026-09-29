# Data model: 005 governed retrieval and research

Design only. Extend the existing environment, membership, customer, source,
profile-revision and conversation tables; do not create a second identity or
approval system. Names below describe new logical tables, with SQL names fixed
by migrations 019–022. All field validation is collected in C01–C10 so tasks can
quote it exactly. Additional behavioral limits live in the contracts.

## C01 — Common revision and write envelope

**Constraint:** IDs are server-generated UUIDs; timestamps are UTC; revisions and generations are positive integers; digests are lowercase SHA-256 hex; writes require a 1–128 character idempotency key scoped to actor and operation, and reuse with a different payload is a conflict.

Applies to all new durable entities. Use existing environment/workspace/customer
foreign keys. SQL foreign keys and unique indexes enforce identity and replay;
server policy validates current authority in the mutation transaction. Decision
receipts retain actor, operation, revision/digest, reason code and timestamp after
payload cleanup. Never store secrets, full queries or passages in routine logs.

## C02 — Retrieval source and passage (US1; extended by US2/US3)

**Constraint:** Source kind is accepted_profile, approved_excerpt, verified_research or published_shared; scope is customer or shared; customer scope requires environment/workspace/customer IDs, shared scope requires environment ID and no public customer/workspace IDs; passage text is 1–2,000 characters; embedding is 1,536 finite dimensions or absent with an explicit pending, unavailable or unconfirmed status.

`retrieval_sources` identifies the exact original revision, projection audience
(internal/delivery/shared), contract digest, source generation and content digest.
`retrieval_passages` holds ordered text, English search vector, optional embedding,
original locators and extraction warnings. Unique source revision + audience +
contract + passage digest prevents duplicate projection. Different audience
projections never share a broader payload; do not deduplicate across customers.
The source registry keeps restricted pointers for server validation; reader DTOs
contain only permitted citation IDs. Pending indexing is not source approval.

## C03 — Citation, retrieval receipt and consumed dependency (US1/US4)

**Constraint:** A citation binds source revision, passage digest, projection contract and every selected locator; locator kind is profile_field, artifact_unit, research_passage or shared_field, text spans use zero-based half-open offsets, and artifact locators retain the original 004 unit location; a receipt contains at most 10 citations, an as-of time and valid-until time, with no persisted raw query; consumed dependencies are an append-only union per native conversation session until retirement.

`retrieval_receipts` describes delivered context; `retrieval_receipt_sources`
contains citation/authority/source-generation snapshots. `session_evidence_dependencies`
extends 003–004 fences, including shared and research receipts consumed in earlier
turns. Expiry is the earliest source, quality, authority or request deadline.
Citation tokens are identifiers, never capabilities. Retained exact spans can
cover multiple approved units, without joining intervening private content.

## C04 — Private shared contribution and sanitized revision (US2)

**Constraint:** Contribution state is draft, submitted, rejected or closed; publication state is unpublished, published, suspended, superseded or withdrawn; title and product/version are 1–200 characters each; problem, prerequisites, solution, reasoning, applicability, limitations and validation are each 1–2,000 characters; sanitized revision JSON is at most 20 KiB.

`knowledge_contributions` owns the private author/workspace pointer and current
candidate revision. `knowledge_revisions` stores immutable sanitized payloads and
public-safe quality explanations. `knowledge_publications` contains only stable
shared ID, exact revision, publication state/head generation and public dates.
Reader projection excludes contributor, reviewer, workspace, lineage and private
source identity. Empty knowledge is expressed as an explicit limitation, not a
blank required field. Draft author and currently authorized administrator can
read a private candidate; all lineage access is separately reauthorized.

## C05 — Restricted lineage and publication decisions (US2/US4)

**Constraint:** Each candidate has 1–20 exact accepted-profile or verified-research lineage revisions; lineage may depend transitively on approved artifacts but never on another shared entry; publication requires exact revision/digest, current administrator authority, current access to every lineage source, rights attestation and a 1–2,000 character sanitization rationale.

`knowledge_lineage` stores private source revisions/generations and rights basis.
`knowledge_decisions` records publish/reject/withdraw receipts and current head
precondition. Rights attestation is a human decision on source reuse, not a
model classification. Self-publication is allowed when the author independently
has current administrator authority; do not describe it as independent review.
Lineage validity is computed before shared release, irrespective of asynchronous
state updates. Deleted private payloads leave only minimal opaque audit links.

## C06 — Research request and run (US3)

**Constraint:** Mode is recon, practices or fit; request state is draft, admitted, consumed, expired or cancelled; run state is queued, running, completed, partial, failed, cancelled or unconfirmed; public identity/topic fields are 1–200 characters and each rendered query is 1–500 characters; the immutable admitted scope contains at most four queries, its digest, actor/session/customer/conversation binding and a deadline.

`research_requests` stores the editable public preview and immutable admission
revision. `research_runs` binds one admitted request to one owned conversation
attempt and its durable eve execution. Unique admission ID prevents multiple
consumers. Recon needs explicit canonical public name/domain confirmation;
practices needs product/version/topic; fit has no queries or external capability.
Scope admission confirms egress scope only, never accepts a customer claim.

## C07 — Provider operation and fetched observation (US3)

**Constraint:** Operation state is reserved, dispatched, succeeded, failed or unconfirmed; operation keys are unique per run and step; URLs are HTTPS, at most 2,048 characters, have no credentials and use port 443; origin is independent_discovery or user_submission; normalized text is at most 100,000 characters per fetched document and retained passages are at most 2,000 characters each.

`research_operations` persists budget reservation, deadline, provider-safe receipt
ID, usage counters and terminal code; it does not store credentials. Dispatch
uncertainty cannot be overwritten with assumed failure. `research_observations`
stores requested/canonical URL and redirect aliases, discovery operation,
identity check, network/content checks, body/passage digests, parsed dates with
date provenance and exact quotations. Body staging is separate and purgeable.
`research_evidence_links` maps checked observations to attributed profile research
or Pending user submissions. Search snippets cannot populate evidence links.
Identity and quality checks are server predicates, not client/model booleans.

## C08 — Quality and conflict extensions (US1/US4)

**Constraint:** Quality uses evidence-quality-v1 with integer R/F/D/C components from 0 through 4 and Q = round(25 × (0.4R + 0.3F + 0.2D + 0.1C)); conflict endpoints bind exact accepted-profile, verified-research or published-shared revisions and a common scope/period; resolution requires current steward authority for customer scope or administrator authority for shared scope, exact endpoint versions and a 1–2,000 character rationale.

Reuse existing quality/date/rationale fields and conflict records; add typed
targets rather than duplicate rubrics. Research observations retain publication,
observation and retrieval times separately. Freshness is recomputed on read.
Flags → confirmed/resolved/dismissed transitions remain auditable; automated
similarity is a candidate flag, not confirmation. Shared conflict projections
cannot reveal private endpoints. Mixed customer/shared conflict is customer-scoped
and visible only to that customer's authorized readers; it does not alter global
shared guidance without a separate public-safe shared conflict review.

## C09 — Projection/cleanup jobs (all stories)

**Constraint:** Job kind is index, invalidate or cleanup; state is queued, leased, completed, failed or unconfirmed; each lease is at most 30 seconds with a current token; each generation permits at most three attempts; commit requires the same source generation, contract digest and lease token captured at admission.

`retrieval_jobs` deduplicates source/generation/contract/kind. A lease can renew
only within the run's overall deadline and current authority; delayed writes fail
compare-and-swap. An ambiguous embedding operation sets unconfirmed and requires
an explicit operator retry with a new operation key. Only definitely undispatched
work and bounded idempotent fetch/cleanup may retry automatically. Cleanup does
not require the original user's ongoing membership to remove retired payloads.
`retrieval_embedding_operations` records the index job/generation/batch key,
reserved/dispatched/terminal state, bounded usage and provider receipt, using the
C07 operation-state enum but no research-run dependency. Query embedding records
use a fresh retrieval operation key and never retain raw query text. This ledger
is created with migration019 so index replay cannot duplicate an uncertain call.

## C10 — Refresh request and retention (US4)

**Constraint:** Refresh binds an exact research revision and admitted research request; unchanged content adds retrieval history without changing the claim date; interrupted raw bodies expire within 24 hours, retired derived payloads are removed within 60 seconds by a healthy worker, and content-free operational receipts expire after 30 days while decision audit remains.

Reuse research operations and jobs for refresh, avoiding a second queue. Due
maintenance changes no publication or approval and makes no external call.
Correction/supersession/retraction/withdrawal commits a generation/tombstone before
release checks; cleanup removes retired index text, embeddings, staging and
derived snapshots while retaining allowed decision audit and original 004 policy.
Do not delete an eligible historical original merely because its index changed.

## Migration and relationship order

1. **019**: vector extension, source/passages, contracts and projection jobs (C01/C02/C09).
2. **020**: private candidates, sanitized revisions, publications, lineage and decisions (C04/C05).
3. **021**: requests/runs/operations/observations, verified ingest links and conflict targets (C06/C07/C08/C10).
4. **022**: citation receipts and session dependencies, generation indexes and runtime grants (C03).

Runtime roles cannot install extensions or migrate. Original 002–004 tables stay
authoritative. Explicit upgrade tests verify 018→022 and fresh initialization.
Restore a matched disposable DB/store snapshot; rollback never drops populated
feature tables or silently resurrects old approved content.
