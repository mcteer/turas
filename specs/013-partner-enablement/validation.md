# 013 Implementation Validation

## Source and scope

Acceptance uses implementation commit `15a865e0fa986d5a3ed595d7766e98a2087261ab`
and source SHA-256
`194573c9c52fa24bce966425a01deb34fcb6b8dd4706b876517020eba0533e62`.
All feature runners reject source changes during execution. The fingerprint includes
application, migrations, tests, runners, contracts and requirement prose; it excludes
this ledger and normalizes task markers/specification status. Later bookkeeping must
preserve this fingerprint.

The 48 tasks implement the partner workspace, reviewed customer/engagement guides,
individual learning assignments and member-private checkpoint attempts. Canonical
active internal administrator mcteer publishes guides, manages assignments and
verifies demonstrations. Learning never accepts delivery work, changes maturity,
certifies skills or turns submitted claims into accepted customer facts.

## Local gates

| Command | Final result |
| --- | --- |
| `npm run test:partners` | 57 assertions in all 11 declared files; zero failures/skips; acceptance mode |
| `npm run partners:ui:check` | Five journey files, 12 cases per project, 48 passes across desktop/mobile light/dark WebKit; zero failures/skips/retries; owned production build |
| `npm run partners:recovery:check` | Empty-to-051 and 049-to-051 both pass all recovery proofs |
| `npm run test:partners:regressions` | Exact 13-file manifest, 44 domain and eight four-project WebKit assertions; 52 passes, zero failures/skips |
| `npm run build:partners:check` | Actual owned Next production and eve builds pass; no hosted proof |
| `npm run benchmark:partners` | Seven classes × 100 operations; all 700 pass, zero errors; production quotas, zero measurement resets |
| `npm run typecheck` / `npm run typecheck:partners` | Both pass |
| `npm run check:docs` | 179 authored Markdown files and tracked-file hygiene pass |

All five CI evidence validators also pass against the same local
fingerprint. Reports reject missing, orphaned, skipped or empty suites. Manifest
SHA-256 values (exact checked-in file bytes):

| Manifest | SHA-256 |
| --- | --- |
| `scripts/partners-suites.json` | `75f00a597400799ba3bc82192044b01d0b84ae0b46a1692d29d5f4894d9d60b9` |
| `scripts/partners-ui-journeys.json` | `161dd567648958985174caeffa80e5a30dc74b66358abea92e395c9161440e22` |
| `scripts/partners-regression-suites.json` | `39bf6001aae7b578b56da84c373a1a738ffbac5fcbe314327c59b6df727141af` |

## Security, lifecycle and UI evidence

Real governed-command tests cover grant/member/organization epochs; exact source,
baseline, publication and request bindings; another member's attempt privacy;
concurrent decisions; prerequisite credit loss; transitive original withdrawal;
strict same-origin HTTP, bounded input and quotas; immutable attempts and verified
terminal states; whole-body withholding with workers stopped; and earliest retention
deadlines that cannot be extended. The assignment boundary submits two real competing
previews/decisions at the cap; both refuse the 101st without writes.

Both recovery paths preserve predecessor-domain snapshots and workflow state.
They prove same-database restart, atomic pre-commit rollback, committed replay,
post-commit reconciliation, permanent absent-request abandonment and refusal of
late originals, expired-preview refusal, worker crash recovery, disabled-feature
retention and preservation of the original deadline. Schema is explicitly 51;
request handlers do not migrate it.

Production WebKit exercises all three stories, keyboard review/cancel focus, lost
acknowledgments, explicit abandonment, corrections and verified progress,
same-organization privacy, replacement starting at zero, revocation with workers
stopped, and delayed replies that cannot restore cleared content. The lost-ack test
waits for actual committed dispatch and withholds a fresh projection until committed
status is observed, proving reconciliation refreshes before another action. Axe
reports no serious/critical violations in tested workspace, guide and checkpoint
review views. Final synthetic workspace/guide screenshots were visually inspected
for all four layouts/themes, with bounded content and no overflow.

## Load acceptance

