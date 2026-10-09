# 012 Planning and Implementation Validation

**Date**: 2026-10-08
**Scope**: 012 implementation and executed acceptance. The planning and intermediate entries below are historical checkpoints; final acceptance is recorded at the end.

The specification records one answered authority clarification. The quality checklist is 16/16. The authored task list has 52 sequential unchecked IDs, 16 verbatim constraint quotations, four story phases and explicit coverage of 22 functional requirements plus seven buildable success criteria. All 52 tasks map to the scope. Research examined existing governed domain/report code; it did not execute runtime or hosted acceptance.

Documentation/link and whitespace checks are run at the end of authoring; their exact results are recorded below before the final read-only analysis. Analysis findings are returned in the planning conversation, without modifying files as part of analysis.

At the planning checkpoint, no implementation, migrations, database queries, browser tests, paid model calls or hosted rollout had been performed for 012. The planned runner commands, 15 initial automated suites, 24 browser journey/project combinations and performance/recovery gates remain unbuilt/unexecuted. No local/CI/Preview/Production acceptance is claimed.

## Executed planning checks

- `npm run check:docs` under Node 24: passed, 166 authored Markdown files and tracked-file hygiene.
- `git diff --check`: passed.
- Authored-artifact checks: 52 well-formed sequential unchecked tasks, all 29 FR/SC mappings, all 16 exact constraint quotations, no unresolved placeholders and no unmapped task IDs.
- Spec Kit setup/feature selection: explicit `specs/012-product-gap-feedback`; all design documents and tasks available. No extension hooks are installed.
- Workspace inspection: one worktree, the canonical `turas`, on `012-product-gap-feedback`. Changes are authored Markdown only; root agent/runtime source is unchanged.

These checks validate planning artifacts only. Read-only cross-artifact analysis follows them and is reported in the conversation.

## Implementation preflight

Implementation authorized via `$speckit-implement`. Canonical checkout on `012-product-gap-feedback`; checklist 16/16; no extension hooks. T015 reference corrected to T022. Migration manifest currently ends at 047. Installed Next.js route-handler and Server/Client Component guides read. Git/Docker ignore patterns cover dependencies, generated output, private config/state and owned artifacts. Existing selected environment/workflow files are not used by 012 runners.

### Initial authoring checks (implementation in progress)

Fresh owned loopback PostgreSQL, explicit migrations through provisional 048,
restricted runtime grants, and teardown: six foundation checks passed; four
proposal/review checks passed. `npm run typecheck:gaps` passed. These are narrow
checks, not the complete 012 acceptance gate or proof of hosted behavior.

The checks identified and corrected table-specific trigger field access and
confusion between retrieval projection digests and original content digests.
The dependency adapter now binds original bytes and traverses supporting profile
links. The authoring fixture uses separate product-context and customer-need
records so creating a need does not supersede its product-context source.

Remaining: complete evidence races and authoring transitions, HTTP/UI checkpoint,
canonicalization/counts, reports/export/handoff, retention/recovery/load, full
manifest and four-project WebKit acceptance. No provider calls or hosted changes.

### US1 local checkpoint

The authoring checkpoint passed 20 executed WebKit cases across desktop/mobile
and light/dark, with zero skips, under a fresh owned loopback app/database.
The source fingerprint matched before and after the browser run. Synthetic
desktop-light and mobile-dark narrative captures were visually inspected;
keyboard authoring, overflow and serious/critical axe checks passed.

The expanded foundation and authoring run passed 24 assertions in two suites,
including successful review replay after preview payload expiry, current-session
receipt denial, and 365-day receipt expiry into key-rotation-compatible tombstones.
The controlled evidence-race suite passed five assertions: immediate source
withholding with maintenance stopped, stale preview rejection, actor-local
revocation, concurrent source write and reader-prefix lock barrier.

US2 implementation is in progress. Its first five canonicalization assertions
passed on another fresh owned database, including atomic exhaustive merge,
member denial, new-observation stale preview, unlike-kind rejection and split
lineage. Pure customer sets/ranking/assignment checks passed three assertions.
These are narrow local checkpoints; the 15-suite acceptance manifest, reports,
handoffs, retention/recovery/load and complete browser journeys are incomplete.
No hosted or provider validation is claimed. Owned app/database resources were
removed by the runner; only ignored synthetic captures remain.

