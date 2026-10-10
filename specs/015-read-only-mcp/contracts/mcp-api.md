# MCP Read Contract — turas-mcp-v1

Design contract, not a deployed endpoint. Protocol and output versions are separate.

## Transport

`POST /api/mcp/v1`, Node runtime, official pinned SDK v2, protocol 2026-07-28.
Single JSON request; JSON responses only. No sessions/initialize, subscriptions,
legacy SSE, prompts/resources, roots, sampling or elicitation. Supported methods:
`server/discover`, `tools/list`, `tools/call`. These are confirmed against official
SDK server definitions; no other method is advertised or dispatched.
No method or name forwards to Turi, eve tools or an arbitrary domain operation.

Require bearer authentication on every supported method; query credentials and
browser cookies do not authenticate MCP. Validate canonical configured Host and
any present Origin before the handler; absent Origin is allowed for server clients.
No wildcard origins or reflected forwarded hosts. Responses are no-store/private
and never include CORS credentials. Present disallowed Origin returns 403.

Require protocol metadata/header agreement and method/name mirrors under the
[2026-07-28 transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
Unsupported protocol and mismatched metadata return the SDK's documented HTTP 400
errors; unknown method returns 404/-32601. Unsupported HTTP methods return 405.
No backwards-compatibility fallback or invented initialization handshake.

This release supports clients that configure Authorization headers manually. It
intentionally omits [OAuth federation/discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization);
no universal assistant/browser connector compatibility claim. Read-only annotations
are descriptive; server policy enforces the actual allowlist.

## Inputs and tools

All tool arguments are strict objects with no additional fields. UUIDs and limits
follow C01–C10. Customer-bound reads require a credential customer ceiling and
current domain access. Exact expected revision is optional on direct reads; when
supplied and not current/eligible, return unavailable, never substitute silently.
No general search input, arbitrary URL, SQL, path, tool name or write arguments.

| Tool | Scope | Arguments | Governed result |
| --- | --- | --- | --- |
| `turas_identity_v1` | Any active connection | none | Contract/version, actor kind, current workspace, allowed categories, expiry; no credential hash or browser session |
| `turas_customers_list_v1` | Any customer category | limit, cursor? | Active authorized selected-customer references; no hidden totals |
| `turas_profile_read_v1` | profiles | customerId, section summary/workloads/facts, limit?, cursor? | Accepted profile summary or eligible section page |
| `turas_evidence_list_v1` | evidence | customerId, workloadId?, limit, cursor? | Eligible source/revision summaries and bound citations |
| `turas_evidence_read_v1` | evidence | customerId, revisionId, passageId | Exact currently eligible retained passage and citation |
| `turas_citation_resolve_v1` | evidence or knowledge matching handle | citationHandle | Same-connection current permitted passage/publication |
| `turas_knowledge_list_v1` | knowledge | limit, cursor? | Eligible sanitized published practices |
| `turas_knowledge_read_v1` | knowledge | publicationId, expectedRevisionId? | Exact eligible current sanitized publication |
| `turas_plans_list_v1` | plans | customerId, limit, cursor? | Current accepted plan/design identities |
| `turas_plan_read_v1` | plans | customerId, planId, expectedRevisionId? | Accepted revision, baseline and source-qualified content |
| `turas_reports_list_v1` | reports | customerId, limit, cursor? | Authorized published report identities, audience and correction state |
| `turas_report_read_v1` | reports | customerId, reportId, expectedRevisionId? | Current published audience projection and dependency status |

Exactly twelve versioned tools; `tools/list` reflects category scopes without
customer identities/counts. Identity/customer discovery is fixed metadata, not a
sixth content category. Every tool declares read-only, idempotent and non-destructive
annotations. Use the confirmed modern discovery schema and pinned client negotiation; this
contract cannot be broadened into new content/operation categories.

## Output projections

Common envelope: `contractVersion` = `turas-mcp-v1`, `status` = available/empty/
unavailable, `requestId` UUID, `data` typed category DTO or null, `nextCursor` opaque
string or null, and bounded fixed reason enum when unavailable. No total count.
Valid empty list uses empty items/nextCursor null. Exhausted bounded eligibility
scan returns unavailable/incomplete, never a false complete empty list. List item
order is immutable ID ascending; active head/generation changes invalidate bound
continuation instead of combining incompatible revision pages.

| Category | Explicit permitted data |
| --- | --- |
| Customer reference | customerId, displayName, permitted workload identity; no existence outside current ceiling/grants |
| Profile summary | customerId, current maturity/rubric and workload scope, accepted revision identities, dated reviewed state and explicit unknowns; no opportunity inference |
| Profile facts/workloads | 1–20 accepted eligible typed facts or workload summaries, original observation dates, review/quality/freshness/conflict labels and bound source identities |
| Evidence | revisionId, passageId, bounded title/passage/location, original publication/observation/retrieval dates, origin, acceptance, quality components/rubric, freshness/conflict and opaque citation handle |
| Shared knowledge | publication/revision/generation/digest, sanitized existing knowledge payload, applicability/limitations/validation, original quality/freshness dates, shared citation handle; no original customer/private lineage |
| Plan/design | accepted plan/revision/generation/digest, kind, accepted baseline/milestones, audience-permitted reviewed payload, assumptions and current dependency state; no draft/action capabilities/private source identities |
| Report | report/publication/revision/generation/digest, period, permitted audience/confidentiality, correction state and eligible published section payload; no draft, artifact paths/download IDs or dispatch receipts |

Use strict typed schemas enumerating existing domain payload variants, not an
unbounded JSON blob. Project first and check full serialized response bytes ≤128
KiB, including SDK wrappers. A source family that cannot currently substantiate its
content is withheld as unavailable with a fixed safe reason; omit confidential
rationales. Dates/unknown/conflict labels are never invented or refreshed by reads.
Original prose is data, never instructions to the server or a downstream decision.

## Authorization and lifecycle

Resolve independent current read authority; do not create or borrow login sessions.
Use shared domain locks, category/customer ceiling and current individual grants
before retrieving, and final source/authority fence before serialization. Client
metadata, role claims, headers, scopes and handles cannot grant authority.

Opaque cursor/citation handles have C05 bindings, expire in 15 minutes and carry
only metadata. Reject another credential's handle even for the same member. No
cache of private result prose. Browser logout does not invalidate separate valid
MCP access; membership/org/workspace inactivity and explicit revoke/expiry do.
Revocation can wait for an already admitted locked read; after revocation commits,
new reads fail. Already delivered bytes are not recallable. Source withdrawal uses
the same ordering and synchronous fences with workers stopped.

## Safe failure and admission

Unauthenticated/revoked/expired is 401 with generic bearer challenge; missing scope
is 403; hidden or unauthorized record is opaque unavailable/not-found independent
of existence. Malformed arguments/handles are fixed invalid-input failures; query
or server error details never escape. Domain errors use SDK tool-error results;
transport errors retain standard JSON-RPC forms. 429/Retry-After represents C06
quota/concurrency; 503 represents disabled/readiness/database uncertainty; 413 is
oversized request. Oversized individual result is safe unavailable, never truncated.

Independent quota admission counts all authenticated supported protocol requests,
including denials; rollback of read transaction cannot erase it. Request/SQL/lock
bounds and leases follow C06. Client abort ends work/release lease. No hidden retry,
embedding/model/research call, customer write, generation, file creation or send.
Rejected unknown operations must never reach a generic dispatcher.
