# 003 validation guide

This is the acceptance run guide, not a record of checks already passed. The
synthetic profile seed, benchmark and 003 evaluation selector are implemented.
Independent story and human acceptance remain open. Actual results are in
[validation.md](validation.md).

## Prerequisites

Use Node 24, locked npm dependencies, local PostgreSQL 17 and installed CLI
Playwright/WebKit. Keep the existing isolated local database, separate migration
owner/runtime login and ignored `.env.local`. The [002 runbook](../002-identity-platform-shell/quickstart.md)
documents environment variables and initial setup. Never initialize over an existing
database or point a test at the reference demo database.

`TURAS_TEST_DATABASE_URL` must identify a distinct local `turas_test...` disposable
database; `TURAS_TEST_ENVIRONMENT_ID` starts with `test-`. Tests use the existing
fixture guard and reject the application database URL. Do not echo connection
strings or passwords. The three logins remain `panel`, `mcteer` and `partner`.

## Upgrade and run

From the repository root after implementing the planned files:

```sh
npm ci
npm run db:migrate
npm run db:roles
npm run db:seed-profile-demo
npm run db:seed-profile-walkthrough
npm run dev
```

Use `db:init` only for a new empty environment. The optional seed command uses
fixed request keys and a synthetic public-source snapshot, refuses hosted or
non-synthetic targets, and does not overwrite an existing accepted profile head.
It populates Juniper, which remains ungranted to the demo partner, with an accepted
claim, product use and six-dimension maturity assessment; Cedar stays sparse for
empty-state tests. The optional walkthrough command extends Juniper with two
workloads, 25 total accepted records, a high open risk, a next review action, a
Pending proposal and a confirmed contradiction. It prints stable record and
revision IDs for the participant log. Both commands are idempotent and accept
only local/test synthetic environments.

No live web research, attachment ingestion, external connector, reconnect or deploy
is part of setup. Preserve `.eve/.workflow-data` for restart checks.

## Automated validation

```sh
npm run check:docs
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:contracts
npm run build:check
npm run test:ui
```

Include the new profile cases in these existing commands. CI uses generated
credentials/disposable storage and deterministic model responses; it does not
consume a live model key. WebKit covers both themes and 390px/1440px widths.
The UI runner uses one worker because access scenarios mutate the same local demo
grants that other scenarios read.
Keep screenshots synthetic and sanitized; do not use the host browser.

The dedicated profile performance command uses a temporary clone of the
guarded test database and a separate local production web server:

```sh
node --env-file-if-exists=.env.local node_modules/tsx/dist/cli.mjs scripts/benchmark-profiles.ts --disposable --container turas-002-postgres
```

It seeds 100 synthetic profiles × 25 mixed records in that clone and measures
visible profile readiness with fixed observation dates and the local wall clock.
Run 10 sessions (4 internal employee,
4 admin, 2 partner), 30s warmup then 120s measurement at one profile open per session
per second. Report p50/p95/error count, authorized record counts and environment.
SC-007 passes at p95 <2s with no incorrect rows or unexpected errors; page limits
and source projection remain enabled. A controlled-clock run and simpler warmed
single-user baseline remain separate performance checks.

## End-to-end evidence

