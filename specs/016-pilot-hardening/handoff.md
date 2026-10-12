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

## Current execution checkpoint — 2026-10-12

Draft PR 32 contains the implementation checkpoint. CI runs `38264825909` and
`38267585689` have failed jobs and are not acceptance. The third run confirms
current-schema recovery evidence, reporting deterministic checks and Product Gaps
WebKit are passing. The latest corrections address remaining predecessor owner/
session fixtures and a second nested recovery helper dropping the prepared image.
All 22 focused cases passed locally; root/pilot types are green. The failed complete
local attempt is retained. A subsequent full run at `c638b31` passed 640/640
named cases in 109 suites (`run-67a89edc-4e35-4186-b8a3-83c07e1cc722`).
Later CI still failed the Linux pilot render. Exact source diagnostics identified
undefined parent environment values being stringified into a relative `TMPDIR`;
the safe parent map now omits them. All 22 affected cases passed with `TMPDIR`
unset. Other fixes separate legacy/pilot UI discovery and use verified released-
code seeding for 034/035 execution upgrades (5/5 owned cases passed). A fresh
40-case four-project WebKit run also passed before the latest environment change.
CI `38278435669` then completed with 40 passed jobs and three failures: the
pilot's next actual scanner check, a composed 014 review timeout and composed
008 native binding. Narrow public AV/OCR copy permissions now preserve fixed
non-root scanner access without exposing private originals (8/8 actual access
cases passed under absent `TMPDIR`/private umask). The full eight-review journey
retains all assertions with a finite 180-second bound; native-binding failures
now report status only. A fresh full local run at `a88489f` also passed 640/640
(`run-91f16647-6acb-4543-b6c0-17f3a0e62505`). CI `38292390500` passed 41 of 43
jobs; the remaining failures were missing Git history for expansion's composed
034/035 upgrades and a scanner scratch inode reduced to `0400` by umask `077`.
The regression checkout now fetches history; exact open-handle input permissions
now preserve private parents and fixed non-root execution. The attempted scanner
time increases are reverted to the original bounds. Focused 21-unit/eight-access
checks and both types passed. See final `validation.md` sections: complete fresh
CI acceptance is required, not relabeled earlier receipts or isolated passes.

### Green code checkpoint

At `08ef152929a46d1bd3829c35f4d401814556e87d`, the complete owned local catalog
passed 640/640 in `run-39221025-1741-48de-b800-56cee839499d`, with fresh actual
images, absent `TMPDIR`, private umask and verified cleanup. Workflow
`38301166639` completed **43/43 successful jobs**, including the complete Linux
pilot catalog, four-project WebKit, full predecessor compositions and builds.
T081/T082 are checked on this actual source-bound proof. No failed attempt is
removed or promoted, and no skipped/flaky case is counted as acceptance.

The documentation follow-up at `eab14f6` then passed 42/43 CI jobs; Product Gaps
mobile-dark cancellation lacked a completed response before its UI assertion.
The case now requires the exact HTTP 200 cancellation acknowledgment before all
existing race/download/receipt checks. Actual focused desktop-light/mobile-dark
WebKit passed 2/2 without retries or flaky acceptance. The changed source must
complete fresh required CI; the older 43/43 receipt stays on `08ef152`.

Next: finish unchecked storage/capture/current-authority/restore/runbook work
(T045/T051–T059), then the required actual-model/operator and hosted journey
requirements. Apply only concrete authorized infrastructure/budget scope; do not
merge/deploy merely because local/CI corrections pass. The 62 checked tasks are
scoped implementation/local/CI proof; 22 tasks still require implementation or
operational acceptance. Independent operator/participant feedback,
two real scheduled backups at least twelve hours apart and the actual scoped
mcteer readiness decision cannot be supplied by automated fixtures.

## Resume and validation

Follow [quickstart](quickstart.md). Node 24, owned local databases/stores and CLI
Playwright/WebKit only. Preserve `.env.local`, root workflow state and `agent/agent.ts`.
Prepare 056/057 explicitly; verify free numbers, manifest and exact compatibility
before applying required target migrations/grants in release order. Validate actual
Preview services, then exact Production deployment and changed role/workspace/UI/
SDK/file processing after merge. Every task checkbox needs the corresponding real
proof; full participant/release tasks cannot complete from CI alone.
