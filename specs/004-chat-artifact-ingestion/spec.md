# Feature Specification: Chat attachments and artifact ingestion

**Feature Branch**: `004-chat-artifact-ingestion`
**Created**: 2026-09-27
**Status**: Merged in [PR 6](https://github.com/mcteer/turas/pull/6) after local and CI validation; no hosted release
**Input**: Roadmap 004 and the user's requirement to attach artifacts in chat, add customer context through an approval gate, preserve useful demo interaction patterns, and prepare reliable source material for later RAG.

## Scope and intent

Allow internal users and assigned partners to attach documents to a customer-bound,
private conversation; inspect extraction progress and source locations; discuss
unverified material explicitly as a draft; and submit selected sourced context for
the existing exact-revision review flow. Preserve private originals and source
lineage without treating successful extraction as factual approval.

003 remains the authority for customer access, profile facts, stewardship, quality
and context invalidation. 004 supplies artifacts and selected evidence, not general
retrieval, embeddings, automatic research, shared knowledge publication, competency
imports, delivery planning or report generation. Those remain in later slices.
No hosted deployment, real customer import, authentication replacement, mandatory
human usability study, or unused integration is included.

## Clarifications

### Session 2026-09-27

One optional question was raised about original-file visibility. No answer has
been recorded. Planning uses the stated conservative default: the uploader can
open originals; explicit evidence submission also allows current assigned internal
stewards/admins to inspect the submitted source. Other users receive only approved,
authorized excerpts. This is a planning assumption, not a recorded user approval.
The remaining clarification scan found no product decision requiring another
question; technical limits and recovery choices are resolved in the plan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Attach and inspect customer documents (Priority: P1)

As an internal employee or assigned partner, I can add files to my private customer
chat, see what was processed, and recover from a failed upload without duplication.

**Why this priority**: Source documents are the entry point for useful grounded context.

**Independent Test**: A synthetic customer chat accepts each supported format,
shows stable file identity and accurate processing state, and denies an unassigned
partner or a different conversation owner.

**Acceptance Scenarios**:

1. **Given** an authorized customer-bound chat, **when** its owner attaches a file,
   **then** the explicit customer and chat remain its scope and a removable upload
   chip progresses to a durable artifact record after completion.
2. **Given** an unbound chat, **when** its owner tries to attach a file, **then** the
   UI requires an explicit customer choice before upload; names inside the file
   do not select or change a customer.
3. **Given** an interrupted upload or lost completion response, **when** the owner
   retries the same operation, **then** the same artifact/version is returned and
   at most one successful extraction is published for that version.
4. **Given** accepted bytes with unsupported, encrypted, corrupted or unsafe
   contents, **when** intake evaluates them, **then** it reports the specific safe
   failure category without exposing parser details or placing contents in chat.
5. **Given** a fresh chat for the same customer, **when** the same owner explicitly
   reattaches an eligible prior upload, **then** the original provenance is retained
   without copying another conversation's history or reuploading its bytes.

### User Story 2 — Review selected source evidence (Priority: P1)

As a contributor, I can propose a specific passage or table range as customer
context; as an assigned steward/admin, I can review its exact text and source.

**Why this priority**: Uploading a document must not grant factual trust or expose
an entire mixed-sensitivity file merely to share one useful delivery fact.

**Independent Test**: A selected excerpt creates a Pending profile candidate with
an immutable citation. Approval admits only that reviewed candidate and its
permitted evidence projection; rejection, correction and withdrawal preserve
003's lifecycle and immediately update eligibility.

**Acceptance Scenarios**:

1. **Given** extracted text with a page/section/slide/sheet/cell location, **when**
   the owner selects evidence and proposes a claim, **then** the reviewer receives
   exactly the selected claim, source version and evidence range, not private chat.
2. **Given** a Pending candidate, **when** a steward accepts its exact revision,
   **then** that candidate becomes accepted context; unrelated passages and claims
   in the same file remain unapproved.
3. **Given** a partner delivery fact supported by an internal or mixed file,
   **when** the fact is approved for delivery, **then** the partner sees its approved
   excerpt/attestation while hidden pages, original download and private lineage
   remain unavailable.
4. **Given** a replacement extraction or file version, **when** review is attempted
   on a stale candidate, **then** the old decision cannot silently approve new text.

### User Story 3 — Discuss uploads truthfully in chat (Priority: P2)

As a chat owner, I can ask about my uploaded material with source citations and
clear uncertainty, without making its contents accepted account facts.

**Why this priority**: Attachments must be useful within chat before a reviewer acts.

**Independent Test**: Turi reads only a bounded authorized source selection,
labels it unverified, cites its location and submits only a Pending proposal when
asked to retain a claim. A revoked or withdrawn source stops further release.

**Acceptance Scenarios**:

1. **Given** a ready/partial upload owned by the chat owner, **when** the owner asks
   for a summary of a selected passage, **then** Turi attributes the draft input,
   explains any missing coverage and does not present it as established customer fact.
2. **Given** a document containing instructions, macros, formulas or external links,
   **when** it is processed/discussed, **then** those are inert source content and
   cannot request tools, approvals, other customer data or network access.
3. **Given** an artifact is withdrawn or the current user's grant is revoked during
   a response, **when** a tool read, model step, stream/replay or history read occurs,
   **then** current authorization/eligibility is rechecked before further content is
   released; a fresh conversation cannot inherit withdrawn attachment text.

### User Story 4 — Manage source revisions and deletion (Priority: P2)

As an uploader or authorized steward, I can replace, retry, cancel and delete
artifacts with clear effects on derived context and a minimal audit trail.

**Independent Test**: Worker restart/retry, a new file revision, cancellation and
deletion never resurrect a retired source or silently alter approved evidence.

**Acceptance Scenarios**:

1. **Given** a failed extraction, **when** an authorized retry succeeds, **then** the
   new extraction has its own version and only the active run may publish results.
2. **Given** an original with reviewed dependent facts, **when** an authorized
   steward withdraws/deletes it, **then** evidence-dependent guidance becomes
   ineligible immediately, while history explains the missing source. Separately
   submitted claim history is retained; deleting the file is not deletion of claims.
3. **Given** upload or parsing work races with deletion, **when** late work completes,
   **then** it cannot publish or recreate content and cleanup remains retryable.
4. **Given** an unsubmitted draft, **when** its owner removes it, **then** no customer
   review is necessary; removal of a submitted/reviewed source requires steward/admin
   authority and a reason.

### Edge Cases

- Duplicate bytes in different customers or different private chats must not disclose
  another artifact's existence; file names never serve as identity or authority.
- Spoofed MIME/extension, path traversal, active HTML/SVG, executable/macro files,
  encrypted documents, oversized archives, decompression bombs and malicious fixtures.
- Blank files, scanned PDFs, rotated images, corrupt pages, merged spreadsheet cells,
  hidden sheets/rows, formula-only cells and missing cached values; preserve uncertainty.
- Lost upload completion, worker crash, expired claim lease, duplicate callback,
  stale extraction commit, conflicting approval, replacement and deletion races.
- Grant/steward/session changes during upload, read, review, tool execution and stream
  release; generic denied responses reveal no file name, byte count or processing state.
- A single file mixes customer delivery context, personnel information and commercial
  material; selective approval cannot make the original partner-visible.
- Removing a chip before submission is distinct from deleting durable source content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Reuse current identity, workspace/customer grants, private chat ownership
  and stewardship. Authorize every upload, status/list, preview/download, evidence
  selection, retry/cancel, deletion, tool and background publication operation.
- **FR-002**: Require explicit customer and optional workload binding before bytes
  are accepted. A stored artifact/version cannot move to another customer or chat;
  its origin remains immutable. The owner may explicitly reattach an eligible
  version to a fresh conversation for the same customer; this creates a reference,
  never transfers ownership or copies chat history. Other scopes require new upload.
- **FR-003**: Support PDF, DOCX, PPTX, XLSX, CSV, TXT/Markdown, PNG and JPEG in 004.
  Scanned PDF/image text has a bounded OCR path. Unsupported legacy Office formats,
  executable/macro files, HTML/SVG, password-protected files and remote URL import
  have useful refusal states rather than misleading successful extraction.
- **FR-004**: Enforce a versioned intake policy: at most 5 files per message, 10 MiB
  per original and 25 MiB combined; bound extracted pages/slides, sheets, cells,
  characters, archive expansion, duration and concurrent jobs. Exceeded extraction
  limits produce explicit partial coverage or a safe rejection, never silent truncation.
- **FR-005**: Store private immutable original versions with digest, detected format,
  size, owner, customer/workload, source dates/rights, classification and creation
  provenance. Random opaque identifiers replace file names in storage locations.
- **FR-006**: Quarantine new bytes until type/integrity and malicious-file checks
  pass. Process them in isolation without document-triggered network access, code,
  macro or formula execution. A failed/unavailable scanner leaves the source blocked.
- **FR-007**: Preserve versioned extraction units and stable source locations: PDF
  page, document section/paragraph, slide, spreadsheet sheet/row/cell, text lines or
  image/OCR region. Report missing/hidden/unsupported coverage explicitly.
- **FR-008**: Expose accurate upload, quarantined, processing, ready, partial, failed,
  cancelled and deletion states. Persist progress and safe failure codes so restart,
  polling or retry does not depend on the lifetime of a chat request.
- **FR-009**: Make upload completion, job claims/results, retries and destructive
  lifecycle actions idempotent and version-checked. Only the current authorized run
  may publish; ambiguous responses are reconciled before another operation starts.
- **FR-010**: Distinguish artifact access from factual approval. Original files and
  unreviewed extraction default to uploader-private; assigned stewards/admins can
  inspect the associated original and extraction after explicit evidence submission,
  but never its private chat. Internal customer access alone
  does not open another user's private chat or private draft files.
- **FR-011**: Preserve 003's partner boundary. Assigned partners may see approved
  delivery claims from any contributor and their permitted reviewed excerpts;
  other people's pending/rejected submissions and hidden source material remain
  unavailable. Approval of a claim never grants a whole-file download.
- **FR-012**: Submit selected extracted content through the existing profile review
  lifecycle. Bind a candidate to an exact artifact version, extraction version,
  range, retained excerpt and digest; accept/reject/correct/retract remains an
  explicit authorized decision. File readiness and source quality never approve facts.
- **FR-013**: Preserve user-submission origin and 003's quality rubric, dates and
  citations. OCR confidence and extraction completeness are separate from evidence
  reliability/freshness. A user-supplied file never becomes independent research.
- **FR-014**: Let the owner include selected authorized upload content in their own
  chat as clearly labeled unverified draft material. Bound reads, cite exact source
  units and distinguish missing coverage; save only Pending claims on an explicit
  retain-context request. Accepted customer context stays governed by 003.
- **FR-015**: Extend current context invalidation to artifact versions, extraction
  eligibility and draft selections. Reauthorize before each read/model step and
  output release; withdrawal, deletion and relevant access changes invalidate
  affected cached/compacted conversation context and block stale replay/history.
- **FR-016**: Preserve the reference attachment button, keyboard-accessible chips,
  removal, upload progress and error/retry presentation in both themes and mobile
  layouts. Keep extraction payloads and private storage details out of message text.
- **FR-017**: Uploader removal of an unsubmitted draft needs no steward approval;
  withdrawal/deletion after source submission requires current steward/admin
  authority, exact version and reason. Deny access immediately, invalidate dependent
  context and retry cleanup of originals, extracted content and application-owned
  draft payloads; retain only allowed minimal source audit identifiers. Separately
  submitted claims/history remain; accepted claims with unavailable support become
  unsupported and ineligible until valid replacement support is reviewed. Retire affected model sessions and block future
  replay; do not promise physical erasure of provider-owned conversation records.
- **FR-018**: Replacement creates a new original version without rewriting approved
  evidence; publishing replacement extraction does not migrate approvals. Retire
  old source eligibility only through explicit authorized action.
- **FR-019**: Keep structured spreadsheet values, formulas as inert source text and
  sheet/cell locations for 005/007. Do not create staffing competencies, embeddings,
  vector indexes or shared knowledge in this slice.
- **FR-020**: Provide synthetic fixtures, denial/lifecycle/race/extraction/citation
  checks, local recovery and CLI UI verification. Use observable scripted acceptance
  and bounded agent evaluations; require no human participant quota or timed study.

### Key Entities

- **Artifact**: Private customer/chat-scoped source identity and lifecycle.
- **Artifact version**: Immutable bytes, digest, format, classification and provenance.
- **Upload intent**: Authorized bounded upload operation and expiry/completion receipt.
- **Extraction run**: Versioned scan/parser/OCR work, lease, progress and coverage.
- **Extraction unit**: Retained text/value and precise source locator tied to one run.
- **Evidence selection**: Explicit retained excerpt/range and audience proposal used
  by an exact profile candidate or a private chat request.
- **Artifact event/cleanup job**: Audited lifecycle decision and durable purge work.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The scripted customer chat journey attaches each supported format,
  displays its processing result and exact source locations, and recovers from an
  interrupted completion without duplicate versions or published results.
- **SC-002**: All unassigned-customer, cross-owner-private, hidden-source and revoked
  access attempts in the scripted access matrix are denied without identifying
  metadata; approved delivery excerpts remain available only within current grants.
- **SC-003**: Every sampled extracted passage/table range traces to the exact original
  and extraction version; all partial/OCR/unsupported coverage is disclosed and
  no formula, macro or document instruction executes.
- **SC-004**: In every review/correction/withdrawal race, only the exact authorized
  candidate may become accepted and no unreviewed file contents enter factual
  customer context or broader partner visibility.
- **SC-005**: Synthetic deletion/replacement/revocation and worker-restart scenarios
  produce no stale publication or further unauthorized model/stream/history release;
  physical cleanup retries converge without restoring retired contents.
- **SC-006**: Four scripted desktop/mobile theme journeys complete attach, inspect,
  select, submit, review and remove flows without inaccessible controls or horizontal
  overflow. On the defined local baseline, status changes are shown within 5 seconds
  of a persisted transition and each representative fixture completes processing
  within 120 seconds after work starts. Larger inputs terminate within the same
  deadline with disclosed partial coverage or a useful failure.
- **SC-007**: Representative synthetic agent cases cite authorized exact units,
  label draft inputs, respect approval and treat embedded instructions as data;
  every access, approval and source-fidelity hard gate passes.

## Assumptions

- The three current demo principals and approved customer grants remain in use.
- Draft discussion follows the existing evidence policy; broader retrieval is 005.
- Whole-file partner sharing is not required for 004; approved excerpts suffice.
- Originals/private drafts remain owner-scoped until explicit source submission;
  the clarification section records this unconfirmed conservative default.
- Local fixtures and isolated storage prove this slice; hosted release is later.
- English OCR is the initial language; source text in supported encodings is retained
  without invented translations. Other OCR languages can be added separately.
