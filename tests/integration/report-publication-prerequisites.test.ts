import {describe,it,expect} from 'vitest';
import {withTransaction} from '../../lib/server/db/client';
import {createReportsBaseline} from '../fixtures/reports/baseline';
import {reportTransaction} from '../../lib/server/reports/commands';
import {prepareReportRevision} from '../../lib/server/reports/revisions';
import {validateWeeklyRevision} from '../../lib/server/reports/validation';
import {lockReportActor} from '../../lib/server/reports/policy';
import {reportRevisionFence} from '../../lib/server/reports/release';
import {randomUUID} from 'node:crypto';
describe('immutable weekly revision prerequisites',()=>{
 it('persists exact source, numeric and mail identity then validates without self-approving brand',async()=>{
  const fixture=await withTransaction(db=>createReportsBaseline(db));
  const result=await reportTransaction(async db=>{
   await lockReportActor(db,fixture.reviewer,fixture.customerId,'read','delivery');
   return prepareReportRevision(db,fixture.reviewer,fixture.customerId,{action:'prepare',requestKey:randomUUID(),expectedVersion:0,selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},fromDate:'2026-09-21',toDate:'2026-09-27',partial:false});
  });
  await reportTransaction(async db=>{
   await lockReportActor(db,fixture.reviewer,fixture.customerId,'read','delivery');
   const validation=await validateWeeklyRevision(db,fixture.reviewer.workspaceId,result.revisionId);
   expect(validation.documentDigest).toMatch(/^[a-f0-9]{64}$/);
   const state=await reportRevisionFence(db,fixture.reviewer.workspaceId,result.revisionId);expect(state.state).toBe('review_ready');
   await expect(reportRevisionFence(db,fixture.reviewer.workspaceId,result.revisionId,{published:true})).rejects.toMatchObject({code:'brand_unapproved'});
  });
 });
});
