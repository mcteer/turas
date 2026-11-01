# Implementation Validation

## Current Acceptance State

The specialist implementation is present and has passed the real local Eve
continuity/control harness and the four-project WebKit UI suite. It is not yet
released. Ordinary attachment restart recovery and a bounded real hosted
specialist exercise have passed. Remaining governed checks, final-source CI,
final-source Preview acceptance and Production verification remain release gates. The sections below retain earlier diagnostic history; their
pending statements are superseded only by the explicit results here.

- Native baseline (`/tmp/turas-020-native-specialists19.txt`): all three
  specialists completed an initial request and two refinements across restart,
  retaining child/workflow/task identity, original expiry and cumulative ceilings.
  Idle Close and two concurrently active specialists passed. Result delivery met
  the controlled five-second bound; zero database deadlocks/timeouts or paid calls.
- Native controls (`/tmp/turas-020-native-controls20b.txt`): targeted Stop with a
  lost browser acknowledgement and same-key retry, completion/Stop race, and
  global Stop of two active plus one idle discussion passed. Unknown cost holds
  remained reserved; completed historical assignments remained completed. Zero
  database deadlocks/timeouts or paid calls. The latest native receipt is the
  controls-only run; it does not replace the baseline evidence.
- WebKit (`/tmp/turas-020-ui76.txt`): all 76 cases passed across desktop/mobile
  and light/dark, with zero skipped, unexpected or flaky cases. Includes composer
  attachments/links, keyboard controls, task status/Stop and draft reload. Wire
  fixtures prove UI behavior; the separate native harness proves backend control.
- Domain (`/tmp/turas-020-domain-atomic-control.txt`): current authorization,
  immutable bindings, source freshness, cumulative holds, quota-independent
  authority rechecks, full-commit projection and exact protected control paths
  passed against disposable Postgres with explicit migrations/runtime grants.
- Watchdog/domain (`/tmp/turas-020-watchdog-domain.txt`): updated protocol-27
  watchdog fixture and public stream API passed, including disabled-owner cleanup
  and a lost cancellation receipt. Legacy protocol-25 bindings remain read-only.
- Draft persistence encrypts only unsent text in tab storage, bound to the login
  CSRF and conversation; it excludes attachments, approvals and dispatch identity.
  Three crypto/race/isolation unit cases and actual native/browser reload passed.

The production-mode local-store experiment leaves turnStep at attempt 1 because
Eve 0.91's generated local world explicitly disables active-run recovery. This is
not a hosted recovery pass or a hosted failure. The unchanged fault/assertions are
being tested through documented `eve dev --resume`; no resend, expiry renewal,
synthetic completion or dependency patch is permitted.


## Current Compatibility And Hosted Evidence

- Preview commit `d23b6a5f57db9ce21f39f4081da88ed41532b954`, deployment
  `dpl_3PAsCUtT9DHsaserjh9rKwPrhKB7`, was Ready. Authenticated panel WebKit
  exercised login, attachment/link dialogs and logout. This precedes the latest
  compatibility fixes and is not final-source acceptance. The unchanged shared
  mcteer credential record targets both Preview and Production; that metadata
  does not prove an actual mcteer login. No password was rotated.
- A real hosted best-practices specialist completed its initial request and a
  refinement on the same child/workflow with unchanged expiry. Keyboard Close
  reached terminal evidence, preserved the draft, and retirement returned 202;
  the mobile page had no horizontal overflow. Eleven specialist Gateway model
  operations settled at $0.128146. Context/standard-web and embedding operations
  retained $0.030584 in unknown holds. These amounts exclude root-model usage.
  Private receipt: `local-artifacts/020/hosted-specialist/receipt-private.json`.
- The native specialist CI job on that commit passed, including canonical-source
  publication and subsequent retained-context validation. T015 is implemented.
- The owned Execution unknown-usage restart check passed using documented
  `eve dev --resume`; provider dispatch remained single and unknown usage stayed
  reserved. It does not establish every Execution suite has passed.
- The production-mode owned startup probe now passes. Eve 0.91's Next hosting
  starts the built agent service; a second manually started child competed for
  the same port. The fixture now uses the managed service. Production resources
  were not changed. Full production-mode workflow assertions still require CI.
