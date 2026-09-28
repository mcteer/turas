# Data model: Chat attachments and artifact ingestion

The local implementation uses migrations 014–018 after the immutable 001–013
history. Reuse existing UUID identities, environment markers, profile classifications,
quality rubric and actor lock order. No request-time schema initialization.

## Normative constraint blocks

These blocks are quoted in the schema/contract tasks so validation is not deferred
to implementation discretion. Business validation in 003 still applies.

- **C01:** IDs are server-generated UUIDs; workspace, environment, customer, owner and origin conversation are required and immutable; workload is nullable and must belong to that customer.
- **C02:** Original version numbers and lifecycle generations are positive integers; verified SHA-256 digest, actual size and immutable object key are required when a version is created; digests are 64 lowercase hex characters; size is 1–10,485,760 bytes; filename is 1–255 characters, stripped of path/control characters and never a storage key.
- **C03:** Source publication/observation dates are nullable, never future dates; unknown stays null; rights note is required, 1–500 characters; classification reuses audience internal|delivery and dataCategory delivery_context|internal_operations|commercial|personnel|other_internal; upload origin is manual.
- **C04:** Intent expires after 30 minutes; intent state is uploading, staged, completed, cancelled, expired or failed; version_id is null before completion and a required unique scoped reference once completed; expected file metadata remains on the intent until completion; batch has 1–5 files totaling at most 26,214,400 reserved bytes; idempotency key is 1–128 characters; same scoped key with a different canonical digest conflicts.
- **C05:** Version state is quarantined, processing, ready, partial, failed, cancelled, withdrawn, deleting or deleted; versions are created quarantined only at atomic intent completion; one published extraction per version; published content is immutable.
- **C06:** Runs have a unique attempt token, 30-second renewable lease, heartbeat at most every 10 seconds and 120-second deadline; output publication requires the exact current token, policy, generation and digest.
- **C07:** Units have a positive ordinal unique within an extraction; locator is a tagged format-specific object; text is at most 32,000 characters per unit; total extracted text is at most 500,000 characters per version.
- **C08:** Evidence selections contain 1–20 ordered unit ranges and at most 8,000 excerpt characters; offsets are Unicode code-point offsets with 0 ≤ start < end ≤ unit length; identity, range and digest are immutable.
- **C09:** Evidence links have exactly one non-null support target: profile revision, research source revision or artifact selection; all targets share workspace, environment and customer; partner proposals have delivery classification only.
- **C10:** Conversation attachment references require the same owner, workspace, environment and customer; at most 5 selected versions per send; draft context is at most 20 units and 12,000 characters per send.
- **C11:** Destructive version commands require an exact lifecycle generation and a 1–2,000 character reason; cleanup payloads contain only opaque object/session IDs and generations; lifecycle audit contains no source text or filename.
- **C12:** Extraction coverage and scan receipts are required before ready/partial; OCR confidence is nullable 0–100 and never an evidence-quality score; public evidence projections omit original filename, storage key, owner and conversation IDs.

## Entities and relationships

| Table / record | Fields and relationships | Constraints |
| --- | --- | --- |
| artifact_upload_batches / artifact_upload_intents | Scope, expected name/size/declared type, source metadata, policy version, request digest/key, expiry, reserved bytes, intent state, staged key/digest/actual size, completion receipt; required batch FK and nullable version_id; replacement intents also retain the existing target artifact/version | C01–C04; scoped unique key; version_id is a unique scoped FK, null unless completed; aggregate reservation enforced under workspace/batch locks |
| artifacts / artifact_versions | Identity, immutable origin, optional workload, version, digest/detected format, private storage key, source metadata, current lifecycle generation/state, submitted_at | C01–C05; each version has one immutable original; classification changes require new version |
| artifact_extraction_runs | Version, parser/image/scan policy and signature versions, token/lease/deadline, attempt count, safe error, progress, published flag | C06; partial unique published/version and one live claimed run/version |
| artifact_extraction_units | Run, ordinal, locator, native/OCR origin, raw typed spreadsheet values/formula/cache, hidden/merge flags, coverage notes | C07/C12; content physically purgeable; parser output schema checked before SQL insert |
| artifact_evidence_selections | Version/run, ordered ranges, immutable digest/source dates, author, audience, lifecycle generation, exact candidate association | C01/C03/C08; source cannot change behind a proposal |
| artifact_evidence_payloads | Selection FK, retained selected text and source presentation fields | C08/C12; private until explicit submission; purgeable without deleting immutable support identity |
| profile_evidence_links extension | Nullable artifact_selection_id; scoped FK and exclusive-target check | C09; migration updates old two-target constraint without rewriting old records |
| conversation_artifact_refs | Origin artifact version referenced explicitly by same owner in an owned customer chat | C10; unique conversation/version; removal does not erase consumed dependencies |
| artifact_context_receipts / conversation_artifact_dependencies | Attempt, canonical selection list/digest, app-owned draft payload and injection receipt; monotonic union of consumed version/run/generation dependencies | C10; payload purgeable; dependency identities retained after invalidation |
| artifact_lifecycle_events / artifact_cleanup_jobs | Actor or system job identity, event code, exact generation/reason, idempotency receipt, deletion target, lease/retry/status | C11; no secrets/content telemetry; cleanup never republishes source data |

Use composite scope foreign keys, not ID-only joins. The runtime role can invoke
only authorized domain writes; retain existing immutable revision/audit triggers.
All timestamps are server UTC. Keys and paths are never accepted from a client.

