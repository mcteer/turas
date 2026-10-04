# 009 PR evidence

## Problem and resulting behavior

Delivery teams can prepare and review truthful weekly reports, publish exact
audience-specific revisions, and create monthly/quarterly selectable PDFs and
editable native QBR slides. Weekly schedules prepare drafts only. Separate exact
recipient and send decisions feed a durable one-recipient outbox; acceptance,
delivery, suppression and uncertainty remain distinct. Source withdrawal fences
downloads and dispatch, and corrections require a new publication/send review.

## Specification and scope

- Specification: [spec.md](spec.md); implementation tasks T001–T062.
- Final checks and status: T063–T068 in [tasks.md](tasks.md) and [validation.md](validation.md).
- Includes migrations 039–041, governed domain/API/UI/worker, actual rendering,
  durable delivery/reconciliation, private storage and exact retention cleanup.
- Excludes unattended sends, model calls, finance/customer maturity invention,
  Production mail, hosted deployment and roadmap 010 work.

## Validation

The validation record is authoritative for final source digests and measured
results. Commands used:

- `npm run test:reports` — explicit 48-suite manifest; no omitted/skipped tests.
- `npm run reports:ui:check` — four CLI WebKit viewport/theme projects with axe.
- `npm run reports:artifacts:check` and `--verify-review` — six actual PDF/PPTX
  pairs, 121 individually reviewed rasters (or verified byte-identical rerenders),
  native text/table/chart edit-save-reopen in LibreOffice.
- `npm run reports:recovery:check -- --disposable` — paired snapshot, seven
  upgrade/lease/store/cleanup/missing-file/process-exit/outbox suites.
- `npm run benchmark:reports -- --disposable` — full representative corpus,
  seven per-class p95 budgets, 20 drafts and 12 executive pairs, quotas/fairness.
- `npm run test:reports:regressions` — 15 prior-feature unit suites/75 tests and
  seven integration suites/30 tests.
- `npm run typecheck`, `npm run build:check`, `npm run check:docs`,
  `git diff --check` — separately recorded final checks.

Real Resend delivery is explicitly deferred by the user (“Resend can come later”),
not inferred from fixture transport. Live dispatch remains off. No PowerPoint
portability, hosted workflow acceptance or private-customer
retention approval is asserted.

## Data, access, and operations

Apply the explicit migrations and runtime grants, prepare a separate marked private
report store and pinned renderer, then enable new reporting only after readiness.
Never migrate from a request handler or run the app as the migration owner.
`mcteer` retains brand/policy/publication/send authority. Partners receive only
currently eligible published delivery projections; private notes/addresses/provider
diagnostics never enter their content or artifacts.

Rollout and recovery: [reporting operations](../../docs/reporting-operations.md).
Preserve the selected DB, matching report catalog/store and `.eve/.workflow-data`.
Rollback means disable new reporting and live dispatch, retain receipt settlement
and exact cleanup, and use forward recovery rather than deleting audit/lineage or
blindly retrying ambiguous mail. Do not reconnect or deploy Vercel for this slice.

## Documentation and review

- README, roadmap, decisions, template index, spec and plan describe the actual
  implementation and distinguish local from provider/hosted evidence.
- Private artifacts and credentials remain ignored; no customer data is included
  in these synthetic acceptance fixtures or authored evidence.
- No governance exception or model change is requested.
- This file prepares review evidence; it does not claim independent review,
  creation/approval/merge of a PR, or CI/hosted results that have not occurred.
- After an authorized successful merge, a maintainer verifies README freshness on
  `main` and removes the associated local/remote feature branch.

Reviewer focus: exact release fences and lease boundaries, source eligibility,
per-recipient identity across policy/key rotation, retention tombstone taxonomy,
source-bound validation records, and default-off live dispatch.