- Explicit new chat input replaces a pending approval only after the original
  owned turn has actually settled. The stale approval cannot authorize a write;
  a fresh explicit proposal and fresh exact human review are required. Member
  approval/rejection still require existing reviewer rights; Stop creates no
  decision.
- Ordinary user bubbles now come only from authorized application projections.
  Eve may retain a local submission ID after confirmation even with optimistic
  display disabled. No text/turn deduplication is used; repeated canonical sends
  remain distinct. Native assistants, interactions and control state are unchanged.
  The focused 15-case history suite and TypeScript passed.
- Existing CI failures in protocol mocks and health-schema restoration were
  updated to v27 public callbacks and CURRENT_SCHEMA_VERSION. The focused owned
  contract gate passed. Final-source CI remains pending.

## Resumption Baseline

Implementation resumed after planning commit `4a3d12c5` on
`chore/eve-dependabot-composer`. The specification quality checklist has 16/16
checked items; the clarification review contains no unchecked gate. No extension
hooks are configured.

Preserved existing uncommitted question-steering implementation and native
question/file fixture changes. These are prior work, not newly verified changes.
No selected database, private runtime state or production configuration changed
during resumption.

Prior native questions run reported success with zero paid provider calls in
`/tmp/turas-questions-stop-before-steer.txt`. Prior staged-10 file run failed at
`restart_after_native_receipt` with `Native file response timed out`; this remains
unresolved pending investigation. Earlier unit/UI/build results are historical
evidence and must not be represented as final-source acceptance.

The 44-task implementation checklist remains authoritative. Production release
is not complete. Earlier pending findings below are diagnostic history; see the
current acceptance state above for completed verification.

## Foundation Checks

Migration 084 and explicit runtime grants passed the owned disposable Postgres
controller (`--specialist-domain`), including immutable original scope/expiry/
ceilings, one active assignment, terminal-state protection and deletion denial.
The browser contracts passed four focused tests covering private-field exclusion,
untrusted native cancellation IDs, state consistency and bounded output.
TypeScript passed after these additions. No hosted schema was changed.

The first explicit-resume experiment failed before its interruption boundary;
that is not a recovery pass. A revised check preserves the normal initial launch
and enables documented local recovery only on restart; its outcome is pending.

Independent foundation review identified cross-discussion call uniqueness and
set-once terminal-evidence gaps. Both were corrected, regression tests added, and
the owned domain controller passed again on the corrected source. The parent
session/call pair is now unique; recorded result, terminal position and delivery
time cannot be replaced. Three focused test files passed nine tests, including
unknown-cost holds, cumulative follow-up limits and duplicate-operation rejection.
Discussion budget aggregation is not yet wired into provider admission.

## Admission and Accounting Progress

Owned `--specialist-domain` checks passed on the expanded schema and domain code:
exact call/lease/attempt/research identity is required for a retry; an authorized
completed retry recovers its stored outcome; conflicts, invalid context and
revoked login are denied. Owner-only cleanup permits targeted Stop after a
partner grant is revoked, while normal reads still require that grant.

New operation reservation/settlement records preserve unknown charges, reject
repeated native dispatch keys and prevent rewriting settled usage. Database
checks passed for these cases. Provider/research I/O integration is still pending.

Development explicit-resume experiments did not restore the interrupted active
hook. Production-build experiments now include the real maintenance worker and
its required code version; accepted input remains stored but its in-flight hook
did not recover within the fixture deadline. This remains a failing release
check, not a passing recovery result. No Production resources were changed.

## Resumable Workflow Wiring

All three tools now use sequential native `serve` workflows, a retained child
handle and a durable fixed deadline. Server-only step imports passed the Eve
workflow build. Assignment-bound worker authorization replaces the old single-
request assumption. Current authority and cumulative reservations are wired into
model, web and embedding dispatch; native delivery remains independently observed.
Task status and targeted Stop routes plus the chat controls are implemented, with
six route contract cases passing (session, CSRF, foreign owner, native-ID rejection,
lost acknowledgement and settled retries). Native/UI acceptance remains pending.

