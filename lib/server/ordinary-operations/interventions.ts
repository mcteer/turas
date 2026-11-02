import {humanResponderScope} from '../conversations/human-responder';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {withTransaction} from '../db/client';
import {ordinaryActor} from './reads';
import {lockExecutionActor} from '../execution/policy';
import {readEngagement} from '../engagements/read';
import {executionRecordHead,lockRecordContext} from '../execution/records';
import {executionRecordSchema} from '../execution/schema';
import {getServerConfig} from '../config';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import type {customerQuestionActor} from '../conversations/customer-accounts';
export const interventionSchema=z.object({engagementId:z.uuid(),proposalId:z.uuid(),proposalRevisionId:z.uuid(),expectedVersion:z.number().int().positive().safe(),idempotencyKey:z.uuid(),status:z.enum(['approved','rejected','deferred']),rationale:z.string().trim().min(10).max(1000)}).strict();
type Principal=Parameters<typeof customerQuestionActor>[1];
const digest=(input:z.infer<typeof interventionSchema>)=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
const conflict=()=>new HttpFailure(409,'intervention_changed','The intervention, decision or baseline changed; inspect and review the exact proposal again');
function receipt(row:Record<string,unknown>){return {id:row.id,engagementId:row.engagement_id,proposalId:row.proposal_id,proposalRevisionId:row.proposal_revision_id,status:row.status,rationale:row.rationale,createdAt:row.created_at instanceof Date?row.created_at.toISOString():row.created_at};}
/** Denying a native request requires the same live owner and reviewer rights,
 * but creates neither a decision nor an execution authorization. */
export async function authorizeOrdinaryInterventionDenial(responder:Principal,input:unknown){
 const command=interventionSchema.parse(input);
 return withTransaction(async db=>{
  const scope=await humanResponderScope(db,responder);
  const engagement=await readEngagement(scope.actor,command.engagementId,db);
  if(!scope.general&&scope.customerId!==engagement.customerId)throw hiddenRecord();
  await lockExecutionActor(db,scope.actor,engagement.customerId,'review',true);
 });
}
/** Native approval response only; the executor never creates human authorization. */
export async function approveOrdinaryIntervention(responder:Principal,input:unknown,native:{requestId:string;callId:string}){
 const command=interventionSchema.parse(input);if(!native.requestId||!native.callId)throw hiddenRecord();
 return withTransaction(async db=>{
  const scope=await humanResponderScope(db,responder);
  const engagement=await readEngagement(scope.actor,command.engagementId,db);
  if(!scope.general&&scope.customerId!==engagement.customerId)throw hiddenRecord();
  await lockExecutionActor(db,scope.actor,engagement.customerId,'review',true);
  const env=getServerConfig().TURAS_ENVIRONMENT_ID,hash=digest(command);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${env}:${scope.actor.workspaceId}:intervention:${scope.actor.membershipId}:${command.idempotencyKey}`]);
  const prior=(await db.query('SELECT * FROM ordinary_intervention_decisions WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4',[env,scope.actor.workspaceId,scope.actor.membershipId,command.idempotencyKey])).rows[0];
  async function authorize(decision:Record<string,unknown>){
   const existing=(await db.query('SELECT decision_id,native_call_id FROM ordinary_intervention_authorizations WHERE environment_id=$1 AND workspace_id=$2 AND attempt_id=$3 AND native_request_id=$4',[env,scope.actor.workspaceId,scope.attemptId,native.requestId])).rows[0];
   if(existing){if(existing.decision_id!==decision.id||existing.native_call_id!==native.callId)throw conflict();return receipt(decision);}
   await db.query(`INSERT INTO ordinary_intervention_authorizations(id,decision_id,environment_id,workspace_id,actor_membership_id,actor_session_id,attempt_id,native_request_id,native_call_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),decision.id,env,scope.actor.workspaceId,scope.actor.membershipId,scope.actor.sessionId,scope.attemptId,native.requestId,native.callId]);
   return receipt(decision);
  }
  if(prior){if(prior.request_digest!==hash)throw conflict();return authorize(prior);}
  const head=await executionRecordHead(db,scope.actor,command.engagementId,command.proposalId);
  if(head.kind!=='scope_change'||!['draft','submitted'].includes(head.state)||Number(head.version)!==command.expectedVersion||head.current_revision_id!==command.proposalRevisionId||head.baseline_id!==engagement.activeBaselineId)throw conflict();
  const stored=(await db.query('SELECT content FROM execution_record_payloads WHERE revision_id=$1',[command.proposalRevisionId])).rows[0];
  const content=executionRecordSchema.parse(stored?.content);if(content.kind!=='scope_change'||content.state!=='proposed')throw conflict();
  await lockRecordContext(db,scope.actor,engagement.customerId,command.engagementId,head.baseline_id,content,command.proposalRevisionId,true);
  // Plan and source locks precede the exact proposal head, matching canonical
  // read/write order. Recording a separate receipt does not mutate the proposal.
  const locked=await executionRecordHead(db,scope.actor,command.engagementId,command.proposalId,'share');
  if(locked.kind!==head.kind||locked.state!==head.state||Number(locked.version)!==command.expectedVersion||locked.current_revision_id!==command.proposalRevisionId||locked.baseline_id!==head.baseline_id)throw conflict();
  const row=(await db.query(`INSERT INTO ordinary_intervention_decisions(id,environment_id,workspace_id,customer_id,engagement_id,proposal_id,proposal_revision_id,proposal_version,baseline_id,actor_membership_id,actor_session_id,attempt_id,native_request_id,native_call_id,request_key,request_digest,status,rationale)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,[randomUUID(),env,scope.actor.workspaceId,engagement.customerId,command.engagementId,command.proposalId,command.proposalRevisionId,command.expectedVersion,engagement.activeBaselineId,scope.actor.membershipId,scope.actor.sessionId,scope.attemptId,native.requestId,native.callId,command.idempotencyKey,hash,command.status,command.rationale])).rows[0];return authorize(row);
 });
}
export async function recordOrdinaryIntervention(principal:Principal,input:unknown,callId:string){
 const command=interventionSchema.parse(input);return withTransaction(async db=>{
  const scope=await ordinaryActor(db,principal),engagement=await readEngagement(scope.actor,command.engagementId,db);
  if(!scope.general&&scope.customerId!==engagement.customerId)throw hiddenRecord();
  await lockExecutionActor(db,scope.actor,engagement.customerId,'review');
  const row=(await db.query(`SELECT d.* FROM ordinary_intervention_decisions d JOIN ordinary_intervention_authorizations a ON a.decision_id=d.id AND a.environment_id=d.environment_id AND a.workspace_id=d.workspace_id AND a.actor_membership_id=d.actor_membership_id WHERE d.environment_id=$1 AND d.workspace_id=$2 AND d.actor_membership_id=$3 AND a.attempt_id=$4 AND a.native_call_id=$5 AND d.request_key=$6`,[getServerConfig().TURAS_ENVIRONMENT_ID,scope.actor.workspaceId,scope.actor.membershipId,scope.attemptId,callId,command.idempotencyKey])).rows[0];
  if(!row||row.request_digest!==digest(command))throw new HttpFailure(403,'human_approval_required','The exact native human approval receipt is required');
  return {status:'recorded',decision:receipt(row),notice:'Human intervention decision recorded. This does not assign staff, change the accepted baseline or execute a customer change.'};
 });
}
