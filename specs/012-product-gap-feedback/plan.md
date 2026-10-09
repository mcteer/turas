# Implementation Plan: Product Gaps and Engineering Feedback

**Branch**: `012-product-gap-feedback` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: `specs/012-product-gap-feedback/spec.md`

**Status**: Planning complete; implementation not started.

## Summary

Build an internal evidence-backed gap registry, mcteer-reviewed impact and canonicalization, deterministic distinct-customer counts, engineering detail/portfolio reports and human-reported handoff receipts. Use one governed `gaps` domain across routes, workers and report generation. Reuse current evidence/authority/private-store primitives through scoped adapters; do not inherit 011 owner decisions or 009 partner/report-send policy.

The user authorized specify → clarify → plan → tasks → read-only analyze and a handoff for a model switch. All work stays in `/Users/mcteer/Projects/turas`; use the feature branch there and no sibling worktree. Runtime/model/customer-data changes and hosted migrations are implementation/release work outside this planning turn.

## Technical Context

**Language/Version**: Existing TypeScript, Node.js 24, React 19 and Next.js 16; preserve the lockfile.

**Primary Dependencies**: Existing Next.js, pg, Zod, Vitest, CLI Playwright/WebKit and eve runtime. No new package, agent/tool/connector, model call or external delivery integration.

**Storage**: PostgreSQL 17/pgvector already installed. Explicit provisional migrations 048 (gap/impact/canonicalization/receipts) and 049 (reports/disclosure/jobs/artifacts/handoff/cleanup). Existing private environment-marked report store via low-level file primitives; separate 012 object catalog. No request-time DDL.

**Testing**: Unit/contract/integration tests required by FR-020, owned disposable PostgreSQL runners, exact artifact checks, four WebKit projects, canonical load fixture and paired recovery. Documentation checks for this planning change only.

**Target Platform**: Current local/CI web application and maintenance worker. Hosted resource/migration/deployment/acceptance gates remain separate.

**Project Type**: Existing full-stack web application with governed domain services and private artifacts.

**Performance Goals**: SC-005's exact 200-customer/2,000-gap/10,000-observation/40,000-revision corpus; five concurrent readers; ordinary operation p95 ≤2 seconds; 100-gap report preparation ≤30 seconds.

**Constraints**: C01–C16 in [data-model.md](data-model.md), current authorization before retrieval and final release, complete source closure, atomic reviewed merge/split, deterministic counts, exact report/audience disclosure, no output/send inference, bounded private retention.

**Scale/Scope**: Four stories; internal users only. App report views plus Markdown/JSON exports. No PDF/PPTX renderer, schedule/email/ticket integration, public/partner aggregates, model clustering, new RAG index, learning or MCP.

## Constitution Check

| Principle | Pre-design gate | Post-design result |
| --- | --- | --- |
| I Outcome before implementation | Bounded 012 scope and four independently testable stories | Spec, research, data model, contracts, validation guide and traceable tasks; implementation remains unstarted |
| II Customer outcomes | Gap impact is separate from maturity/commercial score | Deterministic versioned counts/order, accepted need evidence and no invented ARR |
| III Evidence lifecycle | Original provenance/acceptance must survive reports and merges | Exact original closure, per-critical-source checks, withdrawal fences and minimal audit |
| IV Authorization | All scopes and partner denial before retrieval/count/release | Live authority prefix, internal-only domain, per-customer disclosure and current stream fences |
| V Human decisions | User confirmed mcteer-only triage/report/handoff | Exact versioned previews/decisions, idempotency and human-reported events |
| VI eve core | Existing runtime/model preserved | No new agent capability or integration; no unnecessary framework changes |
| VII Meaningful verification | Required access/state/calculation/UI/recovery checks | Complete owned suite/UI manifests and independently expected count/artifact fixtures |
| VIII Operability | Bounded persistence/jobs/cost and explicit migration | C13–C16 deadlines/retention/disable, staged private files, no provider calls, forward recovery |

All gates pass before and after design; no constitution exception is proposed.

## Project Structure

### Documentation

```text
specs/012-product-gap-feedback/
  spec.md
  checklists/requirements.md
  plan.md
  research.md
  data-model.md
  contracts/domain.md
  contracts/http-ui.md
  contracts/reports-handoff.md
  quickstart.md
  tasks.md
  handoff.md
```

### Planned source (files do not exist until implementation)

```text
lib/contracts/product-gaps.ts
lib/product-gaps/{content,products,canonical,impact,ranking,report-document,report-markdown,report-manifest,retention}.ts
lib/server/gaps/
  {policy,repository,commands,http,schema,telemetry}.ts
  {sources,dependencies,eligibility,projection,invalidation}.ts
  {service,impacts,review,previews,canonicalization,counts,ranking}.ts
  {reports,report-jobs,report-review,report-release,report-artifacts,store,handoffs,maintenance}.ts
app/(workspace)/product-gaps/page.tsx
app/(workspace)/product-gaps/[gapId]/page.tsx
app/(workspace)/customers/[customerId]/product-gaps/page.tsx
app/(workspace)/product-gaps/reports/[reportId]/page.tsx
app/api/product-gaps/**/route.ts
app/_components/product-gaps/{client,pending}.ts
app/_components/product-gaps/{registry,detail,editor,impact,review,duplicates,report,disclosure,handoff,history}.tsx
migrations/048-product-gaps.cjs
migrations/049-gap-engineering-reports.cjs
scripts/{test-gaps,gaps-eval-environment,gaps-ui-check,gaps-benchmark,gaps-recovery-check,gaps-regressions}.ts
scripts/{gaps-suites,gaps-ui-journeys}.json
scripts/prepare-gap-store.ts
lib/server/gaps/worker.ts
tsconfig.product-gaps.json
```

