# Implementation Plan: Delivery plans and technical designs

**Branch**: `006-delivery-plans` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)
**Input**: `specs/006-delivery-plans/spec.md`
**Status**: Design and task generation complete; implementation is reserved for the next model session.

## Summary

Add a governed plans domain to the existing application. Immutable structured
revisions retain the twelve-section delivery template, diagrams, design decisions
and source lineage. An exact human decision atomically creates or links one
canonical engagement and freezes a milestone baseline. Replacements preserve the
engagement and all earlier accepted versions. Turi authors proposals through the
same domain in fresh, audience-bound planning conversations.

[Research](research.md) records current and legacy code findings and alternatives.
[Data model](data-model.md), [plan API](contracts/plans-api.md),
[UI](contracts/plans-ui.md), [agent/context](contracts/agent-context.md) and
[lifecycle/validation](contracts/lifecycle-validation.md) define implementation
boundaries. [Quickstart](quickstart.md) describes the later validation sequence.

## Technical Context

**Language/Version**: Node 24, TypeScript 7.0.2; installed Next.js 16.3.4,
React 19.2.6 and eve 0.67.1 conventions.
**Primary Dependencies**: Existing pg 8.23.1, Zod 4.5.4 and eve; no new package or
external integration planned. Deterministic React SVG and semantic HTML render
structured diagrams without executing user markup.
**Storage**: Existing Postgres 17 on Neon Preview; explicit migrations 029–031;
current private artifact store and eve state remain separate and preserved.
**Testing**: Vitest unit/contract/disposable database checks, CLI Playwright/WebKit,
eight bounded actual-output Turi cases, performance and paired recovery drills.
**Target Platform**: Local application using the selected Neon Preview app DB;
a separate marked Neon test DB and disposable clones; Linux CI uses disposable
PG17/pgvector. No Vercel link/deploy or Production access.
**Project Type**: Existing single web application and eve agent.
**Performance Goals**: p95 ≤2 seconds for list/detail/decision with 1,000 plans,
20 revisions each and five readers; 120-second drafting dispatch deadline with
terminal/unconfirmed settlement inside five minutes.
**Constraints**: Immutable scope/audience, current authorization and source checks,
128 KiB revision payload, 24 KiB model evidence context, one saved proposal per
admitted turn, explicit human decisions, unchanged root model/reasoning.
**Scale/Scope**: Four user stories, one customer and optional workload per plan,
English and synthetic/public data. Staffing/execution/reporting remain excluded.

## Constitution Check

| Principle | Before research | After design / required evidence |
| --- | --- | --- |
| I — Specify before implementation | Pass: bounded 006 stories and exclusions | Spec/contract/task traceability; no runtime code in this planning slice |
| II — Outcomes define maturity | Pass: charter and measurement, separate delivery states | Acceptance cannot change maturity, progress or commercial records |
| III — Provenance/lifecycle | Pass: source-backed assertions and explicit unknowns | Durable dependencies, source gates, whole-body withholding and purge tests |
| IV — Authorization before retrieval/action | Pass: current grants and explicit audience | Fresh session, delivery-only projection, reader-time citations and replay fences |
| V — Human decision rights | Pass: explicit reviewer and exact revision | Atomic decision, idempotency, source-state check; no agent acceptance tool |
| VI — eve core | Pass: installed tools/skills docs and existing dispatch | Used tools/skill only; selected model and reasoning unchanged |
| VII — Meaningful verification | Pass: required automated and actual-output gates | Unit/domain/HTTP, WebKit, source and race coverage, output review |
| VIII — Operable and recoverable | Pass: bounded attempts and explicit migration | Safe metrics, cancellation/reconciliation, separate test DB and paired recovery |

No constitutional exception. Plan acceptance authority follows the explicit administrator-only planning
default; code must implement that recorded policy, not infer authority from
customer read access or stewardship. No user confirmation is claimed.

## Project Structure

### Documentation (this feature)

```text
specs/006-delivery-plans/
  spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
  checklists/requirements.md
  contracts/plans-api.md
  contracts/plans-ui.md
  contracts/agent-context.md
  contracts/lifecycle-validation.md
```

### Source Code (planned changes)