## Extraction locator variants

- PDF: physical page (1-based), optional page label, text-item bounding box and
  normalized offsets. OCR units add raster dimensions, region and confidence.
- DOCX: package part, section and paragraph ordinals; table/row/cell coordinates.
- PPTX: slide ordinal, shape and paragraph; notes flagged as notes rather than slide.
- XLSX: sheet ordinal/name/state, row/column/A1 range, merged range/master,
  hidden row/column flags; formula and cached value remain separate, uncalculated.
- CSV: record and column ordinal, source physical line range; multiline fields retain
  their original span. TXT/MD: physical line span. Image: dimensions and OCR region.

For units split at the character bound, retain source offsets so citations still
identify the exact passage. Preserve null cached values, omissions and unknowns;
never invent a formula result or OCR confidence. Approved partner citation DTOs use
numeric locators and a reviewed generic source label, not private sheet/file names.

## State transitions and concurrency

An intent reserves quota and starts uploading with version_id null. A complete,
bounded stream moves it to staged, retaining server-computed digest/actual size
separately from client-declared metadata. A retryable interrupted upload remains
uploading; invalid bytes may fail the intent. Cancelled, expired and failed intents
retain a null version_id and enqueue staged-file cleanup, releasing reservations
once. Upload progress is an intent projection, never a placeholder original version.

After conditional store finalization, one SQL transaction rechecks current scope,
intent state/expiry and quota, creates the artifact (or reuses the replacement's
existing artifact), inserts its quarantined version with required actual size,
digest and immutable object key, creates its first extraction run, converts reserved
bytes to committed quota, links version_id, and records completed plus the receipt.
The constraint is `(state = 'completed') = (version_id IS NOT NULL)`. Allocate the
version number under the artifact lock. A completed intent never loses or changes
its link, including after the version becomes a retained deletion tombstone. The
30-minute expiry gates completion; it does not expire a completed receipt or source.

Concurrent/retried completion returns that one version and receipt; a failed SQL
commit leaves no linked version or runnable extraction and is reconciled against
the finalized object using the same intent. Expiry/cancellation versus completion
is serialized under the intent lock. If cancellation/expiry wins, late IO is cleaned
up and cannot create a version; after completion, use the version lifecycle instead.

For versions, clean scan → processing → ready/partial. Unsafe/unsupported/corrupt
input → failed; scanner unavailable/stale stays quarantined with a retryable reason.
A failed/unpublished run may retry as a new run/token;
ready/partial runs cannot be overwritten or retried into different content. A new
parser result after publication requires a new original version, even for same bytes.

Cancellation increments generation and prevents unfinished publication. Withdrawal
retires source eligibility without physical purge. Deletion enters deleting and
immediately denies content, invalidates support and queues cleanup; deleted means
app-owned bytes/payload cleanup finished. Native retirement has a separate receipt,
not a claim of provider erasure. Failed cleanup stays deleting with retry state.
Replacement creates a new original version; the old remains eligible until explicitly
withdrawn/deleted. Approvals do not migrate to replacements.

Classification retains both existing audience and dataCategory; only delivery plus
delivery_context can produce partner-visible evidence. Original classification
never grants a partner download; a reviewed excerpt has its own explicit audience.

Profile proposals remain Pending/manual. Submission atomically freezes selection,
creates the candidate and marks the source as submitted. Current internal
stewards/admins can then inspect its original/extraction; they never gain chat access.
Any submission, even later rejection, means subsequent source withdrawal/deletion
needs steward/admin authority. Selected content corrections create new selections
and revisions, never rewrite existing ones. Approved delivery excerpts inherit the
accepted revision's visibility. Deletion preserves separately submitted claim/review
history; accepted claims with invalid support are visibly unsupported and excluded
from current factual context. Alternative support requires explicit reviewed revision,
not silent relinking. Invalidate direct and transitive dependents.

Lock existing actor/membership/session/workspace/org/customer/grant rows first,
then owned conversation binding, sorted artifact/version rows, batch/quota and job
rows in consistent order. Worker publication uses a persisted initiating principal
and current grants, not an expired login requirement. Human requests always require
a current session. Do not hold these locks during filesystem IO or parsing; stage
outside transactions and publish with a final version/authority comparison.

## Deletion and recovery boundaries

Application cleanup covers original/staged files, extraction, selection payloads,
all app-owned source-excerpt copies in draft/injection caches, projected draft event
bodies and affected generated
history/title content. Preserve exactly typed owner messages, separately submitted
profile claims and allowed minimal IDs/digests/reasons. Route/model/output fences
hide stale generated history immediately. Do not promise removal from an already
rendered client, provider logs or eve durable rewind records. Clear/reset affected
native sessions through documented APIs and persist/retry retirement receipts.

Keep raw artifact excerpts out of immutable customer-context-v1 snapshots: those
retain separately submitted accepted claim payloads, support IDs/attestations and
quality only. Approved excerpt display reads the purgeable selection payload through
authorized profile projections; explicit owner draft reads use artifact-context-v1.
This preserves existing snapshot digest/immutability without retaining extra source
copies in an undeletable receipt. Broader retrieval of source excerpts remains 005.

Late uploads, parser output and native projections must observe tombstones before
writing; discarded output goes to cleanup. Tombstones and idempotency receipts
survive cleanup. Reconcile staged/orphaned objects after expiry using DB ownership
and a safety age, never by deleting an arbitrary directory. Restore tests use a
matched disposable DB/store clone and never change the developer's working data.
