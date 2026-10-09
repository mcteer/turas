# 012 Governed Domain Contract

Version `product-gaps-v1`. This is a planned contract. All entry points use `lib/server/gaps`; the [data model](../data-model.md) and its C01–C16 constraints are normative.

## Authority and release

| Operation | Active internal member | Canonical active internal admin mcteer | Partner/inactive/cross-scope |
| --- | --- | --- | --- |
| Read currently eligible gaps, impact, counts, reports and permitted history | Allowed in current scope | Allowed in current scope | Uniform denial |
| Propose immutable gap/impact revisions and duplicate candidates | Allowed | Allowed | Uniform denial |
| Review/reclassify/retire impact; accept/reject/defer/dismiss/reopen gap; merge/split | Denied | Exact preview and rationale required | Uniform denial |
| Prepare deterministic draft report | Allowed | Allowed | Uniform denial |
| Approve report/customer disclosure, export, manual handoff/correction | Denied | Exact review and current eligibility required | Uniform denial |
| Cancel/reconcile a request | Own currently authorized request | Own currently authorized request | Uniform denial |

The reviewer predicate is current internal membership, active principal/session, administrator role and canonical `DEMO_IDS.mcteer`, all in the selected environment/workspace. A matching display name, customer account ownership, generic steward check or another admin is insufficient. Source permission is independent of reviewer privilege. Workers act under the admitted actor/session and revalidate before commit; a service principal is not a substitute reviewer.

No proposal changes accepted profiles, execution records, shared knowledge or source quality. Customer-independent canonical narrative is kept separate from customer impact. Source citations and customer details are only released through their authorized projection. All supported original source kinds are defined by C05; no generic uploaded text or generated report becomes a source.

## Transactions and source races

Use current repository lock primitives and preserve their existing order; introduce no opposing order into source writers. The new workspace relation-generation row serializes canonical assignment changes. All 012 operations acquire it before discovering assignments, after the existing authority prefix. The required order is:

1. Lock current workspace membership/principal/session/workspace authority using the existing prefix; check the 012 gate and authority before private discovery.
2. Lock the 012 workspace relation fence (shared for ordinary work, exclusive for merge/split); discover bounded, scope-checked identity/dependency headers only.
3. Lock all affected customer profile states in sorted UUID order. Discover the full original closure across the whole operation, not one customer at a time. Reject conflicting generation/digest/scope identities and C05/C10/C11 overflow.
4. Lock original source headers in the existing stable kind/revision order, followed by execution/baseline/engagement headers in their established order. Never acquire another customer's original locks after an execution lock. Re-read the closure; reject changed identities, state, generation, digest, accepted head, rights or quality/date validity.
5. Lock 012 gap/impact/report/review/job rows in stable table/UUID order. Re-read heads, expected versions, relation generation and dependency bindings; atomically persist decision, state, receipt and invalidation. Final projection is checked under the same fence.

Before implementation, prove this order against the actual reused source writers with barrier-controlled tests; if an adapter discovers a missing earlier lock, abort and restart as a new bounded transaction rather than upgrading locks out of order. Discovery may fetch header identities under authorization but must not release private text. Rate/receipt advisory locks use stable keys and cannot reverse the domain order. Lock/statement timeouts return safe retryable conflict states; no unbounded retries.

Every critical confirmation citation must pass the data-model quality rule independently. One good citation cannot compensate for a weak required customer/product citation. Shared knowledge retains original lineage/expiry, and product publication is not proof of a named customer's usage. Counts use batched current metadata checks with parity against full source release. Time-based freshness and shared-quality expiry are evaluated on reads even if no invalidation job has run.

Source correction/withdrawal, customer retirement, grant/membership changes, accepted-head changes and relation changes invalidate dependent previews/reviews through current checks immediately. Add dependency generation hooks at existing mutation paths where useful for cleanup and stale UI hints; hooks are not the only access boundary. Permission loss for one actor never globally purges valid workspace content.

## Gap and impact commands

