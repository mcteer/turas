# 012 Research Decisions

Research completed against the checked-in source on 2026-10-08. It was read-only; it establishes design inputs, not passing implementation tests. The user's single consequential clarification is recorded in [spec.md](spec.md).

## Domain and decision authority

**Decision:** Add `lib/server/gaps/` and a matching `lib/product-gaps/` pure domain. Active internals can propose/read permitted data; canonical active internal admin mcteer alone decides. Use the authority prefix in `lib/server/profiles/policy.ts` and the precise reviewer predicate in `lib/server/reports/policy.ts`/`support/policy.ts`.

**Rationale:** 011 assigns a customer account owner; 012 triages cross-customer product needs. Its review authority must not inherit expansion ownership, stewardship or arbitrary administrator status. Reject partners before record discovery and recheck live principal/session/membership under locks.

**Alternatives:** Reusing 011's reviewer policy violates the clarified decision. Reusing `requireSteward` grants a wider role. A new product-owner assignment subsystem adds unrequested administration.

## Evidence and multi-customer locking

**Decision:** Adapt `plans/sources.ts`, `retrieval/policy.ts`, `execution/sources.ts`, and the conflict-detecting original union in `expansion/dependencies.ts`. Use the strict every-critical-citation checks in `expansionQualificationChecks`, not only the generic any-adequate-source evaluator. Store original identities/locators and classifications. Build the complete bounded metadata closure before globally ordered source/head locks.

**Rationale:** One good source cannot hide a contradictory critical source. Plans and milestones do not establish actual customer outcomes. Source dates/assessment validity must be evaluated at release. Calling existing customer-specific adapters sequentially in a portfolio can invert lock ordering; a 012 batch adapter must preserve one global union.

**Alternatives:** Reports/gap summaries as substitute evidence lose original lineage. Copying support's older dependency deduplication can ignore conflicting revisions. Worker-only invalidation admits stale data. New RAG indexing is unnecessary.

## Canonicalization and distinct impact

**Decision:** Implement versioned deterministic merge/split and count methods. Merge into an explicit survivor. Split retains the original identity for one explicit result and creates additional identities; every observation has one resulting assignment. Count only reviewed eligible observations by `customer_references.id`. Confirmed current suppresses suspected-only; historical resolution may overlap a later recurrence and is labeled non-additive. Count before disposition filtering.

**Rationale:** No existing canonical gap/count service was found. Names/domains and repeated notes cannot establish unique customer identity. A resolution closes one observation/episode. Canonicalization is a reviewed correction, not an agent inference.

**Alternatives:** Fuzzy automatic merging, alias count addition, implicit copies on split and a single sum of all categories inflate impact. A split parent that redirects to multiple children complicates every future lookup; preserving one original identity is simpler.

## Counting scale and historical comparisons

**Decision:** Use batched metadata eligibility and set-based distinct grouping before pagination, bounded by C10; verify parity against original-source readers. Compare both dates under the same current access, canonical assignments and eligible-source set. Unknown/purged comparison history returns unavailable.

**Rationale:** 011's customer list strategy of loading every payload before pagination is inappropriate for 2,000 gaps/10,000 observations. Cached counts cannot be the release authority. Recomputed history must not masquerade as a snapshot of former visibility.

**Alternatives:** Materialized-only totals lag withdrawal. Full private payload loading for counts increases exposure and latency. Public cohort thresholds are inapplicable to this internal-only feature; future shared statistics need separate privacy design.

## Report contract and private artifacts

**Decision:** Define independent 012 report/review/disclosure/job/artifact records. Use one deterministic structured document for in-app view, Markdown and JSON. Adapt canonical serialization, exact preview/review, staged-file lifecycle and chunk release fences from `lib/server/reports/`; reuse its low-level environment-marked private store with a separate 012 catalog.

**Rationale:** 009's report tables require one customer, executive periods, brands/mail and PDF/PPTX. Its published partner projections and review-ready downloads are incompatible with 012. Existing product-gap templates mandate sections, not a new renderer. JSON must contain the same reviewed audience projection as Markdown, never extra private lineage.

**Alternatives:** Extending 009's `ReportDocument` and release service risks broadening partner access and coupling unrelated providers. Adding PDF/slides or remote rendering is unnecessary for 012's engineering documents. New storage infrastructure is not required.

## Handoff, disclosure and source changes

**Decision:** Only mcteer exports or records manual handoff. Bind exact content/artifacts, scope, audience, source/relation generations and per-customer disclosure acknowledgment. Human-reported follow-up/correction appends; initial handoff requires current report eligibility. External references are inert. Withhold dependent prose/downloads on reads and synchronously mark derived records during source mutation; retain minimal history and flag human follow-up.

**Rationale:** Existing `support/escalation.ts` demonstrates explicit human-reported reference semantics. A receipt is not a provider send or customer resolution. Already downloaded files cannot be recalled. This feature introduces no named external integration, so registry installation and provider costs are unnecessary.

**Alternatives:** 009 send/outbox states imply actual transmission. A disclosure checkbox unbound to report/audience versions is insufficient. Report approval does not authorize public reuse.

## Reconciliation, UI and retention

**Decision:** Adapt 011's immutable receipts, keyed expired-request tombstones and opaque pending UI identity (`app/_components/expansion/pending.ts`). Use fresh source fences for payload reads and every download chunk. Apply the explicit 5-minute/24-hour/30-day/90-day/365-day schedule in C15 with exact generation/lease/object checks; preserve minimal canonical links.

**Rationale:** 009's client command map retains complete request bodies and violates 012's pending-storage requirement. Existing exact object manifests and cleanup leases support crash-safe deletion. Permission loss for one actor must not purge content still valid for other internal users.

**Alternatives:** Browser-retained private payloads, indefinite derived artifacts, broad directory deletion or cleanup authorization derived from old approvals fail lifecycle requirements.

## Framework and implementation boundary

**Decision:** Preserve the current Node 24 / Next.js 16 / React 19 / TypeScript / PostgreSQL 17 stack. Add no agent behavior, model calls, integrations or dependencies. Read installed Next.js guides before route/UI implementation. No eve authoring is planned; read its routed docs first if implementation discovers an unavoidable eve change and resolve scope before adding it.

**Rationale:** Existing domain, worker and browser infrastructure cover the deliverable. Turi model changes or automated clustering were not requested. Legacy review identifies the gap registry as greenfield, not completed demo code to import.

**Alternatives:** A model-heavy advisory path or external engineering connector would expand authorization, costs and acceptance beyond this slice.
