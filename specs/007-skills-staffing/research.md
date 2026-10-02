# Research: Skills, staffing and services operations

Date: 2026-09-30. This is design research, not implementation or validation evidence.
Only repository/package sources and public framework documentation were inspected;
no database connection, private workforce input or live model call was made.

## R1 — Scope and human authority

**Decision**: Implement the five stories in spec.md; only the active canonical
`mcteer` principal with current internal/admin membership may manage workforce
records, confirm allocations or use finance operations. Keep staffing and finance
predicates separate even though the authorized identity is identical. No delegation
or capability-administration table/UI in 007.

**Rationale**: The user explicitly selected `mcteer` only. Broad customer access in
`lib/server/access/policy.ts` must not imply personnel or financial authority.
`lib/server/bootstrap-ids.ts` provides the canonical identity; check it together with
current session/member/principal/workspace state, not a caller-provided username.

**Alternatives**: Delegated capability records were considered and rejected by the
clarification. Ordinary employee or all-admin decision rights are not authorized.

## R2 — Workforce imports need a separate security and storage boundary

**Decision**: Add workspace-scoped workforce sources and import rows, without customer
or conversation ownership. Reuse the isolated scanner/container/store interfaces,
not customer artifact intake or selections. Use a separate
`TURAS_WORKFORCE_STORE_ROOT` and its own orphan reconciliation.

**Rationale**: `lib/server/artifacts/{intake,policy,jobs}.ts` assumes customer/owner/
steward authority. `artifacts/cleanup.ts::reconcileArtifactOrphans` recognizes only
artifact intent/version owners and would remove unrecognized workforce objects in
that root. Classification alone cannot establish personnel isolation.

**Alternatives**: A synthetic customer for all personnel or a new label on customer
artifacts would contaminate context/retrieval and expose scope/count side channels.
A second scanner service is unnecessary: reuse existing images and interfaces.

## R3 — Structured CSV/XLSX extraction, exact identity mapping

**Decision**: Extend `packages/artifact-extractor/src/{main,spreadsheet,text,types}.ts`
with an explicit versioned structured-import mode while preserving 004's output.
Retain typed cells, blanks in the mapped range, date system, shared/ordinary formula
markers, hidden/merged flags and complete sheet/row inventory. Exact resource/skill
IDs or explicit reviewed mapping are mandatory; formulas never execute or become
accepted identity/level/date values through cached results.

**Rationale**: Existing locators are suitable, but text extraction loses typed dates,
CSV omits blank values and shared formulas need explicit detection. Corrected literal
values create candidate revisions retaining original cell provenance. Partial or
oversized extraction is non-approvable until replaced by a complete bounded source.

**Alternatives**: Model mapping and name similarity are unnecessary and unsafe for
canonical personnel identity. Manual entry remains possible with dated accountable
assessment notes, not an evidence-free approval bypass.

## R4 — Existing engagement and baseline identity

**Decision**: Demand references `engagements`, `milestone_baselines`, the exact plan
revision/digest and work-package key. Use `lib/server/engagements/read.ts` and the
plan-source resolver to validate current readable accepted content. No duplicate
engagement store and no conversion of profile engagement-reference claims.

**Rationale**: 006 persists work packages in `milestone_baseline_payloads` and updates
`engagements.active_baseline_id` only on exact acceptance. Working-plan edits do not
replace the accepted baseline. Baseline replacement flags existing staffing as
needs-review; allocations remain capacity-consuming until explicitly released or
atomically replaced.

**Alternatives**: Reading the working plan would turn an unaccepted edit into staffing
input. Automatically remapping matching work-package names is not an exact decision.

## R5 — Local intervals and deterministic arithmetic

**Decision**: Use exact integer minutes and half-open resolved instant intervals.
Add the exact pinned `@js-temporal/polyfill` 0.5.1 dependency during implementation
only, confined to calendar/domain code. Reject invalid, nonexistent or ambiguous
local endpoints unless a valid explicit offset resolves the ambiguity. Persist local
input, IANA zone, resolved UTC endpoints and runtime timezone-data metadata.

