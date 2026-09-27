# 003 validation guide

This is the acceptance run guide for implementation, not a record of checks already
passed. New profile seed/benchmark scripts, tests and the 003 evaluation selector
below are implementation targets. Planning does not create them.

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
node --experimental-strip-types --env-file-if-exists=.env.local scripts/seed-profile-demo.ts
npm run dev
```

Use `db:init` only for a new empty environment. The seed command uses fixed synthetic
IDs and public-source snapshots, refuses non-local/non-synthetic targets and never
overwrites reviewed content, grants or disabled identities. It includes Cedar with
two workloads, one ungranted synthetic customer, all record kinds, own/other pending
claims, accepted delivery facts from different contributors, internal operations
sentinels, dated research, conflicting sources and a sparse profile.

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
npm run test:ui -- --workers=2
```

Include the new profile cases in these existing commands. CI uses generated
credentials/disposable storage and deterministic model responses; it does not
consume a live model key. WebKit covers both themes and 390px/1440px widths.
Keep screenshots synthetic and sanitized; do not use the host browser.

The dedicated profile performance command is an implementation target:

```sh
node --env-file-if-exists=.env.local node_modules/tsx/dist/cli.mjs scripts/benchmark-profiles.ts
```

It must use the disposable test environment, seed 100 synthetic profiles × 25 mixed
records, preserve actor/grant distribution and measure visible profile readiness
with a controlled local clock/data set. Run 10 sessions (4 internal employee,
4 admin, 2 partner), 30s warmup then 120s measurement at one profile open per session
per second. Report p50/p95/error count, authorized record counts and environment.
SC-007 passes at p95 <2s with no incorrect rows or unexpected errors; page limits
and source projection remain enabled. Keep a simpler warmed single-user baseline
so startup time and steady-state behavior are distinguishable.

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
| Maturity | Six independent states with required support, rubric, scope/window/owner/next capability; no averaged journey or promotion from delivery phase | FR-004–006, SC-004 |
| Research origin | Trusted public snapshot is attributed research; user URL/research-origin spoof stays pending or fails; unsupported private deployment claim is excluded | FR-012, SC-005 |
| Quality/age | Test every score-band edge, all 7/14/30/90/180-day windows, 1/1.5/2-window F thresholds, unknown/future dates and overdue review cap with fixed clock | FR-013–015, SC-005 |
| Dependencies/conflicts | Withdraw support or confirm material contradiction; dependent assessment stays in history but is not settled guidance; hidden counterpart does not leak | FR-015, FR-018 |
| Context fence | Retract/reclassify during a turn and after compaction; test fresh and stale reconnect, tool call and history requests. No further unauthorized release; new conversation uses current context | FR-017–018 |
| Time-only expiry | Advance the clock without writes past validUntil; old conversation cannot resume stale guidance and fresh context displays current age | FR-014, FR-018 |
| UI | Keyboard-only read/propose/review, mobile overflow, four theme/viewport projects, error/denied/loading/conflict and focus return; zero serious/critical axe issues | FR-019, SC-007 |
| Migration/recovery | Clean init and upgrade from 006 preserve grants/chats; wrong marker, failed migration and missing grants fail closed; restore disposable backup and reapply | FR-001, FR-020 |

Use the [HTTP](contracts/profile-api.md), [agent](contracts/agent-context.md) and
[UI](contracts/profile-ui.md) contracts as expected behavior, with the
[data model](data-model.md) for transitions and exact field meanings.

## Representative live behavior

Extend the existing opt-in evaluation runner with a 003 dataset selector and retain
its existing 002 behavior. Planned command after implementation:

```sh
npm run eval:behavior:local -- --live --feature 003
```

Run six cases twice, sequentially: 12 case runs, at most 14 model turns total
(the retraction case uses two turns per run), and 120 seconds per turn;
request cancellation on timeout and record any overrun. Reuse the configured model
and existing key without printing it. Cases: accepted fact with citation; pending
structured edit; user-URL origin laundering; partner hidden-operations request;
research contradiction/unknown support; prior accepted fact retracted before the
next turn. Exercise context changes after native compaction deterministically too.
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
