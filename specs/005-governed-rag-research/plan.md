# Implementation Plan: Governed retrieval, research and evidence quality

**Branch**: `005-governed-rag-research` | **Date**: 2026-09-28 | **Spec**: [spec.md](spec.md)
**Input**: `specs/005-governed-rag-research/spec.md`
**Status**: Local implementation and validation complete on the unmerged feature branch; selected Turi model preserved. Hosted release remains out of scope.

## Summary

Add one governed retrieval domain over approved customer projections, attributed
research and sanitized shared publications. Postgres full text plus exact pgvector
search produces current-authorized citations for UI and Turi. Application-owned
research receipts and one bounded eve workflow preserve origin and query scope.
Extend existing approval, quality, lifecycle, cleanup and conversation fences.

Phase 0 decisions are in [research.md](research.md). Phase 1 contracts are in
[data-model.md](data-model.md), [retrieval](contracts/retrieval.md),
[shared knowledge](contracts/shared-knowledge.md), [research execution](contracts/research.md)
and [lifecycle/validation](contracts/lifecycle-validation.md). The
[quickstart](quickstart.md) is the implementation validation guide.

## Technical Context

**Language/Version**: TypeScript 7.0.2, Node 24; preserve installed Next.js 16.3.4,
React 19.2.6 and eve 0.67.1 conventions.
**Primary Dependencies**: Existing pg, Zod, AI SDK and eve; pgvector 0.8.6 extension;
minimal Context.dev Search HTTPS adapter, no provider SDK; a pinned non-executing HTML
parser selected/audited during setup if existing dependencies cannot safely
normalize HTML. No broad connector or new orchestration service.
**Storage**: Postgres 17 (explicit vector extension/migrations), private local
artifact store for existing originals; purgeable fetched-body staging outside public/.
**Testing**: Vitest, real disposable Postgres/pgvector, deterministic provider
fixtures, opt-in real embeddings/research/agent evals, CLI Playwright/WebKit.
**Target Platform**: Local Node app and Neon Preview database with a separate disposable Neon test database; Linux CI remains planned. No Vercel link or deployment in this slice.
**Project Type**: Existing single Next.js/eve app with shared server domain services.
**Performance Goals**: Spec SC-004: p95 ≤2 seconds after query embedding, 5,000
eligible passages and five readers, healthy index convergence ≤60 seconds.
**Constraints**: Current source and authority gates at every release boundary;
10 results/24 KiB, bounded egress and replay, preserve root model and app DB/state.
**Scale/Scope**: English text/search baseline; existing 004 locators and partial OCR;
four stories, one customer per customer query, platform shared publication, local
synthetic/public data. Declare English coverage and reduced coverage for other
languages without adding a language-detection service.

## Constitution Check

| Principle | Before research | After design / evidence required |
| --- | --- | --- |
| I — Specify first | Pass: bounded 005 and explicit exclusions | FR/SC traceability in tasks; no implementation yet |
| II — Customer outcomes | Pass: search relevance is not maturity | No maturity/commercial calculations change |
| III — Provenance/lifecycle | Pass: accepted, researched and published stay distinct | Exact receipts/locators, quality-v1, lifecycle tests |
| IV — Authorization | Pass: separate customer/shared scopes | Materialized prefilter, postcheck, output/replay and private lineage tests |
| V — Decision rights | Pass: administrator publication confirmed | Exact revision, rights, rationale and idempotent review; no external sends |
| VI — eve core | Pass: installed docs and registry investigated | Authored workflow and existing domain/guards; selected model preserved |
| VII — Verification | Pass: required gates specified | Real semantic and actual-output evaluation plus CI separation |
| VIII — Operability | Pass: bounded jobs and explicit migration | Leases, operation receipts, cancellation, cleanup and recovery drill |

No constitutional exception is requested. The user confirmed internal-administrator
publication in clarify. Missing live
credentials block those specific implementation acceptance checks, not planning.

## Project Structure

### Documentation (this feature)

```text
specs/005-governed-rag-research/
  spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
  checklists/requirements.md
  contracts/retrieval.md
  contracts/shared-knowledge.md
  contracts/research.md
  contracts/lifecycle-validation.md
```

### Source Code (planned changes)

