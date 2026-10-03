# Execution API v1

All routes below are planned. Prefix is `/api/execution`; contract version is
`execution-v1`. All adapters call `lib/server/execution/` and obtain the actor from
the current server session. No request may supply an authority flag or trusted actor.
JSON uses strict schemas, C01–C12 in [data model](../data-model.md), no unknown fields.

## Authority and projection

| Capability | Canonical mcteer | Other internal members (including panel) | Partner |
| --- | --- | --- | --- |
| Setup accepted engagement execution | Yes | Yes | No |
| Read accepted delivery records/engagement totals | Yes | Yes | Current explicit customer grant, delivery audience only |
| Read internal accepted records | Yes | Yes | No |
| Draft/submit activity, RAID, decisions, scope proposals | Yes | Own revisions | Own delivery revisions for granted customer |
| Review any record/time/milestone/reconciliation/closeout | Yes, with rationale even for self-review | No | No |
| Draft/submit own time | Linked resource, or attributed on-behalf | Linked resource only | Linked resource and current customer/resource eligibility |
| Read raw time notes/history | Authorized reviewer | Own authored/subject entries only | Own authored/subject entries only, with current grant |
| Enter/correct time for unlinked or inactive resource | Reviewer, identity-only lookup and rationale | No | No |
| Draft point budgets, ETC, handoff/closeout/outcomes | Yes | Own proposals | No (read accepted delivery-safe projections) |
| Actual resource utilization | Reviewer only | No | No |
| Start private execution advice | Yes | Yes | No |

Current membership/session/environment/workspace/customer authority is checked
before retrieval; resource subject access is additionally checked for time. Internal
visibility alone never grants review. Draft/submitted payloads are author/reviewer
only. An author cannot revise another author's record; reviewer on-behalf time has
explicit attribution. Approved raw time is not a delivery record feed. Restrict
lists, filters, counts, cursor scope and error detail using the same policy.

## Routes

`E` below is `/engagements/[engagementId]`; expand it under the prefix.

| Method/path | Request | Response / governed operation |
| --- | --- | --- |
| GET E | none | Current binding, authorized milestone heads, stale-baseline/review flags and capabilities; no write-on-read |
| GET E/records | kind, state, cursor, limit | Projection of records/history; exact recordId optional, history cursor scoped to it |
| GET E/time | from, to, cursor, limit | Own entries by default; reviewer may request authorized subject or review mode |
| GET E/review | kind, cursor, limit | Reviewer-only submitted record/time candidates, no implicit approval |
| GET E/summary | from, to | Engagement period/lifetime effort and status per calculations contract |
| POST E/preview | strict candidate command without requestKey | Reviewer-only five-minute exact-input preview; no mutation, returns digest/versions/exceptions |
| POST E/commands | command envelope and typed payload | Atomic authorized command receipt; mutation inventory below |
| POST E/advice | fresh owned conversationId, from, to, expectedGeneration, requestKey | Binds/admit one explanation; existing conversation transport drives release/cancel |
| GET /receipts/[requestKey] | none | Current-authority lookup scoped to original actor/action; terminal, pending or unknown state, safely projected |
| GET /utilization | resourceIds (1–50), from, to | Reviewer-only actual resource utilization; no rate, cost or private leave reason |

Mutation envelope: `version`, `action`, `requestKey`, `expectedVersions`, `payload`;
review commands also require `previewDigest`, `previewExpiresAt` and `rationale`.
Expected versions name all existing heads consumed by the action, including exact
accepted plan/baseline on first setup. Newly created identities are server-generated.
Return `requestKey`, `commandId`, `state`, `executionGeneration`, changed IDs/versions
and projection-safe exception codes. Avoid echoing mutation prose into receipts.

## Command inventory and ownership

| Action | Domain method / file | Required input and transition |
| --- | --- | --- |
| setup | `setupExecution` / `baselines.ts` | Exact current accepted baseline; idempotent aggregate creation, not acceptance |
| record.create / record.revise | `saveRecord` / `records.ts` | Strict per-kind payload; immutable revision and author; same accepted pointer until review |
| record.submit | `submitRecord` / `records.ts` | Exact owned draft revision; schema/source preflight; submitted, not accepted |
| record.accept / record.reject / record.retract | `reviewRecord` / `review.ts` | Exact candidate/accepted version and source snapshot; reviewer decision; type-specific rules below |
| milestone.decide | `decideMilestone` / `milestones.ts` | Exact milestone head/baseline, allowed event, evidence/rationale; request_review may first be proposed by contributor |
| time.create / time.revise / time.submit | `saveTime` / `time.ts` | Exact subject/activity/work package/date/minutes; one immutable candidate; current subject policy |
| time.approve / time.reject | `reviewTime` / `time-review.ts` | 1–25 distinct exact revision pairs, exception rationales per row; atomic all-or-none batch |
| time.reverse | `reverseTime` / `time-review.ts` | One exact counted approved revision, reason; ledger debit and decision, no deletion |
| baseline.reconcile | `reconcileBaseline` / `reconciliation.ts` | Exact old/new accepted baseline, every key mapped/retired/added; no inferred completion |

