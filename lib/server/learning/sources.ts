import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { z } from 'zod';
import { knowledgeLineageSchema } from '../../contracts/knowledge';
import { learningLimits,learningId } from '../../contracts/learning';
import { HttpFailure,hiddenRecord } from '../../contracts/http';
import { assertExactKnowledgeLineage } from '../knowledge/policy';
import { lockOriginalHeader } from '../plans/sources';
import { originalCurrent,confirmedConflictAfterAny } from '../retrieval/fences';
import { retrievalQuality } from '../retrieval/context';
import { learningHash } from './repository';
import {lockInternalLearningActor} from './policy';
type Kind='accepted_profile'|'verified_research'|'approved_excerpt';
export type LearningOriginal={kind:Kind;revisionId:string;generation:number;digest:string;rights:Record<string,unknown>};
const queries={
 accepted_profile:`SELECT workspace_id,customer_id,revision_number AS generation,content_digest AS digest,audience,data_category,quality_input,observed_at,effective_at,review_at FROM profile_revisions WHERE id=$1`,
 verified_research:`SELECT workspace_id,customer_id,version AS generation,passage_digest AS digest,audience,rights,quality_input,observation_at,publication_at,event_at,retrieval_at FROM evidence_source_revisions WHERE id=$1`,
 approved_excerpt:`SELECT workspace_id,customer_id,lifecycle_generation AS generation,excerpt_digest AS digest,audience,data_category,original_digest,version_id,run_id,profile_revision_id FROM artifact_evidence_selections WHERE id=$1`,
};
/** Feedback and shared derivatives are never original evidence. Resolve every supporting original. */
async function collect(db:PoolClient,actor:Pick<CurrentSession,'workspaceId'|'kind'>,customerId:string,refs:readonly {sourceKind:Kind;sourceRevisionId:string}[],at:Date){
 const pending:Array<{kind:Kind;id:string}>=refs.map(ref=>({kind:ref.sourceKind,id:ref.sourceRevisionId}));
 const seen=new Map<string,LearningOriginal>();
 while(pending.length){
  const next=pending.pop()!,identity=`${next.kind}:${next.id}`;if(seen.has(identity))continue;
  const row=(await db.query(queries[next.kind],[next.id])).rows[0];
  if(!row||row.workspace_id!==actor.workspaceId||row.customer_id!==customerId||actor.kind==='partner'&&(row.audience!=='delivery'||next.kind!=='verified_research'&&row.data_category!=='delivery_context'))throw hiddenRecord();
  const {workspace_id:workspace,customer_id:customer,generation,digest,...rights}=row;
  if(next.kind!=='approved_excerpt'){
   const quality=retrievalQuality(rights.quality_input,{observationAt:(rights.observed_at??rights.observation_at) as Date|null,publicationAt:rights.publication_at as Date|null,reviewAt:rights.review_at as Date|null},at);
   const {asOf,validUntil,rationale,...assessment}=quality;rights.quality_assessment=assessment;
  }
  seen.set(identity,{kind:next.kind,revisionId:next.id,generation:Number(generation),digest,rights});
  if(seen.size>learningLimits.dependencies)throw new HttpFailure(413,'scope_too_large','Original evidence closure exceeds the limit');
  if(next.kind==='accepted_profile'){
   const links=(await db.query('SELECT source_revision_id,supporting_profile_revision_id,artifact_selection_id FROM profile_evidence_links WHERE profile_revision_id=$1',[next.id])).rows;
   for(const link of links){
    if(link.source_revision_id)pending.push({kind:'verified_research',id:link.source_revision_id});
    if(link.supporting_profile_revision_id)pending.push({kind:'accepted_profile',id:link.supporting_profile_revision_id});
    if(link.artifact_selection_id)pending.push({kind:'approved_excerpt',id:link.artifact_selection_id});
   }
  }else if(next.kind==='approved_excerpt'&&rights.profile_revision_id)pending.push({kind:'accepted_profile',id:String(rights.profile_revision_id)});
 }
 return [...seen.values()].sort((a,b)=>`${a.kind}:${a.revisionId}`.localeCompare(`${b.kind}:${b.revisionId}`));
}
/** Resolve already-authorized execution evidence to exact original headers,
 * keeping retrieval projection digests distinct from original content digests. */
