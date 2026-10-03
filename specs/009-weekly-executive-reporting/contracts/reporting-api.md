# Reporting API Contract

**Contract**: `reports-v1`. Routes are thin adapters over `lib/server/reports/`;
workers and future consumers use the same domain, never a second approval path.
All user routes use current authenticated sessions and same-origin/CSRF checks for
writes. Environment/workspace/actor come from trusted server configuration/session.
No caller may submit role, reviewer identity, raw source payload, recipient authority
or a private object path as proof of permission.

## Response and Command Shapes

Success: `{ contractVersion, data, requestId }`.
Failure: `{ contractVersion, error: { code, message, retryable }, requestId }`.
No stack, address, hidden object title/count or provider response body in errors.
IDs in unauthorized scopes return the same 404 shape as absent records.

All commands require `requestKey`, `expectedVersion` and a strict `action` union.
Review actions also require `previewId`, `previewDigest` and rationale. Creation
uses expectedVersion 0; all other mutations require the exact current positive
version. Previews bind actor/customer/action, exact source/content/artifact/policy
versions and expiry server-side. They are not bearer permission tokens.

Receipt replay authorizes current access first. Same key/action/body returns current
safe projection of result IDs; same key with different canonical body returns 409
`request_conflict`. A lost acknowledgement is resolved by receipt lookup, not a new
request key. Paginated cursors bind actor/scope/audience/filter and expiration;
changed scope or expired cursor requires a fresh list.

## Route Catalog

| Method and Path | Input / Output | Authority |
| --- | --- | --- |
| GET `/api/reports/customers/[customerId]` | Kind/period/audience/status filters, 1–50 page size → visible report cards and cursor | Internal reader; partner only published delivery projection |
| POST `/api/reports/customers/[customerId]/commands` | `prepare` with canonical scope/period/partial; `create_policy`; `revise_policy`; `create_schedule`; `pause_schedule`; `resume_schedule` | Internal prepare; mcteer for policy/schedule mutations |
| GET `/api/reports/[reportId]` | Current visible revision metadata, sections, safe citations, artifact status, correction status | Internal scoped reader; partner published delivery only |
| GET `/api/reports/[reportId]/history` | Paginated revision/publication metadata, current safe projection | Same; no partner drafts or recipient diagnostics |
| GET `/api/reports/[reportId]/sources` | Current safe source labels/locations, restricted lineage only for authorized internal reviewer | Policy intersection with every source |
| POST `/api/reports/[reportId]/commands` | `revise` with source-block selection/annotations; `render`; `cancel_job`; `correct` with predecessor and reason | Internal contributors, mcteer for publication withdrawal |
| POST `/api/reports/[reportId]/preview` | `publish`, `reject`, `withdraw` or `send` → exact expiring preview | mcteer |
| POST `/api/reports/[reportId]/decisions` | Preview-bound action/rationale/request identity → publication/decision/receipt | mcteer |
| GET `/api/reports/artifacts/[artifactId]` | Authorized streamed PDF/PPTX or preview, safe filename and media type | Current source and audience checks; no public redirect |
| GET `/api/reports/customers/[customerId]/policies` | Internal policy versions/addresses/schedule status, paginated | mcteer management; panel sees redacted readiness only |
| POST `/api/reports/policies/[policyId]/preview` | Exact `approve`, `pause`, `resume`, `revoke` → preview | mcteer |
| POST `/api/reports/policies/[policyId]/decisions` | Preview-bound policy action → receipt | mcteer |
| GET `/api/reports/[reportId]/deliveries` | Per-recipient status/attempts and current corrections; private diagnostics | mcteer; panel gets aggregate status with no addresses/provider IDs |
| POST `/api/reports/deliveries/[deliveryId]/commands` | `cancel`, `reconcile` or `retry` → metadata receipt, subject to state/identity rules | mcteer; no force-resend action |
| GET `/api/reports/receipts/[requestKey]` | Current safe receipt/result identity | Same authorized actor and scope; mcteer scoped audit allowed |
| GET `/api/reports/readiness` | Boolean capabilities and safe blocking codes only | Authenticated internal member |
| GET `/api/reports/brands` | Configured versioned brand metadata and preview samples | Internal; only approved safe assets in partner output |
| POST `/api/reports/brands/[brandId]/preview` | Exact asset/font/master/render sample manifest → review preview | mcteer |
| POST `/api/reports/brands/[brandId]/decisions` | `approve` or `revoke`, exact preview and rationale | mcteer |
| POST `/api/webhooks/reports/resend` | Bounded raw signed provider event → acknowledgement | Verified provider signature, known environment; no browser session |

Brand candidate manifests are bundled/versioned by implementation and registered
through explicit preparation, not arbitrary remote upload. Policy creation/revision
never approves itself. Approving a policy is not send authority. Publishing a report
is not send authority. An approved send decision enqueues each recipient exactly once.

## Status and Failure Codes

401 `unauthenticated`; 403 `forbidden` where object visibility is already established;
404 `not_found`; 409 `version_conflict`, `request_conflict`, `preview_expired`,
`source_changed`, `policy_changed`, `delivery_uncertain`; 413 `body_too_large`;
422 `invalid_input`, `scope_too_large`, `incomplete_sources`, `layout_failed`,
`font_unavailable`, `recipient_invalid`, `invalid_period`; 429 `rate_limited` with
Retry-After; 503 `report_schema_unavailable`, `worker_unavailable`,
`store_unavailable`, `sender_unavailable`, `brand_unapproved`, `feature_disabled`.
Provider errors are mapped to sanitized classes; they never surface raw responses.

Read-only pages may remain available when new work is disabled. Existing ineligible
content returns safe withheld metadata rather than its stored prose. File ranges
are either unsupported or rechecked with identical scope; implement v1 without
Range to simplify per-chunk release checks. Download response is attachment,
`private, no-store`, nosniff, safe ASCII fallback filename and MIME-specific disposition.

## Durable Job Interface

`claimReportJobs(environment, kind, limit)` returns only eligible exact jobs and a
lease token. `completeReportJob(id, token, inputDigest, resultDigest)` commits only
if the lease, source/policy versions and current authority still pass.
`dispatchReportDelivery` accepts only persisted delivery identity, never ad hoc
addresses/content. `recordVerifiedReportEvent` accepts only already verified provider
evidence. No job obtains broad administrator rights from its transport credential.

## Required Contract Matrix

Cover mcteer, panel, assigned partner, unassigned partner, revoked member/session,
wrong workspace/environment, source revocation, changed policy/brand, expiry and
same-key conflict across lists/details/sources/history/previews/decisions/downloads/
receipts/worker claims and sends. Include hidden metadata and document package
contents. Malicious source text, forged preview digest and verified-but-unmatched
provider events cannot cross the boundary. Readiness must not reveal configured
addresses, paths, tokens or raw failure diagnostics.
