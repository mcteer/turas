import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withTransaction} from '../../lib/server/db/client';
import {createReportsBaseline} from '../fixtures/reports/baseline';
import {reportTransaction} from '../../lib/server/reports/commands';
import {verifyConfiguredReportSender,registerVerifiedReportSender} from '../../lib/server/reports/senders';
import {createReportRecipientPolicy,createReportPolicyPreview,decideReportPolicy} from '../../lib/server/reports/recipient-policy';
import {createReportSchedule,tickReportSchedules} from '../../lib/server/reports/schedules';
import {submitReportCustomerCommand,readReportCommandReceipt} from '../../lib/server/reports/service';
describe('draft-only schedule recovery',()=>{
 it('queues only the latest due complete week, records missed weeks, and never creates deliveries',async()=>{
  const names=['TURAS_REPORTS_ENABLED','TURAS_REPORT_SENDER_ID','TURAS_REPORT_SENDER_DOMAIN_ID','TURAS_REPORT_SENDER_ADDRESS','RESEND_API_KEY','TURAS_REPORT_RECIPIENT_HMAC_KEY_ID','TURAS_REPORT_RECIPIENT_HMAC_KEYS'],prior=new Map(names.map(key=>[key,process.env[key]])),senderId=randomUUID(),domainId=randomUUID();
  Object.assign(process.env,{TURAS_REPORTS_ENABLED:'true',TURAS_REPORT_SENDER_ID:senderId,TURAS_REPORT_SENDER_DOMAIN_ID:domainId,TURAS_REPORT_SENDER_ADDRESS:'reports@example.com',RESEND_API_KEY:'synthetic-test-key',TURAS_REPORT_RECIPIENT_HMAC_KEY_ID:'v1',TURAS_REPORT_RECIPIENT_HMAC_KEYS:JSON.stringify({v1:Buffer.alloc(32,1).toString('base64')})});
  try{
   const fixture=await withTransaction(db=>createReportsBaseline(db));
   const sender=await verifyConfiguredReportSender(async()=>new Response(JSON.stringify({id:domainId,name:'example.com',status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false})));
   await reportTransaction(db=>registerVerifiedReportSender(db,fixture.reviewer.workspaceId,sender));
   const policy=await reportTransaction(db=>createReportRecipientPolicy(db,fixture.reviewer,fixture.customerId,{selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},senderId,recipients:[{address:'reviewer@example.net',entitlementRationale:'Explicit synthetic delivery entitlement'}]}));
   await expect(reportTransaction(db=>createReportSchedule(db,fixture.reviewer,fixture.customerId,{policyId:policy.policyId,localTime:'09:00'}))).rejects.toMatchObject({code:'policy_changed'});
   const preview=await reportTransaction(db=>createReportPolicyPreview(db,fixture.reviewer,policy.policyId,'approve',1));
   await reportTransaction(db=>decideReportPolicy(db,fixture.reviewer,policy.policyId,{action:'approve',expectedVersion:1,requestKey:randomUUID(),rationale:'Approve synthetic scheduled drafts',previewId:preview.previewId,previewDigest:preview.previewDigest}));
   const schedule=await reportTransaction(db=>createReportSchedule(db,fixture.reviewer,fixture.customerId,{policyId:policy.policyId,localTime:'09:00'}));
   await reportTransaction(db=>db.query("UPDATE report_schedules SET next_run_at='2026-09-07T09:00:00Z' WHERE id=$1",[schedule.scheduleId]));
   const tick=()=>reportTransaction(db=>tickReportSchedules(db,'2026-10-06T18:00:00Z'));
   expect(await tick()).toBe(1);expect(await tick()).toBe(0);
   const actual=await reportTransaction(async db=>({periods:(await db.query('SELECT from_date::text,state FROM report_schedule_periods WHERE schedule_id=$1 ORDER BY from_date',[schedule.scheduleId])).rows,jobs:(await db.query('SELECT kind,input FROM report_jobs WHERE policy_revision_id=$1',[policy.policyRevisionId])).rows,deliveries:Number((await db.query('SELECT count(*) AS n FROM report_deliveries')).rows[0].n)}));
   expect(actual.periods).toHaveLength(5);expect(actual.periods.filter(row=>row.state==='queued')).toEqual([{from_date:'2026-09-28',state:'queued'}]);expect(actual.jobs).toHaveLength(1);expect(actual.jobs[0].kind).toBe('draft');expect(actual.jobs[0].input.fromDate).toBe('2026-09-28');expect(actual.deliveries).toBe(0);
   process.env.TURAS_REPORTS_ENABLED='false';
   const pause={action:'pause_schedule',requestKey:randomUUID(),expectedVersion:1,scheduleId:schedule.scheduleId};
   const paused=await submitReportCustomerCommand(fixture.reviewer,fixture.customerId,pause);
   expect(paused).toMatchObject({state:'paused',version:2});expect(await submitReportCustomerCommand(fixture.reviewer,fixture.customerId,pause)).toEqual(paused);expect(await readReportCommandReceipt(fixture.reviewer,pause.requestKey)).toEqual(paused);
   expect((await reportTransaction(db=>db.query('SELECT state FROM report_jobs WHERE policy_revision_id=$1',[policy.policyRevisionId]))).rows[0].state).toBe('cancelled');
   const resume={action:'resume_schedule',requestKey:randomUUID(),expectedVersion:2,scheduleId:schedule.scheduleId};
   await expect(submitReportCustomerCommand(fixture.reviewer,fixture.customerId,resume)).rejects.toMatchObject({code:'feature_disabled'});
   process.env.TURAS_REPORTS_ENABLED='true';expect(await submitReportCustomerCommand(fixture.reviewer,fixture.customerId,resume)).toMatchObject({state:'active',version:3});
  }finally{for(const [key,value]of prior)if(value===undefined)delete process.env[key];else process.env[key]=value;}
 });
});