```text
lib/contracts/plans.ts
lib/contracts/plan-content.ts
lib/server/plans/{policy,repository,commands,read,validation,diagrams}.ts
lib/server/plans/{sources,context,fences,drafting,model-budget,decisions,baselines,diff}.ts
lib/server/plans/{cleanup,telemetry}.ts
lib/server/engagements/{repository,read}.ts
lib/server/profiles/{read,context,attempt-context,tool-actor}.ts
lib/server/retrieval/{policy,search,citations,fences}.ts
lib/server/research/{policy,read,fences}.ts
lib/server/conversations/{repository,binding,dispatch,context-fence,projection,watchdog,reconcile,cancel}.ts
lib/server/artifacts/{context,context-fence,lifecycle}.ts
scripts/maintenance-worker.ts
agent/agent.ts                                   # preserve exact model and reasoning; add bounded resolver
agent/tools/{read_delivery_plan,save_delivery_plan_draft}.ts
agent/instructions/plan-context.ts
agent/skills/delivery-planning/SKILL.md
agent/hooks/{guard-customer-context,persist-conversation}.ts
app/api/plans/...
app/api/plan-drafting/...
app/api/engagements/...
app/(workspace)/customers/[customerId]/plans/{page,new/page,[planId]/page}.tsx
app/(workspace)/customers/[customerId]/engagements/[engagementId]/page.tsx
app/_components/plans/{plan-list,plan-editor,plan-detail,plan-review,plan-history,plan-diff,plan-diagram,plan-drafting}.tsx
app/_components/profiles/profile-overview.tsx
app/_components/agent-chat.tsx
migrations/029-delivery-plans.cjs
migrations/030-plan-decisions-baselines.cjs
migrations/031-plan-drafting-lifecycle.cjs
scripts/db-role-setup.sql
scripts/{test-plans,plan-eval-environment,check-plans-ui,benchmark-plans,plans-recovery-check,eval-plans,verify-plan-review}.ts
tests/fixtures/plans/{seed,journey}.ts
tests/{unit,integration,contracts,ui}/plan*.test.ts or plan*.spec.ts
evals/fixtures/006-plan-cases.json
```

Paths are proposed modules or named existing extension points. The existing
`scripts/maintenance-worker.ts` runs cleanup and watchdog work; add bounded plan
maintenance there rather than creating another process.

**Structure Decision**: One domain, existing transports and worker. Keep canonical
engagements separate from profile `engagement_reference` facts. No bulk legacy
migration or synthetic operating-model port.

## Phase 0 — Research decisions

R1–R10 in research.md settle persistence, legacy reuse, authority, audience,
durable citations, safe diagrams, atomic acceptance, bounded eve drafting and
isolated rollout. Legacy methodology informs content; its request-time DDL,
owner-only model and synthetic persistence are explicitly rejected. Framework
behavior is checked against installed docs; no planned dependency upgrade.

## Phase 1 — Design

### Plans, revisions and readable structure

A plan is a scoped aggregate with immutable audience and separate working and
accepted revision pointers. Each content revision is immutable. Mutable review
state is represented by append-only transition/decision events and a versioned
head. Payload rows can be removed by authorized lifecycle cleanup without altering
identity/digest/decision history. Current source status is computed, not frozen as
an eternal approval flag. Full constraints are in data-model.md.

Use typed section envelopes and structured assertions, milestones, diagrams,
solution-fit assessments and design decisions. Metadata/decision are server
projections. Human edits can be saved incomplete; submission runs semantic checks.
No dynamic arbitrary JSON editor is the product UI. Use progressive section forms
and a readable outline. Both value-proof and production-readiness work must appear
in the work plan or have a specific not-applicable explanation.

### Authority and audience

Reuse `lockProfileActor`; add current plan/workload/owner checks and a dedicated
plan-review capability. Scope-changing mutations are absent. Internal users may
read all customer plans; a partner can read an accepted delivery revision and its
own authored draft revisions. Another partner's unaccepted revision, rejected
internal proposal, receipt or count is hidden. Edit/submission rights for a partner
are limited to plans it created; it cannot take over another partner's draft.
Internal members may revise any customer plan; partner authored drafts can be
reviewed by authorized internal reviewers.

Human review of a delivery revision attests that its manual and generated content
is delivery-appropriate. Source selection for that revision is always delivery-only,
even for internal authors. Decisions bind the same audience and exact digest;
there is no internal-to-delivery toggle or automatic publication of prior history.

### Source identity, readiness and historical content

Map each asserted fact to plan-owned dependencies on original revision IDs,
generations, content digests and locators. At save, convert current 005 ephemeral
citations to these durable records after authorization; readers resolve original
sources under their own session without the author's expired search receipt.
Retain a dependency union for the whole generated revision, including all context
that entered the model. Shared public references contain only sanitized shared
IDs; transitive lineage remains restricted and rechecked by server policy.

A review preview captures exact plan digest, current context/source-state digest,
reviewer and expiry. Acceptance rechecks the preview and sources transactionally.
Source revocation, deletion or loss of authorization withholds the whole affected
revision body and all derived display payloads. Its list row becomes a generic
restricted-content label with permitted status, never a cached title or excerpt.
Freshness aging alone keeps a dated historical baseline readable with a warning;
it blocks critical current recommendation use and acceptance. Corrections and
withdrawal require a new revision; history never silently changes to a new source.

