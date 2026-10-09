import {partnerEvidenceItem} from "./projection";
import {z} from "zod";
import {verifyExecutionSources} from "../execution/sources";
import {combineSharedEvidenceQuality} from "../knowledge/quality";
import type { PoolClient } from "pg";
import type { PartnerSource } from "../../contracts/partners";
import { HttpFailure } from "../../contracts/http";
import { evidenceQualitySchema } from "../../contracts/retrieval";
import { lockOriginalHeader,verifyPlanSources } from "../plans/sources";
import { originalCurrent,confirmedConflictAfter } from "../retrieval/fences";
import { retrievalQuality } from "../retrieval/context";
import { dependencyUnion,type ExpansionDependency } from "../expansion/dependencies";
import { getServerConfig } from "../config";
import { readEngagement } from "../engagements/read";
import type { PartnerActor } from "./policy";
import { partnerHash,partnerCached,cachePartnerValue } from "./repository";
import { partnerRead } from "./commands";
import { partnerPageQuery,partnerId,partnerContractVersion,partnerSourceSchema } from "../../contracts/partners";
import { partnerAuthorityDigest,readPartnerCursor,issuePartnerCursor } from "./cursors";
export type PartnerGuideScope={customerId:string;engagementId:string;acceptedRevisionId:string;baselineId:string;workloadId:string|null};
export type PartnerDependency={kind:"accepted_profile"|"approved_excerpt"|"verified_research"|"shared_knowledge";revisionId:string;generation:number;contentDigest:string};
const unavailable=()=>new HttpFailure(409,"source_unavailable","Delivery evidence is unavailable; review current originals");
const sql={
 accepted_profile:"SELECT revision_number AS generation,content_digest AS digest FROM profile_revisions WHERE id=$1",
 approved_excerpt:"SELECT lifecycle_generation AS generation,excerpt_digest AS digest FROM artifact_evidence_selections WHERE id=$1",
 verified_research:"SELECT version AS generation,passage_digest AS digest FROM evidence_source_revisions WHERE id=$1",
 shared_knowledge:"SELECT p.head_generation AS generation,r.content_digest AS digest FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id WHERE p.revision_id=$1",
};
export async function partnerSourceMetadata(db:PoolClient,ref:PartnerSource,at=new Date(ref.quality.asOf)){
 const iso=(v:unknown)=>v instanceof Date?v.toISOString():typeof v==="string"&&!Number.isNaN(Date.parse(v))?new Date(v).toISOString():null;
 if(ref.kind==="shared_knowledge"){
  const row=(await db.query("SELECT public_quality FROM knowledge_publications WHERE revision_id=$1 AND state='published'",[ref.sourceRevisionId])).rows[0];
  const quality=evidenceQualitySchema.safeParse(row?.public_quality);if(!quality.success)throw unavailable();return {quality:quality.data,observationAt:null,publicationAt:null,reviewAt:null};
 }
 if(ref.kind==="accepted_execution"){
  const row=(await db.query(`SELECT p.content,((v.event_date + time '00:00') AT TIME ZONE v.timezone) AS observation_at FROM execution_record_revisions v JOIN execution_records r ON r.id=v.record_id JOIN execution_record_payloads p ON p.revision_id=v.id WHERE v.id=$1 AND v.environment_id=$2 AND v.engagement_id=$3 AND v.audience='delivery' AND r.accepted_revision_id=v.id AND v.revision_number=$4 AND v.content_digest=$5`,[ref.sourceRevisionId,getServerConfig().TURAS_ENVIRONMENT_ID,ref.engagementId,ref.generation,ref.contentDigest])).rows[0];
  if(!row||!(row.content.kind==="activity"&&row.content.subtype==="work"||row.content.kind==="handoff"||row.content.kind==="outcome"&&row.content.status==="observed"))throw unavailable();
  const observationAt=iso(row.observation_at),own=retrievalQuality({rubricVersion:"evidence-quality-v1",R:3,D:3,C:1,reliabilityRationale:"Separately accepted delivery record",directnessRationale:"Recorded observed delivery work",corroborationRationale:"No independent corroboration inferred",informationType:"adoption_process",dateBasis:"observation"},{observationAt:new Date(observationAt!)},at);
  const quality={...combineSharedEvidenceQuality([own],at),rationale:"Separately accepted observed delivery record; original event date and current evidence govern applicability."};return {quality,observationAt,publicationAt:null,reviewAt:null};
 }
 let row;
 if(ref.kind==="verified_research")row=(await db.query("SELECT quality_input,observation_at,publication_at,NULL AS review_at FROM evidence_source_revisions WHERE id=$1",[ref.sourceRevisionId])).rows[0];
 else{const id=ref.kind==="approved_excerpt"?(await db.query("SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1",[ref.sourceRevisionId])).rows[0]?.profile_revision_id:ref.sourceRevisionId;row=(await db.query("SELECT quality_input,payload->>'observedAt' AS observation_at,payload->>'reviewAt' AS review_at FROM profile_revisions WHERE id=$1",[id])).rows[0];}
 if(!row)throw unavailable();const observationAt=iso(row.observation_at),publicationAt=iso(row.publication_at),reviewAt=iso(row.review_at);
 return {quality:retrievalQuality(row.quality_input,{observationAt:observationAt?new Date(observationAt):null,publicationAt:publicationAt?new Date(publicationAt):null,reviewAt:reviewAt?new Date(reviewAt):null},at),observationAt,publicationAt,reviewAt};
}
async function closure(db:PoolClient,actor:PartnerActor,scope:PartnerGuideScope,refs:readonly PartnerSource[]){
 const baseline=(await db.query("SELECT baseline_number,content_digest FROM milestone_baselines WHERE id=$1 AND revision_id=$2 AND engagement_id=$3 AND customer_id=$4 AND environment_id=$5 AND workspace_id=$6",[scope.baselineId,scope.acceptedRevisionId,scope.engagementId,scope.customerId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!baseline)throw unavailable();
 const expanded=await dependencyUnion(db,actor,scope.customerId,[...refs.map(r=>({kind:r.kind==="accepted_execution"?"execution_record" as const:r.kind,sourceRevisionId:r.sourceRevisionId,generation:r.generation,contentDigest:r.contentDigest,...(r.engagementId?{engagementId:r.engagementId}:{})})),{kind:"milestone_baseline",sourceRevisionId:scope.baselineId,generation:Number(baseline.baseline_number),contentDigest:baseline.content_digest,engagementId:scope.engagementId}]);
 const pending:Array<{dependency:ExpansionDependency;direct:boolean}>=expanded.map(d=>({dependency:d,direct:refs.some(r=>r.kind===d.kind&&r.sourceRevisionId===d.revisionId)})),seen=new Map<string,PartnerDependency>();
 while(pending.length){const {dependency:d,direct}=pending.pop()!;if(d.kind==="milestone_baseline"||d.kind==="execution_record")continue;
  const row=(await db.query(sql[d.kind],[d.revisionId])).rows[0];if(!row||Number(row.generation)!==d.generation)throw unavailable();
  if(!direct&&row.digest!==d.contentDigest){const projected=(await db.query("SELECT 1 FROM retrieval_sources WHERE source_kind=$1 AND source_revision_id=$2 AND source_generation=$3 AND content_digest=$4 LIMIT 1",[d.kind==="shared_knowledge"?"published_shared":d.kind,d.revisionId,d.generation,d.contentDigest])).rowCount;if(!projected)throw unavailable();}
  const next:PartnerDependency={kind:d.kind,revisionId:d.revisionId,generation:Number(row.generation),contentDigest:row.digest},key=`${d.kind}:${d.revisionId}`,previous=seen.get(key);
  if(previous){if(partnerHash(previous)!==partnerHash(next))throw unavailable();continue;}seen.set(key,next);if(seen.size>200)throw new HttpFailure(422,"scope_too_large","Narrow the original evidence closure");
  const linked:Array<{kind:PartnerDependency['kind'];id:string}>=[];
  if(d.kind==="accepted_profile")for(const r of (await db.query("SELECT source_revision_id,supporting_profile_revision_id,artifact_selection_id FROM profile_evidence_links WHERE profile_revision_id=$1",[d.revisionId])).rows){if(r.source_revision_id)linked.push({kind:"verified_research",id:r.source_revision_id});if(r.supporting_profile_revision_id)linked.push({kind:"accepted_profile",id:r.supporting_profile_revision_id});if(r.artifact_selection_id)linked.push({kind:"approved_excerpt",id:r.artifact_selection_id});}
  if(d.kind==="approved_excerpt"){const r=(await db.query("SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1",[d.revisionId])).rows[0];if(r?.profile_revision_id)linked.push({kind:"accepted_profile",id:r.profile_revision_id});}
  for(const link of linked){const original=(await db.query(sql[link.kind],[link.id])).rows[0];if(!original)throw unavailable();pending.push({dependency:{kind:link.kind,revisionId:link.id,generation:Number(original.generation),contentDigest:original.digest},direct:false});}
 }
 return [...seen.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId));
}
export async function lockPartnerSourceUnion(db:PoolClient,actor:PartnerActor,sets:readonly {scope:PartnerGuideScope;refs:readonly PartnerSource[]}[],tolerateUnavailable=false){
 const union=new Map<string,PartnerDependency>(),discovered=new Set<string>();for(const set of sets){const identity=partnerHash(set);if(discovered.has(identity))continue;discovered.add(identity);let dependencies:PartnerDependency[];try{dependencies=await closure(db,actor,set.scope,set.refs);}catch(error){if(tolerateUnavailable&&error instanceof HttpFailure&&[404,409].includes(error.status))continue;throw error;}for(const d of dependencies){const key=`${d.kind}:${d.revisionId}`,prior=union.get(key);if(prior&&partnerHash(prior)!==partnerHash(d))throw unavailable();union.set(key,d);if(union.size>200)throw new HttpFailure(422,"scope_too_large","Narrow the original evidence closure");}}
 for(const d of [...union.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId)))try{await lockOriginalHeader(db,d.kind,d.revisionId);}catch(error){if(!tolerateUnavailable||!(error instanceof HttpFailure)||error.status!==409)throw error;}
 return [...union.values()];
}
export async function partnerSourceFence(db:PoolClient,actor:PartnerActor,scope:PartnerGuideScope,refs:readonly PartnerSource[],qualityRequired=false){
 // A completed fence retains original and delivery-head locks until this
 // transaction ends. Identical citations on a page reuse that locked result,
 // never an earlier request or an expired quality assessment.
 const cacheKey="source-fence:"+partnerHash({actor:actor.membershipId,workspace:actor.workspaceId,scope,refs,qualityRequired}),cached=partnerCached<{dependencies:PartnerDependency[];digest:string;engagement:Awaited<ReturnType<typeof readEngagement>>}>(db,cacheKey);if(cached){if(refs.some(ref=>Date.parse(ref.quality.validUntil)<=Date.now()))throw unavailable();return cached;}
 const dependencies=await closure(db,actor,scope,refs);
 for(const dependency of dependencies)await lockOriginalHeader(db,dependency.kind,dependency.revisionId);
 if(partnerHash(await closure(db,actor,scope,refs))!==partnerHash(dependencies))throw unavailable();
 for(const d of dependencies){const kind=d.kind==="shared_knowledge"?"published_shared":d.kind;if(!await originalCurrent(db,{source_kind:kind,source_revision_id:d.revisionId,source_generation:String(d.generation),source_digest:d.contentDigest})||await confirmedConflictAfter(db,kind,d.revisionId,new Date(0)))throw unavailable();}
 await db.query("SELECT p.id FROM delivery_plans p JOIN engagements e ON e.plan_id=p.id WHERE e.id=$1 AND e.workspace_id=$2 FOR SHARE OF p",[scope.engagementId,actor.workspaceId]);await db.query("SELECT id FROM engagements WHERE id=$1 AND workspace_id=$2 FOR SHARE",[scope.engagementId,actor.workspaceId]);
 const engagement=await readEngagement(actor,scope.engagementId,db);if(engagement.customerId!==scope.customerId||engagement.audience!=="delivery"||engagement.acceptedRevisionId!==scope.acceptedRevisionId||engagement.activeBaselineId!==scope.baselineId||engagement.contentAvailability!=="readable"||engagement.reviewRequired)throw unavailable();
 const execution=refs.filter(r=>r.kind==="accepted_execution");if(execution.length){if(execution.some(r=>r.engagementId!==scope.engagementId))throw unavailable();await verifyExecutionSources(db,actor,scope.customerId,scope.engagementId,"delivery",execution.map(r=>({id:r.id,kind:"execution_record" as const,sourceRevisionId:r.sourceRevisionId,generation:r.generation,contentDigest:r.contentDigest})),true);}
 for(const ref of refs){
  if(ref.kind!=="accepted_execution")await verifyPlanSources(db,actor,scope.customerId,scope.workloadId,"delivery",[{id:ref.id,kind:ref.kind,sourceRevisionId:ref.sourceRevisionId,generation:ref.generation,contentDigest:ref.contentDigest,locator:ref.locator!}],false,true);
  const metadata=await partnerSourceMetadata(db,ref),provided={quality:ref.quality,observationAt:ref.observationAt,publicationAt:ref.publicationAt,reviewAt:ref.reviewAt};
  if(partnerHash(metadata)!==partnerHash(provided)||Date.parse(ref.quality.asOf)>Date.now()||[ref.observationAt,ref.publicationAt].some(v=>v&&Date.parse(v)>Date.now()))throw unavailable();
  if(Date.parse(metadata.quality.validUntil)<=Date.now())throw unavailable();
  if(qualityRequired){const q=metadata.quality;if(q.Q<60||q.D<3||Date.parse(q.validUntil)<=Date.now()||!(["Recent","Aging"].includes(q.freshness))||ref.classification==="product_evidence"&&q.freshness!=="Recent")throw unavailable();}
 }
 const result={dependencies,digest:partnerHash(dependencies),engagement};cachePartnerValue(db,cacheKey,result);return result;
}
export async function persistPartnerSources(db:PoolClient,revisionId:string,refs:readonly PartnerSource[],dependencies:readonly PartnerDependency[]){
 for(const dependency of dependencies){const ref=refs.find(r=>r.kind===dependency.kind&&r.sourceRevisionId===dependency.revisionId);await db.query(`INSERT INTO partner_source_dependencies(id,guide_revision_id,source_kind,source_revision_id,source_generation,source_digest,reference,private_lineage) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7)`,[revisionId,dependency.kind,dependency.revisionId,dependency.generation,dependency.contentDigest,ref?JSON.stringify(ref):null,!ref]);}
}
// Called only after the complete source fence, in the same transaction. Shared
// citations use the public retrieval projection, never the private lineage.
export async function partnerSourcePassages(db:PoolClient,actor:PartnerActor,scope:PartnerGuideScope,refs:readonly PartnerSource[]){
 const passages=[];
 for(const ref of refs){
  if(ref.kind==="accepted_execution"){
   const row=(await db.query(`SELECT p.content FROM execution_record_revisions v JOIN execution_records r ON r.id=v.record_id JOIN execution_record_payloads p ON p.revision_id=v.id WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4 AND v.engagement_id=$5 AND v.audience='delivery' AND r.accepted_revision_id=v.id AND v.revision_number=$6 AND v.content_digest=$7`,[ref.sourceRevisionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,scope.customerId,scope.engagementId,ref.generation,ref.contentDigest])).rows[0];if(!row)throw unavailable();passages.push({sourceId:ref.id,text:`${row.content.title}\n${row.content.narrative}`.slice(0,2000)});continue;
  }
  const row=(await db.query(`SELECT p.passage_text FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id WHERE s.environment_id=$1 AND s.source_kind=$2 AND s.source_revision_id=$3 AND s.source_generation=$4 AND s.content_digest=$5 AND s.lifecycle_state='current' AND p.locators @> $6::jsonb AND ((s.scope='shared' AND $2='published_shared') OR (s.scope='customer' AND s.workspace_id=$7 AND s.customer_id=$8 AND s.audience='delivery' AND (s.workload_id IS NULL OR s.workload_id=$9))) ORDER BY p.ordinal LIMIT 1`,[getServerConfig().TURAS_ENVIRONMENT_ID,ref.kind==="shared_knowledge"?"published_shared":ref.kind,ref.sourceRevisionId,ref.generation,ref.contentDigest,JSON.stringify([ref.locator]),actor.workspaceId,scope.customerId,scope.workloadId])).rows[0];
  if(!row)throw unavailable();passages.push({sourceId:ref.id,text:row.passage_text.slice(0,2000)});
 }
 return passages;
}
export async function listPartnerEvidence(actor:PartnerActor,raw:unknown){
 const input=partnerPageQuery.extend({customerId:partnerId,engagementId:partnerId,sourceType:z.enum(["originals","execution"]).default("originals")}).parse(raw);
 return partnerRead(actor,input.customerId,async db=>{
  const engagement=await readEngagement(actor,input.engagementId,db);if(engagement.customerId!==input.customerId||engagement.audience!=="delivery")throw unavailable();
  const scope={customerId:input.customerId,engagementId:input.engagementId,workloadId:engagement.workloadId,acceptedRevisionId:engagement.acceptedRevisionId,baselineId:engagement.activeBaselineId},scopeDigest=partnerHash({kind:"evidence",scope,sourceType:input.sourceType,limit:input.limit,search:input.search}),authority=await partnerAuthorityDigest(db,actor,input.customerId),after=await readPartnerCursor(db,actor,input.cursor,scopeDigest,authority);
  if(input.sourceType==="execution"){
   const rows=(await db.query(`SELECT v.id,v.revision_number,v.content_digest,p.content FROM execution_record_revisions v JOIN execution_records r ON r.id=v.record_id JOIN execution_record_payloads p ON p.revision_id=v.id WHERE v.environment_id=$1 AND v.workspace_id=$2 AND v.customer_id=$3 AND v.engagement_id=$4 AND v.audience='delivery' AND r.accepted_revision_id=v.id AND ((p.content->>'kind'='activity' AND p.content->>'subtype'='work') OR p.content->>'kind'='handoff' OR (p.content->>'kind'='outcome' AND p.content->>'status'='observed')) AND ($5='' OR strpos(lower((p.content->>'title')||' '||(p.content->>'narrative')),lower($5))>0) AND ($6::uuid IS NULL OR v.id>$6) ORDER BY v.id LIMIT $7`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,input.customerId,input.engagementId,input.search,after?.id??null,input.limit+1])).rows,scanned=rows.slice(0,input.limit),items=[];
   const references=scanned.map(row=>({id:row.id,kind:"accepted_execution",sourceRevisionId:row.id,generation:Number(row.revision_number),contentDigest:row.content_digest,engagementId:input.engagementId,classification:"demonstration",observationAt:null,publicationAt:null,reviewAt:null,quality:retrievalQuality(null,{})}) as PartnerSource);await lockPartnerSourceUnion(db,actor,references.map(reference=>({scope,refs:[reference]})),true);
   for(const [index,row] of scanned.entries()){const reference=references[index];try{Object.assign(reference,await partnerSourceMetadata(db,reference));await partnerSourceFence(db,actor,scope,[reference]);items.push(partnerEvidenceItem(reference,`${row.content.title}\n${row.content.narrative}`));}catch(error){if(!(error instanceof HttpFailure)||![404,409,422].includes(error.status))throw error;}}
   const hasMore=rows.length>input.limit;return {contractVersion:partnerContractVersion,items,hasMore,nextCursor:hasMore?await issuePartnerCursor(db,actor,scopeDigest,authority,{id:scanned.at(-1)!.id}):null};
  }
  const rows=(await db.query(`SELECT s.source_kind,s.source_revision_id,s.source_generation,s.content_digest,p.id,p.locators,p.passage_text FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id WHERE s.environment_id=$1 AND s.lifecycle_state='current' AND ((s.scope='shared' AND s.source_kind='published_shared') OR (s.workspace_id=$2 AND s.customer_id=$3 AND s.audience='delivery' AND (s.workload_id IS NULL OR s.workload_id=$4))) AND ($5='' OR strpos(lower(p.passage_text),lower($5))>0) AND ($6::uuid IS NULL OR p.id>$6) ORDER BY p.id LIMIT $7`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,input.customerId,engagement.workloadId,input.search,after?.id??null,input.limit+1])).rows;
  const scanned=rows.slice(0,input.limit),items=[],references=scanned.map(row=>{const kind=row.source_kind==="published_shared"?"shared_knowledge":row.source_kind;return {id:row.id,kind,sourceRevisionId:row.source_revision_id,generation:Number(row.source_generation),contentDigest:row.content_digest,locator:row.locators[0],classification:kind==="shared_knowledge"?"shared_practice":kind==="verified_research"?"product_evidence":"customer_fact",observationAt:null,publicationAt:null,reviewAt:null,quality:retrievalQuality(null,{})} as PartnerSource;});await lockPartnerSourceUnion(db,actor,references.map(reference=>({scope,refs:[reference]})),true);for(const [index,row] of scanned.entries()){
   const reference=references[index];try{Object.assign(reference,await partnerSourceMetadata(db,reference));partnerSourceSchema.parse(reference);await partnerSourceFence(db,actor,scope,[reference]);items.push(partnerEvidenceItem(reference,row.passage_text));}catch(error){if(!(error instanceof HttpFailure)||![404,409,422].includes(error.status))throw error;}
  }
  const hasMore=rows.length>input.limit,nextCursor=hasMore?await issuePartnerCursor(db,actor,scopeDigest,authority,{id:scanned.at(-1)!.id}):null;return {contractVersion:partnerContractVersion,items,hasMore,nextCursor};
 });
}