### US2 local checkpoint

The completed merge/split browser checkpoint executed 12 cases across all four
WebKit configurations, with zero skips and matching source fingerprints.
Synthetic desktop-dark registry and mobile-dark split captures were inspected.
The owned app/database were removed in finally; captures remain below ignored
`local-artifacts/012`.

Eight canonicalization assertions cover exhaustive assignments, flattened aliases,
fresh split identities, overlap/cycle rejection and impact-original withdrawal
after preview without an observation version change. Ten evidence assertions
exercise all six original kinds, transitive planning/execution, real artifact
selection/profile review, real shared publication, maintenance-stopped expiry,
ordered writer/reader barriers and the 200/201 dependency boundary. The artifact
fixture supplies synthetic scanner/extractor receipts; it does not prove a hosted
scanner or provider. Eight count assertions additionally cover confirmed
suppression, resolved recurrence/nonadditivity, retirement, cutoff/trend history,
reclassification and all three C10 overflow limits.

The shared-publication fixture exposed an existing runtime knowledge reader trying
to row-lock immutable revision tables without update rights. Its knowledge policy
now locks mutable source heads under the existing actor/customer write fence; no
immutable-history grant was expanded. Dedicated gap typechecking passed.

These checks are local story checkpoints. Full 15-suite acceptance, reports,
handoff, retention, load/recovery, regressions, CI and final documentation remain
uncompleted. No hosted change, deploy or paid model call was performed.

### US3 local checkpoint

Report browser validation executed 16 cases across all four WebKit projects,
with zero skips and matching before/after source fingerprints. The real owned
reports-worker handled admission to prepared state while 009 was disabled.
Cases covered all detail/portfolio sections, an empty portfolio, explicit
two-gap selection, customer disclosure and independent review, exact JSON and
Markdown downloads, and clearing content/downloads on a changed reviewed scope.
Synthetic desktop-dark header and mobile-dark review/export captures were
visually inspected. Downloaded JSON and Markdown were inspected by assertions
for matching sections, audience, scope and counts.

The composer passed six tests, lifecycle passed six, and release passed seven.
Current session revocation between 128-byte chunks prevents the next chunk while
leaving another member's eligible report intact; cancellation, head changes and
tampered bytes also fail closed. A separate foundation/release run passed 19
assertions on a fresh database. Dedicated gap typechecking passed. These are
story checks, not full acceptance: disk/crash/admission bounds, handoffs,
retention, benchmark/recovery, complete browser manifest and CI remain.

All running test resources were removed by owned teardown. Only private ignored
synthetic captures and exported fixture files remain. No hosted setup, provider,
renderer or outbound delivery was used.

## US4 and first deterministic checkpoint (local synthetic only)

The owned US4 run passed four WebKit cases (one per required project) at
`local-artifacts/012/us4-ui-5671b1ce-6c48-4d79-b6dd-98f7bc85021d`.
The mobile-light withheld-history capture was inspected: no horizontal overflow,
withdrawn notes/references absent, chronological attribution retained and only
metadata follow-up available. Subsequent handoff/retention tests passed11
assertions, including expired metadata-only follow-up and revoked reviewer replay.

The first full15-suite manifest passed100 assertions without skips at source
`03b8af8d8a560e049f859bacf9a8e10fb2808ebc2982a4517a5f1f9e6b331d85`.
This is an intermediate checkpoint, not final acceptance for later edits. The
first six-journey browser gate passed16 desktop-light cases and failed one
stale-result test because its interception omitted the real query string; no
browser acceptance is claimed. Typechecking also identified the test's incorrect
unroute signature, which was corrected before rerun. Recovery, benchmark, CI and
remaining retention/contract boundaries are still required.

## Cross-cutting local checkpoints

