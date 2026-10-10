import {authorizeLearningEvaluationReceipt} from './evaluation';
import { authorizeLearningFeedbackReceipt } from './feedback';
import { authorizeLearningDraftReceipt } from './advisory';
import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { learningId } from '../../contracts/learning';
import { learningTransaction } from './repository';
import { lockLearningActor } from './policy';
import { assertLearningAdmission } from './schema';
import { admitLearningWrite } from './limits';
import { lockLearningRequest, findLearningReceipt, checkLearningReplay, learningInputDigest, storeLearningReceipt } from './receipts';
type Scope={customerId:string|null;authorize:(db:PoolClient)=>Promise<void>;newWork?:boolean};
/** Receipt lookup, current authorization, quota and mutation share one transaction. */
export async function learningCommand<T extends {requestId:string}>(actor:CurrentSession,input:T,action:string,scope:Scope,
  run:(db:PoolClient)=>Promise<{targetId:string;version:number}>){
  learningId.parse(input.requestId);
  return learningTransaction(async db=>{
    await lockLearningActor(db,actor,scope.customerId??undefined);
    await lockLearningRequest(db,actor,input.requestId);
    await scope.authorize(db);
    const prior=await findLearningReceipt(db,actor,input.requestId);
    if(prior)return checkLearningReplay(prior,learningInputDigest(input,prior.hash_key_id),action);
    if(scope.newWork!==false)await assertLearningAdmission(db,actor.workspaceId);
    await admitLearningWrite(db,actor);
    const result=await run(db);
    return storeLearningReceipt(db,actor,{requestId:input.requestId,action,digest:learningInputDigest(input),customerId:scope.customerId,...result});
  });
}

import { admitLearningRead } from './limits';
export async function learningRead<T>(actor:CurrentSession,customerId:string|undefined,run:(db:PoolClient)=>Promise<T>):Promise<T>{
 return learningTransaction(async db=>{
  await lockLearningActor(db,actor,customerId);
  await admitLearningRead(db,actor);
  return run(db);
 });
}

