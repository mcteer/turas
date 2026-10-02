# Implementation Plan: Skills, staffing and services operations

**Branch**: `007-skills-staffing` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: `specs/007-skills-staffing/spec.md`

**Status**: Locally implemented and validated. Preview is at schema 034; review-head
CI and PR review remain. See `validation.md` for bounded evidence.

## Summary

Extend the existing app with one governed staffing domain. Import workforce
competencies through a separate restricted source boundary, review exact candidate
revisions, certify dated resource calendars, match accepted-baseline demand with
transparent deterministic constraints and confirm allocations atomically. Separate
planned capacity from actual work and finance scenarios from operational projections.
Turi can explain bounded current results in a fresh scoped conversation; it cannot
write staffing or finance state.

The user clarified that only the canonical `mcteer` internal administrator has
staffing-manager and finance rights in 007. Delegation is deferred. Other internal
members propose demand/allocations and see approved operational summaries; partners
see confirmed delivery-safe assignments only on granted delivery engagements.

[Research](research.md), [data model](data-model.md), [API](contracts/staffing-api.md),
[UI](contracts/staffing-ui.md), [advisory](contracts/advisory-context.md) and
[lifecycle/validation](contracts/lifecycle-validation.md) define the implementation.
[Quickstart](quickstart.md) is a future validation guide, not evidence of completion.

## Technical Context

**Language/Version**: Project Node24, TypeScript7.0.2, installed Next16.3.4/React19.2.6;
validate under the pinned project Node major even if the interactive shell differs.

**Primary Dependencies**: Existing eve0.67.1, AI SDK7, pg8.23.0, Zod4.5.4, current
isolated artifact parser/scanner images. Proposed new dependency: exact pinned
`@js-temporal/polyfill`0.5.1 for explicit DST-safe conversion, with lockfile and license
review during implementation. No integration/connector installation or other upgrade.

**Storage**: Postgres17 with explicit proposed migrations032–034; distinct private
workforce file root via existing store interfaces; existing artifact store and eve
workflow-data remain separately owned. No personnel embedding/vector index.

**Testing**: Vitest unit/contract/owned-clone integration, real CSV/XLSX scanner/parser
fixtures, CLI Playwright/WebKit with axe, eight opt-in actual-output advisory cases,
representative benchmark and paired database/store/eve restart/recovery.

**Target Platform**: Local application and disposable CI Postgres/pgvector; Preview
upgrade only after fresh inspection and disposable gates. No Production connection,
Vercel link or deployment.

**Project Type**: Existing single web application plus root eve agent/maintenance.

**Performance Goals**: p95≤2s roster/detail/match/operations/confirmation under SC-005;
120s advisory deadline, six model steps and six domain reads; bounded imports and
five-minute unconfirmed settlement. No removal of source checks to hit latency.

**Constraints**: C01–C14 exact contracts; immutable decisions and source identities;
no delegated manager/finance authority; no speculative integrations; current model
and reasoning preserved; all implementation/validation tasks initially unchecked.

**Scale/Scope**: Five stories; 500-resource/50-skill/20000-competency-revision/
10000-allocation-date representative fixture over91days. Capacity is exact minutes,
financial amounts integer minor units, six supported currencies without conversion.
008 owns actual work/time/ETC; 013 owns partner organization self-service.

## Constitution Check

| Principle | Before research | Post-design gate and evidence required |
| --- | --- | --- |
| I Specify before implementation | Pass: bounded007 scope after006 | FR/SC→contracts→tasks; this change contains documentation only |
| II Outcomes and deterministic calculations | Pass: planned vs actual explicit | Versioned capacity/economics, no utilization-as-performance or maturity inference |
| III Provenance and lifecycle | Pass: review before skill use | Exact cell/manual-note lineage; immediate withdrawal and purged history tests |
| IV Authorization before action | Pass: mcteer-only clarification | Current identity before retrieval/replay; personnel/finance/partner DTO sentinels |
| V Human decisions | Pass: proposals/reservations/commitments separate | Exact preview, rationalized decision, capacity/source races and idempotency |
| VI eve core | Pass: installed task-specific docs read | Root read-only tools/skill, native fences, preserved model; no new connector |
| VII Meaningful verification | Pass: FR-023 explicitly requires tests | Domain/HTTP/parser/DST/money/races/UI/live/load/recovery; honest incomplete gates |
| VIII Operable design | Pass: explicit storage and bounded work | Safe logs, source retention, lease/retry/cancel, disable switch and recovery |

