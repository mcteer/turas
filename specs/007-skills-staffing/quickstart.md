# Quickstart validation guide: 007 skills and staffing

This guide describes checks to implement and run later. Feature007 has planning
artifacts only; commands labelled new do not exist until their tasks are implemented.
Do not treat any expected result below as a completed check. The user will switch
models before starting `$speckit-implement`.

## Resume the intended feature

```sh
git switch 007-skills-staffing
export SPECIFY_FEATURE_DIRECTORY=specs/007-skills-staffing
.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

Read AGENTS.md, README, CONTRIBUTING, constitution, spec/plan/tasks and the four
contracts. Preserve uncommitted work and `agent/agent.ts` selection
`spacexai/grok-4.7` / reasoning `low`. Only canonical `mcteer` may manage workforce,
confirm staffing or use finance; `panel` proposes, partners see granted confirmed
delivery assignments. No delegation implementation.

## Prerequisites and boundaries

Use project Node24, locked dependencies, isolated scanner/parser images and CLI
WebKit. New `@js-temporal/polyfill`0.5.1 installation and license/lockfile review is an
implementation task. Prepare synthetic CSV/XLSX fixtures only. Existing ignored
configuration may contain live Production references for guard comparison: never
print them or connect to them.

Production Neon remains out of bounds. Preview was last verified at schema031;
no007 upgrade is authorized by this guide alone before the gates pass. The separate
marked test DB is the clone source. The new staffing environment wrapper must reuse
owned-clone identity/cleanup checks and isolate workforce/artifact store, worker
heartbeats, app ports and eve workflow state. The wrapper applies migrations only to
resources it created and never resets the configured app database.

## Deterministic checks (new commands)

```sh
npm run test:staffing
npm run staffing:ui:check
npm run benchmark:staffing
npm run staffing:recovery:check
```

`test:staffing` must enumerate the complete planned staffing unit/contract/integration
suite and run it inside owned disposable scope, including empty/031 migrations and
runtime grants. Generic integration/contract scripts exclude clone-only staffing
files; CI runs the dedicated command and verifies no staffing test file is orphaned.
No database URL override is accepted on the command line.

`staffing:ui:check` creates a private unique `local-artifacts/007/ui-*` directory,
records the source digest before setup and discovers every selected case in each
WebKit project. Discovery is not execution evidence. Acceptance requires every
discovered case to pass once with no skips, retries, unexpected or flaky outcomes;
the runner rejects missing/duplicate cases and source changes during the run.
Only a successful complete run writes `completed.json`. Failed runs retain their
source binding and available discovery/execution reports without replacing an
earlier run's evidence.

Expected evidence:

- Real scan/parse/import with exact cell/source/digest lineage; only mcteer approves
  literal candidate rows. Partial/formula/ambiguous-identity inputs remain unresolved.
- Current eligible competencies, future-certified calendars and deterministic match
  reasons, including no-feasible/unknown/stale outcomes.
- Correct exact decision replay and source/calendar/baseline races; daily resource
  and demand capacity enforced, including rollback after a partial ledger write.
- Versioned minute and minor-unit arithmetic corpus with DST and rounding boundaries.
- Immediate source/privacy denial with cleanup paused, including hidden lineage,
  history, model context, active/replayed native output and restricted financial data.
- Full four-project WebKit import→demand→confirmation→operations journey using
  actual reviewed sources and accepted plan identity, keyboard and axe evidence.
- Representative 500-resource/50-skill/20000-revision/10000-allocation-date benchmark,
  100 measured calls/class, five concurrent clients, all p95≤2s and no failures.
- Paired owned-clone restart/recovery preserves decisions, import leases and native
  binding without duplicate paid turns; only owned resources are cleaned up.

## Eight-case live advisory check (new commands)

Only run after deterministic/advisory fake-provider gates and with an available
local provider key, never in ordinary CI. Use the existing selected model.

```sh
npm run eval:staffing -- --live
npm run eval:staffing:verify -- /absolute/path/to/private/review.json
```

The first command creates an owned synthetic app/database/store/eve environment and
runs S01–S08 from `contracts/advisory-context.md`. Each case has one initial turn,
120-second/six-step/six-domain-read/4096-output-token limits, with at most eight
admitted turns and20minutes total/run. No automatic paid retries. Capture actual
native context/tools/usage/output and durable state into ignored `local-artifacts`.
Set `TURAS_ALLOW_LIVE_MODEL_TESTS=1` explicitly. The runner first executes full
staffing, owned002–006 regressions, four-project WebKit, recovery, representative
performance, typecheck/build/docs gates with the model key removed from child
environments. There is no preflight bypass. Live setup counts toward20minutes;
each fixed case owns a separate clone to preserve the actual per-actor admission
window. Source bytes must remain identical throughout the preflight and live run.
Owned preparation/migration child timeouts and restart readiness use the remaining
original suite allowance; cleanup remains required even after that allowance ends.
S08 calls the real signed metadata-only native reconciliation endpoint after the
paired restart. A terminal projection confirms cancellation; a durable stop with
an unresolved stopping response and a reconciliation retry is recorded as
unconfirmed, with unknown step usage preserved. Neither branch dispatches again.
The private evidence includes immutable staffing write receipts before/after the
turn. Only S06's exact deliberate human rate-revision receipt is allowed to appear;
other staffing writes fail the case even if allocation totals remain unchanged.

The unique private `local-artifacts/007/live-*` directory retains actual captures,
failed partial cases and `review-pending.json`. It is intentionally not a passing
review: semantic assertions and rubric scores remain unset. Inspect the actual
snapshot/provider inputs, exact tool payloads, stream events, persisted step usage,
independent fixture amounts and lifecycle/ledger evidence. Complete the supported
semantic assertions in the actual record only when demonstrated; calculate that
record's new SHA-256 digest and bind it in the separate completed review. Preserve
the original capture and pending review when creating reviewed copies. A failed
case requires a new recorded run, with no paid retries in the failed run.
Review every response and scenario against the rubric before running the verifier;
the verifier checks the review corresponds to the captured outputs and exact run.
Do not fabricate a review or mark unavailable/failed/over-budget cases passed.

## Remaining validation before Preview

Run affected002–006 access/context/import/retrieval/plan/native-replay regressions,
then existing `npm run typecheck`, `npm run build:eve:check`,
`npm run build:web:check`, `npm run check:docs` and `git diff --check`. Record failures
and their focused reruns. The full feature suite/matrix/live/load/recovery gates
cannot be replaced by a passing selected file. Use CLI Playwright/WebKit only.

## Eventual Preview upgrade

Only after all disposable gates pass, verify the app target read-only:

```sh
npm run db:inspect-preview
```

Confirm the fresh marker matches configured Preview and source schema is expected.
Then use the existing explicit migration and role commands on that confirmed target,
reinspect, and run non-destructive local Next app health/auth/feature-readiness smoke.
Do not seed/destructively test Preview, erase `.eve/.workflow-data`, link Vercel or
deploy. Record actual before/after versions and safe outcomes. If unexpected schema
or identity appears, reconcile before upgrading; Production is never a fallback.

## Evidence and handoff

Create `validation.md` during implementation, using exact command/run/target identity,
counts, captured-output rubric, timings, limitations and cleanup results. Only check
completed tasks supported by that record. README/ROADMAP updates must distinguish
planning, local checks, CI, Preview and hosted release. Create a reviewable feature PR
only after required implementation/validation; do not merge without user instruction.
