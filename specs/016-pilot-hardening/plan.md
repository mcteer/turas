# Implementation Plan: Production Hardening

**Scope updated**: 2026-10-31 | **Spec**: [spec.md](spec.md)

## Scope

Retain the production platform improvements delivered through PR47/PR48: primary
and partner authorization, owner-private conversations, private durable storage,
bounded processing jobs and leases, withdrawal/retention, cost uncertainty controls,
operational health, recovery backup, explicit migrations and runtime grants.
Production main112 uses schema081. The validation record identifies actual checks,
qualified resumptions and unresolved hosted recovery/cadence limits.

Remove the private/synthetic pilot programme: no Synthetic Pilot production login
option, pilot provisioning command, participant/feedback collection, private readiness
approval programme, repeated whole SDK/model catalogue or preview-only pilot resources.
Cancellation is not acceptance. Preserve actual failures, historical evidence and all
financial holds. Owned synthetic fixtures remain valid tests of production behavior.

## Current implementation

1. Remove pilot selection from the login form and request contract; make the domain
   authentication function refuse retired pilot selectors while retaining ordinary
   credentials, primary membership, partner access and private-conversation ownership.
2. Retire standalone programme provisioning, feedback, readiness and hosted quality
   command entry points. Preserve imported test fixtures and production backup,
   recovery, lifecycle, health and cost mechanisms.
3. Remove programme-only requirements/tasks and update release documentation. Keep
   production portions of mixed work, without a private assessor prerequisite.
4. Run focused login/retired-command tests, typecheck, documentation checks and
   applicable CI. Verify the exact Preview before merge under CONTRIBUTING.
5. Release through the normal process and verify changed authentication behavior in
   Production using authenticated HTTP/CLI WebKit. No new model calls are needed to
   establish removal of a login selector or a programme CLI.

## Production boundaries

Use existing governed domain authorization across UI, agent, jobs, exports and MCP.
Preserve current size, source, review, lease, deadline and budget limits. Do not
settle or release unknown charges, change historical records, weaken revoked-source
checks or archive real user conversations as cleanup. Secrets and customer data stay
out of tracked evidence and tool output. Do not change firewall configuration.

Database changes require exact target identity, verified recovery backup, owned
migration/grant rehearsal and compatible code/schema ordering. This removal introduces
no new migration. Retain081 and earlier migrations unchanged. A local check or CI
result is not proof of hosted behavior.

## Remaining operational work

The [tasks](tasks.md) track production-only follow-up: complete matched recurring
backup coverage, independently current denial/replay authority, full hosted recovery
and workflow reconciliation, measured RPO/RTO, actual schedule/maintenance observations,
and physical deletion verification where claimed. The existing encrypted077 backup
and owned081 rehearsal are real scoped evidence, not proof of a full cloud disaster
recovery drill. No new pilot programme is required to address these gaps.

## Evidence and release

Keep exact code/deployment/schema/configuration identities and distinguish observed
results from inference. Preserve original failed invocations and qualified resumptions.
Use [validation.md](validation.md) for actual evidence; Git retains the superseded
programme plan and task history without leaving it as an active execution queue.
