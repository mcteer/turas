import type { PoolClient } from 'pg';
import type { FeaturePrincipal } from '../conversations/feature';
import type { ExecutionModelIdentity } from '../execution/native-admission';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { learningTransaction,learningHash } from './repository';
import { boundLearningActor } from './tool-actor';
import { reserveLearningModelStep,claimLearningProviderDispatch,storeLearningActualCost,markLearningCostUnknown } from './budget';
import { registerLearningModelCallbacks,type LearningModelAccounting } from './model-budget';

function providerAccounting(input:LearningModelAccounting){
 const metadata=input.metadata as {gateway?:{cost?:unknown;totalCost?:unknown;generationId?:unknown}}|undefined,gateway=metadata?.gateway;
 const raw=gateway?.cost??gateway?.totalCost;
 const usd=typeof raw==='string'?raw:typeof raw==='number'&&Number.isFinite(raw)&&raw>=0?raw.toFixed(12):null;
 const generation=typeof gateway?.generationId==='string'?gateway.generationId:input.responseId;
 if(usd===null||!generation)throw new HttpFailure(409,'accounting_unknown','Provider cost and generation identity required');
 return {usd,providerGenerationId:generation,inputTokens:input.inputTokens,outputTokens:input.outputTokens,evidence:{gateway}};
}

async function injected(db:PoolClient,principal:FeaturePrincipal,identity:ExecutionModelIdentity){
 const bound=await boundLearningActor(db,principal,identity.turnId);
 if(bound.responseAttemptId!==identity.responseAttemptId||bound.nativeSessionId!==identity.nativeSessionId||bound.nativeTurnId!==identity.turnId)throw hiddenRecord();
 const receipt=(await db.query('SELECT snapshot_digest FROM context_injection_receipts WHERE attempt_id=$1 AND turn_id=$2',[identity.responseAttemptId,identity.turnId])).rows[0];
 if(receipt?.snapshot_digest!==learningHash(bound.snapshot))throw new HttpFailure(409,'learning_context_changed','Exact learning context was not injected');
 return bound;
}
/** Each ordinal is reserved once; replay cannot silently dispatch another paid request. */
export async function admitLearningDraftModelStep(principal:FeaturePrincipal,identity:ExecutionModelIdentity){
 const admitted=await learningTransaction(async db=>{
  const bound=await injected(db,principal,identity);
  if(!Number.isInteger(identity.stepIndex)||identity.stepIndex<0||identity.stepIndex>=(bound.scope.purpose==='draft'?6:1)||bound.counters.modelSteps!==identity.stepIndex)throw new HttpFailure(409,'learning_step_uncertain','A model step cannot be retried or reordered');
  const reservation=await reserveLearningModelStep(db,bound.actor,{attemptId:bound.attemptId,nativeSessionId:identity.nativeSessionId,nativeTurnId:identity.turnId,ordinal:identity.stepIndex+1},async client=>{await injected(client,principal,identity);});
  return {mode:'learning' as const,deadlineAt:bound.deadlineAt,reservationId:reservation.reservationId,attemptId:bound.attemptId,purpose:bound.scope.purpose};
 });
 registerLearningModelCallbacks(admitted.deadlineAt,{purpose:admitted.purpose,chargeInput:bytes=>learningTransaction(async db=>{
  const bound=await injected(db,principal,identity);
  if(!Number.isSafeInteger(bytes)||bytes<0||bound.counters.contextBytes+bytes>24576)throw new HttpFailure(429,'learning_context_budget','Cumulative learning input exceeds its limit');
  await db.query('UPDATE learning_attempts SET context_bytes=context_bytes+$2,version=version+1 WHERE id=$1',[bound.attemptId,bytes]);
 }),settle:accounting=>learningTransaction(async db=>{
  await storeLearningActualCost(db,admitted.reservationId,providerAccounting(accounting));
  const row=(await db.query('UPDATE learning_attempts SET output_tokens=output_tokens+$2,version=version+1 WHERE id=$1 RETURNING output_tokens',[admitted.attemptId,accounting.outputTokens])).rows[0];
  const budget=(await db.query('SELECT b.state FROM learning_budget_accounts b JOIN learning_attempts a ON a.budget_id=b.id WHERE a.id=$1',[admitted.attemptId])).rows[0];
  if(Number(row.output_tokens)>8192||budget?.state==='blocked')await db.query("UPDATE learning_attempts SET state='failed',failure_code=$2,settled_at=clock_timestamp(),version=version+1 WHERE id=$1 AND state IN('admitted','running')",[admitted.attemptId,budget?.state==='blocked'?'provider_bound_exceeded':'learning_output_budget']);
 }),fail:()=>learningTransaction(async db=>{
  if(!(await db.query('SELECT 1 FROM learning_budget_settlements WHERE reservation_id=$1',[admitted.reservationId])).rowCount)await markLearningCostUnknown(db,admitted.attemptId);
 })});
 return admitted;
}
/** This durable single-dispatch claim must commit immediately before provider I/O. */
export async function assertLearningDraftProviderRelease(principal:FeaturePrincipal,identity:ExecutionModelIdentity){
 return learningTransaction(async db=>{
  const bound=await injected(db,principal,identity);
  if(bound.counters.modelSteps!==identity.stepIndex+1)throw hiddenRecord();
  const reservation=(await db.query(`SELECT id FROM learning_budget_reservations WHERE attempt_id=$1 AND native_session_id=$2 AND native_turn_id=$3 AND ordinal=$4`,[bound.attemptId,identity.nativeSessionId,identity.turnId,identity.stepIndex+1])).rows[0];
  if(!reservation)throw hiddenRecord();
  await claimLearningProviderDispatch(db,bound.actor,reservation.id,async client=>{await injected(client,principal,identity);});
  return {reservationId:reservation.id as string,attemptId:bound.attemptId};
 });
}
