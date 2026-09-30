# 006 implementation and validation guide

This runbook describes the in-progress implementation gates. Actual results are
in [validation.md](validation.md); commands listed for later tasks are not proof
that those gates have run. Never run disposable checks against the Preview
application database.

## Select and inspect the feature

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/006-delivery-plans
.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
npm run check:docs
```

Read [spec](spec.md), [plan](plan.md), [research](research.md),
[data model](data-model.md) and all [contracts](contracts/plans-api.md). Check the
current branch and working tree. Resume on `006-delivery-plans`; preserve existing
user changes. Feature 006 implementation is authorized and remains unfinished.

## Environment preparation for implementation

Use Node 24 and the existing lockfile. Keep ignored `.env.local`, `.eve`, private
artifact stores and credentials out of outputs and commits. Preserve the selected
Turi model and reasoning. Use synthetic customers and public sources only.

The current app is on the fresh Neon Preview database with marker
`preview-neon-005` and validated schema 031 after the explicit 006 upgrade.
Preserve that marker; a feature number does not require rebuilding the database.
The original Preview database with legacy tables and the live Production
database remain untouched.

1. Run `npm run db:inspect-preview` before any app upgrade. Inspect the final
   credential-free JSON for reachable=true, matching marker and expected schema.
   If sandbox DNS fails, obtain that final JSON line from the user's terminal.
2. Verify `TURAS_TEST_DATABASE_URL` and `TURAS_TEST_ENVIRONMENT_ID` with the existing
   test guard. The target must be a separate marked disposable database; a missing
   URL does not authorize fallback to `DATABASE_URL`.
3. New 006 isolated runners must create temporary databases from that marked test
   source, private app/store/eve directories and scoped environment variables.
   They destroy only resources created for their run. Copy and migrate the clone
   to 031 explicitly; never reset/migrate the Preview app as part of a test runner.
4. Keep `.eve/.workflow-data`, database and private store paired during restart
   drills. Use the Neon path; the removed local Postgres containers are not needed.

No Vercel reconnection/deployment or Production connection is allowed in this slice.
The planning work itself does not need to inspect or migrate a database.

## Deterministic gates after implementation

```sh
npm run typecheck
npm run test:plans
npm run build:check
npm run check:docs
```

`test:plans` uses a guarded disposable target. Its fixed suite list includes
files that are still being implemented, so do not report the whole command as
passed from focused results. Run relevant prior profile,
artifact, retrieval and conversation regressions once because 006 changes their
context projection. Report which suites ran; do not replace the 006 gates with
only a repository-wide green summary.

## Primary synthetic journeys

- **US1 manual plan**: create customer/workload-scoped plan; save incomplete sections;
  add source-backed assertions, diagram, alternatives, milestones and discovery
  actions; submit and reload. Unsafe markup, cyclic dependencies and bad ranges fail.
- **US2 Turi proposal**: start a fresh planning session for a known plan/base revision;
  verify audience/workload in the first context and all tools; persist a cited draft.
  Cancel, expire, lose an acknowledgement and retry a tool safely. Inspect the saved
  receipt; no hidden external search or acceptance occurs.
- **US3 decision**: reviewer previews the exact version and source state, accepts
  with rationale, opens one customer engagement and milestone baseline. Replay the
  same request and race different keys. Member/partner decisions, expired previews,
  wrong-scope engagement and changed sources fail without partial acceptance.
- **US4 replacement**: propose changed scope/milestones, inspect deterministic diff,
  request changes, repair and accept. The engagement remains the same and older
  baselines remain. Pause maintenance and withdraw a shared source or customer fact;
  affected detail/title/diff/baseline/tool/replay is withheld on the next read.
- **M1 journey**: review a synthetic source via 003/004, retrieve it in 005, create
  and accept the plan in 006, then inspect the exact canonical baseline. Use actual
  review transitions; direct fixture insertion cannot claim this end-to-end flow.

## UI, performance and recovery

```sh
npm run plans:ui:check
npm run plans:benchmark -- --disposable
npm run plans:recovery:check -- --disposable
```

These three commands are **new**. CLI Playwright/WebKit uses the four established
viewport/theme projects, keyboard and axe checks plus synthetic screenshots.
The performance runner seeds only its disposable clone and implements the corpus,
concurrency, sample counts and pass rules in
[lifecycle/validation](contracts/lifecycle-validation.md).

Recovery validates empty setup, 028→031, disable-intake mode, paired restart,
accepted baseline/receipt survival and an uncertain in-flight turn without duplicate
provider dispatch. Never delete the app's state to make recovery pass. CI uses
its own ephemeral Postgres and an isolated 006 app; unavailable live gates remain
separate from CI success.

## Bounded live Turi evaluation

```sh
npm run eval:plans -- --live --disposable
npm run eval:plans:verify
```

Both commands are **new**. Run the actual selected model and reasoning, actual
planning limiter and eight cases P01–P08 on a temporary test clone. Review the
captured outputs and persisted proposal receipts using the 0–2 rubric and hard
gates. Suite budget: eight cases, six model steps per case, 4096 output tokens per
step, 120-second deadline for a durable saved or terminal drafting result,
and 20-minute suite deadline. A saved proposal may wait for its chat
acknowledgment; measure the saved result from the durable dispatch timestamp,
and allow up to five minutes for terminal reconciliation. Record real
usage for every settled model step; a cancelled in-flight P08 step retains its
started receipt and unknown usage, never invented token totals. Missing settled
usage cannot pass. Do not automatically repeat failed paid cases. Keep
outputs in ignored `local-artifacts/006/`; commit only sanitized aggregate evidence.

## App upgrade after disposable acceptance

The 006 disposable migration/recovery, relevant tests, live review and UI gates
passed. The selected Preview marker was inspected at schema 028, then explicit
`npm run db:migrate` and `npm run db:roles` upgraded it to 031. Read-only
reinspection and a non-destructive local app smoke passed. For any future
upgrade, inspect the selected app database first and rerun the same gates. No
reset, seed teardown or destructive test is allowed on the app DB. This is
local application/Neon verification, not hosted app acceptance or a release.

If rollout fails, set `TURAS_006_DISABLED=1`, keep populated tables and diagnose
without changing Production. Apply a reviewed forward fix; use a matched snapshot
only with verified target and preserved artifact/native state. Record the result in
`specs/006-delivery-plans/validation.md` during implementation, with local, CI, live,
Preview database and hosted evidence clearly distinguished.
