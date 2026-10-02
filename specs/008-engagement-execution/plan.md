# Implementation Plan: Engagement execution and delivery logs

**Branch**: `008-engagement-execution` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Status**: Implementation in progress through T032; remaining stories and release gates are pending. See validation.md for actual checkpoint evidence.
**Input**: Roadmap 008 after merged 006/007. User confirmed `mcteer`-only approval.

## Summary

Add a governed execution domain for exact accepted engagement baselines. Immutable
record/time revisions and human decisions support milestones, activity, actual
minutes, RAID, changes, point budgets, remaining estimates, handoff and outcomes.
Use a separate actual-time ledger with atomic daily locks, deterministic summaries,
source-aware projections and read-only native Turi explanations. Keep all mutations
in the domain shared by route handlers and future consumers. Do not build 009 or
alter the selected agent model, commercial decisions, maturity or hosting.

## Technical Context

**Language/Version**: TypeScript 7.0.2, Node 24.x, SQL/Postgres 17, React 19.2.6.
**Primary Dependencies**: Next.js 16.3.4, eve 0.67.1, pg 8.23.0, Zod 4.5.4,
Temporal polyfill 0.5.1; use installed locked versions, no new integration.
**Storage**: Existing scoped Postgres domain; explicit migrations 036–038 (main owns 035 general conversations); existing
private artifact storage and `.eve/.workflow-data` preserved for paired recovery.
**Testing**: Vitest, CLI Playwright/WebKit, axe, disposable Postgres and runtime
roles, native Eve fixtures, eight captured/reviewed live responses, independent
arithmetic vectors and representative load. No host browser automation.
**Target Platform**: Local Next.js/Eve/maintenance supervisor; later explicit
Preview schema check/upgrade after disposable gates. Production/deploy excluded.
**Project Type**: Existing full-stack web application and embedded Eve agent.
**Performance Goals**: SC-005: five concurrent users; 100 calls/class after ten
warmups; every paginated view/summary/review-acknowledgement class p95 ≤2 s; zero
correctness failures. Dataset: 1,000 engagements, 500 resources, 50,000 time
revisions, 20,000 record revisions, 10,000 decisions. See quickstart workload.
**Constraints**: Current authority before retrieval/replay/release; exact human
review; bounded input/output; numerical actuals survive private-prose withdrawal;
no generic tool fallthrough, automatic paid retry or secret/customer telemetry.
**Scale/Scope**: Five stories, 24 FRs, eight acceptance gates. `execution-v1` API,
`execution-effort-v1` arithmetic, versioned explanation procedure/evaluation.

## Constitution Check

Pre-research and post-design review pass all eight principles. These are design
checks; runtime evidence remains required during implementation.

| Principle | Design evidence / implementation gate |
| --- | --- |
| I. Specify outcome | Five testable stories; FR/SC task traceability; planning-only handoff |
| II. Customer outcomes | No maturity/commercial inference; reviewed measured outcomes; deterministic versioned integer-minute calculations |
| III. Evidence lifecycle | Exact source/review lineage; pending isolation; immediate withdrawal fences; exact leased payload purge |
| IV. Authorization | Current actor/session/customer/resource policy; explicit partner projection; every model/native/history release fenced |
| V. Human rights | Confirmed canonical mcteer reviewer; versioned decisions/receipts; no agent mutations or automatic completion |
| VI. Eve core | Installed docs researched; existing native lifecycle reused; model selection preserved; no speculative integration |
| VII. Verification | Targeted domain/race/arithmetic/upgrade/browser/live-output gates; planning receives documentation checks only |
| VIII. Operability | Bounds/rates/deadlines/cancel/settlement; private payload separation; explicit migrations and forward recovery |

No constitution exception is requested. Read `docs/evidence-policy.md` and
`docs/design-reference.md` before affected code. Installed Eve README routes tool,
skill and eval work; installed Next route-handler docs govern API code. Re-read
only relevant pages if implementation changes the researched design.

## Project Structure

### Documentation (this feature)

```text
specs/008-engagement-execution/
  spec.md
  checklists/requirements.md
  plan.md
  research.md
  data-model.md
  contracts/calculations.md
  contracts/execution-api.md
  contracts/execution-ui.md
  contracts/advisory-context.md
  quickstart.md
  tasks.md
  validation.md                     # implementation evidence, created later
```

### Source Code (repository root, planned additions/edits)

```text
migrations/036-execution-records.cjs
migrations/037-execution-time-effort.cjs
migrations/038-execution-advice-lifecycle.cjs
lib/execution/calculations.ts       # pure versioned arithmetic
lib/server/execution/               # policy, schema, commands, records, sources,
                                   # milestones, time, ledger, registers,
                                   # reconciliation, effort, calculations,
                                   # handoff, projection, native advice, cleanup
lib/server/conversations/feature.ts # shared server-owned feature discriminator
lib/server/conversations/           # dispatch, routes, release/history/recovery
lib/server/profiles/                # admitted feature context and fenced reads
app/api/execution/engagements/[engagementId]/route.ts
app/api/execution/engagements/[engagementId]/records/route.ts
app/api/execution/engagements/[engagementId]/time/route.ts
app/api/execution/engagements/[engagementId]/review/route.ts
app/api/execution/engagements/[engagementId]/summary/route.ts
app/api/execution/engagements/[engagementId]/preview/route.ts
app/api/execution/engagements/[engagementId]/commands/route.ts
app/api/execution/engagements/[engagementId]/advice/route.ts
app/api/execution/receipts/[requestKey]/route.ts
app/api/execution/utilization/route.ts
app/(workspace)/customers/[customerId]/engagements/[engagementId]/execution/page.tsx
app/_components/execution/          # overview, records, time, review, changes,
                                   # forecast, handoff, advice, client state
agent/instructions/execution-context.ts
agent/tools/execution_summary.ts
agent/tools/execution_records.ts
agent/tools/execution_effort.ts
agent/skills/execution-explanation/SKILL.md
scripts/test-execution.ts
scripts/test-execution-regressions.ts
scripts/check-execution-ui.ts
scripts/execution-recovery-check.ts
scripts/benchmark-execution.ts
scripts/eval-execution.ts
scripts/verify-execution-review.ts
scripts/prepare-execution.ts
tests/fixtures/execution/          # synthetic governed journey, native, oracle
tests/unit/execution-*.test.ts
tests/contracts/execution-*.test.ts
tests/integration/execution-*.test.ts
tests/ui/execution-*.spec.ts
```

