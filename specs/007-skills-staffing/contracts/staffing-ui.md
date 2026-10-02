# Staffing UI contract

Use the existing Geist/neutral visual language, responsive navigation and four
CLI WebKit projects in `docs/design-reference.md`. These are proposed routes.

## Journeys

- `/staffing`: internal operational overview with period, as-of, planned billable
  ratio, available/protected/confirmed/tentative/remaining minutes and exceptions.
  No actual utilization label or customer-success score. Finance cards only render
  for mcteer from a separate finance response; missing is visibly unknown.
- `/staffing/resources` and `/staffing/resources/[resourceId]`: approved summary
  directory and dated calendar. mcteer additionally has roster/skill controls,
  evidence/history, exact customer eligibility and calendar editing. Other internal
  users receive no evidence/leave-reason/financial fields in the response or DOM.
- `/staffing/imports` and `/staffing/imports/[importId]`: mcteer-only single-file
  CSV/XLSX intake, safe progress/cancel, typed table/column mapping, exact identity
  resolution, hidden/merged/formula warnings, candidate corrections and exact review.
  Show coverage and excluded/invalid rows before acceptance. Do not label a partial
  extraction as imported; a complete replacement is required. Selected batch rows
  are explicit and atomic. Corrected literal values show both provenance and change.
- `/customers/[customerId]/engagements/[engagementId]/staffing`: retain customer and
  accepted baseline context. Internal leads create/qualify demand, compare candidates
  and propose/reserve allocations. mcteer reviews exact changes and confirms. Show
  baseline replacement/withdrawal before the action, and reload after safe conflict.
  Partners see only confirmed delivery-safe assignments through their engagement.
- `/staffing/finance`: mcteer-only effective-rate/input policy and scenario forms.
  Show currency, formula version, input provenance, complete/incomplete/stale and
  finance-policy approval separately. Cost and service-rate revenue are not labelled
  actuals. No default rates, customer revenue or margin benchmark is prefilled.

New navigation appears only where a server-provided projection permits it. A menu
check is not authorization. Editing dialogs preserve pending entries through a
validation error, warn on dirty navigation and never use localStorage for personnel.
Receipt lookup reconciles an uncertain save; do not retry an unknown write blindly.

## Matching and decisions

A demand form uses accepted-baseline work packages, skill/level controls, explicit
service dates/daily minutes and optional region/overlap requirements. Label service
dates as resource-local days; show the resource timezone and the separately zoned
overlap window with its resolved intersection. These are daily effort allocations,
not clock-time appointments. All unknowns and
source warnings remain visible. “Eligible”, “Needs review” and “Ineligible” show
plain-language constraint reasons. Required/desired skills are distinct; no numeric
AI suitability score. Shared available capacity is a number, not a list of hidden
customer assignments or private absence reasons.

Reservation is labelled tentative with expiry and competing tentative load; it does
not become a confirmed staffing badge. Confirmation requires the exact preview with
resource/date effort, baseline, freshness, remaining capacity and rationale. mcteer
can confirm directly from a proposal for same-day work through the same preview.
Amend/release/cancel show old versus new daily effects and preserve prior decisions.
A source/calendar/grant/baseline conflict returns focus to a useful error summary and
provides reload/review actions. There is no overload override button.

## Turi entry

“Explain this staffing request” creates a fresh owner-private staffing conversation.
Operational and finance modes are explicit; changing mode creates a new conversation.
Only mcteer can request finance mode. Show the bound customer/demand/scenario and
as-of time, sources as authorized version links, stop control and terminal status.
A fenced historical answer shows “Context changed—start a new explanation” with no
restricted retained content. Staffing decisions stay in the human review UI.

## Accessibility and acceptance

Keyboard-only upload/mapping/correction, calendar edit, demand qualification,
match selection and exact confirmation must pass. Use semantic tables, associated
labels, visible focus, modal focus return, status live regions and text labels in
addition to color. At 390px, tables use deliberate contained scrolling without page
overflow. Verify desktop/mobile and light/dark, empty/loading/denied/error/partial,
expired reservation, stale preview, withdrawn evidence, unknown capacity and missing
finance input. Run axe with zero serious/critical violations and save only synthetic
screenshots to ignored artifacts. No host-browser automation.
