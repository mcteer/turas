# Validation Quickstart: Product Expansion

The local implementation and command interfaces are available. Run acceptance checks only against a marked synthetic source and owned disposable clones. Preview and Production migration/release require separate authorization. See `validation.md` for actual results and outstanding gates.

## Environment and setup

1. Use the `011-product-expansion` worktree based on current main and Node24. Set
   `SPECIFY_FEATURE_DIRECTORY=specs/011-product-expansion` for every Spec Kit command.
2. Read the spec/contracts and evidence/design policies. Preserve root agent model,
   current `.env.local`, selected database, `.eve/.workflow-data` and unrelated work.
3. Use `npm ci` and the existing installed framework task docs. No dependency upgrade
   or external integration install is part of this slice.
4. Configure a separate marked PG17/pgvector test source; owned runners create their
   own clones/app copies/private artifact and workflow roots. Do not copy Production
   customer data. `.env.example` documents names only. The `011` owned environment infrastructure creates isolated test copies.
5. Recheck migration numbers; validate empty and prior schema045 upgrades, exact
   manifest hashes and runtime grants on disposable databases. Never migrate in a handler.

## Required command sequence after implementation

```sh
npm run check:docs
npm run typecheck
npm run build:check
npm run test:expansion
npm run expansion:native:check
npm run expansion:native:check -- --interrupted
npm run expansion:ui:check
npm run benchmark:expansion
npm run expansion:recovery:check
npm run test:expansion:regressions
```

Runners discover all 011 tests, compare manifest/counts, reject skips/retries and bind
receipts to source digest, lockfile, schema and fixture identity. Deterministic CI
has an empty model key, pinned PG17 image, isolated DBs and no live sends. The UI
runner executes all four WebKit projects against its already-owned app. Save
sanitized captures and inspect desktop/mobile layouts; do not operate the host browser.
Regression selection covers 002 privacy/archive/native lifecycle, 003/005 sources,
006 plans, 008 execution and 010 support; keep older cohorts from acquiring 011 tests.

## Human journeys and expected results

1. US1: Author one supported and one public-only synthetic proposal. Inspect exact
   citations/unknowns and alternative/current-practice choice; neither is qualified.
2. US2: mcteer assigns panel as customer owner. panel qualifies their own supported
   revision with rationale; mcteer cannot qualify while unassigned. Propose edits,
   defer, dismiss and reopen. Reassign during preview and prove stale decision denial.
3. US3: Compare rank inputs, dismissed duplicates and permitted delivery links. Change
   original evidence with maintenance paused; prose is immediately withheld and a
   metadata-only dismiss/reopen remains possible. Qualification requires fresh content.
4. US4: Prepare an owner-private bound conversation, inspect strict tools, stop/replay,
   get a structured proposal and save it as proposed. Prove source loss, generic
   fallback, mixed binding and cross-owner attempts cannot release/save content.

All role/source/race tests must pass, with zero unauthorized fields/counts/citations.
Benchmark each list/detail/decision class at the SC-005 fixture scale, ten warmups
then 100 measured operations/class with five concurrent users: p95 ≤2 seconds and
zero correctness failures. Record environment and actual timings, not just the target.

## Actual model review

After deterministic native guards pass, explicitly admit the eight cases in
[advisory-context.md](contracts/advisory-context.md):

```sh
npm run eval:expansion -- --live --budget-usd <positive-operator-budget>
npm run eval:expansion:verify -- --review <private-review>
```

Arguments denote operator-selected private paths/budget, not checked-in values.
The verifier requires all case IDs, input/source/model/output digests, observed
usage and reviewer identity/rationale for the exact capture. Keep artifacts ignored;
record only safe gate/count summaries in `validation.md`. Unknown usage or uncertain
dispatch stops admission. No model/provider calls are authorized or made by this
planning-only handoff.

## Recovery, retention and release

Simulate lost save acknowledgement, two simultaneous decisions, owner change,
source withdrawal, process stop before/after dispatch, disabled feature and cleanup
lease replay. Restart the same owned DB/workflow pair, compare before/after markers,
and prove no lost current decision, duplicate receipt or uncertain paid retry. Prove
immediate source withholding with the worker paused; then the 24-hour/30-day/90-day/
365-day and expired-key rules using controlled clocks and actual cleanup code.

After implementation gates, prepare a PR with README/spec/roadmap status and explicit
limitations. Preview deployment/migration and hosted acceptance are later recorded
gates; Production needs a concrete separately authorized rollout. Explicit Vercel
operations use eve. `TURAS_011_DISABLED=1` stops new authoring/decisions/advice while
eligible reads, receipt reconciliation, stop, settlement and cleanup continue. Forward
repair preserves schema history, decisions, private artifacts and durable workflow data.