**Structure Decision**: Extend the existing repository layout. Keep execution
separate from staffing policy: the latter deliberately rejects partners and its
planned-day 960-minute constraint cannot represent actual-time 1440-minute policy.
Reuse scoped identity, accepted baselines, source eligibility, calendar algorithms,
transaction helpers and native transport. Do not copy whole legacy prompts or
create a second authorization, chat transport or profile approval system.

## Phase 0 — Research conclusions

[research.md](research.md) resolves baseline identity, resource attribution, daily
locking, numeric effort, source retention, native feature isolation and gate ownership.
Two read-only research tasks inspected domain/transaction and Eve/release seams.
The user answered the one policy question: mcteer approves all 008 decisions,
including own submissions with rationale. No technical unknown remains blocking.

## Phase 1 — Design and contracts

- [data-model.md](data-model.md): storage groups, constraints C01–C12, state graphs,
  revision/ledger/cleanup invariants and role grants.
- [API](contracts/execution-api.md): exact routes, command variants, policy, ordered
  transactions, receipts, stale previews, bounded lists and revocation semantics.
- [Calculations](contracts/calculations.md): approved actuals versus planned values,
  current-baseline variance, explicit remaining estimates and incomplete cases.
- [UI](contracts/execution-ui.md): role projections, accessible journeys and honest
  unknown-save, withdrawn-source, stale-baseline and incomplete-forecast states.
- [Advice](contracts/advisory-context.md): immutable feature binding, allowlist,
  dependency fences, native budget/settlement and eight actual-output review cases.
- [Quickstart](quickstart.md): future validation order, owned disposable fixtures,
  complete browser/suite discovery, reproducible performance/evaluation and rollout.

### Transaction and source design

Use the existing authority lock prefix (membership → principal → session → workspace)
and customer checks before plan/source/engagement/resource/execution locks. Snapshot
all affected old/new identities first, acquire the complete sorted lock union,
then recheck pointers. Corrections lock both resource/date keys even across customers.
Only retry bounded database serialization/deadlock failures; no external I/O inside
locks. Recheck every replay against current authority and payload eligibility.

Approved actual quantities are facts about reviewed effort and survive loss of
supporting prose. Eligible summaries retain amounts, show review exceptions, and
withhold private payloads. Source-dependent milestone acceptance, status and
closeout become review required. Retired/unmapped actuals remain in lifetime totals;
variance stays unknown until the contract permits a complete current mapping.

### Conversation integration

Introduce one server-owned normal/planning/staffing/execution discriminator used
by instructions, hooks, tools, dispatch, profile context, native release and history.
Under the same conversation lock, reject mixed bindings, research-active or populated
conversations in both new and existing binders. Advice exposes only three scoped
execution reads and one procedure load; this task does not change `agent/agent.ts`.
Keep `agent/agent.ts` unchanged: its existing staffing-named imported model helpers
become narrow compatibility adapters over a tagged shared native feature dispatcher,
as detailed in research R06. All other catalog/instruction consumers use the strict
feature discriminator. Each native step/chunk, durable projection/reconnect and replay revalidates consumed
source and aggregate generations. Settlement persists metadata even after denial.

## Phase 2 — Implementation sequence and gates

Tasks are generated separately in [tasks.md](tasks.md). Build foundation, US1 logs/
milestones, US2 actuals, US3 registers/reconciliation, US4 calculations/handoff,
then US5 native advice. Each story has domain/API/UI verification before advancing.
US1 is the smallest demonstrable increment; completion of 008 requires all stories
and the cross-cutting gates, not just that increment.

Use an owned 008 fixture explicitly stopped at schema 034 for upgrade tests and a
separate empty database; do not derive prior state by renaming 007's migration regex.
Keep existing 002–007 suites runnable; update legacy selectors so 008 runs only in
its owning fixture. Fail skipped/missing suites and browser cases. The full real
journey must invoke public governed commands; benchmark bulk fixtures may seed
history but do not substitute for acceptance tests.

## Rollout and recovery

No database/provider work is performed by this planning pass. During implementation,
first verify disposable migrations/runtime roles, integration/regression/UI,
performance, paired recovery and live-output gates. Record commands, environment,
revision and actual outcomes in `validation.md`. Preview was historically at 034;
inspect fresh marker/schema before an explicit 036–038 upgrade and role setup, then
read-only inspect and local smoke. Stop on an unexpected marker/schema. Production
and Vercel linkage/deployment remain excluded. A Preview migration is not a hosted
feature release. Disable new work with `TURAS_008_DISABLED=1`; keep reads, cancellation,
settlement and cleanup. Prefer forward repair; any restore uses matched database,
private artifacts and Eve workflow state, never a destructive request-time rollback.

## Complexity Tracking

No constitutional violations or additional service/dependency are proposed.
