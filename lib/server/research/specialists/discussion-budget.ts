import {HttpFailure} from '../../../contracts/http';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {withTransaction} from '../../db/client';
import {ordinaryConversationOutputLimit} from '../../conversations/token-allowance';
import {conversationSpecialistAllowance} from './discussion-policy';

export type SpecialistAllowance={inputTokens:number;outputTokens:number;microUsd:number};
export type SpecialistOperation={id:string;ceiling:SpecialistAllowance;actual:SpecialistAllowance|null};
const fields=['inputTokens','outputTokens','microUsd'] as const;
const unavailable=()=>new HttpFailure(429,'specialist_budget_unavailable','Specialist allowance is unavailable');
function valid(value:SpecialistAllowance){return fields.every(key=>Number.isSafeInteger(value[key])&&value[key]>=0);}

/** Fold authoritative operation receipts, retaining the full ceiling whenever
 * actual usage is unknown. The caller must hold the discussion/accounting locks
 * and atomically persist its new reservation before any provider dispatch. */
export function remainingSpecialistAllowance(limit:SpecialistAllowance,operations:readonly SpecialistOperation[]):SpecialistAllowance{
 if(!valid(limit)||fields.some(key=>limit[key]===0))throw unavailable();
 const seen=new Set<string>(),spent={inputTokens:0n,outputTokens:0n,microUsd:0n};
 for(const operation of operations){
  if(!operation.id||seen.has(operation.id)||!valid(operation.ceiling)||operation.actual!==null&&!valid(operation.actual))throw unavailable();
  seen.add(operation.id);
  for(const key of fields){
   const amount=operation.actual?.[key]??operation.ceiling[key];
   if(amount>operation.ceiling[key])throw unavailable();
   spent[key]+=BigInt(amount);
  }
 }
 const remaining={} as SpecialistAllowance;
 for(const key of fields){if(spent[key]>BigInt(limit[key]))throw unavailable();remaining[key]=Number(BigInt(limit[key])-spent[key]);}
 return remaining;
}

export function assertSpecialistReservation(limit:SpecialistAllowance,operations:readonly SpecialistOperation[],reservation:SpecialistAllowance){
 if(!valid(reservation))throw unavailable();
 const remaining=remainingSpecialistAllowance(limit,operations);
 if(fields.some(key=>reservation[key]>remaining[key]))throw unavailable();
 return remaining;
}

type OperationRow={id:string;discussion_id:string;assignment_id:string;native_step_key:string;ceiling_input_tokens:string;ceiling_output_tokens:string;ceiling_micro_usd:string;
 actual_input_tokens:string|null;actual_output_tokens:string|null;actual_micro_usd:string|null;settled_at:Date|null;completed_at:Date|null};
const operation=(row:OperationRow):SpecialistOperation=>({id:row.id,ceiling:{inputTokens:Number(row.ceiling_input_tokens),outputTokens:Number(row.ceiling_output_tokens),microUsd:Number(row.ceiling_micro_usd)},
 actual:row.settled_at?{inputTokens:Number(row.actual_input_tokens),outputTokens:Number(row.actual_output_tokens),microUsd:Number(row.actual_micro_usd)}:null});

/** Count a live row and its immutable recovery hold once. Any retained unknown
 * receipt keeps its ceiling; cleanup or a later partial observation is no refund. */
async function conversationOperations(db:PoolClient,conversationId:string):Promise<OperationRow[]>{
 const live=(await db.query<OperationRow>(`SELECT o.* FROM specialist_operations o JOIN specialist_discussions d ON d.id=o.discussion_id
  WHERE d.conversation_id=$1 ORDER BY o.created_at,o.id LIMIT 513`,[conversationId])).rows;
 const held=(await db.query<OperationRow>(`SELECT h.*,h.operation_id AS id FROM operations_recovery_model_holds h JOIN conversations c ON c.id=h.scope_id AND c.environment_id=h.environment_id
  WHERE h.scope_id=$1 AND h.operation_kind='specialist' ORDER BY h.operation_id LIMIT 513`,[conversationId])).rows;
 const observations=(await db.query<OperationRow>(`SELECT o.*,o.operation_id AS id FROM operations_recovery_model_observations o
  JOIN operations_recovery_model_holds h USING(environment_id,operation_kind,operation_id)
  JOIN conversations c ON c.id=h.scope_id AND c.environment_id=h.environment_id
  WHERE h.scope_id=$1 AND h.operation_kind='specialist' ORDER BY o.operation_id,o.observed_evidence_digest LIMIT 513`,[conversationId])).rows;
 if(live.length>=512||held.length>=512||observations.length>=512)throw unavailable();
 const merged=new Map<string,OperationRow>();
 for(const row of [...live,...held,...observations]){
  const prior=merged.get(row.id);
  if(prior){
   if(prior.discussion_id!==row.discussion_id||['assignment_id','native_step_key','ceiling_input_tokens','ceiling_output_tokens','ceiling_micro_usd'].some(key=>String(prior[key as keyof OperationRow])!==String(row[key as keyof OperationRow])))throw unavailable();
   if(!prior.settled_at||!row.settled_at){merged.set(row.id,{...prior,settled_at:null});continue;}
   if(['actual_input_tokens','actual_output_tokens','actual_micro_usd'].some(key=>String(prior[key as keyof OperationRow])!==String(row[key as keyof OperationRow])))throw unavailable();
  }else merged.set(row.id,row);
 }
 if(merged.size>=512)throw unavailable();
 return [...merged.values()];
}