Post-design: all gates have a planned implementation and validation path. No
constitution exception, no claim of real finance-policy approval, and no hosted
release evidence. Clarification asked/answered:1/1; spec quality checklist16/16.
Remaining questions are design details resolved by explicit contracts, not hidden
user decisions. No extension hooks are configured in this checkout.

## Project Structure

### Documentation

```text
specs/007-skills-staffing/
  spec.md plan.md research.md data-model.md quickstart.md tasks.md
  checklists/requirements.md
  contracts/staffing-api.md
  contracts/staffing-ui.md
  contracts/advisory-context.md
  contracts/lifecycle-validation.md
  validation.md  # implementer creates after actual checks
```

### Planned code and existing extension points

```text
lib/contracts/{staffing,staffing-imports,staffing-economics}.ts
lib/staffing/{calendar,freshness,matching,economics}.ts
lib/server/staffing/{policy,repository,commands,resources,skills,read}.ts
lib/server/staffing/{imports,jobs,store,competencies,lifecycle,cleanup}.ts
lib/server/staffing/{calendars,demands,matching,allocations,decisions,operations}.ts
lib/server/staffing/{economics,context,advisory,fences,model-budget,telemetry}.ts
lib/server/engagements/read.ts
lib/server/conversations/{repository,binding,dispatch,context-fence,projection,cancel,watchdog,reconcile}.ts
lib/server/profiles/{context,attempt-context,tool-actor}.ts
agent/agent.ts  # bounded model resolver only; preserve selected model/reasoning
agent/instructions/staffing-context.ts
agent/skills/staffing-advice.ts
agent/skill-procedures/staffing-advice/SKILL.md
agent/tools/{read_staffing_demand,match_staffing_resources,read_staffing_capacity,read_staffing_scenario}.ts
agent/tools/{customer_context,read_delivery_plan,save_delivery_plan_draft,search_evidence,read_research,propose_customer_context,propose_artifact_claim,propose_research}.ts
packages/artifact-extractor/src/{main,spreadsheet,text,types}.ts
lib/contracts/artifacts.ts  # additive structured-manifest boundary; preserve004 contract
scripts/maintenance-worker.ts scripts/dev.mjs
app/api/staffing/...  # exact routes in staffing-api.md
app/(workspace)/staffing/{page,resources/page,resources/[resourceId]/page,imports/page,imports/[importId]/page,finance/page}.tsx
app/(workspace)/customers/[customerId]/engagements/[engagementId]/staffing/page.tsx
app/_components/staffing/{roster,resource-detail,import-review,calendar-editor,demand-editor,matches,allocation-review,operations,finance,advisory}.tsx
app/_components/{app-shell,plans/engagement-detail}.tsx
migrations/{032-workforce-competencies,033-staffing-allocations,034-staffing-economics-advisory}.cjs
migrations/manifest.json scripts/db-role-setup.sql
scripts/{staffing-eval-environment,test-staffing,check-staffing-ui,benchmark-staffing,staffing-recovery-check,eval-staffing,verify-staffing-review}.ts
tests/fixtures/staffing/{seed,journey,arithmetic}.ts
 tests/{unit,integration,contracts}/staffing-*.test.ts
 tests/ui/staffing-*.spec.ts
 evals/fixtures/007-staffing-cases.json
```

New modules above are implementation targets. Existing hooks may use helpers rather
than editing every listed file if equivalently guarded; preserve exact observable
contracts and test each affected native surface. Confirm installed Next route/form
and eve dynamic/context docs before framework code.

**Structure Decision**: Keep pure deterministic calculations separate from authorized
transactions. No alternate staffing service, external API, personnel RAG, scheduler
process or business-logic duplication in route/UI/agent code.

## Phase 0 — Research outcome

R1–R10 resolve authority, private import ownership, structured extraction, canonical
baseline identity, time and monetary arithmetic, freshness, lock order, advisory and
rollout. Two read-only research reviews inspected the existing import/domain paths
and deterministic transaction design. The schema/source/cleanup ownership boundary
is explicit; old demo formulas and fixtures are not carried over. Only the Temporal
polyfill is a proposed added dependency, with a specific tested need.

## Phase 1 — Design

### Foundation and imports

Add feature-local schema/readiness and policy. Lock current member/principal/session/
workspace without requiring a fictitious customer for workforce operations. Customer
staffing commands additionally use current customer/workload policy. Reuse actor
locks within a transaction rather than repeatedly reauthorizing through duplicate
queries; never skip the initial or release-time checks.

Workforce source rows, objects and cleanup own their own namespace. Reuse the scanner,
container and store interfaces with explicit root/configuration; do not redirect
customer artifact records. Add structured parser mode and bounded map/review flow.
The existing maintenance worker supervises bounded import/cleanup/expiry ticks; if
scan/parse execution needs the artifact worker pattern, expose a distinct workload
queue/heartbeat in the existing supervisor, without new cloud infrastructure.

