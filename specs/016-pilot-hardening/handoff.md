# Production hardening handoff

Updated 2026-10-31 after Production cutover. The user cancelled the private pilot
programme and its associated tasks. Synthetic workspace provisioning, participant
feedback, G01–G22 approval bundles and aggregate model-evaluation programmes are
retired. They are not outstanding launch work or prerequisites for normal use.
Retain the implemented Production security, reliability, storage, bounded-job and
recovery protections. Historical test results and failed attempts keep their
original source and scope; cancellation does not certify them or erase accounting.

## Actual deployed checkpoint

- Canonical application: `https://www.turas.dev`.
- Deployed main commit: `11240b6f11500109ae3a88c1e880f85d061b7783`.
- Application tree: `e5c922039923a41776c04155c349105babc4ac76`, matching the tested
  `8f6f5c6716bb03127de0d8b9f57d2feef1f38571` hardening implementation.
- Current serving deployment: `dpl_5HrzmzzX41iXn4gRXAfEGiHr1GqF`, including the
  required Production scanner-signature attestation.
- Primary database: schema 081, with explicit current runtime grants and verified
  TLS access by restricted `turas_runtime_016`. The initial forward operation
  failed; the qualified explicit resume completed. Do not relabel the failed
  operation as a successful original forward run.
- Normal private Blob/Sandbox processing has its own finite Production cost budget.
  Test-workspace login and evaluation-only Root/Learning bindings remain disabled.
  No Preview authority or synthetic workspace is required for normal Production.

## Verified behavior and its limits

Actual Production role and privacy checks passed, including ordinary authenticated
access and owner-private conversation boundaries. Actual chat streaming, reload,
Stop acknowledgement and eventual idle state passed. These results do not authorize
access to another owner's conversation or bypass partner grants.

One harmless 76-byte text file passed normal signed private Blob upload, the
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

## Open Production recovery gap

`/api/health/ready` still returns HTTP 503. Authenticated application workflows can
succeed while the operational assurance composite remains incomplete. Inspect
`/api/operations/status` component results: admission, dispatch, maintenance,
required quarantines, object namespaces, current-code image execution and verified
backup health. Do not change the endpoint, fabricate a healthy result or treat
application smoke checks as proof of complete recovery.

Full matched service restoration, current-denial/replay reconciliation and observed
scheduled backup cadence have not been established as complete Production
recovery. The 24-hour RPO/four-hour RTO remain targets. This is normal operational
follow-up; it does not revive participant feedback or a private pilot approval
programme. Use the [Production operations runbook](../../docs/pilot-operations.md)
for explicit safety-copy, storage, incident fencing and recovery procedures.

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
