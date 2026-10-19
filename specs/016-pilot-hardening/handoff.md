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

## Current execution checkpoint

Execution incorporates released main f8d196f; Production remains schema077.
Unreleased078/079 are exercised only in owned targets. The079 manifest now also
contains owner-controlled maintenance profile admissions; older rehearsal receipts
retain their original manifest/source identities. Fixed HTTP profile access and
restricted-runtime teardown have focused positive/denial/concurrency proof. Full
private-byte/recovery verification, hosted journeys/configuration, actual cadence,
participant observations and the owner decision remain unfinished. The779-case/142-suite
local catalog passes at e9d2c21; its source-bound receipt is retained. The updated
782-case/143-suite catalog includes the asynchronous UI-child regression cases
and requires fresh complete acceptance after implementation. Production remains
released f8d196f/schema077 after verified bypass credential repair. No016
Production migration, feature merge or directory cleanup is implied.

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
The next run at `d2715a4` passed all Product Gaps projects but failed composed
native E08 binding (503). The owned native harness now requires a non-mutating
422 authenticated validation before conversation/advice admission, bounded to
20 seconds without retrying creation, messages or providers. Three eve boundary
cases prove no delegation/claim on the probe; actual native E08 also passed in a
focused check. Current complete CI is still required; see the final validation
section rather than treating standalone or selected proof as full acceptance.

Latest resumed work: owned legacy storage copying and strict physical restore timing
are implemented and documented. The expanded full local catalog passed 653/653 in
112 suites (`run-0c4e47a4-40a0-4fd2-b9ac-aed3648b7315`), attributed to its exact
uncommitted source digest in validation. Three failed full attempts are retained.
Required CI `38326648341` passed 43/43 at committed `94d3dc3`; that does not validate
subsequent uncommitted changes. No commit/push or hosted change was made. T045/T057
remain pending for their complete cutover/recovery acceptance, and the task count
remains 62/84. Do not restart the earlier unchanged CI investigation.

Next: finish unchecked storage/capture/current-authority/restore/runbook work
(T045/T051–T059), then the required actual-model/operator and hosted journey
requirements. Apply only concrete authorized infrastructure/budget scope; do not
merge/deploy merely because local/CI corrections pass. The 62 checked tasks are
scoped implementation/local/CI proof; 22 tasks still require implementation or
operational acceptance. Independent operator/participant feedback,
two real scheduled backups at least twelve hours apart and the actual scoped
mcteer readiness decision cannot be supplied by automated fixtures.

## Resume and validation

2026-10-13: `--reconcile-owned-work-denials` now connects independently retained
encrypted v6/schema-057 metadata to actual owned-target denial application and
permanent request-fence audit. Four owned integration cases pass, including
idempotent resume, pre-read lock rejection, committed-denial preservation after
audit failure and absent/older/stale-proof denial. The provider reader is stubbed
in those command tests; actual independent archive authentication remains separate
provider acceptance. T052 remains open for its complete provider/uncertain-effect
and recovery acceptance. `mcteer` volunteered for the human operator/reviewer
exercise; nomination supplies no completed observation. The concrete walkthrough
is in `docs/pilot-operations.md`. Fresh full catalog/CI proof is still required for
this changed source.

Follow [quickstart](quickstart.md). Node 24, owned local databases/stores and CLI
Playwright/WebKit only. Preserve `.env.local`, root workflow state and `agent/agent.ts`.
Prepare 056/057 explicitly; verify free numbers, manifest and exact compatibility
before applying required target migrations/grants in release order. Validate actual
Preview services, then exact Production deployment and changed role/workspace/UI/
SDK/file processing after merge. Every task checkbox needs the corresponding real
proof; full participant/release tasks cannot complete from CI alone.


2026-10-13 checkpoint: the complete owned catalog passed 657/657 in 113 suites
(`run-a4448b02-0921-46e4-b9a3-0218f9c3acd8`). T054 is checked for the implemented
schedule/age/expiry policy, operator cron manifest and independently retained
authority protections; T077's real hosted cadence is still open. Completion is
63/84. The user authorized T069's single $25 total evaluation cap plus four
existing Context credits, with automatic billing/top-up disabled. Context credits
fund bounded catalog research; independent semantic review remains separate.
Retain the original approval journal across corrections and unknown effects.
The user also requested removal of unnecessary data and OrbStack containers once
016 is implemented. T080 includes owned containers/volumes, unused owned images
and temporary copied environments; preserve selected data/configuration/workflow,
required recovery evidence and permanent/uncertain-effect records.

