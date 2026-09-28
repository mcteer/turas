# Artifact storage and worker contract v1

Only a trusted supervised host worker touches the private store and controls
containers. No public callback can publish parser results. No new eve integration.

## artifact-intake-v1 limits

| Boundary | Enforced limit / result |
| --- | --- |
| Upload | 5 files/message, 10 MiB/original, 25 MiB/batch and message, nonempty bytes |
| Intents | 5 new batches/minute/principal, 2 unfinalized batches/principal, 30-minute expiry |
| Queue/storage | 10 queued versions/customer, 50/workspace; 2 GiB committed+reserved original bytes/workspace; 50 MiB derived output/version; reject excess429 before accepting bytes |
| ZIP | 2,000 entries, 100 MiB total actual expansion, 20 MiB/entry; reject nested/encrypted archives, duplicate normalized paths, traversal, macros/embedded executables/active objects and external OOXML relationships |
| Pages/slides | Inspect at most 100 PDF pages or slides; overflow recorded as explicit partial coverage |
| Sheets/cells | 20 sheets, 50,000 nonempty cells, 32,000 characters/cell; disclose omitted hidden sheets/rows or unsupported content, never silently drop |
| Text | 500,000 extracted characters/version, 32,000/unit with mapped splits |
| OCR | English, at most 10 pages/images, 16 megapixels/input or raster, 10 seconds/image; one OCR worker; global parse deadline still applies |
| Scan | 30 seconds; pinned image, signatures≤ 7 days old; errors/limits/stale/missing definitions block |
| Parse | 90 seconds; 1 GiB RAM, 2 CPUs, 64 PIDs, 128 MiB tmpfs; output≤ 50 MiB |
| Scan container | 4 GiB RAM, 2 CPUs, 64 PIDs, 128 MiB tmpfs; no network during scan |
| Job | One active artifact job locally/CI; scan then parse; total deadline 120 seconds; 30-second lease renewed ≤ 10 seconds |
| Retry | At most3 automatic attempts for transient infrastructure faults, delays 10/30/90 seconds; manual retry after terminal failure creates a new run/key |
| Cleanup | Independent bounded lane, batch≤ 20 jobs, retry with exponential backoff capped 5 minutes; retry until success/operator repair, no silent discard |

Ready/partial means scan clean and schema-valid manifest. Scanner unavailable/stale
stays quarantined with a safe reason and bounded retry; malicious/unsupported input
is failed and has no automatic retry. Manual retries revalidate policy/authority.
After three transient attempts the UI offers retry and diagnostics without raw logs.
An oversized document may return partial only with exact visited/omitted coverage;
a killed/incomplete parser process never publishes arbitrary partial output.

## ArtifactStore interface

- stage(intent, boundedStream): calculate actual size and SHA-256 while writing a
  private temp file; reject mismatch/overflow and retain only safe recovery metadata.
- finalize(intent, expectedDigest): conditional immutable promotion; no overwrite,
  no cross-customer deduplication signal; return opaque key only to trusted service.
- read(key): stream after domain authorization; no public path or signed bypass URL.
- delete(key): idempotent; absence is success. Reconcile only DB-owned opaque keys
  or aged staging entries under the configured store root, with traversal/symlink
  protection and environment marker checks.

App/worker startup rejects a store inside public or an unmarked/shared environment
root. Files/directories use owner-only permissions. Temporary input mounts expose
only one authorized original read-only. Output uses a size-enforced ephemeral
filesystem rather than an unbounded host bind mount. Validate/copy output after
container exit before committing; no paths provided by documents become host paths.

## Isolation, preflight and extraction

Use non-root containers, read-only root, network none, no-new-privileges, all
capabilities dropped, resource/PID/time limits. Never mount repo, .env.local,
credentials, DB config or Docker socket. Signatures and OCR assets are prepared
explicitly before work with pinned version/digest manifests. Signature preparation
may use network; it must never receive uploaded documents. Deny execution of macros,
formulas, active HTML/SVG and external document relationships.

The scan container receives original bytes and publishes a digest-bound scan receipt.
Then the parser verifies the same digest/type and inspects OOXML ZIP entries before
using adapters. Match file magic, allowed extension and declared format; unsupported
mismatch fails. Plain text/CSV/Markdown require fatal UTF-8 decoding; no encoding
guesses. External links in plain text stay inert. Images get no remote fetches.

Parser output is a versioned JSON manifest plus bounded unit payloads: original
SHA-256, parser/image/policy version, scan receipt reference, format, units/locators,
coverage totals/visited/omitted reasons, OCR provenance and warning codes. Host
validates all schema/size/scope assumptions; parser cannot choose customer, owner,
classification, storage key or approval. Preserve blank/no-text results as ready
with no units and an explanation, never invent evidence; encrypted input fails.

## Claim, publish and revoke

Only successful intent completion creates a quarantined version and its first
queued run. Uploading/staged intents have no version link and are never claimable.
Completion commits the version, run, quota conversion and intent receipt together;
a finalized file without that transaction is an orphan to reconcile, not scan work.

Use short SQL transactions with SKIP LOCKED to claim oldest eligible work, unique
attempt token and renewable lease. Database timestamps determine deadline/expiry.
Persist the authorized initiating principal at intake. Ordinary login logout/expiry
does not cancel consent; publication checks active membership, workspace/environment,
partner org/grants and current initiating authority (owner or submitted-source
steward). Explicit revocation, cancelled/deleting source, replaced run token or
changed generation prevents publication and schedules discarded output cleanup.

Keep existing actor/customer lock order before sorted artifact/version locks. Do not
hold locks during IO. Final publication compares digest, current token/lease,
generation, scan/parse policy and live authority; commit units, coverage and ready/
partial state once. Expired worker output cannot resurrect data. Restart reclaims
expired leases; unique publication constraints and receipts handle duplicate results.

Cleanup runs independently of login or uploader revocation because it can only
remove app-owned content. It records receipts for object/payload purge and native
clear/reset retirement separately. A failing cleanup does not restore eligibility.
Reconcile aborted PUTs after 30-minute expiry; orphan finalized objects only after
1-hour safety age plus absence of live DB intent/version references. A tombstone
check also fences late chat projection writes, not just parser publication.

## Operational signals and recovery

Emit IDs, versions, byte/unit counts, duration, queue age, lease reclaim, safe error,
scan definition age, cleanup lag and retry count. Never log filename, source text,
claims, credentials or storage paths. Local readiness reports DB/store/worker health
and prepared scanner/parser availability; unprepared intake returns503 while normal
chat/profile operations remain usable. No automatic signature download at app boot.

Root npm run dev supervises Next.js, eve, current maintenance and the new artifact
worker. Stop only owned child processes/containers. Tests must prove that a slow
parser does not delay the five-second maintenance scan, and restart does not lose
receipts. Keep model selection and existing DB/workflow data. A separate disposable
DB/store clone proves schema 013 upgrade and restore; forward repair is preferred
to destructive rollback after evidence has been reviewed.
