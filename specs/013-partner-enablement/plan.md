# Implementation Plan: Partner Delivery and Enablement

**Branch**: `013-partner-enablement` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: `specs/013-partner-enablement/spec.md`. Planning only; implementation follows the model-switch handoff.

## Summary

Deliver an assigned-customer workspace, manually authored reviewed guides tied to accepted plans, and individual checkpoint submissions verified by mcteer. Reuse 006 plan proposals, 008 execution contributions, 010 accepted support and 005 shared knowledge without broadening their authorities. Add one governed `partners` domain, explicit migrations, typed HTTP/UI contracts and deterministic progress. No new model generation, integration, export or federation.

## Technical Context

**Language/Version**: TypeScript 7.0.2 on Node 24.x, matching the installed lockfile.

**Primary Dependencies**: Existing Next.js 16.3.4, React 19.2.6, pg 8.23.0, Zod 4.5.4 and eve 0.67.x. No dependency upgrade. Preserve `agent/agent.ts`; read installed Next guides before framework edits and eve's routed docs only if framework changes become necessary.

**Storage**: Existing environment-isolated PostgreSQL 17; immutable metadata/revisions/decisions, separately deletable JSON payloads, sources, previews, assignments and receipts. No object store or retrieval index.

**Testing**: Vitest unit/contract/integration; CLI Playwright/axe in all four existing WebKit projects; owned synthetic fixtures, migration/forward-recovery and representative-load runners; earlier partner/privacy regressions. No new model evaluation because agent behavior remains unchanged.

**Target Platform**: Existing Next server/browser and maintenance supervisor. Hosted migration/release remains a separate gate.

**Project Type**: Existing full-stack web application with one governed domain layer.

**Performance Goals**: SC-005: 100 operations per declared class, five concurrent readers, p95 ≤2 seconds per class, with production quotas preserved. Fixture/pacing in [validation contract](contracts/lifecycle-validation.md).

**Constraints**: Live member-specific grants, current source fences, exact review/idempotency, no other-domain acceptance, bounded SQL/payloads, fail-closed revalidation at most 15 seconds apart, content-free telemetry, canonical checkout only.

**Scale/Scope**: Three stories; one workspace plus customer guide/review and individual learning views. Pages ≤50, guides ≤20 lessons/40 checkpoints, original closure ≤200, active assignments ≤100 per member/customer. [C01–C16](data-model.md) are authoritative limits.

## Constitution Check

Pre-research and post-design checks pass; no exceptions.

| Principle | Pre-research | Post-design |
| --- | --- | --- |
| I Outcome first | Bounded spec and story tests | Spec → contracts → tasks → validation; planning-only change |
| II Outcomes | Learning separate from maturity/delivery | Versioned checkpoint fraction; no other outcome writes |
| III Evidence | Approved originals and attributed research | Exact provenance/quality, synchronous closure checks and purge |
| IV Authorization | Individual grant and live actor fences | Pre-query and release checks, private attempts, sanitized shared DTOs |
| V Human decisions | mcteer verification confirmed | Exact immutable decisions, self-review acknowledgment, reconciliation |
| VI eve core | Existing model preserved | No new model behavior, tools or unused integration |
| VII Verification | FR-021 automated validation | Exact manifests, four-project browser, access/races/load/recovery |
| VIII Operability | Bounded synchronous work | Explicit migrations, independent retention/disable, safe telemetry |

## Design and Sequencing

Phase 0 research is in [research.md](research.md). Phase 1 comprises [data-model.md](data-model.md), [domain](contracts/domain.md), [HTTP/UI](contracts/http-ui.md), [lifecycle/validation](contracts/lifecycle-validation.md) and [quickstart.md](quickstart.md). Phase 2 generates [tasks.md](tasks.md).

