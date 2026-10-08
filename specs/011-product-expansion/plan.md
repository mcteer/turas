# Implementation Plan: Product Expansion Opportunities

**Branch**: `011-product-expansion` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)
**Input**: `specs/011-product-expansion/spec.md`
**Status**: Implemented locally; release acceptance in progress.

## Summary

Add an internal customer/workload expansion workspace with immutable evidenced
hypotheses, exact account-owner decisions, deterministic explained ordering and
on-demand Turi proposals. Reuse the governed profile/retrieval/plans/execution
foundations. Add explicit owner assignment and preserve separate proposed/decided
revisions, evidence eligibility and source invalidation. Public research supports
attributed discovery; qualification requires reviewed customer need and current
product suitability. No customer data changes or runtime work occur in this slice.

## Technical Context

**Language/Version**: Node24, TypeScript7.0.2, Next16.3.4 and React19.2.6.
**Primary Dependencies**: Existing eve0.67.1, AI SDK7.0.116, pg8.23.0 and Zod4.5.4;
lockfile authoritative; no new dependency or connector.
**Storage**: Existing PostgreSQL17/pgvector; provisional additive 046 core and 047
advice migrations; immutable headers/purgeable payloads and runtime-role grants.
**Testing**: Vitest domain/HTTP/contract suites; CLI WebKit desktop/mobile × light/dark;
eight actual-output cases; bounded performance, source cleanup and paired restart drills.
**Target Platform**: Existing web/eve application. Implement and test in owned marked
disposable environments; production rollout is a separate later release action.
**Project Type**: Existing single web app and agent with a shared server domain.
**Performance Goals**: p95 ≤2 seconds for list/detail/decision acknowledgements at
200 customers/1,000 scopes/10,000 hypotheses/50,000 revisions and five concurrent users;
120-second advice deadline with metadata settlement within five minutes afterward.
**Constraints**: Internal-only; one assigned reviewer/customer; 64KiB request bodies;
20 direct/200 transitive sources; 24KiB cumulative model context; exact source fences;
root `agent/agent.ts` byte-identical; no migrations in handlers or implicit model retry.
**Scale/Scope**: Four stories, 24 functional requirements, eight success criteria;
English, bounded per-customer authoring/advice, no cross-customer ranking or CRM.

## Constitution Check

| Principle | Before research | After design / required validation |
| --- | --- | --- |
| I — Specify first | Pass: bounded stories, scope and recorded clarification | Spec/plan/contracts/tasks traceability; stop before implementation |
| II — Customer outcomes | Pass: benefit/validation separate from commerce | No product-count, sales-probability or maturity calculation; deterministic tuple tests |
| III — Evidence lifecycle | Pass: original attribution/approval/freshness gates | Assertion-level sources, qualification checks, withholding and cleanup tests |
| IV — Authorization first | Pass: internal-only and owner-private advice | Explicit assigned-owner authority, source/role/race/replay tests |
| V — Human rights | Pass: user confirmed assigned owner with mcteer administration | Exact decisions, no implicit override, human save and no external side effects |
| VI — eve core | Pass: routed installed docs and native reuse reviewed | Strict used tools/skill, compatibility dispatch, unchanged selected model |
| VII — Meaningful verification | Pass: required synthetic, native and UI gates | Exact manifests, actual-output review and honest local/CI/hosted evidence |
| VIII — Operability | Pass: bounded time/cost/retry and forward recovery | Explicit migrations, cancellation, retained request fences, content-free metrics |

No constitutional exception or unresolved technical clarification is proposed.

## Project Structure

### Documentation (this feature)

```text
specs/011-product-expansion/
  spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
  handoff.md  checklists/requirements.md
  contracts/expansion-api.md
  contracts/expansion-ui.md
  contracts/advisory-context.md
```

### Source Code (planned additions and bounded edits)