Both final local and CI collections pass all seven classes, 100 real
operations each, zero errors, p95 at most 2,000 ms, five concurrent distinct readers
for every read class, production quotas and zero rate resets during measurement.
Pacing is measured separately from operation latency. Each read class uses five
concurrent distinct readers; each write class runs sequential governed commands.

| Class | Local p50 ms | Local p95 ms | Local max ms | Errors | Local pacing s | CI p95 ms |
| --- | --- | --- | --- | --- | --- | --- |
| workspace | 10.6 | 13.9 | 19.7 | 0 | 0.0 | 17.3 |
| engagement-guide-pages | 317.2 | 595.4 | 726.4 | 0 | 0.0 | 480.6 |
| guide-detail | 192.6 | 222.1 | 268.0 | 0 | 0.0 | 306.4 |
| assignment-detail | 258.6 | 302.2 | 309.5 | 0 | 0.0 | 336.5 |
| review | 131.2 | 235.3 | 733.0 | 0 | 344.2 | 202.5 |
| assignment-create-replace | 93.0 | 196.6 | 375.0 | 0 | 404.1 | 146.4 |
| checkpoint-save-submit | 84.9 | 104.7 | 219.7 | 0 | 171.4 | 141.2 |

CI also records p50/max/pacing and zero errors for every class. Both complete
summary records bind the same source fingerprint, all seven class names, production
quotas and zero rate resets. Worst local p95 is 595.4 ms; worst CI p95 is 480.6 ms.

The fixture contains 120 fully traversed customers and accepted engagements,
two organizations and ten differently granted members, a maximum guide with 20
lessons/40 checkpoints/200-original closure, and 100 active assignments at the
individual/customer boundary. Read classes are workspace, engagement/guide pages,
guide detail and assignment detail. Writes include 50 publication plus 50 verified
checkpoint decisions, 50 assignments plus 50 replacements, and 50 saves plus 50
submissions. Hidden customer projection and complete traversal are asserted before
measurement; cases/classes cannot be trimmed or filtered.

## CI, resolved findings and operations

[Implementation CI run](https://github.com/mcteer/turas/actions/runs/37977107046)
passes all five 013 gates: domain/build, WebKit, recovery, benchmark and regressions,
with complete matching-source evidence. Existing-feature workflow checks and the
latest bookkeeping-head CI result are tracked on [PR 24](https://github.com/mcteer/turas/pull/24).

Earlier changing-source checks are development evidence. CI exposed a maximum-guide
p95 above two seconds; bounded closure expansion and batched exact profile/support/
conflict checks resolved repeated queries while retaining authorization, original
locks and pre/post-lock closure comparison. Existing single-source retrieval paths
remain unchanged. CI also exposed stale post-commit UI projections; reconciliation
now obtains a fresh authorized view before clearing a committed pending command.
Earlier existing unit verification passed 452 cases in an owned synthetic environment.

An actual SIGTERM teardown test first reproduced an anonymous PostgreSQL volume
leak, then passed with verified-owner `docker rm --force --volumes`: child, checkout,
container and its database volume are removed. All validation environments are
owned synthetic copies under ignored `local-artifacts/013/`; no sibling checkout is
created. Final cleanup confirms zero 013-owned containers, checkout copies or
runtime workers after all runners exit successfully. Teardown removes anonymous
database volumes under the verified container owner; the real interruption test
checks their absence. Unproven Docker resources are never broadly pruned.

README, ROADMAP, quickstart, handoff and partner operations describe the implemented
050/051 migrations, database grants, maintenance, disable flag, reconciliation,
withdrawal, retention and forward recovery. Rollback stops new work and retains
authorized reads, reconciliation and owner retention; it does not down-migrate.
The specification checklist remains read-only, 16/16 passing. No Spec Kit extension
hooks are installed. Constitution boundaries are preserved without exceptions.

## Separate hosted gates

Preview/Production migration, deployment, release and acceptance are **pending**.
No hosted customer data was read or changed, no external message was sent, and no
paid model request was made. Agent model selection and selected private runtime
state are preserved. Local/CI evidence does not prove hosted behavior. Merge requires
separate authorization; the previous 012 merge instruction does not authorize 013.
