# Implementation Plan: Weekly and Executive Reporting

**Branch**: `009-weekly-executive-reporting` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

**Status**: Design only; implementation and all runtime gates remain pending.
**Input**: Roadmap 009 / TR-04 after 008 merged in PR 16.

## Summary

Build a governed reporting domain that captures current accepted facts for a chosen
reporting period, prepares deterministic weekly/executive narratives, reviews exact
audience-specific versions, renders email/PDF/editable PPTX, and records per-recipient
delivery through a durable outbox. Use mcteer-only review and user-confirmed per-send approval. Weekly schedules prepare drafts only. Preserve the selected
Turi model and existing agent behavior; no new model invocation is needed.

## Technical Context

**Language/Version**: TypeScript 7.0.2, Node 24.x, React 19.2.6, Postgres 17-compatible SQL.
**Primary Dependencies**: Existing locked Next 16.3.4, eve 0.67.1, pg 8.23.0,
Zod 4.5.4, Temporal polyfill 0.5.1, Playwright 1.63.0; add pinned PptxGenJS 4.0.1
and Resend SDK during implementation after package/license review. Use the SDK's
raw-body webhook verifier. Renderer image pins Chromium, LibreOffice, Poppler and
approved static Geist fonts; record image digest/tool versions in validation.
**Storage**: Existing scoped Postgres, explicit new migrations 039–041, isolated
private `TURAS_REPORT_STORE_ROOT`; source data and `.eve/.workflow-data` preserved.
**Testing**: Vitest contracts/integration, independent calculation vectors,
disposable marked Postgres, CLI Playwright/WebKit, PDF/PPTX structural and visual
checks, controlled real mail test, recovery and representative load. No host browser.
**Target Platform**: Local supervised report worker and Next UI/API first. Existing
Vercel app may expose reporting readiness, but hosted rendering/storage/dispatch
remain disabled until a separately recorded release gate. No deployment in planning.
**Project Type**: Existing full-stack workspace with one governed domain, no new app.
**Performance Goals**: SC-005 p95 ≤2 s for paginated reads and review acknowledgement;
weekly deterministic composition ≤30 s; executive pair ≤120 s at render concurrency two.
**Constraints**: Authorization before selection and each release; immutable approved
bytes; no public file URLs, raw workforce inputs, unsanitized telemetry, model send
capability, unattended sends or blind retry of uncertain delivery.
**Scale/Scope**: Four stories, 24 FRs and eight SCs. Single customer per report;
weekly one engagement, executive at most 20. Exact bounds are in the data model.

## Constitution Check

Pre-research and post-design checks pass. This is a design assessment; implementation
must establish every behavioral gate. No governance exception is requested.

| Principle | Design Evidence and Required Gate |
| --- | --- |
| I. Specified outcome | Bounded TR-04 scope, acceptance stories, FR/SC task mapping |
| II. Customer outcomes | Separate maturity/engagement/commercial data; versioned integer arithmetic, no ROI invention |
| III. Evidence lifecycle | Current eligibility plus exact captured revisions/decisions; derived-file invalidation and corrections |
| IV. Authorization | Audience applied before SQL; no fabricated partner actor; current policy for API/jobs/download/send |
| V. Human authority | mcteer-only decisions, exact preview/version/digest, per-send approval and revocable recipient policy |
| VI. Eve core | Installed schedule/outbox docs and registry researched; documented direct-provider outbox pattern; model preserved |
| VII. Verification | Domain/race/schema/recovery/render/browser gates; actual sends distinguished from simulations |
| VIII. Operability | Bounded queues, deadlines, leases, uncertainty, private storage, explicit migrations and forward recovery |

## Project Structure

### Documentation (This Feature)

```text
specs/009-weekly-executive-reporting/
  spec.md
  checklists/requirements.md
  plan.md
  research.md
  data-model.md
  contracts/reporting-api.md
  contracts/report-content.md
  contracts/delivery.md
  contracts/reporting-ui.md
  quickstart.md
  tasks.md
  validation.md                  # implementation creates actual evidence later
```

### Source Code (Planned Additions and Edits)

```text
migrations/039-report-revisions.cjs
migrations/040-report-delivery.cjs
migrations/041-report-jobs-cleanup.cjs
migrations/manifest.json
lib/reports/{periods,calculations,document}.ts
lib/server/reports/              # policy, schema, commands, source adapters,
                                # snapshots, revisions, publication, brand,
                                # artifacts, schedules, outbox, transport,
                                # events, jobs, readiness, invalidation, cleanup
lib/server/{profiles,retrieval,plans,execution}/  # exact dependency invalidation hooks
app/api/reports/                 # thin authenticated transport adapters
app/api/webhooks/reports/resend/route.ts
app/(workspace)/customers/[customerId]/reports/page.tsx
app/(workspace)/customers/[customerId]/reports/[reportId]/page.tsx
app/_components/reports/
app/_components/app-shell.tsx
app/design-system.css
scripts/report-worker.ts
scripts/dev.mjs
scripts/prepare-reports.ts
scripts/test-reports.ts
scripts/test-reports-regressions.ts
scripts/check-reports-ui.ts
scripts/check-report-artifacts.ts
scripts/check-report-delivery.ts
scripts/reports-recovery-check.ts
scripts/benchmark-reports.ts
scripts/check-reports-release.ts
scripts/db-role-setup.sql
report-renderer/                 # pinned image and deterministic HTML/PPTX renderer
report-templates/                # approved asset manifest, licenses, masters/content layouts
 tests/fixtures/reports/         # synthetic source states, documents, oracles, fake transport
 tests/{unit,contracts,integration,ui}/report-*
```