export async function remainingLockedSpecialistAllowance(db:PoolClient,discussionId:string,conversationId:string){
 const bound=(await db.query('SELECT input_ceiling,output_ceiling,cost_ceiling_micro_usd FROM specialist_discussions WHERE id=$1 AND conversation_id=$2',[discussionId,conversationId])).rows[0];
 if(!bound)throw unavailable();
 const rows=await conversationOperations(db,conversationId);
 if(rows.length>=512)throw unavailable();
 if(rows.some(row=>row.discussion_id===discussionId&&!row.settled_at&&!row.completed_at))throw new HttpFailure(429,'specialist_usage_unconfirmed','Prior specialist usage must be reconciled before another provider call.');
 const discussion=remainingSpecialistAllowance({inputTokens:Number(bound.input_ceiling),outputTokens:Number(bound.output_ceiling),microUsd:Number(bound.cost_ceiling_micro_usd)},rows.filter(row=>row.discussion_id===discussionId).map(operation));
 const conversation=remainingSpecialistAllowance(conversationSpecialistAllowance,rows.map(operation));
 return {inputTokens:Math.min(discussion.inputTokens,conversation.inputTokens),outputTokens:Math.min(discussion.outputTokens,conversation.outputTokens),microUsd:Math.min(discussion.microUsd,conversation.microUsd)};
}

/** Caller holds conversation/discussion/assignment locks and has just checked
 * current runtime authority and sources. This commits with those checks, before
 * dispatch. The original native step identity cannot be used for another send. */
