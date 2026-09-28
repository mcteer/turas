# Implementation Plan: Chat attachments and artifact ingestion

**Branch**: `004-chat-artifact-ingestion` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Status:** Design complete; implementation not started.

## Summary

Add customer-bound private uploads, bounded extraction and selected evidence review
to existing chat/profile flows. A separate worker scans and parses immutable local
files in isolated containers. Shared domain services authorize UI, worker and agent
paths. Draft selections remain unverified; exact profile review is the only path
from user submissions to accepted facts. Hosted Blob/Sandbox, RAG, shared learning,
competency import and deployment remain later work. No new eve integration/model
change. Original visibility uses the spec's explicitly unconfirmed default.

## Technical Context

**Language/Version:** Node 24, TypeScript, existing Next.js 16.3.4/React 19.2.6.

**Primary Dependencies:** Existing eve 0.67.x, AI SDK, pg and Zod. Isolated private
parser package: officeparser, pdfjs-dist, native canvas adapter, tesseract.js,
exceljs, csv-parse, file-type and yauzl. Audit/pin exact packages and ClamAV/parser
image digests during implementation. No parser in Next.js or Turi's sandbox.

**Storage:** Existing local Postgres 17; explicit migrations after 013. Private
filesystem under ignored local-artifacts/004/store. SQL metadata, receipts,
claims/leases and cleanup jobs. No vector store or hosted resource provisioning.

**Testing:** Vitest; real Docker+ClamAV/parser fixtures; CLI Playwright/WebKit at
390/1440 widths in light/dark themes; bounded live agent evals and deterministic
source/access/release hard gates. Synthetic data only.

**Target Platform:** Local macOS and Linux CI with Docker, Node24/Postgres17. Local
baseline: Docker allocation ≥8 GiB RAM and 2 CPUs, prepared signature snapshot.
No hosted acceptance claim.

**Project Type:** Existing full-stack app plus one supervised ingestion worker and
isolated extraction package; one authorization layer, no new queue service.

**Performance Goals:** Foreground polling every 2 seconds; persisted state visible
within 5 seconds. Representative files complete within 120 seconds from claim,
excluding queue wait. One active job; oldest eligible first. Bound queue/storage
per [worker contract](contracts/worker.md); oversized extraction is partial/failure.

**Constraints:** Five files/message, 10 MiB/original, 25 MiB/batch. No raw model-upload
bypass or active content execution. Draft context ≤12,000 characters/20 units/send;
review excerpts ≤8,000 characters/20 units. Existing 003 domain validation applies.

**Scale/Scope:** Three demo principals and synthetic customers in one local
environment; four stories and 20 functional requirements. This does not certify
production capacity or private-customer retention.

## Constitution Check

| Principle | Before research | After design evidence |
| --- | --- | --- |
| I — Specify first | Pass: bounded 004 | Spec, contracts, data model and task traceability; no implementation yet |
| II — Outcomes define maturity | Pass: maturity unchanged | No automatic staffing/product/maturity import |
| III — Evidence lifecycle | Pass: review retained | Exact selection, lineage, purgeable payload, unsupported history |
| IV — Authorize first | Pass: reuse grants | Private originals, reviewer access, partner excerpts, every release fenced |
| V — Decision rights | Pass: no auto-accept | Exact review and reasoned deletion, versioned/idempotent commands |
| VI — eve core | Pass: runtime/model preserved | Documented context/guards; registry checked, no unused integration |
| VII — Meaningful checks | Pass: synthetic verification | Real scan/parser, race/access/UI/eval checks; no human-study gate |
| VIII — Operability | Pass: bounded local work | Quotas, freshness, leases, cleanup, recovery, sanitized telemetry |

No constitutional exceptions. Hosted adapters and provider-record erasure are
explicitly deferred, not declared satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/004-chat-artifact-ingestion/
  spec.md
  checklists/requirements.md
  plan.md
  research.md
  data-model.md
  contracts/{artifacts-api,worker,context-ui}.md
  quickstart.md
  tasks.md
  validation.md                    # future implementation evidence
```

### Source Code (repository root; additions planned)

```text
migrations/014-artifact-ingestion.cjs
migrations/015-artifact-evidence-context.cjs
lib/contracts/artifacts.ts
lib/server/artifacts/              # policy, intake, store, jobs, extraction,
                                  # selections, context, lifecycle, cleanup, telemetry
lib/server/profiles/               # exact artifact support/projection/eligibility
lib/server/conversations/          # dispatch and all release fences
app/api/artifacts/                 # intents, bytes, status, units, lifecycle
app/api/conversations/[conversationId]/attachments/route.ts
app/_components/attachments/       # composer, progress, viewer, selection
agent/instructions/artifact-context.ts
agent/tools/artifact_context.ts
agent/hooks/guard-customer-context.ts
packages/artifact-extractor/       # private package, adapters, locked dependencies
infra/artifacts/                   # images, scan config, offline assets
scripts/{artifact-worker,prepare-artifacts,check-artifacts,artifact-recovery-check}.ts
tests/{unit,contracts,integration,ui}/
tests/fixtures/artifacts/          # safe corpus generators and manifest
evals/fixtures/004-artifact-governance.json
```

**Structure Decision:** Extend the app. Storage/runner ports allow fault injection
without pretending mocks prove isolation. Use current environment markers and
runtime-role boundaries. Extraction dependencies stay outside the web bundle.
Preserve watchdog/native message receipts; ingestion does not dispatch agent turns.

## Delivery phases and dependencies

1. Pin extraction dependencies/images; add contracts, explicit migrations, shared
   authorization/locks, storage and worker foundations.
2. **US1:** Upload, scan/extract, inspect and explicitly reattach an eligible own
   source. This is the smallest useful local milestone.
3. **US2:** Submit/review exact selected evidence and project approved excerpts.
4. **US3:** Discuss selected unverified content with citations and whole-conversation
   dependency fences. Keep raw native file routes closed.
5. **US4:** Complete replacement/withdrawal/delete UX and cleanup recovery. Foundation
   tombstones and lease checks must already fence every publication.
6. Verify migrations/restore/restart, real isolation, UI flows and actual agent
   responses. Update README/roadmap with evidence and prepare the implementation PR.

US1 is independently reviewable; full 004 completion requires all stories and
cross-cutting gates. Implementation authorization belongs to a later turn.

## Design outputs and verification

[Research](research.md) resolves storage, parsing, context and retention choices.
[Data model](data-model.md) defines constraints/transitions. [API](contracts/artifacts-api.md),
[worker](contracts/worker.md) and [context/UI](contracts/context-ui.md) contracts bind
each entry point to the same policy. [Quickstart](quickstart.md) lists validation to
add during implementation. [Tasks](tasks.md) maps every FR/SC to ordered work.

## Complexity Tracking

No constitutional violations. Containers meet the untrusted-processing requirement;
private local storage avoids speculative services. Two migrations separate intake
from profile/context linkage and support an upgrade from schema 013. Recovery uses
a restored clone; rollback must not erase live data.
