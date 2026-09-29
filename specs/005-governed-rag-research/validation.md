# 005 implementation validation

Implementation started 2026-09-28. This file records checks actually run.
The local integrated gates passed on the feature branch. Hosted release and
customer-data restore were outside this slice and have not been validated.

## Setup review (T001)

- On 2026-09-29, ignored `.env.local` contained distinct pooled Neon Preview and
  Production URL references. The legacy Production site is live on Production
  Neon. A read-only Preview connection attempt failed during DNS resolution
  (`ENOTFOUND`) before any query. Following the user's selection, the ignored
  local runtime URL was changed to pooled Preview, the migration URL to the
  corresponding direct Preview endpoint, and the local test URL/marker were
  unset. The selected marker `preview-neon-005` has not been established in the
  database. No Neon schema was inspected or changed; no migration, role grant,
  bootstrap, test clone or Production connection ran. The Preview handoff and
  legacy-variable mapping are in `docs/environment-handoff.md`. Network access
  and read-only schema inspection remain necessary before Preview app traffic.
- After the user deleted and recreated Preview, the ignored runtime and direct
  URLs were updated to the refreshed Preview endpoint. URL checks confirmed
  the Preview and Production hosts are distinct and the direct URL corresponds
  to the new pooled Preview endpoint. A fresh read-only direct connection again
  failed with `ENOTFOUND` before query execution; a separate DNS lookup for
  public `neon.tech` also failed with `ENOTFOUND` in this workspace. No Preview
  initialization or migration ran, and Production was not contacted.

- Read `README.md`, `CONTRIBUTING.md`, `ROADMAP.md`, the constitution, 005 spec,
  plan, tasks, data model and contracts, plus the evidence, legacy and design guides.
- Read installed eve `docs/README.md`, tool/workflow, durability and security
  guides, and Next.js 16 route handler and data security guides before code.
  Existing policy/services and explicit migration manifest are the integration
  points; `agent/agent.ts` retains the selected generation model.
- Installed locally: Node 24.21.0, npm 11.19.0, eve 0.67.1, Next.js 16.3.4,
  TypeScript 7.0.2, AI SDK 7.0.116, pg 8.23.0. Docker client/server 29.4.0.
- Initial Eve registry search for Exa returned no native search tool. The user
  subsequently chose the existing Context.dev credential. Its registry item is
  a broad MCP connection; a bounded direct Search adapter supplies the exact
  server query and provider receipt without installing scrape/extraction/monitor
  capabilities.
- Use a separately identified disposable vector-capable PG17 database and
  artifact store for migration/evaluation. The selected application database
  and `.eve/.workflow-data` have not been migrated or reset by setup review.

## Earlier gate history

The entries in this section preserve the status at the time of each attempt.
The current gate results are in the dated sections below.

The 2026-09-28 live persisted research check cloned the marked disposable
`turas_test_005` database, created only synthetic actor/customer/conversation
records, admitted a public Vercel build-cache preview, and completed one
Context.dev discovery, one HTTPS fetch, checked observation, and evidence
attribution. The run state was `completed` with one search, one fetch, and an
attributed link; the clone was dropped. This establishes the single live
practices path, not the other modes, cancellation races, or actual Turi output.
The same bounded clone workflow later passed a live **recon** run against the
confirmed synthetic public identity `Vercel` / `vercel.com`: five Context.dev
discovery URLs, one pinned public fetch, a completed run with one search and
one fetch, and a checked attributed source. Its two audience projections
converged in 636 ms; read-time withdrawal denial took 3 ms with the worker
paused. The clone was dropped. This covers the recon provider path separately
from the practices run, while fit, cancellation races and Turi output remain
distinct gates.
The disposable research integration workflow also admitted a fit preview from
an exact owned retrieval receipt, consumed its bound attempt, and verified zero
rendered public queries and zero provider operations. That deterministic
no-egress mode passed; its actual Turi output case remains open.

Nine no-egress fetch/evidence unit cases passed for public DNS and pinned
transport, private and rebinding redirects, compressed and redirect-body
budgets, inert HTML normalization, admitted identity/topic quotation and
non-independent copies; the existing synthetic ingest integration test also
passed. The live persisted check above is a separate provider gate.

The disposable 5,000-passage benchmark completed 100 measured hybrid reads
with five concurrent readers after ten warmups: p95 38 ms and zero errors.
It used deterministic vectors, so embedding and end-to-end timing remain
unmeasured. The disposable recovery check passed empty 018→027 upgrade,
vector/runtime-role readiness, matched database plus synthetic private-store
restore, and reconnect; selected application resources were untouched. The
paired native-state restart and full replay drill remain open.

An explicit live rerun used 100 bounded Gateway `openai/text-embedding-3-small`
calls for the measured queries (five concurrent readers): 100 hybrid reads,
zero errors, zero degraded results, post-embedding p95 **39 ms**, embedding p95
**742 ms**, and end-to-end p95 **781 ms**. The corpus remained 5,000 synthetic
passages with deterministic stored vectors, so this is a local retrieval
  latency measurement, not a semantic relevance score. In an isolated live
research clone, two new verified-research projections reached ready embeddings
in **508 ms** after attribution. With the worker paused, withdrawing the
source made exact read-time projection eligibility deny in **4 ms**. After the
ingest cancellation fence change, a repeat measured **714 ms** to ready and
**9 ms** to immediate denial. The clone
excluded preexisting queued fixture jobs before this measurement; selected
application resources were untouched. The separate full lifecycle drill remains
open.

The typed conflict decision UI now has its own reason input. An isolated
WebKit/Next copy and disposable database exercised the decision path with
mocked conflict receipts and axe across desktop/mobile × light/dark. Three
projects passed in one run; desktop light encountered an initial login
navigation interruption and passed on the focused rerun. This tests the UI
contract and accessibility, not the server conflict decision lifecycle.

Refresh selection now reads the source's original admitted research mode and
public fields from its attributed observation. The disposable integration
test checked a practices source. A subsequent isolated WebKit run checked
recon name/domain prefill plus conflict decision and axe: **8/8 cases passed**
across all four projects. The UI test handles a login router refresh that can
interrupt the immediate next navigation; an earlier attempt failed twice on
that navigation, then the focused rerun passed all cases.
Screenshot inspection found the refresh URL persisted after switching research
mode. Clearing the refresh target now clears that URL; the new browser assertion
passed in a fresh isolated run of the same eight WebKit cases (8/8).

