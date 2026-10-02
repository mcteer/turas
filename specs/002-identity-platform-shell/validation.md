# 002 implementation evidence

This record tracks observed local results. Unchecked tasks in [tasks.md](tasks.md)
remain unimplemented or unverified. No hosted verification has been attempted.

## Setup

| Task | Check | Result |
| --- | --- | --- |
| T001 | Node 24 `npm ls --depth=0` | Pass: exact Next 16.3.4, React/React DOM 19.2.6, eve 0.67.1, Postgres and test dependencies installed; no dependency audit findings |
| T002 | Node 24 `npm run typecheck` | Pass with documented `withEve` and minimal App Router pages |
| T003 | Node 24 `npm run build:check` | Pass: eve local build with sandbox prewarm skipped, then Next build; this is compile evidence only |
| T004 | Node 24 `npm run test:unit` and `npm run typecheck` | Pass: 3 test isolation cases and typecheck |
| T005 | CLI `npx playwright test --list` and one WebKit setup test | Pass: four theme/viewport projects registered and local shell rendered in WebKit desktop light; missing browser revision was installed via Playwright CLI |
| T006 | Node 24 `npm run test:contracts`, `npm run typecheck`, prior `npm run build:check` | Pass: native routes exposed; a typed wrapper denied and forwarded an NDJSON response with status, headers and bytes preserved. Full runtime policy verification remains in US3. |
| T007 | Node 24 `npm run test:unit`, `npm run typecheck` | Pass: strict configuration cases; missing partner/signing secret and alternate account names fail closed without logging values. |
| T008 | Node 24 `npm run typecheck`; disposable Postgres 17 connection query | Pass: typed pool/transaction/readiness code and isolated `turas_test` connection. Transaction and mismatch behavior awaits T013 integration tests. |
| T009 | `node-pg-migrate` applied migration 001 to disposable `turas_test` | Pass: five required foundation tables present with declared constraints. |
| T010 | Node 24 `npm run db:init`, `npm run db:migrate`, `npm run db:roles`; runtime-role SQL probes | Pass: explicit initialization, idempotent migration rerun, manifest digest check, environment marker, runtime DDL denial and migration-ledger denial. A failed initial attempt left an empty migration ledger; init safely resumed after correcting the manifest exclusion. |
| T011 | Node 24 `npm run test:unit`, `npm run typecheck` | Pass: no-store responses, hidden-record 404, 429 retry header and generic unknown-error handling. |
| T012 | Node 24 `npm run db:bootstrap-demo` twice, runtime SQL count, `npm run typecheck`; disposable DB integration test | Pass: three fixed principal IDs seeded once; rerun preserved count and left a disabled partner principal disabled. |
| T013 | Node 24 `npm run test:integration`, `npm run typecheck`, `npm run build:check` | Pass: five database boundary cases, including current readiness, wrong marker/schema/unavailable reads, second workspace/partner organization FK denial, and runtime DDL/ledger denial; both build targets compile. |

## US1 test definitions

T014–T015: the unit and contract tests were added before authentication code. Both
currently fail to import the planned modules/routes, an expected red state. The
WebKit login journey will run at T022 after the local UI exists. This is not
feature acceptance evidence.

T016: migration 002 applied in the local and disposable test databases through
the verified manifest; runtime grants were refreshed. Login behavior remains red.

## US1 checkpoint

T017–T022: Node 24 unit tests (13), direct API contracts (9) against the
disposable Postgres database, TypeScript checks, and the local eve/Next compile
check passed. CLI Playwright/WebKit passed 20 login, sign-out, return-path and
unauthenticated-shell cases across desktop/mobile and light/dark projects. Contract
tests include disabled accounts, throttling, credential rotation with explicit
session revocation, and expired-session cleanup. No model call or hosted check was
part of this checkpoint. The local-only login limiter currently groups requests
under the host address; a trusted per-client address source is required before
hosted use.

## US2 checkpoint

T023–T031: Node 24 unit (17), contract (15), integration (8), TypeScript and
both compile targets pass. CLI WebKit passed three access journeys: admin-only
controls, internal visibility of a newly created synthetic customer with partner
isolation, and an administrator granting and revoking a partner assignment with
the partner's customer list changing accordingly. Contract and integration tests
cover stale revisions, duplicate commands, last-administrator protection,
revocation preservation on bootstrap, scoped DTOs and workspace constraints.
The UI journey exposed an unnecessary `FOR SHARE` on the environment marker;
removing it allowed access mutations under the restricted runtime role. No model
call, real customer data or hosted check was involved. Direct eve stream policy
verification remains in US3.

## US3 local delivery evidence

