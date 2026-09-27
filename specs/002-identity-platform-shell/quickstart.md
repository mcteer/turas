# 002 validation guide

This is the local implementation runbook. Root `npm run dev` supervises Next.js,
eve and the Postgres maintenance worker. It does not connect to or deploy on
Vercel. Feature 002 was merged in
[PR 2](https://github.com/mcteer/turas/pull/2) after local and CI checks; hosted
application verification remains deferred.

## Prerequisites and configuration

- Node 24 and locked npm dependencies; local/disposable Postgres 17 with separate
  runtime and migration credentials. Never point tests at the old demo database.
- Retain eve's local Workflow storage between restart tests. Synthetic fixtures
  only; local live-model smoke needs existing AI Gateway access and incurs usage.
- CLI Playwright with WebKit; use the installed browser rather than host-browser UI.
- Planned server-only configuration in ignored `.env.local`: `DATABASE_URL`,
  `DATABASE_URL_UNPOOLED`, `TURAS_ENVIRONMENT_ID`, `TURAS_APP_ORIGIN`,
  `TURAS_DEMO_USERNAME`, `TURAS_DEMO_PASSWORD`, `PANEL_USERNAME`, `PANEL_PASSWORD`,
  `PARTNER_USERNAME`, `PARTNER_PASSWORD`, `TURAS_MAINTENANCE_SECRET`.
  Tests additionally need `TURAS_TEST_DATABASE_URL` and
  `TURAS_TEST_ENVIRONMENT_ID` pointing to an independently initialized disposable
  Postgres database. Provision `turas_runtime` with a unique password before
  applying `db:roles`; `DATABASE_URL_UNPOOLED` is the migration owner and
  `DATABASE_URL` is the restricted runtime login.
  Use a separately generated server-only maintenance signing secret; never put it
  in a browser variable or test fixture.
  Username values must be `mcteer`, `panel` and `partner`. Existing `AI_GATEWAY_API_KEY` supports
  intended local model calls. `.env.example` documents names/placeholders only.
- Migration/test scripts must load ignored local configuration without echoing it.
  CI receives disposable-test credentials, not demo or production credentials.

## Setup and checks

Run from the repository root:

```sh
npm ci
npm run db:init
npm run db:roles
npm run db:bootstrap-demo
npm run check:docs
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:contracts
npm run build:check
npm run dev
```

`db:bootstrap-demo` is explicit and idempotent; repeat execution must preserve revoked
grants/disabled accounts. All DB commands verify the configured environment marker.
`build:check` compiles Next.js and eve without claiming a deployable sandbox-prewarmed
bundle. Keep `dev:eve` for agent-only testing after the root dev command is composed.
The app's actual localhost address is printed by the dev server; configure UI tests
with that origin. Do not change the selected model just to get a smoke test to pass.

In another terminal, run CLI UI validation:

```sh
npm run test:ui -- --workers=2
npm run test:performance
```

The unit/integration/contracts/UI/performance commands are wired. Keep the
disposable test DB separate from the local demo DB. `db:migrate` applies new
manifested migrations after initialization; it refuses a wrong environment marker.
A WebKit project covers both themes and 390px/1440px widths. Capture sanitized
screenshots and keyboard results, not environment contents or authentication cookies.

## End-to-end scenarios

| Scenario | Steps and expected result | Spec |
| --- | --- | --- |
| Login | Sign in as each configured account, inspect identity, sign out; invalid/expired/disabled sessions deny access | SC-001 |
| Customer grants | Internal accounts see all workspace references, including a newly created one; partner sees only its assigned subset; mcteer revokes a partner grant and the affected account loses access without being able to restore it | SC-001–003 |
| Private history | Create one chat per account for a shared granted customer; use the other's domain/native IDs in reads/send/stream/cancel; all deny | SC-002 |
| Durable chat | Send, disconnect, reload, stop/restart dev server without deleting storage, reconnect; saved message and accurate progress remain | SC-004 |
| Lost acknowledgement | Inject transport failure after native admission; replay same request key; observe reconciliation and exactly one dispatched input | SC-004 |
| Revocation | Revoke during active and quiet streams; measure final protected byte within 30s; reconnect fails | SC-003 |
| Cancellation | Stop active response, observe requested then confirmed cancelled state with partial content; no fabricated completion | SC-004 |
| Accessible shell | Keyboard-only customer/chat/admin flows at both widths/themes; focus return, labels, contrast, no horizontal page overflow | SC-005 |
| Scale | Seed 1,000 chats split 400/400/200 across mcteer/panel/partner; run 20 authenticated sessions split 7/7/6, 30s warmup then 120s measurement, one request per endpoint/client/second, first page size 25; each endpoint p95 <=2s and zero unexpected errors/unauthorized rows | SC-006 |
| Recovery | Apply migrations to clean disposable DB; inject migration failure and recover; no prior acknowledged rows lost | SC-007 |
| Live local runtime | Enable the deliberate live smoke; run one synthetic turn per login through the actual eve/model path, reload and verify saved output | SC-008 |
| Data notice | All three accounts see scope notice before sending; fixtures labeled synthetic; supplied public research stays unapproved chat input | SC-009 |

Partner customer responses expose only the minimal delivery-safe reference (ID,
display name, synthetic label); test exact response keys and exclusion of internal
metadata. Internal access to every profile does not expose other users' chats.
Shared product knowledge is planned for 005/006: later tests must prove a partner
can use a sanitized published solution from an unassigned customer without seeing
that customer's identity, profile or original artifacts. Do not fabricate this
capability in the 002 demo or install unused knowledge integrations.

The opt-in live smoke runs with `npm run smoke:local:live -- --live`; it caps three
turns and requests cancellation at 120s per turn. Cancellation is cooperative;
report any overrun. CI
uses deterministic responses; it never quietly calls the paid model provider.

Separately run `npm run eval:behavior:local -- --live`. It refuses live calls
without that flag. Run the six versioned
[behavior cases](contracts/recovery-and-validation.md#representative-behavior-evaluations-c1)
twice each through authenticated application routes, with concurrency 1 and a
12-turn cap. Record actual responses, semantic scores/rationales and hard-gate
results; all 12 must pass. Record usage separately from the three-turn smoke.
Mocked responses and inventory assertions do not certify instruction behavior.
The command saves ignored local responses with null semantic scores. Review each
reply against the versioned rubric, enter a 0/1 score and rationale, then run
`npm run eval:behavior:verify -- local-artifacts/<review-file>.json`. Only the
reviewed file establishes the semantic acceptance count.

## Failure and recovery checks

- DB unavailable: readiness fails, protected actions deny/unavailable, no schema
  auto-creation and no in-memory authority fallback. Unsaved sends launch no model.
- Hook/projection outage: recover DB, run
  `npm run conversations:reconcile -- --conversation <UUID> --eve-origin http://127.0.0.1:<eve-port>/`
  while root dev is running. The eve port appears in root dev output. This
  replays native events for existing attempts without resending model input.
  Preserve `.eve/.workflow-data` with the matching database backup; do not
  delete or replace either side independently. Unknown native admission remains
  blocked and needs explicit operator inspection.
- Combined receipt/hook outage: lose the send acknowledgement and fail the hook
  DB write, restart, and repair from the persisted pre-dispatch cursor. Include
  earlier identical text and absent optional deliveryIds; prove no second dispatch.
- Watchdog: restart at 110s and 125s, kill a lease-holding worker, run two workers,
  disable the owner and lose a cancel acknowledgement. Verify the original turn
  alone is cancelled; a stale job cannot cancel a later turn. A missing worker
  heartbeat fails readiness/new sends after 15s. Test signature/nonce rejection.
- To check the real root-dev restart against a durable unconfirmed attempt without
  calling the model, run `npm run restart:synthetic:seed` while root dev is running.
  It prints a synthetic conversation ID and request key. At about 110 seconds from
  seeding, stop and restart `npm run dev` while preserving Postgres and
  `.eve/.workflow-data`. After the persisted 120-second deadline, run
  `npm run restart:synthetic:verify -- <conversation-id> <request-key>`.
  Verification requires the restarted worker to expose an operator-review state,
  one original attempt and zero native model inputs, then removes that exact
  synthetic domain fixture. The separate disposable integration test simulates
  t=110s and t=125s in fresh worker processes to test claim ordering. Neither
  test claims that an in-flight provider request survives eve dev's generation
  quarantine.
- Dispatch uncertainty: remain visibly reconciling if evidence is absent; do not
  release the claim on a timer and automatically run a second turn.
- Wrong environment marker: startup/readiness and migrations refuse cross-environment
  use. Reseeding does not undo the access changes exercised above.
- Expired sessions/rate windows: run `npm run auth:maintenance -- --prune` against
  the configured environment. After changing a demo credential in ignored
  `.env.local` and restarting root dev, revoke existing sessions with
  `npm run auth:maintenance -- --revoke-principal <login>`; a credential change
  alone does not end existing sessions. These commands report counts, never
  credential values.
- Rate/size limit: test thresholds from [plan](plan.md), get 413/429 or concurrency 409,
  and verify excess requests produce no model dispatch.
- Restore domain data and local Workflow data together in a disposable environment;
  verify owned history/continuation. Do not reset or wipe the source environment.

For a local paired-backup inspection, run
`npm run restore:demo:check -- --disposable --container <local-postgres-container>`.
It creates and drops a disposable Postgres clone, copies `.eve/.workflow-data` to a
temporary app, starts an isolated eve server against that pair, and verifies an
acknowledged turn, its projections, native run file and readable owned native
stream. It never changes the source database or Workflow directory. It checks
read continuation of a completed turn; active-turn resumption is a separate
local-runtime limitation while eve quarantines old development generations.

## Evidence and deployment hold

Record commands, versions, pass/fail, local origin, sanitized screenshots, measured
latency/revocation times and live usage in a feature validation record during
implementation. Readiness means evidence, not checked boxes in this planning guide.

The repo is disconnected from Vercel at the user's request. Do not reconnect it,
run eve link/deploy, alter project settings or trigger a manual deployment for 002.
Hosted verification remains explicitly deferred until replacement readiness and
subsequent authorization. At that stage verify the same route matrix and durable
behavior on an isolated target before any existing-app/domain cutover.