The CI unit command passed 747 tests in 169 files using synthetic CI configuration.
The docs check passed 253 authored Markdown files. Dependabot covers all three
maintained npm manifests and GitHub Actions, without auto-merge; the large-upgrade
spec/adoption policy is present in AGENTS, CONTRIBUTING and the constitution.

The first native specialist run failed before dispatch because the fixture model
needed an explicit context window. This is corrected in the isolated fixture;
the second run is in progress. No paid calls or hosted changes were made.

Preview credential metadata was checked again: the Preview inherits the Production
credential record with zero overrides; no secret values were read. This proves
configuration inheritance, not final-build authenticated Preview sign-in.
The owned source-snapshot regression passed, including rejection of expired,
replaced and timestamp-altered references.

## Native Continuity and Control Findings

The first customer-update and best-practices cases each completed an initial call
and two follow-ups across a documented local `eve dev --resume` restart, with the
same child, workflow, task and fixed expiry. Each idle discussion then closed with
a native task-end observation. The three-specialist plus active two-task native
acceptance run is still in progress; those partial results are not full acceptance.

Direct SDK run cancellation was accepted without a corresponding native task end
in this actual runtime. Targeted control now uses a documented durable hook in
the existing serve workflow, inside Eve's service. Next authenticates and fences
before forwarding; Eve rechecks exact protected cancellation auth and CSRF.
The existing signed maintenance lane retries only recorded stopping/expired work
and reads actual native history; it never starts research or refunds unknown use.
Independent review found two control defects (unrecognized protected paths and
failed-state/terminal-proof confusion); both were corrected. Actual DB tests
accept the exact cancellation paths in open/locked recovery modes, reject wrong
paths/methods and reject forged CSRF. Failed state alone no longer proves closure.

The owned domain suite passed concurrent exact retries, source-snapshot rejection,
immutable Stop tokens and bounded maintenance-control claims. A real quota test
proves ordinary profile reads still throttle at the existing limit, while
existing-transaction research authority checks remain fresh without consuming
the browser/tool read quota. All selected models remain unchanged.

Eight containers from early unmarked specialist fixtures were removed by their
recorded owned identities. Revised fixtures use an explicit sandbox ownership
marker; recent cleanup receipts confirm removal of their containers and derived
images on failure. Unrelated containers, selected runtime state and turas-back
were left intact.

## Governed Support and Hosted Migration Rehearsals

The real native Support smoke check reproduced a pre-provider reaction failure:
generic artifact context tried to read an ordinary context receipt for a governed
Support attempt. Artifact, plan and retrieval instruction resolvers now exclude
Support, which already has its own charged context resolver. The isolated native
check passed after correction (`/tmp/turas-020-support-native2.txt`). A behavioral
unit test verifies all three return null without opening the ordinary context
transaction. The test is included in the governed Support suite inventory.

A broad unit run passed 1,360 tests and failed two cursor cases solely because
DATABASE_URL and DATABASE_URL_UNPOOLED were omitted from the synthetic unit
environment. Both cases plus the new Support instruction test passed with dummy
nonconnecting database URLs (four tests, three files). This is combined local
evidence, not a final-source CI pass. TypeScript and the 253-file docs check passed.

Hosted Neon rehearsals used isolated copy-on-write branches from Production
schema081 and Preview schema083, then the checked-in migration and role runners.
Both reached schema084, preserved counts of native conversation bindings and
ordinary model operations, and proved specialist runtime SELECT/INSERT/UPDATE
with DELETE denied. Both rehearsal branches and endpoints were deleted after
verification. Evidence: `/tmp/turas-020-neon-rehearsal-private.json` (identities and
counts only; no credentials). The actual Production and Preview branches were
not migrated by these checks. Final target backup and release remain required.

## Attachment Restart Recovery Resolved

The full staged-10 check passed on the canonical chat fix:
`/tmp/turas-020-staged10-canonical.txt`. Real Eve recovered its interrupted
turnStep after process restart. The original canonical input/delivery, authority
deadline and exact 10 MiB bytes were preserved; the browser displayed the original
send once and the subsequent follow-up once. Authenticated file download and a
later question about the same file passed after reload. Retirement returned 202.
No paid calls or in-turn package installations occurred. Cleanup removed exactly
one marked container and its derived image.