The guarded eve channel denies all unused callback, webhook, task-input,
inspection and control routes, including requests from signed-in accounts.
Contract tests exercise owned parked creation, current customer grants, CSRF,
native stream headers, request-key deduplication, explicit pre-admission
`session_not_ready` retry, observed-turn cancellation and persisted history.
Integration tests cover immutable associations, lost create receipt, an absent
send receipt and hook projection recovered from the persisted native cursor,
earlier identical text, missing optional delivery IDs, no-event/ambiguous
outcomes, native event idempotency, quiet/active stream revocation, authority
timeout, signed maintenance nonce replay denial, and duplicate/expired worker
leases. The local reconciliation command replayed a completed synthetic turn
without another model dispatch. A 501-delta regression test found that a
completed reply could be hidden by the history cap; history now keeps final
messages and collapses unfinished deltas.

`npm run smoke:local:live -- --live` through root `npm run dev` completed one
synthetic model turn for each account with the configured model. Fresh
authenticated history reads retained all three answers. Output token usage was
69 (mcteer), 68 (panel), and 71 (partner), 208 total. A separate prior panel
runtime probe completed with 721 output tokens and was not counted in the
three-turn smoke. No model selection or hosted configuration changed.

`npm run eval:behavior:local -- --live` ran six versioned cases twice with fresh
owned conversations and no parallel model turns. All 12 reached terminal
completion and passed the no-hidden-ID and no-profile/grant-mutation gates.
The responses were reviewed individually against the versioned rubric and
`npm run eval:behavior:verify -- local-artifacts/behavior-eval-1790523754090.json`
confirmed 12/12 semantic passes with written rationales. The local response
file is ignored and contains only synthetic prompts. The evaluation used 8,357
output tokens, accounted separately from smoke. One long reply initially
exposed the history-cap defect above; its full text was recovered through a
fresh authenticated application read after the fix, without a repeated turn.

The combined lost-send-receipt and failed-hook-write test recovered the original
turn after a fresh child process replayed the persisted pre-dispatch cursor. It
covered an earlier identical input, missing optional delivery IDs, and conflicting
native input; the latter remained `needs_attention` rather than starting another
turn. Pre-claim DB failure made no native request; post-native-receipt DB failure
remained uncertain. The full contract and integration suites passed 21 and 33
cases respectively. The stream suite closed a revoked quiet partner stream in
roughly 10 seconds and denied reconnect; an injected authority timeout closed
and cancelled its reader. The watchdog suite covered a persisted due threshold,
competing workers, expired leases, lost cancellation receipt, disabled owner and
stale original-turn no-op. A fresh child worker process did not claim a job at
simulated t=110s, did claim it at t=125s, and excluded a second worker. An
injected authority-store outage closed the native reader without forwarding
more bytes. Five failed maintenance retries left an unconfirmed attempt blocked
with `needs_attention`; they did not fabricate a terminal model response. Size,
rate, output-budget and principal/environment
concurrency thresholds passed without excess sends.

After stopping and restarting root `npm run dev` with Postgres and
`.eve/.workflow-data` intact, the opt-in
`tests/integration/runtime-restart.test.ts` passed against the completed panel
smoke conversation: fresh authenticated history and native stream were readable,
and its one attempt and event count stayed unchanged. The reconciliation CLI
settled that original attempt without a model redispatch. A separate real
root-dev restart kept a synthetic unconfirmed attempt and its actual
120-second deadline in Postgres while preserving `.eve/.workflow-data`. The
processes were stopped near t=118s and restarted across the deadline. The
restarted worker made its due scan, set `needs_attention`, and the authenticated
attempt API showed one original attempt and zero native model inputs. An initial
verifier asserted the pre-reconciliation dispatch state and failed; allowing the
correct durable `uncertain` state made the rerun pass. Its exact synthetic domain
fixture was removed. This checks safe interruption/review, not continuation of
an in-flight provider request. Eve dev's local Workflow implementation disables
active-run recovery and quarantines runs from old development generations;
active provider execution across that restart remains a known local-runtime
limit, never silently redispatched or represented as complete. Hosted restart
behavior remains unverified.

## US4 local shell evidence

The local shell uses the demo's neutral light/dark typography and 18rem sidebar,
with a centered Turi landing, customer picker, private recent chats, theme toggle
and responsive mobile dialog. WebKit ran across 1440px/390px and both color
schemes. The full UI suite passed 58 cases with 18 deliberately skipped cases
whose database-mutating access fixtures run only in desktop light; the focused
desktop access flow passed all three scenarios. The shell checks found no
serious/critical axe violations or horizontal overflow, and verified mobile
focus trapping, Escape and focus return. A complete parked-chat journey covered
sign-in, customer selection, create, reload and sign-out without a model call in
all four width/theme projects in the focused rerun (4/4 passed).
An injected 404 cleared an already-open protected chat within roughly 11 seconds;
an injected customer-list failure displayed an unavailable state rather than an
empty assignment. Reduced-motion and Geist assertions passed after the full UI
run. Synthetic-only local captures were inspected at
`local-artifacts/shell-{desktop,mobile}-{light,dark}.png` (ignored).

The `chat-states` UI suite covers loading, empty, unavailable, unsaved draft,
reconciling after reload, revoked access and a cancelled response retained after
reload. It also keeps an unconfirmed deadline blocked with an operator-review
notice. The cancelled state showed partial-output wording without a false
completion claim; its focused desktop WebKit run passed 8/8.

