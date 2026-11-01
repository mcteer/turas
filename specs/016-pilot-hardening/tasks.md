# Tasks: Production Hardening

**Scope updated**: 2026-10-31. The private/synthetic pilot programme and its
provisioning, participant feedback and readiness-approval tasks are removed, not
passed. Git retains the old ledger; [validation.md](validation.md) retains actual
results, failures and their source/deployment limitations. No participant or private
catalogue completion is a release gate.

Retained IDs below identify production work; checked entries describe the stated
implementation or observed check only, not full disaster-recovery acceptance.

## Implemented production safeguards

- [x] T024 Preserve primary authentication, exact membership, owner-private conversations and partner authorization; remove the Synthetic Pilot selection in the current change, subject to T264 verification below.
- [x] T028–T032 Implement private immutable storage, authorized staging upload and exact size/hash reconciliation; preserve source withholding and access limits.
- [x] T033–T040 Implement bounded isolated scan/parse/render jobs, leases, cancellation and unknown-cost reconciliation; maintenance does not grant implicit model or send authority.
- [x] T041–T044 Implement content-specific retention, withdrawal and owner/role boundaries with meaningful lifecycle and authorization regressions.
- [x] T048–T050 Implement recovery manifests/control and fail-closed admission; retain independently current denial and replay protections.
- [x] T055–T056 Test revoked authority, interrupted recovery and uncertain effects in owned isolation. These local checks do not prove full hosted recovery.
- [x] T060–T062 Implement authorized health/status, bounded maintenance and safe diagnostics.
- [x] T064 Preserve finite cost admission and reconciliation; unknown usage is never zero or automatically refunded.
- [x] T081–T082 Retain applicable deterministic, integration, browser and CI regressions for production behavior. Historical catalogue counts remain source-bound.

## Actual production release checkpoint

Production main `f3518f5` uses schema081 following PR49/PR50. Exact records and
qualified failures are in the validation record; deployment-specific checks are not
silently transferred to another deployment.

- [x] T074 Capture fresh encrypted Production077 recovery backup, rehearse owned077→081 restore and runtime grants, and apply explicit production migrations/grants with the recorded qualified role-setup resumption.
- [x] T076 Verify authenticated three-role reads and owner/foreign-conversation privacy on the final deployed configuration; verify actual normal chat streaming/reload/Stop on the code-identical earlier deployment, retaining that deployment identity.
- [x] T073 Verify actual production private upload, bounded scan/parse, extraction, exact download hash and normal domain deletion. Physical Blob absence is not independently established by this checkpoint.
- [x] T083 Record deployed code/schema/grants and observed limitations without turning failed wrappers, historical evidence or cancelled pilot work into passes.

## Production operations and programme removal

- [x] T051/T086 Complete and verify a matched recurring database/private-object/workflow recovery set, independent retained encrypted bytes and separate key availability; preserve existing protected archives.
- [x] T052/T087 Verify current-denial and uncertain-effect reconciliation for the actual recovery target; retain permanent fences, original provider identities and all unknown financial holds.
- [x] T053/T057/T088/T096 Verify the actual isolated hosted restore of the complete persistent recovery set and restricted service, preserve managed-workflow reconciliation semantics, measure full drill duration/backup age against RTO/RPO objectives, and report quarantined scope. Keep live Production open and distinguish drill results from actual incident/failover evidence; local migration rehearsal alone does not complete this work.
- [x] T077 Verify the enabled stable 12-hour backup schedule with one real immediate capture/restore and current per-class maintenance freshness. Record two genuinely scheduled captures at least 12 hours apart as a nonblocking operational follow-up under the owner’s 2026-10-24 directive; do not manufacture elapsed cadence or wait 12 hours to release.
- [x] T059/T067 Maintain actionable recovery, key recovery, source withdrawal, worker failure, budget and rollback runbooks as production configuration changes.
- [x] T080 Confirm owned test-resource cleanup and physical deletion where claimed; preserve real user histories, protected backup retention and permanent audit/replay records. Superseded deployments and unused local build/cache artifacts were removed. Only the final record PR's active Preview resources remain needed until its verification/merge; retire them afterward and retain the deletion receipts with that PR.
- [x] T084 Close the current removal through normal review/CI, exact Preview verification and post-release production checks; clean up its merged feature branch afterward. PR49/PR50 are merged, their feature branches are removed, and the exact Production release passed authenticated HTTP/WebKit and readiness checks.
- [x] T264 Verify this removal: primary-only login and retired provisioning/feedback/readiness entry points, retained production regressions, docs/typecheck and applicable CI. Record actual results and deploy changed login behavior through the normal release path; no pilot participants, synthetic workspace or new infrastructure required. All54 main/all 7 parity jobs passed on PR50; Production passed 19 role/privacy cases, three browser logins and three retired-selector refusals.