This is an explicit local-world recovery configuration: the owned runtime starts
with `WORKFLOW_INLINE_OWNERSHIP=false` and uses documented `eve dev --resume`.
The SDK's default inline ownership lease is 860 seconds; the dormant former owner
otherwise prevents retry within the original authority window. No dependency,
selected development environment, Production configuration or original deadline
was changed. Hosted recovery still requires its separate hosted verification.

Recovery also exposed a live/history display mismatch: the SDK preserves a local
optimistic ID after confirmation, while retained history identifies the delivery.
The chat now uses the supported `optimistic:false` option, so live and retained
messages join by canonical delivery identity without text/turn deduplication.
The original send, subsequent follow-up and byte/reload assertions all passed.
The separate four-project UI rerun remains required for final acceptance.

The broad unit run passed all 1,363 tests in 284 files
(`/tmp/turas-020-all-unit-final.txt`). The Eve plus Next production build passed
(`/tmp/turas-020-build-current.txt`); the canonical-message option was added after
that build and will be included in the final CI/build. The updated 018 domain
regression controller also passed (`/tmp/turas-020-domain-regressions-current.txt`).

Preview schema083 recovery branch `br-proud-meadow-awqqfyhm` was created from
`br-odd-violet-awftr9ad` at LSN `0/3EFF79F0`, without a compute endpoint. Its identity
is retained in `/tmp/turas-020-preview-084-backup.json`. The Preview target is not
yet migrated. Both hosted rehearsal branches were removed after successful
081→084 and 083→084 migration/grant checks.

The four-project WebKit rerun with canonical delivery IDs passed all 76 cases,
with no skipped, flaky or unexpected outcomes (`/tmp/turas-020-ui-canonical.txt`).
The staged-4 steering check passed (`/tmp/turas-020-staged4-current.txt`), including
provider failure, failed input/partial-history reload, later successful recovery,
original file availability and preserved unknown-cost holds. It made zero paid
calls. The staged-4 and staged-10 receipts share a directory; the latest receipt
covers staged-4, while the named logs retain each distinct acceptance result.

Native question acceptance passed on the current code
(`/tmp/turas-020-native-questions-current.txt`): real old-turn settlement,
replacement through browser and HTTP, parallel dismissal, reload, stale-answer
denial, preserved original deadlines, matched provider reservations and retirement.
It made no paid provider calls. These question and staged-4/staged-10 checks ran
sequentially through the owned controller.

Independent final review found a valid unavailable assignment emitted an invalid
public reason code, failing the entire list. It now maps to the bounded
`result_unavailable` reason. All eight assignment states pass real status-service
DTO validation, alongside the four public contract cases (12 tests/two files).
The reviewer otherwise found no selected-model or firewall changes, weakened
restart assertions, or blocker in Support instruction isolation.

## Preview Release Preparation

The exact isolated Preview endpoint `ep-restless-fog-awfoanld` was verified against
branch `br-odd-violet-awftr9ad`; the endpoint-free recovery branch's parent was
verified through Neon before applying the release. Explicit migration and runtime
grant runners moved only that Preview from schema083 to084
(`/tmp/turas-020-preview-migration.txt`). Production remains schema081 and was not
modified. A deployment of this source is now required for Preview acceptance.

The expanded full native specialist harness passed with actual public learning
publication followed by three assignments on the same customer-update worker,
plus the other two specialist types and all three control scenarios
(`/tmp/turas-020-native-public-learning2.txt`). It recorded zero deadlocks,
statement timeouts or paid calls. The fixture signs the final result against the
post-publication context, matching the authored finalizer. A final explicit
canonical-source assertion has been added for CI; the prior run exercised the
writer and continuation but did not separately count canonical source rows.

The inline file/memory check first reproduced a digest mismatch because the v27
adapter omitted file summary lines. The adapter now preserves the exact reserved
text/file summary while excluding native file references/URLs/bytes. Fourteen
projection cases and TypeScript passed. The actual native memory/file rerun passed
(`/tmp/turas-020-native-memory-fixed.txt`): preference save, fresh-session recall,
other-user isolation, removal and native retirement, with zero paid calls. The
latest shared native-file receipt covers this memory run; earlier named logs
retain the distinct staged-file results.
