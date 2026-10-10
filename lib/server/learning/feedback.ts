import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { learningFeedbackSchema,learningFeedbackRevisionSchema,learningDispositionSchema,learningListSchema,learningId,serializedBytes,learningLimits,type LearningTarget } from '../../contracts/learning';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { getServerConfig } from '../config';
import { readKnowledgeCandidate } from '../knowledge/lineage';
import { learningCommand,learningRead } from './commands';
import { authorizeLearningTarget } from './targets';
import { expectLearningVersion,learningHash } from './repository';
import { lockInternalLearningActor } from './policy';
import { scheduleLearningPayloadPurge } from './retention';
type Header={id:string;author_membership_id:string;customer_id:string|null;target_kind:LearningTarget['kind'];target_id:string;target_revision_id:string;target_generation:string;target_digest:string;category:string;version:string;head_revision_id:string;disposition:string;created_at:Date};
const targetOf=(row:Header):LearningTarget=>({kind:row.target_kind,id:row.target_id,revisionId:row.target_revision_id,generation:Number(row.target_generation),digest:row.target_digest});
async function header(db:PoolClient,actor:CurrentSession,id:string,lock=false):Promise<Header>{
 learningId.parse(id);
 const row=(await db.query<Header>(`SELECT * FROM learning_feedback WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 ${lock?'FOR UPDATE':'FOR SHARE'}`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
 if(!row||actor.kind==='partner'&&row.author_membership_id!==actor.membershipId)throw hiddenRecord();
 await authorizeLearningTarget(db,actor,targetOf(row));return row;
}
async function insertRevision(db:PoolClient,actor:CurrentSession,id:string,version:number,text:string){
 const revision=randomUUID(),content={text};
 await db.query(`INSERT INTO learning_feedback_revisions(id,feedback_id,revision_number,content_digest,author_membership_id) VALUES($1,$2,$3,$4,$5)`,[revision,id,version,learningHash(content),actor.membershipId]);
 await db.query('INSERT INTO learning_feedback_payloads(revision_id,content) VALUES($1,$2)',[revision,JSON.stringify(content)]);
 return revision;
}
export async function createLearningFeedback(actor:CurrentSession,raw:unknown){
 const input=learningFeedbackSchema.parse(raw),scope=await learningRead(actor,undefined,db=>authorizeLearningTarget(db,actor,input.target,true));
 return learningCommand(actor,input,'feedback.create',{customerId:scope.customerId,authorize:async db=>{await authorizeLearningTarget(db,actor,input.target,true);}},async db=>{
  const id=randomUUID();
  await db.query(`INSERT INTO learning_feedback(id,environment_id,workspace_id,author_membership_id,customer_id,target_kind,target_id,target_revision_id,target_generation,target_digest,category)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,scope.customerId,input.target.kind,input.target.id,input.target.revisionId,input.target.generation,input.target.digest,input.category]);
  const revision=await insertRevision(db,actor,id,1,input.text);
  await db.query('UPDATE learning_feedback SET head_revision_id=$2 WHERE id=$1',[id,revision]);
  return {targetId:id,version:1};
 });
}
export async function reviseLearningFeedback(actor:CurrentSession,id:string,raw:unknown){
 const input=learningFeedbackRevisionSchema.parse(raw),scope=await learningRead(actor,undefined,db=>header(db,actor,id));
 return learningCommand(actor,{...input,feedbackId:id},'feedback.revise',{customerId:scope.customer_id,authorize:async db=>{const current=await header(db,actor,id);if(current.author_membership_id!==actor.membershipId)throw hiddenRecord();}},async db=>{
  const current=await header(db,actor,id,true);expectLearningVersion(current.version,input.expectedVersion);
  const version=input.expectedVersion+1,revision=await insertRevision(db,actor,id,version,input.text);
  await db.query('UPDATE learning_feedback SET head_revision_id=$2,version=$3 WHERE id=$1',[id,revision,version]);
  await scheduleLearningPayloadPurge(db,current.head_revision_id,'feedback','obsolete');
  return {targetId:id,version};
 });
}
export async function disposeLearningFeedback(actor:CurrentSession,id:string,raw:unknown){
 const input=learningDispositionSchema.parse(raw);
 if(actor.kind!=='internal')throw hiddenRecord();
 const scope=await learningRead(actor,undefined,db=>header(db,actor,id));
 const check=async(db:PoolClient)=>{
  await lockInternalLearningActor(db,actor,scope.customer_id??undefined);await header(db,actor,id);
  if(input.candidateRevisionId){
   const revision=(await db.query('SELECT contribution_id FROM knowledge_revisions WHERE id=$1',[input.candidateRevisionId])).rows[0];if(!revision)throw hiddenRecord();
   const candidate=await readKnowledgeCandidate(db,actor,revision.contribution_id);
   if(scope.customer_id&&candidate.customerId!==scope.customer_id)throw hiddenRecord();
   const latest=(await db.query('SELECT id FROM knowledge_revisions WHERE contribution_id=$1 AND revision_number=$2',[candidate.id,candidate.revision])).rows[0];
   if(latest?.id!==input.candidateRevisionId)throw new HttpFailure(409,'stale_version','Candidate revision changed');
  }
 };
 return learningCommand(actor,{...input,feedbackId:id},'feedback.dispose',{customerId:scope.customer_id,authorize:check},async db=>{
  const current=await header(db,actor,id,true);expectLearningVersion(current.version,input.expectedVersion);
  const disposition=randomUUID(),version=input.expectedVersion+1;
  await db.query('INSERT INTO learning_feedback_dispositions(id,feedback_id,version,actor_membership_id,state) VALUES($1,$2,$3,$4,$5)',[disposition,id,version,actor.membershipId,input.state]);
  await db.query('INSERT INTO learning_disposition_payloads(disposition_id,content) VALUES($1,$2)',[disposition,JSON.stringify({rationale:input.rationale})]);
  if(input.candidateRevisionId)await db.query('INSERT INTO learning_feedback_links(id,disposition_id,candidate_revision_id) VALUES($1,$2,$3)',[randomUUID(),disposition,input.candidateRevisionId]);
  await db.query('UPDATE learning_feedback SET disposition=$2,version=$3 WHERE id=$1',[id,input.state,version]);
  return {targetId:id,version};
 });
}
export async function readLearningFeedback(actor:CurrentSession,id:string){
 return learningRead(actor,undefined,async db=>{
  const row=await header(db,actor,id);
  const payload=(await db.query(`SELECT p.content,r.content_digest FROM learning_feedback_payloads p JOIN learning_feedback_revisions r ON r.id=p.revision_id WHERE p.revision_id=$1`,[row.head_revision_id])).rows[0];
  if(!payload||learningHash(payload.content)!==payload.content_digest)throw hiddenRecord();
  const dispositions=(await db.query(`SELECT d.id,d.state,d.created_at,p.content,l.candidate_revision_id FROM learning_feedback_dispositions d LEFT JOIN learning_disposition_payloads p ON p.disposition_id=d.id LEFT JOIN learning_feedback_links l ON l.disposition_id=d.id WHERE d.feedback_id=$1 ORDER BY d.version DESC LIMIT 21`,[id])).rows;
  const history: Array<{id:string;state:string;at:string;rationale?:string|null;candidateRevisionId?:string|null}>=dispositions.slice(0,20).map(item=>({id:item.id,state:item.state,at:item.created_at.toISOString(),...(actor.kind==='internal'?{rationale:item.content?.rationale??null,candidateRevisionId:item.candidate_revision_id??null}:{})}));
  const result={contractVersion:'learning-v1' as const,id,...(actor.kind==='internal'?{customerId:row.customer_id}:{}),target:targetOf(row),category:row.category,version:Number(row.version),text:String(payload.content.text),verification:'unverified_feedback' as const,disposition:row.disposition,canEdit:row.author_membership_id===actor.membershipId,canTriage:actor.kind==='internal',history,hasMoreHistory:dispositions.length>20};
  if(serializedBytes(result)>learningLimits.pageBytes)throw new HttpFailure(413,'response_too_large','Read a smaller history page');
  return result;
 });
}


import { learningCursor,parseLearningCursor } from './cursors';
import { learningActorGeneration } from './policy';
export async function listLearningFeedback(actor:CurrentSession,raw:unknown){
 const input=learningListSchema.parse(raw);
 return learningRead(actor,undefined,async db=>{
  const scope={environment:getServerConfig().TURAS_ENVIRONMENT_ID,workspace:actor.workspaceId,actor:actor.membershipId,session:actor.sessionId,generation:await learningActorGeneration(db,actor),search:input.search};
  const cursor=parseLearningCursor(input.cursor,scope);
  const rows=(await db.query<Header>(`SELECT f.* FROM learning_feedback f JOIN learning_feedback_payloads p ON p.revision_id=f.head_revision_id
   WHERE f.environment_id=$1 AND f.workspace_id=$2 AND ($3::boolean OR f.author_membership_id=$4)
    AND ($5::text='' OR strpos(lower(p.content->>'text'),lower($5))>0)
    AND ($6::timestamptz IS NULL OR (f.created_at,f.id)<($6::timestamptz,$7::uuid))
   ORDER BY f.created_at DESC,f.id DESC LIMIT $8`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.kind==='internal',actor.membershipId,input.search,cursor?.at??null,cursor?.id??null,input.limit+1])).rows;
  const items=[];
  for(const row of rows.slice(0,input.limit)){
   try{const target=await authorizeLearningTarget(db,actor,targetOf(row));items.push({id:row.id,target:targetOf(row),label:target.label,category:row.category,version:Number(row.version),disposition:row.disposition,createdAt:row.created_at.toISOString(),verification:'unverified_feedback' as const,...(actor.kind==='internal'?{customerId:row.customer_id}:{})});}
   catch(error){if(!(error instanceof HttpFailure)||error.status!==404)throw error;}
  }
  const last=rows.slice(0,input.limit).at(-1);
  const result={contractVersion:'learning-v1' as const,items,cursor:rows.length>input.limit&&last?learningCursor(scope,last.created_at,last.id):null};
  if(serializedBytes(result)>learningLimits.pageBytes)throw new HttpFailure(413,'response_too_large','Read a smaller learning page');return result;
 });
}

export async function authorizeLearningFeedbackReceipt(db:PoolClient,actor:CurrentSession,id:string){await header(db,actor,id);}