export async function reserveLockedSpecialistOperation(db:PoolClient,binding:{discussionId:string;assignmentId:string;conversationId:string},input:{nativeStepKey:string;model:string;ceiling:SpecialistAllowance;pricing:Record<string,unknown>}){
 if(!input.nativeStepKey||input.nativeStepKey.length>512||!input.model||!valid(input.ceiling))throw unavailable();
 const bound=(await db.query(`SELECT d.input_ceiling,d.output_ceiling,d.cost_ceiling_micro_usd FROM specialist_discussions d
  JOIN specialist_assignments a ON a.discussion_id=d.id WHERE d.id=$1 AND a.id=$2 AND d.conversation_id=$3
   AND d.state='open' AND d.expires_at>clock_timestamp() AND a.authority_expires_at>clock_timestamp()
   AND a.state IN('admitted','working','waiting_input')`,[binding.discussionId,binding.assignmentId,binding.conversationId])).rows[0];
 if(!bound)throw unavailable();
 if((await db.query(`SELECT 1 FROM specialist_operations WHERE native_step_key=$1 UNION ALL SELECT 1 FROM operations_recovery_model_holds WHERE operation_kind='specialist' AND native_step_key=$1`,[input.nativeStepKey])).rowCount)
  throw new HttpFailure(409,'specialist_dispatch_uncertain','The prior provider operation must be reconciled; it cannot be sent again.');
 const rows=await conversationOperations(db,binding.conversationId);
 if(rows.length>=512)throw unavailable();
 if(rows.some(row=>row.discussion_id===binding.discussionId&&!row.settled_at&&!row.completed_at))
  throw new HttpFailure(429,'specialist_usage_unconfirmed','Prior specialist usage must be reconciled before another provider call.');
 assertSpecialistReservation({inputTokens:Number(bound.input_ceiling),outputTokens:Number(bound.output_ceiling),microUsd:Number(bound.cost_ceiling_micro_usd)},rows.filter(row=>row.discussion_id===binding.discussionId).map(operation),input.ceiling);
 assertSpecialistReservation(conversationSpecialistAllowance,rows.map(operation),input.ceiling);
 const rootUsed=Number((await db.query('SELECT turas_ordinary_output_used($1) AS used',[binding.conversationId])).rows[0]?.used??NaN);
 if(!Number.isSafeInteger(rootUsed)||rootUsed>=ordinaryConversationOutputLimit)throw unavailable();
 const id=randomUUID();
 await db.query(`INSERT INTO specialist_operations(id,discussion_id,assignment_id,native_step_key,model,ceiling_input_tokens,ceiling_output_tokens,ceiling_micro_usd,pricing)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,binding.discussionId,binding.assignmentId,input.nativeStepKey,input.model,input.ceiling.inputTokens,input.ceiling.outputTokens,input.ceiling.microUsd,JSON.stringify(input.pricing)]);
 return {id,...input.ceiling};
}

function tokenCount(value:unknown):number|null{
 const number=typeof value==='number'?value:typeof value==='object'&&value!==null&&'total' in value?value.total:null;
 return typeof number==='number'&&Number.isSafeInteger(number)&&number>=0?number:null;
}

/** A confirmed response may finish execution while its monetary cost remains
 * unknown. Preserve the reservation independently from that completion fact. */
export async function markSpecialistOperationCompleted(id:string){
 await withTransaction(async db=>{
  const scope=(await db.query(`SELECT d.conversation_id,o.discussion_id,o.assignment_id FROM specialist_operations o
   JOIN specialist_discussions d ON d.id=o.discussion_id WHERE o.id=$1`,[id])).rows[0];
  if(!scope)return;
  await db.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[scope.conversation_id]);
  await db.query('SELECT id FROM specialist_discussions WHERE id=$1 FOR UPDATE',[scope.discussion_id]);
  await db.query('SELECT id FROM specialist_assignments WHERE id=$1 FOR UPDATE',[scope.assignment_id]);
  await db.query('UPDATE specialist_operations SET completed_at=clock_timestamp() WHERE id=$1 AND completed_at IS NULL',[id]);
 });
}

/** Accounting may settle after cancellation/logout. This grants no retrieval or
 * dispatch permission and never reopens an assignment. Incomplete receipts retain
 * the whole reservation; populated actuals cannot be overwritten. */
export async function settleSpecialistOperation(id:string,usage:unknown,metadata:unknown){
 await markSpecialistOperationCompleted(id);
 if(typeof usage!=='object'||usage===null||!('inputTokens' in usage)||!('outputTokens' in usage))return;
 const input=tokenCount(usage.inputTokens),output=tokenCount(usage.outputTokens);
 const gateway=typeof metadata==='object'&&metadata!==null&&'gateway' in metadata?metadata.gateway:null;
 const rawCost=typeof gateway==='object'&&gateway!==null&&'cost' in gateway?gateway.cost:null;
 const usd=(typeof rawCost==='number'||typeof rawCost==='string'&&rawCost.trim()!=='')?Number(rawCost):NaN;
 const cost=Math.ceil(usd*1000000);
 if(input===null||output===null||!Number.isFinite(usd)||usd<0||!Number.isSafeInteger(cost))return;
 await withTransaction(async db=>{
  const scope=(await db.query(`SELECT d.conversation_id,o.discussion_id,o.assignment_id FROM specialist_operations o
   JOIN specialist_discussions d ON d.id=o.discussion_id WHERE o.id=$1`,[id])).rows[0];
  if(!scope)return;
  await db.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[scope.conversation_id]);
  await db.query('SELECT id FROM specialist_discussions WHERE id=$1 FOR UPDATE',[scope.discussion_id]);
  await db.query('SELECT id FROM specialist_assignments WHERE id=$1 FOR UPDATE',[scope.assignment_id]);
  const row=(await db.query<OperationRow>('SELECT * FROM specialist_operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row||row.settled_at)return;
  await db.query(`UPDATE specialist_operations SET actual_input_tokens=$2,actual_output_tokens=$3,actual_micro_usd=$4,settled_at=clock_timestamp() WHERE id=$1`,[id,input,output,cost]);
  if(input>Number(row.ceiling_input_tokens)||output>Number(row.ceiling_output_tokens)||cost>Number(row.ceiling_micro_usd))
   await db.query("UPDATE specialist_discussions SET state='stopping',close_reason='budget_unavailable',version=version+1 WHERE id=$1 AND state='open'",[scope.discussion_id]);
 });
}