The requested closeout inventory found that dump/restore clients removed their
owned containers without anonymous-volume removal. Their shared cleanup now checks
actual ownership before `docker rm --force --volumes`; named volumes remain. Four
authority/failure unit cases and one real PostgreSQL 17/18 volume case pass. The
complete inventory is now 662 cases / 115 suites. Run
`run-b6e5f185-e2ae-4d68-b155-74ba5e341d62` was intentionally interrupted before paid
evaluation to include this defect fix. The next committed deterministic/native
proof must match the corrected source; the $25/four-credit approval retains its
original identity and allowance. No paid dispatch has occurred.

The first authorized actual-model attempt completed 002, then stopped on 003's
accepted-source-fidelity hard gate. All 26 Gateway dispatches settled, totaling
$0.349202; no unknown charge or Context credit consumption remains. Captures stay
failed, not semantic acceptance. Its response contained legitimate workload IDs
returned by the authorized accepted product-use read. The evaluator scanned all
UUIDs but omitted those structural references from its known set. It now includes
only workload IDs attached to current audience-eligible accepted records. One
actual owned regression passes for visible references and negative foreign,
pending, unknown, partner-withheld and retracted references. Its initial fixture
retraction commands lacked the required current record version; that setup was
corrected without changing domain behavior. Complete inventory is 663/116.
A corrected whole batch needs fresh committed deterministic/native proof and must
retain the original approval journal and $0.349202 spending.


Latest continuation: current 0b7712f local proof passed 663/663 in 116 suites.
The second paid attempt stopped at 003's inherited 14-step cap after seven
hard-gate-passing responses; both attempts remain failed and retained. Original
budget cumulative charge is $0.806589, no unknown/held charges and no Context
credits used. mcteer authorized a separate 016-only full-003 32-step supplement,
bound to the unchanged original budget ID/digest/expiry. Current inventory becomes
664 cases / 116 suites; fresh committed local/native proof is required before the
whole corrected paid attempt. This does not authorize infrastructure or deployment.


Follow-up: capture and independent-review verification both require the same
016 step supplement. Set TURAS_016_QUALITY_RUNTIME_FILE to the current attempt's
private runtime file when running the governing 003 verifier; default verification
retains 14 steps, and the capture's recorded cap must match. The 101ed5c full run
was interrupted before further paid work to include this correction. Synthetic
subprocess verifier checks pass, with zero provider dispatches; complete inventory
is now 665/116. The original spend/credit journal remains unchanged.


Latest continuation: 1a965b2 passed 665/665 local cases in 116 suites. The corrected
paid attempt completed 002 and 003 (003: 12 responses, 18 steps, all hard gates),
then failed before 004 provider dispatch on legacy source-database assumptions.
The original journal now records $1.474879 across 105 requests and zero Context
credits. Two stable official key-scoped daily reports match all 90 language and
15 embedding requests; provider cost $1.4748667 is covered by per-request journal
rounding. No extra request was observed. All three incomplete paid attempts remain
failed and retained; there is no full quality/release acceptance.

mcteer requested a separate LLM semantic judge. The independent gpt-6-astra judge
passed 002 12/12 and withheld two 003 source-fidelity cases for optional walkthrough
contamination of the governing baseline fixture, without alleging fabrication.
Actual judge artifacts preserve raw captures and state their limitations. Native
002/003/004 setup now uses the baseline demo; retrieval retains its judged walkthrough.
002 has no declared overall model-step cap, so its erroneous new 14-step metadata
is omitted; 003 records its admitted cap, and 004 records its unchanged 16-step cap.

A strict 016 source adapter preserves ordinary test separation and additionally
checks actual Docker owner/name/loopback port and separate runtime login for the
owning pilot source. Artifact/retrieval children now explicitly run in development;
retrieval copies required report/package sources with runtime exclusion and explicit
dependency links. Both drain only their owned app processes before clone deletion.
The owned maintenance worker now inherits the same budget preload; an actual PID-
bound installation check confirms it before readiness with zero paid dispatches.
Four unit and three composed owned checks pass; inventory is 672 cases / 118 suites.
Fresh committed full/native/CI proof precedes another whole paid batch under the
same $25/four-credit journal, with $23.525121 remaining and no cap/id reset.


