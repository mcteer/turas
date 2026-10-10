# 015 Validation Record

## Current acceptance

Final implementation and authored design source:
`f70891997ac393f4cd26b685f1ece2e8e759fef34cedb413e6fb896324589b60`.
All seven complete local gates passed on this exact fingerprint. Earlier captures
remain historical evidence. A reviewable PR is prepared; CI acceptance is pending.
CI and hosted acceptance are separate. Production remains unchanged at schema 054.

| Gate | Local evidence |
| --- | --- |
| `typecheck:mcp` | Passed |
| `check:docs` | Passed; 206 authored Markdown files and tracked-path hygiene |
| Staged diff / credential patterns | Passed; private/generated paths excluded; no added private-key/token patterns |
| `test:mcp` | Passed: 19 suites/54 assertions, zero failed/skipped, production runtime |
| `mcp:consumer:check` | Passed: 19 suites/54 assertions, actual SDK consumers in 3 suites |
| `build:mcp:check` | Passed: web/eve production builds |
| `mcp:ui:check` | Passed: 32 cases in all four configurations, zero failed/skipped/flaky |
| Safe visual review | Four synthetic screenshots inspected: desktop/mobile × light/dark; bounded layout and visible focus; serious/critical axe zero |
| `mcp:recovery:check` | Passed: empty/054 backup restore, explicit 055/grants, restart, persistent revocation, interrupted owned cleanup and learning 054/055 compatibility |
| `benchmark:mcp` | Passed: five categories ×100 actual SDK reads, zero quota resets, all over-limit trials denied |
| `test:mcp:regressions` | Passed: complete eight-part run with counts below |
| CI verifier | All seven final-source receipts accepted; earlier stale fingerprint and missing regression evidence rejected |
| Paid provider calls / hosted proof | Zero / none |

The preceding fully completed source was
`f52e08305aecbc48797da7ddad46805175b8968dc63b0f90971313d62e3e8690`.
Later changes removed one terminal blank line and replaced stale planning-only
status prose in tasks/handoff. No behavior changed. Fresh complete receipts are used rather than relabelling earlier captures.

## Regression manifest and measurements

The complete final-source regression run recorded these independently owned gates:

| Cohort | Complete result |
| --- | --- |
| 014 domain/native | 18 suites / 77 assertions |
| 014 standalone native | 25 checks; no actual-model quality claim |
| 014 WebKit | 5 journey files ×4 configurations / 32 cases |
| Earlier knowledge/retrieval/conversations/reports/support/execution/expansion | 40 suites / 197 assertions |
| 012 Product Gaps | 15 suites / 120 assertions |
| 013 partner enablement | 11 suites / 57 assertions |
| Earlier authority/private-conversation/partner browser manifest | 13 files / 52 assertions including all four WebKit configurations |
| Protected hosted-watchdog units | 5 assertions |

All completed cohorts had zero failed/skipped cases. Their own feature fingerprints
and exact manifest receipts are retained in ignored `local-artifacts/015/` captures.
Final cohort fingerprints: 014 `2a42134a84a89ecde0694364f219375e257c17b8c33c4fb1c7f6ad54155ed640`;
012/earlier `9a49af2545b8da364e35c74a1edadafdf3324bd3fd1d51ce7c2617d153d6784f`;
013/partner `0be82d269b71f5fa893e14e9baae9423f12e77433b571b09a4a3a75edffd9905`.

The final-source 500-read benchmark reported p95 profiles 78 ms, evidence 86 ms,
knowledge 85 ms, plans 76 ms and reports 88 ms. Client/transport overhead p95 was
11–13 ms; quota waits 147–149 seconds per category were reported separately and
excluded from read latency. No quota reset or paid dispatch occurred. These owned
synthetic local measurements do not establish hosted capacity.

## Covered boundaries and development corrections

Actual SDK 2.3.1 consumers negotiate protocol 2026-07-28 against the production
Next route. All twelve tools are exercised across the complete manifest, including
unknown/mutation/approval/research/generation/export/send denial. Explicit browser
and MCP read-authority paths preserve existing write/native boundaries. Tests cover
browser logout, individual revocation/expiry, current partner grant loss, peer/admin
management, immutable ceilings, concurrent active-cap creation, exact UUID replay,
uncertain creation reconciliation, credentials absent from DOM/storage/captures,
current-source withdrawal through final serialization, opaque credential-bound
handles, expired handles, independently committed quota charges, 2/4/16 concurrency,
malformed/oversized/legacy requests, deadline/caller cancellation, missing runtime
grants, disabled maintenance/reconciliation and bounded cleanup.