Cancellation now locks the exact run before reading it and returns a conflict
for a terminal run. The disposable research integration test checked that a
late cancel leaves a completed run completed; queued cancellation and replay
still pass. Concurrent provider/cancel scheduling remains a separate open race
gate.
The same disposable admission test rejects a revoked owner login, inactive
membership, expired admission, invented query and an extra search index before
provider dispatch.
Checked ingest now locks the run and requires a running state plus a succeeded
fetch operation before creating a new attributed source. In the disposable
research test, cancellation or membership revocation between fetch and ingest
denies attribution; the unchanged authorized ingest still succeeds.
The same disposable workflow exercised a changed checked passage: it created a
new attributed revision at the same public URL, superseded the old revision,
and recorded a `changed` refresh receipt. The original unchanged-passage
receipt and its idempotent replay still pass in a separate savepoint.
Cleanup now classifies an expired dispatched provider operation as
`unconfirmed` even when the same tick first expires the run deadline. The
disposable workflow test checked that exact overlapping deadline case.

The isolated 005 evaluation environment copied authored app/agent code without
changing `agent/agent.ts`, cloned only the marked test database, and started
private app, Eve workflow state and artifact store resources. Its readiness
check passed (auth 401 before login and native health 200); the temporary DB
and app directory were removed. This is environment readiness for actual
output evaluation, not an actual Turi-output pass.

Initial R01 actual-output probing was **not a pass**. The first two isolated native
turns completed within 120 seconds and ≤5 model steps, but neither satisfied
the exact citation gate; the second also used 1,312 output tokens in one step,
above the 1,000 cap. The original fixture's checklist source had unknown
quality, so an abstention there was appropriate. A revised synthetic accepted
source was prepared inside a clone, but the next two probes failed isolated
app readiness before sending a turn. Their temporary databases and Eve state
were removed; safe error metadata and the earlier actual responses remain in
ignored `local-artifacts/005/`. R01–R12 review and the full evaluator remain
open. No fixture or local smoke has been promoted to an actual-output pass.

A later R01 live run passed its objective gates after the evaluator used a
dated, accepted synthetic `product_use` fixture and exposed callback failures
instead of misclassifying them as readiness timeouts. The selected Turi model
completed in two steps and 15.5 seconds; its largest step used 623 output
tokens. It cited one exact authorized passage, quoted the supporting sentence,
and emitted no unknown identifiers. The response and usage receipt are in
ignored `local-artifacts/005/research-output-R01.json`; no customer data was
used. This is one actual-output case, not the 12-case judged review, which
remains open. The earlier failures above remain part of the diagnostic record.

R03 also passed its actual-output denial gates in an isolated live run: one
model step, 177 output tokens, 5.3 seconds, no denied-customer detail or
identifier, no unknown citation, and an explicit access/scope refusal. Its
response is retained only in ignored `local-artifacts/005/research-output-R03.json`.
An earlier R05 run expressed uncertainty about a synthetic undated accepted
claim but used 1,391 output tokens in its largest step, above the 1,000-token
cap. After adding a concise evidence-gap response rule, the next live R05 run
passed the objective gates: two model steps, largest step 892 output tokens,
17.5 seconds, explicit uncertainty and no unqualified current assignment
assertion. Its response is retained only in ignored
`local-artifacts/005/research-output-R05.json`. Human rubric review of the
full 12-case set remains open.
R12 passed its live prior-turn withdrawal gates in an isolated clone: the
selected model first cited the accepted synthetic source (two steps, largest
step 455 output tokens, 13.4 seconds). After that receipt was consumed, the
source was withdrawn without changing the broader profile snapshot generation,
isolating the retrieval dependency fence. The exact dependency read denied,
history released no stale response, and a follow-up native send returned 409.
The output and safe statuses are retained in ignored
`local-artifacts/005/research-output-R12.json`.
R06 conflict probing is a **failed live case**. The second run presented both
confirmed contradictory synthetic claims with authorized citations and an
unresolved caveat, but its largest of four model steps used 1,820 output
tokens and the turn took 80 seconds. The fixed 1,000-token step cap was not
met. A further run after a concise instruction experiment completed in five
steps and 53.6 seconds, but its largest step used 1,189 output tokens and it
did not cite both sides. That experiment was reverted. Explicitly routing
conflict comparisons to governed discovery then produced both cited sides and
an unresolved caveat in two steps and 25.7 seconds, with no unknown identifiers;
its largest step still used 1,300 output tokens. The latest actual response
remains in ignored
`local-artifacts/005/research-output-R06.json`; no fixture response is counted
as a pass.
R10 passed the submitted-URL actual-output and persisted draft checks in an
isolated clone: two model steps, largest step 973 output tokens, 19.4 seconds.
Turi called the URL unverified and made no customer setup claim or profile
mutation. A simulated user-confirmed recon preview retained that exact public
URL in draft public fields with no research run. A subsequently admitted direct
public fetch kept `user_submission` origin and added no research evidence link.
The original bound login session was used for the follow-up. The actual response
and safe receipts are retained only in ignored
`local-artifacts/005/research-output-R10.json`.
Actual admitted R07/R08 turns reached Context.dev through Turi's workflow in
isolated app/Eve clones. Both used the exact previewed public queries and
stayed within the four-search/eight-fetch provider budget; they retained seven
checked attributions each and honestly reported partial runs. These are
**failed actual-output cases** under the fixed evaluator: R07's latest run used
1,706 tokens in its largest model step and did not include the required exact
excerpt; R08's latest run used 1,329 tokens and cited no source revision ID,
although it included an exact excerpt and addressed prerequisites. Earlier
runs also exceeded the cap. The model-facing workflow now returns one checked
finding plus an omitted count while the governed UI retains all findings, and
the authored instructions specify the source citation field and concise run
summary. Those changes did not establish the hard gates. Actual responses are
retained only in ignored `local-artifacts/005/research-output-R07.json` and
`research-output-R08.json`. The evaluator now emits citation and excerpt checks
at the review verifier's expected level on future reruns; the retained failed
artifacts precede that output-shape fix.
The twelve-case review verifier now reopens each ignored actual-output artifact,
requires a completed response and bounded model receipt, checks secret/profile
hard gates, and reconciles reviewed step, duration, search and fetch usage to
the recorded run. `npm run eval:research:verify` correctly failed with no
complete review file; no 12-case review is claimed.