### Independent-review evidence retention correction — 2026-10-13

The separate LLM judge identified that transient evaluation cleanup invalidated
native review roots and absolute capture paths. Each quality stage now retains a
private review workspace with exact Git-tracked source, verified against feature
008/010/011/014/016 and staffing source digests. Native artifact directories,
preflight logs and raw arm files remain until independent review; transient app,
database and worker resources still clean up normally. The original repository
also receives its explicit tracked-file hygiene check. Fixtures are generated in
the retained workspace. No capture/source digest is rewritten to simulate binding.

005 retrieval now retains query/role/scope, expected source/passages, ordered
results, resolved citations, recall, partner-scope outcomes and partial failure
evidence for independent review. No embedding vectors or credentials are copied.
The existing seven quality unit cases pass, including actual source-copy equality,
credential/state exclusion and altered-source rejection; root/pilot types, docs
and diff checks pass. Inventory remains 672 cases/118 suites.

The 7a892bb full run de86644d was deliberately interrupted after 84 completed
suites to apply these prerequisite corrections; it is failed/incomplete evidence,
not a full pass. Its owned resources were removed. CI 38441833704 reports a pilot
predecessor regression failure with no assertion-level diagnostic; a bounded
fixed-name predecessor-phase diagnostic now makes future CI failure attributable.
No paid calls occurred during this correction. Original cumulative spend remains
$1.474879, 105 dispatches, zero Context credits; $23.525121/four credits remain.
Fresh committed full/native proof is required before the next paid batch.


### Canonical review-workspace test correction — 2026-10-13

Run ac75a9cb at 6fb2a20 stopped at suite 55 (quality unit): the new test used the
transient app copy as its snapshot source, whereas the controller supplies the
canonical repository. Fifty-five prior suites passed; this run is not acceptance.
The test now resolves the real Git source, creates its private parent explicitly,
and passes all seven cases inside an actual owned PostgreSQL 18 app environment.
The first isolated recheck lacked that test parent and is retained as failed.
No runtime guard, fixture, rubric or product assertion is weakened.

The independent judge confirmed 007's documented derivative annotation workflow:
preserve original actual/pending files, independently fill only supported semantic
flags in derivative files, bind new digests in a separate review and retain explicit
original/derivative provenance. Other catalogs keep objective captures unchanged.
Retrieval also retains the failed non-hybrid response before rejecting it.

CI 38445284245 failed the same workspace test, composed 014 WebKit, and Product
Gaps desktop-light authoring. Its standalone 014 WebKit job passed. Exact local
Product Gaps authoring passed 5/5 (desktop-light subset, zero skips/flaky/retries,
acceptance false). Neither that selected result nor earlier UI passes clears the
failed CI gates. Bounded composed diagnostics now retain exact learning locations
and fixed failure signatures; fresh full local/native/CI results remain required.
Spending remains $1.474879, zero Context credits; no new paid run has started.


### Clean owned evaluation roots — 2026-10-13

The full 8199ace run 4f0ceeda reported 671 passing cases and one failure, across
all 118 suite reports. It is failed evidence. The final composed source case
exposed the older artifact helper's assumption that local-artifacts/004 already
existed. The helper now creates its private parent before mkdtemp. Exact composed
reverification inside an actual owned PostgreSQL 18 app passes all three cases,
with zero paid calls. Individual durations were 50.316s, 53.370s and 6.608s.

The deterministic runner's evaluation-source file allowance now covers its three
existing declared test bounds (390+210+120 seconds), plus sixty seconds for
process/report completion. The earlier successful direct composition took
130.32s, exceeding the generic 120s file allowance. Domain deadlines, model
steps, output limits, assertions, cases and money/credit caps are unchanged.
Root/pilot types and diff checks pass. Fresh complete committed/native/CI proof
remains required; no paid evaluation or feature/release acceptance follows from
the partial run or selected recheck. CI 38447453887 remained in progress with
38 successful jobs and no reported failure at this observation. Original spend
remains $1.474879, zero Context credits consumed, with the same expiry and cap.


