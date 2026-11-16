# Validation — Eve Runtime Peers

Date: 2026-11-16. Baseline: `cffceeb2`; branch: `023-eve-runtime-peers`.
Released as `70a5870f` through PR72; full CI and authenticated Preview/Production
acceptance pass. No schema change.

## Local Evidence

- Exact installed versions: AI7.0.172, Connect2.9.2, Eve0.91.0.
- Node24.21.0 used for final validation. Initial install used host Node26.8.2
  and reported the expected engine mismatch; subsequent checks use pinned Node24.
- New privacy tests initially failed on the absent policy module. Installed-SDK
  successful generate/stream and failing calls pass after wiring. They capture
  Node diagnostic spans plus integration callbacks, including tool input/output,
  raw provider metadata and caller-preserved text/usage. Four cases pass.
- Focused budget/cancellation/file-steering suite initially passed89cases/10files;
  final test counts and broader checks are recorded below when complete.
- Typecheck passes after correcting the test's telemetry callback names to the
  installed SDK's public interface.
- `npm run build:check`: PASS for Eve and Next production builds. Non-fatal
  unsupported skill-procedures/dynamic-import/pg-native trace and dynamic-require
  warnings remain; no sandbox prewarm or execution was performed.
- Plain `npm run test:unit`: initial run831cases with4failures in3files because
  this script does not load .env.local. Environment-loaded rerun recorded below.
- `npm run check:docs`: PASS before final evidence edits; repeated after edits.
- `git diff --check`: PASS.

## Hosted Evidence and Limits

`npm run preview:credentials:check`: PASS after `vercel whoami` refreshed the existing
authenticated CLI session. Preview inherits the Production credential record with
zero overrides. The earlier HTTP403 came from a stale token read directly by the script.

