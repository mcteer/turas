# Execution UI contract

Use `docs/design-reference.md`, existing workspace navigation, spacing, typography,
status language and accessible controls. Entry is the execution page within a visible
customer engagement; add an Execution link beside its existing plan/staffing links.
No new global dashboard or partner administration is required.

## Views and critical journeys

| View / component under `app/_components/execution/` | Required behavior |
| --- | --- |
| `overview.tsx` | Exact baseline/reconciliation banner, reviewed status counts, latest accepted activity, evidence age, open blockers, dates and owner unknowns; explicit setup action; zero records is empty, not healthy |
| `records.tsx` | Activity timeline and owned editor, exact evidence selector, event date/audience, drafts/submissions/current acceptance/history; corrections leave accepted content current until review |
| `milestones.tsx` | Criteria/source lineage, owner/planned-date proposals, allowed event preview, request-review proposal, mcteer-only accept/waive/reopen with rationale; no hours-derived progress bar |
| `time.tsx` | Own linked resource, daily minutes and billable flag, exact activity/work package/allocation, captured timezone, private note; clear on-behalf selector for reviewer; submitted/approved/correction/reversal history |
| `review.tsx` | Reviewer-only queue, five-minute exact preview with source versions, per-row exceptions and atomic batch selection; accept/reject/retract is deliberate; contributor cannot see reviewer-only subject details |
| `changes.tsx` | RAID and decision registers with owner/date/unknowns; scope proposal review; link to existing 006 workflow; explicit mapping editor after accepted replacement, including retired/added gaps |
| `forecast.tsx` | Separately labeled planned period, approved actual period/lifetime, reviewed point budgets, as-of remaining estimates, forecast and current-baseline variance; minutes/hours display with exact underlying minutes; missing/stale/unmapped reasons |
| `handoff.tsx` | Deliverables, receiver acknowledgement as recorded evidence, obligations, closeout preview with unmet conditions, outcome measure/window/limitations and unknown/inconclusive states |
| `advisory.tsx` | Fresh private explanation binding, current eligible citations, started/pending/cancelled/unconfirmed states, durable reconnect without a second POST, safe cancellation and source-changed clearing |
| `client.ts` | Strict request/receipt handling, current-generation refresh, authority/source-denial clearing, dirty draft protection and stale-response suppression |

A reviewer-only actual-utilization section lives in forecast, selects up to 50
resources for 1–91 dates and uses its own protected endpoint. Other users see their
permitted engagement totals. No leave reasons, rates, costs, another contributor's
raw time notes or employee rankings appear. Partner views expose accepted delivery
audience only; their private drafts/own time remain separately labeled. No hidden
internal counts, titles, source names or response diagnostics leak into the DOM.

## UI state and release rules

- Refresh authoritative generation on navigation, focus and each mutation result;
  while a visible execution page is active, refresh eligibility at most every five
  seconds, immediately clearing affected data on a denied/stale result. Apply the
  same check before expanding history or replaying cached content. Hidden-tab
  resumption revalidates before redisplay. No content in localStorage or analytics.
- A late fetch cannot overwrite a newer generation, denied scope or dirty draft.
  Preserve owned unsaved edits in memory through benign refresh; on lost authority,
  immediately remove all scope content including dirty inputs and explain denial.
  Never preserve withdrawn excerpts merely because an editor is dirty.
- Generate a request key once per intentional mutation. On lost acknowledgement,
  mark outcome unknown, disable duplicate submission and poll its receipt. If a
  definite absent result permits retry, reuse the same key and exact payload. A new
  revision or changed payload is a new explicit action after current-state review.
- Preview expiration, baseline replacement or source/version conflict requires a
  fresh preview and explicit human decision. Never auto-accept a refreshed payload.
- Baseline replacement shows a reconciliation-required banner and retains historical
  approved actuals. Milestone acceptance is not visually carried over; incompleteness
  is textual, not conveyed only with color.
- Source withdrawal withholds narrative/citation excerpt and marks review required.
  Retained numerical actuals are labeled with the source exception; no apparent
  deletion or invented recalculation. Closed records with late changes show re-review.
- Cancellation and unconfirmed provider results have no automatic retry affordance;
  any later fresh explanation is a separate explicit action with new admission.
- Empty, loading, unavailable-schema, disabled, denied, stale, incomplete and failed
  states are distinct. No spinner implies approval or successful persistence.

## Accessibility and browser verification

Use labels, field descriptions, error summaries, semantic tables/headings, keyboard
operable dialogs/selectors, focus return after decisions, live status announcements,
and a confirmable review summary. Never use color alone for status. Tables may scroll
inside a labeled region; the viewport must not overflow at 390 px. Keep the existing
four WebKit projects: desktop/mobile × light/dark. Run CLI Playwright only.

Critical cases in `tests/ui/execution-*.spec.ts`: setup/idempotent empty view; authored
activity→review→milestone; own time→batch approval→correction/reversal; other-user and
partner denial including already-rendered revocation; stale preview/lost acknowledgement;
RAID/scope replacement/reconciliation; incomplete and complete forecast; missing-ack
closeout rejection→handoff→closeout→late correction; outcome uncertainty; advice
stream→withdrawal→reconnect/cancel. Each runs in all four projects; include keyboard
review, screenshots for visual inspection and axe with zero serious/critical findings.
The wrapper discovers the expected matrix and fails missing/skipped cases. Tests of
004–007 cannot substitute for these 008 surfaces.
