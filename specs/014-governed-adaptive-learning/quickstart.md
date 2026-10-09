# 014 Implementation Validation Guide

This is a planned command contract. New `learning:*` commands below do not exist
until implementation; this planning turn does not run them or claim their results.

## Prerequisites and feature selection

Work in `/Users/mcteer/Projects/turas`, branch `014-governed-adaptive-learning`.
Use Node 24, the existing lockfile, local Docker and installed CLI WebKit. Preserve
`.env.local`, selected database and `.eve/.workflow-data`. No sibling checkout.

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/014-governed-adaptive-learning
npm run check:docs
```

Read [spec](spec.md), [plan](plan.md), [tasks](tasks.md), [data model](data-model.md)
and all four [contracts](contracts/) before `$speckit-implement`. The actual model
stays unchanged. Paid calls require a fresh explicit operator budget; prior 011
approval does not carry forward.

## Owned acceptance commands

Implement one canonical `scripts/learning-suites.json` manifest. Each runner must
fail if its suite is empty, skips mandatory tests or omits a registered test. Every
mutable fixture uses an owned synthetic database and private runtime copy beneath
ignored `local-artifacts/014/`; stop/remove owned resources on normal/error/signal
exit. Preserve the selected environment and workflow state byte-for-byte.

```sh
npm run test:learning
npm run learning:native:check
npm run learning:ui:check
npm run learning:recovery:check
npm run learning:regression:check
npm run benchmark:learning
npm run typecheck
npm run build:eve:check
npm run build:web:check
npm run check:docs
```

Expected evidence:

- Contract/domain: authority and partner privacy; exact target/source/rights closure;
  idempotency/version races; feedback lifecycle; model output is proposal only;
  every old/new publish path gated; withdrawal with a newer draft; reviewed rollback;
  deterministic metric arithmetic, minimum cohort and no replacement disclosure.
- Native: real eve session/HTTP lifecycle with deterministic provider fixtures;
  per-purpose allowlists, mutually exclusive bindings, pre-I/O durable reservation,
  USD/concurrency/context/token/deadline ceilings, stop/unknown-cost reconciliation,
  strict release, source revocation in history/reconnect and native retirement.
- UI: production Next build, CLI WebKit at 1440px/390px in both themes, internal
  author/admin/partner/peer roles, accessible keyboard flows, case review, pending
  requests, disabled state and live source/access loss. Synthetic visual review.
- Recovery: empty→054, populated051→054, current marker/manifest, runtime privileges,
  legacy head capture/activation, old writer rejection, disabled admission with
  cleanup active, restart/lost acknowledgment during paid/family admission, stopped
  worker fences, earlier purge deadlines and owned cleanup on SIGTERM.
- Regression: existing knowledge publication/retrieval/source fences, owner-private
  conversations and 009/012/013 domain boundaries plus 010/011 native modes.
- Performance: all seven SC-006 classes, ≥100 operations each, production quotas
  without reset, p95 <1000ms; report fixture size, pacing and external latency exclusions.
- Builds: actual eve and Next builds with the original selected model; no mock-build
  claim substituted for either artifact.

## Actual-model acceptance and review

After explicit new operator budget approval, the planned invocation is:

```sh
npm run eval:learning -- --live --budget-usd <approved-cap>
npm run eval:learning:verify -- --review <private-reviewed-capture-path>
```

Use `0 < approved-cap <= 25`; `<approved-cap>` is a placeholder, not authorization.
Validate current provider pricing and a defensible per-call reservation before the
first paid arm. Capture all eight actual baseline/candidate pairs, exact source/
model/prompt/fixture/rubric hashes and usage/accounting. An independent reviewer
assesses the actual captures under C08 and mandatory safety flags. Stop on unknown
cost/dispatch, failure or insufficient budget; retain all failed/missing arms.
A new full rerun needs its own explicit budget, never a silent paid retry.

## Walkthrough checkpoints

1. An assigned partner submits feedback on their own guide/checkpoint. A peer cannot
   read it. An internal steward sees only authorized originals and triages the issue.
2. A bounded Turi draft cites selected originals and saves as a private 005 candidate.
   Denied tools, pending claims, cancelled/unknown work and invalid sources cannot save.
3. An admin reviews rights, runs/grades eight paired cases and publishes an exact
   passing revision. Another active partner reads the sanitized practice without
   private source access. A failing or edited case blocks every publish route.
4. Withdraw a published head while a newer draft exists; prepare rollback and prove
   current evidence/evaluation are still required, with workers stopped.
5. Approve five customers' synthetic comparable measurements, release one quarter,
   then withdraw one original. Withhold the family everywhere and refuse replacement
   output; four customers, duplicates and arbitrary filters never bypass the gate.
6. Advance time, disable new learning and restart maintenance. Original evidence age
   persists, eligibility is immediate, cleanup/settlement continues and deadlines hold.

## Authorized release and Production checks

Before merge/release, record target marker, code revision, schema 051→054, private
backup/restore rehearsal, additive compatibility order and runtime grants. Apply
migrations explicitly, deploy authorized code and activate the gate through the
operator command; no handler DDL. Use actual authenticated HTTP and CLI WebKit to
verify changed Production flows and role boundaries with designated test data.
Record unavailable credentials/checks honestly and retain private artifacts outside
Git. Never use disposable fixture runners against Production or create invented
customer outcomes. Full hosted acceptance remains incomplete until required hosted
checks pass. Document disable/forward recovery and clean owned resources.
