# Support API v1

Contract version `support-v1`. Scope and lifecycle constraints are [C01–C12](../data-model.md). All handlers reuse current session resolution, same-origin/CSRF mutation guards, bounded JSON parsing, `HttpFailure` mapping and `Cache-Control: no-store`.

## Routes

| Route | Input / result |
| --- | --- |
| `GET /api/support/customers/:customerId` | Optional workloadId, audience, kind, disposition, cursor, limit. Returns authorized scope/version, effective readiness, page of actions and nextCursor. No initialization writes. |
| `POST /api/support/customers/:customerId/preview` | Exact record/revision/scope and requested audience. Returns eligible review representation, sourceDigest, expectedVersion and expiry; preview expires after five minutes and grants no permission. |
| `POST /api/support/customers/:customerId/commands` | Discriminated command below; returns content-free receipt plus current-authorized projected result or refresh-required marker. |
| `POST /api/support/customers/:customerId/advice` | requestKey, fresh owned conversationId, workloadId, audience, expectedScopeGeneration, selectedEngagementIds and sourceRefs. Returns attemptId/conversationId/nativeRequestId/prepared status. |
| `GET /api/support/receipts/:requestKey` | Actor/environment/workspace-owned reconciliation; returns operation, exact affected IDs and committed/expired state. |

Advice status, stop, native dispatch, stream/reconnect and history use the existing conversation endpoints and transport with the new server-owned support binding. Do not add a parallel streaming API. Record detail/history is selected on the GET route using optional recordId and history cursor; list filters and detail mode are mutually exclusive.

## Role Matrix

| Capability | mcteer | panel | partner |
| --- | --- | --- | --- |
| Read current accepted internal guidance | Yes | Yes | No |
| Read accepted delivery guidance | Yes | Yes | Assigned customer only |
| Read drafts | All support drafts in authorized customer | Own support drafts | No |
| Save/revise proposals | Yes | Own drafts/new proposals on accepted records | No |
| Accept/reject/withdraw or confirm outcomes | Yes | No | No |
| Prepare/read own advice and save suggestion | Yes | Yes | No |
| Read another person's conversation/advice | No | No | No |
| Receipt lookup | Own commands | Own commands | No mutation receipts |

Scope metadata and list counts are computed only from visible records. Unknown/not-allowed customer and record references use the same generic 404 response; a known permitted scope with insufficient command capability returns 403. Server-derived principal/session/environment fields are never accepted from request JSON.

## Commands

Common envelope: `contractVersion`, UUID `requestKey`, nullable `workloadId`, nonnegative `expectedVersion` and `operation`. Scope initialization is part of the first explicit mutating command, serialized by the unique scope key. Existing record operations also supply exact `recordId`; expectedVersion is that record's version, or zero for creation.

| Operation | Additional fields / semantics |
| --- | --- |
| `save_assessment` | Immutable audience on creation; structured six-check content, sourceRefs, selectedEngagementIds. Creates a pending revision, not a fact approval. |
| `save_action` | Immutable audience on creation; structured action content and sources; may reference an exact accepted assessment as context. Existing record audience cannot be changed. |
| `review_revision` | revisionId, decision accept/reject, preview sourceDigest, rationale. mcteer only; exact current revision and sources rechecked. Acceptance atomically updates head/disposition and scope generation. |
| `withdraw_record` | exact accepted revisionId, preview sourceDigest and rationale. mcteer only; immediately removes current eligibility and queues exact payload cleanup. |
| `save_suggestion` | completed own attemptId, exact suggestion index/output digest and editable proposed content. Sources must resolve to that attempt's retained original source map; recheck scope/audience and dependencies. Creates pending action only, once per request key. |

Disposition updates, escalation details and human-reported handoffs are `save_action` revisions followed by ordinary exact review. There is no extra status endpoint that bypasses this path. Saving model-derived content into another audience is refused; use a separately prepared delivery-only attempt.

## Source / Review Protocol

1. Authenticate and lock current actor/workspace/customer authority; restrict to requested audience before resolving sources.
2. Select bounded dependency metadata, including scope collection generation and each selected engagement's current baseline/generation. Source references themselves must be current exact revisions.
3. Lock the sorted original source union, selected engagement/execution heads and support head. Recheck pointers, evidence quality/conflicts, workload, ownership and view generation; no external I/O occurs here.
4. For writes, validate C01–C10 and review authority. Validate pending user claims through the existing context workflow; do not convert them while accepting support guidance.
5. Resolve same-key receipt or atomically append revision/decision, move heads and persist a content-free receipt. Return only a fresh authorized projection. Receipt replay never echoes an old body whose sources are now withdrawn.

Previews are advisory; expiry or changed sources/version returns 409 with a refresh instruction and leaves the original draft available under its current policy. Pending review may show an unavailable-source marker, not withdrawn passage content. Reject/withdraw may use a fresh metadata-only unavailable-source preview; only acceptance requires positive evidence eligibility. Explicit discovery actions may be saved without evidence, but ready/gap/completed assertions cannot be accepted without qualifying support.

## Lists, Limits and Errors

- Stable ordering: overdue next review first, then high/normal/low priority, then createdAt/id. Customer/workload scope, actor, audience, filters and ordering are bound into a signed opaque cursor; cursor lifetime is 15 minutes. Reauthorize every page. If ordering generation changed, return a refresh conflict instead of duplicating/skipping records silently.
- Pages: default 20, maximum 50. No hidden totals. Direct evidence ≤20, selected engagements ≤10, transitive sources ≤200, body ≤64 KiB; oversized sets return 422 without truncation.
- Rate admission: shared persisted limiter; per membership/environment, 60 support reads/minute and 30 support writes/previews/minute. Advice additionally follows C11. Return 429 and Retry-After; successful receipt reconciliation is counted as a read, not another write/advice admission.
- Errors: 400 malformed input; 401 expired/no session; 403 denied capability; 404 hidden scope/record; 409 version/source/key/context/expired-receipt conflict; 413 body too large; 422 semantic bounds/date/owner issue; 429 bounded rate/budget; 503 disabled or unavailable infrastructure. Return stable categories and correlation ID, not SQL, source text or URLs.
- No model call, read, GET or runtime handler initializes/migrates the schema. Missing required schema returns unavailable.

## Disable and Telemetry

`TURAS_010_DISABLED=1` rejects new saves/reviews/advice preparation and provider admission. Retained eligible reads, receipts, stop, metadata-only terminal reconciliation and independent retention continue. Log contract/operation/category/duration/usage/correlation identifiers only. Do not emit payloads, titles, source locators, customer names or external URLs.
