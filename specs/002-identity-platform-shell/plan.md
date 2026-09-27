# Implementation Plan: Identity, persistence and application shell

**Branch**: `002-identity-platform-shell` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Input**: Clarified feature 002, including the user's deployment hold: the repository
is disconnected from Vercel until Turas can replace the existing application.

## Summary

Build a locally validated demo shell with credential-checked `mcteer`, `panel` and `partner`
accounts, explicit customer grants, private durable conversations and the demo's
visual language. Use Next.js with the existing eve runtime and a small server-only
Postgres domain layer. `mcteer` manages access; administrator status never bypasses
chat ownership. Full enterprise authentication and private customer data are deferred.
`panel` models internal Vercel employees; `mcteer` models internal administrators,
primarily FDE/PS leadership. `partner` models an external organization member with
a limited assigned-customer subset: seed a shared granted customer and an ungranted
customer. Active internal employees and admins see all current and future customer
profiles within their workspace without per-customer grants. Partner assignment
permits only delivery-relevant fields; 002's minimal customer reference is limited
to ID, display name and synthetic label. Private chats remain private. Reviewed
shared product knowledge is accessible to all platform members when 005 introduces
it; source-customer profiles, artifacts and private lineage remain protected.

This plan completes design only. It installs nothing, changes no runtime behavior,
and does not reconnect, link, provision or deploy a hosted application. Hosted
validation is a deferred replacement-readiness gate, not a prerequisite to finish
local feature 002. See [research](research.md) for choices and their evidence.

## Technical Context

**Language/Version**: TypeScript 7.0.2, Node 24, SQL/Postgres 17.

**Primary Dependencies**: Existing eve 0.67.1/AI SDK/Zod; Next.js 16.3.4 and
React/React DOM 19.2.6 as initial compatibility targets; `pg`, `node-pg-migrate`;
Vitest, Playwright/WebKit and axe for meaningful changed-behavior checks. Pin exact
resolved versions in the implementation lockfile and document necessary deviations.
No new outbound eve integration. Use documented `eve/next` and `eve/react` directly;
registry `channel/web` was inspected but its broad scaffold is unnecessary.

**Storage**: Local disposable Postgres 17 for domain data; eve's local durable
Workflow data retained across restarts. Neon Postgres is the selected future hosted
provider, with separate environment databases and runtime/migration roles. No hosted
resource is assigned by this plan; default future region us-east-1 / Vercel iad1.

**Testing**: Unit policy tests; real-Postgres transaction/migration tests; native
eve route/stream contract and failure-injection tests; CLI Playwright WebKit desktop
and mobile in both themes; deterministic CI and separately enabled local live-model
smoke test plus scored representative behavior evaluations. Hosted tests deferred under the user's deployment hold.

**Target Platform**: Local Next.js/eve on Node 24 now; Vercel-compatible build for
future deployment. User's host browser is not used.

**Project Type**: One web application with eve as the agent runtime, one shared
server-only domain layer, and explicit migration/fixture commands.

**Performance Goals**: Customer selection and first owned-history page p95 <=2s
with 20 authenticated sessions across mcteer/panel/partner (7/7/6) and 1,000
conversations (400/400/200); 30s warmup then 120s measured read workload, one request
per endpoint/client/second and page size 25; separate model latency. Stream
revocation <=30s, implemented with 10s polling and <=5s check timeout.

**Constraints**: Preserve root model; synthetic customer data/public research only;
no implicit demo import; user input does not become accepted customer fact; all
session surfaces enforce grants and ownership; no auto-deploy/reconnection.

**Scale/Scope**: Three actual demo accounts, one visible workspace, multiple workspace/
partner identities in boundary tests; initial synthetic customer directory, owned
chat list, chat, login and admin access screens. No profiles, uploads, RAG or reports.

## Constitution Check

Pre-research and post-design checks both pass for the scoped design. Passing this
check does not assert that implementation or future hosted validation has passed.

