# Research: Chat attachments and artifact ingestion

Planning research, 2026-09-27. No dependencies installed, resources provisioned or
runtime behavior changed. Read-only investigations covered storage/runtime,
format extraction, and existing profile/chat contracts.

## R1 — Local storage now; hosted adapters when usable

**Decision:** Implement an `ArtifactStore` port and one private filesystem adapter
outside `public`, under ignored `local-artifacts/004/store`. SQL owns scope and
eligibility. Use opaque immutable keys and authenticated, uncached app reads.

**Rationale:** 004 can be exercised through root `npm run dev` while deployment is
disabled. Registry search/view found `memory/file`, a per-principal memory backend
with guided Blob provisioning, not a governed artifact store. Do not install it.

**Alternatives:** Defer private Blob and Vercel Sandbox adapters to hosted readiness.
Blob needs application authorization even for private reads. Hosted Functions have
a 4.5 MB request limit, below our 10 MiB originals; future hosted intake therefore
needs bound direct-upload intents. Localhost cannot receive its completion callback
unaided. Local tests do not prove hosted ACLs or callbacks.
[Private Blob](https://vercel.com/docs/vercel-blob/private-storage),
[server uploads](https://vercel.com/docs/vercel-blob/server-upload),
[client uploads](https://vercel.com/docs/vercel-blob/client-upload).

## R2 — Separate supervised worker and isolated jobs

**Decision:** Reuse Postgres claim/lease patterns in a separate artifact worker
supervised by `scripts/dev.mjs`; keep the existing maintenance watchdog responsive.
Run one artifact job at a time locally/CI. Scan in an ephemeral ClamAV container,
then parse in a separate ephemeral Node 24 container. Neither receives network,
repository, credentials, DB access or Docker socket. Only the trusted host worker
controls containers and publishes validated results.

**Rationale:** Docker's daemon responded during read-only host research. Per-job
containers isolate archives/native OCR. Installed eve sandbox docs describe
persistent session workspaces, unsuitable for private file intake isolation.

**Alternatives:** Worker threads and just-bash do not isolate native parser access.
Turi's sandbox couples intake to chat lifetime. Hosted Sandbox creates unnecessary
resources. Require explicit CPU/memory/PID limits, non-root, read-only root, dropped
capabilities and bounded temporary output.
[Docker limits](https://docs.docker.com/engine/containers/resource_constraints/),
[run controls](https://docs.docker.com/reference/cli/docker/container/run/),
[network none](https://docs.docker.com/engine/network/drivers/none/).

## R3 — Real fail-closed scanning

**Decision:** Pin a supported official ClamAV image digest during implementation.
Prepare signatures separately with network access; mount a read-only snapshot into
each scan job. Require signatures no older than 7 days for this synthetic local
slice. Missing/stale definitions, errors or scan limits leave the file quarantined.
Set `AlertExceedsMax yes`; record digest-bound engine/signature receipts.

**Rationale:** Skipped or unscanned files cannot be clean. Scanner memory budget is
4 GiB, distinct from the parser's 1 GiB; scan and parse run sequentially. Network
remains disabled while either handles documents.

**Alternatives:** Mock scanners help inject races but cannot prove acceptance. A
remote scanning service introduces an unnecessary data recipient.
[ClamAV Docker requirements](https://docs.clamav.net/manual/Installing/Docker.html),
[scan configuration](https://raw.githubusercontent.com/Cisco-Talos/clamav/main/etc/clamd.conf.sample).

## R4 — Format adapters preserve exact locations

| Input | Decision | Retained source structure |
| --- | --- | --- |
| DOCX/PPTX | officeparser structured AST | Part/section/paragraph/table-cell; slide/shape/paragraph; notes separately |
| PDF | pdfjs-dist plus Node canvas rendering | Physical page, label, text bounds and normalized offsets |
| PNG/JPEG, scanned PDF | tesseract.js with packaged English assets | Dimensions, block/line/word bounds, orientation, confidence |
| XLSX | exceljs read-only | Sheet/state, A1 address, raw value, formula text/cache, merges/hidden flags |
| CSV | csv-parse streaming, no casting/skipped rows | Record/column and physical line range including multiline fields |
| TXT/MD | Fatal UTF-8 decoding, plain text | Original line range and normalized offsets |
| Type/ZIP preflight | file-type hints, bounded yauzl traversal | OOXML content declarations and actual streamed expansion counts |

**Rationale:** Locate before flattening. Tesseract does not read PDFs, so rasterize
scanned pages first. Package OCR data/core/worker locally to prevent CDN fetches.
ExcelJS retains formulas and cached results without calculating them. Reject active
embedded objects and external OOXML relationships; do not follow document links.

**Alternatives:** An all-officeparser path does not establish spreadsheet formula
and hidden-state fidelity. Hosted OCR and an office suite add scope. Research found
officeparser 8.0.0 and ExcelJS 4.4.0/MIT upstream; implementation must audit and lock
actual versions, transitive dependencies, native canvas support, licenses and image
digests. These observations are not a maintenance/security certification.
[officeparser AST](https://raw.githubusercontent.com/harshankur/officeParser/master/src/types.ts),
[security policy](https://raw.githubusercontent.com/harshankur/officeParser/master/SECURITY.md),
[ExcelJS API](https://github.com/exceljs/exceljs#readme),
[PDF Node rendering](https://github.com/mozilla/pdf.js/blob/master/examples/node/pdf2png/pdf2png.mjs),
[Tesseract offline configuration](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md),
[file-type limits](https://github.com/sindresorhus/file-type#readme),
[yauzl options](https://github.com/thejoshwolfe/yauzl#readme),
[CSV options](https://csv.js.org/parse/options/).

## R5 — Bounded durable publication

**Decision:** Adopt artifact-intake-v1 in the [worker contract](contracts/worker.md):
120-second total deadline, 30 seconds scan and 90 seconds parse, one active job,
bounded archive/OCR/output/queue. Publish only validated complete or explicit partial
results. Ingestion consent survives ordinary browser logout/expiry; publication
still requires current active principal, workspace, partner organization and grant.

**Rationale:** Work should not require an open browser; revocation must stop it.
Short transactions claim/publish, never hold locks while parsing. A new run/token
fences late output. **Alternatives:** Live-login-only publication causes unnecessary
expiry failures; unbounded concurrency starves local maintenance.

## R6 — Extend 003 evidence without relabeling uploads

**Decision:** Add typed artifactEvidenceSelectionId support to profile evidence.
Origin remains manual, submission channel artifact_share. Create selection and
Pending proposal atomically using submitProfileCommandDetailed's existingClient.
Review exact version/digest; profile revisions store IDs/digests, not copied source
payloads. Reuse lockProfileActor, lockOwnedBinding, requireSteward and quality rules.

**Rationale:** Current eligibility accepts approved profile support or checked
independent research. An upload must use a distinct path, never invented research
checks. Approved delivery excerpts reach assigned partners regardless of contributor.
Current internal stewards/admins gain original access after explicit submission,
under the unconfirmed conservative default recorded in the spec; private chat stays
private. **Alternatives:** Whole-file approval and automatic intake capture violate
scope and decision rights.

## R7 — Draft context and deletion have separate retention guarantees

**Decision:** Preserve customer-context-v1. Add a bounded unverified artifact-context-v1
injection and receipts. References stay outside submitted_messages.text; preserve
exact owner-entered native text and digest. A separate canonical send digest covers
selections. Track the union of consumed dependencies across all turns, including
compaction. Invalid dependencies make the native conversation permanently stale.
Fresh same-owner/customer chats may explicitly reattach eligible sources.

**Rationale:** Step/tool/stream/replay/history guards must all check attachments.
Deletion immediately blocks release, then purges app-owned originals, extraction
and draft payloads. Reviewed claim history remains separately, unsupported/ineligible.
Retry native clear/reset retirement, without claiming provider durable-event erasure.
**Alternatives:** Current-chip-only checks miss earlier turns; embedding extraction
inside user text makes safe deletion impossible without rewriting owner input.
Installed eve docs consulted: concepts/context-control.md,
concepts/sessions-runs-and-streaming.md, instructions.mdx and
guides/client/messages.mdx. They describe retained history, compaction and rewind;
no per-session durable-event erasure guarantee was found.

## R8 — Reuse visual behavior, replace legacy intake

**Decision:** Reference ../turas-back/app/_components/composer-attachments.tsx,
chat-attachment.tsx and its attachment UI tests for chips, keyboard removal,
file-only sends, progress and narrow layouts. Preserve current Turas styling.

**Rationale:** Legacy client extraction trusts declared types, flattens/truncates
120,000 characters, injects chat markers and infers customers by name. Rewrite it.
Keep the principle that uploads remain unverified, without automatic capture.
**Alternatives:** No legacy skill, subagent or connector is needed. Research/shared
knowledge stays in 005. Prove this slice with synthetic real scan/parser checks,
race tests, CLI WebKit and bounded evals; no participant quota or hosted gate.