### Fresh full checkpoint and independent review — 2026-10-13

At 24cd0d9, owned full run e1df4931 passed all 672 cases across 118 suites, with cleanup exit zero and protected selected state preserved. Native preparation also passed. This is local evidence only; CI 38452989321 failed its composed learning publication navigation check and does not establish acceptance.

The next actual-model batch completed 002 but stopped in 003 on an unknown citation in accepted-source-fidelity run 2. Independent LLM review of the fresh 002 replies passed eleven of twelve: save-profile run 1 omitted the required explanation of unavailable chat profile saving. Neither catalog is accepted. The original journal now records $1.806543 charged, no held/unknown charges, and zero Context credits consumed; the original $25/four-credit cap and expiry remain unchanged. Raw captures and failed reviews are retained.

Turi instructions now explicitly explain unavailable accepted-profile saving through chat while permitting governed Pending proposals, and omit operational search receipts from evidence citations. A fresh full model catalog is required to demonstrate the changed behavior. The publication UI test now waits for the actual candidate payload heading before asserting absent controls and navigating; this strengthens the assertion but does not prove the exact CI failure cause. Fresh verification remains pending.

The strengthened publication journey passes all twelve cases in four CLI WebKit configurations with no retries or skips in the frozen-tree recheck. It is a development subset, acceptance false. The earlier twelve-case run was correctly rejected because documentation changed during execution; it remains invalid evidence. Pilot types and authored-document hygiene pass.


### Compact learning input correction — 2026-10-13

Fresh CI at e2f768c failed native learning and its composed MCP predecessor. The exact native check reproduced locally: the expanded root instructions exceeded the existing cumulative learning input bound on the normal two-step fixture. The full local run 32005bc2 was deliberately interrupted after this reproduced failure; its partial passes are not acceptance. No new paid evaluation occurred.

The authored instructions now state the same capability, evidence and approval boundaries more concisely: 5,749 bytes versus 5,850 at the earlier passing 24cd0d9 and 6,282 at failed e2f768c. The original 24,576-byte cumulative input limit, model/output bounds, fixtures and assertions remain unchanged. The full native learning check passes all 25 checks with zero paid calls and verifies hosted MCP cleanup in the owned fixture. The selected model/configuration/workflow snapshot is preserved. Fresh committed complete local/native/CI verification remains required.


The 06aeb2b CI verify and execution-regression jobs exposed the existing root capability inventory wording assertions. The concise instructions now retain the exact private-customer-chat, bounded-context-snapshot and direct-fact-update denial phrases; no assertions were relaxed. Their final size is 5,784 bytes, still below the earlier passing 5,850 bytes. Both capability tests and all 25 native learning checks pass together with unchanged domain bounds.

The broader root unit suite passes all 498 tests in 110 files under explicit synthetic unit configuration (no selected credentials or live providers). Earlier attempts without required configuration, and with unrelated pilot-owned guard flags, are retained as failed development checks. Root/pilot types and documentation hygiene pass. The 46d9099f full pilot run was interrupted to correct the reproduced wording failure; partial results do not establish full acceptance. Fresh committed local/native/CI and actual-model proof remain required; spend stays $1.806543 and zero Context credits.


### Complete compact-guidance checkpoint and browser diagnostics — 2026-10-13

At 5c6a6d5, run 333388da passes all 672 cases across all 118 suites, with cleanup exit zero and the original selected model/configuration/workflow snapshot preserved. Source digest is 4d3af3b137912d5242e47b76b3baec323bdea76e2d0594c9cc7be575a7ca5285; catalog digest remains 9b22fb71e9f1c60cf25443de6ec992c6530666107e07624535f21bb1075082ff. Current native admission preparation also passes without paid calls.

Fresh CI 38461942181 passes native learning and the execution regression chain, but fails Product Gaps authoring in desktop-light and MCP browser checks in desktop-dark. Exact full local MCP WebKit verification passes 32/32 cases across four configurations with no retries or skips; that does not clear the CI failure. Product Gaps diagnostics show eligible working content returned by the API while the new proposal heading assertion timed out. No authorization failure or precise timing cause is established. The MCP CI log does not identify the failed assertion.