export async function learningSupportingOriginals(db:PoolClient,actor:CurrentSession,customerId:string,raw:readonly unknown[]){
 await lockInternalLearningActor(db,actor,customerId);
 const refs=z.array(z.object({sourceKind:z.enum(['accepted_profile','verified_research','approved_excerpt']),sourceRevisionId:learningId}).strict()).min(1).max(20).parse(raw),at=new Date();
 const initial=await collect(db,actor,customerId,refs,at);for(const source of initial)await lockOriginalHeader(db,source.kind,source.revisionId);
 const originals=await collect(db,actor,customerId,refs,at);if(learningHash(initial)!==learningHash(originals))throw new HttpFailure(409,'source_changed','Original evidence changed');
 for(const source of originals)if(!await originalCurrent(db,{source_kind:source.kind,source_revision_id:source.revisionId,source_generation:String(source.generation),source_digest:source.digest}))throw hiddenRecord();
 if(await confirmedConflictAfterAny(db,originals.map(source=>({kind:source.kind,revisionId:source.revisionId})),new Date(0)))throw new HttpFailure(409,'source_conflict','Resolve original evidence conflicts before reuse');return originals;
}
export async function learningSourceClosure(db:PoolClient,actor:CurrentSession,customerId:string,raw:readonly unknown[]){
 const refs=z.array(knowledgeLineageSchema).min(1).max(20).parse(raw);
 if(new Set(refs.map(ref=>`${ref.sourceKind}:${ref.sourceRevisionId}`)).size!==refs.length)throw new HttpFailure(400,'invalid_input','Duplicate original');
 await assertExactKnowledgeLineage(db,actor,customerId,refs);
 const at=new Date();
 const initial=await collect(db,actor,customerId,refs,at);
 for(const source of initial)await lockOriginalHeader(db,source.kind,source.revisionId);
 const originals=await collect(db,actor,customerId,refs,at);
 if(learningHash(initial)!==learningHash(originals))throw new HttpFailure(409,'source_changed','Original evidence changed');
 for(const source of originals)if(!await originalCurrent(db,{source_kind:source.kind,source_revision_id:source.revisionId,source_generation:String(source.generation),source_digest:source.digest}))throw hiddenRecord();
 if(await confirmedConflictAfterAny(db,originals.map(source=>({kind:source.kind,revisionId:source.revisionId})),new Date(0)))throw new HttpFailure(409,'source_conflict','Resolve original evidence conflicts before reuse');
 return {originals,lineage:refs,closureDigest:learningHash({customerId,originals}),rightsDigest:learningHash({customerId,lineage:refs,originals:originals.map(({kind,revisionId,rights})=>({kind,revisionId,rights}))})};
}

import { randomUUID } from 'node:crypto';
import { getServerConfig } from '../config';
export async function persistLearningDependencies(db:PoolClient,actor:CurrentSession,customerId:string,ownerKind:'review'|'draft'|'evaluation'|'measurement'|'cohort',ownerId:string,originals:readonly LearningOriginal[]){
 if(originals.length>learningLimits.dependencies)throw new HttpFailure(413,'scope_too_large','Original evidence closure exceeds the limit');
 for(const source of originals){
  const rights=source.rights;
  const quality=source.kind==='approved_excerpt'?null:retrievalQuality(rights.quality_input,{observationAt:(rights.observed_at??rights.observation_at) as Date|null,publicationAt:rights.publication_at as Date|null,reviewAt:rights.review_at as Date|null});
  await db.query(`INSERT INTO learning_dependencies(id,environment_id,workspace_id,customer_id,owner_kind,owner_id,source_kind,source_revision_id,source_generation,source_digest,valid_until)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,ownerKind,ownerId,source.kind,source.revisionId,source.generation,source.digest,quality?.validUntil??null]);
 }
}

/** Historical independent reuse is a global header/rights check. It reads no
 * original prose and never impersonates the author or a current reviewer. */
export async function learningIndependentClosureCurrent(db:PoolClient,workspaceId:string,customerId:string,raw:readonly unknown[],closureDigest:string,rightsDigest:string){
 try{
  const refs=z.array(knowledgeLineageSchema).min(1).max(20).parse(raw),scope={workspaceId,kind:'internal' as const},at=new Date();
  const initial=await collect(db,scope,customerId,refs,at);for(const source of initial)await lockOriginalHeader(db,source.kind,source.revisionId);
  const originals=await collect(db,scope,customerId,refs,at);if(learningHash(initial)!==learningHash(originals))return false;
  if(learningHash({customerId,originals})!==closureDigest||learningHash({customerId,lineage:refs,originals:originals.map(({kind,revisionId,rights})=>({kind,revisionId,rights}))})!==rightsDigest)return false;
  for(const source of originals)if(!await originalCurrent(db,{source_kind:source.kind,source_revision_id:source.revisionId,source_generation:String(source.generation),source_digest:source.digest}))return false;
  return !await confirmedConflictAfterAny(db,originals.map(s=>({kind:s.kind,revisionId:s.revisionId})),new Date(0));
 }catch(error){if(error instanceof HttpFailure&&error.status<500||error instanceof z.ZodError)return false;throw error;}
}