Typed record review routes RAID/decision/scope_change to `registers.ts`, effort_budget/
estimate to `effort.ts`, handoff/closeout/outcome to `handoff.ts`; all use common
revision/receipt/source policy. Scope-change `implemented` requires an already
accepted replacement through 006 and completed reconciliation. No command accepts
006 plans, confirms 007 allocations, approves profile claims or sends messages.
Milestone owner/date edits use a reviewed activity payload subtype `milestone_plan`;
this subtype cannot itself change milestone state. Contributor request_review uses
activity subtype `milestone_review_request`, applied only when mcteer accepts it.

## Atomicity, lock order and replay

1. Normalize strict input/body digest; resolve current server actor. Preflight scope
   before fetching prose. Recheck all authority inside the transaction using the
   established membership → principal → session → workspace lock prefix, then
   customer/grant authority. Sort identities within each class.
2. Discover IDs of the complete dependency union without using their content as
   accepted context. Lock plan rows, original source union, engagement rows and
   staffing demand rows in that established order; retain existing helper prefixes.
3. Lock sorted resource/calendar/allocation and planned-capacity identities needed
   for exception previews. Then execution workspace/baseline, record/time entry and
   review heads. Insert missing stable actual resource/day keys with ON CONFLICT;
   lock the entire old/new resource/day union sorted by workspace/resource/date.
4. Recheck source/baseline/head pointers, expected versions, preview digest/expiry,
   captured timezone, exact subject access, allocation/capacity exceptions and daily
   total across all customers. A changed dependency rejects the entire command.
5. Write immutable revisions/decisions, update heads/actual contributions and all
   affected generations, and save the terminal receipt in the same transaction.
   Full correction credits old minutes only within this transaction; never reserve
   a negative balance in a separate transaction.

A worker or source mutator must preserve the same lock order or only enqueue work;
it must not lock execution rows first then acquire authority/plan/source prefixes.
Every eligibility fence checks authoritative heads so an asynchronous notification
cannot create a stale acceptance window. Explicit baseline/source dependency changes
invalidate closeout and advice even before queued metadata work runs.

Replay first reauthorizes, then compares normalized digest under scoped unique
`(environment,workspace,actor,requestKey)`. Same key/digest returns the original
safely projected result, without charging another write or applying a correction.
Same key/different digest is conflict. Concurrent first commands converge on one
receipt. Retain compact command identity/digest/decision linkage indefinitely; prose
is never in a receipt. Receipt reads cannot resurrect withdrawn data. Bound automatic
DB serialization/deadlock retries to two attempts after the initial try, using the
same key; zero external I/O inside transactions. Never automatically retry a paid
provider attempt or an unknown acknowledged mutation with a new key.

## Boundaries and response states

Apply C11. Limits are checked before expensive work. Cursor is signed and binds
actor, scope, filter, baseline/generation, last deterministic `(createdAt,id)` pair
and expiry; a changed generation returns `source_changed`, not mixed pages. Summary
aggregation uses indexed grouped SQL over the complete authorized ledger; there is
no row-cap truncation disguised as complete totals. Read payload overflow returns
`scope_too_large` with safe narrowing guidance. Preview is ephemeral and authorized;
its input digest binds exact source/ledger generation and command payload.

Write rate: 60 new draft/submit commands per membership/minute; review/setup/reconcile
20 new commands per reviewer/minute (setup by other internal members uses that same
20-command authority-neutral bucket). Reads/preview: 120 per membership/minute;
receipt/cancel/settlement are exempt from intake budgets. Advice uses its separate
five/hour admission ledger. Check and record the quota atomically; replay cannot
multiply charges. Limit response includes safe `retryAfterSeconds`, no foreign counts.

| Status/code | Meaning |
| --- | --- |
| 400 invalid_input | Strict shape/field/date/digest failure; no private echoed values |
| 401 unauthenticated | Session absent/expired; clear local content |
| 404 not_found | Foreign, hidden or nonexistent aggregate; indistinguishable |
| 403 forbidden | Known visible aggregate but operation not permitted |
| 409 stale_version / source_changed / key_conflict | No partial write; refresh/review exact current state |
| 422 approval_blocked | Authorized reviewer sees bounded unmet criteria/exception categories |
| 413 body_too_large / 422 scope_too_large | Explicit bound failure |
| 429 rate_limited | Bounded intake; receipt/settlement still available |
| 503 feature_disabled / schema_unavailable | Writes/new advice unavailable; no request-time migration |

Time approval may accept historical numerical effort with explicit unavailable-source
exception; that does not release restricted activity text. No exception bypasses the
1440 ceiling, current reviewer authority, atomic version checks or receipt identity.
Closeout cannot bypass missing acknowledgement or pending submitted time. Detail and
history response projections always re-evaluate source eligibility and deny stale
cache release; use private no-store responses and server-owned current-generation tags.

### Utilization Query Encoding

GET utilization accepts exactly one `resourceIds` parameter containing 1–50
comma-separated UUIDs, plus `from` and `to`. Duplicate identities, duplicate query
keys, unknown keys and periods outside 1–91 dates are rejected. Summary accepts
only `from` and `to`; these responses remain uncached.
