# Data Model: Product Expansion

Contracts: `expansion-v1`, `expansion-ranking-v1`, `expansion-advice-v1`.
This is a design, not an applied schema. Migrations 046/047 are provisional until
implementation rechecks the manifest on current main (present maximum: 045).

## Entities and persistence

| Entity / proposed table | Identity and relationships | Mutable state / immutable history |
| --- | --- | --- |
| `expansion_account_owners` | One environment/workspace/customer; nullable owner membership; customer-wide across workloads | Assignment version and generation; canonical mcteer-only changes; append assignment events |
| `expansion_owner_events` | Exact assignment before/after, actor, time, rationale payload reference | Immutable event identity; purgeable rationale |
| `expansion_scopes` | Unique environment/workspace/customer/workload, with one null-workload row | Scope generation; no change of customer/workload identity |
| `expansion_hypotheses` | UUID in one scope; original creator; immutable canonical product key and opaque keyed duplicate-identity digest; problem key in purgeable payload | Working/decided revision heads, last decision, disposition, optimistic version; product/problem correction creates a new related hypothesis |
| `expansion_revisions` | Monotonic per-hypothesis ordinal, author, original digest, source digest, vocabulary/ranking versions, timestamp | Immutable metadata; prose and source locators in purgeable `expansion_payloads` |
| `expansion_decisions` | Hypothesis, exact revision, assignment generation, reviewer, outcome, original digest and timestamp | Immutable decision identity; rationale/checkpoint in purgeable payload |
| `expansion_dependencies` | Revision/attempt plus original kind/revision/generation/digest; indexed reverse lookup | Immutable selected lineage; lifecycle changes cause invalidation, never relabeling |
| `expansion_delivery_links` | Hypothesis revision and exact plan revision, engagement or baseline | Same-customer selected references; never changes original acceptance/state |
| `expansion_command_receipts` / `expansion_expired_command_keys` | Actor/environment/workspace/request UUID; unique admission and input digest | Outcome IDs while retained; opaque uniqueness fence after expiry |
| `expansion_cleanup_jobs` | Source/record/payload generation and lease identity | Bounded retry/lease and content-free completion state |
| `expansion_advice_bindings` | Fresh owned conversation, customer/workload, internal audience, selected engagement/hypothesis IDs | Immutable binding; one feature per conversation |
| `expansion_advice_attempts` / `expansion_advice_steps` | Response attempt plus native session/turn/step ordinal | Persisted admission, usage, cancellation and terminal state; purgeable context/result; never retry ambiguous dispatch |

Composite foreign keys and scoped unique indexes must prevent cross-workspace,
customer and environment relationships even for malformed direct inserts. Current
owner membership must be internal and in the same workspace; inactivity is checked
at every operation. Migration does not assign existing customers an owner.
Runtime may append revisions/decisions through guarded domain transactions but may
not update/delete immutable metadata. Narrow maintenance functions purge payloads
and minimize audit; request handlers never migrate or bypass source approval.

## Normative validation constraints

These constraints are quoted in the implementation tasks. Structured objects are
strict: unknown keys, duplicate identities and non-finite numbers are rejected.

