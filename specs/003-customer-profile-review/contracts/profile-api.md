# Profile HTTP and domain contracts v1

These are intended 003 interfaces. Reuse `lib/contracts/http.ts` envelopes:
`{ data, correlationId }` or `{ error: { code, message }, correlationId }`.
All responses are `private, no-store`; mutations require the current session,
existing origin/CSRF protection, strict Zod schemas and bounded request sizes.
Never accept identity, trusted origin, approval state or workspace from a body.

## Routes

`{customerId}` and record IDs are UUIDs. Resolve a customer before a nested record;
a record/customer mismatch has the same 404 as missing/inaccessible data.

| Method and path | Input | Output and authority |
| --- | --- | --- |
| GET `/api/customers` | Existing cursor/limit; optional name query | Existing safe directory DTO; internal-all/partner-granted. Approved name only |
| POST `/api/customers` | Request key, proposed details | Admin-only anchor with neutral pending label and Pending details receipt |
| GET `/api/customers/{customerId}/profile` | Optional workload ID | Projected identity/overview, six maturity states, section summaries, next actions, actor capabilities and opaque context version |
| GET `/api/customers/{customerId}/records` | kind, workload, allowed state, query, cursor, limit | Projected record page; no raw total; partner own unaccepted items only |
| GET `/api/customers/{customerId}/records/{recordId}` | None | Current record and allowed pending candidates; safe source metadata |
| GET `/api/customers/{customerId}/records/{recordId}/history` | cursor/limit | Authorized exact revisions and event projections; no hidden prior source/body |
| GET `/api/customers/{customerId}/review` | state pending/open-request, cursor/limit | Steward/admin customer queue; non-steward internal users and partners cannot read it |
| GET `/api/customers/{customerId}/submissions` | cursor/limit | Current actor's submissions and safe reasons, under current customer access |
| GET `/api/customers/{customerId}/sources/{sourceRevisionId}` | None | Projected retained passage/dates/quality/check results when source itself is visible |
| GET `/api/customers/{customerId}/stewards` | None | Internal readers only; current assignment/version |
| POST `/api/customers/{customerId}/commands` | Command union below | Authorized receipt; 201 for new proposals/requests, 200 for decisions/updates/replay |
| GET `/api/customers/{customerId}/commands/{requestKey}` | None | Same actor's receipt after current authority check; hidden otherwise |

Read pages default to 25 records, maximum 50. Record cursors are opaque, validated
keysets bound to actor/audience, customer, workload, query and filter; do not embed
hidden record values. Directory preserves its existing name/ID cursor contract.
Queries are at most 200 characters. Profile text search scans only the authorized
record projection; no hidden fields influence matches or ranking.

## Command envelope

Every command includes `requestKey` UUID, `action`, and the action payload. Commands
on existing resources include `expectedRecordVersion` (or expected stewardship/
conflict version). Approval also includes the exact candidate revision and
`expectedAcceptedRevisionId`, including explicit null for first acceptance.
Record versions track accepted heads, not hidden candidate sequencing. Partner
DTOs/receipts omit global revision numbers; own candidates use opaque revision IDs.
The server hashes canonical validated action and payload. Equal request key and
body replay a stored receipt; different body/action returns 409. No automatic
resubmission under a new key after ambiguous failure.

| Action | Payload | Authority and result |
| --- | --- | --- |
| `propose_record` | Kind, workload scope, typed payload, declared manual source/excerpt, requested audience | Internal member or granted partner for delivery kinds; Pending revision, never accepted |
| `propose_revision` | Record ID, expected version/head, replacement payload and source references | Same contributor boundary; immutable candidate; internal-only records remain hidden to partners |
| `propose_workload` | Details payload | Internal member; neutral anchor and Pending details; no accepted workload fact |
| `accept_revision` | Exact revision/digest, expected version/head, rationale, partner-safe reason when needed | Assigned steward/admin; atomically supersede old head and accept candidate |
| `reject_revision` | Exact revision, expected version, rationale, partner-safe reason for partner submitter | Assigned steward/admin; no accepted-head change |
| `request_retraction` | Exact accepted revision, expected version, reason | Authorized contributor; opens request only |
| `retract_revision` | Exact accepted revision, expected version, rationale, optional request ID | Assigned steward/admin; immediate ineligibility, no prior-revision resurrection |
| `withdraw_source` | Exact source revision, expected lifecycle version, rationale | Assigned steward/admin; source event and affected context generations change atomically, including research-only sources |
| `decline_retraction` | Request ID/version, rationale, partner-safe reason when needed | Assigned steward/admin; accepted fact unchanged |
| `assign_steward` / `revoke_steward` | Internal membership ID, expected assignment version, rationale | Active internal admin role only; auditable, same-customer assignment |
| `flag_conflict` | Two visible current revision IDs and reason | Internal contributor; records a concern for steward review; not a destructive overwrite |
| `confirm_conflict` / `resolve_conflict` | Conflict ID/version, rationale and exact resolution references | Assigned steward/admin; only confirmed material conflicts block settled guidance; resolution cannot revive withdrawn evidence |

