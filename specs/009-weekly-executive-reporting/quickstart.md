# 009 Implementation and Validation Guide

**Status**: Planned commands and gates. The scripts named below are implementation
tasks and do not exist yet. No result in this document asserts that 009 has run.
Start with `SPECIFY_FEATURE_DIRECTORY=specs/009-weekly-executive-reporting` and the
checked-in `$speckit-implement` skill after switching models.

## Prerequisites and Isolation

Use Node 24, the locked repository toolchain, local container runtime and a marked
owned test database. Preserve `.env.local`, the app/Preview/Production databases,
all existing artifact stores and `.eve/.workflow-data`. Test setup must derive a
fresh owned database/roles/ports and private report root; reject arbitrary destructive
overrides. Never log secrets, recipient addresses, connection URLs or report bodies.

Install only the dependencies in the plan during implementation. Explicitly prepare
the pinned report renderer and approved synthetic fixture font/asset manifests;
require image digest, font hashes, Chromium/LibreOffice/Poppler versions in evidence.
Do not fetch assets at render time. Actual private/customer data is excluded.

The implementation evidence ledger is `validation.md`, created by T001. Record
exact commit/source digest, command, environment class, fixture/version, start/end,
counts/skips/retries, result and limits. Store raw private output outside Git.
No independent-review or hosted-ready claim without corresponding actual evidence.

