import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withLearningDatabase } from '../fixtures/learning/environment';
import { learningTestActors } from '../fixtures/learning/setup';
import { createOwnedConversation } from '../../lib/server/conversations/repository';
import { DEMO_IDS } from '../../lib/server/bootstrap-ids';
import {readLearningBudget,reviewLearningSettlement,markLearningCostUnknown} from '../../lib/server/learning/budget';
import {learningNativeFixture} from '../fixtures/learning/native';
import {admitGovernedStaffingModelStep,assertGovernedStaffingProviderRelease} from '../../lib/server/staffing/native-admission';
describe('durable learning budget guards',()=>{
 it('requires an administrator-reviewed full bound, reconciles while disabled, and cannot recover uncertain output',()=>withLearningDatabase(async db=>{
  const f=await learningNativeFixture(db);await admitGovernedStaffingModelStep(f.principal,f.identity);await assertGovernedStaffingProviderRelease(f.principal,f.identity);await markLearningCostUnknown(db,f.meta.id);
  const budget=await readLearningBudget(f.actors.admin,f.meta.budgetId),reservation=budget.reservations[0];
  expect(budget.blocked).toBe(true);expect(reservation.dispatched).toBe(true);
  const input={contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:budget.version,reservationId:reservation.id,kind:'conservative_bound',usd:'16',inputTokens:reservation.inputCeiling,outputTokens:reservation.outputCeiling,providerGenerationId:null,evidence:'Full frozen synthetic provider ceilings at the reviewed rates',rationale:'Unknown accounting reviewed as the full reserved upper bound'};
  await expect(reviewLearningSettlement(f.actors.partner,budget.id,input)).rejects.toMatchObject({status:403});await expect(reviewLearningSettlement(f.actor,budget.id,input)).rejects.toMatchObject({status:403});await expect(reviewLearningSettlement(f.actors.admin,budget.id,{...input,usd:'15.999999'})).rejects.toMatchObject({status:422});
  await db.query('UPDATE learning_workspace_state SET enabled=false WHERE workspace_id=$1',[f.workspaceId]);const settled=await reviewLearningSettlement(f.actors.admin,budget.id,input);expect((await reviewLearningSettlement(f.actors.admin,budget.id,input)).targetId).toBe(settled.targetId);
  expect((await readLearningBudget(f.actors.admin,budget.id)).reservations[0].settlement).toMatchObject({kind:'conservative_bound',amountMicroUsd:'16000000'});expect((await db.query('SELECT state FROM learning_attempts WHERE id=$1',[f.meta.id])).rows[0].state).toBe('failed');expect((await db.query("SELECT count(*)::int n FROM learning_attempt_payloads WHERE attempt_id=$1 AND kind='output'",[f.meta.id])).rows[0].n).toBe(0);
  await expect(reviewLearningSettlement(f.actors.admin,budget.id,{...input,requestId:randomUUID(),expectedVersion:budget.version+1})).rejects.toMatchObject({status:409});
 }));
 it('holds unknown cost, enforces cumulative budget and makes settlements immutable',()=>withLearningDatabase(async db=>{
  const actor=(await learningTestActors(db)).admin,env=process.env.TURAS_ENVIRONMENT_ID;
  const budget=randomUUID(),binding=randomUUID(),attempt=randomUUID(),reservation=randomUUID();
  const {conversation}=await createOwnedConversation(actor,{customerId:DEMO_IDS.sharedCustomer,requestKey:randomUUID(),title:'Synthetic learning budget'},db);
  await db.query('UPDATE learning_workspace_state SET enabled=true WHERE environment_id=$1 AND workspace_id=$2',[env,actor.workspaceId]);
  try{
   await db.query(`INSERT INTO learning_budget_accounts(id,environment_id,workspace_id,actor_membership_id,limit_micro_usd,price_contract,price_digest) VALUES($1,$2,$3,$4,10000000,'{}',$5)`,[budget,env,actor.workspaceId,actor.membershipId,'a'.repeat(64)]);
   await db.query(`INSERT INTO learning_bindings(id,environment_id,workspace_id,customer_id,actor_membership_id,conversation_id,purpose,closure_digest) VALUES($1,$2,$3,$4,$5,$6,'draft',$7)`,[binding,env,actor.workspaceId,DEMO_IDS.sharedCustomer,actor.membershipId,conversation.id,'b'.repeat(64)]);
   await db.query(`INSERT INTO learning_attempts(id,binding_id,environment_id,workspace_id,customer_id,actor_membership_id,conversation_id,purpose,budget_id,state,prepared_until,dispatch_at,deadline_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,'draft',$8,'admitted',clock_timestamp()+interval '4 minutes',clock_timestamp(),clock_timestamp()+interval '110 seconds')`,[attempt,binding,env,actor.workspaceId,DEMO_IDS.sharedCustomer,actor.membershipId,conversation.id,budget]);
   const reserve=(id:string,ordinal:number,ceiling:number)=>db.query(`INSERT INTO learning_budget_reservations(id,budget_id,attempt_id,ordinal,native_session_id,native_turn_id,ceiling_micro_usd,input_ceiling,output_ceiling) VALUES($1,$2,$3,$4,'synthetic-session',$5,$6,1000,8192)`,[id,budget,attempt,ordinal,`turn-${ordinal}`,ceiling]);
   await reserve(reservation,1,8000000);
   const accounting=await readLearningBudget(actor,budget);
   expect(accounting.reservations).toEqual([expect.objectContaining({id:reservation,ceilingMicroUsd:'8000000',settlement:null,dispatched:false})]);
   expect(accounting).not.toHaveProperty('price_contract');
   await expect(readLearningBudget((await learningTestActors(db)).partner,budget)).rejects.toMatchObject({status:403});
   await db.query('UPDATE learning_attempts SET model_steps=1 WHERE id=$1',[attempt]);
   await expect(reserve(randomUUID(),2,1000000)).rejects.toMatchObject({code:'23514'});
   await db.query(`INSERT INTO learning_budget_settlements(id,reservation_id,kind,amount_micro_usd,input_tokens,output_tokens,provider_generation_id) VALUES($1,$2,'actual',5000000,200,300,'synthetic-generation')`,[randomUUID(),reservation]);
   await expect(reserve(randomUUID(),2,6000000)).rejects.toMatchObject({code:'23514'});
   await reserve(randomUUID(),2,4000000);
   await expect(db.query('UPDATE learning_budget_settlements SET amount_micro_usd=0 WHERE reservation_id=$1',[reservation])).rejects.toMatchObject({code:'23514'});
  }finally{
   await db.query("UPDATE learning_attempts SET state='cancelled',version=version+1 WHERE id=$1",[attempt]);
   await db.query('UPDATE learning_workspace_state SET enabled=false WHERE environment_id=$1 AND workspace_id=$2',[env,actor.workspaceId]);
  }
 }));
 it('rejects mixed research bindings in both orders and context reassignment',()=>withLearningDatabase(async db=>{
  const actor=(await learningTestActors(db)).admin,env=process.env.TURAS_ENVIRONMENT_ID;
  const fresh=async()=> (await createOwnedConversation(actor,{customerId:DEMO_IDS.sharedCustomer,requestKey:randomUUID(),title:'Synthetic exclusive context'},db)).conversation;
  const bind=(conversationId:string)=>db.query(`INSERT INTO learning_bindings(id,environment_id,workspace_id,customer_id,actor_membership_id,conversation_id,purpose,closure_digest) VALUES($1,$2,$3,$4,$5,$6,'draft',$7)`,[randomUUID(),env,actor.workspaceId,DEMO_IDS.sharedCustomer,actor.membershipId,conversationId,'c'.repeat(64)]);
  const research=(conversationId:string)=>db.query(`INSERT INTO research_requests(id,environment_id,workspace_id,customer_id,actor_membership_id,actor_principal_id,login_session_id,conversation_id,mode,public_fields,idempotency_key,request_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'fit','{}',$9,$10)`,[randomUUID(),env,actor.workspaceId,DEMO_IDS.sharedCustomer,actor.membershipId,actor.principalId,actor.sessionId,conversationId,randomUUID(),'d'.repeat(64)]);
  const first=await fresh();await bind(first.id);
  await expect(research(first.id)).rejects.toMatchObject({code:'23514'});
  await expect(db.query('UPDATE conversations SET context_login_session_id=NULL WHERE id=$1',[first.id])).rejects.toMatchObject({code:'23514'});
  const second=await fresh();await research(second.id);
  await expect(bind(second.id)).rejects.toMatchObject({code:'23514'});
 }));

});