Intermediate source `481f4a3d5cb04a3677e7fd157c3d4ce971df9d54dee4d61497eb35f788bb3ff4` passed all six browser journeys in four WebKit projects:80 assertions, zero failures/skips. Subsequent hidden-response coverage increased the corpus to 84. Source `56773cfaea21a75d73428da168f4e1a43ae8486e1a042953599c61b3decbb515` passed all 84 and both recovery paths. Mobile-light merged counts and withheld handoff captures from `local-artifacts/012/ui-Xuy1JF` were inspected: no overflow, distinct suspected-only customer count1 after merge, old handoff notes/references absent and metadata-only follow-up available. These are local synthetic checkpoints, not hosted proof.

The first independently counted benchmark passed at source `33aaebedf13446cdbec3a394c1bf20f3605936575598163d09fb65b809c010e3`:200 customers,2000 gaps,10000 observations,40000 revisions,10000 reviewed impact heads and200 original dependencies. List p95 was782ms, detail42.7ms, review18.3ms and100-gap/200-customer preparation7744.8ms. Its review stream followed the list/detail measurements; the final runner was strengthened to require actual reviewer overlap during both classes. Only the final concurrent run can satisfy final SC-005 acceptance.

Retention now covers exact schedules, stopped-worker time-only quality expiry without changing originals, original-expiry-based report/handoff purge deadlines, missing-file reconciliation, tamper quarantine, untouched009 objects and90-day obsolete payload removal while preserving old current heads. Domain reads also withhold critical impact prose immediately when quality is no longer adequate, independently of the timer. A controlled acceptance race uses actual PostgreSQL blocker identity, proving a winning source/head writer leaves no accepted head or partial decision. Earlier query-text-based barrier detection was too narrow; that failed check was corrected and rerun rather than claimed as acceptance.

At source `7cefa16c316a39c48718c0cf9617808491ef56cbd43b98195871589cd8d0df30`, the canonical15-suite runner passed113 assertions with zero failures/skips. The complete owned web/eve build passed. The prior build copy omitted `playwright.config.ts`; adding that checked-in file to the owned copy resolved the genuine type-check failure. The unrelated existing eve bundler and staffing `createRequire` warnings remain visible; no deployment or provider invocation occurred.

The expanded003–011 regression gate passed40 suites and197 assertions with zero failures/skips at that same source. It covers profile/research/knowledge originals, conversation ownership/archive,009 HTTP authority and private-store parity,010 support authority/transport, execution and expansion ownership/races. Each execution suite owns a fresh clone to avoid immutable calendar/resource contamination. Guarded fixture hooks reset only owned synthetic quotas between independent cases, preserving real enforcement inside each case. No paid model evaluation was rerun. Both empty→049 and047→049 root-supervisor recovery paths also passed with preserved predecessor/workflow identities, exact crash cleanup, no automatic retry and tombstone verification after key rotation.

CI has five012 matrix gates and validates canonical counts plus common source fingerprints, including owned web/eve build evidence. Hosted migration, setup, deployment, real-customer rollout and Preview/Production acceptance remain pending; no local result certifies them. The selected `.env.local` hash is guarded internally by each012 environment owner and is never printed. Canonical agent model/instructions remain unchanged.

## Final audit corrections

FR-011 now displays a conservative source-freshness signal separately from review recency and ordering. Current accepted evidence, source-free narratives and withdrawn impact evidence are checked in the real count projection; pure tests cover recent, aging, unknown, stale and unavailable precedence. Source `1254642d3237452359e5e9b9217a22917d54bda4fad65d04fbb72eb9635b21b8` passed115 domain assertions,197 regression assertions, builds and both recovery paths. Its new browser assertion failed due to an unscoped duplicate-text locator, corrected to the selected gap card.

Source `25340fb13ff1ffea79df72be95688e9dd6e847e77b0388943704870ffe421af5` passed115 domain assertions,197 regression assertions and builds. Recovery exposed a real harness timing race: a SIGKILL can leave the valid180-second cleanup lease, exceeding the prior15-second recovery observation. This is not claimed as passing final recovery; the final bound must permit the real lease deadline. The source also removes obsolete planning-only README/roadmap statements.

