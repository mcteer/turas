# Research: Weekly and Executive Reporting

**Date**: 2026-10-03
**Status**: Planning decisions; no package installation, runtime changes or external sends performed.

## 1. Keep Reporting in the Governed Domain

**Decision**: Add `lib/server/reports/` with report-specific snapshots and projections;
share existing policy, source eligibility and pure arithmetic where contracts fit.
Capture a consistent snapshot now for a selected historical period; do not offer a
user-supplied historical acceptance cutoff in v1. Preserve the server capture time.

**Rationale**: `lib/server/execution/summary.ts` exports
`selectExecutionSummarySnapshot`, but it selects current accepted heads, chooses
visibility from `actor.kind`, stamps the current time, and caps record selection.
Calling it as mcteer would not create a customer-safe or historical report.
`lib/execution/calculations.ts` has a 91-day bound; July–September and
October–December contain 92 days. Reports must use explicit audience selection
before retrieval, exact date periods, and a report-specific calculation contract.

**Alternatives**: Copy an internal summary and redact afterward (unsafe); relabel
current data with an old cutoff (false history); extend all 008 bounds globally
(unnecessary compatibility risk). New report queries use existing source locks and
accepted ledger definitions, with independent oracle tests and regression checks.

## 2. Deterministic Report Composition

**Decision**: Create typed structured sections, source-bound narrative fragments,
fixed gap labels and deterministic metrics. Authors select/reorder eligible facts
and add labeled recommendations/questions; introducing a new factual assertion
requires existing source approval first. No new model turn or agent send tool.

**Rationale**: The 009 requirement is reviewed reporting. Deterministic preparation
covers it without another advisory context/lifecycle or unreviewed numerical prose.
Preserve `agent/agent.ts` and existing conversation behavior.

**Alternatives**: A new generative report agent would add cost, native-release fences
and actual-output evaluation gates without being required by this slice. It remains
a future enhancement, not an optional unfinished branch inside 009.

## 3. Email Transport and Durable Outbox

**Decision**: Plan a narrow server-only Resend SDK transport behind an application
outbox, one recipient per immutable request. No conversational email channel.

**Evidence**: `eve registry search email --json` and
`eve registry view channel/chat-sdk-resend --json` were run on 2026-10-03. The
registry entry is `chat-sdk`, installs `chat`, `@resend/chat-sdk-adapter` and memory
state, and handles inbound threaded conversations. No native outbound-only item
was identified in the returned email results. Installed Eve documentation at
`node_modules/eve/docs/patterns/durable-cross-channel-notifications.md` explicitly
prescribes a provider API plus application-owned outbox when no model turn is
needed. Read `schedules.mdx` and `patterns/dynamic-scheduling.md` as well.

