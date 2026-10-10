import { HttpFailure } from '../../contracts/http';
import { learningId,learningListSchema } from '../../contracts/learning';
import type { CurrentSession } from '../auth/sessions';
import { learningRead } from './commands';
import { lockInternalLearningActor,learningActorGeneration } from './policy';
import { learningCursor,parseLearningCursor } from './cursors';
import { learningSourceClosure } from './sources';
import { getServerConfig } from '../config';
import { readPublishedKnowledge } from '../knowledge/read';
import {readKnowledgeCandidate} from '../knowledge/lineage';
export async function listLearningOriginals(actor:CurrentSession,customerId:string,raw:unknown){
 learningId.parse(customerId);const input=learningListSchema.parse(raw);
 return learningRead(actor,customerId,async db=>{
  await lockInternalLearningActor(db,actor,customerId);
  const scope={catalog:'originals',environment:getServerConfig().TURAS_ENVIRONMENT_ID,workspace:actor.workspaceId,actor:actor.membershipId,session:actor.sessionId,generation:await learningActorGeneration(db,actor),customerId,search:input.search};
  const cursor=parseLearningCursor(input.cursor,scope);
  const rows=(await db.query(`SELECT * FROM(
   SELECT v.id,v.created_at,'accepted_profile' AS kind,v.revision_number AS generation,v.content_digest AS digest,v.payload->>'kind' AS label FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id WHERE v.workspace_id=$1 AND v.customer_id=$2
   UNION ALL SELECT v.id,v.created_at,'verified_research',v.version,v.passage_digest,'Verified research' FROM evidence_source_revisions v JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research' WHERE v.workspace_id=$1 AND v.customer_id=$2
   ) originals WHERE ($3::timestamptz IS NULL OR(created_at,id)<($3::timestamptz,$4::uuid)) AND($5::text='' OR strpos(lower(label),lower($5))>0) ORDER BY created_at DESC,id DESC LIMIT $6`,[actor.workspaceId,customerId,cursor?.at??null,cursor?.id??null,input.search,input.limit+1])).rows;
  const items=[];
  for(const row of rows.slice(0,input.limit)){
   const source={sourceKind:row.kind as 'accepted_profile'|'verified_research',sourceRevisionId:row.id as string,sourceGeneration:Number(row.generation),sourceDigest:row.digest as string};
   try{await learningSourceClosure(db,actor,customerId,[{...source,rightsBasis:'Original selection; independent administrator reuse review required'}]);items.push({...source,label:`${row.label??'Accepted original'} · ${row.id.slice(0,8)}`});}catch(error){if(!(error instanceof HttpFailure)||error.status!==404)throw error;}
  }
  const last=rows.slice(0,input.limit).at(-1);
  return {contractVersion:'learning-v1' as const,items,cursor:rows.length>input.limit&&last?learningCursor(scope,last.created_at,last.id):null};
 });
}
export async function listLearningBaselines(actor:CurrentSession,customerId:string,raw:unknown){
 learningId.parse(customerId);const input=learningListSchema.parse(raw);
 return learningRead(actor,customerId,async db=>{
  await lockInternalLearningActor(db,actor,customerId);
  const scope={catalog:'baselines',environment:getServerConfig().TURAS_ENVIRONMENT_ID,workspace:actor.workspaceId,actor:actor.membershipId,session:actor.sessionId,generation:await learningActorGeneration(db,actor),customerId,search:input.search};
  const cursor=parseLearningCursor(input.cursor,scope);
  const rows=(await db.query(`SELECT p.id,p.contribution_id,p.published_at AS created_at FROM knowledge_publications p JOIN knowledge_contributions c ON c.id=p.contribution_id WHERE p.environment_id=$1 AND c.workspace_id=$2 AND c.customer_id=$3 AND p.state='published' AND($4::timestamptz IS NULL OR(p.published_at,p.id)<($4::timestamptz,$5::uuid)) ORDER BY p.published_at DESC,p.id DESC LIMIT $6`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,cursor?.at??null,cursor?.id??null,input.limit+1])).rows;
  const items=[];
  for(const row of rows.slice(0,input.limit))try{await readKnowledgeCandidate(db,actor,row.contribution_id);const projection=await readPublishedKnowledge(db,actor,row.id);if(!input.search||projection.payload.title.toLowerCase().includes(input.search.toLowerCase()))items.push({id:row.id as string,title:projection.payload.title});}catch(error){if(!(error instanceof HttpFailure)||error.status!==404)throw error;}
  const last=rows.slice(0,input.limit).at(-1);return {contractVersion:'learning-v1' as const,items,cursor:rows.length>input.limit&&last?learningCursor(scope,last.created_at,last.id):null};
 });
}
