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
