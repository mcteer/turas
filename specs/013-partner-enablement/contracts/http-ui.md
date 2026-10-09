# HTTP and UI Contract: partner-enablement-v1

## HTTP surface

All routes are authenticated, environment scoped and call the governed domain. Responses include `contractVersion: partner-enablement-v1`, `Cache-Control: private, no-store` and `Vary: Cookie`. No public cache or business-state mutation by GET; bounded private discovery cursors are the only read-generated cache metadata. Existing CSRF/same-origin/content-type protection applies to POST. Reject unknown fields, invalid UUIDs, excessive nesting and C02/C04/C09 bounds before domain work; maximum request body is 160 KiB.

| Method/path | Input and response |
| --- | --- |
| GET `/api/partners/workspace` | C08 search/page/cursor; authorized customer cards with safe existing-domain links and hasMore/nextCursor |
| GET `/api/partners/customers/:customerId/engagements` | C08 page/cursor/search, optional workloadId; accepted delivery cards, current eligibility and existing plan/execution/support links |
| GET `/api/partners/customers/:customerId/members` | mcteer only; C08 eligible assignment-target page; no partner roster endpoint |
| GET `/api/partners/guides` | Required customerId/engagementId plus C08 paging; partner sees published identities only; internal includes working status |
| GET `/api/partners/guides/:guideId` | Current guide projection, eligible exact published revision for partner; internal may select an authorized revisionId for review/history |
| GET `/api/partners/assignments` | Required customerId, optional engagementId/memberId; C08 paging; partner memberId must be self; internal member filter remains customer scoped |
| GET `/api/partners/assignments/:assignmentId` | Current learning projection, own attempts/internal review, history and C12 progress |
| POST `/api/partners/commands` | Strict action union, requestId, expectedVersion, target IDs, action payload and previewId where required; minimal receipt |
| POST `/api/partners/previews` | Exact review/assignment action and proposed input/version; actor/session-bound preview ID, expiry and authorized review projection |
| GET `/api/partners/requests/:requestId` | Own currently authorized minimal `committed`, `not_found`, `pending`, `abandoned` or `retired` result under the admission lock; never prior payload |
| POST `/api/partners/requests/:requestId` | Explicit resolve-if-absent with opaque target scope; under the same lock return committed outcome or persist an abandoned tombstone, preventing late admission |

Member/workspace/environment identity is taken from the authenticated request, never trusted from a client override. A command receipt exposes requestId, action, target identity, committed version, outcome and committedAt when retained; no input hash, source closure or customer prose. Unknown fields in the selected action are invalid. Changing action/target/body under requestId is a conflict. Preview creation is itself idempotent using a requestId; replay cannot refresh expiry or source binding. A preview receipt only exposes an unexpired currently authorized preview identity, otherwise `expired`.

Status codes: 401 missing/expired session; 404 unknown or inaccessible target; 403 known-role capability denial without target detail; 409 stale version/source/authority/preview or request conflict; 410 expired preview or command replay of a retired/abandoned request where identity remains authorized (status GET returns its minimal state with 200); 202 pending reconciliation; 422 invalid input/bounds/evidence criteria; 429 quota with Retry-After; 503 disabled or required schema unavailable. An uncertain transport result is a client state, never falsely reported as a definitive rollback. Safe reason enums may distinguish stale guide/evidence for an authorized internal reviewer, but cannot identify a hidden source. Revalidate all persisted cursor scope on every request; reject stale cursors and restart discovery.

## UI surfaces

- `/partners`: partner navigation item “Partner Delivery”; internal staff may also open it. Paged assigned customer search, selected delivery work and the existing shared-knowledge entry point. Zero grants shows an explicit empty state with usable shared knowledge. Do not present internal gaps/expansion/finance/staffing links to partners.
- `/partners/customers/[customerId]`: paged accepted delivery engagements and published guides/own assignments, with links into the existing plan/proposal, execution and accepted support views. Internal users get draft/review actions according to capability flags from the server. User-visible terms remain delivery plan, guide, lesson, checkpoint and learning progress.
- `/partners/guides/[guideId]`: structured lesson explanation, exact baseline, citations/quality/dates/unknowns and checkpoints. Internal authoring and preview/review controls show exact version, rationale and self-review acknowledgment. Preserve prior published head when editing/rejecting. mcteer assignment picker is scoped to currently eligible individual members and uses a preview before commit.
- `/partners/assignments/[assignmentId]`: own checkpoint draft/submission, blocker and source selection; explicit pending/changes requested/verified/obsolete/withdrawn states; reviewer feedback and exact evidence preview for mcteer. Renewal is a visible new assignment beginning at zero, with dated history separately labeled. No certification badge, accepted delivery percentage or automatic competency update.

Use the existing shared-knowledge page and existing domain routes discovered from the customer shell; do not manufacture a second knowledge library or delivery editor. Long content wraps, errors identify the actionable field, focus moves to validation summary/decision result, and dialogs return focus to their trigger. All actions support keyboard and visible focus in light/dark desktop/mobile. No customer text in browser persistence, URL search parameters, logs or telemetry; search text stays transient in memory and is sent only to the no-store API.

## Revalidation and uncertainty

New protected components clear their body before every protected refresh, every visibility regain/focus and at least each 15 seconds while visible. Hidden tabs remove protected content when hidden; browser back/forward and remount perform a fresh no-store read. Increment a request generation on scope/session/visibility changes and reject older responses. Any revalidation error keeps the body cleared with retry/sign-in as appropriate; never fall back to a cached body. This contract applies to new 013 pages; existing domain pages retain their tested domain policies.

Disable mutation controls while an outcome is unknown. Retain only opaque request/target IDs and contract version in session storage, keyed by current principal/environment. On reload or focus, reconcile first under current authorization; remove pending state on sign-out, denied access or terminal resolution. If status is `not_found`, retry the same input/identity only while the original in-memory input is available; after reload use explicit resolve-if-absent to persist an abandoned tombstone under the admission lock, then allow an explicitly new action. If the original commits first, resolve returns its receipt instead; if the lock is busy, remain pending. Resolution is available while new work is disabled. Never reconstruct or persist customer prose to replay silently.

The loading shell, counts, empty states, validation messages and accessibility labels obey the same projection boundaries as the main content.
