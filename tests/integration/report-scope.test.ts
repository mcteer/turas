import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {withTransaction} from '../../lib/server/db/client';
import {createReportsBaseline} from '../fixtures/reports/baseline';
import {reportTransaction} from '../../lib/server/reports/commands';
import {validateReportSelection} from '../../lib/server/reports/projection';
import {verifyReportSources} from '../../lib/server/reports/sources';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {requireOwnedReportsDatabase} from '../fixtures/reports/environment';
describe('current accepted customer workload scope',()=>{
 it('binds real accepted workload heads without indexing or model calls and rejects withdrawn evidence',async()=>{
  await requireOwnedReportsDatabase();const fixture=await withTransaction(db=>createReportsBaseline(db));
  const candidate=await reportTransaction(db=>submitProfileCommand(fixture.author,fixture.customerId,{action:'propose_workload',requestKey:randomUUID(),payload:{kind:'workload_details',name:'Synthetic Report Workload',purpose:'Explicit synthetic customer scope'}},db)) as {recordId:string;revisionId:string;workloadId:string};
  const scope={environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:fixture.reviewer.workspaceId,customerId:fixture.customerId,audience:'delivery' as const},selection={engagementIds:[fixture.engagementId],workloadIds:[candidate.workloadId],includeCustomerLevel:true};
  await expect(reportTransaction(db=>validateReportSelection(db,scope,selection))).rejects.toMatchObject({code:'invalid_input'});
  await reportTransaction(async db=>{const head=(await db.query('SELECT r.version,r.current_accepted_revision_id,v.content_digest FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1',[candidate.revisionId])).rows[0];await submitProfileCommand(fixture.reviewer,fixture.customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:candidate.revisionId,digest:head.content_digest,expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:head.current_accepted_revision_id,rationale:'Approve synthetic report workload identity'},db);});
  const accepted=await reportTransaction(db=>validateReportSelection(db,scope,selection));expect(accepted.sources).toHaveLength(1);expect(accepted.sources[0]).toMatchObject({kind:'workload_identity',revisionId:candidate.revisionId});expect(accepted.sources[0].decisionId).toBeTruthy();
  await expect(reportTransaction(db=>verifyReportSources(db,scope,accepted.sources.map(ref=>({...ref,kind:'accepted_profile'}))))).rejects.toMatchObject({code:'source_changed'});
  await expect(reportTransaction(db=>validateReportSelection(db,scope,{...selection,includeCustomerLevel:false}))).rejects.toMatchObject({code:'invalid_input'});
  await expect(reportTransaction(db=>validateReportSelection(db,scope,{...selection,engagementIds:[randomUUID()]}))).rejects.toMatchObject({status:404});
  await reportTransaction(async db=>{const current=(await db.query('SELECT version FROM profile_records WHERE id=$1',[candidate.recordId])).rows[0];return submitProfileCommand(fixture.reviewer,fixture.customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:candidate.revisionId,expectedRecordVersion:Number(current.version),rationale:'Withdraw synthetic report workload identity'},db);});
  await expect(reportTransaction(db=>verifyReportSources(db,scope,accepted.sources))).rejects.toMatchObject({code:'source_changed'});
 });
});
