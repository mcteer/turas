# 010 Implementation Validation

Implementation resumed on 2026-10-05 in the isolated `010-tam-support-guidance`
worktree, based on committed main `080ad48645c90be63affd7e83a62185a9aacb8d1`.
Existing uncommitted support scaffolding was preserved and inspected. Unrelated
reporting and Spec Kit changes in the main checkout are not included.

## Setup Evidence

### Continuation — 2026-10-06

#### Publication and CI Bootstrap Corrections

Full support gate `sh_1188efdfc001Oxjfm5vpSb44bs` passed 23 suites / 123 tests,
zero failures/skips, at `2026-10-07T23:00:08.408Z`, source
`a50c681da699eb1df06dc6f7e63e86e06ecab02a0d026530fd1f0655038fb1f9`.
Advice uses `safeExtend` to expose open-only dispositions and forbidden
handoff/completion fields while preserving original action refinements. Hidden
support deltas are ignored after exact durable session/turn association; final
content still requires full release checks. The quota-contention test fixes its
clock within one window and restores it afterward, with unchanged production
quotas and assertions. Its preceding boundary-race failure is retained.
The authorized live cohort `live-mEQheU` had six expected outcomes and two
failures: S01 exceeded the deadline after extra tool steps; S07 violated the
previous custom open-only refinement. S08 verified exact stale-save denial with
complete actual usage/cost. No new paid call occurred after that cohort; neither
this deterministic pass nor the schema fixes prove a passing live cohort.

Observed native check `sh_1186e6697001stnbNmxdTjEea1` passed on published
`88fa882` after the hidden-delta preflight fix, using the actual framework runtime
and exactly two fixture-provider calls. Paid calls were disabled. This verifies
the checked native smoke path, not configured-provider deadline recovery or live
semantic acceptance.

Hidden-delta preflight regression `sh_1186371e0001W7YAxQicco3Kgi` passed
23 suites / 123 tests, zero failures/skips, at `2026-10-07T22:12:31.474Z`,
source `0e5d68b74a10c337aafea0421903901d6761ff13840470eaa92d2fd92b07a00c`.
Support streaming deltas remain hidden and retain durable association checks,
without repeated full source-release preparation; final messages still require
the full release fence. Staffing/execution delta fences are unchanged. The new
suite was explicitly registered after the exhaustive coverage guard rejected its
initial omission. This deterministic pass does not prove live deadline recovery.

Published `9e9e7e3` fixture `sh_1181226ee001M1D3AWczVUciYw` passed
eight cases with zero failures and complete terminal usage throughout on source
`eda559e3c8313515bd3a0cde334da39438d29cffee926fc5088401406dd1538d`.
S01–S07 completed; S08 withheld as expected. Paid calls were disabled. This
matches the 122-test support gate but does not establish live semantic review,
actual-provider cost, hosted behavior or final merge approval.

Full support regression `sh_11807a151001nIus5VLTWJNQZY` passed **22 suites /
122 tests**, zero failures/skips, at `2026-10-07T20:32:34.608Z` on source
`eda559e3c8313515bd3a0cde334da39438d29cffee926fc5088401406dd1538d`.
This includes explicit provider JSON Schema fact-citation minimum regression.
It is deterministic evidence only; no additional paid capture was authorized or
run, and configured-provider acceptance remains outstanding.

Authorized single S02 diagnostic `sh_118036da1001y2SoNELP3qAdbM` failed
with complete actual usage/cost and retained bounded final JSON in private
`diagnostic-S02-m12Z3P`. Offline schema validation identified four empty fact
citation arrays; no other shape errors were reported. The existing server custom
refinement rejected them, but did not express `minItems` in provider JSON Schema.
Fact citations now use explicit `.min(1)`, preserving server rejection while
exposing the requirement to the provider. Five focused evaluation tests and
typecheck pass, including a provider-schema assertion. No further paid call was
made; this fix does not establish live acceptance or explain other deadline failures.

Distinct interrupted-dispatch check `sh_117e73d0f001UovvZcHh29fsFv`
passed through the actual framework runtime with exactly one fixture-provider
call and verified uncertain native dispatch across restart. Paid calls were
disabled. This complements the preserved database/workflow recovery result;
it is not configured-provider or hosted proof.

Published-source preserved recovery `sh_117e48cd800173KCjGDzocBUTp`
passed on `cb902f39734007ea179de79faeeb87b27ca65b06dc07b5756eeab4c4d366fc97`:
one record, two revisions and one receipt survived restart. Workflow digest
`1a87cee07f0af44d84f23e890ca2633950af2f23507e5973582265d1c0574db9`
was preserved; dependent withholding and purge were verified. This isolated
check reports neither hosted proof nor native uncertain-dispatch verification;
the latter remains a separate acceptance check.

Published-source runtime rebind `sh_117e097ad001MxDeQp1Axxps7A` passed
on `cb902f39734007ea179de79faeeb87b27ca65b06dc07b5756eeab4c4d366fc97`.
An actual disposable runtime LOGIN denied all 12 mutation statements; temporary
role cleanup was verified. Production was unchanged. This establishes the local
runtime-role denial check, not hosted behavior or live-model acceptance.

Published-source benchmark rebind `sh_117c5cc96001nFMiIxPuLzujkL` passed
on `cb902f39734007ea179de79faeeb87b27ca65b06dc07b5756eeab4c4d366fc97`,
corpus `d9cfa1a4c669abfc5572870153f177488760a1be182b94908eeb5a0426e7ea50`.
Each class used 100 samples, ten warmups and five clients against the required
100 customers / 500 scopes / 5,000 actions / 20,000 revisions. p95 milliseconds:
list 1723.309416, detail 1596.315791, preview 1730.679459, acknowledgement
1957.694416. All meet the unchanged 2,000ms threshold with zero correctness
failures, preserved Production rates and pacing excluded from latency. This is
local performance evidence, not hosted or configured-provider acceptance.

Same-head failed-job rerun `sh_117ae2ca3001MBWbmE2gBaTgLl` completed
successfully: Actions `37661480961` is green across all nine jobs on `7aaa11b`.
The rerun's `verify` job completed in 22m35s, including both legacy local WebKit
and isolated 005 UI checks, without changing test limits or coverage. The earlier
25-minute cancellation remains retained. This CI pass does not resolve the failed
configured-provider cohort or the unfinished research/history follow-up.

Published-head Actions run `37661480961` on `7aaa11b` passed eight jobs;
`verify` was canceled at its 25-minute job limit during the legacy local WebKit
cohort. That cohort started at `18:01:57Z`, reported 224 cases, and the job was
canceled at `18:10:24Z`. No assertion failure was reported before cancellation;
this is not a passing UI result. One failed-job-only rerun was launched on the
same commit with unchanged test limits and coverage. Its result remains pending.

