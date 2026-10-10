# Implementation Plan: Governed Adaptive Learning

**Branch**: `014-governed-adaptive-learning` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-governed-adaptive-learning/spec.md`.
Planning is complete and implementation is authorized. Historical design-stage
checks below record planning readiness; current implementation evidence and
remaining acceptance gates are recorded in [validation](validation.md).

## Summary

Preserve existing 005 contribution-authoring rights and extend its publication domain with private feedback,
exact-revision rights review, bounded Turi drafting and paired evaluation, then
require a human administrator release decision. Preserve existing shared readers
and original-source fences. Add fixed internal-only quarterly metrics with explicit
measurement reuse and a release ledger that prevents revised-subset disclosure.
Use existing maintenance/native execution infrastructure and explicit migrations.

## Technical Context

**Language/Version**: TypeScript 7.0.2, Node 24, SQL migrations.

**Primary Dependencies**: Installed Next.js 16.3.4, eve from the existing lockfile
(package range ^0.67.1), pg 8.23.0, Zod 4.5.4, existing Vitest/Playwright. No new
external integration or speculative dependency. Preserve the selected model and model-admission logic in `agent/agent.ts`. Configure documented zero retention for finished native runs so reset does not leave encrypted model/tool payloads behind; Turas retains its governed captures.

**Storage**: Existing isolated PostgreSQL/pgvector environments, explicit owner-run
migrations and least-privilege runtime grants. Purgeable private payload tables,
immutable receipts/dependency manifests and existing native workflow storage.

**Testing**: Contract/unit/integration suites, real eve native fixture paths,
production Next build with CLI WebKit, owned restore/restart checks, seven-class
benchmark and explicitly budgeted actual-model paired evaluation with independent
output review. Documentation checks in this planning turn only.

**Target Platform**: Existing Turas web/eve application and supervised maintenance;
current Vercel Production with explicit database release operations.

**Project Type**: Governed full-stack web application with an eve agent.

**Performance Goals**: SC-006: seven domain operation classes, ≥100 each, p95 <1000ms
under production quotas. Model and external-research latency reported separately.

**Constraints**: [C01–C14](data-model.md), source/rights closure, same-customer
knowledge lineage, no partner aggregate access, no automatic publication, no model
change, no arbitrary metric filters, no unbudgeted calls, no schema initialization
in request handlers. Keep canonical checkout/private environment/workflow state.

**Scale/Scope**: Four user stories; eight paired cases (16 arms) per evaluation;
one active evaluation/workspace; two metric protocols; minimum five independent
customers; bounded 20-row pages, 100-row maintenance batches and 10000-contribution
aggregate admission cap. Missing eligible real outcomes remain unavailable.

## Constitution Check

| Principle | Pre-design gate | Post-design result |
| --- | --- | --- |
| I — Specify before implementation | Four independently testable stories and 26 requirements | Spec, contracts, model, tasks and acceptance mappings; implementation still stopped |
| II — Outcomes define maturity | Metrics are accepted comparable outcomes, not adoption or training success | Exact arithmetic/protocols; no causal, revenue or maturity inference |
| III — Evidence lifecycle | Feedback is proposed; originals and rights stay authoritative | Immutable closure-bound review/evaluation/release and synchronous fences |
| IV — Authorization | Private member feedback, current internal authority, sanitized shared reads | Common domain before/after reads, model dispatch, history and publication |
| V — Human decisions | Turi drafts/evaluates; administrators grade and publish | Every existing publish path gated; model cannot approve or self-grade |
| VI — eve core | Installed docs inspected, existing native machinery reused | New learning purpose routing, strict tools, unchanged selected model |
| VII — Meaningful verification | State/access/calculation/native/UI changes require behavior checks | Deterministic suites plus actual outputs and independent review; planning runs docs only |
| VIII — Operability | Explicit budgets, migration/recovery, cancellation, retention | Durable reservations, unknown-cost stop, forward recovery and Production verification |

All gates pass at design stage; no exception or constitution amendment is required.
This is design compliance, not evidence of implemented or hosted behavior.

## Project Structure

### Documentation (this feature)

```text
specs/014-governed-adaptive-learning/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── handoff.md
├── checklists/requirements.md
└── contracts/
    ├── learning-api.md
    ├── native-evaluation.md
    ├── metrics-lifecycle.md
    └── learning-ui.md
```

### Source Code (repository root)

```text
migrations/052-learning-governance.cjs
migrations/053-learning-evaluation.cjs
migrations/054-learning-metrics.cjs
lib/contracts/learning.ts
lib/learning/{evaluation-cases,evaluation-rubric,metric-protocols,calculations}.ts
lib/server/learning/                 # authority, feedback, reviews, native, budgets,
                                    # evaluation, metrics, eligibility, maintenance
