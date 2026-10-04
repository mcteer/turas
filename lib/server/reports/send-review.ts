import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {reportHead} from './revisions';
import {lockReportActor} from './policy';
import {reportRevisionFence} from './release';
import {readReportPolicy} from './recipient-policy';
import {verifyPolicyRecipientAuthority} from './recipients';
import {requireVerifiedReportSender} from './senders';
import {createReportPreview,requireReportPreview} from './previews';
import {recordReportDecision} from './decisions';
import {readReportObject} from './store';
import {freezeReportMail} from './resend';
import {reportDigest} from './commands';
import {reportDeliveryIdentity} from '../../reports/delivery-identity';
import {chargeReportRate,requireReportQueueCapacity} from './rates';

export type ReportSendReview={policyId:string;expectedVersion:number;expectedPolicyVersion:number};
export async function reportSendBinding(db:PoolClient,actor:CurrentSession,publicationId:string,input:ReportSendReview){
 const publication=(await db.query('SELECT * FROM report_publications WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[publicationId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!publication)throw hiddenRecord();
 const head=await reportHead(db,actor,publication.report_id);
 await lockReportActor(db,actor,head.customer_id,'send',head.audience,false,true);
 if(Number(head.version)!==input.expectedVersion || head.current_revision_id!==publication.revision_id)throw new HttpFailure(409,'version_conflict','Published report changed');
 const revision=await reportRevisionFence(db,actor.workspaceId,publication.revision_id,{published:true,send:true});
 if(revision.state!=='published')throw new HttpFailure(409,'version_conflict','Publish the report before reviewing delivery');
 const policy=await readReportPolicy(db,actor,input.policyId);
 if(policy.customerId!==head.customer_id || policy.state!=='approved' || policy.version!==input.expectedPolicyVersion || reportDigest(policy.selection)!==reportDigest({kind:head.kind,audience:head.audience,timezone:head.timezone,engagementIds:[...head.engagement_ids].sort(),workloadIds:[...head.workload_ids].sort(),includeCustomerLevel:head.include_customer_level}))throw new HttpFailure(409,'policy_changed','Approved policy does not match this report');
 const policyHead=(await db.query('SELECT state,version FROM report_policy_heads WHERE policy_id=$1 FOR SHARE',[input.policyId])).rows[0];
 if(policyHead.state!=='approved' || Number(policyHead.version)!==policy.version)throw new HttpFailure(409,'policy_changed','Policy changed');
 const recipients=(await db.query('SELECT * FROM report_policy_recipients WHERE policy_revision_id=$1 ORDER BY recipient_identity',[policy.policyRevisionId])).rows;
 if(!recipients.length || recipients.length>20 || recipients.some(row=>new Date(row.expires_at).getTime()<=Date.now()))throw new HttpFailure(409,'policy_changed','Policy recipients are unavailable');
 await verifyPolicyRecipientAuthority(db,actor.workspaceId,head.audience,recipients);
 const suppressed=(await db.query('SELECT 1 FROM report_recipient_suppressions WHERE recipient_identity=ANY($1::uuid[]) AND resolved_by_decision_id IS NULL',[recipients.map(row=>row.recipient_identity)])).rowCount;
 if(suppressed)throw new HttpFailure(409,'recipient_suppressed','A reviewed recipient is suppressed');
 if((await db.query('SELECT 1 FROM report_deliveries WHERE publication_id=$1',[publicationId])).rowCount)throw new HttpFailure(409,'delivery_exists','This publication already has authorized deliveries');
 const sender=await requireVerifiedReportSender(db,actor.workspaceId,policy.senderId);
 const mail=(await db.query('SELECT * FROM report_mail_payloads WHERE revision_id=$1',[publication.revision_id])).rows[0];
 if(!mail || mail.content_digest!==publication.mail_digest)throw new HttpFailure(409,'payload_changed','Published mail is unavailable');
 const attachments:Array<{format:'pdf'|'pptx';bytes:Buffer}>=[];
 if(head.kind!=='weekly'){
  const artifacts=(await db.query('SELECT * FROM report_artifacts WHERE revision_id=$1 AND validation_id IS NOT NULL ORDER BY format',[publication.revision_id])).rows;
  for(const format of ['pdf','pptx'] as const){
   const artifact=artifacts.find(row=>row.format===format && row.content_digest===publication.artifact_digests[format]);
   if(!artifact)throw new HttpFailure(409,'payload_changed','Published files are unavailable');
   attachments.push({format,bytes:await readReportObject(artifact.object_key,artifact.content_digest,Number(artifact.size_bytes))});
  }
 }
 const subject=`${head.kind==='weekly'?'Weekly Delivery Report':'Executive Review'}: ${head.from_date} to ${head.to_date}`;
 const frozen=recipients.map(recipient=>{
  const deliveryId=reportDeliveryIdentity(process.env.TURAS_ENVIRONMENT_ID!,publicationId,recipient.recipient_identity,'delivery');
  const providerKey=reportDeliveryIdentity(process.env.TURAS_ENVIRONMENT_ID!,publicationId,recipient.recipient_identity,'provider');
  return {recipient,deliveryId,providerKey,...freezeReportMail({from:sender.address,to:recipient.address,subject,html:mail.html,text:mail.plain_text,attachments,deliveryId})};
 });
 const binding={action:'authorize_send',publicationId,revisionId:publication.revision_id,reportVersion:input.expectedVersion,policyId:policy.policyId,policyRevisionId:policy.policyRevisionId,policyVersion:policy.version,senderId:sender.id,senderVersion:sender.version,senderDigest:sender.digest,senderAddress:sender.address,mailDigest:publication.mail_digest,artifactDigests:publication.artifact_digests,subject,html:mail.html,plainText:mail.plain_text,
  recipients:frozen.map(row=>({identity:row.recipient.recipient_identity,address:row.recipient.address,membershipId:row.recipient.membership_id,entitlementRationale:row.recipient.entitlement_rationale,deliveryId:row.deliveryId,providerKey:row.providerKey,payloadDigest:row.digest}))};
 return {head,publication,policy,sender,frozen,binding};
}
export async function createReportSendPreview(db:PoolClient,actor:CurrentSession,publicationId:string,input:ReportSendReview){
 const current=await reportSendBinding(db,actor,publicationId,input);
 return {...await createReportPreview(db,actor,current.head.customer_id,publicationId,'send',input.expectedVersion,current.binding),binding:current.binding};
}
export async function authorizeReportSend(db:PoolClient,actor:CurrentSession,publicationId:string,input:ReportSendReview&{requestKey:string;previewId:string;previewDigest:string;rationale:string}){
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-send:${process.env.TURAS_ENVIRONMENT_ID}:${publicationId}`]);
 const current=await reportSendBinding(db,actor,publicationId,input);
 await requireReportPreview(db,actor,publicationId,'send',input.previewId,input.previewDigest,input.expectedVersion,current.binding);
 await requireReportQueueCapacity(db,actor.workspaceId,'delivery',current.frozen.length);
 await chargeReportRate(db,actor.workspaceId,'recipient-deliveries',100,86400,current.frozen.length);
 const decisionId=await recordReportDecision(db,actor,current.head.customer_id,{action:'authorize_send',subjectId:publicationId,revisionId:current.publication.revision_id,expectedVersion:input.expectedVersion,previewDigest:input.previewDigest,rationale:input.rationale,requestKey:input.requestKey});
 for(const row of current.frozen){
  await db.query(`INSERT INTO report_deliveries(id,environment_id,workspace_id,customer_id,publication_id,policy_revision_id,recipient_identity,sender_id,authority_decision_id,payload_digest,provider_key,sender_version,sender_config_digest,authorized_policy_version,state,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'queued',now())`,[row.deliveryId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,current.head.customer_id,publicationId,current.policy.policyRevisionId,row.recipient.recipient_identity,current.sender.id,decisionId,row.digest,row.providerKey,current.sender.version,current.sender.digest,current.policy.version]);
  await db.query("INSERT INTO report_delivery_payloads(delivery_id,request_bytes,expires_at) VALUES($1,$2,now()+interval '365 days')",[row.deliveryId,row.bytes]);
 }
 return {publicationId,reportId:current.head.id,decisionId,deliveries:current.frozen.length};
}
