# Connection Management Contract

Existing browser session/CSRF, exact Origin, canonical self/admin policy and no-store
responses apply. MCP bearer credentials cannot call these management endpoints.
Strict requests follow C01–C08; private values never appear in URLs/logs/storage.

| Route | Actor and request | Result |
| --- | --- | --- |
| `GET /api/mcp/connections` | Active member; limit 1–20 and opaque cursor | Own connection metadata only; fixed categories, selected currently visible customer scope, created/expiry/revocation and safe usage |
| `POST /api/mcp/connections` | Active member + CSRF; requestKey UUID, name 1–80, categories 1–5 distinct, customerIds 0–100 distinct, lifetimeDays 1–30 | 201; exact metadata and one-time credential, reviewed scope receipt |
| `POST /api/mcp/connections/[id]/revoke` | Owner + CSRF, or canonical mcteer for same workspace; requestKey and expected connection identity | Idempotent revocation receipt; never recovers secret |
| `GET /api/mcp/connections/admin` | Canonical mcteer only | Paginated workspace revocation metadata, not another member's secret or raw read arguments |
| `GET /api/mcp/connections/[id]/usage` | Owner; canonical mcteer may inspect fixed operational categories only | At most 20 safe receipt rows; no customer names/query/prose/source location/hidden totals |

Creation limits: at most 10 active per membership, fixed maximum 10 management
writes per membership per UTC minute, 60 per workspace. Creation customer ceiling
must be authorized at review/commit and requires at least one customer when any
customer category is selected. Shared knowledge-only scopes may have none.
Selected category/customer review is an explicit user action; no checked defaults
that silently enable all categories/customers. Expiry defaults to 7 days.

Exact replay returns 200 safe metadata/receipt with `secretAvailable:false`; never
stores/reissues plaintext. Lost creation response requires revocation and new key.
Changed-key payload replay is 409. Revoke immediately fences future reads; uncertain
responses reconcile through list/status without client auto-resubmitting creation.
No scope edits/restore; rotation is revoke then new access. Expiry is independent
of browser sessions. Management writes never modify customers, facts or grants.

## UI

`/settings/connections`: active members see own Connections, Create Connection,
explicit categories and authorized selected-customer ceiling, expiration, one-time
secret and Revoke. Canonical mcteer receives separately labelled Workspace Access
revocation controls. Others cannot see peers or admin action UI.

One-time credential remains only in ephemeral component memory. Never persist it
in local/session storage, a URL, saved DOM screenshot or telemetry. Warn visibly
before dismissal that it cannot be retrieved again; copying is explicit and setup
examples use placeholders. Revocation confirmation identifies the connection and
its scope without displaying the secret. Give clear loading/empty/unavailable,
expiry, uncertain-response and denied states. Restore keyboard focus after dialogs,
use existing design tokens/title case, support desktop/mobile themes, no horizontal
overflow or serious/critical axe findings.

Safe usage is only connection operation/result/time, duration and correlation UUID.
It is not account analytics or a cross-customer inference surface. After permission
loss, hide formerly selected customer names while retaining minimal own connection
revocation metadata. Service disablement blocks creation/MCP reads, but self/admin
revocation and safe reconciliation remain available while schema is compatible.
