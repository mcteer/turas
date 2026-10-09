# 012 HTTP and UI Contract

Version `product-gaps-v1`. New files are planned, not installed. All handlers delegate to the [governed domain](domain.md). C01–C16 and existing session/same-origin controls apply.

## HTTP surface

Base `/api/product-gaps`; routes are session-authenticated, same-origin and `Cache-Control: private, no-store`. Responses carry the current contract version and opaque scope generation; no public cache, public blob URL or unauthenticated capability token. POST requires the existing CSRF/origin checks. Reject unknown keys, malformed IDs, oversize bodies and invalid dates before domain work. Do not trust client-supplied role, count, source score or approval.

| Method and suffix | Behavior |
| --- | --- |
| GET `/` | Authorized registry with search/kind/product/disposition/customer filters, C10 cursor and limit; reviewed count/order factors and explicit missing evidence |
| POST `/` | Propose a gap; expectedVersion 0 |
| GET `/{gapId}` | Current authorized working/reviewed detail, impact, canonical relation and permitted history; aliases return only an authorized canonical reference |
| POST `/{gapId}/revisions` | Save a new gap proposal against current version |
| POST `/{gapId}/impacts` | Propose an observation for a current permitted customer; expectedVersion 0 for the new observation and expected parent version |
| POST `/{gapId}/impacts/{impactId}/revisions` | Revise impact against exact current versions |
| POST `/{gapId}/previews` | Preview a gap or impact review action with target type/revision and rationale |
| POST `/{gapId}/decisions` | Commit one exact review preview; includes expected versions and self-review acknowledgment when required |
| POST `/canonicalization/previews` | Preview explicit merge/split candidates, resulting content and exhaustive assignments |
| POST `/canonicalization/decisions` | mcteer commits exact relation preview |
| POST `/reports` | Admit deterministic preparation from explicit gap IDs, cutoffs and audience; 202 with job/report/request identities, never premature approval |
| GET `/reports/{reportId}` | Current authorized report/job/review/handoff projection; polling cannot return stale stored prose |
| POST `/reports/{reportId}/cancel` | Cancel own admitted queued/running preparation or export request |
| POST `/reports/{reportId}/previews` | Preview approval of exact prepared report, audience and all customer disclosure acknowledgments |
| POST `/reports/{reportId}/decisions` | mcteer approves or rejects exact report review preview |
| POST `/reports/{reportId}/exports` | mcteer admits export of one already prepared Markdown/JSON artifact against exact review; returns opaque export identity |
| GET `/reports/{reportId}/exports/{exportId}` | Current-authorized, exact-digest streaming download with release fence per chunk; no signed public redirect |
| POST `/reports/{reportId}/handoffs` | mcteer appends human-reported handoff, follow-up or linked correction |
| GET `/requests/{requestKey}` | Minimal authorized reconciliation for the current actor/operation scope; optional operation query disambiguates key |

All mutations use C01 request identity and expected versions. Multi-object commands carry explicit per-object versions plus relation generation; creating new split outputs uses expectedVersion 0. Reports are immutable revisions: a changed selection, audience or source snapshot uses a new preparation request and report revision with parent identity/version, never edits an approved payload. Approval/rejection use the same exact-preview protocol as gap decisions. Rejection is recorded without granting release; another review needs a fresh preview.

Status codes: 200 reads/replay/decisions, 201 immediate creation, 202 preparation admission, 400 invalid input, 401 absent session, uniform 404 unknown/forbidden, 409 stale/conflicting/expired review or request, 410 currently authorized expired payload/receipt, 413 body/scope too large, 429 admission limit and 503 disabled/schema unavailable. Check authentication before disclosing feature/schema state. Export failures before headers produce safe JSON; failures during a stream close it and require client reconciliation, never an unguarded continuation.

List search is parameterized and bounded; its total is over the same eligible projection, or explicitly unavailable on over-limit scope. Cursor signs actor/session, environment/workspace, filter/sort, cutoff and generation. When source/relation/current-access generation changes, return a stale-cursor state and restart from the first page. Never silently continue a mixed-snapshot page. Source time expiry is also checked even without a generation event. Safe URL redaction covers these routes and query values in app telemetry.

## User journeys

- Registry: existing shell navigation for active internal users, filters, reviewed versus proposed labels, distinct impact categories, explained ordering/freshness and empty/loading/stale/denied/failed states. No partner nav item or prefetch.
- Gap/detail: product context, structured authored narrative, exact citations/unknowns, current and proposed heads, impact editor, readable review diff, rationale/self-review and explicit disposition actions. Customer profile links open only a permitted customer scope. Per-customer page uses the same projection filtered before retrieval.
- Duplicate review: side-by-side permitted canonical gaps, selected survivor or explicit split results, observation assignment table, changed totals, source/lineage changes and exact confirm action. No similarity score, auto-merge or drag interaction without keyboard alternative.
- Reports: choose detail/portfolio and explicit gaps, audience, cutoff/comparison; preparation progress/cancel; required section preview; per-customer disclosure checklist; exact approve/reject. Download and manual handoff controls require mcteer and a current eligible approval, including empty reports' reviewed audience.
- Handoff: manual action clearly labeled human-reported, approved audience, occurrence time and inert optional reference. Append correction/follow-up; resolution reported is separate from customer impact. Show needs-human-follow-up when the report was invalidated; do not imply notification or transmission.

## Client safety and accessibility

Reuse 011's opaque pending-operation pattern, not 009's request-body Map. Persistent/session pending state contains only environment/workspace/actor, operation, request/record identity and safe lifecycle state. Keep unsaved text only in the active form memory; clear it and rendered private projections on logout, workspace/session change, denied/stale source, and before refresh after focus/visibility return. Reconcile lost acknowledgments by identity; do not automatically replay an old form body. Abort controllers cancel fetch/stream on navigation. A stale result cannot replace a newer projection; changing selection invalidates its preview.

While a sensitive page is visible, revalidate at least every 15 seconds and immediately on focus/visibility/session change. Clear private content before returning from a hidden tab pending that check. Server authorization is authoritative at every read/release; browser refresh latency is not permission to export cached content. Retrying an expired report/preparation requires an explicit new request after reconciliation. Export cancellation records state, aborts its stream, and prevents reuse of that export identity.

Follow `docs/design-reference.md`: existing typography/spacing/color tokens, responsive cards/tables and explicit customer context. Dialogs have focus trap/return, semantic headings/labels/errors, keyboard operation and live status regions. Render narrative as escaped text; source links must be eligibility-checked and safe, without raw HTML or credentials. External handoff HTTPS references use safe text and noreferrer/no opener with no preview/unfurl fetch.

CLI Playwright/WebKit must exercise every journey in `webkit-desktop-light`, `webkit-desktop-dark`, `webkit-mobile-light`, `webkit-mobile-dark`; use existing 1440×900 desktop and 390×844 mobile viewports for 012, not a host browser. Assert no horizontal page overflow, zero serious/critical axe findings, focus/keyboard use, and revocation clearing. Save only synthetic screenshots under ignored owned local artifacts, with a complete journey/project manifest and zero skips. Target view assertions rather than merely checking route availability.