Planned tests are enumerated exactly in tasks and quickstart. Existing touch points: migration manifest and runtime grants, authenticated route/session helpers, app-shell/profile navigation and URL redaction, source-mutation invalidation hooks, existing scripts/reports-worker.ts scheduling, package scripts, CI, documentation and feature-source digest utilities. Do not create placeholder files or install infrastructure during planning.

**Structure Decision:** Keep pure contracts/calculations separate from server policies. Use the existing application/worker; do not duplicate 009's rendering/send subsystem. Adapter reuse must retain original evidence/authority semantics and tests.

## Architecture and sequence

1. Establish strict contracts, synthetic fixtures, owned runner and explicit migrations/least-privilege grants. Preserve selected `.env.local` and `.eve/.workflow-data`; generated test roots are under ignored `local-artifacts/012` and must be removed by their owned runner. Do not copy `node_modules/.cache` or create sibling checkouts.
2. Build a global authority/source lock adapter. Discover bounded metadata under authorized scope, lock current authority and originals in one order, re-read the closure and reject material changes. Reuse original-source validation, not customer-specific decision policies.
3. Deliver US1 end-to-end with immutable gap/impact revisions, exact review, source eligibility and accessible UI.
4. Deliver US2 atomic relation changes, versioned set-based counts and ranking; property/boundary fixtures define expected sets independently of implementation.
5. Deliver US3 deterministic structured documents and bounded durable preparation, private staged artifacts, exact disclosure review and mcteer-only export. Current source/relation checks remain independent of cleanup timing.
6. Deliver US4 immutable manual handoff/corrections, attributed follow-up and needs-human-follow-up flags. No provider send or external fetch exists.
7. Complete retention/disable/recovery/load/regression/WebKit acceptance; record proof by source/environment. Prepare a focused implementation PR and update docs. Merge/deploy only under applicable user authorization.

## Locking, data release and jobs

The [domain contract](contracts/domain.md) is authoritative for discovery, lock order and replay. Workspace relation mutations serialize canonicalization, with ordered per-record locks and exact generation compare. Other writes/read projections take the matching relation-generation fence before discovering canonical assignments. Current source headers and quality dates are checked for counts without exposing payloads. Full original payload release remains a separate scoped operation.

Report generation is a bounded local deterministic job. Preparation never approves disclosure. The job stages both Markdown/JSON artifacts, validates section/citation/count parity and exact digests, then finalizes only if actor, source, heads, relations and cancellation still match. All downloads require exact review and current mcteer plus all customer/source permissions; per-chunk checks stop future release after revocation. No mailbox/provider/transmission state is introduced.

Integrate an independent schema-049-gated 012 timer into `scripts/reports-worker.ts`, already supervised by root dev. Its admission, busy state, cancellation and cleanup run independently of 009’s enabled flag; shutdown clears both timers and waits only through the bounded deadline. Do not add another worker process. Hosted worker invocation remains a release prerequisite, and hosted behavior is not inferred from local tests. Avoid speculative cron provisioning. The worker only processes marked same-environment 012 rows with leases and safe logs; a disabled feature still permits reconciliation, cancellation, current-authorized metadata and exact cleanup. See [reports/handoff contract](contracts/reports-handoff.md).

## Phase 0: Research output

[research.md](research.md) records decisions, rationale, rejected alternatives and concrete reuse paths from two focused read-only source reviews. No unresolved technical research question remains.

## Phase 1: Design output

[data-model.md](data-model.md) defines identities, C01–C16, lifecycles and calculations. The three [contracts](contracts/domain.md) define domain authorization, [HTTP/UI](contracts/http-ui.md) and [reports/handoff](contracts/reports-handoff.md). [quickstart.md](quickstart.md) specifies future acceptance scenarios and commands; they are not claims of existing runtime interfaces or passing tests.

## Rollout and forward recovery

Confirm current manifest before assigning 048–049. Validate empty and 047→049 on owned disposable databases, runtime grants, shutdown/restart, lease recovery, receipt replay and private-store marker. Never rewrite applied migrations or initialize schema in handlers. Introduce `TURAS_012_DISABLED=1` as a new-work kill switch and `TURAS_012_RECEIPT_HASH_KEYS` for environment-lifetime receipt tombstones, following existing keyring conventions. Reuse `TURAS_REPORT_STORE_ROOT`; prepare/verify its existing environment marker explicitly. `scripts/prepare-gap-store.ts` calls only the existing `prepareReportStore` helper, without registering a 009 brand or enabling its renderer/delivery subsystem.

Before hosted rollout, read the selected target marker/schema, prepare a concrete migration/grants/store/worker/recovery plan and obtain the required release authorization. Preview and Production acceptance are separate. Disabling does not roll back schema or erase customer/decision/receipt history. Restore/forward repair preserves the same DB/workflow/private-store identity.

## Complexity Tracking

No constitutional violation or exception. Dedicated 012 tables are necessary because 009 report identities are single-customer and have different audience/export rules. New model/provider/renderer infrastructure is intentionally outside the bounded scope.
