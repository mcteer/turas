import {randomUUID} from 'node:crypto';
import {withTransaction} from '../../../lib/server/db/client';
import {createReportsBaseline} from './baseline';
import {submitExecutionCommand,readExecutionOverview,readExecutionRecords,previewExecutionCommand} from '../../../lib/server/execution/service';
export async function reportsDeliveryFixture(){
 const fixture=await withTransaction(db=>createReportsBaseline(db));
 await submitExecutionCommand(fixture.author,fixture.engagementId,{version:'execution-v1',action:'setup',requestKey:randomUUID(),expectedVersions:{baseline:1,plan:fixture.decision.aggregateVersion},payload:{baselineId:fixture.baselineId}});
 return fixture;
}
export async function addReviewedReportActivity(fixture:Awaited<ReturnType<typeof reportsDeliveryFixture>>,options:{audience?:'internal'|'delivery';narrative?:string;eventDate?:string;approve?:boolean}={}){
 const record={kind:'activity',subtype:'work',title:'Synthetic Reviewed Work',narrative:options.narrative??'A synthetic delivery test was completed.',audience:options.audience??'delivery',eventDate:options.eventDate??'2026-09-24',timezone:'UTC',workPackageKey:'proof',milestoneKeys:['proof_done'],ownerMembershipId:null,unknownOwnerReason:'Owner assignment remains unknown',references:[]};
 let view=await readExecutionOverview(fixture.author,fixture.engagementId);
 const created=await submitExecutionCommand(fixture.author,fixture.engagementId,{version:'execution-v1',action:'record.create',requestKey:randomUUID(),expectedVersions:{execution:view.version},payload:{baselineId:fixture.baselineId,record}});
 let row=(await readExecutionRecords(fixture.author,fixture.engagementId,{})).records.find(row=>row.id===created.changed[0].id)!;
 view=await readExecutionOverview(fixture.author,fixture.engagementId);
 await submitExecutionCommand(fixture.author,fixture.engagementId,{version:'execution-v1',action:'record.submit',requestKey:randomUUID(),expectedVersions:{execution:view.version,record:row.version},payload:{recordId:row.id,revisionId:row.revisionId,contentDigest:row.contentDigest}});
 // Re-read by stable created identity; never let an unrelated row become the fixture.
 row=(await readExecutionRecords(fixture.reviewer,fixture.engagementId,{})).records.find(row=>row.id===created.changed[0].id)!;
 if(options.approve!==false){
  view=await readExecutionOverview(fixture.reviewer,fixture.engagementId);
  const candidate={version:'execution-v1',action:'record.accept',expectedVersions:{execution:view.version,record:row.version},payload:{recordId:row.id,revisionId:row.revisionId,contentDigest:row.contentDigest}};
  const preview=await previewExecutionCommand(fixture.reviewer,fixture.engagementId,candidate);
  await submitExecutionCommand(fixture.reviewer,fixture.engagementId,{...candidate,requestKey:randomUUID(),...preview,rationale:'Reviewed synthetic observed work'});
 }
 return row;
}