The corrected browser gate passed84 cases (21 per project, six journey files, four WebKit projects), zero failures/skips at `25340fb13ff1ffea79df72be95688e9dd6e847e77b0388943704870ffe421af5`. Mobile-light `gap-merged-counts.png` and `manual-handoff-withheld.png` in `local-artifacts/012/ui-bpz4Ce` were inspected: no overflow, freshness separate from ordering, one suspected-only customer after merge, withdrawn notes/references absent and metadata-only follow-up available. Subsequent source changes are limited to removing two trailing blank lines and widening the recovery observer to195 seconds (180-second real lease plus polling/start margin); owned recovery deadline600 seconds per path. CI runs all gates at the resulting final fingerprint.

## Final stable-source local acceptance

Final source fingerprint: `e3354046d46244d59cccdcff7675abdc71a73bc06d20072983c99c2e34c043ce`. Under Node24 in the canonical checkout, `typecheck:gaps` passed; the15-suite manifest passed115 assertions, zero failures/skips (`local-artifacts/012/tests-e867c650-a0e5-4298-9f3e-356df99bad0d.json`). Existing web/eve builds passed (`local-artifacts/012/build.json`), retaining the previously recorded unrelated warnings. The40-suite regression gate passed197 assertions, zero failures/skips (`local-artifacts/012/regressions-r9ep4b/completed.json`). Both root-supervisor recovery paths passed with schema49, predecessor/workflow preservation, SIGKILL recovery, disabled cleanup, no preparation retry and retained tombstone verification after rotation (`local-artifacts/012/recovery-NQmiME/completed.json`). Browser and benchmark completion follow below.

`check:docs` passed166 authored Markdown files. Staged and working whitespace checks passed; staged review includes only012 source/tests/governance/operational changes and excludes selected configuration, workflow state and private synthetic artifacts. `git diff --exit-code b5d5427 -- agent/` passed. CI YAML parsed. These results are local synthetic evidence, not Preview/Production acceptance.

At the same final fingerprint, the complete WebKit gate passed84 assertions (21 per project), six journey files, four projects and zero failures/skips (`local-artifacts/012/ui-uQvwJl/summary.json`). Dark mobile merged-count and withheld-handoff captures were inspected as well: distinct counts, separate source freshness/review recency, no horizontal overflow, withheld prose absent and metadata-only history/follow-up visible. No host browser was operated.

The final independently counted concurrent benchmark passed at the same fingerprint on Darwin/arm64,18 CPUs, owned environment `test-gap-cf0d7ce207dc`:200 customers,2000 gaps,10000 observations,40000 revisions,10000 reviewed impact heads and200 dependencies. Each read/review class measured100 operations with five readers. List p95=1192.80ms with4 overlapping reviews; detail p95=87.05ms with2 overlapping reviews; review p95=23.36ms, preserving actual production quotas. Detail calls have250ms inter-operation pacing, excluded from each call's measured duration and explicitly recorded. The100-gap/200-customer admission-to-prepared report completed in7849.52ms. Total measured query count169672. All required bounds passed; no CPU-intensive acceptance gate ran beside the benchmark.

All52 tasks are complete. The focused PR is prepared with actual checks and hosted risks. At this commit, GitHub CI results are not yet available; consult the PR checks for independently executed CI status. No Preview/Production migration, release, real-customer acceptance, paid model evaluation or external handoff was performed. Post-implementation hook audit: `.specify/extensions.yml` is absent, so no hooks apply. Owned resources are torn down; only ignored synthetic evidence is retained. The canonical checkout remains the only worktree.

## Clean-CI prerequisite correction

PR23 initial run `37888393869` exposed missing clean-runner prerequisites: the012 matrix omitted the existing extractor package install, and the owned runner used a mutable image tag instead of the repository's pinned PostgreSQL17/pgvector0.8.6 digest. Both are corrected without changing application behavior or dependency versions. Existing011 recovery also assumed the entire repository manifest always ended at47; its exact final-schema assertion now reads the current manifest, retaining the45 predecessor check and requiring at least47. Initial CI is not claimed as passing. Final corrected-source results follow.

