import type { PoolClient } from "pg";
import { ZodError } from "zod";
import { hiddenRecord } from "../../contracts/http";
import { governedIdSchema } from "../../contracts/retrieval";
import { publishedKnowledgeSchema, type PublishedKnowledge } from "../../contracts/knowledge";
import type { CurrentReadActor } from "../auth/read-actor";
import { getServerConfig } from "../config";
import { knowledgeLineageHasMaterialConflict,knowledgeLineageIsCurrent } from "../profiles/eligibility";
import { authorizeRetrievalScope } from "../retrieval/policy";
import { currentFactEligible } from '../retrieval/context';
import { evidenceQualitySchema } from '../../contracts/retrieval';

export type CurrentKnowledgeHeader={id:string;revision_id:string;head_generation:string;content_digest:string;published_at:Date};
/** Bounded immutable order for MCP; browser history/pagination stays unchanged. */
export async function currentKnowledgeHeaders(client:PoolClient,actor:CurrentReadActor,afterId?:string,publicationId?:string){
  await authorizeRetrievalScope(client,actor,'shared',undefined,undefined,true);
  return (await client.query<CurrentKnowledgeHeader>(`SELECT p.id,p.revision_id,p.head_generation,r.content_digest,p.published_at
    FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id
    WHERE p.environment_id=$1 AND p.state='published' AND ($2::uuid IS NULL OR p.id>$2)
      AND ($3::uuid IS NULL OR p.id=$3) ORDER BY p.id LIMIT 101`,
    [getServerConfig().TURAS_ENVIRONMENT_ID,afterId??null,publicationId??null])).rows;
}
export async function readCurrentKnowledge(client:PoolClient,actor:CurrentReadActor,header:CurrentKnowledgeHeader){
  await authorizeRetrievalScope(client,actor,'shared',undefined,undefined,true);
  if(!await knowledgeLineageIsCurrent(client,header.revision_id,true))return null;
  const exact=(await client.query<Row>(`SELECT p.id,p.revision_id,r.revision_number,payload.payload,p.public_quality,p.published_at
    FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id
    JOIN knowledge_revision_payloads payload ON payload.revision_id=r.id
    WHERE p.id=$1 AND p.environment_id=$2 AND p.revision_id=$3 AND p.head_generation=$4
      AND r.content_digest=$5 AND p.state='published' FOR SHARE OF p`,
    [header.id,getServerConfig().TURAS_ENVIRONMENT_ID,header.revision_id,header.head_generation,header.content_digest])).rows[0];
  if(!exact)return null;
  const dto=await publicDto(client,exact),quality=evidenceQualitySchema.safeParse(exact.public_quality);
  if(dto.caveats.length || !quality.success || !currentFactEligible(quality.data))return null;
  return dto;
}

type Row = { id: string; revision_id: string; revision_number: number;
  payload: unknown; public_quality: unknown; published_at: Date };

async function publicDto(client: PoolClient,row: Row): Promise<PublishedKnowledge> {
  const conflict = await client.query(`SELECT 1 FROM evidence_conflict_targets
    WHERE environment_id=$1 AND scope='shared' AND state='confirmed'
      AND ((first_kind='published_shared' AND first_revision_id=$2) OR
        (second_kind='published_shared' AND second_revision_id=$2)) LIMIT 1`,
  [getServerConfig().TURAS_ENVIRONMENT_ID,row.revision_id]);
  const lineageConflict = await knowledgeLineageHasMaterialConflict(client,row.revision_id);
  try {
    return publishedKnowledgeSchema.parse({ version: "knowledge-v1",id: row.id,
      revision: row.revision_number,payload: row.payload,quality: row.public_quality,
      publishedAt: row.published_at.toISOString(),
      caveats: conflict.rowCount || lineageConflict ?
        ["Confirmed material conflict; do not use as settled guidance"] : [] });
  } catch (error) {
    if (error instanceof ZodError) throw hiddenRecord();
    throw error;
  }
}

export async function readPublishedKnowledge(client: PoolClient,actor: CurrentReadActor,
  id: string): Promise<PublishedKnowledge> {
  if (!governedIdSchema.safeParse(id).success) throw hiddenRecord();
  await authorizeRetrievalScope(client,actor,"shared",undefined,undefined,true);
  const result = await client.query<Row>(`SELECT p.id,p.revision_id,r.revision_number,
    payload.payload,p.public_quality,p.published_at
    FROM knowledge_publications p
    JOIN knowledge_revisions r ON r.id=p.revision_id
    JOIN knowledge_revision_payloads payload ON payload.revision_id=r.id
    WHERE p.id=$1 AND p.environment_id=$2 AND p.state='published'`,
  [id,getServerConfig().TURAS_ENVIRONMENT_ID]);
  const row = result.rows[0];
  if (!row || !await knowledgeLineageIsCurrent(client,row.revision_id)) throw hiddenRecord();
  return publicDto(client,row);
}

/** Cursor is a public publication ID, never a private source coordinate. */
export async function listPublishedKnowledge(client: PoolClient,actor: CurrentReadActor,
  limit = 20,cursor?: string): Promise<{ entries: PublishedKnowledge[]; nextCursor: string | null }> {
  await authorizeRetrievalScope(client,actor,"shared",undefined,undefined,true);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20 ||
      (cursor !== undefined && !governedIdSchema.safeParse(cursor).success)) throw hiddenRecord();
  const entries: PublishedKnowledge[] = [];
  let scanCursor = cursor ?? null;
  for (let page = 0; page < 100 && entries.length < limit; page += 1) {
    const rows = await client.query<Row>(`SELECT p.id,p.revision_id,r.revision_number,
      payload.payload,p.public_quality,p.published_at
      FROM knowledge_publications p
      JOIN knowledge_revisions r ON r.id=p.revision_id
      JOIN knowledge_revision_payloads payload ON payload.revision_id=r.id
      WHERE p.environment_id=$1 AND p.state='published'
        AND ($2::uuid IS NULL OR p.id<$2)
      ORDER BY p.id DESC LIMIT 100`,[getServerConfig().TURAS_ENVIRONMENT_ID,scanCursor]);
    if (!rows.rows.length) break;
    for (const row of rows.rows) {
      scanCursor = row.id;
      if (!await knowledgeLineageIsCurrent(client,row.revision_id)) continue;
      entries.push(await publicDto(client,row));
      if (entries.length === limit) break;
    }
    if (rows.rows.length < 100) break;
  }
  return { entries,nextCursor: entries.length === limit ? entries.at(-1)!.id : null };
}
