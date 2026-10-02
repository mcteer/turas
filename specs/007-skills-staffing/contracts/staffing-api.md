# Staffing API and decision contract

Version `staffing-v1`. All paths below are planned, not currently exposed. Field
constraints are authoritative in [data-model.md](../data-model.md), C01–C14.
Session authentication, CSRF for mutations and current domain authorization apply
before reading content or returning a receipt. No endpoint accepts an actor, role,
environment or arbitrary SQL filter from the caller.

## Access projections

| Caller | Read | Write/decide |
| --- | --- | --- |
| Canonical active mcteer internal/admin | Workforce originals, reviewed summaries, calendars, demand, decisions and finance | Roster/taxonomy/import/calendar, exact competency and allocation decisions, finance inputs/policy |
| Other active internal member, including another admin | Approved skill summaries, schedulable time without leave reasons, customer demand/proposals/assignments | Create/revise/qualify/cancel customer demand; propose/reserve allocations; cancel own unconfirmed proposal |
| Partner with current customer grant | Confirmed delivery-safe assignments through that delivery engagement only | None |
| Anonymous, inactive, expired/revoked scope | None | None |

Manager evidence DTO, internal operational DTO, finance DTO and partner assignment
DTO are distinct allowlists. Finances are never properties stripped from a broad
shared DTO after retrieval. Service-rate/cost sorting, hidden counts and error text
must not disclose unavailable fields. Response caching is private/no-store.

## Routes and domain ownership

All routes call `lib/server/staffing` domain services; unit tests call the pure
`lib/staffing` arithmetic modules. Thin route handlers only parse, invoke and map
safe HTTP envelopes.

| Path | Methods and purpose | Primary domain |
| --- | --- | --- |
| `/api/staffing/resources` | GET operational roster, POST manager create | resources/read |
| `/api/staffing/resources/[resourceId]` | GET projected detail, PATCH manager revision | resources/read |
| `/api/staffing/resources/[resourceId]/eligibility` | POST exact partner-resource customer eligibility revision | resources |
| `/api/staffing/skills` | GET taxonomy, POST manager create | skills |
| `/api/staffing/skills/[skillId]` | PATCH new definition/state revision | skills |
| `/api/staffing/imports` | POST admit private original intent; GET manager batches | imports |
| `/api/staffing/imports/[importId]/content` | PUT bounded original bytes before finalization; GET authorized original after scan | imports/store |
| `/api/staffing/imports/[importId]` | GET manager state/coverage; DELETE withdraw | imports/lifecycle |
| `/api/staffing/imports/[importId]/complete` | POST exact digest finalization into scan/parse job | imports/jobs |
| `/api/staffing/imports/[importId]/cancel` | POST cancel upload or active job | imports/jobs |
| `/api/staffing/imports/[importId]/mappings` | POST immutable mapped range/column/identity revision | imports/mapping |
| `/api/staffing/imports/[importId]/rows` | GET paginated candidate rows/locators/validation | imports/read |
| `/api/staffing/competencies` | POST manual pending assessment, GET authorized current summaries | competencies |
| `/api/staffing/competencies/[competencyId]/revisions` | POST corrected pending revision; GET authorized history | competencies |
| `/api/staffing/manual-evidence/[evidenceId]` | DELETE exact-generation manager withdrawal of a manual source | lifecycle |
| `/api/staffing/competency-decisions` | POST exact atomic batch accept/reject/retract | competencies |
| `/api/staffing/resources/[resourceId]/calendar` | GET projected daily capacity, POST manager approved calendar revision | calendars |
| `/api/staffing/engagements/[engagementId]?customerId=...` | GET current accepted baseline identity and eligible work-package choices; internal only | demands |
| `/api/staffing/demands` | GET scoped list, POST draft bound to accepted baseline | demands |
| `/api/staffing/demands/[demandId]` | GET detail/history, PATCH new draft revision | demands |
| `/api/staffing/demands/[demandId]/qualify` | POST current exact draft qualification | demands |
| `/api/staffing/demands/[demandId]/cancel` | POST cancel demand; existing commitments remain visible | demands |
| `/api/staffing/demands/[demandId]/matches` | POST bounded deterministic computation; GET exact current result page | matching |
| `/api/staffing/allocations` | GET projected allocations, POST proposal | allocations |
| `/api/staffing/allocations/[allocationId]` | GET governed current operational detail; withheld payload on lost eligibility | allocations |
| `/api/staffing/allocations/[allocationId]/revisions` | POST proposal/amendment with expected current head | allocations |
| `/api/staffing/allocations/[allocationId]/reserve` | POST exact unconfirmed proposal to tentative | allocations |
| `/api/staffing/allocations/[allocationId]/cancel-proposal` | POST author/manager cancel unconfirmed proposal | allocations |
| `/api/staffing/allocations/[allocationId]/review-preview` | POST mcteer exact preview; GET `previewId` current actor/session-bound daily effects | decisions |
| `/api/staffing/allocations/[allocationId]/decisions` | POST confirm/amend/release/cancel exact preview | decisions |
| `/api/staffing/operations` | GET internal planned capacity by authorized customer/period | operations |
| `/api/staffing/finance/inputs` | GET/POST mcteer versioned rates/revenue/nonlabor | economics |
| `/api/staffing/finance/policy-decisions` | POST mcteer exact formula/input-policy decision | economics |
| `/api/staffing/finance/scenarios` | GET/POST mcteer reproducible calculation | economics |
| `/api/staffing/finance/scenarios/[scenarioId]` | GET snapshot with current stale/withheld status | economics |
| `/api/staffing/commands/[requestKey]` | GET actor-scoped authorized receipt reconciliation | commands |
| `/api/staffing/advisory` and `/[attemptId]` | POST create fresh request, GET owned status | advisory |
| `/api/staffing/advisory/[attemptId]/cancel` | POST cancel owned response using native governance | advisory |

