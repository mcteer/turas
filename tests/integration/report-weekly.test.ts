import {describe,it,expect} from 'vitest';
import {reportsDeliveryFixture,addReviewedReportActivity} from '../fixtures/reports/delivery';
import {reportTransaction} from '../../lib/server/reports/commands';
import {captureReportSnapshot} from '../../lib/server/reports/snapshots';
import {lockReportActor} from '../../lib/server/reports/policy';
import {composeWeeklyReport} from '../../lib/server/reports/weekly';
import {prepareReportMail} from '../../lib/server/reports/mail-content';
async function capture(fixture:Awaited<ReturnType<typeof reportsDeliveryFixture>>,audience:'delivery'|'leadership'='delivery'){
 return reportTransaction(async db=>{
  await lockReportActor(db,fixture.reviewer,fixture.customerId,'read',audience);
  return captureReportSnapshot(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:fixture.reviewer.workspaceId,customerId:fixture.customerId,audience},
   {kind:'weekly',audience,timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},'2026-09-21','2026-09-27',false);
 });
}
describe('weekly factual preparation',()=>{
 it('selects accepted delivery before retrieval, excludes pending and internal prose, and escapes source markup',async()=>{
  const fixture=await reportsDeliveryFixture();
  await addReviewedReportActivity(fixture,{narrative:'DELIVERY_FACT <script>alert(1)</script>'});
  await addReviewedReportActivity(fixture,{audience:'internal',narrative:'INTERNAL_SENTINEL'});
  await addReviewedReportActivity(fixture,{narrative:'PENDING_SENTINEL',approve:false});
  const snapshot=await capture(fixture),document=composeWeeklyReport(snapshot),mail=prepareReportMail(document);
  expect(JSON.stringify(document)).toContain('DELIVERY_FACT');expect(JSON.stringify(document)).not.toContain('INTERNAL_SENTINEL');expect(JSON.stringify(document)).not.toContain('PENDING_SENTINEL');
  expect(snapshot.coverage.selectedRecords).toBe(1);expect(mail.html).toContain('&lt;script&gt;');expect(mail.html).not.toContain('<script>');
  const internal=composeWeeklyReport(await capture(fixture,'leadership'));expect(JSON.stringify(internal)).toContain('INTERNAL_SENTINEL');expect(JSON.stringify(internal)).not.toContain('PENDING_SENTINEL');
 });
 it('keeps delivery freshness unchanged for hidden internal work and detects accepted delivery work',async()=>{
  const fixture=await reportsDeliveryFixture(),initial=await capture(fixture);
  await addReviewedReportActivity(fixture,{audience:'internal',narrative:'HIDDEN_FRESHNESS_INPUT'});
  expect((await capture(fixture)).generationWatches).toEqual(initial.generationWatches);
  await addReviewedReportActivity(fixture,{narrative:'NEW_ACCEPTED_DELIVERY_INPUT'});
  expect((await capture(fixture)).generationWatches).not.toEqual(initial.generationWatches);
 });
});
