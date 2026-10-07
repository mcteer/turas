# Support Guidance Operations

Feature 010 is implemented on its feature branch; required acceptance and review
remain in progress. [PR #19](https://github.com/mcteer/turas/pull/19) is a draft,
not a hosted-release or merge claim. The [validation ledger](../specs/010-tam-support-guidance/validation.md)
records source-bound results and outstanding gates.

## Scope and Authority

Support readiness is separate from customer maturity and engagement progress.
Actions and human-reported handoffs do not send, acknowledge or resolve external
tickets. Canonical `mcteer` reviews exact proposed revisions; `panel` may propose
its own drafts. Partners read only accepted delivery data for assigned customers.
Advice conversations are private to their owner, regardless of role.

Turi receives only the bound support snapshot, three read tools and the support
procedure. Advice cannot approve or mutate domain state. An explicit human save
requires its exact eligible completed output/source map and creates a proposal,
not an accepted action. Pending user claims remain on the existing review path.

## Schema and Rollout

Migrations 042 and 043 follow committed schema 041 and are manifest-bound.
Use the explicit administrative migration/grant commands in a deliberately
selected environment; handlers never initialize or migrate a schema. On a fresh
Postgres cluster the least-privileged `turas_runtime` role must exist before
initialization because earlier migrations grant to it. Disposable CI creates a
`NOLOGIN` role before `db:init`, then applies `db:roles` after initialization.

Before any hosted rollout, record the target marker, prior schema, backup/recovery
plan and explicit authorization; validate the owned empty/041-upgrade and runtime
mutation-denial gates. A successful build or protected Preview does not prove
hosted database compatibility, worker readiness or actual model behavior. Do not
apply the separate archive migration 044 before 042/043.

## Disable and Recovery

Set `TURAS_010_DISABLED=1` to deny new support writes and advice generation.
Eligible reads, receipts, stop, terminal metadata reconciliation and retention
remain available. This is not a schema rollback and must not reset database or
workflow state. Re-enable only after reconciling outstanding work and validating
the chosen source/environment.

For ambiguous commands, read the actor-scoped receipt and reconcile the original
request key. Never invent a new key to repeat an uncertain write. An uncertain
native dispatch must not repeat provider work or restore unconfirmed content.
Preserve both the selected database and `.eve/.workflow-data` during recovery;
do not reinitialize them to make a check pass. Source/authority changes withhold
content immediately, independently of cleanup. Retirement may reset only the
retired native identity; it is not a paid-generation retry.

## Retention and Key Rotation

Maintenance withholds invalid content before physical purge. Invalidated payloads
are due within 24 hours; abandoned/rejected drafts after 90 days; advice content
after 30 days; allowed content-free audit/receipt detail is minimized after 365
days. Exact lease, digest and invalidation-generation checks protect newer
payloads. The narrow retained-record referential exception retains no prose or
URLs; see the [data model](../specs/010-tam-support-guidance/data-model.md).

Expired command keys remain fenced by content-free keyed hashes for the life of
the environment. `TURAS_010_RECEIPT_HASH_KEYS` is an optional private JSON key
ring, newest first, with keys of at least 32 bytes. Without it the maintenance
secret is used. Before rotating that secret, retain the previous key in the ring;
keep old keys until the environment is retired. Never commit or print key values.

## Required Verification

Use Node 24 and the documented marked test environment. The support runners
create owned disposable database/app/store copies and clean only their own
resources. Keep raw logs, screenshots and captures in ignored private artifacts.

- `npm run test:support`: exhaustive unit/contract/integration cohort, no skips.
- `npm run support:ui:check`: complete CLI WebKit desktop/mobile light/dark matrix.
- `npm run benchmark:support -- --disposable`: unchanged representative corpus,
  quotas and per-class p95 of at most 2,000 milliseconds.
- `npm run support:recovery:check -- --disposable`: preserved state and exact
  cleanup/receipt reconciliation, distinct from uncertain native restart.
- `npm run support:native:check -- --interrupted`: actual framework restart with
  fixture provider, exactly one call and no unconfirmed-content restoration.
- `npm run eval:support -- --fixture`: all eight actual-framework fixture cases;
  not configured-provider, cost, semantic-review or hosted proof.
- With explicit live opt-in and recorded budget, `npm run eval:support -- --live`
  captures all eight configured-provider cases once. Retain failures; never
  automatically recapture paid work. `npm run eval:support:verify` requires complete
  source/model/prompt, usage/cost and semantic-review evidence.

Run typecheck, eve/Next builds, docs and affected earlier-feature regressions.
Published-head CI, required actual-output review and maintainer review must pass
before merge. Do not report a pending, missing or failed gate as completed.
