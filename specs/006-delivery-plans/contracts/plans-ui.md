# Delivery planning UI contract v1

Follow `docs/design-reference.md` and current profile components. Use a customer
profile Plans entry with the current customer/workload retained across plan,
evidence and engagement navigation. Do not add dormant staffing/reporting controls.

## Surfaces

1. **Plan list**: title when readable, owner, audience, draft/review/accepted state,
   accepted revision, source-review warning and updated time. Scope-bound pages;
   a partner's hidden drafts do not affect badges, totals or pagination messages.
2. **Create/editor**: customer/workload confirmation, immutable audience, owner,
   progressive twelve-section outline. Bounded structured controls for assertions,
   sources, work packages, milestones, fit and designs. Save incomplete work with
   visible field errors; submission provides a grouped actionable error summary.
3. **Technical design**: node/edge form editor and deterministic context/container
   SVG, with identical accessible component/flow table. Plain-text labels only.
   Design decisions include alternatives, chosen approach, reason, evidence,
   operational/testing/rollback considerations. No arbitrary markup editor.
4. **Detail/evidence**: numbered sections, explicit facts/research/proposals/
   estimates/assumptions, exact source locations, quality/date caveats and discovery
   actions. Both value-proof and production-readiness tracks remain visible.
5. **Review**: administrator-only preview of the exact revision/digest, source
   readiness, source changes, milestone baseline, intended engagement, audience and
   delivery-suitability checkbox when required. Accept, request changes and reject
   require a rationale; no default selected action or automatic accept on Enter.
   Stale preview prompts reload/review rather than silently submitting a new version.
6. **History/compare**: immutable version list, reviewer/time, change reason, structured
   diff and accepted baseline distinction. Withheld versions never supply diff text.
7. **Engagement baseline**: one canonical engagement linked from the customer and
   accepted plan; show planned milestones and exit evidence. No progress percentage,
   completed milestones, confirmed staffing or inferred delivery stage.
8. **Draft with Turi**: show selected audience/workload/base revision and bounded
   drafting action. Start creates a fresh private conversation; show status, cancel,
   saved proposal link, safe failure/unconfirmed outcome and receipt recovery.
   Ordinary chat offers the plan action link without reusing its model history.

## Visibility and recovery

Internal users inspect customer plans; assigned partners inspect only their own
drafts and accepted delivery revisions. A partner opening another member's draft
gets a generic unavailable state, with no title or owner leaked. Accepted delivery
revision links never expose an internal or unaccepted revision via history/diff.

When dependencies become prohibited, replace affected body/title/diagram/baseline
with a generic review-required card. Keep allowed decision identity visible.
Freshness-only historical warnings show the dated baseline and a revise/review action.
A purged payload explicitly reports unavailable historical content; do not fabricate
an empty plan. Unsaved local edits remain in memory only and navigation warns before
loss. No customer text is stored in localStorage or telemetry.

## Interaction and acceptance matrix

CLI Playwright/WebKit runs desktop/mobile × light/dark. Cover keyboard completion,
focus on first invalid field, dialog focus return, visible focus, error/live-region
announcements, no horizontal overflow at 390 px, long titles, safe diagram wrapping,
reduced motion and sufficient contrast. Axe: no serious/critical findings in core
surfaces. Screenshots use synthetic data under ignored `local-artifacts/006/`.

Required states: loading, empty, hidden/denied, incomplete draft, stale version,
source conflict, withheld/purged, provider failure, cancellation, unconfirmed send,
saved-but-acknowledgement-lost and responsive accepted baseline. Assertions must
check persisted plan/engagement results, not only visible success text. Do not use
the host browser or claim local UI checks prove hosted deployment behavior.
