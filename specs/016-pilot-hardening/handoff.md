# Production hardening handoff

Updated 2026-11-01 after the verified Production hardening release. The user cancelled the private pilot
programme and its associated tasks. Synthetic workspace provisioning, participant
feedback, G01–G22 approval bundles and aggregate model-evaluation programmes are
retired. They are not outstanding launch work or prerequisites for normal use.
Retain the implemented Production security, reliability, storage, bounded-job and
recovery protections. Historical test results and failed attempts keep their
original source and scope; cancellation does not certify them or erase accounting.

## Actual deployed checkpoint

- Canonical application: `https://www.turas.dev`.
- Deployed runtime commit: `f3518f58eaf6a122a48b267c8b66fd9dfffcd599`.
- Application tree: `68b5ac856c97a5cbcc53f6dc930416504ad51880`, identical to the
  tested PR50 commit `a939ce4dac0643ad2d0306cb2978c2e82ad7e34d`.
- Current serving deployment: `dpl_HDDYqYgMo7Ka6BPncMfTyni9wDKg`.
  The provider project/commit, canonical domain mapping and actual API release
  header were independently checked after explicit promotion. The earlier failed
  PR49 deployment was rolled back, then retired; its failure remains recorded.
- Primary database: schema 081, with explicit current runtime grants and verified
  TLS access by restricted `turas_runtime_016`. The initial forward operation
  failed; the qualified explicit resume completed. Do not relabel the failed
  operation as a successful original forward run.
- Normal private Blob/Sandbox processing has its own finite Production cost budget.
  Test-workspace login and evaluation-only Root/Learning bindings remain disabled.
  No Preview authority or synthetic workspace is required for normal Production.

## Verified behavior and its limits

On the current deployment, all 19 HTTP role/privacy cases, all three ordinary
browser logins and three retired-selector refusals passed. The apex redirects308
to the canonical site. One ordinary primary `panel` chat request returned its
expected response, survived reload and reached server state `completed`; exactly
one attempt was recorded. Its conversation was archived and verification sessions
were revoked. The three role captures and settled chat capture were inspected.
The partner currently has no customer assignments; its observed empty directory
is correct, not permission to create grants. Earlier streaming/Stop and file
processing evidence below retains its original deployment scope.

On the earlier `11240b6` deployment, one harmless 76-byte text file passed normal signed private Blob upload, the
existing scheduler's scan/parse path, two actual Sandbox provider receipts,
extracted-text checks and exact original download SHA-256. Normal cleanup reached
domain state `deleted`; the owned conversation was archived and its login session
revoked. Physical Blob deletion was not independently audited. The two conservative
90,000-micro-USD processing reservations remained recorded as dispatched; no zero
cost, released hold or final invoice was claimed. This proves the observed small
text-file path, not every format, renderer, maximum file size or recovery scenario.
The earlier missing-attestation attempt remains a failure with zero artifact
intents and zero processing cost reservations.

The Support provider-schema projection removes unsupported transport constraints
while preserving the original strict Zod/domain output validation. A real
configured-provider S02 request accepted the corrected schema and passed that
validator. It was a bounded owned-environment check, not all eight scenarios or a
hosted Production Support claim. The old unretained HTTP-400 reason cannot be
identified exclusively from the documented schema incompatibility.

## Service health and recovery assurance

The current deployment returned `/api/health/ready`200 with `ready:true`. Authenticated
status showed the exact released version, healthy database, open admission, ready
dispatch, all 15 healthy maintenance classes and zero required quarantines. Service
readiness still checks current runtime capability, cost holds and dispatch/scanner
configuration. The earlier main112 composite returned503; that historical result
has not been relabelled as a pass.

A retained matched encrypted Production081 capture passed actual isolated hosted
restore and current-denial/replay checks: original-clock duration 30m 41s and backup
age 39m 30s, within the four-hour/24-hour objectives. All 12,471 effective-permission
checks and 114-table denial/replay checks passed. Two provider-owned default-ACL
restore entries were excluded; provider-default parity was not claimed. The
capture required no private object bytes, and no active Native Workflows existed
to resume. This proves that bounded isolated drill, not live incident failover or
provider workflow resumption on the new release.

Administrator-only assurance remains `ready:false`, with current-source store,
image and backup observations `unverified`. Preserve those honest states; service
readiness does not certify complete recovery assurance. The separate backup
operator was refreshed from the released commit, its 21 uploaded source files were
matched, all 37 environment rows were unchanged, and its enabled `0 */12 * * *`
cron was verified. No extra capture, budget reset, key rotation or twelve-hour wait
was used for closure. Two genuinely scheduled captures at least 12 hours apart
remain nonblocking operational follow-up. Use the
[Production operations runbook](../../docs/pilot-operations.md) for explicit
safety-copy, storage, incident fencing and recovery procedures.

## Resource cleanup and maintenance follow-up

Seven superseded owned deployments were deleted during this release continuation,
including the failed PR49 deployment; canonical mappings were checked afterward.
The verified rollback deployment and protected backups, key custody, audit/replay
records and financial holds remain retained. PR49/PR50 feature branches are absent
locally and remotely. Unused local SSR/build caches were removed separately.
The final documentation PR temporarily uses the owned isolated review database,
empty Blob store and one protected Preview. Remove those review resources and their
Preview/Development-only managed credential after its verification and merge;
record actual deletion results on that PR. Never delete the archive project or
normal operator merely because their historical names contain “pilot”.

Dependency audit follow-up remains separate maintenance work. The installed
Next16.3.8 is reported by upstream advisories; the checked-in Sharp0.35.5 meets the
[image advisory workaround](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
and the [Cache Components advisory](https://github.com/advisories/GHSA-673q-mjm6-r5xr)
requires an option/directive absent from the inspected application. This does not
clear every audit finding. Schedule the normal Next patch upgrade and review the
remaining production dependency findings; no dependency upgrade was mixed into
the release-stamp fix.

## Protections to retain

Keep server-enforced membership, customer/partner grants, owner-private
conversations and source eligibility across UI, Native tools, jobs and MCP. Source
withdrawal/revocation must withhold dependent content and stop continuation;
ordinary supported supersession remains refreshable. Schema-080 durable named
content history/coverage and schema-081 verified-undispatched Native rejection
handling are part of the Production implementation, not disposable pilot fixtures.

Keep explicit migrations and runtime grants, private immutable storage, matching
scanner signatures, pinned bounded Sandbox execution, independent cleanup lanes,
finite cost accounting and unknown-charge holds. Never remove audit/replay records,
refund uncertain work, reset a budget or delete shared resources because the pilot
was cancelled. Private files and credentials remain outside Git and routine output.

For a new release, use relevant regression and authorization checks, green merge
CI, actual deployed identity/schema and focused authenticated HTTP/WebKit behavior
checks. Match validation to the change. Do not rerun aggregate paid catalogues or
reprovision historical environments merely to replace a retired approval bundle.
The application model remains unchanged unless the user explicitly selects another.

## Documentation and ownership

[Quickstart](quickstart.md) now covers ordinary development and operating checks.
[Validation](validation.md) preserves the dated execution record; historical counts,
commits and failures are not current-source passes. The feature's original spec,
plan, contracts and task history document how the hardening evolved; programme
retirement and the current Production scope govern further work.

No private participant observations or human approvals may be invented. No cleanup,
provider, firewall or database action is authorized by this handoff alone. Perform
only the separately selected operational action against its exact target, preserve
its original result, and report any remaining Production limitation candidly.