```text
migrations/046-product-expansion.cjs
migrations/047-expansion-advice.cjs
lib/contracts/expansion.ts
lib/expansion/{products,ranking,advice}.ts
lib/server/expansion/
  policy.ts owners.ts repository.ts schema.ts commands.ts sources.ts dependencies.ts
  service.ts review.ts projection.ts cursor.ts links.ts http.ts telemetry.ts
  invalidation.ts maintenance.ts context.ts advisory.ts tools.ts suggestions.ts
  native.ts native-admission.ts model-budget.ts native-events.ts native-release.ts
  native-reconcile.ts native-retirement.ts
app/api/expansion/customers/[customerId]/
  route.ts owner/route.ts evidence/route.ts preview/route.ts commands/route.ts advice/route.ts
app/api/expansion/receipts/[requestKey]/route.ts
app/(workspace)/customers/[customerId]/expansion/page.tsx
app/_components/expansion/{workspace,editor,review,ranking,owner,advice}.tsx
agent/instructions/expansion-context.ts
agent/tools/{expansion_summary,expansion_hypotheses,expansion_evidence}.ts
agent/skills/product-expansion/SKILL.md
scripts/{test-expansion,check-expansion-ui,check-expansion-native,expansion-eval-environment}.ts
scripts/{benchmark-expansion,expansion-recovery-check,eval-expansion,verify-expansion-review}.ts
scripts/test-expansion-regressions.ts
tests/{unit,contracts,integration}/expansion-*.test.ts
tests/ui/expansion-*.spec.ts
tests/fixtures/expansion/
```

**Structure decision**: One domain shared by HTTP and eve; no copied parallel app,
new evidence store or independent product integration. The implementation tasks name
shared seams explicitly: conversation feature/admission/release/history/cancel,
staffing-named model compatibility, generic-tool exclusions, maintenance, profile
navigation, role grants, eval environment/source digest, suite selectors and CI.

## Phase 0 — Research

[research.md](research.md) records eight decisions grounded in current code and
installed docs. Important differences from support: assigned account-owner authority,
internal-only content, conflicting-source union rejection, independent product
identity/rank, durable dismissal suppression and one active attempt per user/scope.

## Phase 1 — Design and contracts

- [Data model](data-model.md): C01–C16 bounds, entities, state, ranking, locks and retention.
- [API](contracts/expansion-api.md): exact command/preview/replay and source/owner fences.
- [UI](contracts/expansion-ui.md): customer navigation, draft/decided views, source review and keyboard/mobile journeys.
- [Advice](contracts/advisory-context.md): native binding, budget, strict tools, final release and eight actual-output cases.
- [Quickstart](quickstart.md): future acceptance commands, rollout and recovery.

The source adapter follows existing original-source policy and uses conflict-aware
200-dependency union. Plans are references to exact accepted revisions, not a new
acceptance action; execution links bind current selected engagement/baseline and
original dependencies. No arbitrary source URL is fetched by 011. A source changes
eligibility at read time even if the cleanup worker has not run.

Assignment updates lock affected memberships before the customer and assignment
row; source-bearing commands use the authority → request mutex → original sources →
selected delivery heads → expansion heads order. Preview digests include assignment,
revision, source and related-set generations. Discover actual callers before touching
shared locks and prove owner-reassignment/withdrawal/replay races in integration tests.

Use existing native compatibility hooks and one-feature DB guards, including both
directions with research requests. Do not change the root model file. Incremental
prose remains withheld until final structured result and current dependency checks.
Code paths for default chat, archived conversations and older features retain their
current behavior and receive targeted regressions.

## Phase 2 — Implementation sequence

Follow [tasks.md](tasks.md): owned validation foundation and core contracts/schema;
US1 author/read; US2 owner decisions; US3 ranking, links and lifecycle; US4 native
proposals; then complete acceptance, documentation and a reviewable PR. US1 is the
smallest demonstration increment. Full 011 requires every story and cross-cutting gate.

## Rollout and recovery

Planning does not apply migrations or deploy. Later implementation first validates
empty/schema045 upgrades on disposable databases and least-privilege role denials.
Add `TURAS_011_DISABLED=1` for safe admission shutdown: reads/receipts/stop/settlement/
retention continue with current eligibility. Rollback is disable plus forward repair;
never remove durable decisions or uncertain provider receipts. Verify Preview before
an explicitly authorized Production release, using eve for explicit Vercel operations.
Do not claim those environments are validated by local or deterministic CI checks.

## Implementation status

Local implementation is under release validation. Migrations 046–047, all four story implementations and deterministic local checks are available. See [validation.md](validation.md) and [tasks.md](tasks.md) for source-bound receipts and remaining gates. Configured-provider evaluation, independent actual-output review, CI and hosted migration/release are not established by local fixtures.