import { learningRequestStatus,type LearningReceiptRow } from './receipts';
import { lockLearningPublisher,lockInternalLearningActor } from './policy';
import { hiddenRecord } from '../../contracts/http';
export async function readLearningRequest(actor:CurrentSession,requestId:string,abandon=false){
 return learningTransaction(async db=>{
 await lockLearningActor(db,actor);
 return learningRequestStatus(db,actor,requestId,abandon,async(client,row:LearningReceiptRow)=>{
  if(row.customer_id)await lockLearningActor(client,actor,row.customer_id);
  if(row.action.startsWith('feedback.')&&row.target_id){
   if(row.action==='feedback.dispose')await lockInternalLearningActor(client,actor,row.customer_id??undefined);
   await authorizeLearningFeedbackReceipt(client,actor,row.target_id);return;
  }
  if(row.action==='request.resolve')return;
  if(row.action.startsWith('measurement.')&&row.target_id){
   const header=(await client.query('SELECT customer_id,author_membership_id FROM learning_measurement_contributions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[row.target_id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!header)throw hiddenRecord();
   if(['measurement.create','measurement.revise'].includes(row.action)){await lockInternalLearningActor(client,actor,header.customer_id);if(row.action==='measurement.revise'&&actor.role!=='admin'&&header.author_membership_id!==actor.membershipId)throw hiddenRecord();}else await lockLearningPublisher(client,actor,header.customer_id);return;
  }
  if(row.action==='cohort.release'&&row.target_id){
   await lockLearningPublisher(client,actor);if(!(await client.query('SELECT 1 FROM learning_cohort_families WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[row.target_id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rowCount)throw hiddenRecord();return;
  }
  if(['release.publish','release.withdraw'].includes(row.action)&&row.target_id){
   await lockLearningPublisher(client,actor);
   const decision=(await client.query(`SELECT c.customer_id FROM knowledge_decisions d JOIN knowledge_contributions c ON c.id=d.contribution_id WHERE d.id=$1 AND d.actor_membership_id=$2 AND c.environment_id=$3 AND c.workspace_id=$4`,[row.target_id,actor.membershipId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!decision)throw hiddenRecord();await lockLearningPublisher(client,actor,decision.customer_id);return;
  }
  if(row.action==='draft.prepare'&&row.target_id){await authorizeLearningDraftReceipt(client,actor,row.target_id);return;}
  if(row.action==='draft.cancel'&&row.target_id){
   const target=(await client.query(`SELECT a.customer_id FROM learning_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.actor_membership_id=$4 AND c.owner_principal_id=$5 AND c.context_login_session_id=$6`,[row.target_id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,actor.principalId,actor.sessionId])).rows[0];
   if(!target)throw hiddenRecord();await lockInternalLearningActor(client,actor,target.customer_id);return;
  }
  if(row.action==='draft.save'&&row.target_id){
   const candidate=(await client.query(`SELECT r.idempotency_key FROM knowledge_contributions c JOIN knowledge_revisions r ON r.contribution_id=c.id WHERE c.id=$1 AND c.environment_id=$2 AND c.workspace_id=$3 AND r.author_membership_id=$4 AND r.revision_number=$5`,[row.target_id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,row.version])).rows[0];
   if(!candidate)throw hiddenRecord();
   await authorizeLearningDraftReceipt(client,actor,candidate.idempotency_key);return;
  }
  if(row.action==='candidate.rollback'&&row.target_id){
   const c=(await client.query('SELECT customer_id FROM knowledge_contributions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[row.target_id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!c)throw hiddenRecord();await lockLearningPublisher(client,actor,c.customer_id);return;
  }
  if(['candidate.review','review.revoke'].includes(row.action)&&row.target_id){
   await lockLearningPublisher(client,actor);
   const review=(await client.query('SELECT customer_id FROM learning_candidate_reviews WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[row.target_id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
   if(!review)throw hiddenRecord();await lockLearningPublisher(client,actor,review.customer_id);return;
  }
  if(['evaluation.prepare','evaluation.cancel'].includes(row.action)&&row.target_id){
   const e=(await client.query('SELECT customer_id FROM learning_evaluations WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[row.target_id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!e)throw hiddenRecord();await lockLearningPublisher(client,actor,e.customer_id);return;
  }
  if(['evaluation.arm','evaluation.case_review'].includes(row.action)&&row.target_id){
   const e=row.action==='evaluation.arm'?(await client.query('SELECT b.evaluation_id FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id WHERE a.id=$1',[row.target_id])).rows[0]:(await client.query('SELECT evaluation_id FROM learning_case_reviews WHERE id=$1',[row.target_id])).rows[0];if(!e)throw hiddenRecord();await authorizeLearningEvaluationReceipt(client,actor,e.evaluation_id);return;
  }
  if(row.action==='budget.settle'&&row.target_id){
   await lockLearningPublisher(client,actor,row.customer_id??undefined);
   const settlement=(await client.query(`SELECT 1 FROM learning_budget_settlements s JOIN learning_budget_reservations r ON r.id=s.reservation_id JOIN learning_budget_accounts b ON b.id=r.budget_id WHERE s.id=$1 AND b.environment_id=$2 AND b.workspace_id=$3`,[row.target_id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rowCount;
   if(!settlement)throw hiddenRecord();return;
  }
  if(row.outcome==='retired'&&row.action.startsWith('feedback.')){if(row.action==='feedback.dispose')await lockInternalLearningActor(client,actor,row.customer_id??undefined);return;}
  // Additional actions must register their exact current read fence as they are implemented.
  if(row.action.startsWith('draft.'))await lockInternalLearningActor(client,actor,row.customer_id??undefined);
  else if(row.action.startsWith('candidate.')||row.action.startsWith('evaluation.')||row.action.startsWith('budget.')||row.action.startsWith('release.'))await lockLearningPublisher(client,actor,row.customer_id??undefined);
  else throw hiddenRecord();
  throw hiddenRecord();
 });
 });
}
import { getServerConfig } from '../config';
