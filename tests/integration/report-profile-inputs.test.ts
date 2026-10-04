import {randomUUID} from 'node:crypto';import {describe,it,expect} from 'vitest';
import {reportsDeliveryFixture} from '../fixtures/reports/delivery';
import {reportTransaction} from '../../lib/server/reports/commands';import {submitProfileCommand} from '../../lib/server/profiles/service';
import {selectReportProfileInputs} from '../../lib/server/reports/profile-inputs';import {verifyReportSources} from '../../lib/server/reports/sources';
import {submitReportCustomerCommand} from '../../lib/server/reports/service';
async function propose(fixture:Awaited<ReturnType<typeof reportsDeliveryFixture>>,audience:'delivery'|'internal',name:string,accept=true){
 const proposed=await reportTransaction(db=>submitProfileCommand(fixture.author,fixture.customerId,{action:'propose_record',requestKey:randomUUID(),requestedAudience:audience,dataCategory:audience==='delivery'?'delivery_context':'internal_operations',payload:{kind:'product_use',productKey:'report-'+randomUUID().slice(0,8),displayName:name,state:'planned',usageDescription:name+' proposal',observedAt:'2026-09-01T00:00:00Z'}},db)) as {recordId:string;revisionId:string};
 if(accept)await reportTransaction(async db=>{const current=(await db.query('SELECT r.version,r.current_accepted_revision_id,v.content_digest FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1',[proposed.revisionId])).rows[0];return submitProfileCommand(fixture.reviewer,fixture.customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:current.content_digest,expectedRecordVersion:Number(current.version),expectedAcceptedRevisionId:current.current_accepted_revision_id,rationale:'Accept synthetic audience-scoped product evidence'},db);});return proposed;
}
describe('original accepted profile report inputs',()=>{
 it('reads only current audience-approved originals without retrieval indexing and rechecks withdrawal',async()=>{
   const fixture=await reportsDeliveryFixture();process.env.TURAS_REPORTS_ENABLED='true';
   const draft=await submitReportCustomerCommand(fixture.author,fixture.customerId,{action:'prepare',requestKey:randomUUID(),expectedVersion:0,selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},fromDate:'2026-09-21',toDate:'2026-09-27',partial:false}) as {revisionId:string};
   await propose(fixture,'internal','INTERNAL_PROFILE_SENTINEL');await propose(fixture,'delivery','PENDING_PROFILE_SENTINEL',false);
   const visibility=()=>reportTransaction(async db=>(await db.query('SELECT visibility FROM report_revision_states WHERE revision_id=$1',[draft.revisionId])).rows[0].visibility);
   expect(await visibility()).toBe('current');
   const delivery=await propose(fixture,'delivery','DELIVERY_PROFILE_SENTINEL');
   expect(await visibility()).toBe('review_required');
  const scope={environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:fixture.reviewer.workspaceId,customerId:fixture.customerId,audience:'delivery' as const};
  const current=await reportTransaction(db=>selectReportProfileInputs(db,scope,{workloadIds:[],includeCustomerLevel:true},'2026-10-03T12:00:00Z'));
  expect(JSON.stringify(current.inputs)).toContain('DELIVERY_PROFILE_SENTINEL');expect(JSON.stringify(current.inputs)).not.toContain('INTERNAL_PROFILE_SENTINEL');expect(JSON.stringify(current.inputs)).not.toContain('PENDING_PROFILE_SENTINEL');
  const internal=await reportTransaction(db=>selectReportProfileInputs(db,{...scope,audience:'leadership'},{workloadIds:[],includeCustomerLevel:true},'2026-10-03T12:00:00Z'));expect(JSON.stringify(internal.inputs)).toContain('INTERNAL_PROFILE_SENTINEL');
  expect((await reportTransaction(db=>selectReportProfileInputs(db,scope,{workloadIds:[],includeCustomerLevel:false},'2026-10-03T12:00:00Z'))).inputs).toEqual([]);
  await reportTransaction(async db=>{const head=(await db.query('SELECT version FROM profile_records WHERE id=$1',[delivery.recordId])).rows[0];return submitProfileCommand(fixture.reviewer,fixture.customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:delivery.revisionId,expectedRecordVersion:Number(head.version),rationale:'Withdraw synthetic audience-scoped product input'},db);});
  await expect(reportTransaction(db=>verifyReportSources(db,scope,current.sources.filter(source=>source.revisionId===delivery.revisionId)))).rejects.toMatchObject({code:'source_changed'});
 });
});
