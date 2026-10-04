import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {reportsDeliveryFixture,addReviewedReportActivity} from '../fixtures/reports/delivery';
import {readExecutionOverview,previewExecutionCommand,submitExecutionCommand} from '../../lib/server/execution/service';
import {reportTransaction} from '../../lib/server/reports/commands';
import {selectReportMilestones} from '../../lib/server/reports/milestones';
import {verifyReportSources} from '../../lib/server/reports/sources';
import {captureReportSnapshot} from '../../lib/server/reports/snapshots';
import {composeWeeklyReport} from '../../lib/server/reports/weekly';
describe('explicit native milestone report decisions',()=>{
 it('does not infer completion from accepted activity and preserves waiver versus completion through reopening',async()=>{
  const fixture=await reportsDeliveryFixture();await addReviewedReportActivity(fixture);
  const scope={environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:fixture.reviewer.workspaceId,customerId:fixture.customerId,audience:'delivery' as const};
  const before=await reportTransaction(db=>selectReportMilestones(db,scope,[fixture.engagementId]));expect(before.milestones).toEqual([]);
  async function decide(decision:string){const view=await readExecutionOverview(fixture.reviewer,fixture.engagementId),milestone=view.milestones.find(item=>item.key==='proof_done')!;
   const input={version:'execution-v1',action:'milestone.decide',expectedVersions:{execution:view.version,milestone:milestone.version},payload:{baselineId:fixture.baselineId,milestoneKey:'proof_done',decision,evidenceRevisionIds:[]}};
   const preview=await previewExecutionCommand(fixture.reviewer,fixture.engagementId,input);
   await submitExecutionCommand(fixture.reviewer,fixture.engagementId,{...input,...preview,requestKey:randomUUID(),rationale:'Explicit synthetic reviewed milestone decision'});
  }
  await decide('waive');
  const waived=await reportTransaction(db=>selectReportMilestones(db,scope,[fixture.engagementId]));expect(waived.milestones).toHaveLength(1);expect(waived.milestones[0].state).toBe('waived');expect(waived.sources.some(source=>source.kind==='milestone_decision')).toBe(true);
  const snapshot=await reportTransaction(db=>captureReportSnapshot(db,scope,{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},'2026-09-21','2026-09-27',false));
  expect(JSON.stringify(composeWeeklyReport(snapshot))).toContain('waiver does not establish completion');
  await decide('reopen');
  await expect(reportTransaction(db=>verifyReportSources(db,scope,waived.sources))).rejects.toMatchObject({code:'source_changed'});
  expect((await reportTransaction(db=>selectReportMilestones(db,scope,[fixture.engagementId]))).milestones).toEqual([]);
 });
});
