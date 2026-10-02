# Turas visual reference

Reference: `../turas-back`, with the running demo's dark chat home visually inspected
on 2026-09-26. This is a design inventory, not a completed UI test or redesign.
Future UI validation uses **command-line Playwright with WebKit**, as requested.
Use synthetic accounts and artifacts for committed visual evidence.

Feature 007 directly reviewed the legacy `app/portfolio/page.tsx`,
`app/operating-model/page.tsx` and `app/_components/services-plan.tsx` source on
2026-10-01 (the operations/planning routes re-export those pages). Staffing
operations follows their compact metric cards, exception-first review and tabular
detail; restricted scenario totals use readable currency amounts with exact grouped
inputs underneath. This is a read-only source comparison, not a visual or hosted
validation result. Demo assumptions and annual business planning remain outside 007.

The legacy `app/engagements/[id]/page.tsx` was also reviewed read-only. Its pending
intervention clearly separates requested skill/time from schedulable capacity and
human approval. Current matching preserves that distinction, exposes unmet checks
first and keeps satisfied checks in a keyboard-accessible disclosure. The legacy
route/source inventory did not identify a separate resource-directory, competency
review or staffing-import UI to port; those 007 interactions need their own
governed implementation and CLI browser validation.

## Legacy alignment follow-up (2026-10-02)

The shell, chat landing, customer directory and sign-in screen were compared
read-only against the legacy source. The fresh app now uses self-hosted Geist
Sans/Mono through `next/font`, the legacy neutral surface tokens and 18rem
sidebar, chat search above product navigation, compact history rows and a
48px centered Turi title. Sign-in and customer directory use restrained bordered
cards instead of unstyled inputs/list rows. Current customer scope, access rules,
review actions and explicit synthetic labels remain part of the fresh workflows.
Unavailable legacy routes and demo business figures are not navigation entries.
The local validation used an owned disposable database clone: 20 command-line
WebKit cases passed across desktop/mobile and light/dark, with no skips, retries
or failures. Checks covered keyboard navigation/focus return, closing the mobile
panel after navigation, overflow, labels, serious/critical accessibility issues,
customer cards and parked chat creation without a model call. Synthetic captures
were visually reviewed; Next.js development indicators are local test chrome.
Node-24 typecheck, Next.js production build and documentation checks passed.

## Preserve the visual language

- Geist Sans for interface/body text and Geist Mono for code/technical data.
- Neutral black/white surfaces, subtle gray borders, restrained rounded controls
  (base radius 0.625rem), light/dark theme tokens, color reserved for meaningful status.
- Full-height left navigation, 18rem desktop sidebar, brand at top, New Chat and
  chat-title search, product navigation, recent conversations, identity/sign-out below.
- Collapsible mobile navigation; no horizontal page overflow at narrow widths.
- Quiet chat landing state with centered “Turi” and a compact rounded composer.
  During conversation, use a readable centered column and persistent bottom composer.
- Attachment control and removable filename/type chips; clear upload/extraction/
  pending-review status. Hide extraction payloads from normal message rendering.
- Streaming assistant content, source links, useful progress/failure states, stop
  controls and resumable history. Approval requests must remain visibly actionable.
- Customer directory/profile cards, tabular evidence with dates/quality, journey
  history and distinct approval badges. Sparse labels and strong content hierarchy.
- Operational tables and compact metric cards, with units, period and definitions.
  Explain exception colors; do not rely on color alone.

## Source map

| Reference path | Preserve / adapt |
| --- | --- |
| `app/globals.css`, `app/layout.tsx` | Theme tokens, typography and spacing language |
| `app/_components/app-shell.tsx` | Sidebar, recent history and mobile navigation; refactor dense code |
| `app/_components/agent-chat.tsx` | Chat empty/active states and composer structure; use current eve protocol |
| `app/_components/composer-attachments.tsx`, `chat-attachment.tsx` | Attachment presentation and meaningful status |
| `components/ai-elements/`, `components/ui/` | Adapt used primitives only; do not copy the entire component inventory |
| `app/customers/page.tsx`, `app/customers/[id]/page.tsx` | Directory and account layout |
| `app/_components/customer-journey.tsx`, `context-approvals.tsx`, `source-library.tsx` | Review, lineage and source interactions |
| `app/operations/page.tsx`, `app/planning/page.tsx`, `app/_components/services-plan.tsx` | Operations and planning information density |
| `tests/ui/` | Sidebar, mobile, chat layout, attachments, approvals and ownership scenarios |

Existing labels such as “Design Memo” and synthetic scenario controls are demo
navigation, not mandatory production features. Evolve navigation as slices ship;
do not show inactive feature links. Retain customer context while moving from chat
to evidence, plan and engagement views. Show permissions through useful available
actions, with server authorization behind them.

## Acceptance for UI changes

Compare implemented screens to the referenced source layout at desktop and mobile
widths, in both themes. Verify keyboard traversal, visible focus, labels, dialog
focus return, reduced motion, readable contrast, long filenames and long chat content.
Exercise empty, loading, denied, error, partial extraction, pending approval and
reconnected states. Run Playwright/WebKit through the CLI; attach only sanitized
screenshots to the relevant feature PR. Do not operate the host browser.

Reports follow the same restrained typographic hierarchy with approved Vercel
assets and an explicit period, audience, confidentiality marker and source appendix.
Confirm brand assets and slide master in 009; do not invent official branding approval.
