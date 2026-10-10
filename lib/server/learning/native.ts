import {captureLearningEvaluationArmContext,learningEvaluationArmInputSchema} from './evaluation-context';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { learningId,learningDraftSchema } from '../../contracts/learning';
import { getServerConfig } from '../config';
import { conversationFeature } from '../conversations/feature';
import { normalizeMessageText,messageDigest } from '../conversations/dispatch';
import { learningTransaction,learningHash,learningDatabaseNow } from './repository';
import { captureLearningDraftContext } from './context';
import { assertLearningAdmission } from './schema';
import {lockInternalLearningActor,lockLearningPublisher} from './policy';

const changed=()=>new HttpFailure(409,'learning_context_changed','Prepared learning inputs changed');
async function prepared(db:PoolClient,actor:CurrentSession,conversationId:string){
 await assertLearningAdmission(db,actor.workspaceId);
 const feature=await conversationFeature(db,conversationId);
 if(feature.kind!=='learning'||feature.scope.ownerMembershipId!==actor.membershipId)throw hiddenRecord();
 if(feature.scope.purpose==='draft')await lockInternalLearningActor(db,actor,feature.scope.customerId);else await lockLearningPublisher(db,actor,feature.scope.customerId);
 const meta=(await db.query('SELECT * FROM learning_attempts WHERE binding_id=$1 AND actor_membership_id=$2',[feature.scope.bindingId,actor.membershipId])).rows[0];
 const payloads=meta?(await db.query('SELECT kind,content,content_digest FROM learning_attempt_payloads WHERE attempt_id=$1',[meta.id])).rows:[];
 if(payloads.some(p=>learningHash(p.content)!==p.content_digest))throw hiddenRecord();
 const context=payloads.find(p=>p.kind==='context')?.content,instruction=payloads.find(p=>p.kind==='instruction')?.content?.text;
 if(!meta||!context||!instruction||!['prepared','running','completed'].includes(meta.state))throw changed();
 if(feature.scope.purpose!=='draft'&&(context.input?.evaluationId!==feature.scope.evaluationId||context.input?.caseId!==feature.scope.caseId||context.input?.purpose!==feature.scope.purpose))throw hiddenRecord();
 const current=feature.scope.purpose==='draft'?await captureLearningDraftContext(db,actor,learningDraftSchema.parse(context.input)):await captureLearningEvaluationArmContext(db,actor,learningEvaluationArmInputSchema.parse(context.input));
 if('evaluation' in current&&(!['prepared','running'].includes(current.evaluation.state)||current.evaluation.deadline_at<=await learningDatabaseNow(db)))throw changed();
 if(current.fenceDigest!==context.fenceDigest)throw changed();
 return {meta,context,instruction,feature,evaluationDeadline:'evaluation' in current?current.evaluation.deadline_at as Date:null};
}
async function requireWorker(db:PoolClient){
 if(!(await db.query("SELECT 1 FROM maintenance_workers WHERE environment_id=$1 AND last_seen_at>=clock_timestamp()-interval '15 seconds' LIMIT 1",[getServerConfig().TURAS_ENVIRONMENT_ID])).rowCount)throw new HttpFailure(503,'maintenance_unavailable','Learning maintenance is unavailable');
}
export async function prepareLearningNativeAttempt(actor:CurrentSession,conversationId:string,nativeSessionId:string,requestKey:string,rawText:string,hasSelections:boolean,client?:PoolClient){
 const text=normalizeMessageText(rawText).trim();
 if(!learningId.safeParse(requestKey).success||!text||Buffer.byteLength(text)>16384)throw new HttpFailure(422,'invalid_input','Invalid learning message');
 if(hasSelections)throw new HttpFailure(422,'learning_selections_denied','Learning inputs must be explicitly prepared');
 const run=async(db:PoolClient)=>{
  const {meta,instruction}=await prepared(db,actor,conversationId);
  if(meta.native_request_id!==requestKey||normalizeMessageText(instruction).trim()!==text)throw changed();
  const conversation=(await db.query('SELECT * FROM conversations WHERE id=$1 AND owner_principal_id=$2 FOR UPDATE',[conversationId,actor.principalId])).rows[0];
  if(!conversation||conversation.eve_session_id!==nativeSessionId||conversation.binding_state!=='bound'||conversation.context_login_session_id!==actor.sessionId||conversation.context_membership_id!==actor.membershipId)throw hiddenRecord();
  if(meta.response_attempt_id){
   const prior=(await db.query('SELECT r.id,r.dispatch_state,m.request_key,m.body_digest FROM response_attempts r JOIN submitted_messages m ON m.id=r.message_id WHERE r.id=$1 AND r.conversation_id=$2 FOR UPDATE OF r',[meta.response_attempt_id,conversationId])).rows[0];
   if(!prior||prior.request_key!==requestKey||prior.body_digest!==messageDigest(text))throw changed();
   return {attemptId:prior.id as string,created:false,dispatchState:prior.dispatch_state as string};
  }
  const attempt=(await db.query('SELECT * FROM learning_attempts WHERE id=$1 FOR UPDATE',[meta.id])).rows[0];
  if(attempt.state!=='prepared'||attempt.response_attempt_id||attempt.prepared_until<=await learningDatabaseNow(db)||(await db.query('SELECT 1 FROM response_attempts WHERE conversation_id=$1',[conversationId])).rowCount)throw changed();
  await requireWorker(db);
  const messageId=randomUUID(),responseId=randomUUID(),digest=messageDigest(text);
  await db.query('INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,$5)',[messageId,conversationId,requestKey,digest,text]);
  await db.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state) VALUES($1,$2,$3,$4,'prepared','pending')",[responseId,conversationId,messageId,digest]);
  await db.query('UPDATE learning_attempts SET response_attempt_id=$2,native_session_id=$3,version=version+1 WHERE id=$1',[meta.id,responseId,nativeSessionId]);
  return {attemptId:responseId,created:true,dispatchState:'prepared'};
 };
 return client?run(client):learningTransaction(run);
}
export async function claimLearningNativeDispatch(actor:CurrentSession,conversationId:string,responseId:string,startIndex:number){
 if(!Number.isSafeInteger(startIndex)||startIndex<0)throw hiddenRecord();
 return learningTransaction(async db=>{
  const {meta,context,feature,evaluationDeadline}=await prepared(db,actor,conversationId);
  const conversation=(await db.query('SELECT * FROM conversations WHERE id=$1 AND owner_principal_id=$2 FOR UPDATE',[conversationId,actor.principalId])).rows[0];
  if(!conversation||conversation.context_login_session_id!==actor.sessionId||conversation.eve_session_id!==meta.native_session_id)throw hiddenRecord();
  await requireWorker(db);
  const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  if(meta.response_attempt_id!==responseId||meta.state!=='prepared'||meta.prepared_until<=now)throw changed();
  const deadline=new Date(Math.min(now.getTime()+120000,evaluationDeadline?.getTime()??Infinity)),validUntil=new Date(Math.min(deadline.getTime(),actor.expiresAt.getTime()));
  if(!(await db.query("UPDATE response_attempts SET dispatch_state='dispatching',dispatch_start_index=$2,dispatch_started_at=$3,deadline_at=$4,updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND conversation_id=$5 AND dispatch_state='prepared' AND response_state='pending' RETURNING id",[responseId,startIndex,now,deadline,conversationId])).rowCount)throw changed();
  if(!(await db.query("UPDATE learning_attempts SET state='running',dispatch_at=$2,deadline_at=$3,version=version+1 WHERE id=$1 AND response_attempt_id=$4 AND state='prepared' RETURNING id",[meta.id,now,deadline,responseId])).rowCount)throw changed();
  const generation=Number(conversation.context_generation);
  await db.query(`INSERT INTO context_snapshot_receipts(id,attempt_id,conversation_id,workspace_id,customer_id,owner_principal_id,login_session_id,membership_id,environment_id,audience,generation,as_of,valid_until,schema_version,snapshot_digest,citation_ids,complete,truncated,snapshot)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'internal',$10,$11,$12,'customer-context-v1',$13,'[]',true,false,$14::jsonb)`,[randomUUID(),responseId,conversationId,actor.workspaceId,feature.scope.customerId,actor.principalId,actor.sessionId,actor.membershipId,getServerConfig().TURAS_ENVIRONMENT_ID,generation,now,validUntil,learningHash(context.snapshot),JSON.stringify({contractVersion:'learning-context-retained-v1',attemptId:meta.id})]);
  await db.query('UPDATE conversations SET context_valid_until=$2 WHERE id=$1',[conversationId,validUntil]);
  await db.query('UPDATE response_attempts SET context_generation=$2,context_valid_until=$3,context_login_session_id=$4,context_membership_id=$5 WHERE id=$1',[responseId,generation,validUntil,actor.sessionId,actor.membershipId]);
  await db.query("INSERT INTO watchdog_jobs(attempt_id,deadline_at,state,next_attempt_at) VALUES($1,$2,'pending',$2)",[responseId,deadline]);
  return {dispatchStartIndex:startIndex,dispatchStartedAt:now,deadlineAt:deadline};
 });
}