**Rationale**: The installed runtime did not expose global Temporal; the project
requires Node 24, so implicit runtime availability is not a contract. The
[TC39 ZonedDateTime documentation](https://tc39.es/proposal-temporal/docs/zoneddatetime.html)
describes explicit rejection for ambiguous local times and offset conflicts. The
[polyfill package](https://github.com/js-temporal/temporal-polyfill/blob/main/package.json)
provides a reviewed package boundary. Installation, lockfile/license review and Node
24 validation remain implementation tasks; nothing was installed during planning.

**Alternatives**: `Date` parsing and SQL timezone conversion can silently normalize
ambiguous wall-clock input. Writing a new timezone engine is disproportionate.
Compute money with integer minor units and BigInt intermediate arithmetic; no money
library, FX feed or browser floating-point calculation is authoritative.

## R6 — Future scheduling and evidence freshness

**Decision**: Availability is an observation made at/before now plus an explicitly
certified future calendar interval. Its age is evaluated at confirmation time using
the seven-day window (recent ≤7d, aging ≤14d, stale beyond14d or overdue review).
The calendar must cover the entire requested interval. Competencies use the 90-day
window and any earlier explicit next-review cutoff through the work interval.

**Rationale**: Requiring an availability observation to be fresh on a date 13 weeks
away would prevent useful advance bookings or encourage future-dated evidence.
Current review of a known future schedule is different from pretending future work
already happened. New source/calendar changes flag confirmed bookings for review;
execution-time work-log checks belong to 008.

**Alternatives**: Stale evidence cannot be silently accepted, and an approval timestamp
cannot reset assessment age. All future capacity as unknown is unnecessarily limiting.

## R7 — Exact decisions and lock order

**Decision**: Confirmation/amendment uses a short transaction with current authority
locks, the plan lock before original-source headers, engagement/baseline, staffing
demand, sorted workforce source/competency headers, sorted resource headers and
resource-date rows, then allocation/preview/receipt rows. All capacity-changing
operations use the same resource ordering; resource-only writes never acquire plan
locks afterward. Demand totals and resource totals are both checked.

**Rationale**: 006 plan acceptance locks plan → original sources → engagement. The new
path must not reverse that order. Shared authority/plan reads avoid unnecessary
workspace serialization. Resource-header locking serializes calendar edits and
competency withdrawal with capacity decisions; bounded daily rows make occupancy
explicit. Source lifecycle writers mark their generation only and enqueue derived
invalidation, never acquire plan/demand locks in reverse order.

**Alternatives**: Read-then-write capacity is racy. Locks held across scanner/provider
IO are prohibited. Reservations do not hold exclusive capacity or become commitments.

## R8 — Economics are reproducible planning scenarios

**Decision**: `staffing-economics-v1` uses confirmed planned minutes, effective loaded
hourly cost rates, entered contracted revenue and nonlabor cost. Store exact input
revisions, resolved period and rounding. Display service-rate revenue separately as
a hypothetical estimate; never substitute it for contracted revenue. Allow supported
single-currency scenarios only. `mcteer` explicitly approves the formula/input policy;
unapproved policy and missing inputs remain visibly unvalidated/incomplete.

**Rationale**: Product blueprint metrics separate planned allocation from actual time,
contribution from profit, and staffing from customer outcomes. 008 owns actuals/ETC.
Legacy `lib/demo/{metrics,services-plan}.ts` and arithmetic tests supply boundary ideas,
not rates, staffing fixtures, approved economic policy or production claims.

**Alternatives**: Importing demo annual P&L, payroll assumptions or margin targets
would expand 007 and double-count costs. No financial integration is needed.

## R9 — Turi reads current authorized results

**Decision**: Add a fresh immutable staffing binding with operational or finance mode,
customer/demand and optional scenario identity. Provide bounded read-only domain tools
and a staffing explanation skill. Extend existing conversation fences, native output
release/replay and model-step admission; ordinary/planning/research chats receive no
workforce context. Current `spacexai/grok-4.7` and `reasoning: low` stay unchanged.

**Rationale**: Installed eve `docs/{tools/overview.mdx,concepts/context-control.md,
evals/overview.mdx}` documents typed tools, contextual capabilities and real-session
evaluation. Existing 006 model-budget, dispatch and dependency receipts provide local
patterns. Personnel files never enter a sandbox or general retrieval index.

**Alternatives**: A separate model, freeform personnel search, an approval tool or a
second arithmetic engine is unnecessary. No new external integration or subagent is
needed in the product. Planning research agents are not product runtime additions.

## R10 — Bounded rollout and evidence

**Decision**: Propose explicit migrations 032–034, feature-local readiness, a write/
advisory intake switch and narrow grants. Use the owned-clone lifecycle in
`scripts/plan-eval-environment.ts` through a 007 wrapper that also isolates workforce
store/eve state. Test empty/031 upgrades, recovery, source/authority races, eight
actual-output cases, four WebKit projects and representative load before Preview.

**Rationale**: Production is live and out of bounds. Preview was last verified at031;
that is historical evidence, not permission to skip a fresh read-only inspection.
The 006 CI failure showed generic suites must exclude clone-only files while the
explicit dedicated suite enumerates and verifies their complete coverage.

**Alternatives**: No destructive Preview tests, no request-time DDL, no Vercel link or
deployment, no generated passing validation record. Hosted release stays separate.
