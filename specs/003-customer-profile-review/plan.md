# Implementation Plan: Customer profiles, maturity and context review

**Branch**: `003-customer-profile-review` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Input**: Clarified feature specification in `specs/003-customer-profile-review/spec.md`.
**Status**: Research, design and [task breakdown](tasks.md) complete; analysis findings remediated; implementation and local validation in progress. See [validation.md](validation.md) for actual checks and remaining acceptance work.

## Summary

Extend the existing customer directory into scoped, historical profiles. All manual
profile facts use an immutable revision and steward-review lifecycle. A shared
server domain layer supplies explicit internal and partner projections to pages,
HTTP routes and two bounded eve tools. Independent research stays attributed and
uses a trusted ingestion contract; discovery and RAG remain in 005.

PostgreSQL transactions protect review decisions, accepted pointers, audit events
and context generations. Current quality is calculated from a versioned rubric.
Maturity dimensions, journey stage, delivery phase and record review state remain
separate. Context-generation checks prevent stale native conversation history from
continuing to influence new guidance after retraction or audience changes.

## Technical Context

**Language/Version**: Node 24; TypeScript 7.0.2; React 19.2.6.

**Primary Dependencies**: Existing Next.js 16.3.4, locked eve 0.67.x/AI SDK 7,
Zod 4.5.4, pg 8.23.0 and node-pg-migrate 9.0.0. No new dependency or integration.
Resolve eve's installed version and docs from the lockfile at implementation time;
preserve `agent/agent.ts` model selection.

**Storage**: Existing PostgreSQL 17 environment; additive explicit migrations after
006, manifest checksums, immutable revision/event records and scoped relational
keys. Native eve session persistence remains the 002 conversation runtime.

**Testing**: Vitest unit/integration/contracts; disposable Postgres fixtures;
Playwright/WebKit desktop 1440×900 and mobile 390×844 in both themes; axe checks;
local bounded performance fixtures and opt-in live behavior evaluations.

**Target Platform**: Local macOS development and existing Linux CI; root
`npm run dev` supervises web, eve and maintenance worker. Hosted readiness is deferred.

**Project Type**: Authenticated web application with HTTP interfaces and eve tools.

**Performance Goals**: SC-007: p95 authorized profile view within 2 seconds with
100 synthetic customers and 25 records each. Default page size 25, maximum 50;
context tool at most 20 records and 24 KiB per result with explicit truncation.
No database transaction remains open during a model call or stream.

**Constraints**: Synthetic/public data; three demo principals; no automatic deploys;
private chats; current server authorization; manual factual approval; delivery-only
partner data; additive migrations; no attachments, active research, RAG, shared
publication, engagement execution or operational metric dashboards in 003.

**Scale/Scope**: Five user journeys, customer/workload profiles, eleven typed record
kinds, customer stewardship, context/source revisions, conflicts, quality, review
history and a small profile UI. Fixed demo fixtures plus 100-customer performance
fixtures. Full identity and private-data pilot policy remain later work.

## Constitution Check

Pre-research gate: PASS. The clarified spec supplies scope and decision rights;
research resolves implementation uncertainties without changing those decisions.

| Principle | Design evidence | Post-design gate |
| --- | --- | --- |
| I. Specify first | FR/SC coverage below; tasks are generated next | PASS |
| II. Outcomes define maturity | Versioned six-dimension rubric, explicit evidence/unknowns, no averages | PASS |
| III. Evidence lifecycle | All manual record kinds pending; source origin immutable; separate review and withdrawal events | PASS |
| IV. Authorization first | Domain/SQL projection before counts/search; source and transcript protection; tool authority bound to session | PASS |
| V. Human decisions | Exact-revision stewardship, explicit retraction authority, transactional receipts | PASS |
| VI. eve core | Two ordinary domain tools; installed docs reviewed; no connector or runtime-model change | PASS |
| VII. Verification | Races, denials, evidence dates, WebKit, live eval and scripted profile journey evidence | PASS |
| VIII. Maintainability | Bounded reads/writes; append-only audit; migration/readiness/grants; redacted observability | PASS |