## Cross-cutting local measurements

On Darwin arm64 with Node 24.21.0, Postgres 17.11 and 128 GiB host memory,
`npm run test:performance` seeded 1,000 synthetic conversations (400/400/200)
and used 20 authenticated sessions (7/7/6). After 30 seconds of warmup, the
120-second window recorded 2,400 customer-list and 2,400 first-page owned-history
requests. The corrected full run exited 0: customer p95 81 ms, history p95
83 ms, zero errors or unauthorized rows. Benchmark fixtures were removed (0
remaining). The first measurement met latency (74/76 ms) but its cleanup guard
was faulty; those 1,000 exact synthetic fixtures were manually removed and the
full workload rerun after fixing it. Size, minute-rate and output-budget
admission tests pass in the disposable integration database, including two active
attempts per principal and 20 in the environment; excess admissions left no
submitted message.

`npm run restore:demo:check -- --disposable --container turas-002-postgres`
passed against a paired disposable Postgres dump and copied local Workflow
directory. It verified an acknowledged completed turn, 114 event projections,
its native run file and readable native stream without changing the source pair.
An injected migration failure rolled back transactionally and retained the
prior ledger and acknowledged record. `npm run auth:maintenance -- --prune`
removed 56 expired/revoked local sessions and zero rate windows, printing counts
only.

The final local check passed 22 unit, 21 contract, 33 integration, 58 WebKit UI
cases, TypeScript, authored-doc hygiene, whitespace and both local compile
targets. One opt-in restart integration case was skipped by the ordinary suite
and run separately after the real completed-turn restart. GitHub Actions
[run 36334992508](https://github.com/mcteer/turas/actions/runs/36334992508)
passed the Node 24, disposable Postgres 17, WebKit, Spec Kit, documentation and
both compile-target checks for PR 2. The first CI attempt exposed an invalid
test-environment marker; the next exposed a readiness fixture that relied on a
local worker. Once those were fixed, Linux WebKit identified a dark-theme
sign-out contrast failure that was also corrected before the passing run.
CI used generated disposable credentials and made no model call. The repository
remains disconnected from Vercel; there has been no deployment or hosted
application verification.

| Outcome | Current evidence | Status |
| --- | --- | --- |
| SC-001–002 identity, access, privacy | Auth/access/native route matrix and WebKit journeys | Local pass |
| SC-003 revocation | Active and quiet stream tests, reconnect denial around 10s, injected authority-store outage | Local pass |
| SC-004 durable delivery | Lost receipts and hooks, no duplicate dispatch, completed-turn and unconfirmed-deadline real restarts | Local pass for safe persistence/interruption; active eve dev runs do not resume |
| SC-005 accessible shell | Four width/theme WebKit projects, axe/keyboard checks; cancelled state in focused WebKit | Local pass |
| SC-006 scale | 1,000 chats, 20 sessions, 2,400 reads each endpoint, p95 81/83ms | Local pass |
| SC-007 recovery | Migration rollback and paired completed-turn restore | Local pass |
| SC-008 real local turn | One persisted turn per account, 208 smoke output tokens | Local pass |
| SC-009 data notice | All three account journeys and synthetic fixture checks | Local pass |

Local acceptance, constitution review and PR CI completed before
[PR 2 merged](https://github.com/mcteer/turas/pull/2) on 2026-09-27. Hosted
application acceptance stays deferred by the deployment hold.


## Workspace presentation follow-up — 2026-10-02

The visual follow-up in PR 15 uses standard title case for navigation and section
headings, with minor words such as “and,” “of,” and “the” lowercase. The final
local CLI WebKit matrix passed 88/88 cases across desktop/mobile and light/dark,
with zero failures, skips or retries. The owned app ran as `turas_runtime`;
synthetic fixture setup retained its separate owner connection. Three additional
customer-access browser cases passed, including partner assignment and revocation.

CI exposed missing PostgreSQL privileges for existing immutable-payload read
locks. The explicit role setup now grants UPDATE on only the immutable key of
payload tables whose readers use row locks. Existing triggers reject even
key-to-itself updates; content-column updates and direct deletion remain denied.
Ten focused plan/staffing schema checks passed, including actual runtime-role
reads and rejected writes. Preview schema 035 received the explicit role refresh;
read locks and denied table-wide UPDATE/DELETE privileges were verified afterward.
Production variables and its legacy database were not changed.

The general-chat check now waits for a missing response receipt followed by a
successful conversation access check. It reproduced the false access-denial bug
in all four WebKit projects before the fix. The client now rechecks conversation
authority before interpreting an absent receipt as lost access, preserves the
pending/uncertain send state and never redispatches from polling. Reload still
sends no duplicate message, and genuine conversation denial still hides the chat.
The final 88-case matrix includes research preview, cancellation, conflict review
and accessibility checks through the current Customer context disclosure.