Confirmed partner assignments are added to `/api/engagements/[engagementId]` through
`lib/server/engagements/read.ts`; partners do not use general staffing routes.
The partner record has assignment ID, permitted display name, delivery role, dated
minutes and review-required status only. Hidden plan/source content also withholds
assignment narrative; no private skill evidence, other customers or economics.

## Common command contract

Mutations carry `requestKey`, `expectedAggregateVersion` for existing aggregates,
exact input digest and a bounded payload. Server owns all approval/state/author/
clock fields. Responses return entity/revision IDs, aggregateVersion, state,
contentDigest, warnings and correlationId. A replay returns the original decision
identity after current scope/authority checks; no permission is granted by knowing
a key. The same key with a different canonical request digest is a conflict.

Import intents reserve quota before byte upload. Multipart is not required: one
bounded PUT body is sufficient. Completion validates actual bytes/digest/MIME and
queues a leased scan/parse attempt without holding a database transaction across IO.
Failed upload/finalization has a reconciliable intent receipt; no parallel worker
publishes a second source version. GET original refuses non-clean/withdrawn sources.

Competency decisions name candidateRevisionId, candidateDigest, sourceGeneration,
expected current competency head and action/rationale for each row. All rows pass
freshness/source/identity authority checks before one transaction changes any head.
Rejected/invalid rows are not quietly omitted from an atomic batch.

## Confirmation and amendment transaction

1. Discover scoped lock IDs without returning protected content. Acquire current
   session/member/principal/workspace authority SHARE locks once.
2. Acquire all involved plan rows SHARE in UUID order, then original 006 source
   headers using the existing source order, then engagement rows SHARE. Re-read the
   active baseline and work-package identity. This follows 006 acceptance order.
3. Lock involved staffing demand heads in UUID order, workforce source/competency
   headers in the stable kind/UUID order, resource heads in UUID order, then stable
   resource/date and demand/date rows in ordered date order. Calendar/source writers
   obey the applicable suffix of this order and never acquire earlier locks later.
4. Lock allocation head, exact preview and scoped receipt. Recheck current versions,
   source/freshness/partner eligibility for new or replacement commitments, preview
   session/expiry, exact digest, old/new ledger union and both demand/resource daily
   limits. Release/cancel can remove today-or-later commitments from authorized
   identity-only history despite lost source/baseline eligibility; it does not require
   renewed feasibility or disclose withheld payload. Past ledger dates are immutable.
5. Append immutable revision/decision/receipt and atomically adjust current daily
   ledger. Any validation, timeout or injected post-ledger failure rolls back all.

Amendment locks old and new resources/dates/plans, including released days. Current
ledger from the allocation being replaced is credited only inside that transaction.
Two first allocations serialize on stable rows even when no previous usage exists.
A baseline/source/calendar update that wins the locks first must invalidate an old
preview; a confirmation that wins first may commit, then immediately shows needs
review after the later change. No request can claim the new input state with an old
preview. Foreign-key/source-header identity changes discovered after locking cause
safe conflict/reload, not acquiring newly discovered earlier-order locks.

Lock timeout is 3 seconds and statement timeout 5 seconds for normal commands.
These are failure bounds, not p95 targets. Only proven pre-commit transaction failures
may be retried at most twice using the same request key; unknown commit outcomes use
receipt lookup. No retry crosses a paid model call. Database locks are never held
through provider, filesystem or container operations.

## Errors and receipt privacy

401 authentication_required; 403 forbidden for a visible but disallowed action;
404 not_found for hidden objects; 409 version_conflict, request_key_conflict,
preview_expired, baseline_changed, source_changed, capacity_conflict or demand_conflict;
413 too_large; 422 invalid_input; 429 rate_limited/budget_exceeded;
503 staffing_unavailable/staffing_disabled/dependency_unavailable. No SQL, names,
source cells, amounts or other-customer counts appear in errors. Invalid finance
access uses a hidden projection; operational users cannot distinguish missing from
restricted finance object IDs.

### Implemented demand list projection

Demand collection GET requires `customerId` and accepts optional `engagementId`,
`pageSize` and `cursor`, each exactly once. It returns identity/state rows without
plan, demand rationale or personnel prose. Detail GET rechecks the bound baseline's
original sources before releasing the current demand payload; lost source eligibility
returns retained identities with null demand/rationale and a review-required state.
Qualification and cancellation retain the exact revision and append immutable
lifecycle event identities with separately stored rationale payloads.

### Finance input and policy contracts

Finance input writes require an entered provenance reference as well as rationale.
Rate and entered revenue/nonlabor periods use `[fromDate,toDate)`; entered totals
cover that exact baseline period and are never prorated into a scenario or inferred
from service rates. One current total per baseline/kind/currency period is selected
without overlap; revising that input retains its immutable prior revisions. Rates
also reject overlap per resource/rate-kind/currency under a stable resource mutex.

Collection GET returns finance input identities only, with optional resource or
engagement/baseline scope and normal cursor pagination. Added
`/api/staffing/finance/inputs/[inputId]` GET/PATCH for governed current values and exact
revisions. Amount and provenance reads require current canonical finance authority;
lost resource/baseline eligibility returns identity with null payload. Policy GET
returns the server's formula/input-policy digest and explicit approved/unvalidated
state; its POST records human approval of that exact digest, labelled planning-only.
