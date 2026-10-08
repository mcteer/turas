# 010 Validation Guide

The support commands below are implemented on the feature branch. Required gates
remain in progress; consult [validation.md](validation.md) and
[support operations](../../docs/support-operations.md) for actual source-bound
results. Planning artifacts, fixture output and successful builds do not establish
configured-provider acceptance or hosted readiness.

## Handoff and Prerequisites

1. Switch to a build agent and follow [handoff.md](handoff.md). Preserve current uncommitted reporting and Spec Kit work. Place these drafts under `specs/010-tam-support-guidance/` and select that feature explicitly.
2. Use Node 24 and locked dependencies. Read project AGENTS, evidence/design policy and the relevant installed Eve/Next docs before code.
3. Use a marked owned disposable Postgres database and synthetic fixtures. Never substitute the selected development/Preview/Production database. Existing private artifact store and `.eve/.workflow-data` survive recovery checks.
4. Implement and validate explicit additive migrations after committed schema 041, update runtime grants and test an empty initialization. Do not rewrite old migrations or reuse the unrelated working-tree 041 edits.

## Commands and Required Results

| Command | Required evidence |
| --- | --- |
| `npm run check:docs` | Authored repository Markdown links and hygiene after draft handoff |
| `npm run typecheck` | Full current TypeScript check |
| `npm run build:check` | Existing Eve and Next build paths |
| `npm run test:support` | Exhaustive discovered support unit/contract/integration/native suites on their owned setup, zero skips/failures |
| `npm run support:ui:check` | All seven defined journeys in all four CLI WebKit projects, at least 28 cases, zero missing/skipped/retried/failed cases |
| `npm run benchmark:support -- --disposable` | SC-004's representative corpus and every measured operation class |
| `npm run support:recovery:check -- --disposable` | Schema upgrade, accepted heads, lost-ack reconciliation, source withholding and exact cleanup across restart |
| `npm run eval:support -- --live` | Eight synthetic actual-model captures using the unchanged model and finite admission limits; this runner always owns its disposable environment |
| `npm run eval:support:verify` | Explicit human/agent review of captured output and all eight case results, source/cost/latency provenance |

The test runner is responsible for setup/cleanup ownership and fail-closed environment markers. No script may treat missing JSON output, zero tests or skipped tests as success. Pure unit tests should not start a database unnecessarily. Native fixture substitution is allowed only in an owned disposable app copy, never the root `agent/agent.ts`.

## Story Acceptance

- **US1**: Customer and workload scopes; no-engagement state; exactly six checks; mcteer review and panel denial; independent internal/delivery representations; partner grant/revocation and withdrawal.
- **US2**: Proposed-versus-accepted dispositions; owners/unknowns; overdue ordering; deferral/completion requirements; reopen; duplicate save/review and conflicting edits; receipt lookup after lost acknowledgement.
- **US3**: Known/unknown escalation route; supported versus unknown entitlement/severity; human-reported handoff; malformed/credential-bearing URL refusal; no outbound HTTP/mail/ticket call.
- **US4**: Bound owner-private native advice; audience-first snapshot; tool catalog denial; quota/deadline/stop/uncertain provider handling; complete result validation; human save creates only a pending action.

Include cross-workspace/environment/customer tests, all three demo roles and another internal principal with no mcteer identity. An admin role string alone must not grant mcteer approval. Unknown sources are not accepted fact. A source corrected/retracted while a request is in flight must fail final release/replay even before invalidation maintenance runs.

## Performance Protocol

Seed 100 synthetic customers, 500 support scopes, 5,000 actions and 20,000 immutable revisions with representative accepted/pending/disposition/audience/source histories. Include ten selectable engagements per rich scope, twenty direct and 200 transitive source boundaries, unknown owners and overdue reviews. Bulk seed setup is outside timed measurement; user journeys exercise public governed commands separately.

Measure four classes separately: scope/action list, record detail/history, review preview, review acknowledgement. Five concurrent users, ten warmups per class, then 100 successful measured operations per class. Pace each actor within contract rate limits; test quota overflow separately, never disable rate enforcement for the measured path. p95 must be ≤2,000 ms in every class with zero correctness errors. Record machine/runtime, corpus counts, source digest and raw timing metadata without prose. Generation latency is measured separately against its deadline, not mixed into read/ack latency.

## Recovery, Retention and Disable

Use an owned environment with recorded owner markers. Create and accept an assessment/action, simulate a command commit before acknowledgement, restart the application and reconcile the same key. Preserve the database and workflow directory; do not reinitialize to make the test pass. Simulate native dispatch interrupted before terminal receipt: metadata may reconcile, but no second paid call occurs.

Advance a controlled test clock for 24-hour invalidation, 90-day abandoned/rejected, 30-day advice and 365-day minimized audit retention. Verify withholding precedes purge; test stale leases, newer revisions, repeated cleanup and late terminal receipts. Check the documented retained-record referential metadata exception separately; no content survives through the exception. With `TURAS_010_DISABLED=1`, new work fails but eligible reads, receipts, stop, settlement and retention continue.

## Regression and CI

Run existing retrieval/plan/source and execution/native regressions affected by the shared seams. Preserve full existing CI jobs; add dedicated deterministic and four-project support WebKit jobs, with report/legacy cohorts excluding `support-*` only because the owning support job runs them. Recheck owned-copy inputs and schema-version expectations before pushing. Build matrix results must correspond to the published PR head.

## Completion Evidence

During implementation create `specs/010-tam-support-guidance/validation.md` with actual commands, source revision, corpus/test/browser counts and results. Record inaccessible or failed checks honestly. Update README and ROADMAP in the same PR. Do not mark tasks complete based on plans, fixture-only model output or an unrelated Vercel preview build. Hosted readiness and real reporting mail remain distinct from local development completion.
