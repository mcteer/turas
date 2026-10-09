import type { PoolClient } from 'pg';
import type { GapSource,GapImpactContent,GapContent } from '../../contracts/product-gaps';
import { gapSourcesSchema,gapSourceSchema } from '../../contracts/product-gaps';
import { evidenceQualitySchema } from '../../contracts/retrieval';
import { HttpFailure } from '../../contracts/http';
import { getServerConfig } from '../config';
import { lockOriginalHeader,verifyPlanSources } from '../plans/sources';
import { originalCurrent,confirmedConflictAfter } from '../retrieval/fences';
import { verifyExecutionSources } from '../execution/sources';
import { retrievalQuality } from '../retrieval/context';
import { lockGapCustomers,type GapActor } from './policy';
import { gapDependencyUnion,type GapDependency } from './dependencies';
import { gapHash } from './commands';
export type GapSourceMetadata={quality:ReturnType<typeof retrievalQuality>|null;informationType:string;observationAt:string|null;publicationAt:string|null;reviewAt:string|null;futureObservation:boolean;productKey:string|null;state:string|null};
const originals=['accepted_profile','approved_excerpt','verified_research','shared_knowledge'];
export async function lockGapSourceUnion(db:PoolClient,actor:GapActor,refs:readonly GapSource[],max=200,customerIds:readonly string[]=[]){
 const closure=await gapDependencyUnion(db,actor,refs,max);
 await lockGapCustomers(db,actor,[...customerIds,...refs.flatMap(r=>r.customerId?[r.customerId]:[]),...closure.flatMap(d=>d.customerId?[d.customerId]:[])]);
 for(const d of closure)if(originals.includes(d.kind))await lockOriginalHeader(db,d.kind as 'accepted_profile'|'approved_excerpt'|'verified_research'|'shared_knowledge',d.revisionId);
 const recheck=await gapDependencyUnion(db,actor,refs,max);if(gapHash(closure)!==gapHash(recheck))throw new HttpFailure(409,'source_unavailable','Original evidence changed');
 // Acquire every execution suffix only after the complete original union.
 for(const ref of [...refs].filter(r=>!r.locator).sort((a,b)=>(a.engagementId??'').localeCompare(b.engagementId??'')||a.sourceRevisionId.localeCompare(b.sourceRevisionId))){
  await verifyExecutionSources(db,actor,ref.customerId!,ref.engagementId!,'internal',[{id:ref.id,kind:ref.kind as 'execution_record'|'milestone_baseline',sourceRevisionId:ref.sourceRevisionId,generation:ref.generation,contentDigest:ref.contentDigest}],true,true);
 }
 return closure;
}
export async function verifyGapSources(db:PoolClient,actor:GapActor,refs:readonly GapSource[],options:{lock?:boolean;max?:number;alreadyLocked?:boolean}={}){
 for(const ref of refs)gapSourceSchema.parse(ref);const max=options.max??200;
 const closure=options.lock?await lockGapSourceUnion(db,actor,refs,max):await gapDependencyUnion(db,actor,refs,max);
 if(!options.lock&&!options.alreadyLocked)await lockGapCustomers(db,actor,refs.flatMap(r=>r.customerId?[r.customerId]:[]));
 for(const d of closure){if(!originals.includes(d.kind))continue;const kind=d.kind==='shared_knowledge'?'published_shared':d.kind;
  if(!await originalCurrent(db,{source_kind:kind,source_revision_id:d.revisionId,source_generation:String(d.generation),source_digest:d.contentDigest})||await confirmedConflictAfter(db,kind,d.revisionId,new Date(0)))throw new HttpFailure(409,'source_unavailable','Original evidence changed');}
 const seen=new Set<string>();
 for(const ref of [...refs].sort((a,b)=>a.kind.localeCompare(b.kind)||a.sourceRevisionId.localeCompare(b.sourceRevisionId))){const key=`${ref.kind}:${ref.sourceRevisionId}:${ref.customerId}`;if(seen.has(key))continue;seen.add(key);
  if(ref.locator){const kind=ref.kind==='shared_knowledge'?'published_shared':ref.kind;
   const rows=(await db.query(`SELECT DISTINCT workload_id FROM retrieval_sources WHERE environment_id=$1 AND source_kind=$2 AND source_revision_id=$3 AND lifecycle_state='current' AND ((scope='shared' AND $2='published_shared') OR (workspace_id=$4 AND customer_id=$5))`,[getServerConfig().TURAS_ENVIRONMENT_ID,kind,ref.sourceRevisionId,actor.workspaceId,ref.customerId])).rows;
   if(rows.length!==1)throw new HttpFailure(409,'source_unavailable','Original evidence unavailable');
   await verifyPlanSources(db,actor,ref.customerId??actor.workspaceId,rows[0].workload_id,'internal',[{id:ref.id,kind:ref.kind as 'accepted_profile'|'approved_excerpt'|'verified_research'|'shared_knowledge',sourceRevisionId:ref.sourceRevisionId,generation:ref.generation,contentDigest:ref.contentDigest,locator:ref.locator}],false,true);
   if(ref.kind==='shared_knowledge'){const m=await gapSourceMetadata(db,ref);if(!m.quality||Date.parse(m.quality.validUntil)<=Date.now())throw new HttpFailure(409,'source_unavailable','Shared evidence assessment expired');}
  }
 }
 // All originals across all customers are already locked before the execution suffix.
 for(const ref of [...refs].filter(r=>!r.locator).sort((a,b)=>(a.engagementId??'').localeCompare(b.engagementId??'')||a.sourceRevisionId.localeCompare(b.sourceRevisionId))){await verifyExecutionSources(db,actor,ref.customerId!,ref.engagementId!,'internal',[{id:ref.id,kind:ref.kind as 'execution_record'|'milestone_baseline',sourceRevisionId:ref.sourceRevisionId,generation:ref.generation,contentDigest:ref.contentDigest}],Boolean(options.lock),true);}
 return {dependencies:closure,digest:gapHash(closure)};
}
export async function gapSourceMetadata(db:PoolClient,ref:GapSource,at=new Date()):Promise<GapSourceMetadata>{
 const iso=(v:unknown)=>v instanceof Date?v.toISOString():typeof v==='string'&&!Number.isNaN(Date.parse(v))?new Date(v).toISOString():null;
 if(ref.kind==='shared_knowledge'){const row=(await db.query("SELECT public_quality FROM knowledge_publications WHERE revision_id=$1 AND state='published'",[ref.sourceRevisionId])).rows[0];const q=evidenceQualitySchema.safeParse(row?.public_quality);return {quality:q.success?q.data:null,informationType:'product_capability',observationAt:null,publicationAt:null,reviewAt:null,futureObservation:false,productKey:null,state:null};}
 if(!ref.locator)return {quality:null,informationType:'unknown',observationAt:null,publicationAt:null,reviewAt:null,futureObservation:false,productKey:null,state:null};
 let row;
 if(ref.kind==='verified_research')row=(await db.query('SELECT quality_input,observation_at,publication_at,NULL AS review_at FROM evidence_source_revisions WHERE id=$1',[ref.sourceRevisionId])).rows[0];
 else {const id=ref.kind==='approved_excerpt'?(await db.query('SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1',[ref.sourceRevisionId])).rows[0]?.profile_revision_id:ref.sourceRevisionId;row=(await db.query("SELECT quality_input,payload->>'productKey' AS product_key,payload->>'state' AS profile_state,payload->>'observedAt' AS observation_at,payload->>'reviewAt' AS review_at FROM profile_revisions WHERE id=$1",[id])).rows[0];}
 if(!row)throw new HttpFailure(409,'source_unavailable','Original quality metadata unavailable');
 const observationAt=iso(row.observation_at),publicationAt=iso(row.publication_at),reviewAt=iso(row.review_at);
 return {quality:retrievalQuality(row.quality_input,{observationAt:observationAt?new Date(observationAt):null,publicationAt:publicationAt?new Date(publicationAt):null,reviewAt:reviewAt?new Date(reviewAt):null},at),informationType:row.quality_input?.informationType??'unknown',observationAt,publicationAt,reviewAt,futureObservation:Boolean((observationAt&&Date.parse(observationAt)>at.getTime())||(publicationAt&&Date.parse(publicationAt)>at.getTime())),productKey:row.product_key??null,state:row.profile_state??null};
}
export async function gapConfirmationChecks(db:PoolClient,actor:GapActor,customerId:string,content:GapImpactContent,gap:GapContent,refs:readonly GapSource[],gapRefs:readonly GapSource[],at=new Date()){
 if(content.classification==='suspected')return;
 if(!content.observedAt||Date.parse(content.observedAt)>at.getTime()||gap.productKey==='unknown')throw new HttpFailure(409,'source_unavailable','Confirmation needs known date and product context');
 const purposes=content.classification==='resolved'?['resolution']:['customer_need','product_limitation'];
 for(const purpose of purposes){const selected=[...refs,...(purpose==='product_limitation'?gapRefs:[])].filter(r=>r.purpose===purpose);
  if(!selected.length)throw new HttpFailure(409,'source_unavailable','Critical original evidence required');
  for(const ref of selected){if(!ref.locator||purpose!=='product_limitation'&&(!['accepted_profile','approved_excerpt'].includes(ref.kind)||ref.customerId!==customerId))throw new HttpFailure(409,'source_unavailable','Accepted customer-specific evidence required');
   const m=await gapSourceMetadata(db,ref,at),q=m.quality,product=purpose==='product_limitation';if(product&&m.productKey&&m.productKey!==gap.productKey||purpose==='customer_need'&&m.state&&m.state!=='actual')throw new HttpFailure(409,'source_unavailable','Evidence does not establish applicable product context or actual customer impact');if(!q||q.Q<60||q.R<2||q.D<(product?4:3)||!['Recent','Aging'].includes(q.freshness)||product&&(q.freshness!=='Recent'||!['product_capability','product_availability'].includes(m.informationType))||Date.parse(q.validUntil)<=at.getTime()||m.futureObservation)throw new HttpFailure(409,'source_unavailable','Critical evidence is weak, stale, undated or unavailable');
  }
 }
 // Customer impact can only be accepted through explicit original assertions.
 if(!content.assertions.some(a=>a.classification==='accepted_fact'&&a.sourceKeys.some(k=>refs.some(r=>r.id===k&&r.purpose===(content.classification==='resolved'?'resolution':'customer_need')))))throw new HttpFailure(409,'source_unavailable','Accepted impact assertion required');
}
export async function readGapSourcePassages(db:PoolClient,actor:GapActor,refs:readonly GapSource[],at=new Date()){const result=[];for(const ref of refs){if(!ref.locator){result.push({reference:ref,text:'Reviewed execution/baseline evidence; consult the authorized original',metadata:await gapSourceMetadata(db,ref,at)});continue;}const row=(await db.query(`SELECT p.passage_text FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id WHERE s.environment_id=$1 AND s.source_kind=$2 AND s.source_revision_id=$3 AND s.source_generation=$4 AND s.content_digest=$5 AND s.lifecycle_state='current' AND p.locators @> $6::jsonb AND ((s.scope='shared' AND $2='published_shared') OR (s.workspace_id=$7 AND s.customer_id=$8)) ORDER BY p.ordinal LIMIT 1`,[getServerConfig().TURAS_ENVIRONMENT_ID,ref.kind==='shared_knowledge'?'published_shared':ref.kind,ref.sourceRevisionId,ref.generation,ref.contentDigest,JSON.stringify([ref.locator]),actor.workspaceId,ref.customerId])).rows[0];if(!row)throw new HttpFailure(409,'source_unavailable','Original passage unavailable');result.push({reference:ref,text:String(row.passage_text),metadata:await gapSourceMetadata(db,ref,at)});}return result;}
export async function persistGapDependencies(db:PoolClient,revisionId:string,refs:readonly GapSource[],dependencies:readonly GapDependency[]){for(const d of dependencies){const ref=refs.find(r=>r.kind===d.kind&&r.sourceRevisionId===d.revisionId);await db.query('INSERT INTO gap_source_dependencies(id,revision_id,customer_id,source_kind,source_revision_id,source_generation,source_digest,reference) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7)',[revisionId,ref?.customerId??d.customerId??null,d.kind,d.revisionId,d.generation,d.contentDigest,JSON.stringify(ref??{kind:d.kind,sourceRevisionId:d.revisionId,generation:d.generation,contentDigest:d.contentDigest,...(d.engagementId?{engagementId:d.engagementId}:{})})]);}}