- **C01**: "IDs are UUIDs; versions are nonnegative safe integers; digests are 64 lowercase hexadecimal characters; scope identity and internal audience are immutable."
- **C02**: "One current owner membership or null exists per customer; only canonical active internal admin mcteer changes it; only the assigned active internal member makes disposition decisions; assignment rationale is 1–2,000 characters."
- **C03**: "Product key is 1–80 lowercase ASCII characters matching [a-z0-9][a-z0-9._-]*; problem key is 1–120 characters with the same alphabet; display labels and titles are 1–200 characters; product version label is optional and at most 100 characters."
- **C04**: "Intent is new_product or usage_expansion; narrative fields are 1–2,000 characters; current use is evidenced with 1–20 source IDs or unknown with a reason; absence is never an adoption state."
- **C05**: "Benefit is measurable_target, qualitative_outcome or unknown; measurable_target requires metric, unit and proposed target text of 1–200 characters plus a validation criterion; unknown requires a reason; baseline is evidenced or explicitly unknown."
- **C06**: "There are 0–10 prerequisites, 0–10 constraints and 1–5 alternatives; one alternative is retain_current_practice; each prerequisite is satisfied, validation_needed or blocked, and includes evidence or a reason; validation_needed requires an active internal owner and a concrete validation step."
- **C07**: "Next step includes 1–2,000-character action and validation criterion; responsible owner is an active internal membership or unknown with a reason; nextReviewDate is a real UTC calendar date from today through 366 days ahead at save; observed dates cannot be future."
- **C08**: "A revision has 0–20 distinct direct source references, 0–10 selected engagement IDs, 0–10 delivery links and at most 200 distinct transitive dependencies; zero sources permits discovery-only prose with no factual assertion; a request body is at most 65,536 UTF-8 bytes."
- **C09**: "Disposition is proposed, qualified, deferred or dismissed; every decision has a 1–2,000-character rationale; defer requires a future UTC revisitDate within 366 days; reopen returns to proposed; all decisions name the current working revision and expected hypothesis and assignment versions."
- **C10**: "Qualification requires eligible accepted customer-need evidence, a non-unknown benefit and validation criterion, current decision-critical product evidence, no unresolved material contradiction, no blocked prerequisite and no unowned validation-needed prerequisite."
- **C11**: "List limit is 1–50 with default 20; cursors are at most 4,096 characters, expire after five minutes, and bind actor, scope, filters, generations, ranking version and as-of time."
- **C12**: "Advice permits six model steps, six reads, 8,192 total output tokens per step including reasoning, with a requested provider cap of 4,096, 24,576 cumulative context bytes, 200 dependencies, five admissions per rolling hour/user, one active user/scope attempt and a 120-second dispatched deadline; preparation expires after five minutes."
- **C13**: "Advice returns zero to five proposals; saving requires the owner's completed retained attempt, exact output digest and suggestion index 0–4; every saved result is proposed."
- **C14**: "Duplicate identity is scope plus canonical product key plus problem key; a second distinct hypothesis requires explicit acknowledgement of the current related-set digest and a 1–2,000-character distinction rationale."
- **C15**: "Invalidated dependent payloads purge within 24 hours; unreferenced abandoned or superseded working drafts expire after 90 days; assistant payloads expire after 30 days; content-free receipt/decision detail expires after 365 days except referential metadata needed by retained records; opaque expired-key fences last for the environment lifetime."
- **C16**: "Advice preparation selects 0–20 distinct hypothesis UUIDs in the same scope; the question is 1–2,000 characters; no attachments or unselected history enter the bound request."

Narrative fields in C04 cover problem, customer need, customer benefit rationale,
constraints, alternatives and engagement fit. Each factual assertion is a structured
`{classification: accepted_fact | attributed_observation, text, sourceIds}`; each
assumption/unknown has `{text, reason}`. An attributed observation may retain weak
but verified independent public research for discovery, with publisher/date/quality
and an explicit caveat; it cannot satisfy a qualification-critical assertion. Labels, hypotheses
and proposed targets do not become customer facts. Qualified customer need must
reference an accepted profile claim/objective or approved customer excerpt, not only
an independently researched case study. Use original scope/integrity/lifecycle checks for every citation; apply
`currentFactEligible` and the evidence policy to accepted-fact and all
qualification-critical assertions. Do not apply its R/quality threshold to mere
attributed discovery observations. Qualification additionally requires decision-critical
product evidence within its review window, with exact direct support, and no expired
review. Usage-expansion qualification additionally requires eligible accepted actual use
of the same product in scope. New-product qualification must not contradict accepted
actual use for that scope; unknown adoption remains unknown and the next step
explicitly verifies it. Pricing/availability use 14 days; capability/practice uses 30 days. Current
undated documentation may use its verified observation-at-retrieval date for what
was observed, never as an invented publication date. Product claims on public
customer stories do not establish authoritative product limits or availability.

## Product identity and related hypotheses

Reuse the existing profile `productKey` grammar and product-use states
actual/evaluating/planned/retired/unknown. Add a bounded checked-in alias vocabulary
in `lib/expansion/products.ts`, version `expansion-products-v1`, at most 100 entries,
20 aliases per entry and 200 characters per alias. An empty alias map is valid;
known profile keys still work. Initial aliases require an eligible published
knowledge reference or verified official naming source recorded with the mapping.
This vocabulary only reconciles names; it does not assert availability, adoption or
fit. New well-formed keys may be authored with a display label and product evidence;
no catalog-management UI or paid discovery is introduced. Duplicate aliases are
rejected. Retirement is a vocabulary flag, not deletion or an inferred customer
state; a retired entry cannot newly qualify until a supported replacement is used.
A vocabulary update never silently remaps stored record identity.

## State and decision semantics

Saving creates a working revision and increments hypothesis/scope versions. It does
not change the last decided head or disposition. A qualified head with pending edits
is shown as "Qualified revision N; Proposed changes N+1"; only N was qualified and
the candidate requires review. Dismissed/deferred dispositions survive edits and new
evidence. Their return to proposed requires owner `reopen`; they cannot directly
qualify from dismissed/deferred. Owner `qualify` may act on proposed or qualified
for an exact re-qualification; `defer`/`dismiss` may act on proposed/qualified or
update the same disposition. Reopen requires deferred/dismissed. Invalid transitions
return a conflict. Repeated identical keys return the same outcome.

