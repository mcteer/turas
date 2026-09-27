# Application and UI contract

Proposed interfaces for 002, not existing endpoints. All handlers call shared
server-only services and validate input with Zod. Names below are stable planning
contracts; deliberate changes must update the spec artifacts and contract tests.

## Common behavior

JSON responses use `{ data, correlationId }` or `{ error: { code, message }, correlationId }`.
401 means missing/expired login; 403 means a disallowed action on an otherwise visible
scope; inaccessible or nonexistent customer/conversation IDs both produce the same
404. 409 signals stale revision, key reuse with changed input or an outstanding turn;
413 means body too large; 422 validation failure; 429 includes Retry-After; 503 means
unavailable persistence/runtime. Errors never expose credentials or hidden metadata.

Protected responses use `Cache-Control: private, no-store`; no cross-user response
cache. Authenticate and authorize on the server, including direct API calls. Require
same-origin mutation checks with explicit configured origin and a session-bound CSRF
token after login; login also requires an origin check. No permissive CORS. Paginated
reads default to 25/max 50 and use opaque validated cursors; counts exclude denied rows.

## Application routes

| Method/path | Input | Result and policy |
| --- | --- | --- |
| POST /api/auth/login | username, password | Validate configured demo account; set opaque cookie; return principal/workspace summary; generic invalid-credential error |
| POST /api/auth/logout | CSRF token | Revoke current login row, expire cookie; idempotent; client disconnects stream and clears protected state |
| GET /api/auth/session | none | Current account, active membership and UI capabilities; no secrets |
| GET /api/customers | cursor, limit | All workspace references for internal members; assigned references only for partners; includes synthetic label |
| GET /api/conversations | customerId optional, title query optional, cursor, limit | Current owner's customer-authorized conversations only; explicit empty vs unavailable |
| POST /api/conversations | customerId, requestKey | Idempotently create private domain conversation; bind native parked session before marking ready; no model work |
| GET /api/conversations/:id | none | Owned authorized metadata, binding state, native session handle when ready, response state and visible projected history |
| GET /api/conversations/:id/attempts/:requestKey | none | Authorized admission/reconciliation status; cannot trigger a resend |
| GET /api/admin/access | workspace scope, pagination | Admin-only account/grant metadata; no chat bodies |
| PATCH /api/admin/memberships/:id | active, expectedRevision, requestKey | Admin-only disable/reactivation with last-admin protection and audit |
| PUT /api/admin/grants/:membershipId/:customerId | active/revoked, expectedRevision (0 if absent), requestKey | Admin-only same-workspace partner assignment/grant change; revision conflict is explicit |
| GET /api/admin/audit | cursor, limit | Admin-only access metadata, no message content |
| GET /api/health/ready | none | Minimal ready/unavailable response from environment/schema checks; never prints URLs or credentials |

Native eve routes carry chat send/stream/cancel; see [eve-session.md](eve-session.md).
No duplicate application message transport, upload endpoint, customer profile CRUD,
report API or SSO invitation interface is added in 002.

## Login and account rules

- Exactly `mcteer`, `panel` and `partner` are admitted through configured credentials. Passwords
  remain server-only; no default or committed passwords. Shared panel usage means
  shared panel history, with no claim of individual attribution.
- Eight-hour absolute sessions; every protected operation verifies current active
  state. Logout and account disablement revoke access without waiting for cookie expiry.
- `mcteer` is an internal Vercel admin (primarily FDE/PS leadership); `panel` is an
  internal Vercel employee; `partner` is an external partner member with a synthetic
  organization. Admin access is granted only to `mcteer`. All customer grants are explicit
  and revocable. Reseeding does not restore revoked permissions.
- Active internal accounts access all current and future workspace customers without
  per-customer grants. `partner` receives a
  limited subset, with at least one customer shared with internal accounts and one
  ungranted customer for denial tests. No account can read another account's chats.
- Broad internal visibility means every customer profile, including non-delivery
  use. Partner assignment exposes only delivery-relevant customer data. The 002
  customer-reference DTO contains only ID, display name and synthetic label; no
  internal persistence metadata or unrestricted profile object is returned.
- All active members can use published shared product learnings when introduced in
  005, without access to the source customer. Shared entries are reviewed sanitized
  revisions with their own citations, not partner access to raw cross-customer data.
- Sign-in return paths are same-origin relative routes; reject external/ambiguous URLs.
- Changing a password requires revoking existing sessions through the maintenance
  path; it does not change principal identity or conversation ownership.

## UI routes and behavior

| View | Contract |
| --- | --- |
| /login | Labeled username/password form, generic errors, loading feedback, constrained return path |
| / | Authenticated shell; select a granted customer or show no-access state; no session created on page load |
| /customers | Role-scoped customer directory; synthetic markers; select customer into a new-chat flow |
| /s | New-chat composer disabled until explicit authorized customer selection |
| /s/:conversationId | Domain ID in URL; server verifies owner/grant then supplies native session to eve/react |
| /admin/access | Visible and usable only by mcteer; versioned grant/account changes and audit metadata |

Preserve Geist typography, neutral light/dark themes, 18rem desktop sidebar, centered
Turi landing/composer, recent owned chats and title search. Customer context stays
visible while chatting. No attachment affordance or future-feature links.

The mobile sidebar is an accessible dialog: trap focus, Escape closes, restore focus
to trigger, and label its controls. Both 390px and 1440px layouts have no horizontal
page overflow. Keyboard traversal, contrast and reduced-motion behavior are checked.
Normalize these dimensions as CSS/design tokens, not viewport-specific duplicate UI.

Always show the demo data notice before submission: synthetic customer data/public
research only. Mark synthetic fixtures. Do not present submitted public research as
approved facts or claim to have browsed a source without a research capability.

A send is optimistic/unsaved until server admission. Show pending, running, stopping,
reconciling, completed, cancelled and failed accurately. Native cancellation accepted
is not cancellation complete. On revocation/logout/expiry, clear protected state and
close streaming. An unavailable history request must not look like zero conversations.