| Scenario | Steps and required outcome | Spec |
| --- | --- | --- |
| Canonical profile | Open customer/workload views and sparse profile as panel; verify accepted fields, explicit Unknown, independent product states and history | FR-001–003, SC-001 |
| All manual fields gated | Propose each typed record kind, including a name/product/maturity/risk edit; old accepted head remains current until exact approval | FR-008–011, SC-003 |
| Review authority | mcteer assigns panel stewardship; panel reviews only assigned customer; partner review and stale stewardship both fail; self-review remains attributed | FR-009 |
| Concurrency/retry | Race accepts, reject versus accept, approval versus access revocation, duplicate commands, reused key with changed body; one initial decision and no partial pointer change | FR-009–010, SC-003 |
| Retraction | Contributor requests withdrawal without changing context; steward/admin retracts, source becomes ineligible and no old revision returns as head | FR-010, SC-003 |
| Partner projection | Partner sees all accepted delivery facts regardless of contributor, own pending/rejected only; direct IDs, queries, counts, source links and rationales do not expose internal or other-customer data | FR-016–018, SC-002 |
| Private chat submission | Share one exact claim from owned chat; steward sees that claim, never surrounding conversation; spoofed message owner/span fails | FR-008, FR-016 |
| Maturity | One canonical root per scope, older-window acknowledgment, no retraction fallback, and competing keyed creations cannot produce duplicate roots/heads. Six independent states with required support, rubric, scope/window/owner/next capability; no averaged journey or promotion from delivery phase | FR-004–006, SC-004 |
| Research origin | Trusted public snapshot is attributed research; user URL/research-origin spoof stays pending or fails; unsupported private deployment claim is excluded | FR-012, SC-005 |
| Quality/age | Trace proposed rating inputs through exact approval and revision-only correction; verify unknown defaults, trusted ingest actor, forbidden client F/Q, date basis and private rationale projection. Test every score-band edge, all 7/14/30/90/180-day windows, 1/1.5/2-window F thresholds, unknown/future dates and overdue review cap with fixed clock | FR-013–015, SC-005 |
| Dependencies/conflicts | Withdraw support or confirm material contradiction; dependent assessment stays in history but is not settled guidance; hidden counterpart does not leak | FR-015, FR-018 |
| Context fence | Retract/reclassify during a turn and after compaction; test fresh and stale reconnect, tool call and history requests. No further unauthorized release; new conversation uses current context | FR-017–018 |
| Time-only expiry | Advance the clock without writes past validUntil, including the 24-hour cap; hide stale generated bodies/titles/snippets, retain authorized owner messages, and require an explicit fresh session without summary transfer. Apply the same policy to unbound 002 history; hidden internal changes do not invalidate partner context | FR-014, FR-018 |
| UI | Keyboard-only read/propose/review, mobile overflow, four theme/viewport projects, error/denied/loading/conflict and focus return; zero serious/critical axe issues | FR-019, SC-007 |
| Migration/recovery | Clean init and upgrade from 006 preserve grants/chats; wrong marker, failed migration and missing grants fail closed; restore disposable backup and reapply | FR-001, FR-020 |

For a guarded 006-to-current upgrade drill, run
`npm run upgrade:profile:check -- --disposable --container turas-002-postgres`.
It creates a temporary local database, applies 001–006, seeds synthetic identities,
a partner grant and an owned chat/message, then applies the current manifest.
It checks schema 013, stable grant/chat identity and the append-only profile
revision trigger before dropping the temporary database. No application database
is reset.

For a local backup/restore drill after `db:seed-profile-demo` and a completed
synthetic chat turn, run `npm run restore:demo:check -- --disposable --container turas-002-postgres`.
The script clones into a temporary database and checks a completed turn, the
accepted synthetic profile head and source count, the restored revision's
append-only trigger, and migration reapplication before dropping the clone. A
new login must receive 409 when it tries to replay the older login session's
native stream; the preserved event projection and workflow file prove the
history survived. It does not reset the application database.

Use the [HTTP](contracts/profile-api.md), [agent](contracts/agent-context.md) and
[UI](contracts/profile-ui.md) contracts as expected behavior, with the
[data model](data-model.md) for transitions and exact field meanings.

## Representative live behavior

The local 003 evaluation runner uses the existing 002 behavior path when no
feature selector is supplied. The implemented 003 command is:

```sh
npm run eval:behavior:local -- --feature 003 --live
```

Run six cases twice, sequentially: 12 application turns under a 14-completed-model-step
cap and 120 seconds per turn. The runner counts persisted `step.completed` events
after each response and stops if the total exceeds 14; it cannot prevent an extra
step already underway in the final response. Request cancellation on timeout and
record any overrun.
The current dataset covers accepted/source separation, maturity evidence gaps,
partner sparse context and cross-customer access, manual claim approval, and
assistant Pending proposal. It does not yet exercise a retraction between turns,
native compaction, or a research contradiction; those remain separate acceptance
gaps until live cases or deterministic tests cover them. Reuse the configured model
and existing key without printing it.
Record actual output, source fidelity, permission/review hard gates, timing and usage
with reviewer rationale. All hard gates must pass; unavailable live evidence stays
explicitly open rather than replaced by prompt-text assertions.

## Human walkthrough and reporting

Use five actual internal participants with the synthetic profile of two workloads
and at least 25 records. Time finding product use, known maturity, top delivery risk
and next review (three-minute target), then distinguishing evidence states and
reviewing a claim (two-minute target). With five people, a 90% criterion requires
5/5. Record anonymized results; do not invent participant evidence or claim a test
runner represents five people. Implementation may be technically verified while
these acceptance results remain pending, and validation.md must state that clearly.

Record commands, environment, actual results and limitations in a feature validation
artifact during implementation. Update README and roadmap with delivered behavior
only. There is no hosted acceptance, Vercel reconnection or deployment in 003.