**Structure Decision**: Extend existing repository conventions. Keep reports separate
from upload storage and 008 interactive summaries. Shared source invalidation hooks
remain in their existing domain transactions, but their 009 adapter must tolerate
schema 038/disabled reporting and avoid coupling older feature readiness to 009.

## Design Decisions

### Capture and Current Eligibility

A report job captures a consistent accepted snapshot at its server-owned `asOf`.
A selected old period controls event/service-date inclusion, not historical approval
reconstruction. Regenerating an old week today may include late approvals and is
labeled with today's cutoff. Persist the exact counted time revisions/decisions,
record revisions, baseline, milestone events and source dependency closure.
Do not filter the mutable actual ledger by approval time to fabricate history.
Pending corrections leave the accepted predecessor in the new snapshot until approved.

Each claim has visible source labels and restricted internal lineage. Revalidate
current source eligibility before previews, publication, downloads and dispatch.
A changed/superseded source marks affected output `review_required`; a withdrawal
also withholds payload immediately and queues exact cleanup. Report approval never
promotes its inputs. Published content is immutable; corrections require new review.

### Audience and Calculations

Three audience values: `delivery`, `account_team`, `leadership`. Delivery serves
customer/partner recipients and assigned partner reads. The last two are internal
only and never grant workforce/finance access. Explicit audience intersects actor
or schedule authority before retrieval. Exclude workforce/personnel/finance and
private chat from all three projections. Recipient policy attests each address's
customer entitlement and audience; internal audiences additionally require an active
internal membership binding for every recipient.

Period effort uses approved engagement aggregate disclosure already allowed by 008,
with exact counted revision/decision identity and no names, individual time rows,
leave or resource calendars. If eligibility cannot support a complete audience-safe
aggregate, show unknown; never derive hidden totals by subtraction. Forecast is a
single as-of closing estimate, not a sum of monthly forecasts. See content contract.

### Review, Render and Send

Weekly renders HTML and plain text. Executive reports render PDF and PPTX from the
same document. Publication preview binds the completed artifact digests and validation
receipt; it cannot approve a render that has not finished. Send preview separately
binds publication, immutable mail-body digest, attachments, sender and recipient
policy version. Reviewer annotations changing content create a new revision.

External delivery uses one persisted outbox row per approved recipient. Before a
network call, atomically mark dispatch intent and fence policy/source/authority.
After that linearization point a concurrent revocation cannot guarantee recall;
settle the actual outcome and prohibit new dispatch/retry after revocation. Never
hold long database transactions across rendering or provider requests. An expired
lease after dispatch is uncertainty, not permission to create a new send identity.

### Worker and Storage

A separate report worker is supervised by root dev. It manages bounded draft,
render, dispatch, reconciliation and cleanup queues with independent concurrency.
Current durable authority is tied to the approving member and policy, not a borrowed
browser session. Interactive decisions require a current session; later jobs require
that principal/member, customer grants and policy remain active.

Use a separate private report store/catalog with checksums and exact leased cleanup.
Stream downloads through current checks before every 64 KiB chunk. No raw paths,
recipient lists, internal source URLs or provider IDs enter artifacts. A downloaded
or emailed external copy is outside Turas recall; retain a correction obligation.

### Branding and Availability

Implement an authored Vercel/Turas master from official assets and existing visual
language. Synthetic preview is available before approval. Exact rendered samples,
asset/font hashes and usage provenance must receive a mcteer brand-profile decision
before external release. Do not claim an official corporate slide master exists.
Editable decks require approved Geist fonts in the recipient editor; show that
limitation and test it in the declared supported editing environment.

New commands return explicit schema/worker/font/sender/brand readiness. Missing mail
configuration blocks send only; missing approved brand blocks publication, while
synthetic previews still work. `TURAS_009_DISABLED` prevents new work but permits
necessary current-authority status, reconciliation and cleanup. Hosted generation
requires a verified worker and durable private-store adapter before enabling it;
local files/containers are not a hosted implementation claim.

## Delivery Sequence and Gates

1. Prepare isolated fixture infrastructure, renderer spike and schema 038 baseline.
2. Establish shared policy, snapshots, source dependencies, strict commands and stores.
3. US1 weekly composition and exact publication review provide the first useful increment.
4. US2 schedules/recipient policies/outbox/provider integration, with send disabled by default.
5. US3 executive formats/brand review and professional review/download UX.
6. US4 lifecycle/corrections/cleanup, full audience matrix and report history.
7. Run full deterministic, artifact, UI, load, upgrade/recovery and release gates.

Foundation handles authorization/release checks from the first story. US4 completes
source mutation propagation, physical cleanup and correction UX; external sends
remain disabled until its gates pass. All four stories are required for 009 completion.

## Rollout and Recovery

Prepare schema 039–041 explicitly on owned disposable databases; preserve migration
checksums and upgrade from 038 as well as empty. Runtime roles cannot edit immutable
payloads or use general DELETE; exact cleanup is narrowly granted and fenced. Add
report files to paired backup manifests and recover them alongside DB and preserved
Eve stores. In recovery quarantine all post-dispatch unknown outcomes, then reconcile;
never turn an unknown attempt back into an unsent row.

Local implementation precedes any explicitly selected Preview upgrade. Production
migration, provider provisioning, DNS changes and live customer mail are not implicit
in this plan. Rollback disables new 009 work and retains compatible reads/settlement/
cleanup. Prefer forward fixes/restoration; do not run destructive down migrations.
