# 012 Validation Quickstart

These are planned implementation interfaces, not commands run or passing evidence from planning. Use [tasks.md](tasks.md) to build them. Keep all work in `/Users/mcteer/Projects/turas` on `012-product-gap-feedback`; no sibling checkout. Read the root development instructions and the [plan](plan.md) first.

## Setup and isolation

```sh
cd /Users/mcteer/Projects/turas
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
export SPECIFY_FEATURE_DIRECTORY=specs/012-product-gap-feedback
```

Do not run `db:init`, `db:migrate`, `reports:prepare` or root dev against the selected `.env.local` during synthetic checks. The 012 runners provision their own marked loopback PostgreSQL environment, runtime roles, private store and workflow directory under an owned ignored `local-artifacts/012` namespace. They must sanitize inherited database/model/provider variables, refuse non-owned targets and arbitrary database/test-path overrides, preserve the selected database and `.eve/.workflow-data`, and tear down only their exact resources in `finally`. No paid model calls or real customer import is permitted. Evidence/logs/screenshots are private and synthetic; public summaries contain safe totals and hashes only. Keep reviewed evidence until its acceptance record is written, then remove expendable owned scratch and containers.

Before route/UI implementation, read the relevant installed Next.js guides. No eve authoring is planned; preserve `agent/agent.ts` and instructions. Verify provisional migrations 048–049 against the current manifest. Explicit store preparation `npm run gaps:prepare` is for a deliberately selected implementation environment, uses only the private-store helper and requires release authorization on hosted targets; runners call the helper within their owned environment instead.

## Acceptance commands

| Command | Expected evidence |
| --- | --- |
| `npm run typecheck:gaps` | Dedicated `tsconfig.product-gaps.json`, no changed-path type errors |
| `npm run test:gaps` | Complete canonical unit/contract/integration manifest, positive executed assertions, no skipped/missing/orphan/duplicate suites; exact source digest before/after |
| `npm run gaps:ui:check` | Complete journey × four-project manifest, zero skipped journeys, synthetic screenshots, keyboard/no-overflow/axe results |
| `npm run benchmark:gaps` | Exact SC-005 row cardinalities, five concurrent readers, p95 operations and report deadline, no silent truncation |
| `npm run gaps:recovery:check` | Empty and 047→049 upgrade, runtime grants, same-environment restart, receipts/tombstones/jobs/store/disable/retention evidence |
| `npm run test:gaps:regressions` | Relevant source/authority/invalidation/store/shell behavior for 003–011 in owned deterministic environments |
| `npm run check:docs` | Current links/status and tracked-file hygiene |
| `npm run build:gaps:check` | Existing `build:check` web/eve builds in an owned app copy, with no deploy or model change |

The first six runners must reject source changes during acceptance, record source/environment identity and run the whole declared corpus when claiming feature acceptance. Narrow developer checks may run while implementing, but their success is not full acceptance. Extend existing source-digest utilities for 012 without changing the meaning of historical feature fingerprints.

## Canonical automated suites

`scripts/gaps-suites.json` must enumerate exactly the discovered `gap-*.test.ts` files in unit/contracts/integration. Required files:

```text
tests/unit/gap-content.test.ts
tests/unit/gap-impact.test.ts
tests/unit/gap-report-document.test.ts
tests/unit/gap-runner-coverage.test.ts
tests/contracts/gap-http.test.ts
tests/contracts/gap-projection.test.ts
tests/integration/gap-foundation.test.ts
tests/integration/gap-authoring-review.test.ts
tests/integration/gap-evidence-races.test.ts
tests/integration/gap-canonicalization.test.ts
tests/integration/gap-counts.test.ts
tests/integration/gap-report-lifecycle.test.ts
tests/integration/gap-report-release.test.ts
tests/integration/gap-handoff.test.ts
tests/integration/gap-retention-recovery.test.ts
```

Do not declare acceptance by a file name or all-skipped run. Runner tests must deliberately omit/duplicate a suite or project/journey, inject a skip, and alter the source digest to prove the acceptance verifier fails.

## Required scenario corpus

