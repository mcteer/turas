import {learningPublishedReuseState} from '../learning/published-reuse';
import { createHash } from "node:crypto";
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
  const marker = await client.query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment LIMIT 1");
  const artifactUnion = (marker.rows[0]?.schema_version ?? 0) >= 15 ? `
  UNION
  SELECT DISTINCT chain.root_id AS id FROM support_chain chain
  JOIN profile_evidence_links l ON l.profile_revision_id=chain.revision_id
  JOIN artifact_evidence_selections s ON s.id=l.artifact_selection_id
  JOIN artifact_versions av ON av.id=s.version_id
  JOIN artifact_extraction_runs ar ON ar.id=s.run_id
  LEFT JOIN artifact_evidence_payloads ep ON ep.selection_id=s.id
  WHERE av.state NOT IN ('ready','partial')
     OR av.lifecycle_generation<>s.lifecycle_generation
     OR av.sha256_digest<>s.original_digest
     OR ar.state<>'published'
     OR ep.selection_id IS NULL
     OR s.profile_revision_id IS DISTINCT FROM chain.revision_id` : "";
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
    AND e.event_type IN ('withdraw','supersede')
  ${artifactUnion}`,
  [ids, includeRootCurrent, ignoringConflictId]);
  return new Set(result.rows.map((row) => row.id));
}

/** Shared readers never receive these rows; this checks private lineage only. */
export async function knowledgeLineageIsCurrent(client: PoolClient, revisionId: string): Promise<boolean> {
  const lineage = await client.query<{
    source_kind: string; source_revision_id: string; source_generation: string;
    source_digest: string; workspace_id: string; customer_id: string;
    author_membership_id: string;
  }>(`SELECT l.source_kind,l.source_revision_id,l.source_generation,l.source_digest,
      c.workspace_id,c.customer_id,c.author_membership_id
    FROM knowledge_lineage l JOIN knowledge_contributions c ON c.id=l.contribution_id
    WHERE l.revision_id=$1 ORDER BY l.ordinal`, [revisionId]);
  if (lineage.rows.length < 1 || lineage.rows.length > 20) return false;
  const reuse=await learningPublishedReuseState(client,revisionId);
  if(!reuse.eligible)return false;
  if(reuse.independentRights)return true;
  const author = lineage.rows[0];
  const authority = await client.query(`SELECT 1 FROM memberships m
    JOIN principals p ON p.id=m.principal_id AND p.active
    JOIN workspaces w ON w.id=m.workspace_id AND w.active
    LEFT JOIN partner_organizations org ON org.id=m.partner_org_id
    LEFT JOIN customer_grants customer_grant ON customer_grant.membership_id=m.id
      AND customer_grant.customer_id=$2 AND customer_grant.state='active'
    WHERE m.id=$1 AND m.workspace_id=$3 AND m.active
      AND (m.kind='internal' OR (org.active AND customer_grant.id IS NOT NULL))`,
  [author.author_membership_id,author.customer_id,author.workspace_id]);
  if (!authority.rowCount) return false;
  for (const item of lineage.rows) {
    if (item.source_kind === "accepted_profile") {
      const current = await client.query(`SELECT 1 FROM profile_revisions v
        JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id
        WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
          AND v.revision_number=$4 AND v.content_digest=$5`,
      [item.source_revision_id,item.workspace_id,item.customer_id,
        item.source_generation,item.source_digest]);
      if (!current.rowCount || (await unsupportedProfileRevisionIds(client,
        [item.source_revision_id], true)).has(item.source_revision_id)) return false;
    } else if (item.source_kind === "verified_research") {
      const current = await client.query(`SELECT 1 FROM evidence_source_revisions v
        JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
        JOIN research_checks c ON c.source_revision_id=v.id
        WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
          AND v.version=$4 AND v.passage_digest=$5
          AND c.identity_result AND c.scope_result AND c.integrity_result AND c.content_result
          AND NOT EXISTS (SELECT 1 FROM evidence_source_events e
            WHERE e.source_revision_id=v.id AND e.event_type IN ('withdraw','supersede'))`,
      [item.source_revision_id,item.workspace_id,item.customer_id,
        item.source_generation,item.source_digest]);
      if (!current.rowCount) return false;
    } else return false;
  }
  return true;
}

/** Only a public-safe boolean leaves the private lineage boundary. */
export async function knowledgeLineageHasMaterialConflict(client: PoolClient,
  revisionId: string): Promise<boolean> {
  const found = await client.query(`SELECT 1 FROM knowledge_lineage lineage
    JOIN knowledge_contributions contribution ON contribution.id=lineage.contribution_id
    WHERE lineage.revision_id=$1 AND (
      EXISTS (SELECT 1 FROM evidence_conflict_targets conflict
        WHERE conflict.environment_id=contribution.environment_id
          AND conflict.state='confirmed'
          AND ((conflict.first_kind=lineage.source_kind
              AND conflict.first_revision_id=lineage.source_revision_id)
            OR (conflict.second_kind=lineage.source_kind
              AND conflict.second_revision_id=lineage.source_revision_id))
          AND (conflict.scope='shared' OR (conflict.scope='customer'
            AND conflict.workspace_id=contribution.workspace_id
            AND conflict.customer_id=contribution.customer_id)))
      OR (lineage.source_kind='accepted_profile' AND EXISTS (
        SELECT 1 FROM evidence_conflicts legacy WHERE legacy.state='confirmed'
          AND legacy.workspace_id=contribution.workspace_id
          AND legacy.customer_id=contribution.customer_id
          AND (legacy.first_revision_id=lineage.source_revision_id
            OR legacy.second_revision_id=lineage.source_revision_id))))
    LIMIT 1`,[revisionId]);
  return Boolean(found.rowCount);
}

/** Lock source versions before the profile record so review cannot race tombstones. */
export async function validateArtifactReviewSupport(client: PoolClient, revisionId: string,
  workspaceId: string, customerId: string): Promise<void> {
  const channel = await client.query<{ submission_channel: string }>(
    "SELECT submission_channel FROM profile_revisions WHERE id=$1 AND workspace_id=$2 AND customer_id=$3",
    [revisionId,workspaceId,customerId]);
  if (!channel.rows[0]) throw hiddenRecord();
  if (channel.rows[0].submission_channel !== "artifact_share") return;
  const selections = await client.query<{ id: string; version_id: string; run_id: string;
    lifecycle_generation: string; original_digest: string; excerpt_digest: string;
    profile_revision_id: string | null; audience: string; data_category: string }>(`
    SELECT s.id,s.version_id,s.run_id,s.lifecycle_generation,s.original_digest,
      s.excerpt_digest,s.profile_revision_id,s.audience,s.data_category
    FROM profile_evidence_links l JOIN artifact_evidence_selections s ON s.id=l.artifact_selection_id
    WHERE l.profile_revision_id=$1 AND l.workspace_id=$2 AND l.customer_id=$3
    ORDER BY s.version_id,s.id
  `, [revisionId,workspaceId,customerId]);
  if (channel.rows[0].submission_channel === "artifact_share" && selections.rows.length !== 1) {
    throw new HttpFailure(409, "artifact_support_changed", "Artifact support changed; reload review");
  }
  for (const selection of selections.rows) {
    const source = await client.query<{ state: string; lifecycle_generation: string;
      sha256_digest: string; run_state: string; excerpt: string | null }>(`
      SELECT v.state,v.lifecycle_generation,v.sha256_digest,r.state AS run_state,p.excerpt
      FROM artifact_versions v JOIN artifact_extraction_runs r ON r.id=$2 AND r.version_id=v.id
      LEFT JOIN artifact_evidence_payloads p ON p.selection_id=$3
      WHERE v.id=$1 AND v.workspace_id=$4 AND v.customer_id=$5 FOR UPDATE OF v
    `, [selection.version_id,selection.run_id,selection.id,workspaceId,customerId]);
    const row = source.rows[0];
    if (!row || !["ready","partial"].includes(row.state) ||
        Number(row.lifecycle_generation) !== Number(selection.lifecycle_generation) ||
        row.sha256_digest !== selection.original_digest || row.run_state !== "published" ||
        selection.profile_revision_id !== revisionId || !row.excerpt ||
        createHash("sha256").update(row.excerpt).digest("hex") !== selection.excerpt_digest) {
      throw new HttpFailure(409, "artifact_support_changed", "Artifact support changed; reload review");
    }
  }
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
