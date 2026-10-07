# Support Guidance UI Contract

Customer route: `/customers/:customerId/support`, with optional workload selector. Use current workspace page headers, Geist typography, neutral panels, tables, accessible disclosures and responsive theme tokens from `docs/design-reference.md`.

## Primary View

- Breadcrumb back to customer; title **Support Guidance**; explicit customer/workload and internal/delivery audience selection for internal users.
- Six readiness checks and a textual effective summary: Not Assessed, Ready, Gaps, Unknown, Not Applicable or Review Required. Show observation and next-review dates and the versioned rule. No progress percentages or maturity scores.
- Separate **Maturity Context** and **Engagement Inputs** disclosures. An empty assessment is useful and does not demand a fabricated engagement.
- **Recommended Actions** table: action, priority, owner/unknown, accepted disposition, next review, source/review flags. Paginate 20 by default, no hidden totals.
- Action detail has outcome/validation, sources, optional escalation/handoff and permitted history. External links use plain validated hyperlinks and safe new-tab attributes; no auto-preview or fetching.

## Authoring and Review

- Internal users can propose an assessment/action. Scope and audience are explicit before evidence selection. Changing audience begins a separate clean draft with appropriate sources; never silently republish internal text.
- Source picker reuses eligible customer/shared evidence projections and selected execution records. It exposes original dates/quality and unknowns. New customer facts go through existing Pending Review, with a navigation link rather than a duplicated approval form.
- Owner controls offer current eligible memberships, evidenced customer roles or Unknown with a required reason. Labels do not imply confirmed allocation.
- mcteer sees exact current revision, evidence, preview age, decision rationale and Accept/Reject/Withdraw. Panel sees its pending proposal and the still-current accepted version. Same-actor review is allowed and recorded.
- Updating disposition, escalation or handoff saves a pending action revision. Completion demands date and outcome evidence; deferral demands revisit date. “Human-reported handoff” is distinct from external acknowledgement or ticket resolution.
- A save with lost acknowledgement shows **Checking Save Status** and resolves the same request key. Conflicting changes present a refresh action and preserve the local draft; do not auto-accept or create a new key.

## Turi Interaction

Internal-only **Ask Turi** prepares a fresh owner-private conversation for the selected scope/audience and current evidence. The button never invokes a provider twice on double-click/reconnect. Show running/stop/failed/expired/unconfirmed states using the existing conversation UI. A suggestion offers **Save as Proposed Action** only after a completed eligible output; it never exposes an Approve tool or sends externally.

Partners see accepted delivery data for assigned customers with read-only evidence links. They see neither hidden draft/advice controls nor counts of inaccessible internal records. Revocation clears view/cache access; direct navigation, browser history and reload use the same server boundary.

## Required States and Accessibility

Empty, loading, denied, unavailable, pending review, source withdrawn, evidence overdue, inactive owner, conflict, saving-unknown, generation stopped and provider-unconfirmed states are explicitly distinguishable. Do not show stale prose under a generic spinner. Fields have persistent labels, validation is associated with controls, status is announced accessibly, and dialogs restore focus. Keep keyboard traversal, reduced motion, readable contrast and no horizontal page overflow at 390px.

## Browser Acceptance Matrix

Run these seven journeys in each existing project: desktop-light, desktop-dark, mobile-light, mobile-dark (28 cases minimum, every discovered support case must execute).

1. Empty scope without engagement; source-aware six-check assessment and exact review.
2. Panel proposal, forbidden review, mcteer acceptance and accepted-versus-working state.
3. Action ownership, block/defer/complete/reopen with required evidence and dates.
4. Escalation unknown route and human-reported handoff with no external action.
5. Assigned partner delivery read, hidden internal content/citations and revoked grant/direct URL.
6. Source correction/withdrawal, stale review and concurrent/lost-ack save reconciliation.
7. Native Turi prepare/run/stop/reconnect and explicit save-as-proposal with unchanged accepted state.

Use synthetic fixtures, CLI Playwright/WebKit and axe. Inspect representative desktop/mobile screenshots in both themes; do not automate the host browser or commit private logs/traces. Missing, skipped, retried or failed acceptance cases fail the gate.