The initial Preview had an older generic database binding. The three existing sensitive
schema86 Preview bindings were moved from the previous feature branch to this branch,
preserving their values. The isolated database is distinct from Production; its schema
and runtime grants pass the repository assertion. Rebuilding exact source `2f2545fa`
produced [the accepted Preview](https://turas-85wubch30-turas-6e414af3.vercel.app).

- Authenticated HTTP and command-line WebKit customer-profile acceptance: PASS.
  Real profile data matches Production; desktop/mobile captures were inspected.
- Real-model ordinary chat: PASS, one completed attempt, response survives reload.
  The owned verification thread was archived and the session logged out.
- Preview database and admission are healthy/open. Maintenance samples report the
  previous code version because Preview has no Production cron; full operational
  readiness is not claimed. Production preflight is ready with healthy maintenance
  and schema86. Post-merge verification is recorded below.
- No credential values, private artifacts or customer data enter the commit.

## Release Contract

Current required schema remains86; no migrations/grants changes. Preserve existing
credentials, database and retained workflow state. Complete full CI and authenticated
Preview customer profiles/changed research checks with WebKit before merge and
maintainer review. Verify actual Production commit/schema and changed behavior after
release. Roll back code and lockfile together; preserve unknown provider holds/history.
PR56 closure and replacement delivery are recorded below.

Production preflight source is `9a4473b0`. Its delta to baseline `cffceeb2`
contains release documentation and disposable-test cleanup, including a new check
script command; no intervening application, agent, migration or deployment-config
change is pending. The runtime application delta is the reviewed023 peer/telemetry
change. Production schema remains86.

## Final Local Results

- Environment-loaded Node24 unit run: PASS830cases/182files. The earlier831-case
  run included a redundant source-wiring assertion subsequently removed; four
  behavioral telemetry cases remain. Command: same exclusions as test:unit, using
  `node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit`.
- Updated root audit matches baseline exactly:12findings (9low/3moderate), no high
  or critical findings and no newly introduced affected package. Remaining findings
  concern existing math/markdown/XML and migration CLI dependencies; outside PR56.
- The local unit/build checks made no paid provider requests. The later hosted
  ordinary-chat acceptance used one real model call; no schema migration was needed.

- Final focused installed-SDK/privacy/accounting suite: PASS88cases/10files,
  including19dependency-maintenance cases and4telemetry privacy cases.
- Final docs consistency: PASS287authored Markdown files; whitespace check passes.

## Existing Dependabot CI Finding

PR56 source `8bdac34d` has a failed
[expansion regression job](https://github.com/mcteer/turas/actions/runs/43904443371/job/133429775784).
The published diagnostic reports owned execution E04 cleanup failing with
`Disposable Eve retirement or custody unverified`, followed by retained-target
cleanup failure. The job log does not expose the nested custody/process cause;
no artifact containing it is available in the run's artifact listing at inspection.
This is unresolved CI evidence, not proof of a provider or dependency regression
and not waived by passing local unit/build checks. The replacement PR must pass
fresh full CI; investigate the nested owned-cleanup failure if it recurs.

- Node24 `npm ci --ignore-scripts`: PASS; exact lockfile installs591packages.

## Review and CI

Implementation commit: `8803afa65824280ac08b5e925e165416133df8fb`.
Replacement [PR72](https://github.com/mcteer/turas/pull/72) is ready for review.
The maintainer explicitly authorized merge once CI is green. Legacy backend parity
passes; full Turas checks pass on source `2f2545fa`. Attempt1 had three failing test jobs:
the product-gap benchmark measured p95 2008ms against its unchanged 2000ms limit, and
interrupted-dispatch cleanup repeated the existing aggregate retirement error. The
managed-workflow batch suite reported all11tests passing but a nonzero process exit.
The dependent execution aggregate and final CI result also failed. These
were not waived by hosted acceptance. T008 completed after the green rerun; T009
completed with the release verification and branch cleanup recorded below. The pre-existing
untracked legacy assessment file remains untouched and excluded.

The specific interrupted-dispatch case passes in a fresh local owned Postgres/Eve
environment (1 selected case; 7 deliberately unselected). It preserves unknown usage
across restart and verifies process retirement and exact-owned sandbox absence at
disposal. This local reproduction does not establish the cause of the CI failure or
replace a successful CI rerun. Selected development credentials/workflow state remain
unchanged, as verified by the disposable harness.

The complete managed-workflow batch suite also passes locally (11cases, successful
process exit and owned environment disposal), both directly and with the catalog's
nested fixture and JSON reporter. Its CI-only process failure remains
unexplained. The failed jobs passed on one rerun with the original checks and thresholds;
all other test jobs, including expansion regressions, passed in the first attempt.

Attempt2 product-gap benchmark: PASS with the original limits and production rate
controls. List p95 is1188ms (limit2000ms), detail p95 is80ms, review p95 is24ms;
each uses100samples and five concurrent readers. The execution rerun also passes:
131cases across31suites, zero failures or skips, including interrupted-dispatch
retirement. The deterministic catalog passes1081cases across192suites.

[Full CI run43922050736](https://github.com/mcteer/turas/actions/runs/43922050736)
concludes success with all56reported jobs successful. The companion
[legacy parity run43922050622](https://github.com/mcteer/turas/actions/runs/43922050622)
also concludes success (10reported jobs). No thresholds, cleanup guards or code
changed for the rerun. The subsequent acceptance-record update changes only
documentation; application/test inputs are unchanged and retain this Preview
acceptance under CONTRIBUTING.md. Its own required checks passed before merge.

## Production Release

PR72 merged as `70a5870f344d40a29c484448d8606497e1f812e8` after its documentation
head `87dee649` passed both workflows and Vercel. Both workflows also pass on the
merged source. No schema or runtime-grant change was required.

The first `eve deploy --non-interactive --yes` completed from a clean, isolated
checkout of merged main. Deployment metadata matched the merge, but authenticated
operations reported the historical fallback `378a590d`; this failed exact-source
acceptance despite healthy schema86. No model call was made and all three test
sessions logged out. The documented Git-source redeploy procedure was then used
with the exact merge SHA and existing Production project/settings/credentials.
Runtime identity must be checked separately from CLI upload metadata.

The task-owned deployment checkout was removed after successful process retirement.
Root model, .env.local and retained .eve/.workflow-data hashes are unchanged.
Dependabot closed PR56 automatically; both its remote branch and PR72's remote
branch are absent. The local023 branch was deleted and main's README was checked.

Git-source deployment `dpl_CBhxFUazp6STaS45x1BqCuHsyRBm` is READY and assigned to
`https://www.turas.dev`. Both provider Git source and authenticated runtime identity
match the exact merge SHA. Production project environment records are unchanged.
Acceptance completed at2026-11-16T20:43:38Z:

- Real browser-form login/session/directory HTTP checks pass for mcteer, panel and
  partner; the retired workspace selector is rejected. Partner's unassigned
  directory stays restricted. The apex redirects to the canonical domain.
- Authenticated operations: ready, dispatch ready, admission open, maintenance
  healthy, schema86, direct and effective restricted runtime identity verified.
- Real directory/profile requests, product source details and attributed evidence
  searches pass. Desktop/mobile profile captures were inspected. Search remains
  in its existing `lexical_degraded` mode.
- One real-model ordinary conversation completed in exactly one attempt and
  survived reload. Both other roles receive404 for this owner's conversation.
  Desktop/mobile chat captures and all three role captures were inspected.
- The owned verification conversation was archived; all three sessions were
  logged out and then returned401. The acceptance process exited successfully.
- Broader store/image/backup assurance remains unverified, as before this release;
  these checks do not establish disaster-recovery assurance. Telemetry content
  filtering is established by installed-SDK behavioral tests; hosted checks cover
  runtime compatibility, research retrieval and owner privacy without exporting
  customer telemetry or dispatching a new customer research job.

The release-record follow-up changes documentation only. It preserves the accepted
application/test inputs and requires its own documentation/CI checks before merge;
no second Production deployment is needed for that record.