Published `7aaa11b` full support check `sh_11778270c001Bl4HKQ4qs0GVVP`
passed **22 suites / 121 tests**, zero failures/skips, at
`2026-10-07T17:55:45.213Z`, source
`cb902f39734007ea179de79faeeb87b27ca65b06dc07b5756eeab4c4d366fc97`.
This matches the eight-case diagnostic fixture source. Exact-head CI remains
pending; the failed live-provider cohort and research/history follow-up remain
unfinished and are not covered by this deterministic pass.

Private diagnostic capture fixture `sh_117656f19001fhFJTMhxNmZ8eB`
passed **eight cases / zero failures**, complete terminal usage throughout, on
source `cb902f39734007ea179de79faeeb87b27ca65b06dc07b5756eeab4c4d366fc97`.
Retained `live-b1dFIV` S08 evidence contains two steps with allowlisted
`tool-calls` / `stop` finish reasons and exact final text/digest. The owned observer
now preserves bounded malformed text for diagnosis without granting it a valid
output digest or release eligibility. Focused evaluation tests and typecheck pass.
No additional paid calls were made; this does not recover missing malformed text
from `live-XMljsA` or establish configured-provider acceptance.

Final-source benchmark `sh_1174a8699001iuVdH0U3MQ0eg7` passed on
`6c3c83e2d350562e56f871cc8f803441aad034455d4326ead16e66a227ec448c`,
corpus `7f87657b8ab0423209c0bc25d2eb3c8a3914d36de20dd6eeb10e69e8e96ff293`.
All classes used 100 samples, ten warmups and five clients against 100 customers,
500 scopes, 5,000 actions and 20,000 revisions. p95 milliseconds: list
**1802.361333**, detail **1638.059834**, preview **1714.861541**, acknowledgement
**1733.081875**, all below the unchanged 2,000ms threshold with zero correctness
failures. Production rates were preserved and pacing excluded from latency.
Actual disposable runtime LOGIN on the same source denied all 12 mutation probes,
with temporary-role cleanup verified and no Production changes. These local
passes do not replace the failed configured-provider cohort or prove hosted behavior.

Exact published Actions run `37648421289` passed all **nine jobs** on
`e15ff30ac83ae09431f3c3fc47cae2bad2668140`, including verification, complete
staffing/regression cohorts, support native/restart checks, and support/reporting/
execution four-project WebKit matrices. This final-source CI result is separate
from the failed configured-provider capture `live-XMljsA`; green deterministic
CI does not fulfill live semantic or exact live S08 acceptance.

The single authorized configured-provider capture
`sh_11722d162001Za65uw9LIqleb9`, retained in `live-XMljsA`, failed **all eight
cases** on published `e15ff30` / source
`6c3c83e2d350562e56f871cc8f803441aad034455d4326ead16e66a227ec448c`.
S01/S03/S04/S06/S07/S08 did not settle within the unchanged bounded deadline;
their retained attempts were running with incomplete usage. S02/S05 settled
`invalid_advice` with complete usage and actual cost, but no schema-valid final
output was captured. S08 therefore does not prove live exact stale-save denial.
The observation currently retains schema-valid final text only, limiting offline
diagnosis of malformed responses. This is a failed actual-provider cohort, not
acceptance. The one authorized capture is consumed; no paid retry or additional
capture has been launched, and failed evidence is retained. Fixture and deterministic
passes remain separate from this failure.

Stable-source exact-output fixture `sh_11704b6fa001oHA2Za2hqt2wxb`
passed **eight cases / zero failures** on
`6c3c83e2d350562e56f871cc8f803441aad034455d4326ead16e66a227ec448c`.
Every admitted step has complete terminal usage. S08 withheld the exact captured
final response and denied saving its exact digest/suggestion without domain
mutation. Typed content-release denials no longer interrupt terminal usage
projection. Paid calls were disabled; this verifies actual-framework fixture
mechanics, not configured-provider semantics, cost, review or hosted behavior.

Earlier-source fixture `sh_117006618001ajMUBVKp5Xie7B` reached all eight
expected states, including withheld S08 with complete terminal usage, but exited
1 after source changed during execution. It is retained as diagnostic evidence
only, not current-source acceptance. The stable-source fixture invocation remains
pending; no paid provider calls or automatic recapture occurred.

Current-source full support invocation `sh_11704c375001jhjN3gEx12EJ1c`
passed **22 suites / 121 tests**, zero failures/skips, at
`2026-10-07T15:49:26.519Z`, source
`6c3c83e2d350562e56f871cc8f803441aad034455d4326ead16e66a227ec448c`.
This includes fail-closed revoked-session final projection and terminal usage
settlement. The exact-output framework fixture remains pending; configured-provider
semantic acceptance, final-source CI and required review/merge remain outstanding.

Preparation regression `sh_117027aa2001Q8Q7SHPPYHTZoG` passed in
**110,510ms** within the unchanged 120-second child bound. The rollback-isolated
revoked-session case verifies hidden final content, absent retained output and
an exact confirmed terminal usage receipt. Release denial handles only typed
401/403/404/409 failures, retaining durable session/attempt/turn association
checks; unexpected errors propagate. The prior regression's 401 failure is
retained. Current-source full support and eight-case exact-output fixture checks
are running; this diagnostic does not establish live-provider acceptance.

Exact-output fixture run `sh_116e25c7b001ppYWsbHLvtqGPz`, retained as
`live-NACzLY`, exercised the final-only S08 barrier and denied saving the exact
captured suggestion/digest without domain mutation. It nevertheless is **not
acceptance**: S08's second admitted step settled as unknown with null token
counts, despite observed provider completion and a captured final output.
The existing fixture-mode usage exemption incorrectly reported zero failures;
the runner now requires complete usage in both modes (actual provider cost is
still required only in live mode). No unknown usage was filled or fabricated.
S01–S07 completed with complete usage. Withdrawal/native event settlement must
be corrected and verified before any configured-provider recapture or acceptance.

Exact published Actions run `37633666729` passed all **nine jobs** on
`423e62f3374a7f8495850b1cf639e9a5a7a76e33`, including full staffing coverage
without quota/deadline changes, support deterministic/native/restart checks and
the complete support, reporting and execution four-project WebKit matrices.
The prior local remote-database quota timeout and changed-source browser rejection
remain retained. Published CI does not establish configured-provider semantic
review, exact stale-output save denial, restored Notion execution or merge approval.

The economics diagnostic `sh_116aa3761001kSEqASNt4BJg02` passed all six
tests with zero failures/skips on an owned clone with real prepared scanner
assets. The withdrawal regression now asserts the entire exact metadata-only
projection, retaining identity, null content, stale status and fixed reasons;
opaque UUID/digest substrings no longer cause false financial-leak failures.
No runtime behavior changed. The complete local staffing run passed its eight
preceding contract suites, including actual clean/EICAR scans, but timed out on
125 sequential advisory context reads at the unchanged 120-second limit. That
failure is retained and this focused result does not establish full staffing or
published CI acceptance. The local browser run rejected changed source and is
not current-source acceptance.