```text
lib/contracts/{retrieval,knowledge,research}.ts
lib/server/retrieval/{policy,projections,chunker,embeddings,jobs,search,citations,context,fences,cleanup,telemetry}.ts
lib/server/knowledge/{policy,service,read,lineage}.ts
lib/server/research/{policy,requests,execution,discovery,fetch,normalize,ingest,refresh}.ts
lib/server/profiles/{context,artifact-excerpts,quality,conflicts,eligibility,attempt-context}.ts
lib/server/conversations/                         # existing dispatch/history/projection boundaries
agent/tools/{search_evidence,research,propose_research}.ts
agent/instructions/{retrieval-context,research-context}.ts
agent/hooks/{guard-customer-context,persist-conversation}.ts
app/api/{retrieval,knowledge,research}/
app/(workspace)/knowledge/page.tsx
app/_components/{knowledge,research}/
app/_components/profiles/                         # source search, quality and review entry points
migrations/019-retrieval-projections.cjs
migrations/020-shared-knowledge.cjs
migrations/021-research-runs.cjs
migrations/022-retrieval-context-fences.cjs
migrations/023-knowledge-submit-and-retention.cjs
migrations/024-research-request-revisions.cjs
migrations/025-research-discovery-results.cjs
migrations/026-research-review-conflicts.cjs
migrations/027-bounded-receipt-retention.cjs
migrations/028-research-normalized-origin.cjs
infra/retrieval/postgres.Dockerfile
scripts/{prepare-retrieval,retrieval-worker,check-retrieval,retrieval-recovery-check}.ts
scripts/eval-retrieval.ts
scripts/{eval-research,verify-research-review,retrieval-eval-environment,benchmark-retrieval}.ts
tests/{unit,integration,contracts,ui}/
evals/fixtures/005-retrieval-governance.json
```

**Structure Decision:** Add modules within the existing app, not a second service.
New paths above are planned. Reuse current profiles/artifacts and conversation
policy functions. No runtime subagents, public memory backend or hosted adapter.

## Phase 0 — Research resolved

Research decisions R1–R10 establish the stack, provider choice, egress boundary,
roles, budgets, confirmed publication authority and evidence gates. Every planned integration
has a used call site and failure path. Implementation must verify exact dependency/
container digests before lock changes; that is a setup task, not a missing design.

## Phase 1 — Architecture and contracts

### Authorized source projection and search

Project eligible accepted profile fields and reviewed excerpt spans; do not embed
raw profile JSON. Partner projection contains delivery fields only, and restricted
source attestations never reveal underlying private text. Shared public rows carry
no customer/workspace lineage pointer in reader DTOs. A database materialized
eligible candidate relation precedes lexical and exact vector scoring, preventing
unauthorized rows from affecting either ranking branch. Recheck authority, current
source head, transitive support, lifecycle and freshness before delivery.

Chunk within an existing unit/approved span, max 2,000 characters, no overlap that
crosses approval boundaries. Exact citations resolve complete multi-unit spans,
not only the first unit currently exposed by `artifact-excerpts.ts`. Query and
index vectors share `embedding-v1` (model/dimension/normalization/chunker digest).
Use one query embedding, top 30 each branch, RRF k=60, max 10 results/two per source
revision and 24 KiB; no semantic fallback model. Lexical degraded mode is explicit.

### Shared publication

Private candidate author/source workspace remains separate from public sanitized
payload and restricted lineage. Any currently source-authorized member may propose;
an active internal administrator with current access to all source lineage may
publish/reject/withdraw. Admins have existing steward authority. All active members
in the environment can read current eligible shared payloads, including across
workspace/customer grants. Reviewer-only lineages are never joined into public
search DTOs. Exact publication checks use current source approval, rights,
sanitization checklist, public-safe quality rationale and version/digest.

Eligible source corrections immediately suspend dependent shared use through
lineage checks; a worker materializes suspension and cleanup. Republish needs a
new reviewed revision. Limit lineage to accepted profile revisions and checked
research revisions (with their transitive artifact support); do not permit
shared-to-shared publication dependency cycles in 005.

### Research responsibilities and user admission

A research panel creates a private request with an explicit public identity or
public product/topic fields, exact outbound query preview and limits. Starting
that request authorizes only its scope and attaches its opaque request ID to an
owned customer conversation turn through the existing dispatch contract. Turi's
workflow tool consumes that admitted ID; arbitrary model-provided URLs/query text
cannot bypass admission. If Turi identifies a gap, `propose_research` creates an
editable preview without egress; the user starts it. An admitted request not
consumed before its deadline expires visibly.

Recon and practices use deterministic search plans; fetch/normalize and origin
checks happen in replay-safe steps. Retained factual evidence is an attributed
verbatim observation. The fit mode has no external API capability and returns
eligible input/citation receipts for root Turi synthesis. It can propose a new
bounded request for a gap. This fulfills role separation without additional
model sessions or unbounded child retries.

