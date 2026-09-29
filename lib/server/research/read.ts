import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { retrievalQuality } from "../retrieval/context";
import { authorizeRetrievalScope, recheckRetrievalSource } from "../retrieval/policy";

export async function readResearchFindings(client: PoolClient,actor: CurrentSession,
  runId: string) {
  const run = await client.query<{ customer_id: string; workspace_id: string;
    actor_membership_id: string; conversation_id: string }>(`
    SELECT run.customer_id,run.workspace_id,run.actor_membership_id,req.conversation_id
    FROM research_runs run JOIN research_requests req ON req.id=run.request_id
    WHERE run.id=$1 AND run.environment_id=$2`,
  [runId,getServerConfig().TURAS_ENVIRONMENT_ID]);
  const row = run.rows[0];
  if (!row || row.actor_membership_id !== actor.membershipId ||
      row.workspace_id !== actor.workspaceId) throw hiddenRecord();
  const scope = await authorizeRetrievalScope(client,actor,"customer",row.customer_id);
  const found = await client.query<{ observation_id: string; canonical_url: string;
    passage_text: string; passage_digest: string; source_revision_id: string;
    title: string; quality_input: unknown; observation_at: Date | null;
    publication_at: Date | null; projection_id: string; source_generation: string;
    audience: string; content_digest: string; projection_contract: string }>(`
    SELECT o.id AS observation_id,o.canonical_url,o.passage_text,o.passage_digest,
      v.id AS source_revision_id,v.title,v.quality_input,v.observation_at,
      v.publication_at,s.id AS projection_id,s.source_generation,s.audience,
      s.content_digest,s.projection_contract
    FROM research_observations o
    JOIN research_evidence_links l ON l.observation_id=o.id AND l.linkage_state='attributed'
    JOIN evidence_source_revisions v ON v.id=l.source_revision_id
    JOIN retrieval_sources s ON s.source_revision_id=v.id
      AND s.source_kind='verified_research' AND s.lifecycle_state='current'
    WHERE o.run_id=$1 AND o.origin='independent_discovery'
      AND o.identity_checked AND o.scope_checked AND o.integrity_checked AND o.content_checked
      AND s.environment_id=$2 AND s.audience=$3
    ORDER BY o.created_at,o.id LIMIT 8`,
  [runId,getServerConfig().TURAS_ENVIRONMENT_ID,scope.audience]);
  const results = [];
  const asOf = new Date();
  for (const item of found.rows) {
    if (!await recheckRetrievalSource(client,{ id: item.projection_id,
      kind: "verified_research",revisionId: item.source_revision_id,
      generation: Number(item.source_generation),audience: item.audience,
      contentDigest: item.content_digest,
      projectionContract: item.projection_contract },scope)) continue;
    const quality = retrievalQuality(item.quality_input,{
      observationAt: item.observation_at,publicationAt: item.publication_at },asOf);
    results.push({ observationId: item.observation_id,sourceRevisionId: item.source_revision_id,
      origin: "independent_discovery" as const,canonicalUrl: item.canonical_url,
      title: item.title,verbatimPassage: item.passage_text,
      passageDigest: item.passage_digest,quality,
      caveats: quality.R < 2 ? ["Public authority requires steward review"] : [] });
  }
  if (Buffer.byteLength(JSON.stringify(results)) > 24_576) {
    throw new HttpFailure(503,"unavailable","Research findings unavailable");
  }
  return results;
}
