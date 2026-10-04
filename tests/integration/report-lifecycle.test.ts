import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {reportsDeliveryFixture,addReviewedReportActivity} from '../fixtures/reports/delivery';
import {submitReportCustomerCommand,submitReportRevisionCommand} from '../../lib/server/reports/service';
import {reportTransaction} from '../../lib/server/reports/commands';
import {readReport} from '../../lib/server/reports/read';
import {cleanupReportRevisionPayloads} from '../../lib/server/reports/cleanup';
import {readExecutionOverview,readExecutionRecords,previewExecutionCommand,submitExecutionCommand} from '../../lib/server/execution/service';
import {draftTime,submitTime,timeCandidate,decideTime,timeCommand} from '../fixtures/execution/time';
import {readExecutionTime} from '../../lib/server/execution/time';
import {createResource} from '../../lib/server/staffing/resources';
import {syntheticResource} from '../fixtures/staffing/seed';
import {submitPlanCommand} from '../../lib/server/plans/commands';
import {createPlanReviewPreview,decidePlan} from '../../lib/server/plans/decisions';
describe('source mutation propagation and audience-safe watches',()=>{
 it('ignores hidden/pending admissions, requires review of new eligible work and withholds a retracted exact dependency',async()=>{
  const fixture=await reportsDeliveryFixture();process.env.TURAS_REPORTS_ENABLED='true';
  const draft=await submitReportCustomerCommand(fixture.author,fixture.customerId,{action:'prepare',requestKey:randomUUID(),expectedVersion:0,
   selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},
   fromDate:'2026-09-21',toDate:'2026-09-27',partial:false}) as {reportId:string;revisionId:string;version:number};
  await addReviewedReportActivity(fixture,{audience:'internal',narrative:'HIDDEN_CHANGE_SENTINEL'});
  await addReviewedReportActivity(fixture,{approve:false,narrative:'PENDING_CHANGE_SENTINEL'});
  expect((await readReport(fixture.author,draft.reportId)).visibility).toBe('current');
  const activity=await addReviewedReportActivity(fixture,{narrative:'ELIGIBLE_CHANGE_SENTINEL'});
  expect((await readReport(fixture.author,draft.reportId)).visibility).toBe('review_required');
  const revised=await submitReportRevisionCommand(fixture.author,draft.reportId,{action:'revise',requestKey:randomUUID(),expectedVersion:draft.version,rationale:'Capture new eligible work',annotations:[]}) as {revisionId:string};
  expect((await readReport(fixture.author,draft.reportId)).visibility).toBe('current');
  const row=(await readExecutionRecords(fixture.reviewer,fixture.engagementId,{})).records.find(row=>row.id===activity.id)!;
  const execution=await readExecutionOverview(fixture.reviewer,fixture.engagementId);
  const input={version:'execution-v1',action:'record.retract',expectedVersions:{execution:execution.version,record:row.version},payload:{recordId:row.id,revisionId:row.revisionId,contentDigest:row.contentDigest}};
  const preview=await previewExecutionCommand(fixture.reviewer,fixture.engagementId,input);
  await submitExecutionCommand(fixture.reviewer,fixture.engagementId,{...input,...preview,requestKey:randomUUID(),rationale:'Withdraw the exact synthetic work source'});
  const view=await readReport(fixture.author,draft.reportId);expect(view.document).toBeNull();expect(view.visibility).toBe('withheld');
  const queued=await reportTransaction(async db=>(await db.query('SELECT payload_kind FROM report_cleanup_jobs WHERE revision_id=$1 ORDER BY payload_kind',[revised.revisionId])).rows);
   expect(queued.map(row=>row.payload_kind)).toEqual(['calculation','mail','revision']);
   await reportTransaction(async db=>{
    expect((await cleanupReportRevisionPayloads(db)).purged).toBe(3);
    expect((await db.query('SELECT 1 FROM report_calculations WHERE revision_id=$1',[revised.revisionId])).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM report_calculations WHERE revision_id=$1',[draft.revisionId])).rowCount).toBe(1);
   });
  },300000);
  it('keeps accepted time during pending correction, then withholds exact replaced and reversed numerical sources',async()=>{
   const fixture=await reportsDeliveryFixture();process.env.TURAS_REPORTS_ENABLED='true';
   const activity=await addReviewedReportActivity(fixture);
   const resource=await createResource(fixture.reviewer,{requestKey:randomUUID(),rationale:'Review synthetic report time subject',resource:{...syntheticResource(),timezone:'UTC',membershipId:fixture.author.membershipId}});
   const date='2026-09-24';
   const f={...fixture,date,resourceId:resource.resourceId!,activity,period:{from:date,to:date},time:{baselineId:fixture.baselineId,resourceId:resource.resourceId!,workPackageKey:'proof',serviceDate:date,timezone:'UTC',minutes:60,billable:true,activityRevisionId:activity.revisionId,allocationRevisionId:null,note:'PRIVATE_REPORT_TIME_NOTE',onBehalfRationale:null}};
   let entry=await submitTime(f,await draftTime(f));
   await decideTime(f,await timeCandidate(f,[entry]));
   const draft=await submitReportCustomerCommand(fixture.author,fixture.customerId,{action:'prepare',requestKey:randomUUID(),expectedVersion:0,selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},fromDate:'2026-09-21',toDate:'2026-09-27',partial:false}) as {reportId:string;revisionId:string;version:number};
   const calculation=()=>reportTransaction(async db=>(await db.query('SELECT inputs,results,time_decisions FROM report_calculations WHERE revision_id=$1',[draft.revisionId])).rows[0]);
   expect(JSON.stringify(await calculation())).toContain('60');
   expect(JSON.stringify(await readReport(fixture.author,draft.reportId))).not.toContain('PRIVATE_REPORT_TIME_NOTE');
   entry=(await readExecutionTime(f.author,f.engagementId,f.period)).entries[0];
   const view=await readExecutionOverview(f.author,f.engagementId);
   await submitExecutionCommand(f.author,f.engagementId,timeCommand('time.revise',{execution:view.version,time:entry.version},{entryId:entry.id,time:{...f.time,minutes:120,note:'PRIVATE_REPORT_CORRECTION_NOTE'}}));
   expect((await readReport(f.author,draft.reportId)).visibility).toBe('current');
   entry=await submitTime(f,(await readExecutionTime(f.author,f.engagementId,f.period)).entries[0]);
   expect((await readReport(f.author,draft.reportId)).visibility).toBe('current');
   await decideTime(f,await timeCandidate(f,[entry]));
   expect((await readReport(f.author,draft.reportId))).toMatchObject({visibility:'withheld',document:null});
   const revised=await submitReportRevisionCommand(f.author,draft.reportId,{action:'revise',requestKey:randomUUID(),expectedVersion:draft.version,rationale:'Capture corrected approved actuals',annotations:[]}) as {revisionId:string};
   const corrected=await reportTransaction(async db=>(await db.query('SELECT inputs FROM report_calculations WHERE revision_id=$1',[revised.revisionId])).rows[0]);
   expect(JSON.stringify(corrected.inputs)).toContain('120');
   entry=(await readExecutionTime(f.author,f.engagementId,f.period)).entries[0];
   await decideTime(f,await timeCandidate(f,[entry],'time.reverse',{}));
   expect((await readReport(f.author,draft.reportId))).toMatchObject({visibility:'withheld',document:null});
   const queued=await reportTransaction(async db=>(await db.query("SELECT payload_kind FROM report_cleanup_jobs WHERE revision_id=$1 AND state='queued'",[revised.revisionId])).rows);
   expect(queued.map(row=>row.payload_kind)).toEqual(expect.arrayContaining(['revision','mail','calculation']));
  },300000);
  it('does not invalidate for an unaccepted baseline proposal, but withholds the exact old baseline on replacement',async()=>{
   const f=await reportsDeliveryFixture();process.env.TURAS_REPORTS_ENABLED='true';
   const draft=await submitReportCustomerCommand(f.author,f.customerId,{action:'prepare',requestKey:randomUUID(),expectedVersion:0,selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[f.engagementId],workloadIds:[],includeCustomerLevel:true},fromDate:'2026-09-21',toDate:'2026-09-27',partial:false}) as {reportId:string;revisionId:string};
   const replacement=structuredClone(f.content);replacement.milestones[0].title='Revised synthetic proof';
   const saved=await reportTransaction(db=>submitPlanCommand(f.author,{action:'save',requestKey:randomUUID(),planId:f.created.planId,expectedAggregateVersion:f.decision.aggregateVersion,parentRevisionId:f.created.revisionId,baseAcceptedRevisionId:f.created.revisionId,changeReason:'Revise the reviewed synthetic milestone',content:replacement},db));
   const submitted=await reportTransaction(db=>submitPlanCommand(f.author,{action:'submit',requestKey:randomUUID(),planId:f.created.planId,expectedAggregateVersion:saved.aggregateVersion,revisionId:saved.revisionId,contentDigest:saved.contentDigest},db));
   expect((await readReport(f.author,draft.reportId)).visibility).toBe('current');
   const preview=await reportTransaction(db=>createPlanReviewPreview(f.reviewer,f.created.planId,{requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db));
   const accepted=await reportTransaction(db=>decidePlan(f.reviewer,f.created.planId,{action:'accept',requestKey:randomUUID(),revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:'Review replacement synthetic baseline',engagementId:f.engagementId,deliverySuitabilityConfirmed:true},db));
   expect(accepted.baselineId).not.toBe(f.baselineId);
   expect(await readReport(f.author,draft.reportId)).toMatchObject({visibility:'withheld',document:null});
   await reportTransaction(async db=>{
    expect((await db.query("SELECT 1 FROM report_cleanup_jobs WHERE revision_id=$1 AND state='queued'",[draft.revisionId])).rowCount).toBeGreaterThan(0);
    expect((await db.query('SELECT active_baseline_id FROM engagements WHERE id=$1',[f.engagementId])).rows[0].active_baseline_id).toBe(accepted.baselineId);
   });
  },300000);
});