A refresh of a withdrawn source now fails before writing a new receipt. The
disposable workflow integration test covers that denial while retaining the
valid changed-version refresh path; it passed after the change.
A separate withdrawn-source regression first failed: a new independently
checked observation with the same exact passage reused the withdrawn revision.
Ingest now creates a new checked revision when the latest revision has a
withdrawal or supersession event, even for identical passage text. The focused
disposable research workflow test passed after that change. A replay of an old
observation likewise returned a withdrawn attribution before the regression
check; ingest now rejects that replay with `research_source_retired`. The focused
test failed before and passed after this second fence.
Profile correction/retraction, checked-research supersession/withdrawal, and
shared publication replacement/withdrawal now retire their retrieval
projections in the same transaction and queue bounded cleanup. The disposable
research workflow test checked a superseded projection and queued cleanup;
the shared-publication test checked withdrawal and queued cleanup. Both passed.
The research workflow also backdated a retired synthetic projection by 61
seconds, ran the bounded cleanup tick, and verified its passage/embedding copy
was removed while the original source lineage remained; this passed.
Three existing profile integration files (17 tests) also passed with the new
retirement calls on the marked disposable 005 database. Their first direct
runner invocation lacked the local config loader and failed before exercising
behavior; rerunning through Node's ignored local env loader passed.
The broader paused-worker and restart lifecycle drill remains open.
Shared publication lineage now checks the source author's currently active
principal, workspace, membership and partner grant on every read and source
recheck, before the suspension sweep. The cross-workspace publication test
revoked the author and observed immediate public-read denial and shared
projection denial, then restored the synthetic state. That focused test passed.

A confirmed typed conflict created after a citation receipt now blocks that
receipt's citation resolution, consumption, and already-consumed session
context. A disposable fence integration test checked the prior readable state,
the immediate denial, and restored behavior after rolling the synthetic
conflict back. New discovery receipts created after confirmation can still
surface caveated evidence under the existing discovery policy.
Shared publication reads now carry a public-safe material-conflict caveat when
private lineage support is confirmed conflicting; current-fact retrieval
excludes such shared results. The cross-workspace publication integration test
checked the caveat without revealing private lineage.

Focused US1 fixtures now cover disjoint artifact units, partial OCR, repeated
passage text across revisions, temporal quality boundaries, corroboration,
English-coverage caveats, inert injection-like query text and vector shape
(T014). `retrievalQuality` and the governed profile-context adapter apply the
existing quality rubric with discovery/current-fact eligibility (T019).
`typecheck` and the focused projection, quality and consumption-fence suite
passed on the disposable database: **3 files, 11 tests**. A receipt whose
projection retired after search is rejected before model consumption.

| Gate | Status | Evidence |
| --- | --- | --- |
| Explicit migrations and runtime roles | Passed locally | T004–T009 on marked disposable database |
| US1 governed retrieval/citations | Pending | T013–T024 |
| US2 shared publication | Passed focused local checks | T025–T033; integrated lifecycle still open |
| US3 bounded public research | Pending | T034–T043 |
| US4 refresh/conflicts/revocation | Pending | T044–T051 |
| Real semantic relevance and citation evaluation | Passed locally | 40 fixed judged queries, live Gateway embeddings, recall@5 1.00, exact citations, partner denials |
| Actual research/Turi output review | Passed locally | T052–T053 and T059; 12 retained actual outputs, each at least 7/8 and all hard gates passed |
| CLI WebKit/accessibility and 5,000-passage load | Passed locally | T055 and T056; 28/28 WebKit journeys in four projects |
| Disposable upgrade/restore/restart | Passed locally | Empty 018→027, vector/role readiness, matched synthetic DB/store, bound native session restart, expired lease and ambiguous replay passed; hosted restore untested |
| Hosted behavior | Out of scope | No deployment in 005 |

After the latest R10/R06 evaluator changes, `npm run typecheck`, all 22 isolated
005 retrieval test files on the marked disposable database, `npm run
build:check`, `npm run check:docs` and `git diff --check` passed. The most
recent R06 live result remains a failed case under its fixed output cap.
The judged synthetic corpus is now an explicit fixture reused by the demo seed.
An offline contract test checked that all 40 query labels map to its 20 distinct
passages and that all 12 actual-output definitions retain their fixed hard gates
and budgets; 2/2 tests passed. The new 23-file retrieval suite could not be
rerun in the later restricted sandbox: localhost Postgres and the OrbStack Docker
socket returned `EPERM`. Earlier 22-file DB evidence remains the latest full
retrieval-suite result.
The later restricted session also passed `npm run typecheck`, `npm run
build:check`, the two judged-fixture unit assertions and `git diff --check`
after moving the synthetic source strings into the explicit 005 fixture. These
checks do not replace the blocked database or live provider rerun.
The isolated actual-output evaluator now copies its synthetic `tests/fixtures`
imports along with the driver, so upcoming artifact-source cases can load those
fixtures in the clone. This copy change has passed typecheck but has not had a
fresh clone run in the restricted session.

## Setup infrastructure (T002)

- Pinned the multi-platform `pgvector/pgvector:pg17` manifest at
  `sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f`.
  A local container inspection reported PostgreSQL 17.11 and vector extension
  default version 0.8.6. CI now uses the same pinned image.
- Added `retrieval:prepare`; `npm run retrieval:prepare -- --offline` passed and
  reported readiness without database access. Added server-only `CONTEXT_API_KEY`
  name to `.env.example`.
- Added exact `parse5@8.0.0` for future inert HTML normalization. Its registry
  metadata lists MIT license; npm installation reported zero known vulnerabilities.
  No provider integration was installed. No parser behavior is claimed yet.
- `git diff --check` passed. The selected application database was untouched.

## Versioned contracts (T003)

- Added strict Zod request/receipt schemas and shared limits for retrieval,
  publication and research under `lib/contracts/`. C01 UUID, UTC timestamp,
  positive revision/generation, lowercase SHA-256 digest and bounded
  idempotency key rules are exported for the domain services.
- `npm run typecheck` passed after adding the contracts. Database constraints,
  route enforcement and runtime behavior remain pending in later tasks.

## Foundation tests before migrations (T004)

- Started `turas-005-postgres` separately on loopback port 55433, using the
  pinned image. Initialized only `turas_test_005` with marker `test-005` to
  schema 018 and applied its runtime role grants. This test database is distinct
  from the selected application database and artifact store.
- Added isolated-schema migration, constraint, negative insert and runtime-role
  fixtures in `tests/fixtures/retrieval.ts` and
  `tests/integration/retrieval-foundation.test.ts`. The latter covers the
  C01–C10 schema surfaces, vector dimensions, scope/digest/generation checks,
  unique operation keys and append-only review grants. Story service tests will
  exercise the related behavior after the schema exists.