Keep the synthetic ingest unchanged and add server-owned evidence receipts.
Restrict HTTPS with pinned DNS targets, no private/reserved IPs, redirects checked
at every hop, no cookies/auth, bounded inert HTML/text parsing, no browser/scripts.
A user URL and its aliases remain user-origin; refresh/copy does not launder them.
Primary product source policy is explicit and claim-specific; all other authority
ratings default conservatively until steward review. Search snippets cannot be
used as verified passages. Cross-workspace public fetch caching is not introduced.

### Durable jobs, context and lifecycle

The existing supervised maintenance process gains retrieval indexing and cleanup
lanes; eve remains the research workflow orchestrator. Postgres stores authority,
leases, operation reservations, evidence receipts and terminal state. Do not add
a competing research job engine. Maintenance expires/cancels stale admitted work,
marks evidence due and schedules index/cleanup jobs without live external refresh.

Before egress and model/context release, validate current actor, session, grants,
request scope, source generations, deadline and cancellation. Side-effect steps
reserve an operation once. Completed replay returns its receipt. An operation
found dispatched with unknown outcome becomes unconfirmed; never blindly repeat
paid search/embedding calls. Idempotent read fetch retries are bounded. No SQL
locks are held during network operations.

Consumed retrieval/research/shared dependencies accumulate across the entire
native session, including previous turns and tool results. Extend current output,
title, history, reconnect and resume fences; validate on every model step and
before each emitted/projected chunk. Withdrawal can redact generated history while
retaining owner-authored text as already implemented in 004. Invalid native state
uses existing retirement/quarantine behavior; no provider-erasure claim.

### Quality, refresh and conflicts

Reuse `rateEvidence`; no new weights or probability interpretation. Separate
`discovery` results from `current_fact` use. Discovery may show stale/weak/conflicted
eligible source history with caveats; current_fact excludes weak/insufficient,
stale/unknown or materially conflicted support. Rejected, withdrawn, unsupported
and unauthorized sources are absent from both. Recompute as-of ratings and the
minimum validity deadline at read time; quality snapshots are explanations.

Extend conflict targets to exact accepted profile, research and shared revisions.
Customer stewards confirm/resolve customer conflicts; internal administrators do
so for shared conflicts. Automated suggestions are flags only. Every resolution
uses exact endpoint versions and rationale; revisions preserve history. A refresh
compares content/date provenance, records unchanged retrieval observations, and
creates new checked evidence only if source content or supported dated observation
changes. It never accepts user-origin context or auto-publishes a shared update.

### Operations, migration and rollback

019–028 are additive explicit migrations. The vector extension must be installed
by the migration role on a pgvector-capable PG17 instance; the runtime cannot DDL.
CI and recovery checks use a pinned digest prepared during implementation. New
005 routes/worker lanes require schema 028 plus vector/contract readiness; 002–004
readiness remains compatible. Never install or migrate in a request handler.

Backfill only eligible projections with durable deduplicated jobs. Writes use
lifecycle/digest/generation and current lease compare-and-swap. Indexes can rebuild
without replaying provider actions or recreating approvals. Logical revocation
is immediate even while cleanup lags. Healthy local cleanup target is 60 seconds;
failed cleanup is retried at most three times and visibly requires operator retry.

Validate 018→028 and empty initialization on disposable databases, matched
store/database restore, lease reclaim and stale replay. Preserve the selected
application database and `.eve/.workflow-data`. Forward recovery is preferred;
rollback disables new intake and restores matched snapshots, without dropping
populated tables or reactivating withdrawn knowledge. Read-only 002–004 behavior
must remain available when 005 prerequisites are missing.

## Implementation sequencing and verification

Setup/contracts → scoped projections/jobs/fences → US1 search/citations → US2
shared publication → US3 public research → US4 refresh/conflicts → integrated
recovery, UI and actual-output evaluation. Author the failing authority/lifecycle
checks before their corresponding behavior. Story independent tests and optional
parallel file groups are recorded in tasks; shared migrations and fences serialize.

Deterministic CI covers all API/domain/race paths with provider fixtures. Local
opt-in live evaluation proves embeddings and public research on public/synthetic
inputs, then reviews 12 actual model cases within fixed budgets. Run all required
checks once; repeat only for a change or failure. Keep README, roadmap and final
feature status in the same implementation PR per user direction. Stop this
planning workflow after tasks and read-only analysis, before implementing tasks.

## Complexity Tracking

No constitution violations. The added vector extension serves semantic retrieval;
the authored external adapter serves exact egress/provenance controls unavailable
from the inspected built-in surface. Both are bounded by explicit contracts.
