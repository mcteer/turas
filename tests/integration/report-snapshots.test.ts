import {describe,it,expect} from 'vitest';
import {withTransaction} from '../../lib/server/db/client';
import {createReportsBaseline} from '../fixtures/reports/baseline';
import {reportTransaction} from '../../lib/server/reports/commands';
import {lockReportActor} from '../../lib/server/reports/policy';
import {captureReportSnapshot} from '../../lib/server/reports/snapshots';
import {composeWeeklyReport} from '../../lib/server/reports/weekly';
describe('accepted reporting snapshots',()=>{
 it('captures a truthful empty weekly report from a real reviewed delivery baseline',async()=>{
  const fixture=await withTransaction(db=>createReportsBaseline(db));
  const snapshot=await reportTransaction(async db=>{
   await lockReportActor(db,fixture.reviewer,fixture.customerId,'prepare','delivery');
   return captureReportSnapshot(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:fixture.reviewer.workspaceId,customerId:fixture.customerId,audience:'delivery'},
    {kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},'2026-09-21','2026-09-27',false);
  });
  expect(snapshot.dependencies.some(source=>source.kind==='milestone_baseline')).toBe(true);
  const document=composeWeeklyReport(snapshot);
   expect(document.sections).toHaveLength(8);expect(document.sections[0].blocks[0].text).toBe('No validated update available for this period.');
  expect(document.metrics.find(metric=>metric.label.endsWith('Closing Forecast'))?.value).toBeNull();expect(document.metrics.find(metric=>metric.label.endsWith('Period Actual'))?.value).toBeNull();
  const serialized=JSON.stringify(document);expect(serialized).not.toContain(fixture.reviewer.membershipId);expect(serialized).not.toContain(fixture.baselineId);expect(serialized).not.toContain('resourceId');
 });
});
