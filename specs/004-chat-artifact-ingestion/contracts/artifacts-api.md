# Artifact HTTP and domain contract v1

Planned Node app routes use existing session, same-origin/CSRF and JSON error
conventions. All commands call lib/server/artifacts domain services. Authorize
before reading metadata/bytes; denied/missing cross-scope IDs return the same 404
without filenames, sizes or state. Unauthenticated requests use existing 401 rules.
Authenticated responses are private, no-store; nosniff; no filesystem/storage URLs.

## Operations

| Method / path | Request and success | Authority / conflict behavior |
| --- | --- | --- |
| POST /api/artifacts/intents | conversationId, customerId, optional workloadId, files[name,size,declaredType,sourceDates,rights,classification], idempotencyKey →201 batch/intents, expiry, limits | Owner of bound chat; explicit customer match; reserve file/count/byte quotas atomically |
| PUT /api/artifacts/intents/:id/bytes | Binary body →204 staged receipt; stream to bounded private temp, server digest | Current owner session/scope, unexpired intent, exact expected bytes; no client storage key; retries with same digest reconcile |
| POST /api/artifacts/intents/:id/complete | idempotencyKey →200 version and durable state | Recheck current authority and actual staged digest/type/size; atomic finalize once; same key/new data409 |
| GET /api/artifacts/:versionId | Metadata, progress, coverage, safe error, capabilities | Uploader or current reviewer of explicitly submitted source; no cross-owner browsing |
| GET /api/artifacts/:versionId/units | cursor/limit → located text/value units | Same source-read authority, clean scan and ready/partial only; limit≤ 50, opaque scope-bound cursor |
| GET /api/artifacts/:versionId/original | Original bytes with sanitized attachment filename | Uploader/current submitted-source reviewer, clean ready/partial only; never inline active Office/HTML; no partner right from claim approval |
| POST /api/artifacts/:versionId/proposals | exact run/generation, ranges, claim command payload, delivery/internal classification, idempotencyKey →201 Pending revision + selection | Uploader with current customer access; atomically validate ranges/digest and submit using 003 service; partner delivery-only |
| POST /api/artifacts/:versionId/actions | retry/cancel/withdraw/delete, expectedGeneration, reason, idempotencyKey →200 state/receipt | Owner for unsubmitted draft; steward/admin after any submission; published runs cannot retry in place; stale409 |
| POST /api/artifacts/:versionId/replacements | New intent metadata + expectedGeneration/key →201 new version intent | Owner or current submitted-source steward; same scope; no copied approval; upload owner remains original owner, initiating principal audited separately |
| GET /api/conversations/:id/attachments | Linked owned versions and capabilities | Owner only; include retired metadata without content; no file existence oracle |
| POST /api/conversations/:id/attachments | existingVersionId, idempotencyKey →200 reference | Same owner/customer/environment, eligible version; new chat binding explicit; do not move origin or copy chat |
| DELETE /api/conversations/:id/attachments/:versionId | idempotencyKey →204 reference removal | Owner; detach/removing chip is not file deletion and never clears consumed dependencies |

New replacement uploader semantics preserve immutable artifact ownership; a steward
who cannot read that owner's private chat may manage a submitted source directly
through the review UI/domain path. They cannot attach it to their own chat or learn
original chat metadata. New independent uploads use the initiating user's own chat.

Existing profile review/correction/retraction endpoints remain authoritative.
Extend evidence target DTOs with artifactEvidenceSelectionId, submission channel
artifact_share and a permitted approved-excerpt DTO. No separate artifact approve
endpoint. Existing profile validation/rate limiting remains active.

## Upload and idempotency protocol

The UI creates a batch for the selected composer files, streams each intent, then
completes it. Completion response loss is reconciled using the same scoped key;
never create a second version speculatively. Native file upload/send routes remain
disabled. A file-only send is permitted only after a usable bounded selection exists.
Server-enforced batch reservations and canonical send validation independently
check the five-file/25 MiB total, so multiple batches cannot bypass message limits.

Idempotency scope includes environment/workspace/actor/operation/resource. Store
canonical body digest and original receipt. Same key/same digest returns original
result; changed scope/body returns409. A timed-out PUT with matching committed
bytes can complete; different bytes require a new intent. Incomplete bytes are
never parsed. Completion atomically records immutable object key/digest, artifact
and run after the store's conditional finalize; reconcile orphan finalize safely.

Codes: 400 malformed; 413 byte/count limit; 415 unsupported input; 409 stale or
idempotency conflict; 429 quota/rate limit with Retry-After; 503 unavailable intake.
Persisted scan/parser failures use safe codes: unsupported_format, encrypted,
malformed, unsafe_content, limit_exceeded, scan_unavailable, scan_stale,
parser_timeout, parser_failed, cancelled, source_withdrawn. Never expose stack traces.

## Visibility and projection

Before explicit proposal submission, only the owner reads original/extraction.
After submission, current internal stewards/admins can inspect the source even
while Pending or rejected. Losing that role immediately removes reviewer access.
Internal customer visibility alone grants no original access. Partners see their
own Pending/rejected proposals, and every accepted delivery claim/excerpt in their
granted customer regardless of contributor. They never gain original-file access
through acceptance. Use a generic source label and numeric locator for approved
excerpts; omit filenames, sheet names, hidden content, scope/owner/chat IDs and
extraction totals. Restricted support uses the existing source attestation.

Raw original reads are whole-file authenticated attachment responses in004; Range
requests are unsupported. Recheck authorization before opening and before each
stream chunk, and cancel on invalidation. Preview is escaped extracted text/table
content, never arbitrary HTML, office embedding or remote image loads.
