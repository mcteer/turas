# Expansion UI Contract

Follow `docs/design-reference.md`: current Geist typography, neutral theme tokens,
restrained cards, title-case authored labels and customer context retained in navigation.
No inactive global product link, new dashboard, custom chart or redesign is required.

## Entry and scope

An internal-only **Expansion Opportunities** link joins Delivery Plans and Support
Guidance in `app/_components/profiles/profile-overview.tsx`. It opens
`/customers/[customerId]/expansion`. Server authorization also protects direct URLs;
partners see neither the link nor 011 counts/metadata. Customer-wide is the explicit
default; workload selection changes scope without silently carrying unsaved content.
The page works without accepted private facts, maturity or an engagement.

The header shows customer/workload, account owner or **Account Owner Unassigned**,
and available actions. Only mcteer sees assignment editing; a named owner badge is
not itself evidence of authority. Assignment changes have rationale, exact-version
review and a same-key receipt path if acknowledgement is lost.

## List and detail

Default list contains proposed and qualified records; Deferred and Dismissed are
explicit filters. Show product, customer benefit, disposition, proposed-changes badge,
review-required reasons, next review and rank explanation. A compact **Why This Order**
disclosure shows the version and categorical tuple. No estimated revenue, probability,
customer maturity score or hidden portfolio count appears.

Details distinguish **Proposed Revision** and **Last Decided Revision**, with exact
reviewer/time/rationale when eligible. A qualified older revision cannot visually
qualify pending edits. Original sources open the existing evidence detail presentation
with passage, public citation when available, original dates, quality and attribution.
Shared citations expose published content only. Source loss replaces dependent prose
with **Evidence Changed — Review Required** and a refresh path; historical tabs obey
the same rule. Opaque related records may show a retained disposition without purged
names/problem text. All pagination is server-scoped and handles changed cursors.

## Author, review and duplicate flows

The editor contains the structured C03–C08 fields, explicit unknown switches, original
source selection and current-use state. Product key/name is an identity choice, not
an adoption claim. Benefit measurements are labelled proposed targets; baseline can
be unknown. Retain-current-practice is always available as an alternative. Qualifying
with missing customer need or product evidence shows the specific missing check.

The source picker uses bounded lexical discovery over eligible customer/shared
material; 011 does not fetch pasted URLs. Existing claim submission/research screens
remain the way to add new evidence. Selected sources and engagements are explicit,
never silently expanded or dropped to fit context limits.

Before saving an exact duplicate product/problem identity, show current related
records including deferred/dismissed. The user may open the existing record or
explicitly acknowledge a distinct hypothesis with rationale. A changed related set
requires a refreshed comparison. No fuzzy auto-merge or background reopening.

Only the current account owner sees qualify/defer/dismiss/reopen controls. Review
shows exact revision, evidence checks, owner assignment and required rationale.
Defer needs a future revisit date. Due dates create a badge, not an automatic action.
Metadata-only dismiss/defer/reopen remains available for an invalidated/purged record;
qualification stays disabled until fresh eligible content and evidence are provided.
Plan/engagement links open existing governed pages; no accept/start/send shortcut.

## Turi proposals

**Ask Turi** starts a fresh private bound conversation with scope and selected inputs.
Show content-free progress, Stop and explicit failed/expired/unconfirmed states.
The final structured response contains facts, attribution, hypotheses and unknowns;
no usable prose appears before validation. Each eligible proposal offers **Save as
Proposed**. Same-key receipt recovery handles lost save acknowledgement. Editing a
suggestion cannot discard its original lineage or convert it into a qualified record.
Zero supported proposals is a useful result with discovery questions, not a failure
requiring an automatic retry.

## Browser acceptance matrix

Every listed journey runs via CLI Playwright/WebKit at desktop 1280×800 and mobile
390×844, each in light and dark mode; zero retries/skips or missing manifest cases.
Use synthetic records only. Save sanitized screenshots and inspect them visually.

1. US1 create/edit/detail with no engagement; exact citations, public attribution,
   long title/hash handling and empty/loading/invalid-source states.
2. US2 mcteer assigns owner; owner self-review; non-owner denial; reassign during
   open review; qualified head versus pending edits; defer/dismiss/reopen and lost ack.
3. US3 related/dismissed comparison, rank disclosure, pagination/source-change conflict,
   overdue review, invalidated history and permitted delivery links.
4. US4 prepare/stop/final/no-supported-proposal/save; private owner history, source loss
   and unconfirmed recovery; original archive/restore behavior remains usable.

All journeys require labelled controls, visible focus, keyboard-only completion,
dialog focus return, reduced-motion behavior, no horizontal overflow and zero
serious/critical axe violations. Test denied/error/saving-unknown states with meaningful
copy and receipt lookup rather than silent resubmission. User-facing copy describes
decisions and evidence; internal model budget/SQL metadata is kept in diagnostic receipts.
