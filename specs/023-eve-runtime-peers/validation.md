# Validation — Eve Runtime Peers

Date: 2026-11-16. Baseline: `cffceeb2`; branch: `023-eve-runtime-peers`.
Implementation is under validation; release is pending.

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

`npm run preview:credentials:check` fails: Vercel credential metadata HTTP403.
No secret values were downloaded or printed. Existing credentials and settings remain.
Authenticated Preview acceptance, inspected CLI WebKit captures, full CI, maintainer
review, merge and exact Production verification are pending. No deployment or
schema change was performed. No hosted privacy/behavior success is claimed.

## Release Contract

Current required schema remains86; no migrations/grants changes. Preserve existing
credentials, database and retained workflow state. Complete full CI and authenticated
Preview customer profiles/changed research checks with WebKit before merge and
maintainer review. Verify actual Production commit/schema and changed behavior after
release. Roll back code and lockfile together; preserve unknown provider holds/history.
Leave PR56 open until replacement delivery is established.

## Final Local Results

- Environment-loaded Node24 unit run: PASS830cases/182files. The earlier831-case
  run included a redundant source-wiring assertion subsequently removed; four
  behavioral telemetry cases remain. Command: same exclusions as test:unit, using
  `node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit`.
- Updated root audit matches baseline exactly:12findings (9low/3moderate), no high
  or critical findings and no newly introduced affected package. Remaining findings
  concern existing math/markdown/XML and migration CLI dependencies; outside PR56.
- No paid model request, operational job, migration or sandbox execution was run.

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