`reviewRequired` is derived, not a replacement disposition: overdue next review or
revisit, stale critical evidence, pending edit of a qualified head, changed source
closure, retired product key or changed/inactive/missing owner. It never renews or
reopens a record. Assignment changes increment a customer-level generation so all
workload decisions and prepared advice become stale immediately. Older decisions
retain their historical reviewer; the new owner must explicitly re-qualify.

Qualified records use the decided head for comparison; proposed use the working
head. Deferred/dismissed have separate filters and retain the last decided head.
Pending-edit and source-status badges appear independently. All projections, even
history, obey original source eligibility; invalid prose is replaced with a minimal
metadata placeholder. Defer/dismiss/reopen remain possible through a fresh metadata
preview when sources are unavailable, without echoing hidden prose. Qualification
requires a full eligible preview. Correcting an immutable product/problem identity
creates a related proposed record; the old record is dismissed by the owner if appropriate.

## Deterministic ordering

`expansion-ranking-v1` sorts active proposed/qualified records by this ascending
lexicographic tuple; render each component in the UI:

1. Review required first, with reasons; then current candidates.
2. Benefit specificity: measurable_target, qualitative_outcome, unknown.
3. Prerequisite readiness: all satisfied (including none), validation_needed, blocked.
4. Evidence readiness: qualification_supported, discovery_only, unavailable.
5. Oldest next review date, then immutable created timestamp and UUID.

These are explanatory categories, not a numeric opportunity score. A qualification
blocker always remains visible even if benefit specificity orders an item earlier.
An ineligible payload has unknown benefit and prerequisite categories and unavailable
evidence; do not expose stale cached inputs. Deferred/dismissed lists sort by due
revisit (if any), decision timestamp and UUID. A cursor pins server as-of time for
temporal ordering, but source/owner authorization is rechecked now and generation
changes reject the cursor. No undisclosed candidates or cross-customer totals enter ranking.

## Concurrency, locking and lifecycle

Use the existing `lockProfileActor` authority prefix. Discover only scoped metadata
for the current/target owner, acquire all affected membership locks in sorted order
before profile/customer locks, and recheck the assignment afterward. Acquire the
actor request-key admission mutex next. Source-bearing commands then lock original
source headers sorted by kind/ID, selected engagement/plan/baseline/execution heads,
and finally expansion assignment/scope/hypothesis heads. Source-agnostic assignment commands use the same
prefix and assignment mutex; they never call backward into source/engagement locks.
Advice uses existing conversation/response lock order before its feature-bound
mutation phase. Verify concrete lock order with existing callers before coding.
No provider I/O under DB locks; use only existing bounded serialization retries.

A decision preview binds revision, versions, assignment generation, source/related
set digests and preview kind. Commit recomputes all relevant values under locks.
Dependency union rejects repeated kind/revision with differing generation/digest;
it does not take the first match. Persist original IDs, not transient citation receipt
TTL, and include transitive shared/private plan lineage where authorized. Shared
knowledge is validated through its publication policy; private lineage is not shown
in ordinary citation payloads.

Source invalidation adds reverse-indexed cleanup jobs, but current read/source fences
remain authoritative when fanout or maintenance lags. Prose, reason text, titles,
labels, locators, requests, outputs and native projections are purgeable. Decided
revision payloads remain while current and eligible; the 90-day abandoned-draft rule
does not delete a retained decided head. Earliest invalidation/retention deadline wins.
365-day minimization removes unneeded record/customer IDs from expired receipts and
keeps only an opaque keyed actor/environment/workspace/request-key fence; rotation
must preserve old lookup. Cleanup and replay share the admission mutex. Source loss
also retires feature-native sessions without restoring content or re-running a model.

Dismissal suppression survives prose cleanup through scoped opaque duplicate-identity
digests and retained categorical record/decision metadata. A purged related record
exposes only permitted disposition/ID, never its old problem text. Hash-key rotation
retains older lookup versions; no automatic merge, reopening or recreation occurs.

Delivery links use exact current accepted plan revision (plan ID + revision ID),
current selected engagement (ID + active baseline ID + execution generation), or
current milestone baseline (ID + accepted plan revision). Referenced workload must
match the scope or be customer-wide; customer-wide expansion may select several
workloads explicitly. Replaced or withdrawn references trigger review and withhold
dependent prose; a display link is never a call into acceptance/creation.
