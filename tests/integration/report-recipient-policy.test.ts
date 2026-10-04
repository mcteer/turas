import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {withTransaction} from '../../lib/server/db/client';
import {createReportsBaseline} from '../fixtures/reports/baseline';
import {reportTransaction} from '../../lib/server/reports/commands';
import {verifyConfiguredReportSender,registerVerifiedReportSender} from '../../lib/server/reports/senders';
import {createReportRecipientPolicy,createReportPolicyPreview,decideReportPolicy,readReportPolicy} from '../../lib/server/reports/recipient-policy';
describe('reviewed recipient policy identity',()=>{
 it('requires exact human approval, preserves identities through key rotation and invalidates stale previews',async()=>{
  const old={...process.env},senderId=randomUUID(),domainId=randomUUID();
  Object.assign(process.env,{TURAS_REPORTS_ENABLED:'true',TURAS_REPORT_SENDER_ID:senderId,TURAS_REPORT_SENDER_DOMAIN_ID:domainId,TURAS_REPORT_SENDER_ADDRESS:'reports@example.com',RESEND_API_KEY:'synthetic-test-key',TURAS_REPORT_RECIPIENT_HMAC_KEY_ID:'v1',TURAS_REPORT_RECIPIENT_HMAC_KEYS:JSON.stringify({v1:Buffer.alloc(32,1).toString('base64')})});
  try{
   const fixture=await withTransaction(db=>createReportsBaseline(db));
   const verified=await verifyConfiguredReportSender(async()=>new Response(JSON.stringify({id:domainId,name:'example.com',status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false})));
   await reportTransaction(db=>registerVerifiedReportSender(db,fixture.reviewer.workspaceId,verified));
   const input={selection:{kind:'weekly' as const,audience:'delivery' as const,timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},senderId,recipients:[{address:'Reviewer@EXAMPLE.NET',entitlementRationale:'Authorized synthetic review recipient'}]};
   const created=await reportTransaction(db=>createReportRecipientPolicy(db,fixture.reviewer,fixture.customerId,input));
   const draft=await reportTransaction(db=>readReportPolicy(db,fixture.reviewer,created.policyId));expect(draft.state).toBe('draft');expect(draft.recipients[0].address).toBe('Reviewer@example.net');
   await expect(reportTransaction(db=>createReportPolicyPreview(db,fixture.author,created.policyId,'approve',1))).rejects.toMatchObject({status:403});
   const preview=await reportTransaction(db=>createReportPolicyPreview(db,fixture.reviewer,created.policyId,'approve',1));
   const command={action:'approve' as const,expectedVersion:1,requestKey:randomUUID(),rationale:'Approve exact synthetic recipient policy',previewId:preview.previewId,previewDigest:preview.previewDigest};
   await reportTransaction(db=>decideReportPolicy(db,fixture.reviewer,created.policyId,command));
   const approved=await reportTransaction(db=>readReportPolicy(db,fixture.reviewer,created.policyId));expect(approved.state).toBe('approved');expect(approved.version).toBe(2);
   const minimal=await reportTransaction(async db=>(await db.query("SELECT to_jsonb(d) ? 'rationale' AS contains_private_text FROM report_decisions d WHERE request_key=$1",[command.requestKey])).rows[0]);expect(minimal.contains_private_text).toBe(false);
   const privateDecision=await reportTransaction(async db=>(await db.query('SELECT p.rationale,p.expires_at>d.created_at AS has_expiry FROM report_decision_payloads p JOIN report_decisions d ON d.id=p.decision_id WHERE d.request_key=$1',[command.requestKey])).rows[0]);expect(privateDecision.rationale).toBe(command.rationale);expect(privateDecision.has_expiry).toBe(true);
   await expect(reportTransaction(db=>decideReportPolicy(db,fixture.reviewer,created.policyId,command))).rejects.toMatchObject({code:'version_conflict'});
   Object.assign(process.env,{TURAS_REPORT_RECIPIENT_HMAC_KEY_ID:'v2',TURAS_REPORT_RECIPIENT_HMAC_KEYS:JSON.stringify({v1:Buffer.alloc(32,1).toString('base64'),v2:Buffer.alloc(32,2).toString('base64')})});
   const rotated=await reportTransaction(db=>createReportRecipientPolicy(db,fixture.reviewer,fixture.customerId,input));
   const next=await reportTransaction(db=>readReportPolicy(db,fixture.reviewer,rotated.policyId));expect(next.recipients[0].identity).toBe(approved.recipients[0].identity);
   process.env.TURAS_REPORT_RECIPIENT_HMAC_KEYS=JSON.stringify({v2:Buffer.alloc(32,2).toString('base64')});await expect(reportTransaction(db=>createReportRecipientPolicy(db,fixture.reviewer,fixture.customerId,input))).rejects.toMatchObject({code:'sender_unavailable'});
   process.env.TURAS_REPORT_RECIPIENT_HMAC_KEYS=JSON.stringify({v1:Buffer.alloc(32,3).toString('base64'),v2:Buffer.alloc(32,2).toString('base64')});await expect(reportTransaction(db=>createReportRecipientPolicy(db,fixture.reviewer,fixture.customerId,input))).rejects.toMatchObject({code:'sender_unavailable'});
   const pause=await reportTransaction(db=>createReportPolicyPreview(db,fixture.reviewer,created.policyId,'pause',2));
   await reportTransaction(db=>decideReportPolicy(db,fixture.reviewer,created.policyId,{...command,action:'pause',expectedVersion:2,requestKey:randomUUID(),previewId:pause.previewId,previewDigest:pause.previewDigest}));
   expect((await reportTransaction(db=>readReportPolicy(db,fixture.reviewer,created.policyId))).state).toBe('paused');
  }finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
 });
});
