import {expansionRetainedPayloadSchema,expansionWorkspaceProjectionSchema,expansionOutput} from './projection-schema';
import {decodeExpansionCursor,encodeExpansionCursor} from './cursor';
import {rankExpansion,compareExpansionRanking,expansionRankingVersion} from '../../expansion/ranking';
import {canonicalExpansionProduct} from '../../expansion/products';
import {expansionQualificationChecks} from './sources';
import {expansionAllowedDecisions} from '../../expansion/decisions';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {expansionHypothesisSchema,type ExpansionHypothesis} from '../../contracts/expansion';
import {expansionListSchema,expansionSourcesSchema,expansionEngagementsSchema,expansionLinksSchema,type ExpansionSource,type ExpansionLink} from './schema';
import {lockExpansionActor,expansionAssignment,isExpansionOwnerAdministrator,type ExpansionActor} from './policy';
import {expansionScope} from './repository';
import {getServerConfig} from '../config';
import {withTransaction} from '../db/client';
import {admitExpansionRequest,expansionHash} from './commands';
import {verifyExpansionSources} from './sources';
import type {PoolClient} from 'pg';
export type ExpansionPayload={content:ExpansionHypothesis;sourceRefs:ExpansionSource[];selectedEngagementIds:string[];deliveryLinks:ExpansionLink[]};
export function parseExpansionPayload(raw:unknown):ExpansionPayload{
 const {duplicateAcknowledgement:_,...value}=expansionRetainedPayloadSchema.parse(raw);return value;
}
export async function readExpansionRevision(db:PoolClient,actor:ExpansionActor,customerId:string,workloadId:string|null,revisionId:string|null,lockSources=true,authorityLocked=false){
 if(!authorityLocked)await lockExpansionActor(db,actor,customerId);
 if(!revisionId)return {availability:'missing' as const,payload:null};
 const row=(await db.query('SELECT p.content,p.invalidate_at,p.purge_at,r.source_digest,r.content_digest FROM expansion_revisions r LEFT JOIN expansion_payloads p ON p.revision_id=r.id JOIN expansion_scopes s ON s.id=r.scope_id WHERE r.id=$1 AND s.workspace_id=$2 AND s.customer_id=$3 AND s.workload_id IS NOT DISTINCT FROM $4::uuid AND s.environment_id=$5',[revisionId,actor.workspaceId,customerId,workloadId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 if(!row)throw hiddenRecord();
 if(!row.content)return {availability:'purged' as const,payload:null};if(row.invalidate_at||row.purge_at&&new Date(row.purge_at).getTime()<=Date.now())return {availability:'changed' as const,payload:null};
 let payload:ExpansionPayload;
 try{payload=parseExpansionPayload(row.content);}catch{return {availability:'changed' as const,payload:null};}
 if(expansionHash(payload.content)!==row.content_digest)return {availability:'changed' as const,payload:null};
 try{const verified=await verifyExpansionSources(db,actor,customerId,workloadId,payload.selectedEngagementIds,payload.sourceRefs,lockSources,payload.deliveryLinks);if(verified.digest!==row.source_digest)return {availability:'changed' as const,payload:null};}
 catch(error){if(error instanceof HttpFailure&&[404,409,422].includes(error.status))return {availability:'changed' as const,payload:null};throw error;}
 return {availability:'eligible' as const,payload};
}
export async function readExpansionWorkspace(actor:ExpansionActor,customerId:string,raw:unknown){
 const input=expansionListSchema.parse(raw);await admitExpansionRequest(actor,customerId,'read');return withTransaction(async db=>{
  await lockExpansionActor(db,actor,customerId);
  const workloadId=input.workloadId??null,scope=await expansionScope(db,actor,customerId,workloadId),assignment=await expansionAssignment(db,actor,customerId);
  const listBinding=expansionHash({env:getServerConfig().TURAS_ENVIRONMENT_ID,actor:actor.membershipId,session:actor.sessionId,customerId,workloadId,disposition:input.disposition??'active',limit:input.limit,rankingVersion:expansionRankingVersion});
  const rows=scope?(await db.query(`SELECT h.*,d.assignment_version,d.created_at AS decision_at,d.action,d.reviewer_membership_id,d.rationale_digest,d.revisit_date::text AS revisit_date,principal.login_name AS reviewer_name,decision_payload.content AS decision_content,decision_payload.invalidate_at AS decision_invalid_at,decision_payload.purge_at AS decision_purge_at FROM expansion_hypotheses h LEFT JOIN expansion_decisions d ON d.id=h.last_decision_id LEFT JOIN memberships reviewer ON reviewer.id=d.reviewer_membership_id LEFT JOIN principals principal ON principal.id=reviewer.principal_id LEFT JOIN expansion_payloads decision_payload ON decision_payload.decision_id=d.id WHERE h.scope_id=$1 AND ($2::uuid IS NULL OR h.id=$2) AND ($3::text IS NOT NULL AND h.disposition=$3 OR $3::text IS NULL AND ($2::uuid IS NOT NULL OR h.disposition IN ('proposed','qualified'))) ORDER BY h.id`,[scope.id,input.recordId??null,input.disposition??null])).rows:[];
  if(input.recordId&&!rows.length)throw hiddenRecord();
  const records=[];
  for(const row of rows){
   const working=await readExpansionRevision(db,actor,customerId,workloadId,row.working_revision_id,true,true),decided=row.decided_revision_id===row.working_revision_id?working:await readExpansionRevision(db,actor,customerId,workloadId,row.decided_revision_id,true,true);
   const reviewReasons=[];if(!assignment.active)reviewReasons.push('Account owner unassigned or inactive');
   if(row.disposition==='qualified'&&Number(row.assignment_version)!==assignment.version)reviewReasons.push('Account owner changed');
   if(row.disposition==='qualified'&&row.working_revision_id!==row.decided_revision_id)reviewReasons.push('Proposed changes require review');
   if(working.availability!=='eligible')reviewReasons.push('Evidence changed or content unavailable');
   if(working.payload&&working.payload.content.nextReviewDate<new Date().toISOString().slice(0,10))reviewReasons.push('Next review overdue');
   if(row.disposition==='deferred'&&row.revisit_date&&row.revisit_date<=new Date().toISOString().slice(0,10))reviewReasons.push('Deferred revisit due');
   const identity=canonicalExpansionProduct(row.product_key);if(identity.retired||identity.key!==row.product_key)reviewReasons.push('Product identity requires current review');
   const qualification=working.payload?await expansionQualificationChecks(db,actor,customerId,workloadId,working.payload.content,working.payload.sourceRefs):null;
   if(qualification?.staleCriticalEvidence)reviewReasons.push('Stale or undated critical evidence');
   if(row.disposition==='qualified'&&qualification?.missing.length)reviewReasons.push('Qualification evidence requires review');
   const ranking=rankExpansion({id:row.id,createdAt:new Date(row.created_at).toISOString(),disposition:row.disposition,reviewRequired:reviewReasons.length>0,content:working.payload?.content??null,qualificationSupported:qualification?.missing.length===0,revisitDate:row.revisit_date??null,decisionAt:row.decision_at?new Date(row.decision_at).toISOString():null});
   let history:null|{revisions:{id:string;ordinal:number;createdAt:string;contentRetained:boolean}[];nextCursor:string|null;selected:Awaited<ReturnType<typeof readExpansionRevision>>|null}=null;
   if(input.recordId){
    const binding=expansionHash({env:getServerConfig().TURAS_ENVIRONMENT_ID,actor:actor.membershipId,session:actor.sessionId,customerId,workloadId,recordId:row.id,revisionId:input.revisionId??null,limit:input.limit});
    const generation=expansionHash({scope:scope?.generation,assignment,recordVersion:Number(row.version)});
    const cursor=input.cursor?decodeExpansionCursor(input.cursor,binding,'history',generation):null,offset=cursor?.offset??0,asOf=cursor?.asOf??Date.now();
    const revisions=(await db.query(`SELECT r.id,r.revision_number,r.created_at,(p.id IS NOT NULL) AS content_retained
     FROM expansion_revisions r LEFT JOIN expansion_payloads p ON p.revision_id=r.id WHERE r.record_id=$1 ORDER BY r.revision_number DESC,r.id LIMIT $2 OFFSET $3`,[row.id,input.limit+1,offset])).rows;
    if(input.revisionId&&!(await db.query('SELECT 1 FROM expansion_revisions WHERE id=$1 AND record_id=$2',[input.revisionId,row.id])).rowCount)throw hiddenRecord();
    history={revisions:revisions.slice(0,input.limit).map(item=>({id:item.id,ordinal:Number(item.revision_number),createdAt:new Date(item.created_at).toISOString(),contentRetained:item.content_retained===true})),
     nextCursor:revisions.length>input.limit?encodeExpansionCursor({binding,generation,kind:'history',offset:offset+input.limit,asOf}):null,
     selected:input.revisionId?await readExpansionRevision(db,actor,customerId,workloadId,input.revisionId,true,true):null};
   }
   const rationale=row.decision_content?.rationale;
   const retainedRationale=decided.availability==='eligible'&&!row.decision_invalid_at&&(!row.decision_purge_at||new Date(row.decision_purge_at).getTime()>Date.now())&&typeof rationale==='string'&&rationale.length>0&&rationale.length<=2000&&expansionHash(rationale)===row.rationale_digest?rationale:null;
   const lastDecision=row.last_decision_id?{id:row.last_decision_id,action:row.action,reviewerMembershipId:row.reviewer_membership_id,reviewerName:row.reviewer_name,assignmentVersion:Number(row.assignment_version),createdAt:new Date(row.decision_at).toISOString(),revisitDate:row.revisit_date??null,rationale:retainedRationale}:null;
   records.push({ranking,history,lastDecision,id:row.id,version:Number(row.version),workingRevisionId:row.working_revision_id,decidedRevisionId:row.decided_revision_id,disposition:row.disposition,createdAt:new Date(row.created_at).toISOString(),working,decided,reviewRequired:reviewReasons.length>0,reviewReasons,allowedActions:assignment.active&&assignment.membershipId===actor.membershipId?expansionAllowedDecisions(row.disposition):[]});
  }
  let nextCursor:string|null=null;
  let visibleRecords=records;
  if(!input.recordId){
   records.sort((a,b)=>compareExpansionRanking(a.ranking,b.ranking));
   const generation=expansionHash({scope:scope?.generation??0,assignment,records:records.map(record=>({id:record.id,version:record.version,ranking:record.ranking,reviewReasons:record.reviewReasons,availability:record.working.availability}))});
   const cursor=input.cursor?decodeExpansionCursor(input.cursor,listBinding,'list',generation):null,offset=cursor?.offset??0,asOf=cursor?.asOf??Date.now();
   visibleRecords=records.slice(offset,offset+input.limit);
   if(offset+input.limit<records.length)nextCursor=encodeExpansionCursor({binding:listBinding,generation,kind:'list',offset:offset+input.limit,asOf});
  }
  const customer=(await db.query('SELECT display_name FROM customer_references WHERE id=$1 AND workspace_id=$2',[customerId,actor.workspaceId])).rows[0];
  const workloads=(await db.query("SELECT id,display_name AS name FROM customer_workloads WHERE customer_id=$1 AND workspace_id=$2 AND lifecycle='active' ORDER BY display_name,id",[customerId,actor.workspaceId])).rows;
  const owners=(await db.query("SELECT m.id,p.login_name AS name FROM memberships m JOIN principals p ON p.id=m.principal_id WHERE m.workspace_id=$1 AND m.kind='internal' AND m.active AND p.active ORDER BY p.login_name,m.id",[actor.workspaceId])).rows;
  if(workloads.length>100||owners.length>100)throw new HttpFailure(422,'scope_too_large','Narrow the available expansion scope');
  return expansionOutput(expansionWorkspaceProjectionSchema,{commandNamespace:expansionHash({environment:getServerConfig().TURAS_ENVIRONMENT_ID,workspace:actor.workspaceId,member:actor.membershipId,customerId}),receiptNamespace:expansionHash({environment:getServerConfig().TURAS_ENVIRONMENT_ID,workspace:actor.workspaceId,member:actor.membershipId,customerId,workloadId}),metadata:{customerName:customer.display_name as string,workloads:workloads as {id:string;name:string}[],owners:owners as {id:string;name:string}[]},contractVersion:'expansion-v1' as const,customerId,workloadId,scopeGeneration:scope?.generation??0,assignment,canManageOwner:isExpansionOwnerAdministrator(actor),records:visibleRecords,nextCursor});
 });
}