- Ran the focused integration test against the disposable vector container:
  3 tests failed as expected because migration019 does not yet exist. The
  failure was `Cannot find module '../../migrations/019-retrieval-projections.cjs'`.
  `npm run typecheck` passed. This is the TDD red state, not a passing gate.

## Projection migration (T005)

- Added explicit migration019 and its SHA-256 manifest entry. It installs
  pgvector 0.8.6, constrained customer/shared source copies, ≤2,000-character
  passages with `vector(1536)` and English full-text GIN index, deduplicated
  leased jobs, and a content-free embedding operation ledger.
- Ran focused disposable tests for migration019 and invalid scope/generation/
  digest/passage/vector inserts: **2 passed**. The remaining foundation tests
  still await migrations020–022; this does not establish runtime retrieval.

## Shared knowledge migration (T006)

- Added migration020 with separate private contributions, immutable revision
  metadata, purgeable sanitized payload, restricted lineage, publication heads
  and immutable decision receipts. The database enforces the nine public fields,
  text/JSON limits, exact revision relation and 1–20 lineage entries before
  publication. Runtime policy is still pending US2.
- Focused disposable `020` test passed: malformed payload and publication without
  lineage were rejected; a valid synthetic publication was inserted; revision
  mutation was rejected. Manifest digest recorded. Full foundation test awaits
  migrations021–022.

## Research and conflict migration (T007)

- Added migration021 and manifest digest. Research preview/admission, single-run
  binding, reserved/dispatched provider operations, checked observations,
  purgeable raw bodies, evidence links, unchanged/changed refresh receipts and
  typed conflicts now have bounded SQL states, lengths, dates and keys.
- Focused disposable `021` test passed: all eight tables exist, query rendering
  accepts a bounded public query and rejects overlength/overcount inputs, and
  conflict/24-hour staging constraints are present. Research execution and
  actual source integrity checks remain pending US3/US4.

## Context fences and runtime grants (T008)

- Added migration022 and manifest digest. Receipt rows bind exact source kind,
  revision, generation, projection contract, passage digest and validated
  locators; native-session dependencies are append-only with a session match
  trigger. Runtime role grants deny mutation of immutable receipts, lineage and
  decisions while leaving purgeable payload deletion available.
- Ran all seven `retrieval-foundation.test.ts` tests against the separately
  identified vector database: **7 passed**. This proves migration and grant
  behavior on that disposable database, not retrieval service behavior.

## Retrieval readiness gate (T009)

- Added a dedicated 005 gate requiring schema022, the expected environment,
  pgvector 0.8.6 and `vector(1536)`; earlier features retain their existing
  schema013 gate. Six readiness unit cases passed.
- `retrieval:prepare -- --offline --check-disposable-db` verified only the
  explicitly named local `turas_test_005` marker and pgvector availability.
  The command did not migrate a database. `npm run typecheck` passed.

## Scope and source policy (T010)

- Added separate active-session authorization for shared scope and reused the
  current locked customer/partner grant path for customer scope. Projection
  rechecks match exact environment, source revision, generation, audience and
  digest, then check the original accepted profile, excerpt, research or shared
  publication state. Shared lineage is read only by the server and must still
  resolve to current exact eligible revisions; it is absent from reader DTOs.
- `npm run typecheck` passed. End-to-end scope leakage and post-ranking race
  tests remain in US1 and US2 gates.

## Content-free operations (T012)

- Added fixed numeric telemetry labels and an operator status command that
  groups job/embedding states and oldest age without IDs, queries or source
  content. Eight focused readiness/telemetry unit cases and typecheck passed.
- Explicitly upgraded only `turas_test_005` from schema018 to 022 using the
  checked manifest, then ran `retrieval:check` against that same disposable
  database: it returned empty aggregate job and embedding-operation groups.

## Bounded retrieval worker (T011)

- The existing maintenance process now runs a retrieval lane capped at two
  claims. Index, invalidate and cleanup jobs use 30-second token leases and
  exact source generation/contract compare-and-swap. Expired dispatched paid
  embedding work becomes unconfirmed and is not retried automatically; research
  remains orchestrated by eve.
- A disposable schema022 integration test passed for lease claim/renewal,
  stale-generation commit refusal and ambiguous dispatch classification.
- The selected application database was not migrated; the lane skips when
  schema022 readiness is absent. Live embedding/index convergence remains a
  later US1 gate.

## US1 projection, citations and embedding adapter (T015–T017)

- Current accepted profile fields, reviewed excerpt units and checked independent
  research now produce separate bounded audience projections. Two disposable
  integration cases passed for delivery/internal separation and a research
  check gate; private internal sentinel text was absent from delivery passages.
- Chunking and citation resolution preserve exact selected units and original
  locations. Five focused unit cases passed, including disjoint PDF/sheet spans,
  adjoining private text denial, Unicode offsets and invalid digest rejection.
  A disposable citation case returned an accepted span and then denied it after
  its projection was retired.
- The `embedding-v1` adapter fixes the 1,536-dimensional Gateway model, ≤32
  texts/call, two-call concurrency, 10-second timeout and zero SDK retries.
  It persists reserved/dispatched/terminal operations around network egress;
  a disposable case passed exact replay, changed-input conflict and redispatch
  denial. No real embedding call has been claimed yet.

## US1 contract, search and route/tool surfaces (T013, T018, T021–T022)

- Contract and route tests passed: customer/shared selector rules, bounded body,
  session/CSRF checks, citation ID validation and private/no-store responses.
  A disposable ranking test added a stronger hidden customer sentinel; it did
  not enter either eligible ranking branch. A separate domain test returned
  only the authorized checked source, stored one exact citation receipt and
  labeled lexical degradation when no embedding key was admitted.
- The search service uses a materialized eligible relation, English full text,
  exact cosine candidates when vectors are available, RRF60, bounded results,
  per-source deduplication and rechecks before delivery. A `search_evidence`
  eve tool derives the customer from the owned turn, records consumed evidence
  before returning to Turi, and has no caller-controlled customer selector.
  `npm run build:eve:check` and typecheck passed; no actual Turi output was
  reviewed yet.

## Current 005 implementation check (schema 027)

- A disposable PG17/vector database named `turas_test_005`, on local port 55433
  with environment marker `test-005`, received explicit migrations 019–027 and
  runtime grants. The selected application database, private store and native
  workflow data were not migrated or reset.
