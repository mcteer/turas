# Implementation Plan: TAM and Support Guidance

**Branch**: `010-tam-support-guidance` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)
**Status**: Implementation in progress; see [validation.md](validation.md) for evidence and remaining acceptance gates.
**Input**: Roadmap 010 / TR-05; mcteer-only approval confirmed.

## Summary

Add a small customer/workload support domain with reviewed readiness assessments and actions, optional escalation detail and human-reported handoff, and bounded on-demand Turi explanations. Reuse existing customer authority, evidence sources, execution reads, exact-review commands and native conversation lifecycle. Manual workflows are independently useful; no ticket connector, mail path, background generation or new external service is needed.

## Technical Context

**Language/Version**: TypeScript 7.0.2, Node 24, React 19.2.6, Postgres 17.
**Primary Dependencies**: Existing locked Next.js 16.3.4, eve 0.67.1-compatible installed package, pg 8.23.0, Zod 4.5.4 and Temporal 0.5.1. Preserve lockfile unless a verified implementation need arises.
**Storage**: Existing governed Postgres. Two additive migrations, provisionally 042 support records/lifecycle and 043 advice; confirm next numbers against current main before writing. Existing schema is 041; unrelated local 041 edits are not a migration source for 010.
**Testing**: Vitest, command-line Playwright/WebKit plus axe, owned disposable Postgres/app copies, native fixture and actual-output eval, measured load and paired recovery.
**Target Platform**: Existing local Next/Eve/maintenance supervisor. Hosted migration/deployment and live mail remain separate actions.
**Project Type**: Existing full-stack application and filesystem-authored Eve agent.
**Performance Goals**: SC-004's 100 customers / 500 scopes / 5,000 actions / 20,000 revisions; five concurrent users, 100 measured calls per class after ten warmups, p95 ≤2 s. Generation acknowledges preparation separately and has a 120 s deadline.
**Constraints**: Current authorization before retrieval and after it; exact revision/source review; owner-private conversations; no implicit ticket activity; six-step/read, 24 KiB context, 200-dependency and per-user generation limits.
**Scale/Scope**: Four stories, 24 functional requirements, seven acceptance criteria; versioned `support-v1` contracts and `support-readiness-v1` rules.

## Constitution Check

Pre-research and post-design review: design conforms to all eight principles. These checks do not claim runtime verification.

| Principle | Design / verification evidence |
| --- | --- |
| I — Specify outcome | Four independent stories, FR/SC mapping in tasks; stage artifacts under specs before code |
| II — Customer outcomes | Readiness is a distinct, explainable rule; no maturity, progress or commercial mutation |
| III — Evidence lifecycle | Existing factual review reused, exact source dependencies, immediate withholding and bounded purge |
| IV — Authorization | Live actor/customer locks and audience-first projection for UI, tools, history and jobs |
| V — Human decisions | Confirmed mcteer-only review; versioned decisions and actor-scoped replay |
| VI — Eve core | Installed tools/skills docs read; existing native dispatch reused; root model file unchanged |
| VII — Meaningful verification | Domain/race/source/role tests, four-project WebKit, actual-output review and focused regressions |
| VIII — Operability | Bounded requests, cancellation, content-free telemetry, additive migrations and forward repair |

No exception is proposed. Plan-mode staging delays only placement under `specs/`; repository placement is a prerequisite to implementation, not a waived constitution rule.

## Project Structure

### Documentation

Repository location: `specs/010-tam-support-guidance/`. Planning artifacts were handed off from `/Users/mcteer/.opencode/plan/010-tam-support-guidance/` before implementation.

```text
spec.md
checklists/requirements.md
plan.md
research.md
data-model.md
contracts/support-api.md
contracts/support-ui.md
contracts/advisory-context.md
quickstart.md
tasks.md
handoff.md
```

### Source Code (planned additions and bounded edits)

```text
migrations/042-support-guidance.cjs
migrations/043-support-advice.cjs
lib/contracts/support.ts
lib/support/readiness.ts
lib/support/advice.ts
lib/server/support/
  policy.ts repository.ts schema.ts commands.ts sources.ts projection.ts
  service.ts review.ts actions.ts escalation.ts http.ts
  advisory.ts context.ts tools.ts native.ts maintenance.ts telemetry.ts
app/api/support/customers/[customerId]/route.ts
app/api/support/customers/[customerId]/preview/route.ts
app/api/support/customers/[customerId]/commands/route.ts
app/api/support/customers/[customerId]/advice/route.ts
app/api/support/receipts/[requestKey]/route.ts
app/(workspace)/customers/[customerId]/support/page.tsx
app/_components/support/{workspace,readiness,actions,escalation,advice}.tsx
agent/instructions/support-context.ts
agent/tools/{support_summary,support_actions,support_evidence}.ts
agent/skills/tam-support-guidance/SKILL.md
scripts/{test-support,check-support-ui,support-eval-environment}.ts
scripts/{benchmark-support,support-recovery-check,eval-support,verify-support-review}.ts
tests/{unit,contracts,integration}/support-*.test.ts
tests/ui/support-*.spec.ts
tests/fixtures/support/
```

Integration edits: `lib/server/conversations/feature.ts`, `model-admission.ts`, native dispatch/release/history consumers; `lib/server/staffing/model-budget.ts` compatibility dispatcher; source invalidation seams; existing maintenance supervisor; `scripts/plan-eval-environment.ts` feature type; `package.json`, `playwright.config.ts`, prior-feature regression selectors and `.github/workflows/ci.yml`. Existing generic policy/transport stays authoritative. Discover actual callers before editing shared seams; do not copy all execution modules or change `agent/agent.ts`.