Required four-class benchmark `sh_11508d8a8001iFCR2kxg4cQRhg` passed on
source `07f979eca45a9d7a2845ccec2edff2f2bac5605414cf86fc094e4177f200b8dc`,
corpus `5c476ea60cc2141d9849b20ea10c6a25a98d5ab3ad3d1f6727a41495594324fa`.
At 100 customers, 500 scopes, 5,000 actions and 20,000 revisions, each class used
five clients, ten warmups and 100 samples. p95 milliseconds: list **1763.683375**,
detail **1587.916708**, preview **1654.436000**, acknowledgement **1687.722791**;
all below the unchanged 2,000ms threshold with zero correctness failures.
Production rates were preserved and pacing excluded from measured latency.
This is owned-clone performance evidence, not hosted proof.

Current-source fixture capture `sh_11508ceb7001dN6YBKeG3iRfld` passed all
**eight cases**, zero failures, on unchanged support source
`07f979eca45a9d7a2845ccec2edff2f2bac5605414cf86fc094e4177f200b8dc`.
S01–S07 completed; S08 failed/withheld as expected following source withdrawal.
Every case has complete usage settlement. Paid calls were disabled; fixture cost
is unavailable, and outputs are not configured-provider, reviewed or hosted proof.
The separate live semantic and exact stale-output save-denial gates remain open.

Required interrupted-native check `sh_1150c5b97001C3ERpjPiB3P2f4` passed on
unchanged source `07f979eca45a9d7a2845ccec2edff2f2bac5605414cf86fc094e4177f200b8dc`:
exactly one fixture-provider call and verified uncertain dispatch across restart
in the actual framework runtime. Paid calls were disabled. This complements the
preserved-restart gate but does not establish configured-provider or hosted
behavior. Browser, performance, fixture capture, live review and published CI
remain separate required gates.

Required preserved-restart rerun `sh_1150afafa001M13igiV6AsZpq2` passed on
source `07f979eca45a9d7a2845ccec2edff2f2bac5605414cf86fc094e4177f200b8dc`:
one record, two revisions and one receipt survived; workflow sentinel digest
`8c49aed79b737b6bfde2412399135fba3bb0de5998e7ff5e9edb18f0cd618f5e`
was preserved, dependent content remained withheld and dependent purge was
verified. The earlier failure remains recorded. This owned-clone pass is not
hosted proof or uncertain native-dispatch verification; that separate check
remains required.

On source `07f979eca45a9d7a2845ccec2edff2f2bac5605414cf86fc094e4177f200b8dc`,
the authorized actual disposable runtime LOGIN denied all **12** mutation probes;
temporary-role cleanup and absence were verified, with no Production changes.
The setup-aware recovery diagnostic also passed all phases, including preserved
restart comparison and dependent purge. Its preceding required-command failure
remains retained and unexplained; the required recovery command is running again
on unchanged source. Diagnostic success is neither required-command acceptance
nor hosted proof. No paid provider calls, schema changes or relaxed limits occurred.

Published head `7fa0d24`, support source
`07f979eca45a9d7a2845ccec2edff2f2bac5605414cf86fc094e4177f200b8dc`,
passed the complete support gate at `2026-10-07T06:23:56.042Z`:
**22 suites / 120 tests**, zero failures or skips. The preparation fixture reuse
preserves canonical evidence, original identity, replay and forged-key assertions
within the unchanged deadlines. This is deterministic acceptance only; live
provider review, exact stale-save proof, full browser/performance/restart/runtime
source binding, published CI and required review/merge remain outstanding.

Preparation-suite diagnostic `sh_114fd0938001BdRSYbJpmGRe95` passed with
process status 0 in **99,814ms**, within the unchanged 120-second child limit.
The canonical-evidence regression reuses the source-identity test's owned fixture
instead of rebuilding it; discovery admission, original source identity,
canonical passage read, exact replay and forged-key rejection assertions remain.
The 60-second individual test limit is unchanged. This suite-only diagnostic does
not replace the complete support gate, which is running on the updated source.

Stop-readiness narrow WebKit diagnostic `sh_114f8881a0014lIHWmsipHMxtO`
passed with process status 0, paid calls disabled and no retries. The control
waits for the handler's native session/turn prerequisites; acknowledged durable
cancellation precedes barrier release, with late-output withholding, reload and
exact call-count assertions retained. This filtered diagnostic is not full-matrix
acceptance. Fourteen environment/model-budget unit tests and typecheck pass.
The preparation-suite diagnostic confirmed its child timeout at 120,018ms;
private per-test progress diagnosis retains the same 120-second child deadline
and does not relax the required cohort gate.

Local full reporting invocation `sh_114f79ccf001C4isU2yBfN1YH0` produced all
48 registered suite reports in `tests-iUXmKm`: **160 passed**, zero failures or
skips, but exited 1 without a completion summary. Its captured reporting source
`3774152fe76410ed1e5a48807bd7b789bec7e7aa63cdcd23fd906377964f246f`
differs from current `67d7af6f8a23ffa024c0399b39bce10ce201631f9932be77dc14797fa61e5773`
after the intentional Stop UI/test change. This is diagnostic only, not a passing
final-source gate. Published support and reporting deterministic CI passed on
`85216b6`; its WebKit Stop acknowledgement timed out. The Stop control now stays
disabled until the native session and turn identities required by its handler
exist, and the browser journey explicitly waits for enabled readiness. Typecheck
passes; narrow WebKit verification is pending. No cancellation authority, timing
bound, provider budget or safety assertion was relaxed.

The first manifest-based reporting rerun exposed stale manifest metadata:
`version` was 42 while its verified migration list included 043 and initialization
correctly reached 43. Correcting only that metadata to 43 also aligns the
staffing/execution restart marker expectations; migration contents/checksums and
database data were not changed. The registered reporting-schema suite then
passed **four tests**, zero failures/skips, source
`3774152fe76410ed1e5a48807bd7b789bec7e7aa63cdcd23fd906377964f246f`.
This focused result does not establish complete reporting or final acceptance.

The registered focused reporting-schema suite failed before correction in three
cases with exact `expected 43 to be 41`: empty initialization, current installed
tables/grants, and explicit schema-38 upgrade. The two post-initialization version
assertions now compare exactly with the migration manifest's current version,
following the existing execution-schema test pattern. The initial schema-38
assertion, exact prior migration-history preservation, table installation,
runtime mutation denial and immutability checks remain unchanged. Post-fix
registered verification is running; no application schema or migration was altered.