- Creating or editing makes a new working revision. An existing reviewed revision remains the reviewed head until exact acceptance. Unknown dates/version/metrics stay explicit unknowns; empty required narrative is invalid, so an author uses an explicit unknown statement when appropriate.
- Acceptance advances the reviewed head with exact binding and rationale. Rejecting a proposal leaves the last accepted head unchanged. Self-authored acceptance requires explicit self-review acknowledgment. Other disposition actions do not accept edited working content.
- Defer binds a future revisit date; due dates set review flags without auto-reopening or resolving. Dismiss/reopen remain explicit. Metadata-only defer/dismiss/reopen may operate after source withdrawal but can release only safe identity/disposition, never invalidated prose.
- Impact proposal defaults to suspected. Confirmation requires accepted customer need plus current direct product limitation evidence. Resolution requires accepted customer-specific resolution evidence and known dates. Resolved episodes cannot become current again; recurrence is a new linked observation. A correction is a new reviewed revision with preserved predecessor history. Retirement removes a mistaken observation from current counting while retaining permitted lineage.
- Gap-kind/product reclassification is a new reviewed revision. A changed reviewed product/kind invalidates bound previews/reports; associated impact confirmation must pass the new product context before contributing. No cascading silent reapproval.

## Canonicalization and counting

Members propose candidate gap IDs and mappings; the service does not infer duplicates. Only mcteer can accept a C08/C09 preview. A merge requires an explicitly chosen reviewed survivor revision, identical kind/product, and exhaustive observation assignments. Aliases point directly to the active survivor. A split previews exact resulting content/source closures, preserves the original identity for one result and creates fresh additional identities; acceptance reviews these exact results and atomically partitions every observation, including retired/history observations. Any missing/duplicate assignment, overlap race, new observation, changed source/head or cycle rejects the entire transaction. Follow-on correction uses a new explicit operation; there is no history rewrite or unmerge that copies impact.

`gap-impact-v1` implements the data-model sets, including confirmed suppression of suspected-only and nonadditive resolved history. Store independently authored expected sets in fixtures. Never use counts from a report cache, the first page or a derived summary as authoritative totals. Current canonical graph and authorization apply to both trend cutoffs; missing history or a changed comparable evidence set makes the trend unavailable with a safe reason, not a fabricated delta. Compare source identity/generation/eligibility sets; changes from normal reviewed observation transitions can produce a delta when both cutoffs are reconstructible under the same eligible source set. No hidden-customer omission number is returned.

`gap-order-v1` follows the exact data-model tuple. Return the factors and freshness flags with each authorized row, the method version and cutoff. Non-product kinds have distinct labeled lists; product-gap portfolio totals exclude them. Dismissal removes a gap from default ordering but does not erase its historical/customer impact.

## Idempotency, limits and disabled operation

Persist operation-scoped request receipts keyed by actor/environment/workspace, operation and C01 requestKey. Hash canonical input including expected versions, preview, disclosure and references using a versioned environment keyring. Same key/different input returns conflict. Exact completed replay rechecks current authorization, returns only a permitted minimal receipt and never reruns the write. Expired previews do not invalidate a successful original receipt; changed role/source can still restrict its projection. Unknown acknowledgment reconciles by opaque identity, never by resubmitting cached prose. After C15 receipt expiry, a keyed tombstone rejects reuse without reviving results. Retain verification keys while any tombstone depends on them.

Use transactional persisted C16 admission; report preparation consumes mutation and preparation allowances. Reconciliation consumes reads; exact successful mutation replay consumes read admission, not a second write quota or preparation slot. Cancellation is idempotent and available despite new-work rate exhaustion. Create commands use expectedVersion 0 as the explicit nonexistence precondition; persisted versions begin at 1. Concurrent duplicate request admission yields one result. All other writes require the current positive version.

`TURAS_012_DISABLED=1` or unavailable required schema blocks new authoring, previews, review, preparation, export admission and handoff. It permits current-authorized minimal metadata, receipt reconciliation, cancellation and maintenance; private prose/export bytes remain withheld. Old-schema checks fail safely before querying absent tables. Initial 048 authoring is testable separately; report operations require 049. C16 read/body/count bounds remain enforced. Do not change unrelated feature schema gates.

Use safe errors: `not_found` for forbidden/unknown objects; `invalid_input`, `stale_version`, `preview_expired`, `source_unavailable`, `scope_too_large`, `comparison_unavailable`, `rate_limited`, `feature_disabled`, `schema_unavailable`, `request_conflict`, `receipt_expired`, `preparation_failed` only after appropriate authorization. Details never contain source titles, hidden IDs, SQL or credentials. Telemetry is operation category, safe opaque ID, duration, bounded counts and outcome; no customer names, prose, URLs, request bodies or artifacts.

Implementation detail for the common-narrative boundary: gap acceptance previews
require `customerIndependentAcknowledgment: true` in addition to the authoring
acknowledgment. The exact binding and immutable decision retain this reviewer
acknowledgment. This is an explicit human disclosure check, not automated proof
that free text is safe. Impact decisions do not attest common-narrative disclosure.