Conflict concerns appear as unverified concerns, never as accepted facts. Partners
can submit a claim describing a possible inconsistency through their ordinary
pending path; they cannot query hidden counterparts or manipulate conflicts.
Trusted ingestion withdrawal uses the same source lifecycle service and audit
invariants as `withdraw_source`; it cannot erase the prior passage or event.

Partner-safe decision reasons are separate from internal notes and contain no
restricted sources or operational metrics. If a partner submission requires a
private explanation, use a short safe reason plus internal detail. Steward review
of their own submission is permitted and visibly attributed. No bulk approval.

## Record projection

A returned revision contains `id`, `recordId`, internal-only sequence number, `kind`, safe scope,
`reviewState`, projected typed payload, allowed provenance, observed/review dates,
quality (`rubricVersion`, R/F/D/C/Q, band, freshness, asOf), support/conflict status
and safe citations. A Pending badge stays visible in every unaccepted view.
`capabilities` are computed server-side hints, never authority tokens.

Only current accepted manual revisions enter `acceptedFacts`; eligible research
enters a distinct `attributedResearch` collection. `ownSubmissions` is separate.
Sources and evidence links are projected
independently; no full database row or private conversation ID is serialized.
Internal-only operation types cannot be made delivery-visible by payload flags.
No unfiltered counts, hidden totals, decision metadata or placeholder IDs leak.

## Domain entry points shared by transports

- `readProfile`, `listRecords`, `readHistory`, `readSource` and `listOwnSubmissions`
  receive a server-resolved actor, fixed customer scope and bounded filters.
- `submitProfileCommand` performs current authority, transactional mutation and
  receipts. HTTP and tools call it; tools have a narrower action allowlist.
- `readEligibleContext` returns the current projected facts/research and exact
  revisions with generation/validUntil. It never returns the review queue.
- `ingestVerifiedResearch` is a trusted non-public entry point requiring a captured
  check bundle, source passage/digest, scope and ingest identity. 003 invokes it
  only from fixed synthetic/public fixtures and tests; discovery automation is 005.

## Errors and limits

| Status | Meaning |
| --- | --- |
| 401 | Missing/expired login; no protected payload |
| 403 | Authenticated user lacks an action on an otherwise visible resource |
| 404 | Missing/inaccessible customer, record, source or hidden revision; same envelope |
| 409 | Stale version/head, request-key mismatch, already-decided candidate or context generation changed |
| 413 | Body/payload exceeds limit |
| 422 | Invalid schema, dates, evidence scope, unsupported kind or impossible transition |
| 429 | Per-actor/customer rate bound reached; Retry-After supplied |
| 503 | Database unavailable, incompatible schema or transaction timeout; never fake saved success |

Use the existing rate-limit mechanism with 120 profile reads and 30 profile writes
per minute per active membership/customer, plus existing login/runtime limits.
No background retry can confer authority lost after the original request.

## Required contract examples

1. `panel` proposes actual product use: receipt says Pending; profile's accepted
   product-use value and assistant context remain unchanged until steward acceptance.
2. Two stewards accept different candidates against one head: one commits; the
   other receives 409 and refreshes before deciding again.
3. `partner` reads an internal source linked to a delivery fact: only an authorized
   attestation is visible; direct hidden source and its existence are withheld.
4. Identical review replay after grant/steward revocation: deny; do not replay a
   privileged result before checking the current actor.
5. User sends `origin: independent_research` or `state: accepted`: reject unknown
   fields; no trusted-origin bypass through HTTP, tools or URL ingestion.