The strengthened native-stop diagnostic initially failed because its new test
query incorrectly expected `customer_id` on the attempt table. The lookup now
uses migration 043's canonical `support_advice_bindings` join. Its rerun
`sh_114eb9428001U3WgFgixbJkSdD` passed with process status 0, paid calls disabled
and no retries: successful stop acknowledgement and persisted cancellation
preceded barrier release; late-output withholding, reload and exact call count
remained asserted. This is a filtered WebKit diagnostic, not full matrix or
published-head acceptance. The older full WebKit invocation failed strict case
reconciliation and remains retained separately.

CI run `37577944604` identifies the native-stop failure at
`tests/ui/support-advice.spec.ts:50:76`: cancelled-state visibility after releasing
the provider barrier. The journey previously treated click completion as proof
that its asynchronous stop had committed. It now awaits a successful actual stop
response and verifies the persisted cancelled state before releasing late output,
then retains the original hidden-output/reload/exact-call-count assertions.
No runtime cancellation, timeout or acceptance behavior was changed. Narrow
WebKit verification is running; typecheck passes. The reporting runner also emits
its registered failing suite and fixed stage without private messages so the
separate deterministic CI failure can be located; its strict cohort is unchanged.

Earlier-source benchmark `benchmark-yqpYBB` completed all four unchanged classes
with 100 samples, 10 warmups and five clients each: p95 list 1672.549083,
detail 1580.585250, preview 1647.308959 and acknowledgement 1655.654084
milliseconds, all with zero correctness failures. Its final gate rejected
`Support source changed during benchmark`; no completed acceptance record was
issued. These are historical measurements, not final-head performance acceptance.
No corpus, quota, sample count or 2,000ms threshold was changed.

The exact native-stop/reload WebKit journey from published CI was run alone on
an owned clone with `CI=true`, paid calls disabled and zero retries; it passed
with process status 0. This filtered reproduction is diagnostic, not a complete
browser gate and not an explanation of the Linux CI failure. Published diagnostics
identified case line 36 but omitted its assertion location, because Playwright can
put that location in its structured `error.location` rather than `stack`. The
diagnostic now permits only exact authored support-test filenames with bounded
numeric line/column values, including that structured field. Nine unit tests,
typecheck and private-location exclusion checks pass. No cancellation behavior,
timing bound or acceptance criterion changed.

Published head `a4228b3` support WebKit failed case reconciliation in CI run
`37576793930`; the log did not identify the failed case/assertion. The runner now
emits only fixed error categories/statuses, authored case file/line and
allowlisted support-test assertion locations. It does not publish raw messages,
titles, stack paths, credentials, URLs or screenshots. Nine environment/diagnostic
unit tests and typecheck pass. Strict pass-once/global-error/skip/flaky checks are
unchanged. Pending earlier-source checks are diagnostic after this intentional
diagnostic correction; required final-source acceptance remains outstanding.

The first nonterminal-message post-fix full-suite invocation failed in preparation
without writing an assertion report; its private log contains startup warnings
only. It is not evidence that the prior assertion still fails. An external
single-test diagnostic on an owned clone subsequently passed the affected
pre-tool narration, hidden projection and existing valid-final-output regression
with status 0 and no timeout. That filtered diagnostic is not full-suite
acceptance; the complete required cohort is running again on unchanged source
`cc2ae6f3b2f8665473f034a870ecb0bba56b9c5289fb42395970dab3842ee0ec`.
The incomplete invocation remains recorded, with no timeout or gate relaxation.

The intermediate-message regression failed before correction: pre-tool
`message.completed` narration with `finishReason: "tool-calls"` changed the
attempt from running to failed. The projection now skips final JSON parsing only
for that explicit nonterminal finish reason. Current release preflight and source
authority checks still run; no narration is visible or retained as advice output.
All other completed messages remain subject to strict schema/citation validation.
Typecheck passes; the full post-correction support cohort is running. This proves
a reproducible lifecycle defect, not that every retained live failure shares it.
No new paid capture or automatic retry has occurred.

Post-correction source
`7b0ad6cc056b083d474d18a27a02e3229c42bfdc729e79a1b8626df52d6d6ea7`
passed the full support cohort: **22 suites / 120 tests**, zero failures or skips,
at `2026-10-07T05:19:23.748Z`. This includes the canonical evidence read, exact
read replay and forged-key rejection regression that failed before the query
correction. Typecheck and diff whitespace checks also pass. Actual-provider,
browser, complete performance, published CI and review/merge gates remain open;
the deterministic pass does not replace them.

The new real-database canonical-evidence regression failed before correction
with exactly `column p.chunk_index does not exist`, matching the retained live
trace. The support evidence query now orders by migration 019's `p.ordinal`.
No migration, authority fence, eligibility predicate, citation map or budget
changed. Typecheck passes; the full support cohort is running after the fix.
This regression checks selected evidence, exact read replay and forged-key denial.
No further paid capture has been dispatched; malformed-output and incomplete
usage/settlement failures remain separate unresolved actual-provider gates.

Current-source configured-provider capture `live-j10378` failed **seven of eight**
cases: S01/S03/S06/S07 did not settle and have incomplete usage; S04 failed with
`invalid_advice` and incomplete usage at the deadline; S02/S05 failed with
`invalid_advice` despite complete usage and cost. S08 was withheld with complete
usage/cost but is not yet semantically reviewed or proof of an exact stale-output
save rejection. No automatic paid retry occurred. The strict output format has
not established actual-provider acceptance.

The S01 retained runtime trace identifies `column p.chunk_index does not exist`
in `support_evidence`; migration 019 defines `retrieval_passages.ordinal` instead.
A real-database regression now exercises selected canonical evidence, exact
read replay and forged-key denial. Full support checks are running to establish
its pre-fix failure; typecheck passes. The root model and budgets remain unchanged.
Pending previous-source fixture/browser captures become diagnostic after this
intentional regression addition, rather than silently rebinding their evidence.

The unchanged benchmark invocation failed with Postgres `57P01` before producing
the fourth class and complete acceptance record. Its list/detail/preview classes
had p95 1702.132625 / 1632.351792 / 1600.360292 milliseconds and zero correctness
failures, but these partial results are not a passing four-class gate. The
termination cause remains under investigation; the threshold/corpus/quota and
sample counts have not been relaxed.

The required interrupted-restart rerun
`sh_114b04bf3001nMr6v1MInSEBAG` passed while source remained
`d9ac6a2e250811a19760449e7a7c9eb8453295bb2f9d28f787f064132622273b`:
exactly **one** fixture-provider call, actual framework runtime and verified
uncertain dispatch across restart without repeating provider work. Paid calls
were disabled. This is distinct from preserved-state recovery and is neither
configured-provider nor hosted proof. The earlier `503 unavailable` failure
remains recorded; its cause has not been established by the passing rerun.

Older fixture invocation `sh_114a098b0001k68SmSDrLpC5UH` exited 1 after the
source changed during its execution. Its retained `live-VdZM6u` raw evidence is
bound to `151e0af1e08439add4d624bcea91def1b0b924974c8c3ab542fc6efc45f1b133`:
S01–S07 completed, S08 failed/withheld after its source withdrawal, and all eight
have complete usage and unchanged expected domain digests. This is historical
fixture evidence, not a passing final-source or configured-provider gate. A
current-source fixture invocation is running separately with paid calls disabled.