**Rationale**: This is delivery of exact approved bytes, not a conversation.
The official [Resend idempotency contract](https://resend.com/docs/dashboard/emails/idempotency-keys)
retains deduplication keys for 24 hours. The application must retain its own send
identity beyond that window. A timeout remains uncertain; no retry may cross the
window merely because a lease expired. An outbox alone is not an exactly-once guarantee.

[Send Email](https://resend.com/docs/api-reference/emails/send-email) supports
HTML/text and binary attachments. Use server-loaded attachment bytes, never remote
attachment URLs. App limits are deliberately below provider limits; one-recipient
requests avoid exposing recipient lists and permit individual reconciliation.

[Webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
requires the raw body and signing secret. Verify before parsing/persisting, dedupe
provider events and match the known environment/message/recipient identity.
[Webhook events](https://resend.com/docs/webhooks/introduction) can report delivery
and failures. Acceptance alone does not prove inbox placement or human reading.

**Alternatives**: SMTP has weaker application reconciliation; Gmail/Chat SDK
introduces inbound conversations and mailbox authority; batching couples partial
outcomes. No provider account, domain, subscription or credential is provisioned
by this planning task. Resolve exact SDK patch via lockfile during T002.

## 4. Scheduling and Execution

**Decision**: Use durable database schedules/jobs and a separate supervised local
report worker. A worker tick atomically claims jobs and derives periods in the
configured IANA timezone. The worker runs deterministic rendering and delivery,
without impersonating an interactive session. Authority derives from the recorded
policy decision plus current active principal/customer checks.

**Rationale**: Eve's installed schedule docs say `eve dev` does not fire cron;
hosted cron uses UTC. Root `npm run dev` already supervises workers. Reuse its
operational pattern and existing atomic leases. A separate process prevents long
rendering from delaying conversation maintenance.

**Alternatives**: An agent schedule would introduce a model turn; doing render/send
inside a request handler is not durable. A future hosted dispatcher can invoke the
same domain after its worker, private storage and runtime limits are validated.
009 does not claim local containers/filesystem run inside existing Vercel functions.

## 5. Artifact Formats and Rendering

**Decision**: One `ReportDocument` feeds semantic HTML and native editable slide
objects. Use locked Playwright Chromium to print a tagged PDF with an outline and
backgrounds, and PptxGenJS for 16:9 PPTX with native text, tables and chart data.
Use CLI WebKit for application UI validation; Chromium printing is a renderer.
Use a pinned isolated container with Chromium, approved fonts, LibreOffice and
Poppler for document rendering/inspection. No network inside the renderer.

**Rationale**: Current Playwright PDF options include tagging and outlines;
PptxGenJS exposes native objects instead of flattened screenshots. Both render from
the same source model; compare semantic content/units/citations rather than binary
file equality across executions. Store and approve the actual generated bytes.

**References**: [Playwright PDF](https://playwright.dev/docs/api/class-page#page-pdf),
[PptxGenJS](https://gitbrent.github.io/PptxGenJS/),
[PptxGenJS charts](https://gitbrent.github.io/PptxGenJS/docs/api-charts/),
[PptxGenJS tables](https://gitbrent.github.io/PptxGenJS/docs/api-tables.html).

**Font constraint**: PptxGenJS theme/fontFace does not establish embedded font
support. Package approved Geist font files in the renderer with upstream license
and hash, validate their presence, and specify Geist in PPTX theme and runs.
The recipient editor needs the approved Geist fonts installed; disclose this on
download and in the runbook. Validate editing in a font-equipped office environment.
Do not claim universal font portability or full PDF accessibility conformance solely
from a tagging option. Inspect reading order, labels and text extraction separately.

**Alternatives**: Screenshot slides fail editability; converting PPTX to PDF alone
couples both formats to one office renderer; custom OOXML/font embedding increases
scope. The early renderer spike is a required implementation gate before the main UI.

## 6. Branding and Release Configuration

**Decision**: Version a Turas report layout using Geist and official Vercel assets
from the [Vercel brand page](https://vercel.com/geist/brands). Retain asset provenance
and usage constraints. No existing approved report slide master was found in the
repository. Synthetic preview branding is explicit; mcteer reviews actual rendered
samples and approves an exact brand profile before external release.

**Rationale**: Public asset availability is not approval of a new report template.
A self-declared corporate master or invented logo approval would misrepresent D11.
This design supplies an authored master rather than depending on a missing file.

**Alternatives**: Reuse undocumented legacy assets/claims (no approval evidence);
block all development until a corporate master arrives (unnecessary for synthetic
preview and renderer validation). A supplied official master can replace the
profile through the same versioned review workflow later.

## 7. Storage and Withdrawal

**Decision**: A separate `TURAS_REPORT_STORE_ROOT` uses the existing private-store
stage/finalize/hash mechanics but its own manifest and orphan reconciliation.
Report revisions/publications keep immutable identity metadata; prose, recipient
addresses and files are separately purgeable. Downloads stream through current
policy and source checks, with private/no-store responses and no bearer/public URLs.

**Rationale**: `lib/server/artifacts/store.ts` provides a useful abstraction;
`local-store.ts` supplies opaque keys and restrictive permissions. Existing artifact
orphan reconciliation recognizes uploads/artifact versions only, so sharing its
root could delete report files. `artifacts/read.ts` demonstrates chunked release
rechecks. `execution/maintenance.ts` demonstrates exact leased cleanup and stale
job rejection; reuse that discipline for report dependencies.

**Alternatives**: Store public URLs (bypasses revocation); purge by parent report ID
(risks deleting a newer correction); promise recall of already-delivered mail
(impossible). Sent history records a correction obligation while future reads are fenced.

## Resolved Technical Questions and Operational Prerequisites

No implementation-method unknown remains. Renderer compatibility is verified by
an explicit early spike, not assumed from documentation. Release requires an actual
brand-profile decision, verified sender/secret configuration, explicitly authorized
test recipient, functioning private store and worker, and real delivery evidence.
These are operator inputs and acceptance gates; credentials and customer addresses
must not enter these documents. Local completion and hosted readiness are distinct.
