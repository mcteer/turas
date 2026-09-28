import type { PoolClient } from "pg";
import type { ProfilePayload } from "../../contracts/profile-payloads";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ProfileActor } from "./policy";

export function evidenceIds(payload: ProfilePayload, separate: readonly string[] = []): string[] {
  const found = new Set<string>(separate);
  if ("evidenceRevisionIds" in payload) for (const id of payload.evidenceRevisionIds) found.add(id);
  if (payload.kind === "maturity_assessment") {
    for (const dimension of payload.dimensions) for (const id of dimension.evidenceRevisionIds) found.add(id);
  }
  return [...found];
}

export async function unsupportedProfileRevisionIds(client: PoolClient, ids: readonly string[],
  includeRootCurrent = false, ignoringConflictId: string | null = null): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const result = await client.query<{ id: string }>(`WITH RECURSIVE support_chain(root_id,revision_id,path) AS (
    SELECT id,id,ARRAY[id] FROM unnest($1::uuid[]) AS roots(id)
    UNION ALL
    SELECT chain.root_id,l.supporting_profile_revision_id,
      chain.path || l.supporting_profile_revision_id
    FROM support_chain chain JOIN profile_evidence_links l ON l.profile_revision_id=chain.revision_id
    WHERE l.supporting_profile_revision_id IS NOT NULL
      AND NOT l.supporting_profile_revision_id=ANY(chain.path)
  )
  SELECT DISTINCT chain.root_id AS id FROM support_chain chain
  JOIN profile_revisions v ON v.id=chain.revision_id
  JOIN profile_records r ON r.id=v.record_id
  WHERE (chain.revision_id<>chain.root_id OR $2::boolean)
    AND (r.current_accepted_revision_id IS DISTINCT FROM chain.revision_id
      OR EXISTS (SELECT 1 FROM evidence_conflicts c WHERE c.state='confirmed'
        AND ($3::uuid IS NULL OR c.id<>$3::uuid)
        AND (c.first_revision_id=chain.revision_id OR c.second_revision_id=chain.revision_id)))
  UNION
  SELECT DISTINCT chain.root_id AS id FROM support_chain chain
  JOIN profile_evidence_links l ON l.profile_revision_id=chain.revision_id
  JOIN evidence_source_events e ON e.source_revision_id=l.source_revision_id
    AND e.event_type IN ('withdraw','supersede')`,
  [ids, includeRootCurrent, ignoringConflictId]);
  return new Set(result.rows.map((row) => row.id));
}

export async function validateMaturityEvidenceScope(client: PoolClient, workloadId: string | null,
  links: readonly { id: string; type: "profile" | "source" }[]): Promise<void> {
  const profileIds = links.filter((link) => link.type === "profile").map((link) => link.id);
  if (!profileIds.length) return;
  const support = await client.query<{ workload_id: string | null }>(`
    SELECT r.workload_id FROM profile_revisions v
    JOIN profile_records r ON r.id=v.record_id WHERE v.id=ANY($1::uuid[])`, [profileIds]);
  if (support.rows.some((row) => row.workload_id !== null && row.workload_id !== workloadId)) {
    throw new HttpFailure(422, "maturity_scope_mismatch", "Assessment evidence belongs to another workload");
  }
}

export async function validateEvidence(client: PoolClient, actor: ProfileActor, customerId: string,
  ids: readonly string[], ignoringConflictId: string | null = null): Promise<{ id: string; type: "profile" | "source" }[]> {
  const links: { id: string; type: "profile" | "source" }[] = [];
  for (const id of ids) {
    const accepted = await client.query(`SELECT 1 FROM profile_revisions v
      JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id
      WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
        AND ($4::boolean OR (v.audience='delivery' AND v.data_category='delivery_context'))
        AND NOT EXISTS (SELECT 1 FROM evidence_conflicts c WHERE c.state='confirmed'
          AND ($5::uuid IS NULL OR c.id<>$5::uuid)
          AND (c.first_revision_id=v.id OR c.second_revision_id=v.id))`,
    [id, actor.workspaceId, customerId, actor.kind === "internal", ignoringConflictId]);
    if (accepted.rowCount) {
      const unsupported = await unsupportedProfileRevisionIds(client, [id], true, ignoringConflictId);
      if (unsupported.has(id)) throw hiddenRecord();
      links.push({ id, type: "profile" }); continue;
    }
    const research = await client.query(`SELECT 1 FROM evidence_source_revisions v
      JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
      JOIN research_checks c ON c.source_revision_id=v.id
      WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
        AND c.identity_result AND c.scope_result AND c.integrity_result AND c.content_result
        AND ($4::boolean OR v.audience='delivery')
        AND NOT EXISTS (SELECT 1 FROM evidence_source_events e
          WHERE e.source_revision_id=v.id AND e.event_type IN ('withdraw','supersede'))`,
    [id, actor.workspaceId, customerId, actor.kind === "internal"]);
    if (research.rowCount) { links.push({ id, type: "source" }); continue; }
    throw hiddenRecord();
  }
  const sourceIds = links.filter((link) => link.type === "source").map((link) => link.id);
  if (sourceIds.length > 1) {
    const sources = await client.query<{ passage_digest: string }>(`
      SELECT passage_digest FROM evidence_source_revisions WHERE id=ANY($1::uuid[])`,
    [sourceIds]);
    if (new Set(sources.rows.map((row) => row.passage_digest)).size < sources.rows.length) {
      throw new HttpFailure(422, "copied_support", "Copied passages are not independent support");
    }
  }
  return links;
}

export async function persistEvidenceLinks(client: PoolClient, actor: ProfileActor,
  customerId: string, revisionId: string, links: readonly { id: string; type: "profile" | "source" }[]): Promise<void> {
  for (const link of links) {
    await client.query(`INSERT INTO profile_evidence_links
      (id,workspace_id,customer_id,profile_revision_id,source_revision_id,supporting_profile_revision_id,
       support_role,scope_explanation)
      VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'support','Exact customer-scoped support')`,
    [actor.workspaceId, customerId, revisionId,
      link.type === "source" ? link.id : null, link.type === "profile" ? link.id : null]);
  }
}