Draft repair starts a new revision with eligible inputs. No copied hidden body is
sent to the browser/model to make repair convenient. No plan is indexed as accepted
customer fact or shared practice in 006.

### Exact acceptance and one engagement

Lock actor/customer authority, then plan/preview/engagement rows, then original
source/lineage headers in stable kind/ID order. Source-changing domain paths acquire
the same header locks before writing events or generations; bounded deadlock
retries are limited to transactions with no external side effect. The transaction validates all source and
scope checks, then creates the engagement if needed, records the decision and
milestone baseline, updates accepted pointers and stores the idempotent receipt.
Database same-scope foreign keys and unique plan/engagement/baseline constraints
backstop application checks. A second key racing the same submitted revision
returns a conflict; the same key/payload returns its existing receipt after current
authorization. Request-changes/reject never create an engagement.

The profile displays canonical engagement summaries through the new read domain;
acceptance does not insert an accepted profile fact. Descriptive references from
003 remain descriptive. No execution phase, staffing commitment or completed
milestone is inferred from plan acceptance.

Revisions compare against the accepted baseline using stable element IDs and
normalized structured values. The change summary records added/removed/changed
scope, diagrams, work, milestones and evidence. Acceptance of a replacement retains
the same engagement and marks its prior baseline superseded via append-only history.

### Bounded Turi proposal path

The UI creates a private fresh planning conversation and an admitted drafting
attempt with immutable scope/audience/base revision. Extend every context reader,
retrieval policy and replay fence to use that audience. Current actor kind remains
an upper bound: no partner internal context. Workload context includes customer-wide
records plus the selected workload only. Unverified selections, prior unrestricted
chat and unrelated research runs cannot enter the planning conversation.

Turi uses the on-demand delivery-planning skill, eligible context and draft-save/
read tools. A tool takes the server-bound attempt as authority, not arbitrary model
customer/owner/audience fields. Save exactly once per attempt using a stable key;
validate all referenced sources before committing. After completion, private chat
can link to the saved proposal; it is not the canonical plan record.

Retain the existing 120-second dispatch timeout and standard cancel/watchdog/
reconciliation. The admitted attempt may settle as saved even if its final chat
acknowledgement is lost. Every retry checks the saved receipt first. No automatic
new paid turn, no acceptance tool and no hidden external research request.

Enforce the six-step cap before a provider call using eve's documented dynamic
`step.started` model resolver, preserving the exact configured model and reasoning
for all calls. For planning only, wrap that same model with existing AI SDK
`wrapLanguageModel` middleware that clamps `maxOutputTokens` to 4096. Persist step
admission and fail before the call on expiry, cancellation, changed context or
uncertain prior execution. Ordinary hooks are observers, not the claimed hard
budget boundary. Record reported usage from deduplicated `step.completed` events;
unknown usage does not count as a passed cost/evaluation gate. No invented eve
`maxSteps` or HTTP send setting. Planning tools and other authored context readers
must honor the binding; preserve currently disabled shell/file/web/delegation tools.

### Operations, rollout and recovery

Add 006-only readiness at schema 031 and `TURAS_006_DISABLED=1` to block new 006
work. Existing 002–005 behavior keeps its own gates. With 006 disabled, authorized
history reads remain available only if source checks still succeed; do not bypass
005 source eligibility when 005 itself is unavailable.

Migration 029 adds aggregate/revision/payload/source records; 030 adds decisions,
previews, canonical engagements and baselines; 031 adds planning sessions, attempt
bindings, command receipts and cleanup support. Make role grants and immutability
triggers part of the explicit migration validation, not request execution.
No backfill converts profile notes into engagements. Populated rollback disables
006 intake and uses forward repair; destructive down migration is confined to
empty disposable validation. Paired recovery preserves database, artifact store
and native workflow state. The implementation runbook uses the known Neon test
clone path and does not recreate the removed OrbStack containers.

## Implementation sequence

1. Foundation: contracts, schema, authorization, readiness and source projection.
2. US1: manual authoring, technical design, current reads and history.
3. US2: fresh planning context, bounded Turi attempts/tools/skill and saved drafts.
4. US3: exact human review, atomic engagement/baseline and profile integration.
5. US4: structured revision diff, replacement, source lifecycle and cleanup.
6. Cross-cutting verification: eight actual outputs, WebKit, performance, migration/
   recovery and the end-to-end trusted-context journey; update validation evidence.

US3 can be implemented after US1 without model availability. US2 and US3 can be
worked independently after shared contracts/context guards stabilize. US4 requires
US3's baseline lifecycle. The smallest useful increment is US1 manual plans;
feature 006 completion requires all four stories and gates.