lib/server/knowledge/                # reuse immutable revisions, gate release/withdrawal
lib/server/conversations/            # new purpose dispatch, history and fences
lib/server/staffing/                 # existing shared native compatibility hooks
agent/instructions/learning-context.ts
agent/tools/{learning_summary,learning_evidence}.ts
agent/skills/governed-learning/SKILL.md
app/api/learning/                    # thin strict adapters, no duplicate policy
app/(workspace)/learning/            # private review and feedback routes
app/_components/learning/            # protected UI and bounded request state
scripts/learning-*.ts                # owned fixtures, native/UI/recovery/benchmark
scripts/{eval-learning,verify-learning-review}.ts
tests/{contracts,unit,integration,ui}/learning-*.{ts,tsx}
tests/fixtures/learning/
docs/learning-operations.md
```

**Structure Decision**: Extend existing domain/native/knowledge services; a new
learning namespace owns adjacent records and never creates another public practice
store, model engine or authority hierarchy. Planned paths are implementation targets,
not claims that those files already exist. Migration numbering is rechecked on main.

## Phase 0 — Research outcomes

[research.md](research.md) records both read-only research tracks and the native
follow-up. Key findings: 005 admins are not mcteer-only; private feedback cannot
become lineage; content digest alone misses rights changes; current withdrawal can
be blocked by a newer draft; 011's USD evaluation ledger is not production code;
legacy cohort suppression lacks cross-release protection. All design decisions
are resolved; two consequential choices were answered by the user.

## Phase 1 — Domain and interface design

1. Add explicit migrations/roles and shared request/authority/retention foundations.
   Keep schema gate activation distinct from ordinary feature enablement; preserve
   pre-014 exact published heads without inventing evaluations.
2. Build feedback adapters for the five exact target kinds. Resolve accepted
   originals through their existing domains, retain source boundaries, and reuse
   005 candidate creation/revision. Partner attempts remain author-private.
3. Extend the common native lifecycle with one learning feature and three immutable
   purposes. Promote reservation/settlement into server services. Persist scope,
   budget and step identity before invocation; deny all unlisted tools.
4. Review exact candidate rights/sanitization, run fixed isolated paired arms,
   capture outputs, collect human case judgments and derive verdicts. Add the gate
   in `decideKnowledgeCandidate` plus an activation-aware database guard. Fix
   published-head withdrawal and create rollback candidates through ordinary review.
5. Bind new rights/evaluation/release dependencies into existing shared read/search/
   citation/model/history fences, avoiding recursion or shared-on-shared lineage.
   Evaluation catalog changes block pending releases; they do not retroactively
   revoke a historical published decision. Source/rights loss still withholds it.
6. Add exact accepted-outcome measurement mapping, deterministic arithmetic and
   separate reuse review. Fixed cohort release captures current closure atomically;
   a stable metric/quarter family spans protocol versions and survives cleanup.
7. Add bounded refresh/reconciliation/cleanup and separate quality views. Existing
   005 research admission remains the only route to external refresh.
8. Ship protected accessible UI and acceptance runners; complete code/schema release
   sequencing and actual Production verification after a separately authorized merge.

During implementation, independent actual-output review identified a ceiling effect
in the original general-guidance E01. Catalog/rubric v2 tests an actionable measurement
review with workload/boundary/timezone/missingness differences instead. Review
expectations are frozen separately from model context and grade both arms equally,
including clearly labeled additional safeguards. The genuine prior practice and
FR-009 thresholds stay unchanged; prior batches remain visible and unaccepted.

The user subsequently clarified SC-002: actual safe no-benefit rejection may
establish feature proof, while per-practice publication still requires improvement.
Feature verification reports quality and publication verdicts separately, rejecting
unsafe, low-quality or regressing comparisons. Runtime publication policy is unchanged.

## Validation and delivery sequence

[quickstart.md](quickstart.md) defines planned commands and expected evidence.
US1 is the MVP checkpoint: governed feedback and proposed drafting, with publishing
still blocked until US2. US2 is the core release loop. US3 and US4 use the same
foundation; synthetic independent tests do not require other stories' UI or real
Production measurements. Full feature acceptance requires all stories, tests,
actual-model review, operational docs, green CI and recorded hosted checks for an
authorized release. Do not mark tasks done from scaffolding or a mock alone.

[contracts/metrics-lifecycle.md](contracts/metrics-lifecycle.md) specifies additive
052–054 migrations, owner grants, explicit activation, disable and forward repair.
Use a private backup/restore rehearsal and actual target checks; never treat code
deployment as proof that migrations ran. No 014 migration, paid call, code change
or release is performed in this planning phase. The separate authorized 045→051
Production repair is recorded in [recovery](../../docs/production-recovery-2026-10-09.md).

## Complexity Tracking

No constitution violations. The durable budget ledger, cohort family ledger and
publication guard are necessary to enforce respectively paid-work bounds,
cross-release privacy and the existing publication path's release requirements.
They are not interchangeable with UI controls or model instructions.
