# 002 research and decisions

Date: 2026-09-27. Design research only; no integrations installed, credentials read,
resources provisioned or hosted behavior certified. Governing scope: [spec](spec.md).
All technical unknowns from planning are resolved below as design decisions;
resource credentials and hosted verification remain implementation prerequisites.

## R1 — Application topology

**Decision:** One Next.js App Router application wrapped with `withEve` from
`eve/next`, retaining the existing root `agent/` and selected model. Use `eve/react`
for rendering/reconnection and preserve the native eve wire protocol. Start with
Next.js 16.3.4 and React 19.2.6, the installed eve package's own development versions;
resolve and lock compatible patches during implementation, recording any deviation.
Keep Node 24, TypeScript 7.0.2, eve 0.67.1 and existing AI SDK unless compatibility
verification establishes a necessary change.

**Rationale:** Installed frontend docs explicitly support this topology and same-origin
cookies. It matches the existing Vercel project's Next.js expectation without a
separate application deployment. Package compatibility still requires a build test.

**Alternatives:** Separate frontend/runtime projects introduce unnecessary routing
and credential boundaries. Copying the old preview dependency versions or installing
all Web Chat scaffolding risks overwriting the selected model and authored governance.
The inspected native registry Web Chat offering adds preview dependencies and a
broad rendering scaffold; use the documented minimal integration for this feature.

**Sources:** Installed `node_modules/eve/docs/guides/frontend/nextjs.mdx`,
`guides/frontend/overview.mdx`, `guides/deployment/vercel.mdx`, and `eve/package.json`.

## R2 — Demo identity, not enterprise authentication

**Decision:** Preserve the requested login names `mcteer`, `panel` and `partner`, mapped to
fixed seeded principal UUIDs. `mcteer` represents internal Vercel admins/FDE/PS
leadership; `panel` represents internal employees; `partner` represents an external
partner member in a synthetic organization. Only `mcteer` administers access. Both
internal accounts see all current and future customer profiles in their workspace;
partner grants represent explicit customer assignments to a limited subset. Each account has private history. Use a random 32-byte
opaque session token; store only its SHA-256 hash in Postgres. Eight-hour absolute
expiry, server-side revocation, HttpOnly/SameSite=Lax/host-only cookies, Secure on
hosted HTTPS. No anonymous, local-development or generic service-identity fallback
on application session routes. Validate same-origin mutations and reject untrusted
forwarded identities and credentials in URLs.

**Rationale:** This implements the confirmed demo scope with a small replaceable
identity adapter. Persisted principal IDs and authorization survive a later login
provider change. A shared `panel` account identifies that account, not panel members.

**Alternatives:** Full SSO/federation is explicitly deferred. Old signed-session
fallbacks and username-derived identity are unsuitable for revocation and future
mapping. Native HTTP Basic prompts do not fit explicit sign-out and visual continuity.

**Configuration:** Reuse names `TURAS_DEMO_USERNAME`/`TURAS_DEMO_PASSWORD` and
`PANEL_USERNAME`/`PANEL_PASSWORD`; add `PARTNER_USERNAME`/`PARTNER_PASSWORD`
for the new account. Require usernames to be exactly the confirmed
accounts. No credentials are copied into fixtures or documentation. Legacy reviewer
aliases and `TURAS_SESSION_SECRET` are not required by the new opaque-token design.
Missing configuration fails closed. Compare password-derived values in constant time;
apply shared login throttling. Credentials change without changing principal IDs.

