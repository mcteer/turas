# Reporting UI Contract

Follow `docs/design-reference.md` and `app/design-system.css`. Keep Geist, neutral
surfaces, restrained borders, compact operational tables and clear page hierarchy.
Title case authored navigation/section labels while keeping “and”, articles and
short prepositions lowercase. Preserve user-written customer/report names.

## Entry Points and Workspace

Add Reports within each customer workspace and a contextual link from engagement
execution. Customer selection remains explicit and persists across customer routes.
A report landing page shows period, kind, audience, review state, delivery state
and correction indicator. Avoid fabricated report counts or inactive future-feature
navigation. Existing Turi composer/customer context bar stays as designed.

An internal user can choose Weekly, Monthly or Quarterly, select permitted scope,
period and timezone, and acknowledge a current partial period. The default is the
last complete period. Display the actual source cutoff and a concise explanation
when late approvals make a correction necessary. Preparation is deterministic and
does not open a chat or select a model.

## Review and Publication

Show the report narrative with source labels, metrics/units and explicit unknowns.
Use side-by-side audience preview only where the reader may see both audiences;
never generate an internal version as a hidden client payload for partners.
Keep required sections visible, even when their content is a short unknown state.
Author controls allow source-bound emphasis/ordering and labeled recommendations,
not arbitrary factual text that bypasses approval.

mcteer receives an exact Review Publication panel listing version, audience,
cutoff, source changes, render/brand validation and correction predecessor. Require
a rationale and explicit Publish action. Pending rendering disables publication
with a useful status. Lost acknowledgement enters Reconciling and checks the same
request receipt; retry does not invent a new command. Conflict refreshes the current
preview and preserves an unsent rationale locally without auto-submitting it.

## Recipients, Schedule and Send

Recipients and Schedule are management sections for mcteer. Display exact addresses,
customer entitlement or internal membership binding, audience, verified sender,
policy version, timezone, next draft due and pause/revoke controls. panel sees only
readiness and aggregate delivery state. Partners see no recipient-management sections.

Schedule wording explicitly says “Prepare Weekly Draft”; it never implies automatic
email authorization. Send Review shows the final subject/body/artifact previews,
exact recipients/sender, policy version and current validation. The primary action
is Send Approved Report. Publication and send remain separate explicit actions.

Delivery History distinguishes Queued, Provider Accepted, Delivered, Failed,
Uncertain, Cancelled and Blocked. Explain uncertainty briefly and offer Reconcile;
never present a generic retry for a possibly accepted message beyond the safe window.
Show recipient outcomes separately and never resend successful recipients when one
fails. A correction references its earlier publication and delivery status.

## Executive Artifacts and Branding

Provide PDF preview plus Download PDF and Download Editable Slides. Show artifact
versions and announce font requirements for editing (approved Geist must be installed).
Do not advertise editability based only on a thumbnail. Brand Review for mcteer
shows actual samples, asset/font/master versions and approval status. A synthetic
preview badge is a product state, not a claim of corporate approval.

External email/PDF/slide footers do not include inaccessible internal source links
or private recipients. The application may separately expose governed source detail
to authorized users. The report remains understandable outside the application.

## States and Accessibility

Cover empty history, no reviewed logs, partial period, preparing/rendering, disabled
feature, missing worker/fonts/sender/brand, denied access, stale source/preview,
withdrawn artifact, cancelled job, provider outage and correction-required history.
Retain the period/scope when recovering from a failure. Never turn a missing input
into an empty success table or green “on track” indicator.

Keyboard-accessible tabs and dialogs, visible focus, label/error associations,
focus return, live status announcements, non-color status text and reduced motion
are required. Mobile cards replace unusable wide row layouts; remaining data tables
scroll inside labeled focusable regions, with no whole-page horizontal overflow.

## CLI WebKit Journeys

Run desktop 1440×1000 and mobile 390×844 in light/dark (four projects). Use real
owned disposable domain fixtures, not route stubs for acceptance. Mock transport
only at the external provider boundary. Required journeys: weekly empty/populated,
exact review conflict/replay, policy/schedule/pause, send/uncertain/reconcile,
monthly/quarterly previews/downloads, partner projection, revocation/withdrawal and
correction history. Inspect sanitized screenshots and require zero serious/critical
axe findings, page overflow, unhandled errors, skips or retries. PDF/PPTX file
inspection is a separate artifact gate; browser screenshots do not prove editability.