## Phase 0 — Research Conclusions

See [research.md](research.md). Maturity is already an accepted profile record; execution source closure already resolves original profile/artifact/research/shared inputs. Support adds scope-level judgments rather than a new evidence store. It needs its own policy because execution assumes an engagement and permits partner contribution. Existing model governance has an explicit server-owned feature discriminator and compatibility imports that permit extending support without changing the selected root model.

No consequential question remains open. Partner read-only, on-demand generation and manual external references are explicit defaults grounded in the roadmap boundary.

## Phase 1 — Design and Contracts

- [Data model](data-model.md): scope identity, versioned judgments/actions, review, source lineage, native attempts and retention.
- [API](contracts/support-api.md): command variants, current authorization, transactions, lists, receipts and source conflicts.
- [UI](contracts/support-ui.md): customer page, roles, readiness/action/escalation interactions and four-project acceptance.
- [Advice](contracts/advisory-context.md): bound snapshots, safe tools, paid-step admission, release/replay fences and eight actual-output cases.
- [Validation](quickstart.md): future build/acceptance commands and expected evidence.

### Readiness and Action Semantics

Assessments and actions use immutable revisions with separate accepted and working heads. Saving a proposed completed action does not change its accepted open state. Readiness rules use per-check statuses, not model scoring. Evaluate expiry with server time; source eligibility and effective review-required state are dynamic, so a missed maintenance tick cannot serve invalid guidance. A stale accepted record keeps its historical disposition but is labelled review required; it cannot be relied on as current readiness/completion.

Internal and delivery records are independent immutable-audience records. A delivery authoring view always obtains delivery-only context, even for mcteer. No conversion of internal model text into delivery content by changing an audience flag. New delivery drafts are independently sourced and reviewed.

### Transaction Design

Reuse the authority lock prefix from `lockProfileActor`. Discover only authorized metadata first, bound the dependency closure, then lock original sources in the existing sorted kind/id order, referenced engagement/baseline/execution heads, and support scope/record heads. Recheck pointers, digests and current policy before committing. Use one scope mutex for version changes; no provider I/O under database locks. Native paths additionally follow existing conversation/response mutex order. Avoid reverse-order calls into execution functions after support locks; wrap original-source verification in adapters accepting an existing transaction.

Same actor/environment/workspace/request key plus same digest returns a current-authorized receipt. Different digest conflicts. Missing or revoked objects return generic hidden-record results. A new request after a lost response must first reconcile the old key. Use existing bounded serialization/deadlock retry policy for database transactions only.

### Source and Retention Design

Read original accepted-profile, approved-excerpt, verified-research and published-shared references using existing plan/retrieval checks; execution references additionally bind engagement and exact baseline/record. Maturity needs no new source type. Current-source dependencies capture original revision/digest and server generations, including selected scope collections so newly added risks invalidate an in-flight explanation.

Add indexed dependency fanout for source correction/withdrawal and source-bound cleanup leases. Read fences work immediately even if fanout is delayed. Prose, titles, owner labels, reviewer rationale and external references live in purgeable payloads; durable identifiers/categorical state do not retain them. Expiry and terminal settlement run through the existing maintenance process rather than adding a worker. See C12 for exact retention.

### Native Advice

Use a fresh, customer-bound, owner-private conversation tagged `support`. Explicitly select zero to ten engagements and up to twenty current source references. The snapshot can include accepted readiness/actions, current maturity and handoff/risk context with unknown markers. Missing engagement/readiness data is valid. Only three read tools plus one skill are available. Bounded original evidence is supplied by the selected set, so this path adds no new web, embedding, connector or autonomous research calls. Save is a human HTTP command against a retained completed output and exact source map, not an agent tool.

## Phase 2 — Implementation Sequence

Follow [tasks.md](tasks.md): stage reviewed planning docs and preserve current local work; implement core schema/policy/source primitives; deliver US1 readiness; US2 action lifecycle; US3 escalation detail; US4 native advice; then source/retention/recovery/load and CI acceptance. US1 is the smallest useful increment. All four stories and required gates complete 010.

Tests live in their owning `support-*` cohort. Update earlier discovery filters when adding the cohort, including legacy UI and schema-version expectations. CI must fail on missing/skipped suites or browser cases. Share checked runner infrastructure; avoid another monolithic release wrapper or excessive duplicated setup. Only tests requiring databases/native runtime need owned clones.

## Rollout and Recovery

Implementation first proves additive migrations from committed schema 041 and an empty owned database, runtime role grants, all story gates, focused regressions and recovery. Record source revision, environment and actual evidence in `validation.md` created during build. No local result establishes hosted behavior.

`TURAS_010_DISABLED=1` blocks new saves/reviews/generation. Current eligible reads, actor-scoped receipts, cancellation, metadata settlement and cleanup continue. Keep new schema additive; prefer forward correction. A restore must use a matching owned database, artifact store and `.eve/.workflow-data`, never the selected development or hosted database. A later hosted operator inspects marker/schema and authorizes migration separately. README and ROADMAP receive accurate implementation/CI status in the implementation PR; preserve deferred Resend acceptance.

## Complexity Tracking

No new service, integration, ticket engine, maturity rubric or approval system. New domain records and native feature binding are necessary because support can exist without an engagement and has different contribution policy.