### Calendar, match and demand

Calendar revisions resolve explicit local intervals once, retaining their original
input and timezone-data version. Pure interval operations union/deduct without double
counting. Current approved calendar selection covers each date unambiguously; no
implicit40-hour week or default leave assumptions. Availability certifications are
fresh now and explicitly cover future dates. Competencies must remain eligible
through the requested work interval.

Demand records exact current accepted baseline and work package, independent of the
plan's working draft. Service-date labels mean the candidate resource's local day;
optional explicitly zoned overlap windows are intersected with that day. This slice
allocates daily effort, not fixed UTC appointments. Confirmed demand totals count
all revisions of the stable demand, preventing renewed demand from hiding prior
commitments. Matching batches authorized metadata/source/calendar reads and
computes hard constraints before deterministic tie-breaks. A match result has a
10-minute maximum lifetime and invalidates on relevant generation change. Pages bind
scope/result digest. No stale cached candidate can be confirmed without full recheck.

### Commitments and source races

Use the API contract's global lock order and exact review preview. Resource and
remaining-demand limits are both authoritative, including parallel first writes.
Amendment credits old current ledger only inside the same transaction that validates
and installs the replacement. Later calendar reductions or withdrawn competencies
can create overload/needs-review but never erase a commitment. Source/baseline changes
are checked synchronously on every relevant read/decision; cleanup or invalidation
jobs are not correctness gates. Release/cancel can remove future commitments through authorized identity-only
history even when eligibility is lost; new or replacement commitments must satisfy
all current feasibility checks. No overload override in007.

### Operations and finance

Separate safe operational aggregates from manager evidence and finance projections.
Staffing operations report planned confirmed load and tentative contention, including
explicit denominator/as-of. Pure integer money calculations use rate groups so
splitting an allocation cannot change rounded cost. Snapshot all exact input revisions
and formula policy. Policy approval is a mcteer action separate from scenario
calculation; actual financial validation is not inferred from a seeded test decision.
No annual P&L or 008 approved actuals are invented.

### Advisory and UI

Create the staffing binding before the first customer context snapshot and force a
minimal delivery-only customer projection. Extend all existing tool actors, native
context/replay/output paths and model admission to understand this binding. All
non-staffing tools fail closed if directly called from it. Finance mode is mcteer-only
and immutable. Reuse native stop/history/reconciliation; do not start another paid
turn on ambiguous dispatch. UI exposes explicit human decisions and current reasoned
results even when the provider is unavailable.

### Telemetry and performance

Instrument operation duration/outcome/counts and conflicts without personal/financial
payloads. Index current competency heads by resource/skill, active calendar selection
by resource/date, allocation ledger by resource/date and demand/date, import jobs by
state/lease, and demand/engagement lists by scope/current version. Batch source checks
and page reads; no per-row authorizations after a transaction has locked the actor.
Prove the representative benchmark with source-bound/hidden/stale data before tuning.

## Rollout, recovery and completion gates

1. Implement contracts, isolation wrapper, migrations and authority foundation first.
2. US1 imports/competencies, US2 calendars/demand/matching, US3 exact commitments,
   US4 operations/finance, US5 bounded advisory; validate each focused phase.
3. Complete deterministic/race/source tests, real trusted journey, full four-project
   WebKit, eight actual-output live cases, representative performance and recovery.
4. Run affected002–006 regressions, typecheck/build/docs/diff and dedicated CI selection
   that excludes clone-only tests from generic suites but checks their full manifest.
5. Fresh read-only Preview inspection, explicit upgrade/roles only after disposable
   gates, reinspection and non-destructive app smoke. Keep Production untouched.
6. Reconcile actual evidence and README/roadmap, create a reviewable PR; no deployment
   or unrequested merge. This planning handoff stops before step1.

`TURAS_007_DISABLED` stops intake/writes/advisory dispatch. Allow cancellation,
reconciliation, cleanup and eligible historical reads; keep separate paths so the
switch cannot trap a running import. Roll forward after migration issues, preserving
immutable decisions and private store ownership. Paired restoration uses only owned
synthetic resources and the matching eve store, with stale lease/source fences intact.

## Complexity Tracking

No constitution exception. The separate workforce source/store is necessary because
customer-artifact authority and orphan cleanup are incompatible with personnel scope.
Temporal is the sole proposed dependency addition; explicit timezone/DST behavior
cannot safely rely on ambiguous built-in Date parsing. No other new infrastructure.
