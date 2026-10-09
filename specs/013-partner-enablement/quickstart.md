# Quickstart: 013 Implementation Validation

This is a planned run guide. The feature-specific scripts below are implementation deliverables, not commands that exist or have passed during planning. Use Node 24 in the canonical `/Users/mcteer/Projects/turas` checkout, installed lockfile dependencies, Docker/local PostgreSQL and CLI Playwright WebKit prerequisites. Do not use a selected hosted database or create sibling worktrees.

## Select and inspect

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/013-partner-enablement
git status --short --branch
.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

Read the spec, plan, tasks and contracts before implementing. Preserve the chosen model and private state. Complete explicit migration 050/051 plus manifest updates; no application request may migrate schema.

## Owned validation commands (to implement)

```sh
npm run check:docs
npm run typecheck
npm run test:partners
npm run partners:ui:check
npm run partners:recovery:check
npm run benchmark:partners -- --disposable
npm run test:partners:regressions
npm run build:check
```

Every `partners` runner owns a synthetic environment using `scripts/partners-environment.ts`; it must refuse unowned targets and clean only its resources. UI runner supervises its own local app and all five declared files in all four WebKit projects. Do not invoke root `test:ui` against the operator's database. Benchmark respects production quotas and records pacing separately, so allow it to finish without trimming cases. Build verification uses the existing repository conventions and no deploy step.

## Expected walkthroughs

1. Partner with grant A only discovers A's paged work, opens its accepted plan, saves permitted plan/execution proposals and reads accepted support. Shared knowledge derived from B remains available without revealing B. A no-grant partner retains knowledge access.
2. Internal author drafts an A guide against an accepted baseline, submits it, and mcteer previews/publishes the exact revision. Partner reads what/how/why, prerequisites, alternatives, limits, validation, escalation and source/unknown details. Pending claims and internal sources fail publication; rejected changes leave the prior eligible published guide visible.
3. mcteer assigns a member, that member submits a demonstration, mcteer requests changes and then verifies a corrected attempt supported by accepted evidence. Prerequisites and required fraction are exact; another partner's attempt remains private. No maturity, skills or accepted execution state changes.
4. Revoke grant/member/organization, withdraw a shared original and replace a plan/guide with cleanup stopped. Reads/reviews fail immediately, browser clears protected bodies and rejects late replies. Reactivation and replacement require a new explicit assignment, starting at zero.
5. Lose acknowledgments before/after commit and reload. Status/resolve yields one outcome or permanently abandons an absent request under the admission fence. Late originals cannot commit after abandonment. Disable 013 and prove new work stops while reads, withdrawal, reconciliation and retention continue.

## Evidence and release

Follow [lifecycle-validation.md](contracts/lifecycle-validation.md) for exact manifests, security cases, load dataset, latency criteria and recovery. Store private diagnostics only in ignored `local-artifacts/013/`; write a content-free `specs/013-partner-enablement/validation.md` identifying final tested source, manifest digests, executed cases, results and limitations. Require no skipped/empty suites. Inspect synthetic screenshots for all four project layouts and run axe.

Update README, ROADMAP and `docs/partner-operations.md` with actual behavior, migration/flag requirements and forward recovery. Stop/disable is the rollback strategy; do not down-migrate or replace private data. Preview/Production rollout remains pending unless separately authorized and actually verified. Planning checks are not implementation acceptance.
