# Implementation Plan: Read-only MCP Service

**Branch**: `015-read-only-mcp` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: `specs/015-read-only-mcp/spec.md`. Implementation and acceptance are tracked in tasks.md and validation.md.

## Summary

Expose five governed read categories to internal and assigned-partner consumers
using scoped revocable credentials and stateless MCP. Add explicit read authority
in shared domain guards, exact accepted/published projections, opaque scoped handles,
independent quota accounting and accessible self-service credential controls.
Reuse source/partner fences; never proxy model tools or expose drafts/history/files.

## Technical Context

**Language/Version**: Node 24, TypeScript 7.0.2, SQL migrations.

**Primary Dependencies**: Installed Next 16.3.4, eve 0.67.1, pg 8.23.0, Zod 4.5.4;
implementation pins official MCP server/client 2.3.1 with reviewed lockfile/license.
2026-07-28 protocol, standard Request/Response handler; no legacy handshake/session,
SSE subscriptions, OAuth federation, external integration or model change.

**Storage**: Existing PostgreSQL/pgvector; additive 055 connection/customer-ceiling,
handle, quota/lease and minimized receipt metadata. Existing domain facts unchanged.

**Testing**: Required consumer/contract/unit/integration, source/authority race,
owned production build, four CLI WebKit configurations, explicit migration/grants,
restart/cleanup/recovery and five-class quota-paced benchmark. No paid model eval.

**Target Platform**: Existing Next Node runtime and Vercel Production;
`/api/mcp/v1` stateless JSON responses, existing maintenance worker.

**Project Type**: Governed full-stack application with external read interface.

**Performance Goals**: SC-004, five operation classes × 100 reads, p95 <1000ms;
request 10 seconds, query 5 seconds, lock 2 seconds. Measure quota pacing separately.

**Constraints**: C01–C10 in [data model](data-model.md). Manual Authorization-header
clients only; explicit limitation against universal/OAuth connector claims. Reject
unsupported protocol versions/headers before dispatch. No private payload caching,
domain mutations, paid embedding/research/model dispatch or runtime DDL.

**Scale/Scope**: Four stories, five category scopes, twelve fixed tools including
identity/customer listing/citation resolution; 20-row pages, 100-customer ceiling,
10 connections/member, bounded cross-credential/actor/workspace quotas.

## Constitution Check

| Principle | Pre-design gate | Post-design result |
| --- | --- | --- |
| I — Specify first | Four testable stories and 18 requirements | Spec, contracts, model and tasks preceded implementation |
| II — Customer outcomes | Reviewed maturity separate from stage/opportunity | No recalculation, opportunity ranking or success inference |
| III — Evidence lifecycle | Accepted facts and attributed research only | Current source fences, dates/conflicts/citations; no historical withdrawn prose |
| IV — Authorization | Current actor and explicit partner grants | Shared read-authority union and transaction fences; scopes only narrow |
| V — Human decisions | Member approves credential scope; admin revokes | No factual/plan/publication/send decisions through MCP |
| VI — eve core | Installed routing/auth/MCP docs researched | eve preserved; dedicated inbound transport without speculative integration |
| VII — Verification | Access/transport/UI changes require actual behavior checks | Real SDK consumer, full suites, source-bound CI and hosted release checks |
| VIII — Operability | Bounded reads, explicit migration/recovery | C01–C10, disabled-first release, safe audit/cleanup, no runtime DDL |

All pre/post-design gates pass. No constitution exceptions. Manual bearer instead
of recommended OAuth is a documented protocol authentication profile limitation,
not an implied standards/universal consumer compatibility claim.

## Project Structure

### Documentation (this feature)

```text
specs/015-read-only-mcp/
  spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
  checklists/requirements.md
  contracts/mcp-api.md  contracts/management-api.md
  handoff.md
```

### Source Code (repository root)

```text
lib/contracts/mcp.ts
lib/server/auth/read-actor.ts
lib/server/mcp/{credentials,policy,management,handles,limits,audit,retention,schema,transport,tools,projections,profiles,evidence,knowledge,plans,reports}.ts
lib/server/{profiles,retrieval,knowledge,plans,reports}/  governed read adapters/fences
app/api/mcp/v1/route.ts
app/api/mcp/connections/  authenticated management routes
app/(workspace)/settings/connections/page.tsx
app/_components/mcp/connections.tsx
migrations/055-mcp-read-access.cjs
scripts/{test-mcp,check-mcp-ui,mcp-environment,mcp-recovery,benchmark-mcp,mcp-ci-evidence}.ts
scripts/mcp-suites.json
tests/{contracts,integration,fixtures}/mcp/
tests/ui/mcp-{connections,accessibility}.spec.ts
```

**Structure Decision**: Existing domain reads gain explicit read authority and
transaction support; transport maps only frozen schemas. Browser/native writes
retain existing session identity. New operational metadata is not customer truth.

## Design and execution phases

1. Confirm current main/055 availability, docs/dependencies and fixed suite inventory.
2. Implement strict contracts, additive schema/runtime grants, shared read-authority
   and transaction fences, independent quota admission and owned test harness; preserve
   browser/native behavior under regression tests.
3. US1: independent credentials, self-management/admin revocation, strict transport
   guards, identity/allowlist discovery and accessible connection controls.
4. US2: paginated accepted profiles, eligible evidence/citations and sanitized
   shared knowledge; no search/embedding dispatch and no wholesale UI DTO exposure.
5. US3: accepted plan/design and published report readers with current audience and
   source fences; reject every mutation/generation/file/send operation.
6. US4: quota/lease accounting, handles, audit/cleanup, migration/recovery, benchmarks,
   complete SDK consumer/WebKit/regression/build/source-bound CI and release runbook.

Sources and compatibility decisions are in [research](research.md). Exact schemas,
methods/errors and limitations are in [MCP](contracts/mcp-api.md) and
[management](contracts/management-api.md). See [quickstart](quickstart.md).

## Release and rollback

No hosted writes during planning. During implementation release, obtain the already
required explicit merge/release authorization, back up and rehearse 054→055 against
the selected target, apply owner migrations/grants before compatible disabled code,
verify deployed commit/schema then enable explicitly and validate real available
consumer/read/role behavior in Production. Include honest record-dependent limits.
Update learning activation's verified schema set to 054/055, not arbitrary future
versions. Do not globally force earlier feature readiness to 055. Disable exposure
and revoke credentials for rollback; forward recovery preserves domain/audit data.