1. Establish typed contracts, owned validation fixtures and common policy/idempotency/telemetry. Migration 050 establishes guide/receipt storage; 051 establishes learning storage. Recheck the migration head if main advances; never rewrite an applied migration.
2. US1 adds workspace discovery and links. Introduce `listDeliveryEngagementPage` alongside the old list signature; preserve older callers and never present their first-50 list as complete. Customer and engagement discovery are separate paged operations.
3. US2 adds authoring, previews, publication and evidence-qualified guide reads. Plan replacement invalidates dependent guide bodies; a newly authored/reviewed revision must bind the replacement explicitly.
4. US3 adds assignments, attempts, review and deterministic progress. Source/member/guide changes withhold or obsolete current learning; renewed assignments start at zero.
5. Complete lifecycle, browser, load, recovery and regression gates. Record evidence for one final source revision, update docs and leave hosted acceptance pending.

US1 is demonstrable without guides; US2 uses accepted-plan fixtures without learning; US3 uses a published-guide fixture. Full delivery requires all three stories.

## Project Structure

### Documentation

`specs/013-partner-enablement/` contains spec, checklist, plan, research, data model, three contracts, quickstart, tasks and handoff. Implementation creates `validation.md` with actual results.

### Source Code (planned additions and narrow existing edits)

```text
migrations/050-partner-guides.cjs
migrations/051-partner-learning.cjs
lib/contracts/partners.ts
lib/server/partners/
  policy.ts, repository.ts, sources.ts, workspace.ts, guides.ts
  previews.ts, assignments.ts, submissions.ts, progress.ts
  commands.ts, receipts.ts, projection.ts, maintenance.ts, telemetry.ts, http.ts
lib/server/engagements/read.ts
lib/server/config.ts
app/partners/page.tsx
app/partners/customers/[customerId]/page.tsx
app/partners/guides/[guideId]/page.tsx
app/partners/assignments/[assignmentId]/page.tsx
app/_components/partners/
  workspace.tsx, guides.tsx, guide-review.tsx, learning.tsx, revalidation.ts
app/_components/app-shell.tsx
app/api/partners/workspace/route.ts
app/api/partners/customers/[customerId]/engagements/route.ts
app/api/partners/customers/[customerId]/members/route.ts
app/api/partners/guides/route.ts
app/api/partners/guides/[guideId]/route.ts
app/api/partners/assignments/route.ts
app/api/partners/assignments/[assignmentId]/route.ts
app/api/partners/commands/route.ts
app/api/partners/previews/route.ts
app/api/partners/requests/[requestId]/route.ts
scripts/maintenance-worker.ts
scripts/partners-environment.ts, test-partners.ts, partners-ui-check.ts
scripts/partners-recovery-check.ts, partners-benchmark.ts, partners-regressions.ts
scripts/partners-suites.json, partners-ui-journeys.json, partners-regression-suites.json
migrations/manifest.json
tests/fixtures/partners/environment.ts, seed.ts, originals.ts, ui.ts, benchmark.ts
tests/unit/partner-content.test.ts, partner-progress.test.ts, partner-runner-coverage.test.ts
tests/contracts/partner-http.test.ts, partner-projection.test.ts
tests/integration/partner-foundation.test.ts, partner-workspace.test.ts
tests/integration/partner-guides.test.ts, partner-source-races.test.ts
tests/integration/partner-learning.test.ts, partner-retention-recovery.test.ts
tests/ui/partner-workspace.spec.ts, partner-guides.spec.ts
tests/ui/partner-learning.spec.ts, partner-revocation.spec.ts, partner-accessibility.spec.ts
.github/workflows/ci.yml, package.json, playwright.config.ts
.env.example, README.md, ROADMAP.md, docs/partner-operations.md
```

**Structure Decision**: Extend existing conventions. HTTP routes are adapters; React handles transient interaction only. No duplicate plan engine, new deployed service, object-store preparation or eve tool.

## Complexity Tracking

No constitution violations or new infrastructure. Previews bind evidence that can change concurrently. Immutable payload separation permits deletion without erasing decision identity. Shared publication remains exclusively in 005.
