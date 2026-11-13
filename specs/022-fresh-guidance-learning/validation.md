# Fresh-guidance validation

Date: 2026-11-13. Branch: `022-fresh-guidance-learning`. Base: `dd3e943d`.
Status: local implementation; draft review. Actual-agent and hosted acceptance
remain open. No selected database, Production schema or deployment was changed.

## CI failure follow-up

The first CI run exposed three regressions. Additional root instructions exceeded
the learning workflow's cumulative24KiB input limit; concise equivalent instructions
now retain that limit. Immutable references from released pre086 code omit the new
optional deadline; partner metadata comparison now preserves their original shape
while validating supplied deadlines and retaining source/quality fences. The
specialist rate test now fixes its clock during the burst so a real minute boundary
cannot split its requests across two windows.

Local follow-up passed: learning native25 checks (real Eve execution with a synthetic
provider, zero paid calls), partner empty→86 and released049→86 recovery/restarts,
specialist-discussion16 integration cases and TypeScript typecheck. These synthetic
native checks do not establish actual-model answer quality. Fresh broad CI is required.

Recovery compatibility audit also retains85 explicitly in historical capture,
archive, denial, safety-copy/restore readers and the owned prior-schema harness.
Current application readiness still requires86 and unknown future schemas remain
rejected. Nine recovery contract tests and the populated85→86 rehearsal passed;
the rehearsal now also reads the actual85 safety boundary before migration.

The hardening runner's case inventory was updated from eight to nine recovery
contract cases and registers the new case under its recovery gate. Its actual JSON
test report passed verifyPilotSuiteResult (9 passed, no skipped/flaky cases).
Native-file failure diagnostics now read the application's nested error.code.
An isolated local10MiB browser-composer case passed upload, interruption recovery,
quota release, byte fidelity and reload after the CI setup503; no production bound
or timeout was relaxed.

## Hosted Preview preparation and first acceptance

An isolated Neon branch `br-cold-fog-awm3jjip` was cloned from Production85 with
an endpoint-free pre086 backup `br-dawn-cell-awfczxx1`. Explicit migration/grants
moved only that new branch to86. Preview bindings are restricted to this Git branch;
the existing Production mcteer credential record remains shared with Preview and
has no password override. The new isolated database has a separate runtime login
credential; no parent/Production credential was changed.

Authenticated actual-data HTTP and desktop/mobile WebKit checks passed against
`cf1a8835acff40145dfbfefa7ece7599450fe8e0` at
https://turas-btutghhuu-turas-6e414af3.vercel.app and its Git branch alias. Directory
and retained research comparisons matched Production. Desktop/mobile captures were
inspected. Private evidence: local-artifacts/022/preview-check. This precedes the
test-inventory follow-up; verify the final deployed commit separately before merge.

## Local evidence

All commands use Node24 (24.21.0 on this host). Database checks create owned
loopback pgvector containers, synthetic accounts and isolated workflow directories.
The harnesses preserve the selected environment and remove their owned containers.

| Check | Result / established behavior |
| --- | --- |
| `node --import tsx scripts/test-guidance.ts` | 39 focused Vitest cases across current/history boundaries, retention, persistence/reuse, source fences, plans and MCP. Includes the migration rehearsal below. |
| `node --import tsx scripts/check-guidance-migration.ts` | Populated85→86, conservative backfill of account/workspace references, fallback for a removed original attempt, runtime grants, backup/restore and restart passed. |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed. |
| `node --import tsx scripts/learning-build-check.ts` | Owned Eve and Next production builds and local readiness passed. No hosted proof. Subsequent changes were SQL grants, test/CI wiring and documentation; application TypeScript and authored agent inputs were unchanged. |
| `node --test .github/ci/change-scope.test.mjs` | 25 passed; new migration CI step retains conservative scope selection. |
| `node scripts/check-docs.mjs`, `git diff --check` | Passed;277 authored Markdown files and tracked-file hygiene checked. |

The focused runner covers these specific regressions:

- Exactly seven days remains eligible; more than seven days, unknown/future dates
  and earlier review deadlines exclude current support while preserving the quality
  rubric and explicit historical reads. Reading again does not reset original age.
- Old high-ranking passages cannot crowd fresh evidence out of candidate limits.
  Public references use authoritative snapshot dates and recheck eligibility.
- Current public-reference consumption persists in PostgreSQL. Expiry blocks
  continued output; context refresh marks references historical, repeats the notice
  on later model steps and allows a newly validated read to renew the dependency.
- Shared quality inherits original-source freshness internally without adding a
  private timestamp to its public quality. MCP v1 strict response shapes still parse.
- Two cleanup passes remove101 retired source copies despite earlier empty source
  identities. Current and grace-period controls remain; source audit identities stay.
- Existing checked research persistence, cache reuse, withdrawal and plan/MCP access
  checks continue to pass. This does not establish automatic model tool selection.

The rehearsal exposed two grant paths: generic role setup grants DELETE to all
tables, and restoring tables under existing owner default privileges can restore
that broader permission. Migration086 and role setup now explicitly restrict the
new table to SELECT/INSERT/UPDATE; owned restore reapplies the role policy before
runtime resumes. Verification checks these privileges again after restore/restart.

## Acceptance still required before merge/release

FR-003 / SC-002 are **not yet accepted**. Automatic research uses Turi's existing
model-driven tool orchestration. Instructions and schema tests do not demonstrate
that the actual agent selects and completes the tools correctly.

Run representative actual-agent requests against the exact proposed commit:

| Scenario | Required observation |
| --- | --- |
| Recent checked evidence | Reuse with attribution; no unnecessary new research. |
| Eight-day-old or missing support | Automatically prepare and launch the matching admitted specialist, then read its actual result. |
| Equivalent active/recent research | Join/reuse; no duplicate or forced-refresh loop. |
| No newer evidence | State the gap; never silently treat history as current. |
| No authorized customer / exhausted budget / provider failure | Explain the actual limit; no invented scope, false completion or unbounded retry. |
| Long conversation crossing expiry or upgrade | Preserve conversation history and authorization, refresh active support and retain withdrawal checks. |

Required broad CI, maintainer review, authenticated exact-commit Preview checks
(including the repository's Customer Profiles check), and subsequently authorized
Production HTTP/CLI-WebKit checks remain outstanding. No Preview URL, deployed SHA
or hosted result is asserted here. This draft is not a completed release.

## Release order and recovery

The code requires schema86; the preceding release requires85. Confirm the target's
actual marker and a verified recovery set before release. Use a coordinated
maintenance window: stop new work, preserve workflow state, back up, explicitly
migrate85→86 and apply runtime grants, switch to matching code, then verify schema,
authorization, current/history reads and a real conversation before reopening.

Existing retained public-practice references are backfilled as needing a fresh
read because their original intended use was not recorded. The withdrawal ledger
remains intact. Prefer forward repair; code-only rollback against86 is unsafe.
Restore a matched code/schema recovery set and reapply runtime grants before
serving requests. A local PostgreSQL restore does not prove hosted workflow replay.
