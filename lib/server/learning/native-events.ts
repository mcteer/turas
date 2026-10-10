import {advanceLearningEvaluation} from './evaluation';
import {z} from 'zod';
import type { PoolClient } from 'pg';
import type { NativeEvent } from '../conversations/projection';
import { getServerConfig } from '../config';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { learningDraftOutputSchema,learningArmOutputSchema,serializedBytes } from '../../contracts/learning';
import { learningHash } from './repository';
import { boundLearningActor } from './tool-actor';
import { messageDigest } from '../conversations/dispatch';
import { scheduleLearningPayloadPurge } from './retention';
import { enqueueLearningRetirement } from './invalidation';
export type LearningNativeProjection={learning:true;usage?:undefined};

/** Learning prose lives only in purgeable private attempt payloads. Native
 * projections retain bounded event identity, never prompt or assistant text. */
export async function projectLearningNativeEventInTransaction(db:PoolClient,nativeSessionId:string,responseId:string,event:NativeEvent,streamIndex?:number):Promise<false|LearningNativeProjection>{
 const row=(await db.query(`SELECT c.id,c.owner_principal_id,a.id AS attempt_id,a.state FROM conversations c JOIN response_attempts r ON r.conversation_id=c.id JOIN learning_attempts a ON a.response_attempt_id=r.id
  WHERE r.id=$1 AND c.eve_session_id=$2 AND c.environment_id=$3 AND a.environment_id=c.environment_id AND c.binding_state='bound'`,[responseId,nativeSessionId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 if(!row)return false;
 if(serializedBytes(event)>262144)throw hiddenRecord();
 const data=event.data??{};
 if(!event.meta.id||!/^evt_[A-Za-z0-9_-]+$/.test(event.meta.id)||!Number.isFinite(Date.parse(event.meta.at??''))||typeof data.turnId!=='string'||!data.turnId||data.turnId.length>200||streamIndex!==undefined&&(!Number.isSafeInteger(streamIndex)||streamIndex<0))throw hiddenRecord();
 await db.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[row.id]);
 const response=(await db.query('SELECT * FROM response_attempts WHERE id=$1 AND conversation_id=$2 FOR UPDATE',[responseId,row.id])).rows[0];
 const attempt=(await db.query('SELECT * FROM learning_attempts WHERE id=$1 FOR UPDATE',[row.attempt_id])).rows[0];
 if(!response||!attempt||!['dispatching','admitted','uncertain'].includes(response.dispatch_state))throw hiddenRecord();
 if(event.type==='message.received'){
  if(typeof data.message!=='string'||messageDigest(data.message)!==response.input_digest||response.input_event_id&&response.input_event_id!==event.meta.id||response.native_turn_id&&response.native_turn_id!==data.turnId)throw hiddenRecord();
 }else if(!response.input_event_id||response.native_turn_id!==data.turnId)throw hiddenRecord();
 const eventDigest=learningHash({event,streamIndex:streamIndex??null});
 await db.query(`INSERT INTO learning_native_event_receipts(native_event_id,attempt_id,environment_id,workspace_id,content_digest)
  SELECT $1,id,environment_id,workspace_id,$3 FROM learning_attempts WHERE id=$2 ON CONFLICT(native_event_id) DO NOTHING`,[event.meta.id,attempt.id,eventDigest]);
 const eventReceipt=(await db.query('SELECT attempt_id,content_digest FROM learning_native_event_receipts WHERE native_event_id=$1',[event.meta.id])).rows[0];
 if(eventReceipt?.attempt_id!==attempt.id||eventReceipt.content_digest!==eventDigest)throw hiddenRecord();
 const inserted=await db.query(`INSERT INTO event_projections(native_event_id,conversation_id,native_session_id,stream_index,event_type,turn_id,step_index,visible_payload,emitted_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,'{}',$8) ON CONFLICT(native_event_id) DO NOTHING RETURNING native_event_id`,[event.meta.id,row.id,nativeSessionId,streamIndex??null,event.type,data.turnId,Number.isSafeInteger(data.stepIndex)?data.stepIndex:null,event.meta.at]);
 if(!inserted.rowCount){
  const prior=(await db.query('SELECT * FROM event_projections WHERE native_event_id=$1',[event.meta.id])).rows[0];
  if(!prior||prior.conversation_id!==row.id||prior.native_session_id!==nativeSessionId||prior.event_type!==event.type||prior.turn_id!==data.turnId||prior.emitted_at.getTime()!==Date.parse(event.meta.at!)||prior.stream_index!==null&&Number(prior.stream_index)!==streamIndex||prior.stream_index===null&&streamIndex!==undefined||prior.step_index!==null&&Number(prior.step_index)!==data.stepIndex||prior.step_index===null&&Number.isSafeInteger(data.stepIndex))throw hiddenRecord();
  return {learning:true as const};
 }
 if(event.type==='message.received'){
  await db.query("UPDATE response_attempts SET input_event_id=$2,native_turn_id=$3,dispatch_state='admitted',response_state=CASE WHEN response_state='pending' AND $4='running' THEN 'running' ELSE response_state END,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",[responseId,event.meta.id,data.turnId,attempt.state]);
  await db.query('UPDATE learning_attempts SET native_turn_id=$2,version=version+1 WHERE id=$1',[attempt.id,data.turnId]);
 }
 if(event.type==='message.completed'&&data.finishReason!=='tool-calls'&&attempt.state==='running'){
  try{
   const bound=await boundLearningActor(db,{principalId:row.owner_principal_id,attributes:{turasAttemptId:responseId}},data.turnId);
   if(typeof data.message!=='string'||Buffer.byteLength(data.message)>65536)throw new HttpFailure(422,'invalid_learning_output','Malformed learning output');
   const output=bound.scope.purpose==='draft'?learningDraftOutputSchema.parse(JSON.parse(data.message)):learningArmOutputSchema.parse(JSON.parse(data.message));
   if(output.citationKeys.some(key=>!bound.sourceMap.some(source=>source.key===key)))throw new HttpFailure(422,'invalid_learning_output','Unknown original citation');
   const digest=learningHash(output);
   await db.query("INSERT INTO learning_attempt_payloads(attempt_id,kind,content,content_digest) VALUES($1,'output',$2,$3) ON CONFLICT(attempt_id,kind) DO NOTHING",[attempt.id,JSON.stringify(output),digest]);
   const retained=(await db.query("SELECT content_digest FROM learning_attempt_payloads WHERE attempt_id=$1 AND kind='output'",[attempt.id])).rows[0];
   if(retained?.content_digest!==digest)throw new HttpFailure(409,'output_conflict','Learning output changed');
   await db.query('UPDATE learning_attempts SET output_digest=$2,version=version+1 WHERE id=$1',[attempt.id,digest]);
  }catch(error){
   // A terminal callback still must settle after withdrawal or malformed output.
   if(!(error instanceof SyntaxError||error instanceof z.ZodError||error instanceof HttpFailure&&error.status<500))throw error;
   await db.query("UPDATE learning_attempts SET state='failed',failure_code='invalid_learning_output',version=version+1 WHERE id=$1 AND state='running'",[attempt.id]);
  }
 }
 if(event.type==='step.failed')await db.query("UPDATE learning_attempts SET state='failed',failure_code='provider_step_failed',version=version+1 WHERE id=$1 AND state='running'",[attempt.id]);
 if(['turn.completed','turn.failed','turn.cancelled'].includes(event.type)){
  const current=(await db.query(`SELECT a.state,a.output_digest,a.model_steps,a.output_tokens,b.state AS budget_state,EXISTS(SELECT 1 FROM learning_budget_reservations r WHERE r.attempt_id=a.id AND NOT EXISTS(SELECT 1 FROM learning_budget_settlements s WHERE s.reservation_id=r.id)) AS unknown_cost FROM learning_attempts a JOIN learning_budget_accounts b ON b.id=a.budget_id WHERE a.id=$1`,[attempt.id])).rows[0];
  let state=current.state==='cancelled'||event.type==='turn.cancelled'?'cancelled':['failed','invalidated'].includes(current.state)?'failed':current.state==='unconfirmed'||current.unknown_cost?'unconfirmed':event.type==='turn.completed'&&current.output_digest&&Number(current.model_steps)>0&&Number(current.output_tokens)<=8192&&current.budget_state!=='blocked'?'completed':'failed';
  if(state==='completed')try{await boundLearningActor(db,{principalId:row.owner_principal_id,attributes:{turasAttemptId:responseId}},data.turnId);}catch{state='failed';}
  await db.query("UPDATE learning_attempts SET state=$2,settled_at=COALESCE(settled_at,clock_timestamp()),version=version+1 WHERE id=$1 AND state IN('prepared','admitted','running')",[attempt.id,state]);
  await db.query("UPDATE response_attempts SET response_state=CASE WHEN response_state IN('pending','running','stopping') THEN $2 ELSE response_state END,updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1",[responseId,state==='unconfirmed'?'failed':state]);
  const scope=(await db.query('SELECT workspace_id FROM learning_attempts WHERE id=$1',[attempt.id])).rows[0];
  await scheduleLearningPayloadPurge(db,attempt.id,'attempt','obsolete');
  await enqueueLearningRetirement(db,scope.workspace_id,attempt.id,new Date());
  await advanceLearningEvaluation(db,attempt.id);
 }
 return {learning:true as const};
}