**Sources:** `../turas-back/lib/auth/session.ts`, `lib/auth/authorize.ts`,
`app/login/login-form.tsx`; [Next.js authentication](https://nextjs.org/docs/app/guides/authentication)
and [cookie options](https://nextjs.org/docs/app/api-reference/functions/cookies).

## R3 — Authorization and live-stream revocation

**Decision:** A shared server-only policy layer verifies session, active principal,
workspace membership, customer-access policy and conversation owner. Active internal
members see all workspace customers; partners require explicit customer assignments. Admin privileges apply
to access management, never private chat content. Put the policy in the eve channel
as well as application handlers; a Next.js page guard alone is insufficient.
Compose the public `eveChannel` route definitions with wrappers that delegate the
original handlers. Wrap stream bodies without changing native NDJSON headers,
event coordinates or cursor semantics. Recheck authority every 10 seconds with a
five-second database timeout; deny/timeout closes the response and cancels its reader,
including idle streams. New operations always check current state. Disable unused
clear/reset/compact and task-input surfaces for demo callers; protect inspection.

**Rationale:** Route authentication does not enforce ownership. eve's native
renewable stream lease is 60 seconds, too long for the spec's 30-second cutoff.
A timer must run even when no content is emitted. It cannot recall delivered bytes.

**Alternatives:** UI-only hiding, client polling and checking only at connect time
leave bypasses. Reimplementing eve's reducer/stream protocol is unnecessary.

**Sources:** Installed `guides/auth-and-route-protection.md`, `channels/eve.mdx`,
`guides/frontend/overview.mdx`, public channel route types; existing
`../turas-back/agent/channels/eve.ts` is reference only.

## R4 — Persistence and migrations

**Decision:** Neon managed Postgres 17 for hosted domain records; ordinary `pg`
parameterized queries and transactions, with one checked-out client per transaction.
Use `node-pg-migrate` for explicit versioned migrations and its migration ledger/lock;
commit immutable migration files and an additional release manifest of their digests.
Use separate least-privilege runtime and migration roles, pooled runtime connection
and direct migration connection. Use local/disposable Postgres 17 in tests.
Default hosted region: AWS us-east-1 alongside Vercel iad1. Resource assignment is
explicit setup; planning neither provisions a database nor assumes an existing URL
is safe. No ORM, database agent integration, pgvector, Blob or cache service in 002.

**Rationale:** Domain authorization, grant revisions and request deduplication need
transactions and uniqueness. Plain Postgres keeps the initial schema small and
supports later retrieval without installing it now. Explicit migration execution
makes request traffic independent of schema mutation.

**Alternatives:** Process memory loses accepted data; eve memory is not an access
directory; request-time CREATE/ALTER introduces race and privilege problems. A new
ORM adds a second schema abstraction without a present need.

**Sources:** [node-postgres transactions](https://node-postgres.com/features/transactions),
[Postgres locking](https://www.postgresql.org/docs/17/explicit-locking.html),
[node-pg-migrate](https://salsita.github.io/node-pg-migrate/),
[Neon connection guidance](https://github.com/neondatabase/website/blob/main/content/docs/get-started/connect-neon.md).

## R5 — Native runtime durability with domain ownership

**Decision:** Postgres owns identity, grants, conversation associations, submitted
messages and dispatch attempts. eve owns execution and the durable event log.
Persist a deduplicated projection of visible messages and terminal response states
through a server hook, keyed by `event.meta.id`. Never depend on a browser callback
for authoritative persistence. Replay native events to repair missing projections;
do not export reasoning or full prompt/tool payloads to routine application telemetry.

Create a domain conversation first, then a parked native session using a stable
`operationId` derived from the conversation UUID. Bind the canonical native session
server-side before any model message. Serialize creation and reconcile candidate
IDs: native concurrent create requests can return different candidates before
operation ownership settles. Never attach an unverified caller-provided session.

For follow-ups, persist one immutable request ID/body digest and attempt, acquire
one dispatch claim, and add server-verified correlation to runtime auth attributes.
The native follow-up returns a `deliveryId` but does not provide a documented
caller-selected idempotency key. On unknown acceptance, do not dispatch again:
reconcile durable events/receipts and display a pending reconciliation state. A
proven `session_not_ready` rejection permits bounded retry. Absence of a receipt
is not proof of rejection. Explicitly unresolved attempts block further sends until
reconciled; this trades availability for avoiding unintended duplicate model runs.

**Alternatives:** Client-only history loses state on refresh; blindly retrying a
follow-up risks two turns. A second bespoke execution engine duplicates eve.

**Sources:** Installed `channels/eve.mdx`, `concepts/sessions-runs-and-streaming.md`,
`guides/hooks.md`, public `SessionSendOptions` and channel option types.

## R6 — Environment boundaries and retention

**Decision:** Separate databases for local/test and each preview data environment;
production remains unconfigured until a later release decision. `TURAS_ENVIRONMENT_ID`
must match a database environment marker, not merely `VERCEL_ENV=preview`.
Start previews from an empty/schema-only resource with synthetic fixtures, never a
branch containing copied private data. Seed initial accounts/grants only through an
explicit bootstrap; reruns must not restore revoked grants or disabled accounts.
Retain demo chats until explicit environment teardown; expire login sessions at eight
hours and prune expired sessions/throttle counters. Retention for private customers
is deferred with that rollout. No background retention connector is needed.

**Rationale:** Two previews should not share sessions or grants accidentally.
The confirmed data scope is synthetic customer information and public research.

**Alternatives:** Reusing the demo database or cloning an arbitrary parent dataset
violates isolation even when a branch is technically independent.

## R7 — UI and verification

**Decision:** Adapt used styles/components from the demo, not its entire inventory:
Geist fonts, neutral themes, 18rem sidebar, centered chat/composer, mobile dialog,
customer selection, owned history and admin access view. Keep attachment and future
product controls absent. Use Vitest for policy/contract tests and CLI Playwright
with WebKit at 390px and 1440px in both themes; axe checks plus keyboard/focus tests.
Use synthetic deterministic model responses in CI and a separately budgeted local
live smoke test for the actual eve/model path through root `npm run dev`. The user
disconnected Vercel; hosted proof is deferred until replacement readiness. No
reconnection or deployment is part of 002.

**Rationale:** This preserves visual continuity while testing the changed boundaries.

**Sources:** [visual reference](../../docs/design-reference.md),
`../turas-back/app/_components/app-shell.tsx`, `agent-chat.tsx`, `app/globals.css`,
[Playwright projects](https://playwright.dev/docs/test-projects).

## R8 — Profile visibility and shared product learning

**Decision:** Internal members can see every customer profile for delivery or other
work; partner assignments expose delivery-relevant information only. Chat ownership
remains private. All active users, including partners, may retrieve reviewed shared
product learnings independent of originating-customer grants. Published entries omit
identifying/confidential source context and retain private lineage for correction.

**Rationale:** A useful solution can transfer between customers without transferring
access to their profiles or original evidence. This is explicit user direction from
2026-09-27, not an inference from the demo.

**Alternatives:** Raw cross-customer search with output-only redaction risks disclosure;
restricting shared knowledge to the source customer prevents the requested reuse.

**Delivery:** 002 establishes roles and minimal partner-safe reference responses;
003 defines profile field projection; 005/006 implement reviewed shared retrieval
and guidance; 014 extends the learning loop. No unused integration is added now.

## R9 — Recovery and behavior-evaluation closure

**Decision:** Use a local Postgres maintenance worker supervised by root dev for
persisted 120s deadlines, reclaimable cancellation-only leases and narrowly signed
runtime maintenance calls. Capture the native stream cursor before dispatch so
replay can identify admission even if both receipt persistence and hook writes fail.
Unknown admission never permits automatic resend.

**Rationale:** Browser timers and unpersisted callbacks cannot recover a deadline
after process exit. Live auth attributes alone do not establish a replayable
attempt mapping. The existing domain database can hold this bookkeeping without
adding an external scheduler or a second model orchestration framework.

**Verification:** Evaluate six representative capability-honesty scenarios twice
against actual generated responses, with semantic grading and side-effect gates.
Keep these distinct from the three-turn smoke and deterministic CI transport tests.
Wire test commands before story checkpoints and use one precisely defined
20-session workload across the three existing accounts. The
[recovery and validation contract](contracts/recovery-and-validation.md) defines
the schemas, failure cases, budgets, timing and acceptance criteria.

**Sources:** Installed eve `channels/custom.mdx`,
`concepts/sessions-runs-and-streaming.md`, `guides/hooks.md`, `workflows.mdx` and
`evals/overview.mdx`; constitution principles IV, VII and VIII. The worker is
application bookkeeping; native eve remains the execution and event authority.
