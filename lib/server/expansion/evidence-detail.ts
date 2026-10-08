import {randomUUID} from 'node:crypto';
import {resolveRetrievalCitation} from '../retrieval/citations';
import {expansionSourcesSchema} from './schema';
import { z } from 'zod';
import { expansionId } from '../../contracts/expansion';
import { hiddenRecord } from '../../contracts/http';
import { withTransaction } from '../db/client';
import { getServerConfig } from '../config';
import { lockExpansionActor, type ExpansionActor } from './policy';
import { admitExpansionRequest } from './commands';
import { readExpansionRevision } from './projection';
import { expansionEvidenceMetadata,expansionEvidenceTitle,verifyExpansionSources } from './sources';
export const expansionEvidenceDetailSchema=z.union([z.object({workloadId:expansionId.optional(),recordId:expansionId,revisionId:expansionId,sourceKey:expansionId}).strict(),
 z.object({workloadId:expansionId.optional(),citationId:expansionId}).strict()]);
/** Re-resolve a retained original instead of relying on expired retrieval receipts. */
export async function inspectExpansionEvidence(actor:ExpansionActor,customerId:string,raw:unknown){
 const input=expansionEvidenceDetailSchema.parse(raw);await admitExpansionRequest(actor,customerId,'read');return withTransaction(async db=>{
  await lockExpansionActor(db,actor,customerId);
  if('citationId' in input){
   const citation=await resolveRetrievalCitation(db,actor,input.citationId);
   const ref=expansionSourcesSchema.parse([{id:randomUUID(),kind:citation.sourceKind==='published_shared'?'shared_knowledge':citation.sourceKind,
    sourceRevisionId:citation.sourceRevisionId,generation:citation.sourceGeneration,contentDigest:citation.contentDigest,locator:citation.locators[0],citationId:input.citationId}])[0]!;
   if(!('locator' in ref))throw hiddenRecord();
   await verifyExpansionSources(db,actor,customerId,input.workloadId??null,[],[ref],true);
   return {sourceKey:ref.id,sourceKind:ref.kind,sourceRevisionId:ref.sourceRevisionId,title:await expansionEvidenceTitle(db,ref),passage:citation.text,
    locator:ref.locator,...await expansionEvidenceMetadata(db,ref)};
  }
  const owned=(await db.query(`SELECT 1 FROM expansion_revisions r JOIN expansion_hypotheses h ON h.id=r.record_id
   WHERE r.id=$1 AND h.id=$2 AND h.environment_id=$3 AND h.workspace_id=$4 AND h.customer_id=$5`,
   [input.revisionId,input.recordId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId])).rowCount;
  if(!owned)throw hiddenRecord();
  const revision=await readExpansionRevision(db,actor,customerId,input.workloadId??null,input.revisionId,true,true);
  const ref=revision.payload?.sourceRefs.find(ref=>ref.id===input.sourceKey);if(!ref||!('locator' in ref))throw hiddenRecord();
  const kind=ref.kind==='shared_knowledge'?'published_shared':ref.kind;
  const row=(await db.query(`SELECT p.passage_text FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id
   WHERE s.environment_id=$1 AND s.source_kind=$2 AND s.source_revision_id=$3 AND s.source_generation=$4 AND s.content_digest=$5
    AND s.lifecycle_state='current' AND p.locators @> $6::jsonb
    AND ((s.scope='shared' AND $2='published_shared') OR (s.scope='customer' AND s.workspace_id=$7 AND s.customer_id=$8
     AND ($9::uuid IS NULL OR s.workload_id IS NULL OR s.workload_id=$9))) ORDER BY p.ordinal LIMIT 1`,
   [getServerConfig().TURAS_ENVIRONMENT_ID,kind,ref.sourceRevisionId,ref.generation,ref.contentDigest,JSON.stringify([ref.locator]),actor.workspaceId,customerId,input.workloadId??null])).rows[0];
  if(!row?.passage_text)throw hiddenRecord();
  return {sourceKey:ref.id,sourceKind:ref.kind,sourceRevisionId:ref.sourceRevisionId,title:await expansionEvidenceTitle(db,ref),passage:row.passage_text,locator:ref.locator,...await expansionEvidenceMetadata(db,ref)};
 });
}
