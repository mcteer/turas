import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {z} from 'zod';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {reportCommandSchema,reportId} from './schema';
import {executeReportCommand,reportTransaction,reportDigest} from './commands';
import {lockReportActor} from './policy';
import {chargeReportRate} from './rates';
import {retrieveReportMail,type ReportProviderFetch} from './resend';
import {reportConfig} from './config';
import {recordReportDecision} from './decisions';
import {projectDeliveryEvents,requireReportDeliveryAuthority} from './outbox';
import {reportDeliveryMayPost} from '../../reports/delivery-state';
export const reportDeliveryCommandSchema=reportCommandSchema.extend({action:z.enum(['cancel','retry','reconcile']),providerMessageId:reportId.optional()}).refine(input=>input.action==='reconcile'||input.providerMessageId===undefined);
async function deliveryForActor(db:PoolClient,actor:CurrentSession,id:string,lock=false){
 const row=(await db.query(`SELECT d.*,p.revision_id,p.report_id,v.audience FROM report_deliveries d JOIN report_publications p ON p.id=d.publication_id JOIN report_scopes v ON v.id=p.report_id WHERE d.id=$1 AND d.environment_id=$2 AND d.workspace_id=$3 ${lock?'FOR NO KEY UPDATE OF d':''}`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
 if(!row)throw hiddenRecord();await lockReportActor(db,actor,row.customer_id,'reconcile',row.audience);return row;
}
export async function readReportDelivery(db:PoolClient,actor:CurrentSession,id:string){
 const row=await deliveryForActor(db,actor,id);
 return {deliveryId:id,reportId:row.report_id,publicationId:row.publication_id,version:Number(row.version),state:row.state,attemptCount:row.attempt_count,firstDispatchAt:row.first_dispatch_at?.toISOString()??null,providerMessageId:row.provider_message_id,failureCode:row.failure_code};
}
export async function submitReportDeliveryCommand(actor:CurrentSession,deliveryId:string,raw:unknown,providerFetch?:ReportProviderFetch){
 reportId.parse(deliveryId);const parsed=reportDeliveryCommandSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid delivery command');const input=parsed.data;
 const row=await reportTransaction(db=>deliveryForActor(db,actor,deliveryId));
 let proof:Awaited<ReturnType<typeof retrieveReportMail>>|null=null;
 if(input.action==='reconcile'){
  const prepared=await reportTransaction(async db=>{
   const current=await deliveryForActor(db,actor,deliveryId);
   const prior=(await db.query('SELECT 1 FROM report_command_receipts WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4',[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,input.requestKey])).rowCount;
   if(prior)return null;
   if(Number(current.version)!==input.expectedVersion)throw new HttpFailure(409,'version_conflict','Delivery changed');
   const messageId=current.provider_message_id??input.providerMessageId;
   if(!messageId || !current.first_dispatch_at)throw new HttpFailure(409,'provider_evidence_required','A known provider message ID is required');
   if(input.providerMessageId && current.provider_message_id && input.providerMessageId!==current.provider_message_id)throw new HttpFailure(409,'provider_evidence_mismatch','Provider identity changed');
   await chargeReportRate(db,actor.workspaceId,`reconcile:${deliveryId}`,1,60);
   const payload=(await db.query('SELECT request_bytes FROM report_delivery_payloads WHERE delivery_id=$1 AND expires_at>now()',[deliveryId])).rows[0];
   if(!payload)throw new HttpFailure(409,'payload_expired','Original delivery content has expired');
   return {messageId,requestBytes:payload.request_bytes,payloadDigest:current.payload_digest};
  });
  if(prepared){const apiKey=reportConfig().apiKey;if(!apiKey)throw new HttpFailure(503,'sender_unavailable','Provider evidence lookup unavailable');proof=await retrieveReportMail({...prepared,apiKey,deliveryId},providerFetch);}
 }
 return executeReportCommand(actor,row.customer_id,row.audience,'reconcile',reportDeliveryCommandSchema,input,async(db,command)=>{
  const current=await deliveryForActor(db,actor,deliveryId,true);
  if(Number(current.version)!==command.expectedVersion || current.state==='dispatching')throw new HttpFailure(409,'version_conflict','Delivery changed');
  if(command.action==='reconcile'){
   if(!proof || current.payload_digest!==row.payload_digest || (current.provider_message_id && current.provider_message_id!==proof.messageId))throw new HttpFailure(409,'provider_evidence_mismatch','Verified provider evidence changed');
   const digest=reportDigest({deliveryId,messageId:proof.messageId,evidence:proof.evidence,payloadDigest:row.payload_digest});
   await recordReportDecision(db,actor,row.customer_id,{action:'reconcile',subjectId:deliveryId,revisionId:row.revision_id,expectedVersion:command.expectedVersion,previewDigest:digest,rationale:command.rationale,requestKey:command.requestKey});
   await db.query('INSERT INTO report_delivery_events(id,environment_id,provider_event_id,provider_message_id,delivery_id,event_type,occurred_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,`reconcile:${command.requestKey}`,proof.messageId,deliveryId,proof.evidence]);
   await projectDeliveryEvents(db,deliveryId);
  }else if(command.action==='cancel'){
   if(!['authorized','queued','retryable_failure','uncertain'].includes(current.state))throw new HttpFailure(409,'version_conflict','Delivery cannot be cancelled');
   await db.query("UPDATE report_deliveries SET state=CASE WHEN first_dispatch_at IS NULL THEN 'cancelled' ELSE 'uncertain' END,next_attempt_at=NULL,failure_code='operator_cancelled',version=version+1 WHERE id=$1",[deliveryId]);
  }else{
   if(!reportDeliveryMayPost({state:current.state,attemptCount:current.attempt_count,firstDispatchAt:current.first_dispatch_at?.toISOString()??null},new Date().toISOString()))throw new HttpFailure(409,'retry_unavailable','Original delivery cannot be retried');
   await requireReportDeliveryAuthority(db,current);
   await db.query('UPDATE report_deliveries SET next_attempt_at=now(),version=version+1 WHERE id=$1',[deliveryId]);
  }
  return {deliveryId};
 },(db)=>readReportDelivery(db,actor,deliveryId),{subjectId:deliveryId,settlement:input.action!=='retry'});
}
