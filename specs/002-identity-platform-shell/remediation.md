# 002 analysis remediation

Date: 2026-09-27. Scope: specification, plan, contracts and tasks only.
The five reported findings are addressed at the design level; runtime acceptance
remains pending implementation. The constitution and feature boundaries are unchanged.

| Finding | Resolution | Implementation and verification |
| --- | --- | --- |
| C1 — Representative behavior evaluations missing | Six capability-honesty cases, two real responses each; semantic rubric and hard side-effect gates; separate from smoke/CI mocks | T045, T056, T057 |
| U1 — Durable watchdog execution unspecified | Postgres deadlines and cancellation-only leases, local supervised worker, signed narrow maintenance route, heartbeat gate, bounded retries and restart cases | T007, T034–T035, T042, T046 |
| U2 — Receipt loss plus hook failure unresolved | Persist native pre-dispatch cursor and input digest under exclusive attempt reservation; replay admission evidence; uncertain sends never automatically redispatch | T033, T035, T038, T041–T042, T046 |
| I1 — Test commands arrive after checkpoints | Wire unit/integration/contracts/UI commands during setup; final task adds CI orchestration | T003–T004, T057 |
| I2 — Performance population ambiguous | 20 authenticated sessions over existing accounts (7/7/6), 1,000 owned chats (400/400/200), 30s warmup/120s measurement and separate endpoint p95 targets | SC-006, T055 |

The [recovery and validation contract](contracts/recovery-and-validation.md) is the
canonical detailed decision record. The [data model](data-model.md),
[native boundary](contracts/eve-session.md), [plan](plan.md),
[runbook](quickstart.md) and [tasks](tasks.md) carry corresponding changes.

Post-edit consistency review confirms 60 uniquely numbered, unchecked tasks and
coverage for all 17 functional requirements and 9 success criteria in the task
coverage table. No original finding remains unresolved in the reviewed design.
This is task coverage, not evidence of implemented behavior.

Validation: Node 24 `npm run check:docs`, `git diff --check`, and task-ID/coverage
checks. No runtime tests, model calls, deployment or integration installation were
performed for this documentation-only remediation.
