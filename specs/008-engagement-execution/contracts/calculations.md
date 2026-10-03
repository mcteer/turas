# Execution calculations v1

Contract version: `execution-v1`; arithmetic version: `execution-effort-v1`.
All authoritative effort is integer minutes; use bounded integer/BigInt arithmetic,
serialize minute totals as decimal strings, and never derive facts with the model.

## Scope and input selection

A summary has engagement, current baseline, execution generation, `asOf` instant,
period when applicable, input revision identities, eligibility/coverage flags and
formula version. Snapshot authoritative heads under one repeatable transaction or
return `source_changed` if a consistent bounded snapshot cannot be obtained.

`approvedActual` = sum of the one counted approved revision of every eligible
entry identity in the requested scope. Numerical approval survives loss of source
prose; projection marks source review required. Pending/rejected/reversed entries
contribute zero; a pending correction leaves its old approved revision counted.
Do not sum both an immutable revision history and the current contribution ledger.

Whole-engagement lifetime totals include old, current, retired and unmapped baseline
work once. Period totals use inclusive captured resource-local dates (1–91 dates),
and are separately labeled; never add period actuals to lifetime remaining effort.
Classification is billable/nonbillable as approved; it is not invoice readiness or
customer agreement. Planned minutes come only from current confirmed 007 allocation
contributions for the selected dates; tentative quantities are a separate field.

## Forecast and variance

- `A` = whole-engagement approved actual minutes at `asOf`.
- `E` = sum of current accepted remaining estimates for every current work package.
- `F = A + E` = forecast total effort, only if every estimate is current, all baseline
  reconciliation decisions are complete and each new actual since the estimate's
  as-of has been accounted for by an estimate revision. Explicit zero is valid.
- `B` = sum of current reviewed exact work-package budgets. The v1 budget is labeled
  **current-baseline work budget**; it is not automatically a lifetime budget.
- `V = mappedCurrentActual + E - B` = current-baseline work variance, only when all
  lifetime actual is mapped one-to-one to current packages. With retired/unmapped
  actual, retain `A` and `F` but return `V=null`, reason `unmapped_historical_actual`.
  No overhead reassignment mechanism is built in v1. Negative V is underspend.
- Missing/stale E → E/F/V null, explicit missing keys; known A and B remain visible.
  Missing B → B/V null. No automatic zero, range midpoint or percent complete.

A 006 effort range in hours remains displayed as that range. A reviewer enters
integer-minute point budgets; do not silently round hour range bounds into B.
Estimates are current only if accepted, bound to the current baseline, no more than
seven UTC calendar days old, as-of not future, and no approved actual mutation for
that package after as-of. Reconciliation invalidates carried estimates. Lifetime
actual is never prorated to the new baseline or dropped to improve variance.

## Actual utilization and capacity

Resource actual-utilization is an **reviewer-only** internal operational view, separate from
engagement effort and the existing `staffing-v1` planned view. A request selects
1–50 currently visible resource identities and an inclusive 1–91-date period.
No partner sees another person's hours, full calendar or utilization.

For each resource/date, use 007's approved calendar revision and its pinned timezone
resolver: `available = contracted - union(holidays, approved leave)`; protected
non-delivery time is already separate and is not subtracted twice. Sum whole minutes
across each selected resource/date exactly once. `actualBillable` counts approved
billable minutes across all workspace customers for those same service dates.
`actualUtilization = actualBillable / available * 100`, rounded half up to two
percentage decimals once after summing. Zero available → null/not_applicable;
missing/ineligible calendar coverage → null/incomplete with bounded reasons.
Explicit zero work with complete coverage gives 0%. Values >100% remain visible.
No utilization ranking, target benchmark or employee-performance interpretation.

If the approved time's captured date timezone and current calendar date timezone
differ, report `timezone_mismatch` and withhold utilization until a reviewed calendar
alignment is available; never relocate historical minutes. Planned load and
available minutes retain their source revision/time basis. 007 planned scenarios
and finance calculations remain unchanged.

## Reviewed status

Return separate counts for current milestones (not_started, in_progress, blocked,
ready_for_review, accepted, waived, review_required). Totals reflect only authorized
visible milestones. `review_required` overlays lost source eligibility or unreconciled
baseline state, so previously accepted does not appear currently accepted.
Open blockers are accepted high/critical issues/dependencies in open/monitoring.
Overdue means accepted planned/due date < current UTC date and item not resolved/
accepted/waived. Missing dates remain unknown. Latest activity is the latest accepted
eligible activity event date, not latest draft or chat time. Evidence age is shown per eligible reference as whole
UTC calendar days since its recorded observation date at summary as-of; missing
observation dates yield unknown, not zero. Do not average evidence ages. No composite green/red
score, inferred stage transition or automatic maturity update.

## Independent verification vectors

Include zero and missing separately; correction/reversal/moved-resource/date;
cross-customer daily cap at 1439/1440/1441; replacement rollback after ledger writes;
leap day and DST boundaries with captured timezone; 25-hour day policy cap; unknown
calendar and changed timezone; unioned leave/protected-time denominator; 1/3 and
2/3 rounding; utilization >100%; negative variance; stale estimates at day 7/day 8
and actual after estimate as-of; range-valued plans; retired/unmapped work; actuals
retained after source withdrawal; scoped output sentinels. Expected values must be
calculated independently of the implementation under test.