The corrected clean-CI run passed012 domain/build, recovery and regressions, and011 recovery/native gates, but its two-CPU list benchmark correctly failed with p95=3454.86ms. Investigation found repeated original-locator rows and per-item header retrieval in the registry page. Locator deduplication now preserves the full reference binding; a new real integration check first demonstrated the previous ID-only collision could incorrectly mark a changed locator eligible. Bounded page headers are batched while acquiring state/payload share locks, and every selected narrative still receives current source verification. Existing007/008/011 regression-discovery filters also lacked the new gap prefix; they now exclude only012 suites, preserving their earlier cohort counts while012 has its own complete manifest. These failures are recorded, not claimed as acceptance.

The first clean-Linux browser project exceeded the outer240-second process allowance and was killed before producing a complete JSON report. The outer bound is now600 seconds per21-case project with2580 seconds for the owned gate and a50-minute CI job; individual30-second test deadlines, zero retries/skips and all84 cases remain enforced. Failure diagnostics expose only fixed case file/line/status/categories; a sentinel test proves private browser error prose is excluded.

Request profiling identified PostgreSQL row parsing, redundant original-reference payloads and repeated synchronous eligibility/critical-quality calculations. Count queries now return only consumed metadata, preserve full execution/baseline reference payloads, and cache deterministic checks only inside one held source fence and cutoff. Gap rows are refreshed under share locks for disposition-only decisions whose reviewed/selected head and canonical state are unchanged; changed heads still fail closed. A real controlled concurrent-decision test first failed on the old stale-version behavior, then passed; the complete15-suite manifest passed118 assertions with zero failures/skips. A15-request diagnostic profile improved from2.418s to2.025s; this diagnostic is not benchmark acceptance. The obsolete local benchmark was stopped after its CI counterpart failed; its exact marked container and owned directory were validated and removed, with no acceptance claimed for that interrupted run. Final normative benchmark remains unchanged.

The next Linux benchmark improved list p95 to2394.56ms but still failed the unchanged2000ms limit. An internal SQL reference dictionary was measured and discarded because its joins/aggregation were slower. The retained change interns identical complete serialized reference arrays only inside the current request, parsing each distinct array once; exact locator distinctions remain intact. The15-suite manifest passed118 assertions at `716d9b13f7ba346495a6e9a730705acd27745b70e05aa462ce8668a163aa1efd`. The local diagnostic measured1.946s for15 calls, not normative acceptance. Linux WebKit also exposed cold-route timeouts; the owned runner now compiles all journey routes with unauthenticated GETs before starting the unchanged30-second browser cases. No mutation or authorization is bypassed by this preparation. Final-source acceptance remains required.

## Corrected-source acceptance checkpoint

Source `c5ddd24bfb428ba94015434ac411f21af73f4f12a3c8c5921226ab694d29b308` passed typechecking, all15 domain suites/118 assertions, all40 regression suites/197 assertions, existing web/eve builds and both empty→049 and047→049 recovery paths. All counts have zero failures/skips. Evidence: `local-artifacts/012/tests-67e297ab-dca1-4811-8978-230f16f2bd76.json.summary.json`, `build.json`, `regressions-EdUhCZ/completed.json`, `recovery-vm1klz/completed.json`. The full six-journey/four-project WebKit run passed84 cases (`ui-Zor1Gr/summary.json`). Final dark-mobile merged-count and withheld-handoff captures were inspected: no horizontal overflow, separate evidence freshness/review recency, distinct suspected-only customer count and metadata-only withdrawn handoff history. Agent content remains identical to merged011; authored-doc hygiene passed166 files. Normative local benchmark and independent CI remain pending at this checkpoint; the diagnostic profile is not acceptance.

The concurrent benchmark completed at that same checkpoint (`benchmark-bUPjkC/completed.json`):100 list/detail/review samples, five readers, actual reviewer overlap3 list/1 detail, list p95=667.31ms, detail p95=81.64ms, review p95=23.63ms,100-gap/200-customer report7847.96ms,165385 measured queries. Independent Linux/x64 CI (4 CPUs) passed the identical fixture and unchanged bounds: list p95=1950.51ms with7 overlapping reviews, detail p95=100.63ms with2, review p95=62.39ms, preparation13435.34ms;161913 queries. Run37891539226's012 domain/build, recovery and regressions also passed. This is synthetic local/CI evidence, not hosted proof.

