# 016 Implementation Handoff

Planning prepared 2026-10-10 on `016-pilot-hardening` in the canonical checkout.
Baseline main is `db6c0b9a721fcf5f6311b5be8ecd18846e38a8c9`; 015 is released on
schema 055. No runtime, migration, dependency, environment or Production changes
were made during this planning run. Implementation has since begun in this checkout. Current checked tasks and
private local validation are recorded in `tasks.md` and `validation.md`; full
016 acceptance and hosted release remain pending.

Select `SPECIFY_FEATURE_DIRECTORY=specs/016-pilot-hardening` independently of the
Git branch. Read spec, plan, tasks, data model, contracts and quickstart before code.
The final read-only cross-artifact analysis is reported in the planning completion
message; it does not create an implementation or hosted acceptance record.

## User decisions

1. Controlled internal and explicitly assigned-partner pilot. Full customer
   authentication, federation and broad onboarding remain deferred.
2. A clearly labeled synthetic Production pilot workspace, using normal reviews
   and explicit partner assignments, followed by actual participant feedback.
3. Backups must use work-controlled infrastructure. Personal iCloud and other
   personal storage are prohibited. Inspect the existing Neon recovery setup;
   separately protect private files and current denial/replay records.

Existing canonical mcteer review/release ownership, private conversations, partner
grants, source acceptance and model selection remain authoritative. No approval
is inferred from a file claiming `actor: mcteer`. The readiness checker calculates
technical eligibility; the actual human decision is separately attributable.

## Findings that drive the implementation

- Login/session membership joins currently use `LIMIT 1`. Bind sessions to their
  selected active membership before adding a second pilot workspace; preserve the
  primary default and protect/retire old deployments before enabling pilot members.
- Local filesystem/Docker file workflows need actual hosted adapters. Use private
  Blob plus bounded nonpersistent Sandbox jobs around existing parsers/renderers,
  with explicit limits, private direct uploads and current domain authorization.
  No compatible eve registry domain-store integration was found; do not install
  `memory/file` as a substitute. Pin public SDKs and OCI images when implementing.
- A chat heartbeat is not full worker health. Current hosted watchdog schedules
  conversations, learning and MCP; other domain/file cleanup needs bounded hosted
  scheduling and per-class success/backlog evidence.
- Existing restore drills do not reconcile revocations/deletions newer than the
  snapshot. Add matched inventory/encrypted backups, recovery lock, current denial/
  replay reconciliation, or conservative quarantine with truthful pending scope.
- 015's Production positive research read was proven. Assigned-partner and other
  accepted/published categories were missing; 016 must demonstrate them through
  normal synthetic pilot workflows, not fabricated accepted fixture DTOs.

## Implementation order and gates

84 tasks: setup/foundation 13; US1 evidence 8; US3 isolation/storage/lifecycle 26;
US2 recovery 12; US4 operations 10; US5 hosted pilot/feedback 11; crosscutting 4.
US3 precedes the full US2 restore because storage/session contracts must be stable.
T081/T082 regression/CI checks gate every merge despite their final-phase numbering.
The first checkpoint is US1's accurate readiness report, not launch readiness.

Use small reviewable PRs for the stages. After a merge, clean up its local/remote
branch, leave the PR closed and verify README on main. Continue remaining tasks on
an explicitly created appropriate feature branch with the same selected spec.
Do not add sibling project directories or leave owned test resources running.

All 22 readiness gates cover 25 requirements and 10 measurable outcomes. The final
technical bundle requires each mandatory gate; a narrower intermediate release does
not become a completed pilot. Outbound email is excluded from this initial pilot;
009's exact-recipient/provider gate applies if separately included later. Correct
014 no-benefit rejection remains valid workflow proof; publication still requires
its own demonstrated benefit and review.

## External execution inputs

Planning authorizes no paid evaluation, infrastructure provisioning, migration,
production record write, send, deployment or merge. During implementation, prepare
concrete target/store/image/cost manifests and use the user's applicable authorization;
ask only for material missing authority, not repeated approval of an admitted action.
Actual-model changes require the governing feature's budgeted independent review.
Protect credentials, backups and customer content from Git/tool output.

The full pilot needs actual observed backup cadence (two runs ≥12h apart), an
independent operator/reviewer runbook exercise and real internal/assigned-partner
feedback. No model can fabricate these observations. Missing prerequisites leave
specific gates pending, not secretly waived. Observed local performance is not
hosted load proof. Operational targets are 24h RPO/4h RTO, not current guarantees.

## Resume and validation

Follow [quickstart](quickstart.md). Node 24, owned local databases/stores and CLI
Playwright/WebKit only. Preserve `.env.local`, root workflow state and `agent/agent.ts`.
Prepare 056/057 explicitly; verify free numbers, manifest and exact compatibility
before applying required target migrations/grants in release order. Validate actual
Preview services, then exact Production deployment and changed role/workspace/UI/
SDK/file processing after merge. Every task checkbox needs the corresponding real
proof; full participant/release tasks cannot complete from CI alone.
