# eve session boundary contract

Retain installed eve's native HTTP and NDJSON contracts. This file specifies Turas
policy and persistence around them; it does not fork the protocol. Source references:
`node_modules/eve/docs/channels/eve.mdx`, `concepts/sessions-runs-and-streaming.md`,
`guides/hooks.md` and `guides/auth-and-route-protection.md`.

## Route matrix

| Native surface | Turas behavior |
| --- | --- |
| POST /eve/v1/session | Authenticated creation tied to an existing owned domain conversation; require matching operationId; park without message; persist canonical binding |
| POST /eve/v1/session/:sessionId | Validate current owner/customer grant and request key, persist/claim attempt, then delegate original message handler |
| GET /eve/v1/session/:sessionId/stream | Check current session/owner/grant; forward original native response with revocation timer and native headers/cursor intact |
| POST /eve/v1/session/:sessionId/cancel | Owner + current grant; validate observed turn ID; delegate cancellation; record requested state |
| POST .../{clear,compact,reset} | Deny in 002; no corresponding UI controls |
| GET /eve/v1/info | Deny ordinary demo callers; no compiled prompt/tool inventory exposed |
| GET /eve/v1/health | Public minimal native health; application DB readiness remains separate |
| POST /internal/turas/maintenance (authored route) | Server-only signed reconcile/cancel_due for a persisted attempt; rejects demo cookies; returns status only; see recovery contract |
| Framework callback/task-input routes | Preserve required runtime verification; explicitly deny user-driven task input and unused external callback capabilities; tests enumerate actual compiled routes |

The authored `eveChannel` object is composed with wrappers around its public route
handlers. Keep native state/event/metadata behavior. `uploadPolicy: "disabled"`.
No arbitrary file parts, output schema, forwarded authority, clientContext authority,
HITL responses or unused control payloads admitted in 002. Plain text chat only.
The app cookie AuthFn is the only demo-user entry; remove localDev/anonymous and
generic Vercel service fallbacks from user-session access. Runtime callbacks retain
their own framework-verifiable mechanism, not a client-supplied bypass flag.

Native service routing precedes Next filesystem routes on Vercel, so the eve handler
must enforce policy even if a Next page or proxy checked it already. Tests exercise
both direct eve service calls and the application origin.

Customer authority means active internal membership for any customer in that
workspace, or an explicit active partner assignment/grant for the requested customer.
Every reference to a customer grant/check below uses this role-aware rule; workspace
and conversation policy remain mandatory.

## Server-trusted binding and send sequence

1. `POST /api/conversations` authenticates, checks customer access and inserts an
   immutable owner/customer/workspace conversation plus stable creation operation ID.
2. Create a parked native session using that operationId. No model message is
   admitted until canonical native ID is durably bound. The UI may drive the native
   request but cannot set owner or bind an arbitrary returned session itself.
3. Serialize creation with a durable creation claim. Native create-once ownership
   can briefly return different candidate IDs under concurrency; reconcile the same
   operation after startup before returning a ready binding. Never create a new
   operation merely because a response was lost. Expired/terminal sessions do not
   cause an implicit replacement for an old conversation.
4. For send, the client supplies `X-Turas-Conversation-Id` and a new UUID
   `X-Turas-Request-Key` through the supported eve client header provider. The server
   verifies native/domain binding and current access, validates text/limits, and
   atomically saves the normalized request digest/message and reserves the attempt.
   While reserved, capture the native durable tail and persist dispatch_start_index
   (tail+1). Commit the dispatch claim, start/deadline and watchdog job before send;
   no dispatch if cursor capture/persistence fails.
5. Same key/same input returns the original receipt/status without dispatch. Same
   key/different input is 409. A second outstanding request is 409. The native
   `onMessage` result carries only server-derived attempt identity in auth attributes;
   caller-supplied correlation never becomes authority.
6. Delegate the original follow-up handler exactly once after acquiring its claim.
   Persist returned deliveryId when available. Only proven pre-admission rejection
   permits bounded retry. On ambiguous network failure or process death, mark
   uncertain and reconcile using native durable events; never blindly resend.
7. Hooks map authenticated attempt identity and native session to owned domain
   records. Store event IDs idempotently and update turn/response projections. Hook
   side effects occur after native durable emission; hook failure may fail a turn.
   Replay repairs projections after outages without running a model. If both receipt
   and hook writes were lost, the saved cursor, exclusive attempt and normalized
   digest identify the first ordinary message.received and its turn. Do not rely
   solely on runtime auth attributes or optional deliveryIds. Advance the persisted
   projection cursor atomically with replay writes; ambiguous evidence stays blocked.

Admission failures use native-compatible `{ ok:false, code, error }` JSON. A duplicate
attempt with an admitted native receipt returns that receipt; an unresolved dispatch
returns retryable `409 turas_dispatch_pending` and the UI polls the status endpoint,
not the send route. Configure client error handling so only native
`session_not_ready` causes an automatic send retry. Operation/request IDs are not
capability tokens; authorization is checked again on every replay.

The [recovery contract](recovery-and-validation.md) defines exact replay admission,
worker leases, HMAC authentication, bounded retry and restart acceptance cases.
Maintenance replay uses attachSession within the runtime and only writes the original
projection; it grants no user read access and cannot resend a message.

## Stream and cancellation semantics

Preserve native Content-Type, `x-eve-stream-version`, optional tail-index headers,
absolute `startIndex`, heartbeats and event bytes. Native 60s stream leases alone do
not meet FR-010. Independently check current login/membership/grant/owner every 10s,
with a 5s timeout, and check cached authority age before forwarding. Revoked, expired,
unavailable or timed-out authority closes downstream and cancels the upstream reader.
The timer operates during silent intervals; browser disconnection cleans up timers.

Reconnecting invokes all checks again. Revocation tests measure last protected byte
from decision commit, not merely UI response. Past delivered text cannot be recalled.
Suppressing future delivery does not itself prove runtime cancellation; preserve that
distinction. Explicit owner cancellation uses native observed turnId, waits for
`turn.cancelled` before terminal state, and retains partial output as incomplete.

Use native event IDs for replay deduplication and native stream indices for order.
Do not increment the durable replay cursor from hook arrival order. One turn may
contain several message.completed blocks and provider retries; `turn.completed`
marks completion. Do not expose reasoning in the UI or application audit log.

## Required contract tests

- Unknown login, wrong owner, same-customer other owner, wrong workspace/partner,
  revoked grant, disabled account and expired session for every accessible surface.
- Initial binding persisted before first message; arbitrary IDs and create races
  cannot steal an existing session. No unauthenticated local fallback.
- Duplicate create/send, lost create receipt, lost follow-up receipt, DB failure
  before/after native acknowledgement, hook failure and restart during response.
  Combine lost send receipt with failed hook write; recover from pre-dispatch cursor
  despite earlier identical text and absent optional deliveryIds; never redispatch.
- Persisted deadline recovery before/after timeout, expired worker lease, two workers,
  revoked owner, lost cancel acknowledgement and stale original turn; signed route
  denies demo cookies, invalid/replayed signatures and cross-environment attempts.
- Quiet and active stream revocation <=30s; slow/failed access check; reconnection
  denial; no leakage through inspection, control, callback or upload paths.
- Stale cancellation does not cancel a later turn; partial output never shown complete.
- Native headers/reducer/cursors survive wrapper and replay; terminal session does
  not silently turn into a new session. Verify via local real eve runtime as well
  as deterministic transport fixtures. Hosted proof remains deferred.