## Planned Commands

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
export SPECIFY_FEATURE_DIRECTORY=specs/009-weekly-executive-reporting
npm run reports:prepare
npm run test:reports
npm run reports:artifacts:check
npm run reports:ui:check
npm run benchmark:reports -- --disposable
npm run reports:recovery:check -- --disposable
npm run test:reports:regressions
npm run typecheck
npm run build:check
npm run check:docs
```

`reports:prepare` checks configuration/image/fonts and fixture ownership; it never
migrates an arbitrary app database. The isolated test runner applies migrations
explicitly to its owned databases. Root `npm run dev` supervises the report worker
when its private root/config is enabled. No live sends in deterministic/UI runners.

`reports:delivery:check` is a separate opt-in real-provider command requiring exact
synthetic publication and an explicitly authorized test recipient. It must refuse
without these prerequisites, configured verified sender and current application
send approval. `reports:release:check` aggregates evidence and readiness; it cannot
turn missing live/hosted evidence into a passing local claim.

## Acceptance Gates

| Gate | Required Evidence |
| --- | --- |
| A — Domain and weekly | SC-001 six weekly cases; exact approval/rejection/correction; supported facts; canonical period/DST, missing denominator and integer arithmetic oracles |
| B — Policy and audience | SC-002 full API/job/file/receipt matrix; recipient metadata isolation; malicious instructions; hidden-count/percentage leak cases; no model calls |
| C — Delivery | SC-003 duplicate/same-key conflicts, two-worker races, crash before/after intent, partial recipients, provider outage/timeout, 23-hour boundary, revocation, repeated/out-of-order signed events |
| D — Executive files | SC-004 six pairs below, structural/content parity, visual review of every page/slide and actual edit/save/reopen |
| E — Load | SC-005 workload and thresholds below, correctness and finite limits at concurrency |
| F — Workspace UI | SC-006 four CLI WebKit projects, substantive workflows, sanitized captures, no skips/retries, accessibility and overflow |
| G — Upgrade/recovery | SC-007 empty and 038 upgrade, immutable/runtime-role denials, paired-store restore, stale cleanup lease, no resend and preserved earlier features |
| H — Controlled release | SC-008 real authorized synthetic mail and provider evidence; actual artifact/edit review; separately recorded local versus hosted readiness |

All behavior gates are required for complete 009 acceptance. Missing credentials,
brand review or live-test authorization is reported as a pending H prerequisite,
not replaced by a fake passing result. Development and local synthetic validation
can proceed without that external configuration. Hosted acceptance remains a
separate gate when its environment is explicitly selected.

## Story Journeys

1. **US1**: Accept a 006 plan through real domain commands, initialize 008 execution,
   review an activity/milestone and actual time; retain a pending correction. Prepare
   the previous week as panel, review exact output as mcteer and replay publication.
   Run empty, partial, late correction and baseline replacement variants.
2. **US2**: Approve a fixture policy, schedule a weekly draft, review publication and
   send preview. Use fake provider boundary responses for accepted/delivered/timeout/
   rejected recipients. Restart the worker, replay events and show one logical send
   identity per recipient with truthful uncertainty. Repeat with a changed/revoked policy.
3. **US3**: Prepare each fixture pair, render, inspect and approve a synthetic brand
   profile. Download both exact artifacts; compare sections/metrics/labels, edit native
   slide text/table/chart data, save/reopen/render and verify the change persists.
4. **US4**: Revoke partner grants and withdraw each supported original-source kind
   between capture, render, preview, download chunks and dispatch. Confirm immediate
   withholding, exact cleanup and correction history with no replacement deletion.

## Artifact Matrix

| Pair | Scope and Stress |
| --- | --- |
| 1 | Normal complete month, one customer, multiple selected engagements |
| 2 | July–September quarter (92 days), actual/budget/remaining distinctly labeled |
| 3 | October–December quarter (92 days), year boundary and future-period rejection variant |
| 4 | Empty reviewed activity/missing outcome baselines, all narrative sections with gaps |
| 5 | Current partial month, comparable measurement windows and late approved correction |
| 6 | Maximum supported narrative/table/chart labels, multiple continuations, all audiences and restricted-source redaction |

Use a fixed test clock so future rejection and complete-quarter cases are consistent.
Additional negative fixtures: beyond 40 pages/slides, extra chart categories, oversized
mail, malicious source markup, unsupported glyph, missing font, missing/revoked brand,
invalid links and source withdrawal after final render. These must block release.

Extract PDF text and inspect font/tag/outline information. Inspect PPTX ZIP XML for
native text/tables/charts plus embedded chart workbooks, notes/hidden content and
properties. Render every page/slide with the pinned tools; review images rather than
only a contact sheet. Record the actual supported editor/version with installed
approved Geist. LibreOffice evidence does not prove identical PowerPoint output or
universal font portability; record those limitations accurately.

## Performance Workload

Seed 1,000 engagements, 500 synthetic resources, 50,000 reviewed/pending time
revisions, 20,000 reviewed/pending delivery revisions and 5,000 report histories.
Keep each selected report within C02/C04 limits and also test explicit overflow.
Generate independently computed expected values and cross-customer sentinel fields.

After 10 warmups, measure 100 calls per class at five concurrent users: customer
report list, report detail, source/history page, recipient-policy page, delivery
history and review acknowledgement. Require every class p95 ≤2 seconds and zero
correctness/authorization failures. At concurrency two, 20 weekly preparations each
finish ≤30 seconds; 12 executive render pairs each finish ≤120 seconds. Record
actual machine/container limits and queue time separately; no average hides a failed
class. Test queue/rate bounds and fair progress across customers.

## Failure and Recovery Drill

- Apply unchanged prior migrations through 038, then new 039–041; also start empty.
  Verify prior 006/007/008 decisions, active stores and migration checksums remain.
- Prove runtime cannot mutate immutable report/recipient/artifact payloads or broadly
  delete them; exact cleanup roles reject wrong environment/digest/token/generation.
- Crash after staging/render completion, before publication commit, before network,
  after provider acceptance/before response persistence, and during cleanup.
- Restore the paired report catalog/store with DB and existing Eve store preserved.
  Orphan handling must keep legitimate report bytes and never touch upload roots.
- Verify unknown dispatch becomes uncertain; expired leases cannot resend it.
  Stale cleanup cannot remove a corrected publication or renewed artifact.
- Disable 009 and confirm older workflows remain usable, new report work is refused,
  and authorized reconciliation/status/cleanup still function.

## Release Inputs and Honest Completion

Document variable names only in `.env.example`: report store root/renderer image,
worker enablement, feature-disable flag, sender ID/from address, Resend API key,
webhook secret and recipient digest key. Secrets stay private. No copied legacy
credentials, customer recipients or brand approval claims.

Before a live test, show the concrete synthetic report, brand sample and exact
recipient/sender through the implemented review flow. Obtain the required decisions
there; no blanket approval is inferred from reading this plan. Record provider ID
privately, sanitized receipt state in validation, and no real recipient address in Git.
Production mail, provisioning/DNS changes and deployments require their own explicit
scope. A future hosted release must prove its worker/store/webhook/readiness and
recovery in that environment rather than citing the local suite.