/** Request-local reuse only for identical original references under the held
 * whole-operation source fence. A different transaction always fails closed. */
export async function createFencedGapVerifier(db:PoolClient,actor:GapActor){const environment=getServerConfig().TURAS_ENVIRONMENT_ID,transaction=(await db.query('SELECT pg_current_xact_id()::text AS id')).rows[0].id,cache=new Map<string,Awaited<ReturnType<typeof verifyGapSources>>>();return async(refs:readonly GapSource[])=>{if(getServerConfig().TURAS_ENVIRONMENT_ID!==environment||(await db.query('SELECT pg_current_xact_id()::text AS id')).rows[0].id!==transaction)throw new HttpFailure(409,'source_unavailable','Source fence transaction changed');if(refs.some(r=>!r.locator))return verifyGapSources(db,actor,refs,{alreadyLocked:true});const key=gapHash(refs);let verified=cache.get(key);if(!verified){verified=await verifyGapSources(db,actor,refs,{alreadyLocked:true});cache.set(key,verified);}for(const ref of refs)if(ref.kind==='shared_knowledge'){const metadata=await gapSourceMetadata(db,ref);if(!metadata.quality||Date.parse(metadata.quality.validUntil)<=Date.now())throw new HttpFailure(409,'source_unavailable','Shared evidence assessment expired');}return verified;};}