No constitutional exception is required. Existing synthetic bootstrap names are
explicit `authorized_system` baseline records, not an exception for future manual
edits. The synthetic profile journey is a scripted behavior check, not a claim about
human task-completion times.

## Project Structure

### Documentation (this feature)

```text
specs/003-customer-profile-review/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── profile-api.md
│   ├── agent-context.md
│   └── profile-ui.md
└── checklists/requirements.md
```

The [task breakdown](tasks.md) is generated. Implementation validation records are
created as actual work and checks proceed.

### Source Code (repository root)

Planned additions/extensions, not a claim these files already exist:

```text
app/(workspace)/customers/page.tsx                 # directory/profile links
app/(workspace)/customers/[customerId]/page.tsx    # overview and record sections
app/(workspace)/customers/[customerId]/review/page.tsx
app/_components/profiles/                        # record forms, history, review, evidence
app/api/customers/[customerId]/                   # profile/read/commands/stewardship routes
lib/contracts/profiles.ts                        # strict command/read schemas
lib/server/profiles/
  service.ts, repository.ts, policy.ts, projection.ts
  revisions.ts, review.ts, research.ts, quality.ts, maturity.ts, context.ts
lib/server/conversations/                        # authority, generation and stale-history fences
agent/tools/customer_context.ts                  # bounded read
agent/tools/propose_customer_context.ts           # pending only
agent/instructions.md                            # accurate capabilities and evidence labels
agent/instructions/customer-context.ts           # bounded user-role snapshot at turn start
agent/hooks/guard-customer-context.ts             # fail closed before each model step
migrations/007-profile-context.cjs                # entities, revisions, review and evidence
migrations/008-profile-context-fences.cjs          # context generations and attempt authority
scripts/seed-profile-demo.ts                      # fixed synthetic/public fixtures
scripts/benchmark-profiles.ts                     # SC-007 dataset and timings
scripts/db-role-setup.sql                         # immutable table privileges
scripts/db-migrate.ts, migrations/manifest.json    # existing migration mechanism
lib/server/db/readiness.ts                       # profile-compatible schema requirement
tests/unit/                                      # quality, schemas, projections, rubric
tests/integration/                               # transitions, concurrency, migration, fences
tests/contracts/                                 # HTTP/tool/stream contracts
tests/ui/profiles.spec.ts, profile-review.spec.ts
evals/fixtures/003-context-governance.json
```

**Structure Decision**: Continue the existing single application, shared domain
modules and typed transport boundaries. Typed revision payloads use Zod; scope,
state, audience and indexed selectors remain relational. Do not add a generic
workflow engine, external index or second permissions implementation.

## Delivery design and order

1. **Persistence and domain rules:** Implement migrations, immutable envelopes,
   typed payloads, customer/workload identity behavior, stewardship, quality/rubric
   and transactional command receipts. Prove migrations and approval races first.
2. **Profile reads and partner projection:** Expose current records, safe history,
   scoped search and counts. Filter dependencies and provenance as well as parent
   records. Existing directory/picker names change only after approval.
3. **Review and profile interaction:** Build overview, proposal forms, evidence
   detail and steward queue in the reference style. Share a selected chat claim by
   explicit user action; do not expose the surrounding private conversation.
4. **eve context and invalidation:** Add bounded read/propose tools, attempt-bound
   current authority, source citations, audience-specific generations, freshness
   deadlines and explicit fresh-conversation recovery. Keep native reset denied.
5. **Acceptance evidence:** Complete denial/race/withdrawal tests, WebKit states,
   bounded performance and representative behavior evaluations. Record actual
   scripted journey results and outstanding evidence honestly.

This ordering informs `$speckit-tasks`; it is not a substitute for that task list.

## Analysis remediation decisions