The CI failure printer now reports bounded browser source locations, project/status, duration and fixed failure categories/signatures from the retained JSON reports. It excludes titles, error prose, page content, stdout and attachments; only actual checked-in browser filenames are admitted. Two privacy/bound tests and root types pass. No fixture, assertion, retry, model or domain limit changes. Fresh committed full/native/CI proof is required before further paid evaluation; the original $1.806543 journal and zero Context credits remain unchanged. T069, hosted/recovery and real participant gates stay open.


### Independently verifiable behavior outcomes — 2026-10-13

Independent LLM review identified that booleans and intended fixtures could not conclusively establish the tool outcome for a Pending proposal. The paid batch remains stopped; no new provider or Context dispatch occurred. The 48c53ed full run was deliberately interrupted before changing this evidence path. Its partial results are not full proof.

The 016 controller now installs an observe-only event hook exclusively in disposable owned app copies for 002/003, and the existing 004 clone when explicitly requested by that controller. The root agent hook/model and public HTTP projections are unchanged. Private mode-0700/0600 files retain actual action arguments/results and completed-step/terminal events, redact known credential values, enforce exact app/database/environment/attempt/session binding, bound bytes/counts, and reject changed replay. The behavior driver preserves the original reply/history before collecting supplemental evidence, then retains actual proposal payload/channel/review state, command receipts, before/after counts, authorized customer snapshots/injection receipts, and exact selected artifact envelopes/ranges before withdrawal. References and underlying events are byte-bound; the governing verifier rejects changed sidecars, events or replies. Existing original captures stay immutable. No evidence becomes accepted customer context.

A real native SDK fixture emits one tool result and two completed steps, recorded in five bound events with zero paid calls. A second real native SDK/owned PostgreSQL 18 fixture submits exactly one governed Pending assistant proposal with the expected persisted wording/channel/receipt and unchanged accepted count. Its final snapshot-aware check verifies exact customer snapshot/injection agreement and the bound original reply. These use a synthetic provider and explicitly are not actual-model quality proof. The independent LLM checked all five event hashes and actual proposal/result/receipt identities, and confirmed evidence sufficiency for that controlled outcome; it requested the additional customer snapshot for direct approved-excerpt answers, which is now retained.

Three observer/privacy/tamper tests and two browser-diagnostic tests are explicitly registered in the complete pilot catalog: current inventory 677 cases in 120 suites. Their narrow contract check passes 27 cases across three files. The broader root unit suite passes 503 cases in 112 files under explicit synthetic configuration; root/pilot types pass. The strengthened chat/logout development subset passes both cases in all four production-served CLI WebKit configurations (8/8, no retries/skips, zero paid calls). Logout now verifies its actual HTTP status before waiting for navigation; this exposes denial separately from navigation timing without changing server authorization or existing bounds.

CI 38466278284 at 48c53ed passes Product Gaps WebKit but its verify job fails the original chat sign-out navigation wait; it is not accepted CI evidence. Some aggregated jobs API requests returned 502; smaller pagination returned actual job metadata. No precise sign-out failure cause has been established. Fresh committed full/native/CI and full actual-model/independent review remain required. Original Gateway journal spend stays $1.806543, with zero Context credits, the original cap/expiry and 003-only step supplement unchanged. Protected selected model/configuration/workflow snapshot remains preserved.


### Hosted conversation boundary authoring — 2026-10-13

The committed f988c93 checkpoint passes the complete local catalog: 677/677 cases across 120 suites, with no failures. Private proof: `local-artifacts/016/run-82efb1bf-7bb9-4899-89b0-953656bc8f48/execution.json`; source digest `62000af8a326204bd82a1532961feed454ea255dea8dc6da0192f3c06e509593`, catalog digest `8f2785cfb99b6ffddb69ea64e70c50f34f4d3b9df1066c59c60748d1e635b24f`. Native preparation also passes at that commit with zero provider dispatch. CI 38470861308 has 41 successful jobs while expansion and execution WebKit remain running; this is not complete CI acceptance.

T071 now has normal authenticated parked-conversation creation, original-key replay, ownership reads, archive/restore and exact interrupted-response cleanup. All roles use the same synthetic customer assigned to the partner, so foreign-owner denial cannot pass solely because a customer is unassigned. Cleanup archives only the original creation key under the exact actor/workspace/environment through the normal API. The source remains unbound; no messages, native sessions or model calls are created.