The older WebKit invocation `sh_1147de303001Bszn3yMlNSzeBo` completed with
`Support UI source changed`. Its required source binding failed, so it remains
historical diagnostic evidence, not final-head UI acceptance. The current-source
WebKit reproduction is separate and still pending.

Current published head `025da44`, source
`d9ac6a2e250811a19760449e7a7c9eb8453295bb2f9d28f787f064132622273b`,
passes eve/Next builds and typecheck. Its authorized disposable runtime LOGIN
denied all **12** mutation probes; revoke/drop and temporary-role absence were
verified, with no Production changes. Published WebKit now executes browser cases
but fails strict discovered-case reconciliation; no global runner error category
was emitted. Local current-source WebKit reproduction, unchanged benchmark,
preserved recovery, interrupted native check and configured-provider capture are
running. These pending checks are not acceptance evidence. Source is held stable
through the paid capture; no automatic paid retry or acceptance relaxation occurs.

The first current-source recovery command failed, and the interrupted-native
command rejected dispatch with `503 unavailable`; both failures are retained.
An external phase-specific recovery diagnostic subsequently passed setup,
fixture, start, pre-restart verification, restart, post-restart comparison,
dependent purge and post-purge verification on an owned clone without source
changes. This narrows diagnosis but does not erase the original required-command
failure or establish hosted behavior. A fresh invocation of the required recovery
command is running on the unchanged source with no paid provider calls.

That required recovery invocation subsequently passed on source
`d9ac6a2e250811a19760449e7a7c9eb8453295bb2f9d28f787f064132622273b`:
one record, two revisions and one receipt survived restart with the workflow
sentinel digest preserved; dependent content remained withheld and its exact
purge was verified. The earlier failure remains recorded. This proves the owned
preserved-restart gate, not hosted behavior or uncertain native dispatch; the
separate native `503 unavailable` failure remains unresolved.

The external native diagnostic subsequently admitted its single fixture dispatch
with paid calls disabled. This did not reproduce `503`, but it was not an
interrupted-restart acceptance gate; the required interrupted command is running
again separately. Published support deterministic CI passed on head `025da44`.
Published support WebKit, execution regressions, reporting deterministic and
verify jobs failed. Verify's content-free location report identifies the prior
staffing paired-supervisor restart (`tests/fixtures/staffing/pair.ts:30:58`), while
other failures require retained assertion diagnostics. Those failures remain
merge gates; successful support CI or Preview deployment does not waive them.

Published head `7fca932` has source digest
`151e0af1e08439add4d624bcea91def1b0b924974c8c3ab542fc6efc45f1b133`.
An explicitly authorized disposable runtime login passed all **12** actual
UPDATE/DELETE permission-denial probes on that source. The login inherited only
`turas_runtime`; its absence was verified after revoke/drop cleanup. The owned
clone was cleaned without Production changes. This is real restricted-connection
evidence, not an inference from inspected grants or a failed `SET ROLE` command.
Stable-source eight-case fixture capture and published-head CI remain running.

The next published support WebKit job got beyond database setup but failed with
global Playwright runner errors before browser assertions. A focused regression
reproduced that the support fixture flag left `webServer` enabled with CI's
`reuseExistingServer=false`, despite the owned runner already starting its app.
The configuration now recognizes that support flag; ordinary non-fixture CI still
owns its usual server and all four projects remain present. Twenty-one focused
tests and full typecheck pass. The UI runner retains private discovery reports
and exposes only fixed content-free global-error categories; report reconciliation
still rejects global errors, missing/skipped/flaky cases and unexpected results.
Published CI and stable-source final acceptance are not yet established by this
configuration regression. Previously running captures become diagnostic after
this intentional runner correction.