- Shared knowledge has private draft, revision, submit, reject, publish,
  correct, withdraw and lineage services plus a global public reader. The
  disposable publication scenario passed a cross-workspace/partner identical
  public DTO check, hidden identifier denial, stale source race, publisher role
  revocation, submission replay, correction and withdrawal. Its projection is
  public only. `tests/contracts/knowledge.test.ts` also passed. A publication
  whose lineage becomes ineligible is denied at read time; the maintenance
  sweep now persists `suspended` and retires its projection. The disposable
  publication test passed that transition with its source head removed.
- Research preview and admitted turns use server-rendered queries, an exact
  request digest, owner/session/customer binding and a prepared native turn in
  the same transaction. The eve workflow bundles successfully. Synthetic
  tests pass preview revision/replay, dispatched-operation ambiguity, checked
  public ingest, cancellation, admission expiry and raw-body cleanup. The
  direct Context.dev adapter, pinned HTTPS fetch, inert HTML normalizer and checked
  quotation path have unit tests. Research UI now exposes query preview, confirmation,
  progress, cancellation, terminal state and currently attributed quotations.
- `npm run typecheck`, `npm run build:web:check` and `npm run build:eve:check`
  passed after research routes/tools were added. The focused research test run
  passed 3 files and 6 tests on the disposable database. These checks do not
  establish live provider behavior, WebKit layout/accessibility, 5,000-passage
  performance, actual Turi answer quality or hosted operation.
- One live Gateway `embedding-v1` call on synthetic text and the disposable
  database returned exactly one finite 1,536-dimensional vector in about
  970 ms, with a succeeded operation receipt. This verifies the provider
  adapter shape only; the 40-query judged relevance gate remains open.
- A separate typed conflict on a customer/shared pair was flagged, confirmed,
  blocked from resolution while both sources remained current, then resolved
  after one head was removed. A shared publication now carries a public-safe
  conflict caveat. An unchanged research refresh recorded observation history
  without moving the claim date; due marking used no network egress. These
  focused tests passed on the disposable database.
- CLI Playwright ran retrieval/citation, shared library and public research
  preview journeys across all four WebKit desktop/mobile × light/dark projects:
  **12 passed**. Each checked keyboard-reachable controls, no serious/critical
  axe findings and no horizontal overflow. Screenshots in ignored
  `local-artifacts/005/` were inspected against the design guide. The research
  preview HTTP response was mocked because this UI check did not exercise live discovery;
  the owned conversation shell and other routes used the disposable database.
- Migration027 bounds 30-day receipt expiry to 100 rows per tick. A disposable
  integration case inserted 101 old synthetic receipts and observed batches of
  100 then 1. Publication suspension now advances through ID pages so a healthy
  first page cannot starve later publications. The existing publication scenario
  and typecheck passed after the change.
- `npm run test:retrieval` passed **22 files, 61 tests** against only the
  explicitly marked disposable database. It starts a fresh Vitest process per
  file because earlier feature tests alter database environment variables.
  A retrieval lease test was adjusted to hide unrelated queued fixture jobs
  inside its rolled-back transaction; the production claim path was unchanged.
  The added recon destination test rejects lookalike hosts and a target-domain
  string placed in another site's URL path; the fetch ingest uses this exact
  host check after redirects.
- `npm run retrieval:benchmark` seeded and removed 5,000 synthetic passages in
  the disposable database, ran 10 warm-up and 100 measured ranked queries with
  five concurrent readers, and reported **37 ms post-embedding p95, zero errors**.
  Its vectors are deterministic fakes; embedding and end-to-end latency were
  not measured. This is a SQL/ranking load observation, not the SC-004 hybrid
  performance gate or semantic-quality evidence.
- `npm run retrieval:recovery:check -- --disposable --container turas-005-postgres`
  passed: it created temporary local databases, applied 001–018 then explicitly
  upgraded 019–027, refreshed runtime grants, checked vector 0.8.6, restored a
  separate snapshot of the disposable 005 database, paired it with a synthetic
  private-store fixture, and reconnected to the restored database. It observed
  44 restored source projections and removed the temporary databases. The
  selected app database, real private store and `.eve/.workflow-data` were
  never referenced by the command. This does not prove a full native-workflow
  restart or a real artifact-store restore; those parts of T054 remain open.
- The `005-retrieval-governance-v1` fixture fixed 40 answerable queries before
  execution, including 20 semantic paraphrases, against the synthetic 25-record
  walkthrough. `npm run eval:retrieval -- --live --max-embedding-calls 64
  --max-input-characters 1000000` passed on the disposable database using real
  Gateway `openai/text-embedding-3-small` calls: **recall@5 1.00**, all returned
  citation texts and locators re-resolved exactly, no Juniper result in the
  assigned Cedar partner scope and denied unassigned Juniper access. The run
  used 43 application-level embedding dispatches and 3,597 input characters,
  under the 64-call/1,000,000-character caps, with SDK retries set to zero.
  No fake vectors were used for this relevance result. The corpus is synthetic
  and narrow; it does not measure hosted behavior or answer quality from Turi.
- The 12 `005-research-review-v1` case definitions fix the authority, origin,
  citation, scope, partial-work and prior-turn scenarios and the 7/8 rubric.
  `eval:research:verify` rejects a missing actual-output review as expected.
  No actual research/Turi output case has been run or reviewed, so this hard
  gate stays open.
- `npm run typecheck`, `npm run build:web:check` and
  `npm run build:eve:check` passed on the implemented route/tool set. Broad
  combined Vitest runs have not passed as a single process: legacy suites mutate
  `DATABASE_URL` to the isolated test URL, which makes later
  `requireTestDatabaseUrl` checks refuse to run. New focused suites and the
  affected stream-revocation suite passed when run separately. Full regression
  validation remains open.
- Still open: broader lifecycle and race fixtures, recovery/benchmark/evaluation
  commands, 40-query live relevance and 12 actual-output review, full regression
  suite, documentation reconciliation and PR review. One live Context.dev
  discovery call passed, but no full research run or actual Turi review has run.

## Context.dev provider change

- The user selected the already configured Context.dev credential instead of
  adding Exa. `.env.local` contains `CONTEXT_API_KEY`; its value was never read
  into tool output. The direct adapter calls `POST /v1/web/search` with the exact
  admitted query and Bearer authorization. Context.dev requires a minimum of 10
  requested results; Turas retains at most five public URLs and disables inline
  Markdown and highlights. Provider snippets do not enter checked evidence.
