import { randomUUID } from 'node:crypto';
import type { CurrentSession } from '../auth/sessions';
import { getServerConfig } from '../config';
import { createOwnedConversation } from '../conversations/repository';
import { assertFreshFeatureConversation } from '../conversations/feature';
import { learningDraftSchema,learningLimits } from '../../contracts/learning';
import { learningReasonSchema,learningId } from '../../contracts/learning';
import { expectLearningVersion,learningDatabaseNow } from './repository';
import { enqueueLearningRetirement } from './invalidation';
import { scheduleLearningPayloadPurge } from './retention';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { learningCommand,learningRead } from './commands';
import { lockInternalLearningActor } from './policy';
import { captureLearningDraftContext,learningDraftPrompt } from './context';
import { persistLearningDependencies } from './sources';
import { learningHash } from './repository';
import { createLearningBudget } from './budget';
import { findLearningReceipt } from './receipts';
import { resolveLearningPrice } from './pricing';
import type { PoolClient } from 'pg';
export async function authorizeLearningDraftReceipt(db:PoolClient,actor:CurrentSession,id:string){
 await lockInternalLearningActor(db,actor);
 const header=(await db.query(`SELECT a.customer_id FROM learning_attempts a JOIN conversations c ON c.id=a.conversation_id
 WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.actor_membership_id=$4 AND c.owner_principal_id=$5 AND c.context_login_session_id=$6 AND a.purpose='draft'`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,actor.principalId,actor.sessionId])).rows[0];
 if(!header)throw hiddenRecord();await lockInternalLearningActor(db,actor,header.customer_id);
 const row=(await db.query("SELECT content,content_digest FROM learning_attempt_payloads WHERE attempt_id=$1 AND kind='context'",[id])).rows[0];
 if(!row||learningHash(row.content)!==row.content_digest)throw hiddenRecord();
 const current=await captureLearningDraftContext(db,actor,learningDraftSchema.parse(row.content.input));
 if(current.fenceDigest!==row.content.fenceDigest)throw new HttpFailure(409,'source_changed','Prepared learning inputs changed');
}
export async function prepareLearningDraft(actor:CurrentSession,raw:unknown){
 const input=learningDraftSchema.parse(raw);
 const prior=await learningRead(actor,input.customerId,async db=>{await lockInternalLearningActor(db,actor,input.customerId);return findLearningReceipt(db,actor,input.requestId);});
 const price=prior?null:await resolveLearningPrice();
 return learningCommand(actor,input,'draft.prepare',{customerId:input.customerId,authorize:async db=>{
   const current=await captureLearningDraftContext(db,actor,input);
   const receipt=await findLearningReceipt(db,actor,input.requestId);
   if(receipt?.target_id){const retained=(await db.query("SELECT content FROM learning_attempt_payloads WHERE attempt_id=$1 AND kind='context'",[receipt.target_id])).rows[0];if(!retained||retained.content.fenceDigest!==current.fenceDigest)throw new HttpFailure(409,'source_changed','Prepared learning inputs changed');}
  }},async db=>{
  if(!price)throw new HttpFailure(503,'pricing_unavailable','Prepare a fresh price contract');
  const context=await captureLearningDraftContext(db,actor,input),budgetId=await createLearningBudget(db,actor,input.budgetUsd,price);
  const conversation=(await createOwnedConversation(actor,{customerId:input.customerId,requestKey:randomUUID(),title:'Learning improvement draft'},db)).conversation;
  await assertFreshFeatureConversation(db,conversation.id);
  const binding=randomUUID(),attempt=randomUUID(),now=await learningDatabaseNow(db);
  await db.query(`INSERT INTO learning_bindings(id,environment_id,workspace_id,customer_id,actor_membership_id,conversation_id,purpose,closure_digest) VALUES($1,$2,$3,$4,$5,$6,'draft',$7)`,[binding,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,input.customerId,actor.membershipId,conversation.id,context.closure.closureDigest]);
  await db.query(`INSERT INTO learning_attempts(id,binding_id,environment_id,workspace_id,customer_id,actor_membership_id,conversation_id,purpose,budget_id,native_request_id,prepared_until,context_bytes)
   VALUES($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,0)`,[attempt,binding,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,input.customerId,actor.membershipId,conversation.id,budgetId,randomUUID(),new Date(now.getTime()+learningLimits.preparationMs)]);
  const payloads={context:{snapshot:context.snapshot,fence:context.fence,fenceDigest:context.fenceDigest,input,targetCandidate:context.targetCandidate},question:{text:input.question},source_map:context.sourceMap,instruction:{text:learningDraftPrompt}};
  for(const [kind,content] of Object.entries(payloads))await db.query('INSERT INTO learning_attempt_payloads(attempt_id,kind,content,content_digest) VALUES($1,$2,$3,$4)',[attempt,kind,JSON.stringify(content),learningHash(content)]);
  await persistLearningDependencies(db,actor,input.customerId,'draft',attempt,context.closure.originals);
  return {targetId:attempt,version:1};
 });
}
export async function learningDraftMeta(actor:CurrentSession,id:string){
 learningId.parse(id);
 return learningRead(actor,undefined,async db=>{
  const row=(await db.query(`SELECT a.*,c.creation_operation_id,c.owner_principal_id,c.context_login_session_id FROM learning_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.actor_membership_id=$4 AND a.purpose='draft'`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId])).rows[0];
  if(!row||row.owner_principal_id!==actor.principalId||row.context_login_session_id!==actor.sessionId)throw hiddenRecord();
  await lockInternalLearningActor(db,actor,row.customer_id);
  return {contractVersion:'learning-v1' as const,id,version:Number(row.version),conversationId:row.conversation_id,operationId:row.creation_operation_id,nativeRequestId:row.native_request_id,nativeSessionId:row.native_session_id,nativeTurnId:row.native_turn_id,state:row.state,purpose:row.purpose,budgetId:row.budget_id,preparedUntil:row.prepared_until.toISOString(),failureCode:row.failure_code,outputDigest:row.output_digest};
 });
}
export async function cancelLearningDraft(actor:CurrentSession,id:string,raw:unknown){
 learningId.parse(id);const input=learningReasonSchema.parse(raw);
 const scope=await learningDraftMeta(actor,id);
 return learningCommand(actor,{...input,attemptId:id},'draft.cancel',{customerId:null,newWork:false,authorize:async db=>{
  const row=(await db.query('SELECT customer_id FROM learning_attempts WHERE id=$1 AND actor_membership_id=$2 AND environment_id=$3 AND workspace_id=$4',[id,actor.membershipId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();await lockInternalLearningActor(db,actor,row.customer_id);
 }},async db=>{
  const attempt=(await db.query('SELECT * FROM learning_attempts WHERE id=$1 FOR UPDATE',[id])).rows[0];expectLearningVersion(attempt.version,input.expectedVersion);
  if(!['prepared','admitted','running','unconfirmed'].includes(attempt.state))throw new HttpFailure(409,'draft_unavailable','Draft is no longer active');
  const updated=(await db.query("UPDATE learning_attempts SET state='cancelled',failure_code='cancelled',settled_at=clock_timestamp(),version=version+1 WHERE id=$1 RETURNING version",[id])).rows[0];
  if(attempt.response_attempt_id)await db.query("UPDATE response_attempts SET response_state='stopping',updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND response_state IN('pending','running')",[attempt.response_attempt_id]);
  await scheduleLearningPayloadPurge(db,id,'attempt','obsolete');await enqueueLearningRetirement(db,actor.workspaceId,id,new Date());
  return {targetId:scope.id,version:Number(updated.version)};
 });
}
