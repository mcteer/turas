# Data model

Existing source, passage, research reservation,
verified finding, candidate, publication and audit identities remain authoritative.

Evidence quality gains optional `guidanceRefreshAfter`: UTC timestamp or null.
It does not replace quality `validUntil`, original dates or acceptance. Missing or
invalid evidence dates produce null; current guidance requires a future deadline.
Legacy shared rows obtain the deadline from their current original-source closure.
The field is optional for backward-compatible stored quality parsing. Exact
private-original guidance deadlines are omitted from published shared quality and
MCP DTOs; the protocol receipt retains its normal effective validity contract.

Public practice current eligibility uses authoritative snapshot checked_at and
refresh_after, not duplicate library metadata. Live documentation is an observation
at check time; dated reports additionally retain their publication-age limit.

Cleanup deletes retrieval_passages (including their vectors), retaining the retired
retrieval_sources identity. Eligibility requires at least one remaining passage,
retired/tombstoned state and the existing 60-second grace period. Batches stay <=100.

## Active practice freshness (migration086)

ordinary_practice_guidance_reads stores conversation, customer-or-workspace scope,
exact snapshot ID, last consuming attempt, valid_until and nullable retired_refresh_id.
Primary key is conversation/scope/snapshot; repeated current reads renew only the
same validated source. The minimum deadline across eligible library mappings wins.
It stores no prose, source URL, customer name or private query. A 1000-row conversation
cap bounds inspection; conversation deletion removes the records. Runtime can select,
insert and update; no additional owner capability is granted.
Both migration and role setup explicitly revoke inherited table grants before
granting these operations. Restore reapplies role policy before runtime resumes.

Expired active reads block paid-step/output checks. Ordinary context refresh records
a notice, marks those dependencies historical and preserves the existing append-only
withdrawal/source ledger. Historical reads do not create these active freshness rows.
A later checked current read can renew one. Migration/grants are explicit; request
handlers only check readiness. CURRENT_SCHEMA_VERSION and manifest both advance86.

The migration backfills retained public-practice identifiers conservatively as
expired because pre086 reads did not record current/history intent. If the original
attempt has been removed, a surviving attempt from that conversation supplies the
foreign key. Conversations without surviving attempts have no resumable response
to fence. Original withdrawal identities remain untouched.

Refresh retires only the exact expired IDs it examined; a source expiring between
selection and update remains active and blocks the next check. Historical notices
persist on later model steps, including workspace-only conversations; up to five
already-consumed reference URLs help Turi find replacement evidence. The notice
requires current-response search results even when that bounded list is incomplete.
