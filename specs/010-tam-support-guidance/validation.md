# 010 Implementation Validation

Implementation resumed on 2026-10-05 in the isolated `010-tam-support-guidance`
worktree, based on committed main `080ad48645c90be63affd7e83a62185a9aacb8d1`.
Existing uncommitted support scaffolding was preserved and inspected. Unrelated
reporting and Spec Kit changes in the main checkout are not included.

## Setup Evidence

### Continuation — 2026-10-06

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
