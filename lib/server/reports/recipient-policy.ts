import {recordReportDecision} from './decisions';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {lockReportActor} from './policy';
import {reportDigest} from './commands';
import {reportRecipientPolicySchema,reportRecipientIdentity,verifyPolicyRecipientAuthority} from './recipients';
import {validateReportSelection} from './projection';
import {requireVerifiedReportSender} from './senders';
import {createReportPreview,requireReportPreview} from './previews';

export type ReportPolicyAction='approve'|'pause'|'resume'|'revoke';
async function policyHead(db:PoolClient,actor:CurrentSession,policyId:string,lock=false){
 const row=(await db.query(`SELECT p.*,h.state,h.version AS head_version,h.approval_decision_id FROM report_policy_heads h JOIN report_recipient_policies p ON p.id=h.current_revision_id
 WHERE h.policy_id=$1 AND p.environment_id=$2 AND p.workspace_id=$3`,[policyId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
 if(!row)throw hiddenRecord();await lockReportActor(db,actor,row.customer_id,'policy',row.audience);
 if(!lock)return row;
 const current=(await db.query(`SELECT p.*,h.state,h.version AS head_version,h.approval_decision_id FROM report_policy_heads h JOIN report_recipient_policies p ON p.id=h.current_revision_id
 WHERE h.policy_id=$1 AND p.environment_id=$2 AND p.workspace_id=$3 FOR UPDATE OF h`,[policyId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
 if(!current || current.customer_id!==row.customer_id)throw hiddenRecord();return current;
}
export async function createReportRecipientPolicy(db:PoolClient,actor:CurrentSession,customerId:string,raw:unknown,previous?:{policyId:string;expectedVersion:number}){
 const parsed=reportRecipientPolicySchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid report recipient policy');const input=parsed.data;
 await lockReportActor(db,actor,customerId,'policy',input.selection.audience,false,true);
 await validateReportSelection(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:actor.workspaceId,customerId,audience:input.selection.audience},input.selection);
 await requireVerifiedReportSender(db,actor.workspaceId,input.senderId);await verifyPolicyRecipientAuthority(db,actor.workspaceId,input.selection.audience,input.recipients);
 const selection={...input.selection,engagementIds:[...input.selection.engagementIds].sort(),workloadIds:[...input.selection.workloadIds].sort()},scopeDigest=reportDigest(selection);
 const old=previous?await policyHead(db,actor,previous.policyId,true):null;
 if(old && (old.customer_id!==customerId || Number(old.head_version)!==previous!.expectedVersion || old.state==='revoked'))throw new HttpFailure(409,'version_conflict','Policy changed');
 const recipients=[];for(const recipient of input.recipients)recipients.push({...await reportRecipientIdentity(db,actor.workspaceId,recipient.address),membershipId:recipient.membershipId??null,entitlementRationale:recipient.entitlementRationale??null});
 recipients.sort((a,b)=>a.id.localeCompare(b.id));
 const policyId=old?.policy_id??randomUUID(),revisionId=randomUUID(),version=old?Number(old.version)+1:1;
 const recipientSetDigest=reportDigest(recipients.map(value=>({identity:value.id,digest:value.recipientDigest,membershipId:value.membershipId,entitlementRationale:value.entitlementRationale})));
 await db.query(`INSERT INTO report_recipient_policies(id,environment_id,workspace_id,customer_id,policy_id,version,selection,scope_digest,audience,sender_id,recipient_set_digest,owner_membership_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[revisionId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,policyId,version,JSON.stringify(selection),scopeDigest,selection.audience,input.senderId,recipientSetDigest,actor.membershipId]);
 for(const recipient of recipients)await db.query(`INSERT INTO report_policy_recipients(id,policy_revision_id,address,recipient_identity,recipient_digest,hmac_key_id,membership_id,entitlement_rationale,expires_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '365 days')`,[randomUUID(),revisionId,recipient.address,recipient.id,recipient.recipientDigest,recipient.keyId,recipient.membershipId,recipient.entitlementRationale]);
 if(old){await invalidatePolicyWork(db,old.id,'policy_revised');await db.query("UPDATE report_policy_heads SET current_revision_id=$2,state='draft',version=version+1,approval_decision_id=NULL WHERE policy_id=$1",[policyId,revisionId]);}
 else await db.query("INSERT INTO report_policy_heads(policy_id,current_revision_id,state) VALUES($1,$2,'draft')",[policyId,revisionId]);
 return {policyId,policyRevisionId:revisionId,version:old?Number(old.head_version)+1:1};
}
async function recipientsForPolicy(db:PoolClient,revisionId:string,active=true){
 const rows=(await db.query('SELECT id,address,recipient_identity,recipient_digest,membership_id,entitlement_rationale,expires_at FROM report_policy_recipients WHERE policy_revision_id=$1 ORDER BY recipient_identity',[revisionId])).rows;
 if(rows.length>20 || (active && (rows.length<1 || rows.some(row=>new Date(row.expires_at).getTime()<=Date.now()))))throw new HttpFailure(409,'policy_changed','Policy recipients are unavailable');
 return active?rows:rows.filter(row=>new Date(row.expires_at).getTime()>Date.now());
}
export async function readReportPolicy(db:PoolClient,actor:CurrentSession,policyId:string){
 const head=await policyHead(db,actor,policyId),recipients=(await recipientsForPolicy(db,head.id,false)).filter(row=>new Date(row.expires_at).getTime()>Date.now());
 return {policyId,policyRevisionId:head.id,customerId:head.customer_id,state:head.state,version:Number(head.head_version),revisionVersion:Number(head.version),selection:head.selection,senderId:head.sender_id,
  recipients:recipients.map(row=>({identity:row.recipient_identity,address:row.address,membershipId:row.membership_id,entitlementRationale:row.entitlement_rationale}))};
}
export async function reportPolicyBinding(db:PoolClient,actor:CurrentSession,policyId:string,action:ReportPolicyAction){
 const head=await policyHead(db,actor,policyId),recipients=await recipientsForPolicy(db,head.id,action==='approve' || action==='resume');
 const transitions:Record<ReportPolicyAction,string[]>={approve:['draft'],pause:['approved'],resume:['paused'],revoke:['draft','approved','paused']};
 if(!transitions[action].includes(head.state))throw new HttpFailure(409,'version_conflict','Policy state changed');
 let senderVersion:number|null=null;
 if(action==='approve' || action==='resume'){
  await verifyPolicyRecipientAuthority(db,actor.workspaceId,head.audience,recipients);senderVersion=(await requireVerifiedReportSender(db,actor.workspaceId,head.sender_id)).version;
  await validateReportSelection(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:actor.workspaceId,customerId:head.customer_id,audience:head.audience},head.selection);
 }
 return {head,binding:{action,policyId,policyRevisionId:head.id,version:Number(head.head_version),scopeDigest:head.scope_digest,audience:head.audience,senderId:head.sender_id,senderVersion,recipientSetDigest:head.recipient_set_digest,
  recipients:recipients.map(row=>({identity:row.recipient_identity,address:row.address,digest:row.recipient_digest,membershipId:row.membership_id,entitlementRationale:row.entitlement_rationale}))}};
}
export async function createReportPolicyPreview(db:PoolClient,actor:CurrentSession,policyId:string,action:ReportPolicyAction,expectedVersion:number){
 const current=await reportPolicyBinding(db,actor,policyId,action);await lockReportActor(db,actor,current.head.customer_id,'policy',current.head.audience,false,action==='approve' || action==='resume');
 if(Number(current.head.head_version)!==expectedVersion)throw new HttpFailure(409,'version_conflict','Policy changed');
 return {...await createReportPreview(db,actor,current.head.customer_id,policyId,'policy',expectedVersion,current.binding),binding:current.binding};
}
export async function invalidatePolicyWork(db:PoolClient,revisionId:string,code:string){
 await db.query("UPDATE report_schedules SET state='paused',version=version+1 WHERE policy_revision_id=$1 AND state='active'",[revisionId]);
 await db.query("UPDATE report_jobs SET state='cancelled',failure_code=$2 WHERE policy_revision_id=$1 AND state IN ('queued','leased')",[revisionId,code]);
 await db.query("UPDATE report_deliveries SET state='cancelled',failure_code=$2,version=version+1 WHERE policy_revision_id=$1 AND first_dispatch_at IS NULL AND state IN ('authorized','queued','retryable_failure')",[revisionId,code]);
}
export async function decideReportPolicy(db:PoolClient,actor:CurrentSession,policyId:string,command:{action:ReportPolicyAction;requestKey:string;expectedVersion:number;previewId:string;previewDigest:string;rationale:string}){
 // Lock the head before evaluating the exact live binding. No provider call happens inside this transaction.
 const head=await policyHead(db,actor,policyId,true);
 if(Number(head.head_version)!==command.expectedVersion)throw new HttpFailure(409,'version_conflict','Policy changed');
 const current=await reportPolicyBinding(db,actor,policyId,command.action);await lockReportActor(db,actor,head.customer_id,'policy',head.audience,false,['approve','resume'].includes(command.action));
 await requireReportPreview(db,actor,policyId,'policy',command.previewId,command.previewDigest,command.expectedVersion,current.binding);
 const decisionId=await recordReportDecision(db,actor,head.customer_id,{action:`${command.action}_policy`,subjectId:policyId,expectedVersion:command.expectedVersion,previewDigest:command.previewDigest,rationale:command.rationale,requestKey:command.requestKey});
 const state=command.action==='approve' || command.action==='resume'?'approved':command.action==='pause'?'paused':'revoked';
 await db.query('UPDATE report_policy_heads SET state=$2,version=version+1,approval_decision_id=CASE WHEN $3 THEN $4::uuid ELSE approval_decision_id END WHERE policy_id=$1',[policyId,state,command.action==='approve',decisionId]);
 if(state!=='approved')await invalidatePolicyWork(db,head.id,`policy_${state}`);
 return {policyId,policyRevisionId:head.id,decisionId,version:command.expectedVersion+1};
}