| Principle | Pre-research gate | Post-design evidence |
| --- | --- | --- |
| I Specify first | Clarified spec and acceptance outcomes exist | This plan plus contracts precede tasks/code |
| II Customer outcomes | No invented maturity/commercial scoring | Customer references only; profiles remain 003 |
| III Provenance | Chat input stays unapproved | No profile fact writes/research ingestion tools in 002 |
| IV Authorization | Customer, workspace, partner and owner boundaries required | Shared policy, per-operation checks, live stream revocation, route matrix |
| V Human authority | Access changes restricted to administrator | Version checks, audit, explicit grants; no model administrative tools |
| VI eve core | Model and native protocol preserved | Minimal documented integration; no unused connectors |
| VII Meaningful checks | Tests match changed behavior | DB failures, ownership, replay, WebKit, live smoke and 12 graded behavior responses |
| VIII Operability | Durable data and explicit migrations | Request ledger, replay recovery, bounded limits, isolated environments |

User-authorized scope adjustments: three demo accounts replace enterprise identity;
no private real-customer data; hosted verification deferred until replacement-ready.
These do not waive server authorization or durability. Record future SSO identity
mapping explicitly; never infer ownership from a matching display name.

## Project Structure

### Documentation (this feature)

```text
specs/002-identity-platform-shell/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── application.md
│   ├── eve-session.md
│   └── recovery-and-validation.md
├── checklists/requirements.md
└── tasks.md                    # implementation sequence and coverage
```

### Source Code (proposed, not yet implemented)

```text
app/
├── layout.tsx, globals.css
├── login/
├── (workspace)/               # customer selection, owned chats, admin access
├── _components/               # only used shell/chat/login primitives
└── api/                       # login/logout, customers, chats, admin, readiness
lib/
├── server/auth/               # credential adapter, opaque sessions, CSRF
├── server/access/             # centralized policy and audit
├── server/db/                 # pg transactions, environment/schema checks
├── server/conversations/      # requests, dispatch reconciliation, projections
└── contracts/                 # validated public request/response schemas
agent/
├── agent.ts                   # existing model preserved
├── instructions.md            # capability-accurate demo instructions
├── channels/eve.ts            # native routes plus shared policy wrappers
├── channels/maintenance.ts    # signed, narrowly scoped reconcile/cancel route
└── hooks/persist-conversation.ts
migrations/
scripts/                       # migrations, bootstrap, diagnostics, replay
├── dev.mjs                    # supervise local app/runtime and maintenance worker
├── maintenance-worker.ts      # persisted deadlines, leases, heartbeat, nonce cleanup
└── eval-behavior-local.ts      # explicit opt-in authenticated behavior evaluation
evals/
├── evals.config.ts
├── 002-capability-honesty.eval.ts
└── fixtures/002-capability-honesty.json
next.config.ts
playwright.config.ts
tests/
├── unit/
├── integration/
├── contracts/
├── ui/
└── fixtures/
```

**Structure Decision:** One root package, not a monorepo or separate auth service.
Shared server modules must compile in both Next.js and eve; they use Web-standard
Request/cookie parsing and Node APIs rather than importing Next-only runtime
functions into the agent. Client modules cannot import server modules/secrets.

## Delivery sequence

1. Add minimal Next/eve composition and locked dependencies; prove the native channel
   wrapper compiles, preserves response headers and denies direct bypasses. Use a
   controlled runtime for this first compatibility test; do not install scaffold extras.
   Inspect the compiled capability inventory and disable unused default tool surfaces
   for this text-chat slice; do not give the model database administration or host
   credentials. Preserve the selected model and existing agent configuration file.
2. Add migrations, environment marker, explicit synthetic bootstrap, `pg` repository
   and transaction tests. Bootstrap cannot undo revocation or account disablement.
3. Implement opaque sessions and shared authorization, then login/admin endpoints.
   Keep all three accounts' history private even when granted the same customers.
4. Add parked-session binding, dispatch ledger, event projection/reconciliation,
   stream revocation and cancellation confirmation. Prove lost-acknowledgement,
   restart and duplicate-submission cases before relying on the chat UI.
5. Adapt the reference shell and chat through `eve/react`, with explicit customer
   selection, owned title search, demo data notice and accessible error states.