1. **Authority and proposal:** mcteer/panel can propose; only exact active internal mcteer reviews. Deny partners, other admins/stewards/owners, cross-environment/workspace/customer, expired session and revoked membership before content/count/existence. Proposed edits preserve reviewed heads and accepted profiles. Self-review is explicit.
2. **Evidence:** accepted customer need plus direct current product evidence can confirm; public-only, unknown critical dates, stale/low quality, contradiction, planned execution and withdrawn originals cannot. Exercise all six supported source kinds and transitive original closure, including duplicate conflicting source versions. Every critical citation is required independently.
3. **Decisions and replay:** accept/reject/defer/dismiss/reopen/retire, future/deadline boundaries and self-review. Exact receipt replay after preview expiry, changed-input conflict, key tombstone expiry/rotation, revoked replay and lost acknowledgments. Barrier-controlled source/head/authority races at final commit.
4. **Canonical counts:** repeated notes/workloads, two customers, confirmed suppressing suspected, resolved episode/recurrence, retired mistake, multiple kinds, partial source eligibility, zero results, merged aliases and exhaustive split. Independently specify expected customer sets. Concurrent overlapping merges, new impact during preview, cycles, stale assignments and split-copy attempts leave zero partial decisions. Past-cutoff comparison with missing history says unavailable.
5. **Report preparation:** both complete templates, zero portfolio, maximum 100 gaps/200 customers/2000 dependencies, unknown/missing dates and over-limit rejection. Exact source/citation/count parity across app/Markdown/JSON. Queue deadline, cancellation, source/actor revocation before finalization, crash, disk full, artifact tamper/environment mismatch and no auto retry.
6. **Disclosure and export:** panel cannot approve/export/handoff; every included customer is attested for exact audience/content, including changed recipient/purpose. Draft/invalidated/expired/disabled artifacts yield no bytes. Pause streaming between chunks, revoke scope/source or cancel and prove no later chunk. Lost acknowledgment returns the same identity; no private object URL or raw hidden metadata appears.
7. **Handoff:** one manual initial receipt, duplicate/cross-audience denial, chronological attributed follow-up and append-only correction, inert HTTPS validation, metadata-only correction after expiry. A resolution report changes no customer impact/maturity, and invalidation flags human follow-up without an outbound call.
8. **Retention/recovery:** stopped workers still withhold invalidated prose/counts/bytes; 24-hour purge, 30-day reports, 90-day obsolete payload, 365-day receipts, environment-lifetime tombstones, 5-minute preview and 180-second cleanup lease boundaries. Retain current eligible heads and minimal lineage, deny actor without global deletion, remove only exact 012 objects and preserve 009 files. Migration/restart preserves selected DB/workflow/store identity. Kill switch blocks new work but allows cancellation/reconciliation/cleanup.

## UI matrix

`scripts/gaps-ui-journeys.json` names six complete journeys, each required in all four existing WebKit projects:

| Test path | Required journey |
| --- | --- |
| `tests/ui/gap-authoring.spec.ts` | Capture/propose/review exact gap and impact, revise without implicit approval |
| `tests/ui/gap-canonicalization.spec.ts` | Merge/split with keyboard assignments, distinct counts and history |
| `tests/ui/gap-reports.spec.ts` | Prepare detail and portfolio, inspect sections, disclose/review/download |
| `tests/ui/gap-handoff.spec.ts` | Manual handoff, follow-up/correction and needs-human-follow-up |
| `tests/ui/gap-revocation.spec.ts` | Pending reconciliation, scope/logout/source invalidation, focus refresh and private DOM clearing |
| `tests/ui/gap-accessibility.spec.ts` | Registry/customer context/navigation, empty/loading/denied/stale/error states, keyboard/focus, no overflow and axe |

Use CLI browsers only. Cover desktop light/dark 1440×900 and mobile light/dark 390×844; inspect synthetic screenshots rather than only collecting them. A declaration of 24 combinations is not evidence that those combinations executed.

## Load and recovery acceptance

Build a deterministic fixture of exactly 200 customers, 2,000 gaps, 10,000 observations and 40,000 total gap/impact revisions. Seed 2,000 reviewed gap revisions and 38,000 impact revisions with exactly 10,000 latest reviewed impact heads; include repeated-customer observations, resolved recurrence, original dependencies shared/reused within the C10 bound, and a current eligible 100-gap report selection within C11. These are synthetic, not copied production records.

After warm-up, run at least 100 measured operations per list/detail/review class under five concurrent internal readers and a separate mcteer review stream. Measure end-to-end wall time including authorization/source fences, use nearest-rank p95, and fail if any class exceeds two seconds or a 100-gap preparation exceeds 30 seconds from admission. Report fixture cardinalities, dependency count, sample counts, query count, machine/environment and source digest. Assert independent totals throughout; do not speed up by disabling current checks. Compare report bytes/selection to the full bounded input.

Recovery runs both empty→049 and 047→049 on disposable environments with seeded predecessor records. Check runtime roles cannot rewrite immutable history or bypass maintenance grants. Kill/restart with a queued/running preparation, staged file, received decision and tombstoned request; verify one reconciled result, no restarted preparation and preserved markers/history. Run cleanup while disabled, and verify expired/global-invalidated data never reappears. Hosted readiness remains separately recorded, not inferred.
