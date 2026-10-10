import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { HttpFailure,hiddenRecord } from '../../contracts/http';
import { decimalMicro,microUsdSchema,learningLimits,learningId,learningSettlementSchema } from '../../contracts/learning';
import { getServerConfig } from '../config';
import { lockInternalLearningActor,lockLearningPublisher } from './policy';
import { learningHash,expectLearningVersion } from './repository';
import { assertLearningPrice,learningStepCeiling,type LearningPrice } from './pricing';
import { learningCommand,learningRead } from './commands';
export async function createLearningBudget(db:PoolClient,actor:CurrentSession,usd:string,rawPrice:LearningPrice){
 await lockInternalLearningActor(db,actor);
 const limit=decimalMicro(microUsdSchema.parse(usd)),price=assertLearningPrice(rawPrice),bound=learningStepCeiling(price,learningLimits.requestedOutputTokens);
 if(limit<bound.ceilingMicroUsd)throw new HttpFailure(409,'budget_insufficient','Budget is below the verified maximum cost of one model step');
 const id=randomUUID();
 await db.query(`INSERT INTO learning_budget_accounts(id,environment_id,workspace_id,actor_membership_id,limit_micro_usd,price_contract,price_digest)
  VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,limit.toString(),JSON.stringify(price),learningHash(price)]);
 return id;
}
export async function reserveLearningModelStep(db:PoolClient,actor:CurrentSession,input:{attemptId:string;nativeSessionId:string;nativeTurnId:string;ordinal:number},authorize:(db:PoolClient)=>Promise<void>){
 await lockInternalLearningActor(db,actor);await authorize(db);
 const attempt=(await db.query(`SELECT a.*,b.price_contract,b.price_digest FROM learning_attempts a JOIN learning_budget_accounts b ON b.id=a.budget_id
   WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.actor_membership_id=$4 FOR UPDATE OF b,a`,[input.attemptId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId])).rows[0];
 if(!attempt||attempt.native_session_id!==input.nativeSessionId||attempt.native_turn_id!==input.nativeTurnId)throw hiddenRecord();
 const price=assertLearningPrice(attempt.price_contract),bound=learningStepCeiling(price,4096);
 if(bound.priceDigest!==attempt.price_digest)throw new HttpFailure(503,'pricing_unavailable','Stored provider pricing changed');
 const id=randomUUID();
 await db.query(`INSERT INTO learning_budget_reservations(id,budget_id,attempt_id,ordinal,native_session_id,native_turn_id,ceiling_micro_usd,input_ceiling,output_ceiling)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,attempt.budget_id,attempt.id,input.ordinal,input.nativeSessionId,input.nativeTurnId,bound.ceilingMicroUsd.toString(),bound.inputCeiling,bound.outputCeiling]);
 await db.query('UPDATE learning_attempts SET model_steps=model_steps+1,version=version+1 WHERE id=$1',[attempt.id]);
 return {reservationId:id,attemptId:attempt.id,deadlineAt:attempt.deadline_at as Date,purpose:attempt.purpose as 'draft'|'evaluation_baseline'|'evaluation_candidate',price};
}
export async function claimLearningProviderDispatch(db:PoolClient,actor:CurrentSession,reservationId:string,authorize:(db:PoolClient)=>Promise<void>){
 await lockInternalLearningActor(db,actor);await authorize(db);
 const owned=(await db.query(`SELECT 1 FROM learning_budget_reservations r JOIN learning_budget_accounts b ON b.id=r.budget_id WHERE r.id=$1 AND b.actor_membership_id=$2 AND b.workspace_id=$3 AND b.environment_id=$4`,[reservationId,actor.membershipId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rowCount;
 if(!owned)throw hiddenRecord();
 await db.query('INSERT INTO learning_model_dispatches(reservation_id) VALUES($1)',[reservationId]);
}
export function actualCostMicroUsd(usd:string):bigint{
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(usd))throw new HttpFailure(409,'accounting_unknown','Provider accounting is incomplete');
 const [whole,fraction='']=usd.split('.'),scaled=BigInt(whole)*1000000000000n+BigInt(fraction.padEnd(12,'0'));
 return (scaled+999999n)/1000000n;
}
export async function storeLearningActualCost(db:PoolClient,reservationId:string,input:{usd:string;inputTokens:number;outputTokens:number;providerGenerationId:string;evidence:unknown}){
 const amount=actualCostMicroUsd(input.usd);
 if(amount>9223372036854775807n||!Number.isSafeInteger(input.inputTokens)||input.inputTokens<0||!Number.isSafeInteger(input.outputTokens)||input.outputTokens<0||!input.providerGenerationId||input.providerGenerationId.length>200)throw new HttpFailure(409,'accounting_unknown','Provider accounting is incomplete');
 const id=randomUUID();
 await db.query(`INSERT INTO learning_budget_settlements(id,reservation_id,kind,amount_micro_usd,input_tokens,output_tokens,provider_generation_id) VALUES($1,$2,'actual',$3,$4,$5,$6)`,[id,reservationId,amount.toString(),input.inputTokens,input.outputTokens,input.providerGenerationId]);
 const evidence={provider:input.evidence,reportedUsd:input.usd,accountingRounding:'ceil_to_micro_usd'};
 if(Buffer.byteLength(JSON.stringify(evidence))>16384)throw new HttpFailure(413,'accounting_too_large','Read a smaller accounting record');
 await db.query('INSERT INTO learning_settlement_payloads(settlement_id,content) VALUES($1,$2)',[id,JSON.stringify(evidence)]);
 return id;
}
export async function markLearningCostUnknown(db:PoolClient,attemptId:string){
 await db.query(`UPDATE learning_attempts SET state='unconfirmed',failure_code='accounting_unknown',version=version+1 WHERE id=$1 AND environment_id=$2 AND state IN('admitted','running')`,[attemptId,getServerConfig().TURAS_ENVIRONMENT_ID]);
 await db.query(`UPDATE learning_evaluations e SET state='unconfirmed',version=e.version+1 FROM learning_bindings b JOIN learning_attempts a ON a.binding_id=b.id WHERE a.id=$1 AND e.id=b.evaluation_id AND e.state IN('prepared','running','awaiting_review')`,[attemptId]);
}
export async function readLearningBudget(actor:CurrentSession,budgetId:string){
 learningId.parse(budgetId);
 return learningRead(actor,undefined,async db=>{
  await lockLearningPublisher(db,actor);
  const account=(await db.query(`SELECT b.*,a.customer_id FROM learning_budget_accounts b
   JOIN learning_attempts a ON a.budget_id=b.id WHERE b.id=$1 AND b.environment_id=$2 AND b.workspace_id=$3 LIMIT 1`,[budgetId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
  if(!account)throw hiddenRecord();await lockLearningPublisher(db,actor,account.customer_id);
  const rows=(await db.query(`SELECT r.id,r.attempt_id,r.ordinal,r.ceiling_micro_usd,r.input_ceiling,r.output_ceiling,d.created_at AS dispatch_claimed_at,s.kind,s.amount_micro_usd,s.input_tokens,s.output_tokens,s.provider_generation_id,released.reservation_id AS released_id
   FROM learning_budget_reservations r LEFT JOIN learning_model_dispatches d ON d.reservation_id=r.id LEFT JOIN learning_budget_settlements s ON s.reservation_id=r.id
   LEFT JOIN learning_reservation_releases released ON released.reservation_id=r.id
   WHERE r.budget_id=$1 ORDER BY r.created_at,r.id LIMIT 17`,[budgetId])).rows;
  if(rows.length>16)throw new HttpFailure(413,'response_too_large','Budget reservation inventory exceeds its operation bound');
  return {contractVersion:'learning-v1' as const,id:budgetId,version:Number(account.version),limitMicroUsd:String(account.limit_micro_usd),blocked:account.state==='blocked'||rows.some(row=>!row.kind&&!row.released_id),
   reservations:rows.map(row=>({id:String(row.id),attemptId:String(row.attempt_id),ordinal:Number(row.ordinal),ceilingMicroUsd:String(row.ceiling_micro_usd),inputCeiling:Number(row.input_ceiling),outputCeiling:Number(row.output_ceiling),dispatched:!!row.dispatch_claimed_at,releasedWithoutDispatch:!!row.released_id,
    settlement:row.kind?{kind:String(row.kind),amountMicroUsd:String(row.amount_micro_usd),inputTokens:Number(row.input_tokens),outputTokens:Number(row.output_tokens),providerGenerationId:row.provider_generation_id as string|null}:null}))};
 });
}
export async function reviewLearningSettlement(actor:CurrentSession,budgetId:string,raw:unknown){
 const input=learningSettlementSchema.parse(raw);learningId.parse(budgetId);
 const scope=await learningRead(actor,undefined,async db=>{
  await lockLearningPublisher(db,actor);
  const row=(await db.query(`SELECT b.*,a.customer_id FROM learning_budget_accounts b JOIN learning_budget_reservations r ON r.budget_id=b.id JOIN learning_attempts a ON a.id=r.attempt_id WHERE b.id=$1 AND r.id=$2 AND b.environment_id=$3 AND b.workspace_id=$4`,[budgetId,input.reservationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();return row;
 });
 return learningCommand(actor,{...input,budgetId},'budget.settle',{customerId:scope.customer_id,authorize:db=>lockLearningPublisher(db,actor,scope.customer_id),newWork:false},async db=>{
  const budget=(await db.query('SELECT version FROM learning_budget_accounts WHERE id=$1 FOR UPDATE',[budgetId])).rows[0];expectLearningVersion(budget.version,input.expectedVersion);
  const reservation=(await db.query('SELECT ceiling_micro_usd FROM learning_budget_reservations WHERE id=$1 AND budget_id=$2',[input.reservationId,budgetId])).rows[0];if(!reservation)throw hiddenRecord();
  if((await db.query('SELECT 1 FROM learning_budget_settlements WHERE reservation_id=$1',[input.reservationId])).rowCount)throw new HttpFailure(409,'accounting_reviewed','This reservation already has an immutable settlement');
  if((await db.query('SELECT 1 FROM learning_reservation_releases WHERE reservation_id=$1',[input.reservationId])).rowCount)throw new HttpFailure(409,'accounting_reviewed','This reservation was released without dispatch');
  if(input.kind==='actual'&&!input.providerGenerationId)throw new HttpFailure(422,'invalid_input','Actual provider generation identity required');
  if(input.kind==='conservative_bound'&&decimalMicro(input.usd)<BigInt(reservation.ceiling_micro_usd))throw new HttpFailure(422,'invalid_input','Reviewed bound cannot be below the reserved provider maximum');
  const id=randomUUID();
  await db.query(`INSERT INTO learning_budget_settlements(id,reservation_id,kind,amount_micro_usd,input_tokens,output_tokens,provider_generation_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,input.reservationId,input.kind,decimalMicro(input.usd).toString(),input.inputTokens,input.outputTokens,input.providerGenerationId,actor.membershipId]);
  await db.query('INSERT INTO learning_settlement_payloads(settlement_id,content) VALUES($1,$2)',[id,JSON.stringify({evidence:input.evidence,rationale:input.rationale})]);
  // Settling cost cannot recover an uncertain output or restart a paid arm.
  await db.query(`UPDATE learning_attempts a SET state='failed',failure_code='accounting_reviewed',settled_at=COALESCE(settled_at,clock_timestamp()),version=version+1
   FROM learning_budget_reservations r WHERE r.id=$1 AND a.id=r.attempt_id AND a.state='unconfirmed'`,[input.reservationId]);
  await db.query(`UPDATE learning_evaluations e SET state='failed',version=e.version+1 FROM learning_bindings l JOIN learning_attempts a ON a.binding_id=l.id JOIN learning_budget_reservations r ON r.attempt_id=a.id
   WHERE r.id=$1 AND e.id=l.evaluation_id AND e.state='unconfirmed'`,[input.reservationId]);
  const updated=(await db.query('UPDATE learning_budget_accounts SET version=version+1 WHERE id=$1 RETURNING version',[budgetId])).rows[0];
  return {targetId:id,version:Number(updated.version)};
 });
}