The normal HTTP integration suite passes 9/9 cases, including three role boundaries and damaged-response cleanup (`hosted-conversations-common-customer-20261013.json`). The actual production-served owned CLI WebKit integration passes its registered case with 60 assertions across three role sessions and four desktop/mobile light/dark projects (`hosted-browser-parked-state-20261013.json`): real parked reads/reloads, synthetic context, keyboard focus, responsive overflow, zero serious/critical accessibility violations, and foreign-owner API/page denial. All created conversations are archived and all three sessions revoked. Initial browser checks failed from an incorrect expectation of a composer/history request for an unbound chat; the successful check verifies the actual parked notice and independently calls the normal backing API. These are development-subset plumbing results, not hosted deployment or streaming/resume/stop proof.

The new fixed inventory is 680 cases across 121 suites. The deterministic CI job now installs WebKit because the registered browser integration requires it. G12's existing full UI inventory remains separate; the parked subset does not replace it. Fresh complete committed proof remains required. Completed role conversation/browser receipts are written privately before subsequent stages; the hosted runner still returns incomplete-catalog failure. T071, the other hosted journeys, managed recovery/RPO/RTO, actual-model review and human gates remain open. No new paid calls or Context credits have been dispatched; the original $25/four-credit budget and expiry remain unchanged.


### Linked support, expansion and Product Gaps boundaries — 2026-10-13

The committed 86bc6c2 checkpoint passes the complete local catalog: 680/680 cases across 121 suites. Proof: `local-artifacts/016/run-7c3a767c-1196-44d6-9c2f-4212a3702190/execution.json`; source digest `7ef3ea369092f098aee3ab8cae389414cb78d3e532dd4280daab28659c4e4e8b`, catalog digest `a7d5ca2fb5d925b0d74bfb20145aead27e538fd9d0ccd06a94b183218b6c8075`. Native preparation passes with zero paid dispatch. A first full launch omitted the required prepared-image input and failed at setup before any case; the complete passing run supplies that input. This is a checkpoint, not full pilot readiness.

CI 38479341519 fails the composed 014 WebKit predecessor: `learning-draft.spec.ts`, desktop-dark, the serious/critical accessibility assertion. Its diagnostics identify the assertion but not the actual rule. An exact local development recheck passes 4/4 projects. The test now verifies the actual current draft URL/heading and absence of the prior form before accessibility analysis; another 4/4 development recheck passes without retries or skips. No precise CI failure cause has been established. Safe CI diagnostics now retain only quoted rule IDs from the installed axe catalog, bounded and deduplicated, alongside existing fixed metadata; they retain no private prose, DOM, selectors, titles or credentials. The existing installed axe-core 4.13.0 is explicitly declared without a version upgrade.

The hosted runner now has linked normal support, expansion and Product Gaps boundary helpers. A shared admission checks the exact active synthetic workspace, accepted plan decision, active baseline, workload/customer, owner and authorized API head/dependency. Support uses six normal commands: pending unknown readiness, exact acceptance, an open owned action, exact acceptance, a proposed deferral and its separate review. Unknown capabilities/routes remain unknown. Expansion assigns the scoped account owner, submits an unknown-benefit/use hypothesis, verifies actual `qualification_incomplete` denial under the serving commit, and exercises defer/reopen/dismiss/reopen with exact previews. No benefit, commercial outcome or external action is invented.

Product Gaps performs normal synthetic narrative/impact review, exhaustive merge/split mapping, actual queued report processing, disclosure review, both byte/hash/identity-verified JSON and Markdown exports and an explicitly unsent synthetic handoff demonstration. Pilot-local suspected-customer count is one; requiring zero there was an incorrect initial check. Separate actual primary login/session/API/database probes prove all three pilot gap IDs and the report withheld plus empty primary registry results, then revoke the exact primary session. No primary customer record is mutated. The report count check does not substitute a pilot-local statistic for a primary outcome.

The extended actual production-served owned linked HTTP case passes, including support/expansion readability before artifact withdrawal and withholding afterward (`hosted-gaps-stream-binding-20261013.json`). It exposed a real missing serving-code header on streamed gap exports. `gapExportResponse` now uses governed versioned headers while preserving review/integrity headers and per-chunk eligibility checks. Two focused stream/header tests, seven bounded HTTP denial/privacy tests and two diagnostic/privacy tests pass (11/11; `hosted-gap-stream-headers-20261013.json`). No model, research, Sandbox provider or external message is dispatched by these owned checks. Actual hosted processing and participant observation remain separate.