- `npm run research:discovery:check -- --live` passed one bounded public query:
  five public `vercel.com` URLs and a provider request receipt, with no page
  content treated as evidence. This verifies the discovery contract and local
  credential only. The pinned independent fetch, checked ingest and 12 actual
  research/Turi output cases remain separate validation gates.
- `npm run research:discovery:check -- --live --fetch` then discovered five
  public URLs, independently fetched one official documentation page through the
  pinned HTTPS transport, normalized it, and verified an exact quotation against
  the normalized page. A first live attempt exposed a Node 24 address-family
  callback mismatch; setting the resolved family on the request fixed it. This
  check does not persist an observation or verify a Turi answer.
- Focused Context.dev request/fetch contracts (**2 files, 8 tests**), the
  disposable research workflow test, typecheck, Next build and eve build passed
  after the provider change. No broad MCP integration was installed.
- The disposable research workflow test now also denies a different login
  session, a revoked login, an expired admission, a model-invented search query
  and an unapproved fetch URL before provider dispatch. The focused test passed
  after these cases were added.
- The focused retrieval-fence test now consumes an exact citation, releases one
  authorized stream chunk, removes the accepted source head, and confirms the
  next queued chunk is withheld by the same fence used at native output release.
  A following turn is also rejected by `prepareAttempt` against the append-only
  dependency. The test passed against the disposable database (T024).
- A stronger fixture with distinct projection and original revision digests
  initially failed consumption. Receipt binding now resolves the original exact
  digest after checking the projection/receipt generation, so later source
  fences compare like with like. The same fixture passed after the fix.
- Public research checks now require the retained quotation itself to contain
  the admitted public identity or product and topic. The same check runs again
  at ingest. A new unit case and a disposable negative-ingest case passed;
  their success does not establish the full actual-output research gate.
- The bounded live Context.dev discovery/fetch smoke passed again after this
  tightening, with one public documentation quote that contains both the
  product and topic. It did not persist that quote as a customer fact.
- Affected profile-context, artifact-context and stream-revocation regressions
  passed **3 files, 14 tests** on a second explicitly disposable schema027
  database containing only synthetic demo identities. The first attempt against
  the 005 evaluation corpus failed an older empty-context fixture expectation
  because that corpus has 25 seeded accepted records; it was a fixture mismatch.
- A separate artifact-backed review regression initially failed near local
  midnight: PostgreSQL's date-only value was decoded as local midnight six
  hours ahead of the UTC assessment clock, giving freshness 0. Date-only
  artifact evidence now preserves its calendar day at UTC midnight; the
  focused regression passed after the fix. Profile research and conversation
  delivery tests in that same run passed.
- Six additional identity/grant/profile evidence, review, history and chat-claim
  regression files passed **24 tests** on the unseeded disposable schema027
  database. The date-only fix was then verified by the artifact-review test.
- Bounded maintenance now removes at most 100 terminal embedding operation
  receipts older than 30 days per tick. A disposable test passed with 101 old
  terminal rows and one old dispatched row: 100 then 1 removed, dispatched
  retained for ambiguity handling. A local `retrieval:check -- --retry-job <UUID>`
  action requeues only failed jobs with attempts remaining, no ambiguous paid
  operation and a still-current original. A disposable test passed current,
  withdrawn, exhausted and ambiguous outcomes. T049 remains open for the full
  cleanup/convergence gate.
- The index worker now accepts current published shared sources as public
  embedding inputs, rechecks their original publication/lineage before reading
  passages, and rechecks originals again before vector commit. A disposable
  shared-publication case passed with an eligible shared index job, then denied
  it immediately after the underlying accepted source was withdrawn.
- Customer search and citation detail expose load/empty/denied/degraded/stale
  states, exact locators and quality. The shared library now rechecks a public
  detail on open and window focus, hiding it if withdrawn. A browser-session
  fixture race in the research UI test was fixed by binding the exact cookie
  hash instead of selecting the newest login row. CLI Playwright/WebKit passed
  **16 tests** across desktop/mobile and light/dark in an isolated code copy
  against the marked disposable database. The temporary app copy/server and
  separate unseeded regression database were removed afterward (T023, T032).
- `npm run typecheck`, `npm run build:web:check`, `npm run build:eve:check`,
  `npm run check:docs` and `git diff --check` passed after these changes. The
  focused 005 suite passed 22 files/61 tests; affected earlier regression
  groups passed 3 files/14 tests, 6 files/24 tests and the artifact-review,
  profile-research and conversation-delivery cases. `git status` showed no
  `.env.local`, private store or `agent/agent.ts` change; the key remains only
  in ignored local configuration (T057).

## Neon Preview handoff and isolated test database (2026-09-29)

- `npm run db:inspect-preview` reached the recreated Neon Preview endpoint and
  reported PostgreSQL server version number 180006, pgvector 0.8.6 available,
  16 legacy Turas tables,
  no fresh `turas_environment` marker and no `turas_migrations` ledger. This
  was a read-only transaction. The original Preview database was not changed.
- With the user's direction, a new empty `turas_preview_005` database was
  created in the Preview branch. A second read-only inspection reported zero
  public tables. The first explicit `db:init` stopped at migration 023 because
  `turas_runtime` did not exist; inspection confirmed only migration 001 had
  committed. A new separate runtime login was provisioned, `db:migrate`
  completed 002–027, and `db:roles` refreshed grants. A final inspection
  reported one matching `preview-neon-005` marker, schema 027, pgvector 0.8.6,
  and the migration ledger. Pooled runtime `db:bootstrap-demo` completed.
- Only `turas-005-postgres` and `turas-002-postgres` were stopped and removed
  from OrbStack with `docker rm` and no volume flag. `docker volume ls` still
  listed retained volumes. Production was not connected to or changed.
- A separate `turas_test_005_neon` database was created in the same Preview
  branch for destructive tests, explicitly migrated to 027, granted runtime
  roles and bootstrapped with synthetic demo identities. The test URL guard
  now permits only a distinct `turas_test` database on the selected Preview
  branch with the selected owner credential; a two-case offline safety test
  passed. The first Neon integration case passed in 53 seconds, so the 005
  runner uses a 120-second per-file test timeout only for Neon. The first full
  rerun stopped at a missing synthetic identity; bootstrap corrected that
  fixture setup and the affected three-test job file passed. The full Neon
  rerun then passed **24 isolated 005 files** including the two new database
  selection guard cases. `npm run dev` started Next.js, eve and the maintenance
  worker against the selected pooled Neon runtime URL; auth returned expected
  401 before login and eve health returned 200. Existing native workflow state
  was retained. `npm run typecheck`, `npm run check:docs` and `git diff --check`
  passed. Clone/recovery and actual-output evaluation commands still depend
  on removed local containers and have not run against Neon.

