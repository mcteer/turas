# Glob cancellation security follow-up

## Scope and decision

Investigated Dependabot alert 30 (GHSA-3g3m-2fjr-6pw4). The root lockfile
resolves node-pg-migrate 9.0.0 → glob 13.0.6. The published migration runner
still requests `~13.0.0`. Use the compatible 13.0.7 backport, not an untested
cross-major override to 14.0.2. No schema, runtime grants, account, Eve, model,
or hosted configuration changes are included.

The published 13.0.7 tarball has immediate `return cb()` cancellation branches
in walkCB, walkCB2, walkCBSync and walkCB2Sync, matching the advisory's recommended
repair. This is a one-patch update under FR-001 and US1 of the existing spec;
it does not require the major-upgrade capability-adoption workflow.

GitHub currently reports the affected range as >=9.0.0 <=14.0.1 and first
patched version 14.0.2. Consequently its metadata still includes this backport.
Do not dismiss the alert or claim GitHub has cleared it. Recheck advisory
metadata after review; upstream advisory correction or a separately specified
major upgrade may remain necessary.

## Acceptance and actual evidence

- Lockfile-only update: glob 13.0.6 → 13.0.7; unchanged consumer and dependencies.
- Node 24 clean install (`npm ci --ignore-scripts`) passed. Lifecycle scripts were
  intentionally not run for this narrow dependency check.
- Vitest: tests/unit/glob-cancellation.test.ts and migration-manifest.test.ts:
  2 tests passed. Synthetic recursive migration discovery and async/sync
  cancellation during traversal filtering are covered, including a wait for
  unwanted background continuation. This is not a database migration rehearsal.
- npm audit still exits nonzero (11 findings: 8 low, 3 moderate); the advisory
  range discrepancy is not hidden. No blind `audit fix --force` was applied.
- CI, maintainer review, merge and hosted release checks have not run for this
  follow-up. No Production remediation or GitHub alert closure is claimed.

Rollback: revert the lockfile commit if compatibility fails; that restores the
known vulnerable version and is not a security resolution. No database rollback
is required. Other open Dependabot PRs (56, 63, 64, 65) remain separate work;
major action/runtime upgrades must pass the dedicated-spec gate.
