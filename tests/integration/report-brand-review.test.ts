import {randomUUID} from 'node:crypto';import {describe,it,expect} from 'vitest';import {execFileSync} from 'node:child_process';
import {reportsDeliveryFixture} from '../fixtures/reports/delivery';import {reportTransaction} from '../../lib/server/reports/commands';
import {submitReportCustomerCommand,submitReportRevisionCommand} from '../../lib/server/reports/service';import {claimReportJobs} from '../../lib/server/reports/jobs';import {runReportRenderJob} from '../../lib/server/reports/render-jobs';
import {previewReportBrand,submitReportBrandDecision} from '../../lib/server/reports/brand-review';import {previewReportPublication,submitReportPublicationDecision} from '../../lib/server/reports/service';
import {requireSyntheticReportSampleBrand} from '../../scripts/pilot-report-recipe';
describe('actual brand sample and publication decisions',()=>{
 it('requires actual validated weekly/monthly/quarterly samples and exact mcteer review before publication',async()=>{
  const fixture=await reportsDeliveryFixture();process.env.TURAS_REPORTS_ENABLED='true';process.env.TURAS_REPORT_RENDERER_IMAGE=execFileSync('docker',['image','inspect','turas-report-renderer:009-executive-v1','--format','{{.Id}}'],{encoding:'utf8'}).trim();
  const reports:any[]=[];
  for(const period of [{kind:'weekly',fromDate:'2026-09-21',toDate:'2026-09-27'},{kind:'monthly',fromDate:'2026-09-01',toDate:'2026-09-30'},{kind:'quarterly',fromDate:'2026-07-01',toDate:'2026-09-30'}]){
   const view=await submitReportCustomerCommand(fixture.author,fixture.customerId,{action:'prepare',requestKey:randomUUID(),expectedVersion:0,selection:{kind:period.kind,audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},fromDate:period.fromDate,toDate:period.toDate,partial:false}) as any;
   await submitReportRevisionCommand(fixture.reviewer,view.reportId,{action:'render',requestKey:randomUUID(),expectedVersion:view.version,rationale:'Inspect synthetic actual brand samples'});
   if(period.kind!=='weekly'){const [job]=await reportTransaction(db=>claimReportJobs(db,'render'));await runReportRenderJob(job);}reports.push(view);
  }
  const brandId=await reportTransaction(async db=>(await db.query('SELECT brand_id FROM report_revisions WHERE id=$1',[reports[0].revisionId])).rows[0].brand_id);
  const currentBrand=()=>reportTransaction(async db=>{const row=(await db.query('SELECT id,version,state,approval_decision_id FROM report_brand_profiles WHERE id=$1',[brandId])).rows[0];return {...row,brandId:row.id,version:Number(row.version)};});
  const draft=await currentBrand();expect(requireSyntheticReportSampleBrand({brands:[draft]})).toMatchObject({brandId,state:'draft'});
  const body={customerId:fixture.customerId,action:'approve' as const,expectedVersion:1,sampleRevisionIds:reports.map(report=>report.revisionId)};
  await expect(previewReportBrand(fixture.author,brandId,body)).rejects.toMatchObject({status:403});
  await expect(previewReportBrand(fixture.reviewer,brandId,{...body,sampleRevisionIds:[reports[0].revisionId]})).rejects.toMatchObject({code:'brand_unapproved'});
  await expect(previewReportPublication(fixture.reviewer,reports[0].reportId,{action:'publish',expectedVersion:reports[0].version})).rejects.toMatchObject({code:'brand_unapproved'});
  const preview=await previewReportBrand(fixture.reviewer,brandId,body);
  const command={...body,previewId:preview.previewId,previewDigest:preview.previewDigest,requestKey:randomUUID(),rationale:'Approve exact synthetic branded email, PDF and native deck samples'};
  const approved=await submitReportBrandDecision(fixture.reviewer,brandId,command) as any;expect(approved.state).toBe('approved');
  expect((await submitReportBrandDecision(fixture.reviewer,brandId,command) as any).state).toBe('approved');
  const publicationPreview=await previewReportPublication(fixture.reviewer,reports[0].reportId,{action:'publish',expectedVersion:reports[0].version});
  const published=await submitReportPublicationDecision(fixture.reviewer,reports[0].reportId,{action:'publish',expectedVersion:reports[0].version,requestKey:randomUUID(),rationale:'Publish exact synthetic weekly report',previewId:publicationPreview.previewId,previewDigest:publicationPreview.previewDigest}) as any;
  expect(published.state).toBe('published');expect(published.publicationId).toBeTruthy();
  const reportState=()=>reportTransaction(async db=>({
   states:(await db.query('SELECT * FROM report_revision_states WHERE revision_id=ANY($1::uuid[]) ORDER BY revision_id',[reports.map(report=>report.revisionId)])).rows,
   publications:(await db.query('SELECT * FROM report_publications WHERE revision_id=ANY($1::uuid[]) ORDER BY id',[reports.map(report=>report.revisionId)])).rows,
  }));
  const retainedReports=await reportState();
  const previousApproval=await currentBrand();
  const selected=requireSyntheticReportSampleBrand({brands:[previousApproval]});expect(selected.state).toBe('approved');
  expect(()=>requireSyntheticReportSampleBrand({brands:[]})).toThrow('Exact current synthetic sample brand required');
  expect(()=>requireSyntheticReportSampleBrand({brands:[previousApproval,{...previousApproval,brandId:randomUUID()}]})).toThrow('Exact current synthetic sample brand required');
  const reviewBody={...body,expectedVersion:selected.version};
  await expect(previewReportBrand(fixture.author,brandId,reviewBody)).rejects.toMatchObject({status:403});
  const reviewPreview=await previewReportBrand(fixture.reviewer,brandId,reviewBody);
  expect(reviewPreview.previewId).not.toBe(preview.previewId);
  const reviewed=await submitReportBrandDecision(fixture.reviewer,brandId,{...reviewBody,previewId:reviewPreview.previewId,previewDigest:reviewPreview.previewDigest,requestKey:randomUUID(),rationale:'Review validated samples against the existing approved brand'}) as any;
  expect(reviewed.state).toBe('approved');
  const currentApproval=await currentBrand();expect(currentApproval.approval_decision_id).not.toBe(previousApproval.approval_decision_id);
  expect(await reportState()).toEqual(retainedReports);
  const revokeBody={customerId:fixture.customerId,action:'revoke' as const,expectedVersion:currentApproval.version,sampleRevisionIds:[]},revokePreview=await previewReportBrand(fixture.reviewer,brandId,revokeBody);
  const revoked=await submitReportBrandDecision(fixture.reviewer,brandId,{...revokeBody,previewId:revokePreview.previewId,previewDigest:revokePreview.previewDigest,requestKey:randomUUID(),rationale:'Revoke the controlled synthetic sample brand'}) as any;
  expect(revoked.state).toBe('revoked');
  const revokedBrand=await currentBrand();expect(()=>requireSyntheticReportSampleBrand({brands:[revokedBrand]})).toThrow('Exact current synthetic sample brand required');
  await expect(previewReportBrand(fixture.reviewer,brandId,{...body,expectedVersion:revokedBrand.version})).rejects.toMatchObject({code:'brand_unapproved'});
 });
});
