# 008 implementation and validation handoff

**Implementation in progress.** T001–T058 have local checkpoint evidence in
[validation.md](validation.md). Commands and gates below describe the complete
feature target; an implemented command or a narrow pass does not establish a later
gate. Full regression, load, recovery, live-output and Preview gates remain pending.

## Resume

```sh
git switch 008-engagement-execution
export SPECIFY_FEATURE_DIRECTORY=specs/008-engagement-execution
.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

Read AGENTS.md, README, CONTRIBUTING, constitution, spec/plan/tasks and contracts.
Preserve the selected model in `agent/agent.ts`. User confirmed mcteer-only review;
panel proposes, partners submit own delivery activity/time under current grants.
Do not start reporting/009, connect Vercel or deploy.

## Prerequisites and owned environment

Use Node 24, locked dependencies, local Postgres 17 and CLI WebKit. Existing scanner/
parser prerequisites still apply to the real reviewed artifact→plan journey. Reuse
synthetic fixtures only. Never print credentials from ignored configuration.

New `scripts/execution-eval-environment.ts` owns unique disposable DBs, runtime and
cleanup roles, private artifact store, worker heartbeats, application ports and Eve
workflow directories. Clone only the marked test source using existing identity and
cleanup checks; never reset/migrate the configured app DB. Production URLs are only
guard comparisons and are never contacted. A fixture creates schema 034 explicitly
from the manifest, validates representative 006/007 state, then upgrades 036–038.
A separate empty fixture exercises 001–038. Do not borrow 007's prior-schema selector.
Only delete resources whose generated ownership marker matches the wrapper's receipt.
Private captures live in ignored `local-artifacts/008/`, unique per run, mode0700
folders/0600 files. Keep failure evidence; do not overwrite a previous passing run.

## Deterministic gates — new commands

```sh
npm run test:execution
npm run test:execution:regressions
npm run execution:ui:check
npm run benchmark:execution
npm run execution:recovery:check
```

- `test:execution`: owns every `execution-*.test.ts` unit/contract/integration suite,
  fails missing/orphaned/duplicate/skipped tests, validates actual assertion counts,
  and records the unchanged source digest. No CLI database/path override. Isolate
  suites where immutable history or actor-rate fixtures would otherwise conflict.
- `test:execution:regressions`: run affected 002–007 identity/customer/source/artifact/
  retrieval/plan/staffing/native release suites in their matching owned fixtures.
  Generic contract/integration and legacy UI selectors exclude 008; dedicated CI
  invokes 008 separately. Absence of 008 from the legacy runner is not test coverage.
- `execution:ui:check`: discover every execution case in all four WebKit projects;
  execute each exactly once with zero skips/retries/flaky cases, keyboard and axe,
  visual screenshots and390 px overflow checks. Source digest before/after must match.
  Completion evidence requires execution results, not just discovery.
- `benchmark:execution`: own synthetic representative data; no live model. Dataset:
  1,000 engagements, 500 resources, 50,000 time revisions, 20,000 execution-record
  revisions, 10,000 decisions. Five concurrent users; ten warmups then 100 measured
  calls **per class**. Classes: overview, records page, own-time page, review queue,
  summary, utilization, command receipt and time-review acknowledgement. Warmups
  and writes use distinct keys/eligible rows; never benchmark cached replay instead
  of a new atomic review. Spread actors/windows in synthetic setup to stay within
  documented rates without disabling production rate checks. Every class p95≤2s,
  zero correctness/authorization failures; report dataset, timings and sample count.
- `execution:recovery:check`: matched DB/artifact/Eve state restart around committed
  time correction/lost acknowledgement, leased source purge/newer revision, baseline
  replacement, provider dispatch/cancel, receipt and unknown usage settlement.
  Explicitly test disabled intake while cancellation/settlement/cleanup still work.
  Restore only owned matched sets; retain approved minutes/current payload/receipts,
  no duplicate paid dispatch, metadata-only telemetry and verified cleanup.

### Required functional evidence

1. Establish a real reviewed source/profile/artifact, accepted 006 plan/baseline,
   reviewed 007 resource/calendar and confirmed allocation through governed APIs.
   Submit activity and time; mcteer accepts exact revisions; accept milestone with
   evidence, review handoff acknowledgement and closeout. No direct approval seeding
   in this journey. Benchmarks may bulk seed history but cannot stand in for it.
2. Denial sentinels: partner hidden customer/internal evidence, panel review, other
   contributor time, inactive subject, expired session/grant, pending text, rates,
   private leave/personnel. Revoke after render/stream consumption and before replay.
3. Race first approvals across customers, two corrections/reversal on one head,
   moved-date/resource correction and rollback after ledger changes. No double
   counting/partial batch;1440 cap exact at boundary. Replay rechecks current access.
4. Independent arithmetic values cover every vector in the calculations contract.
   Never use the production calculator to generate the expected values.
5. Review RAID/decisions/scope change, accept replacement through 006, explicitly
   reconcile mapped/retired/added keys; history retains minutes and acceptance does
   not transfer. Missing budget/ETC/calendar/acknowledgement remains explicit.
6. Empty and034 upgrades plus runtime-role denials, narrow cleanup grant and no
   request-time migration. Older feature readiness remains unchanged below 038.

## Live explanation gate — new commands

Only after complete deterministic/regression/UI/load/recovery/type/build/docs gates
pass at the same source digest; the runner verifies that preflight evidence and
fails absent/stale evidence. No bypass or mock replacement. Preflight provider keys
are stripped. An explicit available local provider key is required for live work.

```sh
TURAS_ALLOW_LIVE_MODEL_TESTS=1 npm run eval:execution -- --live
npm run eval:execution:verify -- /absolute/path/to/private/review.json
```

Run E01–E08 in [advice contract](contracts/advisory-context.md), once each: eight
initial turns maximum, 120 seconds/attempt, 6 steps, 6 reads, 4096 output tokens/step,
24576 UTF-8 context bytes, 200 dependencies. Live setup/turns get20 minutes total after
preflight verification, using remaining time for each child. Cleanup still runs
after deadline. Use separate owned case fixtures or explicit distinct actors so
five/hour admission is genuinely enforced rather than bypassed. No automatic paid
retry. A failed case remains failed evidence; a later explicitly initiated run has
its own identity and captures.

Capture actual context/tool/native events/output/usage and before/after domain
receipts. Only fixture-declared human withdrawal/correction/cancel actions may change
state during a case; advice writes fail regardless of narrative quality. Save an
unscored `review-pending.json`; read every actual output/capture and independently
check numbers and exact evidence before completing a separate digest-bound review.
Verifier rejects absent/duplicate cases, mismatched digests, missing native bounds,
unsupported scores and unknown usage recorded as zero. Record genuine unavailable
or failed gates; do not fill in expected results as actual observations.

## Build, CI and eventual Preview

```sh
npm run typecheck
npm run build:eve:check
npm run build:web:check
npm run check:docs
git diff --check
```

CI runs the complete deterministic feature/regression/UI gates in isolated resources;
paid live review remains an explicit local gate. Keep native mocked lifecycle tests
in CI. Implementation creates `validation.md` with command, exact source digest,
synthetic environment identity, assertion/matrix counts, benchmark per-class result,
evaluation review digests, runtime limits, failure/rerun and cleanup evidence.

Only after all required gates pass, inspect the configured Preview read-only with
`npm run db:inspect-preview`. Historical schema 034 is not a fresh observation. Check
marker/schema, then explicitly migrate 036–038 and apply roles using existing
`db:migrate` / `db:roles` commands, reinspect and perform non-destructive local app/
Eve/runtime-readiness smoke. An unexpected identity or schema requires reconciliation
before writing; Production is never a fallback. No seed/load/destructive test against
Preview. No Vercel link/deploy or hosted readiness claim follows from a DB upgrade.

Disable new execution intake via `TURAS_008_DISABLED=1` while preserving current
eligible reads, cancellation, settlement and cleanup. Prefer a forward repair; any
restore must pair DB/private artifacts/Eve workflow state and use verified ownership.
Update README/ROADMAP honestly in the implementation PR. Do not merge without the
user's instruction; after a successful authorized merge, close PR/delete feature
branches and verify README on main per repository policy.