Implementation commit `8d06d96` and integration merge `e3003e4` preserve merged
recovery PR 18, including hosted watchdog routes, cron configuration and its
independent secret. [Draft PR 19](https://github.com/mcteer/turas/pull/19) is
published, not ready for merge. Unrelated `.opencode/commands` files remain outside
the commit. Production migrations and selected database/workflow resets were not
performed by this publication.

The first published support jobs failed before tests because fresh-cluster
migration 023 grants to `turas_runtime`, which had not been created. Commit
`11d92d7` creates a `NOLOGIN` role before initialization without rewriting an old
migration. The next jobs passed initialization but correctly refused equal
application/test database URLs. The CI setup now separates application placeholders
from the marked test source after initialization; the isolation guard is unchanged.
Nineteen focused environment/evaluation/model-budget/hosted-watchdog tests pass,
including same-source denial and distinct-source acceptance. These checks do not
establish published CI completion or replace the required full support cohort.

The corrected pre-main fixture run reached completed S01–S07 and failed/withheld
S08 with complete usage, but its overall result is rejected because source changed
during main integration. The earlier fixture S08 timeout is retained separately.
The pre-main interrupted native restart passed exactly one fixture-provider call
and no unconfirmed-content restoration; it is not configured-provider, hosted or
final-head acceptance evidence. Prior-feature regressions passed 75 unit and 30
integration tests. Final source-bound gates remain outstanding.

#### Retained-source correction and latest deterministic evidence

Strict output-contract correction source:
`6889cc44adfc3db7f3e293b2987c46a65b60812fab0b7d1f234d41a2ae18a296`.
Two new regression cases failed before implementation: generation and streaming
passed caller-supplied response schemas through instead of the authored contract.
Both now pass after the existing support admission middleware sets the SDK JSON
response format from `supportAdviceResultSchema`. Eight focused budget/evaluation
tests, full typecheck and `npm run build:check` pass. The eve and Next.js builds
retain existing unsupported-directory, tracing and Temporal bundling warnings.
The root model, authority checks, tool allowlist, output-token clamp, cancellation,
120-second deadline and no-paid-retry fence remain unchanged. This guides provider
output; server schema/citation/source validation remains authoritative.

The full deterministic suite on this corrected source passed **22 suites / 115
tests**, zero failures or skips, at `2026-10-07T04:15:08.179Z`. The eight-case
actual-eve fixture check remains running with paid calls disabled. Older-source fixture/WebKit
checks are diagnostic only following this intentional implementation correction.
No configured-provider acceptance, semantic review, published-head CI or merge is
claimed by the focused tests or build.

Latest capture-settlement source:
`fe72c3f84c695ff6e7fa98a9a0e86760d8b52066ff8cc972e1b5a188e0cf2dfe`.
The full support suite passed **22 suites / 113 tests**, zero failures or skips,
at `2026-10-07T03:54:54.042Z`; typecheck and three evaluation unit tests passed.
The capture runner now waits for both terminal advice and native response state,
plus actual usage receipts for every admitted step, within the unchanged deadline.
Malformed content remains withheld; this correction neither synthesizes usage nor
repeats provider work. Full fixture and WebKit runs on this source remain pending.

The preceding complete configured-provider capture failed **seven of eight** cases
and remains retained under `local-artifacts/010/live-pmkCEA`: S01/S03/S04/S05 did
not settle; S02/S06/S07 reached malformed-output failure before capture had complete
native measurements. S08 was cancelled with complete usage and cost evidence but
has not received semantic review. The settlement race correction is not a claim
that malformed output is valid or that this live gate passed. No automatic paid
retry occurred. A previous WebKit attempt failed during disposable migration setup
with `timeout expired`, zero manifest mismatches and no selected-database changes;
it is not browser acceptance evidence.

Earlier source after support hook deduplication and instruction guidance:
`495b096f04a1c14e6ea5c94c935d683635acb7bca57bcaead588b9a49a7e211c`.
The full support suite passed **22 suites / 112 tests**, zero failures or skips,
at `2026-10-07T03:18:16.341Z`; typecheck passed.

Installed eve documentation describes hooks as observe-only. The generic support
step hook no longer repeats the full injected-context capture already performed
by durable model admission and the authoritative pre-provider check. Those
admission, injection, source, session, deadline, tool and output checks remain.
Preparation regressions verify native-session mismatch denial, login revocation
after admission but before provider release, and exact retained stale-output
denial without writes. All four preparation tests passed.

Support instructions now distinguish the supplied readiness/actions snapshot from
missing source passages: avoid redundant reads, group independent necessary reads,
and retain all evidence, conflict and existing budget restrictions. Root model
selection, production quotas and the 120-second deadline are unchanged.

The preceding configured-provider S01 diagnostic on `80380a8b…` still failed at
settlement and remains retained under `local-artifacts/010/live-VNnT1v`. Three
provider calls completed with confirmed usage, but sequential procedure, summary
and action reads left another model turn necessary for the answer. No automatic
paid retry occurred. A complete eight-case configured-provider capture on the
current source is running and is **not yet reviewed or accepted**.

The WebKit run started on `eadce413…` exited with `Support UI source changed` and
is rejected as acceptance evidence. A fresh full four-project current-source run
is pending. Earlier-source results below remain historical, not current-source
proof; benchmark/build/recovery reconciliation, live review, published CI and
maintainer review/merge are still required.

Earlier source after accepted-action batching and exact stale-output coverage:
`eadce413158d2318f645b8d40c224081e34e56d76b85c3a832cd44c4955c44cb`.
The full support suite passed **22 suites / 112 tests**, with zero failures or
skips, at `2026-10-07T01:43:22.105Z`; typecheck passed. Context capture now uses
the existing scoped batch revision projection, preserving action order and each
revision's source qualification and owner eligibility checks.

The preparation cohort also verifies a genuinely retained completed output:
a normal first suggestion save changes the support scope generation; saving that
exact output digest under a new request key is denied with
`409 support_context_changed`. The retained output bytes/digest are checked and
record, revision and receipt counts remain unchanged, with no receipt for the
denied key. This deterministic proof is not a replacement for live S08 review.

The configured-provider S01 diagnostic on `ffedf4…` still failed at settlement;
private evidence is retained under `local-artifacts/010/live-arZUJK`. Two steps
had confirmed provider usage, while the third was reserved but had not begun
provider I/O by the deadline. No automatic paid retry occurred. Current-source
native timing and remaining acceptance bindings are still pending.

On `eadce413…`, the complete actual-eve fixture runner passed all eight cases:
S01–S07 completed and S08 was cancelled, with zero runner failures and complete
fixture usage. Paid calls were explicitly disabled. The runner reports
`actualConfiguredProvider=false`, `reviewed=false` and `hostedProof=false`; it
does not establish configured-provider acceptance. The S01-only fixture diagnostic
completed in 101,500ms, essentially unchanged from the preceding 102,232ms run,
so accepted-action batching is not claimed to resolve S01's settlement overhead.
The unchanged representative benchmark passed on this source: list 1,733.93ms,
detail 1,584.54ms, preview 1,665.69ms and acknowledgement 1,648.70ms p95,
with zero correctness failures. All classes used the original corpus, five
clients, ten warmups and 100 measured samples; production quotas remained intact.
Corpus digest: `8f57df1b300527ea9ee311d638b7b59458e912946b19e56713d453dca9e6d068`.
This is local evidence only. Current-source WebKit and build checks are pending.

Preceding source: `ffedf4a699db65f7e02107ef8bedea2f027cbbb8c574fe0b9464b45e0d83811f`.

- `npm run test:support`: **22 suites, 112 passed, zero failed or skipped**;
  completed `2026-10-06T23:56:50.605Z`.
- Advice admission still validates actor-bound discovery citations. Persisted advice
  source maps now omit transient citation IDs, retaining original source identity,
  generation, content digest and locator. Subsequent operations still recheck
  current authorization and original-source eligibility. Initial context charges
  and the 120-second deadline are unchanged. The regression denies forged admission
  citations and verifies exact retained identities; typecheck passed.
- A single S01 actual-eve **mocked-provider diagnostic** completed in **102,232ms**,
  compared with the prior 118,683ms fixture diagnostic. This is neither configured-
  provider acceptance nor a reviewed eight-case result. Paid calls were disabled.
- The preceding configured-provider S01 diagnostic on the earlier source failed at
  dispatch settlement. Its two provider calls completed in approximately 2.62 and
  1.77 seconds, while admission-to-I/O gaps were approximately 21.8 and 22.3 seconds.
  Evidence remains private under `local-artifacts/010/live-dSXFY0`; no automatic
  paid retry occurred. A separate no-model context profile measured 5,454.89ms for
  one capture, so that measurement alone does not explain the entire native delay.

Performance, WebKit and other source-bound acceptance results below apply to the
earlier source, not automatically to this correction. Their current-source rebinding,
configured-provider settlement/review and exact stale-output proof remain unfinished.

#### Earlier source-bound local evidence

Source: `e6804b2b50fcbf90d79a286a81f4464556266afbbe7fdf3adde511fe39fc4a6c`.

- `npm run test:support`: **22 suites, 111 passed, zero failed or skipped**;
  completed `2026-10-06T21:56:23.546Z`.
- `npm run benchmark:support -- --disposable`: all four classes passed the
  unchanged 2,000ms p95 threshold: list **1,749.96ms**, detail **1,604.86ms**,
  preview **1,597.86ms**, acknowledgement **1,738.15ms**. Original corpus:
  100 customers, 500 scopes, 5,000 actions, 20,000 revisions; five clients,
  ten warmups and 100 measured calls per class. Zero correctness failures;
  production quotas preserved and pacing excluded. Corpus digest:
  `ce1b9bcead9eb60e61436bf53970e7e9c886d27a8e637c29f83f3b0bd56bf849`.
- An explicitly authorized, restricted disposable test-only runtime **login**
  received PostgreSQL `42501` for all twelve zero-row UPDATE/DELETE probes across
  the six protected support tables. Its connection was closed, membership revoked,
  role dropped and exact role absence verified. Private evidence is retained under
  `local-artifacts/010/runtime-role-*/completed.json`; no credential was stored in
  that evidence. No Production privileges or data changed. Earlier failed SET ROLE
  attempts are not counted as this proof.
- `npm run support:recovery:check -- --disposable`: one record, two revisions and
  one receipt survived preserved-database/workflow restart; dependent content was
  withheld and its purge verified. Workflow digest:
  `3d88b390b0ce9c1adc56d0d6dce0832c73d0962d01fbc25db5386f3ce6a20dec`.
  This runner explicitly does **not** prove uncertain native dispatch recovery.
- Prior-feature regression runner passed 15 unit suites / 75 tests and seven
  integration suites / 30 tests, with zero failures or skips, on its own source
  digest `c5e52f56a9529628616f4181bb1bfe65ef01eb740dac800910fe3a77e90b59ee`.
  The scheduler regression now checks all six support jobs at their actual cadence
  and continued workforce/execution work while the conversation watchdog stalls.

All results above are local evidence, not hosted proof. Failed benchmark iterations
remain retained and are not rounded or selected into a pass. The WebKit run launched
before the scheduler-test edit cannot establish current-source acceptance without
source reconciliation. Configured-provider capture/review, exact stale-output proof,
published-head CI and maintainer review/merge remain unfinished. The separate legacy
specialist runtime, Notion rerun and conversation-history follow-up are not completed
by these feature 010 checks.

- Explicit feature selection and prerequisites pass; requirements checklist remains
  read-only with 14/14 checked. No extension hooks file is present.
- Recovery PR #18 was reviewed and approved by the user, then squash merged as
  `2f0b3228762159931dfeb9c26a178373f414601a` after all published-head checks passed.
  Its local branch was deleted and the remote branch is absent. The recovery
  worktree remains detached, preserving its unrelated `.gitignore` edit. README
  on merged `origin/main` documents the watchdog. The dirty main checkout was not
  overwritten; recovery merge is not completion of feature 010.
- Retained configured-provider capture `local-artifacts/010/live-vVFUgx` failed
  S01–S07 at dispatch settlement within the bounded deadline. Each failure records
  one initial dispatch and zero automatic paid retries. S08 retained a failed
  attempt with authoritative usage/cost available. These are failures, not passing
  reviewed responses or hosted acceptance. The original artifacts remain private.
- Read-only timing inspection found S01's two captured provider steps completed
  in 1.715 and 3.290 seconds with confirmed usage, while the advice remained running.
  Other cases include incomplete third-step usage and S04 lacks partial evidence.
  Therefore provider latency alone does not establish the settlement root cause;
  investigate transaction/tool/projection settlement before any paid recapture.
- Corrected stale specification/plan headers to reflect implementation in progress.
  `npm run check:docs` passes over 140 authored Markdown files. All source-bound
  acceptance checks must reflect these later documentation changes.

### Latest continuation checks — 2026-10-05

- Representative benchmark passed all four classes on source
  `daad1befc80e3d89a14d9d0c773a3f88355b2e3a955edd97150b3e480169786f`,
  corpus `4c8c6502b0af82797cc4b9ccfe63829f8528226a7c58db30047c413652f38555`:
  list **1,910.28ms**, detail **1,646.38ms**, preview **1,605.89ms**,
  acknowledgement **1,936.70ms** p95. Each class ran ten warmups and 100 measured
  calls with five clients over 100 synthetic customers, 500 scopes, 5,000 actions
  and 20,000 revisions. Correctness failures: zero. Production quotas remained
  unchanged; pacing and preview preparation were excluded from acknowledgement
  latency. This is local deterministic evidence, not hosted proof. Earlier failed
  iterations were not counted as passing runs. Later source changes require rerun.

- Owned lifecycle suite passed **6 tests**, including separate immutable 89-day
  and 91-day draft fixtures: the young payload remains, the old payload is purged,
  and revision/receipt identities remain. The first fixture attempt was rejected
  by the immutable-history guard; that guard was not changed.
- Preserved restart passed at source digest
  `b77f67048f2241e1009017bf6e7e67185ebe80846ff924a799236c07eff386b5`:
  one record, two revisions, original same-key receipt replay and unchanged workflow
  sentinel. A real reviewed original source was retracted; dependent content stayed
  withheld across restart and was purged by owned cleanup while identity remained.
  The fixture advances queue scheduling, not immutable historical timestamps.
- `support:native:check -- --interrupted` passed through the actual framework:
  exactly one persisted fixture provider call, restart during a provider barrier,
  same-key replay and noncompleted terminal settlement. Initial harness attempts
  failed before interruption due to HTTP sequencing or the short admission window;
  these were not counted as passes. This is deterministic-provider local evidence,
  **not** configured-provider or hosted proof. Final source-bound reruns remain due.

- Full support browser gate passed **44 cases across four projects**,
  `fullAcceptance: true`, source digest
  `deafa8280c5184eced5c515cc2d40acbb6f204d2d1b6c0c253e22c4341b3d61c`.
  The matrix includes positive dated-evidence completion, reopening, exact-review
  races, withdrawal, partner revocation, lost acknowledgement, native reload/save
  and cancellation. Cases ran once without retries or skips.
- Inspected synthetic readiness captures in desktop/mobile light/dark from the
  same run. Six checks remain legible, with appropriate responsive stacking and
  no visible page overflow. Mobile navigation and Next.js dev overlays are visible
  in development captures; these are not hosted captures. Automated keyboard and
  axe checks are recorded by the relevant cases, not claimed for every state.
- Added a separate WebKit matrix entry alongside deterministic support CI,
  retaining existing jobs. Published-head execution remains an open gate.

- Latest four-project WebKit smoke completed **36 cases**, with no retries:
  source digest `15498c2e1fe36334ac1f10183d9fa4e8123ef16e48687e1c2a54534cb2057ec5`.
  This includes the stale-review head race. Full acceptance is still false;
  completion/reopen branches and other required gates remain open.
- Rebuilt root README as a conventional repository guide after that run ended,
  with concrete user-facing functions, explicit implemented/in-progress/planned
  distinctions, setup, tests, structure, contributing, operations and help.
  Headings use conventional title case. `check:docs` passed over 140 authored
  Markdown files; all 21 referenced npm scripts and 24 links were checked.
  README changes mean subsequent source-bound gates need a fresh digest.

- Actual-framework owned native smoke passed with two deterministic provider calls,
  each capped at 4,096 output tokens. This exposed and fixed support's missing
  governed dispatch discriminator and pre-admission unclaimed-turn propagation.
  Authored root model configuration is unchanged; the provider replacement exists
  only in the owned app copy. This is native protocol proof, not actual configured
  provider output, full lifecycle acceptance or the eight live-output review gate.

- Most recent full cohort: `2026-10-05T17:51:07.173Z`, **19 suites / 93 passed /
  zero failed or skipped**, digest
  `32e2eed2ed7075fd06d3cefb0767401c71f07c6d7e1462a9ec6ef6b06f52da44`.
- Owned supervisor restart passed with exactly one record, revision and receipt,
  unchanged workflow sentinel digest and identical lost-ack replay. Source digest
  `ac9ffc82ccd73b587e6677a51682743217ecd585b0bcdf02878147dc37f1769a`.
  Uncertain native dispatch and dependent purge are explicitly still unverified.
- Five owned lifecycle tests subsequently passed, adding earliest-deadline
  shortening with lease preservation and stale-lease refusal. These changes
  require a new full source-bound cohort.
- Dedicated support deterministic CI job added; YAML parses and existing jobs
  remain present. Published-head CI and the required support WebKit job are
  not yet verified/complete. Generic integration/contract commands now exclude
  support suites, which remain exhaustively required by `test:support`.
- `npm run check:docs` passed over 140 authored Markdown files.

- Full source-bound support cohort completed at `2026-10-05T17:33:17.790Z`:
  **19 suites, 91 passed, zero failures or skips**; source digest
  `a9aa77d87ab1eb408804d1ed74604c431d4cf713f1cc06159ee8295e4395d294`.
- Subsequent native-retirement changes require a new full source-bound run.
  Narrow owned advice checks passed all three tests after adding signed exact-session
  reset authorization, wrong-session/signature denial and one-time receipt settlement.
  The reset HTTP response is mocked: this establishes domain protocol behavior,
  not actual framework archive erasure or a native-runtime acceptance pass.
- Node 24 typecheck passed after native-retirement implementation. Root model
  configuration remains unchanged. No PR or merge has been completed.
- Four owned lifecycle tests passed, including disabled new-work refusal with
  reads and retention still available and bounded audit minimization advancement.
- Four environment/runner tests passed, including rejection of empty, missing,
  duplicated and orphaned manifests. Earlier staffing/execution discovery excludes
  support suites; legacy-only WebKit discovery excludes support specs. Reporting's
  explicit earlier-feature manifest does not discover support suites.

- Explicit feature selection resolved `/Users/mcteer/Projects/turas-010/specs/010-tam-support-guidance`
  with research, data model, contracts, quickstart and tasks available.
- Requirements checklist: 14 checked, zero unchecked; checklist left unchanged.
- No `.specify/extensions.yml` exists; no pre-implementation hooks registered.
- Existing `.gitignore` covers secrets, runtime state, dependencies, generated
  output, editor files and private artifacts, preserving `.env.example`.
- `npm run check:docs` passed: 139 authored Markdown files and tracked-file hygiene.
- With Node 24 selected from `/opt/homebrew/opt/node@24/bin`, the four existing
  support unit/contract suites passed: 23 tests, zero failed or skipped.
  Suites: environment, policy, readiness and schema. These narrow checks do not
  establish database authority, source eligibility or end-to-end readiness.

## Remaining Gates

T001 and T002 are complete; remaining tasks are unchecked pending their full acceptance evidence.
Support migrations, domain/API/UI workflows, native advice, retention, exhaustive
regressions, WebKit, representative load, paired recovery and eight actual-output
reviews are unfinished. No selected or hosted database was migrated. No model,
integration, external send or deployment was changed.

## Owned Setup — T001/T002

The user approved an ignored symlink to the main checkout's `.env.local`; no
credentials were copied to authored files or output. A read-only probe confirmed
the configured test marker and schema 028. The selected test source was not migrated.
The shared clone runner created owned empty databases, initialized committed schema
041 and runtime roles, then dropped its owned databases and temporary app/store copies.
The second run also bootstrapped synthetic identities and created panel, mcteer and
partner sessions through the existing test-session helper. The new fixture refuses
unowned connection identities before any write. No support approval was seeded.

Root `agent/agent.ts` SHA-256 remained
`07c4b66e88fd7572c7ccb339c8455abd5f0ab34f2d5389636af6f8429e25045a`.
Read-only analysis found task coverage for all 24 FRs and seven SCs across 45 tasks,
no unmapped tasks or critical/constitutional conflicts. The low-severity stale
planning-status wording is deferred to the evidence-backed T045 update.

## Foundation Work In Progress

- Node 24 support unit/contract checks: five suites, 34 tests passed; full
  `npm run typecheck` passed after adding strict list/query and UTF-8 body bounds.
  The two new missing-validator tests failed before implementation and passed afterward.
- Additive migration 042 is now authored and manifest-bound; 001–041 bytes are
  untouched. An owned empty database initialized to schema 042 and passed three
  initial integration assertions: table installation, null-workload uniqueness /
  immutable audience, and runtime denial of payload/history mutation.
- The narrowly granted payload-purge function requires an unexpired exact lease,
  due time, exact digest and matching invalidation generation. Its race/lifecycle
  basic exact-lease tests now pass; the broader T034 race/lifecycle gate remains outstanding.
- All clone resources were cleaned by the owning runner. These checks did not
  start a model call, upgrade the selected source, or establish hosted readiness.

The owned prior-schema fixture initially failed because later migration files
remained visible to the migration loader. The fixture now moves only copied
post-041 migrations outside its owned migration directory, then restores the exact
copied files and full manifest for upgrade. The corrected 041→042 check passed,
preserving all three synthetic login-session identities. Root migration files were
not moved or rewritten. The final focused owned check passed 16 tests (12 command
boundary tests plus four storage tests), including wrong-lease refusal, exact
invalidated-payload purge, replay refusal and retention of a newer payload.

## Current Cohort Checkpoint

`npm run test:support` completed on 2026-10-05 with all ten currently registered
suites and 54 assertions passing, zero failed/skipped. Source digest:
`2b71ac053cca8d3f6e74cb663efb41c0752c66a8ddcdf5c4acf7599eece6484b`.
This checkpoint covers only the implemented cohort, not every planned feature gate.
It includes real profile review/retrieval original-source checks, exact unknown
readiness acceptance, review expiry, empty read without initialization and partner
pending-data isolation. Raw evidence stays in ignored private artifacts.

The subsequent cohort passed ten suites / 55 tests with zero failures or skips,
including current-authority receipt lookup and expired-key rotation/refusal.
Source digest: `a58d82da4fa5964f7a7b7e7043af1a215327bbef6ea4c173491417c781f5118a`.
Bounded authorized history and pending-history partner denial were then added;
their verification is running. Node-24 typecheck passes.
Foundation tasks T005–T008 remain unchecked until their full
authority, source, history and replay acceptance cases are evidenced.