The expanded fixed inventory is 683 cases across 122 suites. Fresh full committed/native/CI proof is required; the 680-case checkpoint and development subsets cannot replace it. T071's remaining streaming, upload/executor, workforce, linked hosted delivery/report, partner/learning and complete receipt catalog remain open alongside managed recovery/RPO/RTO, actual-model review and human gates. The original Gateway journal remains $1.806543 with zero Context credits; its original cap/expiry and 003-only step supplement are unchanged. Required private failures/captures remain retained; completed owned test compute cleans up while the selected configuration/model/workflow stays preserved.

### Exact hosted configuration and finite dispatch count (2026-10-13)

The hosted CLI now requires a separate private configuration manifest and compares its exact environment/project/team/store, pinned images, enabled dispatcher and unchanged domain resource limits to the actual authenticated administrator diagnostic before its first journey callback. Only configured identity metadata is exposed; no token, database URL, provider permission or health claim is inferred. Missing, malformed, cross-target or changed-store readback blocks writes and revokes the original test session. The complete affected configuration/role subset passes 14/14 with no retries/skips (ten actual normal-route owned cases and four allowlist/shape/boundary cases).

Optional finite Sandbox dispatch count is bound into the existing pricing digest. Admission serializes on the existing budget row, counts all reserved/dispatched/unknown/settled calls, and only frees a count for a never-dispatched release. Settled cheaper calls cannot reset the approved count. Paid-dispatch readiness also withholds admission after count exhaustion despite remaining money. Seven owned cost-authority cases and four governed execution/provider-scope cases pass with zero actual provider dispatch. A first new health test attempted to edit an immutable fixture budget and correctly hit the existing authority trigger; the corrected fixture creates a separately bound synthetic budget instead. The prior failed capture is retained. No runtime migration, budget reset, selected-state edit or external service change occurs.

The current fixed inventory is **690 cases / 123 suites**; fresh full-source proof remains pending. The unchanged ef4ea5b checkpoint's complete 683-case run and CI are separate ongoing checks and cannot prove these later changes. Native preparation at ef4ea5b passes without paid dispatch. The private Preview-only provisioning proposal binds the re-read Vercel project and Preview schema 38 / PostgreSQL 18, one private store, 32 jobs, two deployments, a proposed additional $10/48-hour cap and backup/rehearsal before Preview migration/grants. This is a proposed authorization manifest, not actual provisioning or hosted proof. Production remains schema 55 in the same dated read-only inspection; it is not migrated or deployed.

The independent LLM judge retrospectively confirms that the old 003 accepted-source-fidelity run 2 includes an operational search-receipt UUID rather than supporting evidence, with no additional semantic failure established from available evidence. The original hard failure remains unchanged and its tool receipt cannot be authenticated from the old trace. This does not replace fresh actual-model evaluation. No new Gateway/Context calls are made; the original $25/four-credit approval, expiry, journal and 003-only 32-step supplement remain unchanged. Human operator/participant gates, full hosted/recovery/storage paths and final owned-resource cleanup remain open.

### Required-original integrity and completed 683-case checkpoint (2026-10-13)

The ef4ea5b checkpoint passes the complete local catalog: **683/683 cases in 122 suites**, with owned cleanup complete. Its private proof is `run-294f813e-425e-404c-98d6-fc1cf72f9c6b/execution.json`, source digest `704225fa9584791842d186d729824c482a548ab9f6014e8e998cd07ec298345a` and catalog digest `62b450cd66c176fcb9bbf921a56a0cc8088d328a069c9742632389d8a5c60e2a`. Protected selected model/configuration/workflow state is preserved. This checkpoint cannot prove later source. CI 38486116255 was superseded/cancelled; no complete CI pass is inferred.

CI 38489374553 reports a root typecheck failure because Next's augmented ProcessEnv requires NODE_ENV in explicit fixture maps. The pure configuration reader now accepts a partial environment and continues returning null for missing required hosted configuration. Both root and pilot typechecks pass after this correction. Other failed jobs remain unresolved until fresh CI establishes their outcomes; the composed 014 failure has empty browser diagnostics and no exact accessibility-rule cause is claimed.