- Neon `CREATE DATABASE ... TEMPLATE` succeeded for a temporary clone of the
  marked disposable test database; the probe clone was dropped. The isolated
  evaluator now uses this path for Neon and retains the local-container path
  for older environments. Its auth/eve readiness check passed on a cloned
  database with private app and workflow state, then removed the clone. A
  bounded retry handles short-lived source sessions after the marker probe.
- Actual-output R01 passed on the Neon clone: two steps, 908 maximum step
  output tokens, 59.8 seconds, one valid exact citation. Initial R07 fetched
  seven pages and exceeded the 120-second turn limit. The workflow now stops
  after its first checked attributed source; a rerun used one search and one
  fetch and completed within 74 seconds. The selected `spacexai/grok-4.7`
  model is unchanged; its reasoning setting is now `low` to meet the fixed
  per-step output cap. With an exact-offset quote check, R07 passed at 655
  maximum step output tokens, one valid citation and one exact excerpt.
- R08 practices passed on Neon: one search, one fetch, one attributed source,
  exact excerpt and citation, 332 maximum step output tokens, and a 65.7-second
  turn. An initial clone attempt met a transient active-source-session error;
  the bounded clone retry resolved it. R06 conflict output initially exposed
  an evaluator error: its second UUID was a real citation from a later receipt
  for a source already present in the conversation's append-only dependency
  union. The evaluator now verifies same-actor receipt citations by exact
  consumed source revision/generation and conversation time. R06 then passed
  with both conflicting sides cited, caveated and no unknown IDs, in two
  steps and 57.8 seconds. R12 passed with one exact citation and immediate
  withdrawal, history and follow-up denial after consumption.
- R01 was rerun under the lower reasoning setting and passed with one exact
  citation, 269 maximum step output tokens and a 50.6-second turn. R03 passed
  its partner denial with no hidden detail or unknown ID; the evaluator now
  accepts the normal curly apostrophe in a denial. R05 passed uncertainty and
  no-unqualified-assertion gates at 578 maximum step output tokens. R10 passed
  Pending submitted-URL origin and no customer fact promotion at 333 maximum
  step output tokens. Together with R06, R07, R08 and R12, all eight executable
  bounded actual-output probes have passed under the current selected model
  and `low` reasoning setting. These are objective probes, not the complete
  12-case scored review. R02, R04, R09 and R11 have no executable case path
  yet; the full T059 gate remains open.
- The live research workflow smoke command now accepts `--live --disposable`
  for the marked Neon test database, using a temporary database clone. Its
  practices run passed one Context.dev discovery, one pinned public fetch,
  checked attribution, two ready projections in 3,671 ms, and immediate
  withdrawal denial in 603 ms. The clone was removed; selected app resources
  were untouched. The older local-container command remains available.
- The recovery command now accepts `--disposable` on the marked Neon test
  database. It created an empty temporary database, applied 001–018 and then
  upgraded explicitly to 027, refreshed runtime grants, checked vector 0.8.6,
  cloned the test database for a matched synthetic-store reconnect, and
  removed both temporary databases. The selected app database, real private
  store and `.eve/.workflow-data` were not touched. The full native-state
  restart and real artifact-store restore portions of T054 remain open.

## Twelve-case actual-output review (2026-09-29)

- R09 fit passed on an isolated Neon clone: separate accepted and attributed
  practice citations, explicit fit gap and next action, zero public search or
  fetch calls, two model steps, 447 maximum step output tokens and 78.1 seconds.
  R02 passed with two distinct approved synthetic artifact units and exact txt
  line 3/27 locators and citations, two steps, 380 maximum step tokens and
  54.4 seconds. Earlier R02 probes failed while its undated fixture was
  ineligible and while the audit used an incomplete UUID pattern; the passed
  run used a dated accepted source and verified consumed same-source receipts.
- R04 published one sanitized synthetic learning, read an identical public
  payload from two workspaces, and completed a Turi shared-discovery answer
  with a public shared citation and no private customer lineage. It treated a
  missing retrieved limitation span as an evidence gap. Four steps, 383 maximum
  step tokens and 93.9 seconds. Its original evaluator exit was nonzero because
  the privacy expression rejected the *public* shared revision label; the
  deterministic check was corrected on the retained actual output, without
  replacing the model response. The source-and-generation citation audit also
  accounts for later same-actor receipts.
- R11 cancelled an owned practices run after one completed checked public fetch,
  retaining one attributed finding. A later authorized Turi turn used the new
  `read_research` tool to identify the cancelled state, cite only that retained
  source and exclude incomplete work. Two steps, 296 maximum step tokens and
  38.2 seconds. The first later-turn attempt exposed a receipt-read policy that
  required the old login session; the reader now authorizes the current actor
  and rechecks source eligibility, while cancellation still locks the original
  owned binding. A focused Neon integration test passed the later-session read.
  A subsequent model run exceeded the 1,000-token step cap at 1,080 tokens;
  the final concise rerun passed. The disposable clone helper now clears only
  lingering sessions on the marked test database after repeated template-lock
  errors; it never targets the Preview app database.
- The implementation review in ignored `local-artifacts/005/research-review.json`
  references twelve retained actual Turi outputs. Each case scored at least
  7/8 across fidelity, uncertainty, relevance and useful next action; the
  `npm run eval:research:verify` hard-gate/usage check passed **12/12**. The
  maximum root steps were 4, maximum output tokens in a step were 655, and
  aggregate model-turn time was 674 seconds against the 20-minute cap. R11
  recorded one public search and one fetch; R07/R08 each recorded one search
  and one fetch; fit recorded zero public egress. Two older R01/R12 artifacts
  gained a deterministic `withinBudget` field derived from their unchanged
  actual receipts. All source content and review rationales remain ignored
  local artifacts. This is local actual-output validation, not hosted behavior.

## WebKit UI review (2026-09-29)

- `npm run retrieval:ui:check` passed 28/28 command-line Playwright tests in
  3.0 minutes across desktop/mobile and light/dark WebKit projects. The command
  used a private app copy and a temporary clone of the marked disposable Neon
  test database; it removed the clone after the run. Search/citation, source
  review, publication, research preview/cancellation, refresh and conflict
  flows passed keyboard and axe checks. No host browser was operated.
