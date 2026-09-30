# Plan API and domain contract v1

All new routes use the existing session, origin/CSRF, strict-body, safe-error and
private/no-store response conventions. They call the plans domain; no route runs
DDL or duplicates policy. Envelopes carry `contractVersion: delivery-plan-v1`.
Path, query and body scope are untrusted. Reauthorize scope and the requested operation capability before command replay.

## Domain operations and routes

| Operation | HTTP surface | Input / result |
| --- | --- | --- |
| List plans | GET `/api/plans?customerId=&workloadId=&limit=&cursor=` | Authorized summaries only; scope-bound keyset pagination; no hidden counts |
| Create | POST `/api/plans` | requestKey, customerId, optional workloadId, audience, ownerMembershipId, initial draft content → plan/revision/version receipt |
| Inspect | GET `/api/plans/{planId}?revisionId=` | Current eligible detail; default authorized working revision or accepted baseline; explicit contentAvailability |
| History | GET `/api/plans/{planId}/revisions?limit=&cursor=` | Authorized revision metadata; no hidden head pointer or inaccessible draft counts |
| Save revision | POST `/api/plans/{planId}/revisions` | requestKey, expectedAggregateVersion, parentRevisionId, baseAcceptedRevisionId, content, changeReason → new immutable draft |
| Submit | POST `/api/plans/{planId}/submit` | requestKey, expectedAggregateVersion, revisionId, contentDigest → in-review transition or field errors |
| Preview decision | POST `/api/plans/{planId}/review-preview` | requestKey, expectedAggregateVersion, revisionId, contentDigest → 10-minute session-bound preview, source-state digest, readiness and exact body |
| Decide | POST `/api/plans/{planId}/decisions` | C09 fields; optional existing engagement ID for first acceptance → decision/baseline/engagement receipt |
| Compare | GET `/api/plans/{planId}/diff?base=&target=` | `plan-diff-v1` structured changes between two authorized readable revisions; never returns hidden content |
| Resolve source | GET `/api/plans/{planId}/revisions/{revisionId}/sources/{dependencyId}` | Exact current-authorized original excerpt/locator, or generic unavailable status |
| Command receipt | GET `/api/plans/commands/{requestKey}?customerId=` | Actor-scoped minimal IDs/version/outcome after current scope check |
| Engagement detail | GET `/api/engagements/{engagementId}` | Accepted baseline, eligible historical revisions and review-required flag; no execution progress |
| Engagement list | GET `/api/engagements?customerId=&workloadId=&limit=&cursor=` | Customer profile projection; same audience filtering as plans |
| Start draft attempt | POST `/api/plan-drafting` | requestKey, planId, expectedAggregateVersion, baseRevisionId, instructions → fresh owned conversation, attempt ID and dispatch receipt |
| Draft status | GET `/api/plan-drafting/{attemptId}` | Owner-only execution state, safe error, deadline, reported usage and saved revision receipt |
| Cancel draft | POST `/api/plan-drafting/{attemptId}/cancel` | requestKey → current cancellation/saved outcome through existing turn cancellation |

Every command uses constraints C01–C12 in [data-model.md](../data-model.md).
All mutations require requestKey; source/body digests are recomputed server-side.
Do not accept a model-generated decision, owner claim or scope as authority.
Admission cannot reuse a populated ordinary conversation ID. Read operations do not
persist review decisions or preview receipts as a side effect.

## Permissions

| Capability | Internal administrator | Internal member | Assigned partner | Unassigned/inactive |
| --- | --- | --- | --- | --- |
| Read scoped plan metadata/body | Yes under source gates | Yes under source gates | Own delivery drafts and accepted delivery revisions only | Hidden/denied |
| Create draft | Internal or delivery | Internal or delivery | Delivery only | Denied |
| Revise/submit | Any scoped plan | Any scoped plan | Own created delivery plan only | Denied |
| Create review preview / decide | Yes (initial policy) | No | No | Denied |
| Draft with Turi | Authorized plan; fresh audience-bound session | Same | Own authorized delivery plan | Denied |
| Read another user's drafting/chat history | No | No | No | Denied |
| Change scope/audience in place | No | No | No | No |

Current source access is required even for administrators. Admin status is not a
bypass around source withdrawal. Customer stewardship is independent of plan review.
The reviewer may also be author in this demo; UI never calls that independent review.

## State, submission and decision

`draft → in_review → accepted|changes_requested|rejected`.
Edits always create a new draft; edits to an in-review head invalidate that review.
An accepted revision stays baseline until a replacement is accepted, when its
historical display becomes superseded. Its original decision remains accepted.

Submission checks structural completeness and audience/source integrity. Acceptance
also checks decision-critical evidence/fit, explicit unknown ownership, readiness,
current source-state digest, and the human delivery-suitability attestation when
applicable. Review preview shows blockers; request-changes/reject can explain them
without requiring acceptance readiness. They cannot expose withheld source content.

Decision section is derived from server records, never editable JSON or model prose.
A client cannot make a plan accepted by writing a status field. Unsupported factual
claims must first use the existing context-review flow or remain labeled assumptions.

## Atomicity, concurrency and replay

The transaction locks current actor/customer authority, plan aggregate, preview
and target engagement, then original source/lineage headers in stable kind/ID
order. Source mutations acquire the same headers before changing events/generations. Recompute readiness immediately before commit. A source mutation racing
a decision serializes on the same source/generation locks; it cannot win between
check and commit without invalidating subsequent current use.

First acceptance performs all of these or none: decision, canonical engagement/link,
milestone baseline, accepted pointer, preview consumption and command receipt.
Replacement acceptance keeps the engagement and versions its baseline in one
transaction. Use same-scope composite FKs and unique plan/engagement/revision
constraints, not a client-side existence check. Distinct keys racing the same
submitted revision yield one success and conflicts, never separate engagements.

Same key and canonical request digest returns the original minimal outcome after
current authorization, even if the preview later expires. A changed request under
that key returns 409. Lost response reconciliation reads the receipt before retrying.
No request stores a full response body for unconditional replay.

## Readiness, source and error semantics

`contentAvailability` is `readable`, `historical_warning`, `withheld` or `purged`.
`reviewRequired` is computed independently of historical review state. A withheld
body includes no title, summary, diagram, comparison fragments, milestone text or
rationale. It can expose scope-authorized IDs/status/time and generic next action.
An actor without plan visibility receives the same hidden-record response as a
missing plan; source reasons never identify another customer.

Use 401 for missing/revoked authentication; 404 for hidden/missing scoped objects;
403 for known-object forbidden capability; 409 for version/request/context/decision
conflict; 413 for bytes; 422 for field validation; 429 with retry-after for limits;
503 for readiness/provider unavailable. Include safe code, field path when allowed
and operation ID; never raw SQL/provider messages, credentials or source prose.
Readiness unavailable is distinct from an empty plan list.