U1: Canonical keys in [data-model.md](data-model.md) define singleton customer and
workload details, scoped product use and scoped maturity; seven other kinds remain
lists. Database uniqueness and transactional root resolution prevent duplicate
heads. Accepted pointers define current state, with explicit older-window review
and no fallback after retraction. T003/T005/T008/T013/T025/T028/T037/T039 verify it.

U2: Immutable `qualityInput` belongs to the reviewed candidate or trusted research
revision. Contributors propose; stewards confirm exact inputs; missing values use
recorded unknown defaults. Corrections create new revisions, while only F/Q age
with the clock. Contracts define fields, authority and provenance. T006/T014/T018,
T043/T047/T053 and T061/T064–T068 cover the complete workflow.

I1: US3 acceptance scenarios 6–7 now explicitly define context-change/time-expiry
history suppression, unbound 002 conversations and fresh-session recovery.
T045/T055 verify preserved owner messages, hidden generated content, no summary
transfer, and current authorization. These are planned behaviors, not completed
implementation or validation.

## Traceability and validation

| Spec requirements | Design responsibility | Required evidence |
| --- | --- | --- |
| FR-001–003 | Stable identities and typed accepted profile records | Name approval sync, two workloads, sparse fields, product states/history |
| FR-004–006 | Maturity rubric and distinct engagement references | Six dimensions, unknowns, source lineage, no automatic stage change |
| FR-007 | Risk payload and audience | Scoped severity/status history, internal operations excluded |
| FR-008–011 | Revision/review/retraction service | Every record kind pending; exact-version decisions, self-review audit, retry/race/steward revocation |
| FR-012–015 | Sources, trusted research, conflicts, deterministic quality | Origin forgery denial, direct passages, age boundaries, withdrawal dependencies |
| FR-016–018 | Shared projection and conversation fences | Cross-workspace/customer denial, hidden counts, private-chat isolation, stale native replay/tool/stream denial |
| FR-019 | Profile/review UI | Four WebKit projects, keyboard/focus, empty/error/conflict states, axe |
| FR-020 | Fixed synthetic/public fixtures | No imported demo/customer secrets, no enabled external tools/deploy |
| SC-001/006 | Scripted synthetic journey | Two-workload/25-record profile in four CLI WebKit projects; existing exact-review lifecycle test |
| SC-002–005 | Automated and representative agent validation | All denial/state/rubric assertions; actual live-response review |
| SC-007 | Local benchmark and WebKit | 100×25 dataset, p95 view timing <2s, usable 390px/1440px views |

## Observability, rollout and recovery

Use existing correlation IDs and redacted logs. Record operation type, opaque IDs,
actor membership, decision/outcome, duration, request receipt and schema/rubric
version; do not log payloads, passages, passwords, URLs or model prompts. Track
review conflicts, denied reads, stale-generation cancellations and unavailable
storage as bounded counters. Domain audit is separate from routine telemetry and
only its authorized projection is user-visible.

Apply migrations explicitly to the isolated local database, then runtime grants,
then fixed profile fixtures. Verify an upgrade from 006 and a clean initialization
on disposable databases. Stop app/worker before restoring a local backup. Never
edit existing migration hashes or migrate from requests. A failed migration stays
unready; no empty-profile fallback may masquerade as success.

For application rollback, disable 003 routes/tools and keep the new data; do not
run 002 against a schema it cannot safely interpret. Prefer a forward fix or
restore a pre-upgrade disposable backup for testing. Once accepted profile data
exists, destructive down-migration is not a normal rollback. No Vercel reconnection
or deployment forms part of this plan. Update README/roadmap to distinguish
planned, implemented, locally validated and merged states.

## Complexity Tracking

No constitutional violations. Context-generation fencing is required because
native session history persists old facts; explicit new conversations avoid the
larger complexity of editing or rebinding that history. Immutable typed revisions
reuse one review mechanism across record kinds without a general workflow engine.