- I inspected the synthetic retrieval desktop light, knowledge review mobile
  dark, research cancellation mobile light and conflict desktop dark
  screenshots against `docs/design-reference.md`. The restrained neutral
  surfaces, hierarchy, desktop sidebar, collapsed mobile navigation and theme
  contrast match the reference. The mobile screenshots are scrolled mid-page;
  the fixed menu control and local Next development badge are visible but do
  not prevent the exercised controls. Axe initially found insufficient dark
  alert contrast (2.52:1); the token was corrected before the passing run.
- This verifies local UI behavior only. The screenshots and full test log are
  ignored local artifacts, suitable for sanitized PR review if needed.

## Current regression rerun (2026-09-29)

- `npm run test:retrieval` passed all 24 isolated 005 unit, contract and
  integration files against the marked disposable Neon test database after the
  R11 same-actor research receipt change. The research workflow integration
  file passed its cancellation, origin, refresh and replay checks in 94.6
  seconds; the WebKit run above used a separate temporary clone.
- `npm run typecheck`, `npm run check:docs` and `git diff --check` passed after
  the twelve-case review and UI changes. Documentation and the due-panel empty
  state were adjusted afterward and require a final check before completion.
- The 005 operational rollback switch `TURAS_005_DISABLED=1` now rejects 005
  readiness before database access, skips retrieval worker dispatch, and denies
  release for conversations with consumed retrieval dependencies. The focused
  readiness test passed 7/7 and typecheck passed. This is a local switch check;
  a paired process restart and matched restore drill remain open.
- The administrator publication-impact endpoint reports content-free suspended,
  withdrawn and cleanup-job counts after current server authorization. A
  focused Neon integration test passed publication suspension and partner
  denial; the WebKit desktop-light library journey passed 1/1 with the impact
  status visible and no serious or critical axe findings.
- A new bounded cleanup path removes retained raw research bodies linked to
  withdrawn or superseded source revisions. The focused Neon research workflow
  integration passed its withdrawal, newer-source and raw-body purge assertions
  in 96.1 seconds. Existing bounded batches remove retired passage text/vectors,
  expired receipt snapshots and terminal embedding receipts; operator retry
  remains limited to an eligible original and the original attempt budget.

## Disposable recovery and rollback drill (2026-09-29)

- `npm run retrieval:recovery:check -- --disposable` passed against temporary
  Neon databases made from the marked `turas_test_005_neon` source. An empty
  database reached 018 explicitly, then upgraded to 027 with pgvector 0.8.6
  and runtime grants. A database clone and synthetic private-store file matched
  by digest. An isolated app created a bound native session, stopped, and
  restarted with its private workflow state and store. The same owned
  conversation and durable native tail remained readable after restart.
- The paused isolated worker could not commit an expired lease; a dispatched
  embedding operation was classified unconfirmed and was not sent a second
  time. `TURAS_005_DISABLED=1 npm run retrieval:check` reported
  `intakeEnabled:false` without contacting the database. The focused readiness
  test rejects 005 intake under that switch. This is a disable-intake rollback
  path; forward repair keeps populated 005 tables rather than reversing them.
- The drill used only temporary clones, a temporary private store and an
  isolated app directory containing its own `.eve/.workflow-data`. It removed
  the temporary databases and files on exit. A following read-only
  `npm run db:inspect-preview` confirmed the selected Preview app database
  still had its matching marker, schema 027 and vector 0.8.6. Production was
  not connected to. This proves local/disposable recovery behavior, not a
  hosted backup restore of real customer data.

## Schema 028 provenance and lifecycle closeout (2026-09-29)

- Migration 028 added a durable normalized-content digest to public research
  observations, backfilled retained payloads and indexed submitted origins.
  Guarded explicit migrations succeeded on the separately marked Neon test
  database and the fresh Preview app database. A read-only
  `npm run db:inspect-preview` returned the matching `preview-neon-005` marker,
  schema 028 and pgvector 0.8.6. The original legacy Preview database and
  Production were not connected to or changed.
- `npm run test:retrieval` passed all 24 isolated 005 files against the marked
  disposable Neon test database at schema 028. The research workflow file
  passed digest-tamper, source-origin, changed/copied/unchanged refresh,
  cancellation and cleanup assertions in 98.1 seconds. A later focused rerun
  passed in 98.3 seconds after copied-origin classification was serialized
  per customer and tested with a different raw body, the same normalized
  digest, expired payload and a distinct-customer denial. Unknown independent
  syndication is not assigned corroboration; checked ingest sets C=0.
- A focused shared-publication rerun passed in 60.5 seconds after adding a
  second publication dependent on the same accepted source. Revoking that
  source denied a shared read immediately and the suspension sweep marked both
  publications suspended. A first direct invocation used Vitest's 15-second
  default timeout and expired; the passing rerun used the suite's 120-second
  Neon test timeout.
- `npm run retrieval:recovery:check -- --disposable` passed its empty 018→028
  upgrade, vector/runtime-role readiness, matched synthetic database/store
  digest, isolated bound native-session restart/reconnect, expired-lease
  compare-and-swap and ambiguous dispatched embedding replay. Its final
  receipt reported `selectedApplicationResourcesTouched:false`; temporary
  databases, private store and isolated app state were removed. This is a
  local disposable drill, not a hosted customer-data restore.
- `npm run retrieval:check` on the selected pooled Preview runtime returned
  `intakeEnabled:true` with no queued jobs or embedding operations.
  `npm run typecheck`, `npm run build:check`, `npm run check:docs` and
  `git diff --check` passed before the final documentation reconciliation.
- `npm run research:workflow:live:check -- --live --disposable --mode practices`
  passed on a temporary schema 028 Neon clone: five Context.dev discovery
  results, one pinned public fetch, one attributed checked observation and a
  completed run using one search and one fetch. Its two projections converged
  in 4,208 ms; source withdrawal denied read access in 602 ms. The clone was
  removed and the command reported `selectedApplicationResourcesTouched:false`.
  This rechecks the real public-fetch path after the normalized-origin change;
  the earlier twelve actual Turi outputs remain separate evidence.
- Final `npm run check:docs` verified all 77 authored Markdown files and local
  links; `git diff --check` and `npm run typecheck` passed after status and
  task reconciliation. All T001–T060 entries are checked against local
  implementation and validation evidence. No Vercel link or deployment ran.
- The first draft-PR CI run found two legacy fixture-safety assertions that
  still expected the local-only database-guard messages. The guard already
  rejected those URLs; the assertions now expect its Preview-aware messages.
  The full `npm run test:unit` rerun passed 29 files and 102 tests locally.