6. Complete local real-runtime/live-model smoke and graded behavior evaluations,
   migration recovery, rate/latency,
   WebKit and documentation evidence. Generate tasks and analyze them before coding.
   Keep hosted build/deployment verification visibly deferred.

## Operational decisions

- Session cookie expires after 8 hours; logout revokes the server row. Rotate token
  on login. Store SHA-256 token hashes only. Hosted Secure cookies; local HTTP cookie
  name/config isolated from hosted credentials. Origin allowlist derives from explicit
  application origin, not arbitrary forwarded host headers.
- Limits: 16 KiB UTF-8 message text; 32 KiB JSON request body; title <=120 characters;
  search <=100 characters; page size default 25/max50; 1 nonterminal dispatch per
  conversation, 2 per principal, 20 per environment. 20 sends/minute/principal;
  5 failed logins/15min per account+IP and 30/15min per IP, using hashed IP counters.
  Each shared demo login has one account budget. Return 429 with Retry-After.
- Persist limiter and dispatch admission atomically in Postgres. Database checks
  time out within 5s. No database fallback to process memory for authorization.
- Persist a deadline job before dispatch and request cancellation after 120 seconds
  through the root-dev-supervised Postgres maintenance worker (5s scan, 15s lease,
  turn-targeted signed maintenance endpoint, bounded retries); see the exact
  [recovery contract](contracts/recovery-and-validation.md#durable-local-watchdog-u1).
  Recover overdue deadlines after restart, independently of browser connection;
  this is a cooperative deadline, not a claim that the provider stops instantly.
  Reject new sends once recorded output exceeds 20,000 tokens per conversation.
  Usage is provider-reported after execution, so a crossing call can overshoot;
  record actual usage. Preserve `agent/agent.ts` and its model. Reconciliation waits
  for native terminal evidence rather than inventing completion.
- Initial session creation retries at most 5 times with capped backoff within 20s;
  follow-up retries only on proven non-admission (`session_not_ready`), same budget.
  Never automatically reclaim a dispatch claim after an ambiguous send. Persist
  native pre-dispatch tail+1 and normalized input digest under an exclusive attempt
  reservation; replay from that cursor recovers the admitted input/turn even when
  receipt and hook database writes are both lost. See the recovery contract.
- Add six representative capability-honesty evaluations run twice against the
  unchanged model, with hard side-effect gates and recorded semantic grading; all
  12 must pass. CI fixtures validate the harness but do not certify prompt behavior.
  Wire basic test commands during setup; later tasks add CI orchestration.
- Migrations run explicitly with a direct migration connection, serialization lock,
  immutable digest manifest and schema-version readiness. Runtime role has no DDL.
  Use transactional migrations in 002; recover failures by rollback and corrected
  forward migration, not destructive down-migration of acknowledged data.
- Auth/audit/error telemetry omits message bodies, credentials and reasoning. Disable
  unnecessary model-content trace export; runtime transcript persistence is separate
  from routine telemetry. Only the authorized admin reads access audit metadata.
- Keep local eve Workflow data and domain DB across restart tests. DB transcript
  projections do not replace Workflow state; backup/recovery instructions name both.

## Rollout, recovery and deferred hosted gate

The user disconnected GitHub from Vercel on 2026-09-27. No automatic preview,
manual deployment, reconnection, `eve link`, project-setting change or domain cutover
is part of 002. Builds/tests run locally and in CI. Existing automatic-preview
failure is historical context, not an active deployment to repair now.

At replacement readiness, review feature parity, current target project/domain,
secrets, separate hosted resources, database migration and eve durable-session
compatibility. Then run hosted smoke/denial/revocation/restart tests and document
rollback before explicit reconnection or cutover. Use eve for authorized Vercel
link/deploy actions. Never use `eve deploy` as a preview test: it targets production.
Keep the existing app available until that release decision.

## Complexity Tracking

No constitution violations requiring an exception. The dispatch ledger and native
route wrapper are necessary for the spec's idempotency and revocation guarantees;
a second auth platform, orchestration engine, Blob integration and vector database
are deliberately outside this feature's implementation scope.