That run exposed an intermittent earlier011 native-interruption harness race: its synthetic provider barrier was released immediately after supervisor restart, allowing a draining old request to finish. The barrier now stays closed through terminal settlement, retaining the existing rejection of completed content and exact one-provider-call assertion. The initial local wrapper was correctly rejected because it selected its test source as the application database; the wrapper now declares a distinct nonexistent application name and owns the real disposable source. Neither configured application database is used. This final test-harness correction changes the common fingerprint; final matching acceptance follows.

The native-interruption correction passed both actual-framework normal and interrupted checks in the owned setup, with exactly one interrupted provider call. At `58cd24ec400fa2b921447de3b53d101650cfeada194e4dac83f85946877d6873`,012 again passed118 domain assertions,197 regressions, both builds/recovery paths and84 WebKit cases locally. Linux WebKit still timed out on the same14 desktop-light cases, proving route warming alone was insufficient; no CI browser acceptance is claimed. Bounded per-case diagnostics now expose only fixed route categories/method/status, fixed UI status labels and whitelisted source file/line/column/operation. An expanded sentinel assertion proves private response fields, unknown labels/routes and stack directories are excluded. Individual browser deadlines and all84 cases remain unchanged. A further corrected-source gate is required after diagnosis.

Run37892947387's benchmark repeated at list p95=2142.11ms, so the prior1950.51ms CI pass lacks sufficient margin. Metadata and observation queries now use explicit array rows, exact floored epoch milliseconds (preserving JavaScript Date precision), and request-local reuse of identical immutable timestamps/field/reference values. All current authorization and sorted source/state locks remain intact. Diagnostic15-call time improved from1.946s to1.761s; this is not normative acceptance. Source `8792b7d6b086d8ffea04344d011063b90299b379662a23b096155a4af2c0fd1b` passed118 domain assertions,197 regressions, builds, both recovery paths and84 WebKit cases locally.

The fixed Linux UI diagnostics identified a server stall: the first failing case remained at the loading state, and subsequent cases timed out in login without receiving responses. The owner was synchronously awaiting Playwright while also owning captured server-output pipes, preventing it from draining Linux's smaller pipe buffers. Browser discovery/execution now use bounded asynchronous subprocesses. A regression test proves the parent drains an8MiB supervised pipe while its browser subprocess waits; another proves deadlines and output caps remain enforced. All six journey files,84 cases,30-second test deadlines and zero retries/skips remain unchanged. Final full acceptance and PR readiness tasks are reopened until the corrected source passes; prior checkpoints above are historical evidence.

At source `7ded328b97fdbd7fd4479d005e319f720d7128845d45e1080ed1e15851b87936`, all120 domain assertions,197 regressions, builds, both recovery paths and84 local WebKit cases passed. Final inspected mobile captures are in `ui-7I8bDa`. The independently counted concurrent benchmark passed locally (Darwin/arm64,18 CPUs, owned environment `test-gap-9bf0a4c6db35`): list p95=608.45ms with3 overlapping reviews, detail p95=92.12ms with2, review p95=22.76ms, preparation7385.17ms,164765 queries. Linux/x64 CI (4 CPUs) also passed: list p95=1918.49ms with7 overlapping reviews, detail p95=116.01ms with2, review p95=47.07ms, preparation16742.27ms,162905 queries. Both use the exact200/2000/10000/40000/10000/200 customer/gap/observation/revision/reviewed-head/dependency cardinalities and unchanged production quotas.

The asynchronous runner resolved the server stall: CI completed all21 desktop-light cases. Desktop-dark then exposed one actual cancellation UI race: the server returned200 for cancellation, but a late download AbortError could replace the confirmed-cancellation status. The existing browser case now deliberately holds the abort rejection until after cancellation acknowledgment, first failing the old UI and passing the corrected UI. Explicit cancellation intent suppresses late download error/status changes and browser download creation; controls wait for a known admitted export identity. The receiving transition ensures that identity is rendered reliably. The runner now also rejects any explicit subprocess error even if an exit status is0, and operation diagnostics inspect the actual first error line rather than source snippets. All84 cases and their deadlines remain unchanged. These corrections require one final matching-source acceptance run; prior green benchmark/browser results are retained as checkpoints, not final acceptance for later source.