Physical source/destination equality did not establish that originals required by live database records existed. A new bounded checkpoint query derives required artifact/staged artifact, workforce/staged workforce, finalized/staged report and gap-report descriptors from the current environment's existing ledgers. Copy and owned/work-controlled capture verify required key/digest/size against the physical source inventory before completing. An otherwise empty pair of stores cannot certify a missing live original. Copy also carries caller object/byte/page ceilings through every parity pass. No original is deleted or accepted fact authored by these checks.

The focused required-original suite passes **13/13** without skips or actual provider dispatch. Its owned PostgreSQL 18 case creates controlled live upload metadata, verifies missing-byte copy and encrypted-capture denial, then supplies exact original bytes and verifies cold copy parity with source retained. Hosted copy/cutover and full managed recovery remain incomplete; this closes an integrity hole rather than asserting T045/T051 complete. The fixed inventory expands to **694 cases / 124 suites** and requires fresh full-source proof.

The user explicitly authorizes the exact private Preview plan: an additional **$10 total for 48 hours**, one private Preview store, up to 32 Sandbox jobs (two concurrent, 300 seconds), two Preview deployments and backed-up/rehearsed Preview migrations/grants. The separate receipt expires **2026-10-16T00:28:11.256Z**. Implementation and recovery prerequisites remain required before execution. Production, plan upgrades, automatic top-ups and additional model allowance are excluded. No external mutation or new paid model/Context call is performed here. The original model-evaluation approval/journal/cap/expiry are preserved.

Affected copy, encrypted-candidate capture and actual Linux PostgreSQL work-capture/scheduler regressions also pass **18/18**, with no skips or actual paid provider dispatch. The native probe retains its independent cold-ciphertext/archive, matching database restore and conservative cost assertions; these owned checks do not prove hosted cadence, Workflow resumption, current denial reconciliation or RPO/RTO.

### Explicit Preview safety capture and isolated copy fixtures (2026-10-13)

The 694-case attempt at 6b56aec fails at the fenced legacy copy case after 256 passing cases. Its private run is `run-55feaedb-9990-4e97-bb04-a3d620bfb107`; the original failed suite and immutable failure receipt remain retained. Shared predecessor fixtures leave live original metadata absent from that copy test's temporary stores. The two command-copy suites now create their own disposable PostgreSQL environment per case, so their complete synthetic stores and ledgers belong to the same checkpoint. Required-original verification is unchanged. The affected isolated-copy and original 055 safety-restore subsets pass **13/13**, without skips. No original full failure is relabeled as a pass.

The Production source schema remains restricted to 55/57. A separate Preview capture schema supports its observed 38 and supported 55/57 snapshots. New safety-copy context v3 cryptographically binds Preview/Production target; the reader still accepts the exact original v2/055 context. A Preview archive key uses only the separate operator project's Preview environment, preserving existing Production key behavior. Isolated rehearsal verifies exact source schema/ledger/content before explicit forward migrations through 57, then retains quarantine and denies both existing runtime roles, including runtime_016. Unsupported Production-38 or target/context mismatches fail before restoring. The source remains read-only; no actual Preview/Production mutation is performed.

The new safety-source/Preview restore subset passes **7/7**. Its actual PostgreSQL 18 case exports a schema-38 snapshot, restores it into a separate schema-38 owned target, verifies content/ledger, applies all 19 forward migrations, and proves both runtimes cannot connect and quarantine cannot be cleared by a bare owner update. Both root/pilot typechecks pass. These are database rehearsal checks, not full matched service recovery, managed Workflow resume, hosted migration/grant or readiness proof. Full inventory is **697 cases / 125 suites**; fresh committed full/CI proof remains required.

Private Preview backup inputs now bind the rechecked exact schema-38 marker and direct unpooled owner connection to the existing independent work-controlled recovery destination. The first input preparation rejects a pooled source; deriving its standard unpooled endpoint and independently rechecking exact marker/schema/owner succeeds before the private inputs are written. Credentials are not printed and the selected environment is not edited. The separately authorized Preview cap/expiry and original model budget remain unchanged. Implementation/recovery prerequisites still govern external execution; no new model/Context call or deployment occurs here.
