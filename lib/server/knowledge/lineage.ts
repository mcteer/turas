import type { PoolClient } from "pg";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { governedIdSchema } from "../../contracts/retrieval";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { assertExactKnowledgeLineage, lockKnowledgeAuthor } from "./policy";
import { knowledgeLineageSchema, sanitizedKnowledgeSchema } from "../../contracts/knowledge";
import { unsupportedProfileRevisionIds } from "../profiles/eligibility";

type CandidateRow = { id: string; customer_id: string; workspace_id: string;
  author_membership_id: string; state: string; current_revision_number: number;
  revision_id: string; content_digest: string; payload: unknown };

async function readableCandidate(client: PoolClient,actor: CurrentSession,id: string) {
  if (!governedIdSchema.safeParse(id).success) throw hiddenRecord();
  const found = await client.query<CandidateRow>(`
    SELECT c.id,c.customer_id,c.workspace_id,c.author_membership_id,c.state,
      c.current_revision_number,r.id AS revision_id,r.content_digest,p.payload
    FROM knowledge_contributions c
    JOIN knowledge_revisions r ON r.contribution_id=c.id
      AND r.revision_number=c.current_revision_number
    JOIN knowledge_revision_payloads p ON p.revision_id=r.id
    WHERE c.id=$1 AND c.environment_id=$2 AND c.workspace_id=$3`,
  [id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId]);
  const row = found.rows[0];
  if (!row || (row.author_membership_id !== actor.membershipId &&
      !(actor.kind === "internal" && actor.role === "admin"))) throw hiddenRecord();
  await lockKnowledgeAuthor(client,actor,row.customer_id);
  return row;
}

export async function readKnowledgeLineage(client: PoolClient,actor: CurrentSession,id: string) {
  const row = await readableCandidate(client,actor,id);
  const lineage = await client.query<{ source_kind: string; source_revision_id: string;
    source_generation: string; source_digest: string; rights_basis: string }>(`
    SELECT source_kind,source_revision_id,source_generation,source_digest,rights_basis
    FROM knowledge_lineage WHERE revision_id=$1 ORDER BY ordinal`,[row.revision_id]);
  const parsed = lineage.rows.map((item) => knowledgeLineageSchema.parse({
    sourceKind: item.source_kind,sourceRevisionId: item.source_revision_id,
    sourceGeneration: Number(item.source_generation),sourceDigest: item.source_digest,
    rightsBasis: item.rights_basis,
  }));
  await assertExactKnowledgeLineage(client,actor,row.customer_id,parsed);
  return parsed;
}

export async function readKnowledgeCandidate(client: PoolClient,actor: CurrentSession,id: string) {
  const row = await readableCandidate(client,actor,id);
  await readKnowledgeLineage(client,actor,id);
  const publication = await client.query<{ id: string; head_generation: string;
    state: string }>(`SELECT id,head_generation,state FROM knowledge_publications
    WHERE contribution_id=$1`,[id]);
  return { id: row.id,customerId: row.customer_id,state: row.state,
    revision: row.current_revision_number,digest: row.content_digest,
    payload: sanitizedKnowledgeSchema.parse(row.payload),
    publication: publication.rows[0] ? { id: publication.rows[0].id,
      generation: Number(publication.rows[0].head_generation),
      state: publication.rows[0].state } : null };
}

export async function listKnowledgeCandidates(client: PoolClient,actor: CurrentSession,
  limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw hiddenRecord();
  const found = await client.query<{ id: string }>(`
    SELECT id FROM knowledge_contributions WHERE environment_id=$1 AND workspace_id=$2
      AND (author_membership_id=$3 OR ($4='internal' AND $5='admin'))
    ORDER BY updated_at DESC,id DESC LIMIT 100`,
  [getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,
    actor.kind,actor.role]);
  const result = [];
  for (const row of found.rows) {
    try { result.push(await readKnowledgeCandidate(client,actor,row.id)); }
    catch (error) {
      if (!(error instanceof HttpFailure) || error.status !== 404) throw error;
    }
    if (result.length >= limit) break;
  }
  return result;
}

export async function listKnowledgeSourceOptions(client: PoolClient,actor: CurrentSession,
  customerId: string) {
  if (!governedIdSchema.safeParse(customerId).success) throw hiddenRecord();
  await lockKnowledgeAuthor(client,actor,customerId);
  const profiles = await client.query<{ id: string; revision_number: string;
    content_digest: string; payload: Record<string, unknown> }>(`
    SELECT v.id,v.revision_number,v.content_digest,v.payload
    FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id
      AND r.current_accepted_revision_id=v.id
    WHERE v.customer_id=$1 AND v.workspace_id=$2
      AND ($3='internal' OR (v.audience='delivery' AND
        v.data_category='delivery_context'))
    ORDER BY v.created_at DESC LIMIT 50`,[customerId,actor.workspaceId,actor.kind]);
  const unsupported = await unsupportedProfileRevisionIds(client,
    profiles.rows.map((row) => row.id),true);
  const options = [];
  for (const row of profiles.rows) {
    if (unsupported.has(row.id)) continue;
    try {
      await assertExactKnowledgeLineage(client,actor,customerId,[{
        sourceKind: "accepted_profile",sourceRevisionId: row.id,
        sourceGeneration: Number(row.revision_number),sourceDigest: row.content_digest,
        rightsBasis: "Source option",
      }]);
      options.push({ sourceKind: "accepted_profile" as const,sourceRevisionId: row.id,
        sourceGeneration: Number(row.revision_number),sourceDigest: row.content_digest,
        label: String(row.payload.title ?? row.payload.statement ?? row.payload.text ?? "Accepted fact")
          .slice(0,200) });
    } catch { /* Source changed or is no longer eligible for this member. */ }
  }
  return options;
}
