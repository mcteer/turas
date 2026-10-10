# Research: Read-only MCP Service

Research reviewed 2026-10-10 against installed code and primary documentation. No dependencies installed, model calls made or hosted data changed.

## Transport and consumer

**Decision**: Pin `@modelcontextprotocol/server` and matching development/client
package to 2.3.1 during implementation. Use a dedicated Node Next route
`/api/mcp/v1`, modern 2026-07-28 stateless Streamable HTTP, request-scoped JSON
responses and an authenticated tools allowlist. No initialize/session assumptions,
legacy SSE, subscriptions, prompts, resources, roots, sampling or elicitation.

**Rationale**: Installed eve 0.67.1 supports outbound MCP connections and an inbound
MCP channel for durable agent work (`agent_start/get/update/cancel`). That channel
does not fit this governed read-only tool contract. Current SDK v2 has a fetch-native request handler;
Next 16.3.4 supports Request/Response routes. Neither SDK package is installed.
The handler does not supply authorization or Host/Origin checks.

**Alternatives**: An eve self-connection would add unnecessary model execution;
handwritten protocol parsing and legacy handshake compatibility add risk/scope.
No integration install is justified. Preserve eve and Turi model selection.

Primary sources: [SDK](https://github.com/modelcontextprotocol/typescript-sdk),
[fetch handler](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html),
[transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning).
The transport requires per-request protocol/body metadata and method/name header
agreement. Unsupported protocol is HTTP 400, not an invented 426 handshake.
Installed references: `node_modules/eve/docs/{README.md,connections/mcp.mdx,
guides/auth-and-route-protection.md}` and
`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.

## Authentication profile

**Decision**: Manually configured high-entropy bearer credentials minted by an
authenticated member, bound to one membership/environment/workspace, reviewed
categories and selected customer IDs. Store only the hash; reveal once. Current
identity/grants are checked on every call. Browser logout does not revoke a
separately authorized connection; membership/grant loss, credential expiry and
explicit revocation do. Do not mint browser login sessions for MCP.

**Rationale**: Existing temporary accounts are not a federated identity provider.
This bounded release supports consumers that configure explicit Authorization
headers. It intentionally does not implement the recommended MCP OAuth profile.

**Alternatives**: OAuth discovery/registration/federation is a separate identity
slice. No universal ChatGPT/Claude/browser connector compatibility claim, fake
OAuth discovery endpoints, shared Turas passwords or query-string credentials.
This limitation must be prominent in setup and release evidence.
Primary source: [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

## Shared domain authority

**Decision**: Introduce an explicit read-authority union: browser session or MCP
connection, plus the same principal/membership/workspace identity. Preserve
`CurrentSession` for browser writes and native workflow bindings. Extend shared
read guards, not only the transport, to validate the applicable authority under
consistent locks; MCP actors cannot satisfy write-command authority.

**Rationale**: `lib/server/profiles/policy.ts:lockWorkspaceActor` currently locks
`login_sessions`. Fabricating a session or borrowing its lifetime violates
individually revocable access. Reuse member, principal, workspace, partner-org,
customer and source fences in one transaction through serialization.

**Alternatives**: Parallel MCP authorization, direct SQL DTOs, stale creator-role
snapshots and privileged internal adapters would bypass the governed domain.

## Eligible projections and bounded data

**Decision**: Add narrow, transaction-aware read projections in existing domains:

| Category | Reuse | Required narrowing |
| --- | --- | --- |
| Profiles | `profiles/read.ts`, `projection.ts`, `eligibility.ts` | Accepted facts only; paginated workload/fact sections; no UI capabilities or private conflict rationale |
| Evidence | `retrieval/policy.ts`, `projections.ts`, `citations.ts`; profile eligibility | Current eligible lists/passages, no historical withdrawn prose; connection-bound opaque citation handles |
| Knowledge | `knowledge/read.ts`, profile lineage eligibility | Sanitized current publication; explicit incomplete result on scan exhaustion; opaque outer pagination |
| Plans/designs | `plans/read.ts`, `policy.ts`, `sources.ts` | Explicit current accepted revision; no default working draft, edit capability or private lineage |
| Reports | `reports/read.ts:reportReadProjection`, `release.ts:reportRevisionFence` | Explicit publication selection and audience; transaction-aware fence; no default draft/artifact/download metadata |

`readProfile` has a capped research array and unbounded facts/workloads.
`readProfileSource` permits historical internal inspection. `readPlan` and internal
report reads select working drafts by default. These UI DTOs are not MCP contracts.
`searchEvidence` can dispatch embeddings and owns transactions/receipt writes:
initial service uses lists/direct reads only, with no search/embedding/model call.

## Continuation, quotas and operational metadata

**Decision**: Persist random opaque continuation/citation handles with no prose,
secret or raw filters; bind actor, connection, exact category/customer/section,
position/revision/digest, scope digest and expiry. Resolve under current policy.
No result cache, readable signed positions, cross-credential citation reuse or
hidden totals. Quota admission commits independently of read rollback; failures
consume admitted read quota. Bounded concurrent reads and PostgreSQL timeouts
prevent unlimited work. Cleanup is independent of source/grant denial.

## Compatibility and release

**Decision**: Explicit additive migration 055 after current 054; owned empty and
054 upgrade, runtime grants and same-database/workflow recovery before release.
MCP readiness is minimum 055 and starts disabled. Existing feature readiness is
not globally raised merely to expose MCP.

`learning-activate.ts` currently requires exactly 054 while learning runtime accepts
at least 054: extend the operator's verified compatibility set to 054/055 and test
both, retaining owner/environment checks. Do not broadly accept unknown schemas.
No request handler migrates. Review legacy browser/native actor regressions in CI.

After green CI/authorized merge, back up and rehearse the selected target before
applying 055/grants, verify compatible disabled deployment, then explicitly enable
and perform available Production consumer and CLI WebKit reads. Record unavailable
real-record coverage; no synthetic customers or paid calls. Roll back exposure by
disabling and revoking credentials, never by dropping customer data.

Discovery confirmed from [official server implementation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/src/server/server.ts) and [client negotiation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md). Pin the client explicitly to 2026-07-28; its default is legacy. Registry metadata confirms server/client 2.3.1, Apache-2.0 and Node ≥20; dependency installation/license review remains an implementation task.
