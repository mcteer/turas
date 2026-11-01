# Validation Guide: Eve Runtime Upgrade

This guide defines acceptance work. It is not a record that the new specialist
features or every command below have passed. Use Node 24 and an owned disposable
Postgres/runtime environment. Never load production credentials into fixtures.

## Planning and Static Checks

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/020-eve-runtime-upgrade
.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
npm run check:docs
```

After implementation, use the existing isolated test environment setup from
`scripts/check-legacy-parity-disposable.mjs`; it owns its database, app and cleanup.
Do not point database-writing tests at the selected development/production DB.

```sh
npm ci
npm run typecheck
npm run build:check
node scripts/check-legacy-parity-disposable.mjs --native-questions
node scripts/check-legacy-parity-disposable.mjs --native-staged-4
node scripts/check-legacy-parity-disposable.mjs --native-staged-10
```

The staged-10 owned runtime explicitly disables the SDK inline ownership lease
before execution and uses `eve dev --resume`; the input/deadline assertions stay
unchanged. This is local-world recovery evidence, separate from hosted acceptance.

Run file fixtures sequentially because their private diagnostic directory is
shared. Run builds sequentially because they share generated Eve output. Use the
full required CI suites after source is stable, including governed workflow
regressions; the narrow commands alone are not complete release acceptance.

## Specialist Acceptance Harness

Task T021 provides `scripts/check-specialist-continuity.ts` and integrates this flag
into the existing disposable controller:

```sh
node scripts/check-legacy-parity-disposable.mjs --native-specialists
node scripts/check-legacy-parity-disposable.mjs --chat-interaction
```

The command fails closed unless it owns the disposable database, native workflow store and fixture app. It uses
deterministic provider fixtures with real native workflows, not fabricated task
events. It verifies:

1. Each of the three specialists completes an initial request and two refinements
   with the same child/discussion, current per-call authority and cumulative usage.
2. Restart between refinements with the same owned database/workflow store.
   Recover identities without duplicate dispatch or renewed expiry/limits.
3. Deny another owner, conversation, customer or purpose; revoke a partner grant,
   withdraw a retained source and expire authority. Denied continuations make no
   provider call and cannot silently launch a new discussion.
4. Two different specialist tasks run concurrently. Stop one while the other
   completes. Verify actual parent-task/child terminal evidence and preserved
   usage, including completion racing with Stop and a lost cancel acknowledgement.
5. Duplicate call/result delivery is idempotent; a waiting question is shown as
   such. Global Stop, expiry and retirement prevent subsequent provider admission,
   including from an idle discussion. A result becomes available within five
   seconds of settlement and is handed to Turi once.

Run the new domain unit/contract/integration tests through the same owned test
setup, covering migration constraints, lock ordering, atomic reservation, unknown
usage and crash windows. The harness must clean only resources it created.

## UI and Hosted Preview

Extend existing CLI Playwright/WebKit coverage for task status and targeted Stop
on desktop/mobile in both themes, including keyboard navigation, reload and
draft preservation. Recheck the + menu, Customer selector, attachment flows and
rightmost send arrow. Use actual authenticated HTTP for data/control routes.

For Preview, record deployment ID and Git SHA, isolated database/Blob identity,
required schema and runtime grants. Run `npm run preview:credentials:check` to
verify inheritance of the existing sensitive production `mcteer` record. Do not
use the local `mcteer` password as a substitute. Credential metadata evidence and
an actual successful login are separate results; record any unavailable check.
Keep protection-bypass tokens in memory and out of URLs/logs.

After deterministic native gates pass, run a bounded representative hosted
specialist conversation using existing allowed Gateway models and enforced
accounting. Record real outcomes and gaps separately from fixture evidence.
No production promotion is part of the planning handoff.

## Migration and Release Gate

Rehearse explicit 082/083/084 migrations, grants and recovery on a disposable
copy of schema 081, plus 083 → 084 for current Preview. Verify rollback/forward
repair under the application's exact-schema readiness checks. Preserve old
bindings/history, private objects and accounting. Before any later production
release, verify target and backup, green CI, independent review and Preview
acceptance. Afterwards verify actual deployed commit/schema/grants and changed
authenticated behavior. Record results in `validation.md` when implementation
begins; planned commands are not passing evidence.
