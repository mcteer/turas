# Learning HTTP and Domain Contract

Version `learning-v1`. All routes call `lib/server/learning/` or the existing
knowledge domain. Server-rendered pages call the same authorization/read services.
Strict unknown-key rejection, existing cookie session and mutation origin/CSRF
checks, JSON body limits, no-store responses and opaque denied/not-found behavior
apply before lookup and again before returning protected content. No new MCP or
external connector is introduced.

## Authority and projections

| Action | Authority |
| --- | --- |
| Read sanitized shared practice | Every active workspace member, under existing 005 projection |
| Submit/read own feedback | Active member with current target access; checkpoint target must be their own |
| Triage/read others' feedback, prepare/save draft | Current internal member with access to exact target and all selected originals |
| Review rights/sanitization, admit evaluation, grade cases, publish/withdraw/rollback | Current internal administrator, preserving 005 authority |
| Propose measurement | Current internal member with current accepted outcome/original access |
| Approve measurement reuse or release aggregate | Current internal administrator with current original access |
| Read aggregate/dashboard | Internal member; private drilldown still requires each target's current access |
| Change operational enablement/activate schema gate | Explicit operator command with environment marker; no model tool |

Existing authorized 005 private contribution authoring/reads remain available under
005 policy. A 014 feedback link never grants that access; 014 evaluation and drafting
surfaces are internal only. New publication still requires administrator evaluation.

Admins may review their own authored practice under existing 005 policy. That is
not described as independent peer review. The feature acceptance reviewer must be
independent of the implementation/output-generation work.

## Reads

| Route | Projection |
| --- | --- |
| `GET /api/learning/feedback` | Author's own issues for partners; authorized queue for internal reviewers; C04 paging |
| `GET /api/learning/feedback/:id` | Current authorized feedback revision and safe disposition history |
| `GET /api/learning/candidates/:contributionId` | Existing private candidate plus current review/evaluation eligibility; never for partners |
| `GET /api/learning/evaluations/:id` | Frozen case manifest, capture/usage state and review progress; no embedded arm bodies |
| `GET /api/learning/evaluations/:id/cases/:caseId/arms/:arm` | One currently authorized private arm capture, at most 64 KiB |
| `GET /api/learning/dashboard` | Separate evidence/evaluation/operations summaries; C04 paging and bounded subqueries |
| `GET /api/learning/measurements` | Currently authorized private contribution queue |
| `GET /api/learning/cohorts?metricId=...&quarter=...` | Released fixed result or uniform unavailable status; no caller-chosen cohort filters |
| `GET /api/learning/requests/:requestId` | Actor-owned admission/receipt status; no redispatch or hidden action body |

A list page is at most 20 records and 128 KiB, using C04. Dashboard detail is a
separate authorized page; it is not an unbounded join of all source bodies.
A cohort response contains metric/version, quarter, unit, rounded mean change,
formula version and noncausal limitation. It never contains exact counts, customer
IDs, hidden omission counts, ranges, member lists or complementary totals. Insufficient,
withdrawn and otherwise ineligible families share a public internal-reader
`unavailable` projection; authorized admin review sees actionable private reasons.
Private refresh counts must not expose suppressed cohort membership.

## Commands and envelopes

Every mutation uses `requestId`, expected record generation (0 for create), explicit
version, and a strict action-specific body. The server records keyed input digest
and actor/action identity. Same request/body returns the authorized current receipt;
same identity with changed input conflicts. Receipt lookup and explicit abandonment
share the admission mutex, so a late original cannot race a client retry. New work
uses C14 quotas; status/resolve is separately bounded without consuming write quota.

| Route | Required input / effect |
| --- | --- |
| `POST /api/learning/feedback` | Exact typed target, category and C02 text; create proposed issue |
| `POST /api/learning/feedback/:id/revisions` | Author-only text edit at exact generation; no target reassignment |
| `POST /api/learning/feedback/:id/dispositions` | New state, rationale and optional exact candidate link; internal steward only |
| `POST /api/learning/drafts` | One customer, selected original refs, selected feedback IDs, question and C07 budget; prepare fresh owner-private learning conversation |
| `POST /api/learning/drafts/:id/save` | Completed output digest, proposal index and explicit edits; ordinary 005 candidate validator, preserving original lineage |
| `POST /api/learning/candidates/:id/reviews` | Exact revision/closure/rights and sanitization checklist, rationale, accept/reject |
| `POST /api/learning/candidates/:id/evaluations` | Exact accepted review, baseline generation or none, current fixed catalog identity and budget; freeze server manifest and execute paired arms |
| `POST /api/learning/evaluations/:id/case-reviews` | Exact capture pair, case version, C08 scores/flags and 1–2000 character rationale; compute verdict server-side |
| `POST /api/learning/evaluations/:id/cancel` | Exact current generation; fence pending/new arms then reconcile active arm |
| `POST /api/learning/budgets/:id/settlements` | Admin-reviewed provider settlement or justified conservative upper-bound record; no invented actual cost |
| `POST /api/learning/candidates/:id/rollback` | Historical publication revision, current originals, rationale; new 005 revision only |
| `POST /api/learning/measurements` | Metric/version/quarter, complete C09–C10 paired measurements/population/field locators; proposed contribution |
| `POST /api/learning/measurements/:id/reviews` | Exact revision/closure, separate reuse approval or rejection with rationale |
| `POST /api/learning/measurements/:id/withdraw` | Exact revision and reason; immediate invalidation |
| `POST /api/learning/cohorts/releases` | Fixed metric/quarter and protocol version; family-serialized eligibility capture and first release |
| `POST /api/learning/requests/:id/resolve` | Explicit reconcile/abandon; returns one durable disposition without automatic paid retry |

The existing `/api/knowledge/contributions/:id/{revisions,submit,decisions}` remains
the authoring/publication path. Extend strict publish decision input with exact
`learningEvaluationId`, `learningReviewId` and expected baseline generation. Reject
missing new fields after activation in both schema and domain; no legacy route bypass.
Existing withdrawal inputs bind the actual published revision and generation even
when a newer draft exists. Old historical decision receipts remain readable after
authorization; replay never creates a new publication.

C05 draft preparation question is 1–2000 characters; selected feedback IDs are 0–10,
all for the selected customer or shared target. A shared-target issue linked to a
customer-bound candidate does not gain access to that customer through the link.
At most one saved draft proposal per attempt is returned; no implicit batch save.

## Failure and invalidation behavior

Use existing error envelopes with 400 malformed request, 401 no session, opaque 404
inaccessible record, 409 stale version/changed request/unknown work requiring
reconciliation, 413 oversized payload, 422 invalid proposal or incomplete evaluation,
429 bounded admission and 503 unavailable schema/configuration/provider accounting.
Cohort first-release work has a 30-second deadline, 5-second statement timeout and
2-second lock timeout; exceedance rolls back without disclosure or a partial family.
Surface a retryable unavailable page with no private body; never silently render an
empty success or a generic server exception when a known prerequisite is missing.

Current dependency checks apply to every page/API/native output/history path, not
only preparation. An invalidated evaluation cannot remain publication-eligible
because its stored status says passed. Old release-family receipts cannot expose
revoked aggregates. Disabled new work permits reads of eligible existing publications,
withdrawal, cancellation, budget settlement and cleanup; it blocks all new authoring,
evaluation and publication commands, including legacy 005 publication entry points.
