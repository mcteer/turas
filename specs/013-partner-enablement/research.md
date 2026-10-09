# Research: Partner Delivery and Enablement

Date: 2026-10-09. Baseline: merged `main` at `2b93b225a9a2a12f9c7af3b423613d728afafb91` (012, PR 23). Two read-only research reviews covered delivery-domain reuse and knowledge/access boundaries, as required by the planning skill. No external integration, provider call or hosted inspection was needed.

## 1. Reuse delivery domains

**Decision:** Add a `/partners` workspace with current assignments and links to existing plan, engagement/execution, accepted support and knowledge screens. Add governed cursor-based engagement discovery to the existing service, not a copy of accepted delivery state.

**Rationale:** `lib/server/plans/policy.ts`, `commands.ts` and `read.ts` already permit partners' own delivery proposals and accepted delivery reads. `lib/server/execution/policy.ts`, `records.ts` and `time.ts` distinguish permitted contributions from internal review; time also requires workforce and dated partner eligibility. `lib/server/support/policy.ts` and `projection.ts` intentionally make partner support read-only. `lib/server/engagements/read.ts::listEngagements` stops at 50 without a cursor. `lib/server/access/customers.ts` pages references, but new aggregation must acquire live authority rather than trust a cached session.

**Alternatives considered:** A second delivery system duplicates authority. Broader support authoring changes 010 without an authorized requirement. Fetching every customer/engagement creates unbounded fan-out; use separate customer and scoped engagement pages with on-demand detail.

## 2. Customer guides and shared knowledge

**Decision:** Manually authored guides bind exact accepted delivery-plan revisions and contain lessons/checkpoints. Cite exact 005 published knowledge revisions without creating a second platform publisher or copying private lineage.

**Rationale:** `lib/contracts/knowledge.ts` and `lib/server/knowledge/read.ts` already expose sanitized published entries to all active members. A guide assembles a method for one customer engagement and cannot authorize sharing its prose elsewhere. What/how/why, prerequisites, alternatives, limitations and validation fit the existing method without model generation.

**Alternatives considered:** Mixing customer submissions into the shared catalog blurs publication rights. Generated lessons need additional advisory lifecycle and live evaluations. Adaptive-learning automation remains 014.

## 3. Individual assignments and review

**Decision:** Internal members draft guides. Canonical active internal administrator `mcteer` publishes/retires guides, assigns individuals and verifies or requests changes to checkpoint submissions. The user confirmed checkpoint verification on 2026-10-09. Preserve each existing domain's authority.

**Rationale:** 008/010 already use canonical mcteer review. A checkpoint records an evidenced demonstration, separate from delivery acceptance. `customer_grants` belongs to individual membership/customer pairs. Organization membership is a prerequisite, not a grant. Assignments bind the current organization, membership authority generation and grant revision; reactivation cannot silently resume them.

**Alternatives considered:** Self-attestation was offered and not selected. Delegated mentors need additional decision-authority administration. Organization-wide grants contradict the existing boundary.

## 4. Original evidence and synchronous eligibility

**Decision:** Reuse `lib/server/plans/sources.ts`, retrieval fences and knowledge lineage; add narrowly scoped accepted execution-record references for demonstrations. The accepted-plan binding and all selected supporting sources are critical. If one is ineligible, withhold the whole dependent guide/submission body; retain authorized minimal identity/history.

**Rationale:** `profiles/policy.ts`, `plans/policy.ts`, `retrieval/policy.ts`, `retrieval/fences.ts` and `profiles/eligibility.ts` already check live environment/customer/audience and original generation/digest. Shared lineage can become invalid when its contributor loses authority. An indexed passage or another actor's citation receipt cannot replace original checks. Acquire existing actor/source locks in their established order; recheck under publication/verification and content-release fences. Cleanup is not the access gate.

**Alternatives considered:** Publication-only checks, copied excerpts or eventual revocation allow stale release. Whole-revision withholding is bounded and clearer than partial lesson repair. No arbitrary URL evidence, raw uploads or new ingestion pipeline is needed.

## 5. Immutable learning and bounded retention

**Decision:** Store immutable guide/submission revisions and decisions, separately deletable payloads, current heads and minimal request receipts. Previews bind actor/session, exact content, sources and action. Progress uses required checkpoints on one current eligible assignment; replacement starts at zero.

**Rationale:** Bounded synchronous database commands need no new generation jobs or private object store. Original closure is limited to 200 dependencies, pages to 50 and active assignments to 100 per member/customer. Obsolete payloads expire after 90 days; globally ineligible payloads within 24 hours. Permission loss denies that actor without deleting valid team content. Receipts minimize after 365 days while environment-lifetime deduplication tombstones remain.

**Alternatives considered:** Mutable completion loses evidence. Auto-carrying progress across revisions misrepresents learning. The export storage/keyring machinery in 012 is unnecessary for bounded JSON/text with no attachments or exports.

## 6. UI and validation

**Decision:** Use existing visual design, request-time domain APIs, no-store responses, protected-content clearing before revalidation, 15-second polling and focus/visibility/late-response guards. Browser persistence contains only opaque request identities. Validate with CLI Playwright/WebKit in all four existing projects, synthetic owned fixtures, exact manifests, load and forward recovery.

**Rationale:** Installed Next layout/navigation guides describe persistent layouts, so shell checks cannot authorize subsequent reads. Existing `knowledge-library.tsx` offers focus/no-store patterns. Gap runners offer ownership/evidence conventions but require deliberate review of cleanup and async shutdown before reuse. Work remains in the canonical checkout. Agent behavior is unchanged, so no new paid evaluation is required.

**Alternatives considered:** Hidden links are not authorization. A local smoke check cannot establish hosted rollout. Sibling worktrees violate the user's workspace preference.

All implementation decisions are resolved. No constitution exception or integration installation is proposed.