Content checks include accepted versus pending/internal/commercial/personnel data,
22-item profile pagination, confirmed conflicts, stale evidence, knowledge-only
reading without customer grants, a 101-candidate ineligible scan, no originating
knowledge coordinates, accepted plans with newer drafts, partner delivery audience,
corrected report identity and oversized complete projections. MCP report fences also
exclude commercial/personnel originals throughout supporting execution/plan source
closures. Workers remain stopped during synchronous source-denial checks.

Development corrections included strict summary DTO parity, unique peer names
between UI configurations, real fixture transaction/date/column alignment, bounded
HTTP completion during stalled pool/cleanup waits, and a single database timestamp
for synthetic ten-second leases. The maintenance scheduler unit now verifies the
eleventh MCP timer runs independently of a stalled conversation watchdog. Failed,
partial and interrupted captures never count as acceptance.

014 withdrawal/rollback previously timed out in two CI runs despite complete local
passes. PR27's non-sensitive diagnostics and green run did not establish a root
cause. The complete current regression gate must continue to exercise that browser
journey; no root-cause claim is made here.

## Dependency and release boundaries

SDK server/client/core are pinned to 2.3.1 with upstream Apache-2.0 metadata.
The lockfile changes no existing dependency versions and adds six SDK packages.
The audit capture lists existing eve, next, source-map-js and undici findings;
no newly added MCP package appears in that capture. Migration 055 bytes match the
version-55 manifest. No handler initializes or migrates a schema.

Private evidence stays ignored under `local-artifacts/015/`. Owned environments
preserve the root selected configuration, agent model and workflow state and remove
only labelled resources belonging to the run. No sibling checkout is created.
No post-implementation extension hooks are registered.

T046 remains pending explicit merge/release authorization and completed green CI.
Production is still the previously validated schema 054 deployment on main
`80c8f3422abd1e0978960bc0531ad5f0df5a1038`. No hosted migration, activation,
customer/grant creation or manual deployment occurred. Partner currently has no
active Production assignments, so positive assigned-record coverage remains absent.
After authorization follow [MCP operations](../../docs/mcp-operations.md): selected
backup/restore rehearsal, explicit 055/grants, disabled compatible deployment,
activation, actual Production HTTP/SDK/CLI WebKit checks, disposable credential
revocation, exact deployment/coverage record and merged-branch cleanup.

## Authorized release preparation

The maintainer authorized release on 2026-10-10. PR28 CI on `b571213` passed
six MCP gates but the earlier standalone learning native job denied dispatch
without reporting a status/code. The owned learning harness now waits for a real
fresh maintenance heartbeat instead of assuming readiness after 250 ms; failed
dispatch reports only fixed HTTP status and a bounded error code. The complete
standalone native gate passed all 25 checks locally after this change. This addresses
a readiness race; the original CI failure did not capture enough detail to prove
its cause. Complete CI on the corrected source remains required before merge.
Earlier seven-gate local evidence above remains tied to its stated source, not
relabeled as evidence for this harness correction. No domain behavior changed.

The corrected-source CI again hit the known 014 mobile-light rollback-review
failure. A targeted browser regression then reproduced an actual form-unmount bug:
a visible-document window blur cleared the metadata-only publication control and
removed its historical revision picker. Publication control now preserves metadata
on such blur and refreshes without unmounting on focus. Private views retain their
blur clearing; every view still clears when the document is hidden. The rollback
journey checks picker survival and hidden-document withholding before completing
rollback. The complete five-file/four-configuration learning WebKit gate passed
32/32, zero skipped, on 014 fingerprint
`d3a215f71beab1b96cf09cc1444b04f041c01f98eaef041b8ec564831baa575c`.
This establishes the reproduced focus defect and its fix, without pretending the
older timeout-only captures identify their exact failing action. Finer fixed
rollback phases are now reported on failure. Full final-source CI is required.

On `ad9cc9a`, standalone learning WebKit passed in CI, but the nested MCP
regression wrapper failed its learning WebKit cohort. The wrapper previously hid
that cohort's fixed diagnostics in a private capture. It now forwards only the
bounded project, phase, public test filename/line, fixed failure status/signatures
and process-failure flag. It never forwards assertion messages, DOM snapshots,
arguments or source prose. No retry or acceptance gate was relaxed.

Release review found MCP retention wired only into the local worker. The protected
hosted watchdog now starts an independent nonoverlapping thirty-second MCP cleanup
timer, clears it on exit and drains its active tick. Six hosted-watchdog unit checks
pass, including independence while conversation claiming stalls. The complete real
eve native gate passed 25 checks with `hostedMcpCleanup:true`: after stopping the
local worker, it created/revoked an owned synthetic credential, confirmed its hash
was retained, then observed the disabled hosted adapter purge that hash while
retaining both permanent management receipts. No model/provider call was introduced.
This operational correction needs final-source CI and a renewed rehearsal before
Production activation. The local nested learning WebKit cohort also passed with the
focus regression; the remaining full regression cohorts are running.
