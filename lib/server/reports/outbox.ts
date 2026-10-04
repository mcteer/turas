import {randomUUID,createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {withTransaction} from '../db/client';
import {HttpFailure} from '../../contracts/http';
import {lockReportJobAuthority} from './actor';
import {requireReportEnvironment} from './readiness';
import {reportRevisionFence} from './release';
import {requireVerifiedReportSender} from './senders';
import {verifyPolicyRecipientAuthority} from './recipients';
import {sendReportMail,type ReportProviderFetch} from './resend';
import {reportConfig} from './config';
import {reportId,reportDigestSchema} from './schema';
import {reportDeliveryMayPost,reportDeliveryRetry,projectReportDeliveryEvidence,type ReportDeliveryEvidence} from '../../reports/delivery-state';

export async function requireReportDeliveryAuthority(db:PoolClient,row:any){
 const decision=(await db.query(`SELECT actor_membership_id FROM report_decisions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 AND action='authorize_send' AND subject_id=$5`,[row.authority_decision_id,row.environment_id,row.workspace_id,row.customer_id,row.publication_id])).rows[0];
 if(!decision)throw new HttpFailure(403,'forbidden','Delivery authority unavailable');
 await lockReportJobAuthority(db,{environmentId:row.environment_id,workspaceId:row.workspace_id,customerId:row.customer_id,ownerMembershipId:decision.actor_membership_id,ownerDecisionId:row.authority_decision_id,policyRevisionId:row.policy_revision_id},true);
 await requireReportEnvironment(db,true);
 const publication=(await db.query('SELECT * FROM report_publications WHERE id=$1',[row.publication_id])).rows[0];
 const revision=await reportRevisionFence(db,row.workspace_id,publication.revision_id,{published:true,send:true});
 const head=(await db.query('SELECT current_revision_id FROM report_scopes WHERE id=$1 FOR SHARE',[publication.report_id])).rows[0];
 if(revision.state!=='published' || head.current_revision_id!==publication.revision_id)throw new HttpFailure(409,'source_changed','Publication changed');
 const policy=(await db.query(`SELECT p.audience,h.version FROM report_recipient_policies p JOIN report_policy_heads h ON h.current_revision_id=p.id WHERE p.id=$1 AND h.state='approved' FOR SHARE OF p,h`,[row.policy_revision_id])).rows[0];
 if(!policy || Number(policy.version)!==Number(row.authorized_policy_version))throw new HttpFailure(409,'policy_changed','Policy changed after send approval');
 const recipient=(await db.query('SELECT * FROM report_policy_recipients WHERE policy_revision_id=$1 AND recipient_identity=$2 AND expires_at>now()',[row.policy_revision_id,row.recipient_identity])).rows[0];
 if(!recipient)throw new HttpFailure(409,'policy_changed','Reviewed recipient unavailable');
 await verifyPolicyRecipientAuthority(db,row.workspace_id,policy.audience,[recipient]);
 const sender=await requireVerifiedReportSender(db,row.workspace_id,row.sender_id);
 if(sender.version!==Number(row.sender_version) || sender.digest!==row.sender_config_digest)throw new HttpFailure(409,'sender_changed','Sender changed after send approval');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-suppression:${row.environment_id}:${row.recipient_identity}`]);
 if((await db.query('SELECT 1 FROM report_recipient_suppressions WHERE recipient_identity=$1 AND resolved_by_decision_id IS NULL',[row.recipient_identity])).rowCount || (await db.query("SELECT 1 FROM report_delivery_events e JOIN report_deliveries d ON d.id=e.delivery_id WHERE d.recipient_identity=$1 AND e.event_type IN ('bounced','complained') LIMIT 1",[row.recipient_identity])).rowCount)throw new HttpFailure(409,'recipient_suppressed','Recipient is suppressed');
 return {sender,recipient};
}
export async function projectDeliveryEvents(db:PoolClient,deliveryId:string){
 const row=(await db.query('SELECT recipient_identity,state FROM report_deliveries WHERE id=$1 AND environment_id=$2 FOR NO KEY UPDATE',[deliveryId,process.env.TURAS_ENVIRONMENT_ID])).rows[0];if(!row)return;
 const events=(await db.query('SELECT id,event_type,provider_message_id FROM report_delivery_events WHERE delivery_id=$1 ORDER BY occurred_at,id',[deliveryId])).rows;
 const projected=projectReportDeliveryEvidence(events.map(event=>event.event_type as ReportDeliveryEvidence));
 const suppression=events.find(event=>event.event_type==='complained')??events.find(event=>event.event_type==='bounced');
 if(suppression)await db.query('INSERT INTO report_recipient_suppressions(recipient_identity,event_id) VALUES($1,$2) ON CONFLICT(recipient_identity) DO NOTHING',[row.recipient_identity,suppression.id]);
 if(projected)await db.query('UPDATE report_deliveries SET state=$2,provider_message_id=COALESCE(provider_message_id,$3),version=version+1,lease_token=NULL,lease_until=NULL,next_attempt_at=NULL WHERE id=$1',[deliveryId,projected,events[0]?.provider_message_id]);
}
/** Intent is committed before POST; external calls never run inside a retrying transaction. */
export async function claimReportDeliveries(db:PoolClient,limit=2,exact?:{deliveryId:string;payloadDigest:string;firstAttemptOnly:true}){
  if(!Number.isInteger(limit)||limit<1||limit>2)throw new HttpFailure(422,'invalid_input','Invalid delivery claim limit');
  if(exact&&(!reportId.safeParse(exact.deliveryId).success||!reportDigestSchema.safeParse(exact.payloadDigest).success||exact.firstAttemptOnly!==true||limit!==1))throw new HttpFailure(422,'invalid_input','Invalid exact delivery claim');
 await requireReportEnvironment(db,true);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-outbox:${process.env.TURAS_ENVIRONMENT_ID}`]);
 // A lost lease preserves ambiguity and the original first-dispatch clock.
 await db.query("UPDATE report_deliveries SET state='uncertain',lease_token=NULL,lease_until=NULL,next_attempt_at=now(),failure_code='dispatch_interrupted',version=version+1 WHERE environment_id=$1 AND state='dispatching' AND lease_until<=now()",[process.env.TURAS_ENVIRONMENT_ID]);
 const active=Number((await db.query("SELECT count(*) AS n FROM report_deliveries WHERE environment_id=$1 AND state='dispatching' AND lease_until>now()",[process.env.TURAS_ENVIRONMENT_ID])).rows[0].n);
 const capacity=Math.max(0,Math.min(limit,2-active));if(!capacity)return [];
  const rows=(await db.query(`SELECT * FROM report_deliveries WHERE environment_id=$1 AND state IN ('authorized','queued','retryable_failure','uncertain') AND attempt_count<3 AND ((state IN ('authorized','queued') AND next_attempt_at IS NULL) OR next_attempt_at<=now()) AND (first_dispatch_at IS NULL OR first_dispatch_at>now()-interval '23 hours')
   AND ($3::uuid IS NULL OR (id=$3 AND payload_digest=$4 AND attempt_count=0 AND first_dispatch_at IS NULL))
   ORDER BY attempt_count,created_at,customer_id,id LIMIT $2 FOR NO KEY UPDATE SKIP LOCKED`,[process.env.TURAS_ENVIRONMENT_ID,capacity,exact?.deliveryId??null,exact?.payloadDigest??null])).rows;
 const claimed=[];
 for(const row of rows){
  if(!reportDeliveryMayPost({state:row.state,attemptCount:row.attempt_count,firstDispatchAt:row.first_dispatch_at?.toISOString()??null},new Date().toISOString()))continue;
  try{await requireReportDeliveryAuthority(db,row);}catch(error){if(!(error instanceof HttpFailure))throw error;await db.query("UPDATE report_deliveries SET state=CASE WHEN first_dispatch_at IS NULL THEN 'blocked' ELSE 'uncertain' END,failure_code='eligibility_changed',next_attempt_at=NULL,version=version+1 WHERE id=$1",[row.id]);continue;}
  const leaseToken=randomUUID(),attemptId=randomUUID();
  const current=(await db.query("UPDATE report_deliveries SET state='dispatching',first_dispatch_at=COALESCE(first_dispatch_at,clock_timestamp()),attempt_count=attempt_count+1,lease_token=$2,lease_until=now()+interval '180 seconds',next_attempt_at=NULL,version=version+1 WHERE id=$1 RETURNING *",[row.id,leaseToken])).rows[0];
  await db.query('INSERT INTO report_delivery_attempts(id,environment_id,workspace_id,customer_id,delivery_id,attempt_number,lease_token,request_digest,dispatch_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())',[attemptId,current.environment_id,current.workspace_id,current.customer_id,current.id,current.attempt_count,leaseToken,current.payload_digest]);
  claimed.push({...current,attemptId});
 }
 return claimed;
}
export async function dispatchReportDelivery(claim:{id:string;lease_token:string;attemptId:string},providerFetch?:ReportProviderFetch){
  if(!providerFetch && !reportConfig().deliveryEnabled)throw new HttpFailure(503,'delivery_disabled','Report provider dispatch is disabled');
  const prepared=await withTransaction(async db=>{
  const row=(await db.query("SELECT * FROM report_deliveries WHERE id=$1 AND environment_id=$2 AND state='dispatching' AND lease_token=$3 AND lease_until>now() AND first_dispatch_at>now()-interval '23 hours' FOR NO KEY UPDATE",[claim.id,process.env.TURAS_ENVIRONMENT_ID,claim.lease_token])).rows[0];
  if(!row)throw new HttpFailure(409,'version_conflict','Delivery lease changed');
  const attempt=(await db.query('SELECT id FROM report_delivery_attempts WHERE id=$1 AND delivery_id=$2 AND lease_token=$3 AND attempt_number=$4 AND request_digest=$5',[claim.attemptId,row.id,claim.lease_token,row.attempt_count,row.payload_digest])).rows[0];
  if(!attempt)throw new HttpFailure(409,'version_conflict','Dispatch intent is unavailable');
  try{
   const authority=await requireReportDeliveryAuthority(db,row);
   const payload=(await db.query('SELECT request_bytes FROM report_delivery_payloads WHERE delivery_id=$1 AND expires_at>now()',[row.id])).rows[0];
   if(!payload || createHash('sha256').update(payload.request_bytes).digest('hex')!==row.payload_digest)throw new HttpFailure(409,'payload_changed','Frozen delivery unavailable');
   const request=JSON.parse(payload.request_bytes.toString('utf8'));
   if(request.from!==authority.sender.address || request.to?.length!==1 || request.to[0]!==authority.recipient.address || request.tags?.[0]?.value!==row.id)throw new HttpFailure(409,'payload_changed','Reviewed recipient changed');
   const apiKey=reportConfig().apiKey;if(!apiKey)throw new HttpFailure(503,'sender_unavailable','Report provider unavailable');
    return {ready:true as const,row,attempt,apiKey,requestBytes:payload.request_bytes as Buffer};
  }catch(error){
   if(!(error instanceof HttpFailure))throw error;
   await db.query("UPDATE report_deliveries SET state='uncertain',failure_code='eligibility_changed',next_attempt_at=NULL,lease_token=NULL,lease_until=NULL,version=version+1 WHERE id=$1",[row.id]);
    return {ready:false as const,deliveryId:row.id,state:'uncertain'};
  }
  });
  if(!prepared.ready)return {deliveryId:prepared.deliveryId,state:prepared.state};
  const {row,attempt,apiKey,requestBytes}=prepared;
  // The persisted intent survives a crash here. Never retry this network call through a DB transaction.
  const outcome=await sendReportMail({apiKey,providerKey:row.provider_key,requestBytes,payloadDigest:row.payload_digest},providerFetch);
  return withTransaction(async db=>{
   const current=(await db.query('SELECT * FROM report_deliveries WHERE id=$1 AND environment_id=$2 FOR NO KEY UPDATE',[row.id,row.environment_id])).rows[0];
   if(!current || Number(current.attempt_count)!==Number(row.attempt_count) || (current.lease_token && current.lease_token!==claim.lease_token))throw new HttpFailure(409,'version_conflict','Delivery lease changed');
   await db.query('INSERT INTO report_attempt_results(attempt_id,response_class,provider_message_id) VALUES($1,$2,$3)',[attempt.id,outcome.kind,outcome.kind==='provider_accepted'?outcome.messageId:null]);
   let state:string=outcome.kind,delay:number|null=null;
   if(outcome.kind==='uncertain'||outcome.kind==='retryable_failure'){const retry=reportDeliveryRetry(outcome.kind,row.attempt_count,outcome.kind==='retryable_failure'?outcome.retryAfterSeconds:0);state=retry.state;delay=retry.delaySeconds;}
   await db.query('UPDATE report_deliveries SET state=$2,provider_message_id=COALESCE(provider_message_id,$3),failure_code=$4,next_attempt_at=CASE WHEN $5::int IS NULL THEN NULL ELSE now()+($5*interval \'1 second\') END,lease_token=NULL,lease_until=NULL,version=version+1 WHERE id=$1',[row.id,state,outcome.kind==='provider_accepted'?outcome.messageId:null,'code' in outcome?outcome.code:null,delay]);
   await projectDeliveryEvents(db,row.id);
   const settled=(await db.query('SELECT state FROM report_deliveries WHERE id=$1',[row.id])).rows[0];
   return {deliveryId:row.id,state:settled.state as string};
  });
}
