import {randomUUID} from 'node:crypto';
import {beforeAll,describe,it,expect} from 'vitest';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {createProfileTestSession} from '../fixtures/profiles';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {withTransaction} from '../../lib/server/db/client';
import {getServerConfig} from '../../lib/server/config';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {discoveryHypothesis} from '../fixtures/expansion';
import {supportedExpansionProposal} from '../fixtures/expansion/supported';
import {saveExpansionProposal} from '../../lib/server/expansion/service';
import {readExpansionWorkspace} from '../../lib/server/expansion/projection';
import {assignExpansionOwner} from '../../lib/server/expansion/owners';
import {createExpansionPreview,decideExpansionHypothesis} from '../../lib/server/expansion/review';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {runExpansionCleanupTick,expireExpansionReceipts} from '../../lib/server/expansion/maintenance';
async function ageImmutable(table:'expansion_revisions'|'expansion_invalidations',trigger:string,column:string,id:string,days:number){
 await withTransaction(async db=>{await db.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);await db.query(`UPDATE ${table} SET ${column}=clock_timestamp()-$2::integer*interval '1 day' WHERE ${table==='expansion_invalidations'?'revision_id':'id'}=$1`,[id,days]);await db.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);});
}
describe('Expansion governed retention and retry fences',()=>{
 let panel:CurrentSession,mcteer:CurrentSession;
 beforeAll(async()=>{({panel,mcteer}=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer')})));});
 it('immediately withholds originals, keeps the earliest deadline for late metadata decisions, and retries an expired lease',async()=>{
  const customerId=DEMO_IDS.sharedCustomer,env=getServerConfig().TURAS_ENVIRONMENT_ID;
  await assignExpansionOwner(mcteer,customerId,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:panel.membershipId,rationale:'Synthetic explicit retention owner'});
  const proposal=await supportedExpansionProposal(panel,mcteer,customerId);
  const version=await withExpansionDatabase(async db=>Number((await db.query('SELECT r.version FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1',[proposal.need.reviewedRevisionId])).rows[0].version));
  await submitProfileCommand(mcteer,customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:proposal.need.reviewedRevisionId,expectedRecordVersion:version,rationale:'Synthetic source withdrawal while cleanup is paused'});
  let view=await readExpansionWorkspace(panel,customerId,{recordId:proposal.saved.recordId});expect(view.records[0].working.payload).toBeNull();
  await withExpansionDatabase(async db=>{const row=(await db.query('SELECT i.invalidated_at,p.purge_at,j.deadline FROM expansion_invalidations i JOIN expansion_payloads p ON p.revision_id=i.revision_id JOIN expansion_cleanup_jobs j ON j.payload_id=p.id WHERE i.revision_id=$1',[proposal.saved.revisionId])).rows[0];expect(new Date(row.purge_at).getTime()-new Date(row.invalidated_at).getTime()).toBe(86400000);expect(row.deadline).toEqual(row.purge_at);});
  // Clock fixture edits only this owned clone; production headers remain immutable.
  await ageImmutable('expansion_invalidations','expansion_invalidation_immutable','invalidated_at',proposal.saved.revisionId!,2);
  const preview=await createExpansionPreview(panel,customerId,{workloadId:proposal.command.workloadId,recordId:proposal.saved.recordId,revisionId:proposal.saved.revisionId,kind:'metadata'});
  const decision=await decideExpansionHypothesis(panel,customerId,{contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId:proposal.command.workloadId,recordId:proposal.saved.recordId,revisionId:proposal.saved.revisionId,expectedVersion:proposal.saved.version,expectedAssignmentVersion:preview.expectedAssignmentVersion,previewDigest:preview.previewDigest,decision:'dismiss',rationale:'Metadata-only owner decision cannot revive withdrawn prose'});
  await withExpansionDatabase(async db=>{const rows=(await db.query('SELECT p.purge_at,i.invalidated_at FROM expansion_payloads p LEFT JOIN expansion_decisions d ON d.id=p.decision_id JOIN expansion_invalidations i ON i.revision_id=COALESCE(p.revision_id,d.revision_id) WHERE i.revision_id=$1',[proposal.saved.revisionId])).rows;expect(rows).toHaveLength(2);for(const row of rows)expect(new Date(row.purge_at).getTime()-new Date(row.invalidated_at).getTime()).toBe(86400000);
   await db.query("UPDATE expansion_cleanup_jobs SET state='leased',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 hour' WHERE payload_id IN(SELECT id FROM expansion_payloads WHERE revision_id=$1 OR decision_id=$2)",[proposal.saved.revisionId,decision.decisionId]);});
  expect((await runExpansionCleanupTick()).purged).toBe(0);
  await withExpansionDatabase(db=>db.query("UPDATE expansion_cleanup_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE state='leased'"));
  expect((await runExpansionCleanupTick()).purged).toBe(2);
  view=await readExpansionWorkspace(panel,customerId,{recordId:proposal.saved.recordId});expect(view.records[0].working.payload).toBeNull();expect(view.records[0].lastDecision?.rationale).toBeNull();expect(view.records[0].disposition).toBe('dismissed');
  await withExpansionDatabase(async db=>expect((await db.query('SELECT turas_expansion_invalidate_revision($1,$2) AS changed',[`${env}-other`,proposal.saved.revisionId])).rows[0].changed).toBe(false));
 },60000);
 it('expires unreferenced superseded drafts at 90 days while preserving current heads and immutable identity',async()=>{
  const customerId=DEMO_IDS.deniedCustomer;
  const content=discoveryHypothesis(),base={contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]};
  const first=await saveExpansionProposal(panel,customerId,{...base,requestKey:randomUUID(),expectedVersion:0,content});
  const second=await saveExpansionProposal(panel,customerId,{...base,requestKey:randomUUID(),recordId:first.recordId,expectedVersion:first.version,content:{...content,title:'Synthetic current retained head'}});
  await ageImmutable('expansion_revisions','expansion_revision_immutable','created_at',first.revisionId!,91);
  await ageImmutable('expansion_revisions','expansion_revision_immutable','created_at',second.revisionId!,400);
  expect((await runExpansionCleanupTick()).purged).toBe(1);
  const view=await readExpansionWorkspace(panel,customerId,{recordId:first.recordId,revisionId:first.revisionId});expect(view.records[0].working.payload?.content.title).toBe('Synthetic current retained head');expect(view.records[0].history?.selected?.availability).toBe('purged');
  await withExpansionDatabase(async db=>expect((await db.query('SELECT 1 FROM expansion_revisions WHERE id=$1',[first.revisionId])).rowCount).toBe(1));
 },60000);
 it('minimizes 365-day receipt details atomically and preserves all configured opaque retry fences',async()=>{
  const customerId=DEMO_IDS.deniedCustomer,scope=await readExpansionWorkspace(panel,customerId,{}),requestKey=randomUUID();
  const command={contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,requestKey,expectedVersion:scope.scopeGeneration,content:{...discoveryHypothesis(),problemKey:randomUUID()},sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]};
  const receipt=await saveExpansionProposal(panel,customerId,command);expect(await expireExpansionReceipts()).toBe(0);
  await withExpansionDatabase(db=>db.query("UPDATE expansion_command_receipts SET created_at=clock_timestamp()-interval '366 days' WHERE id=$1",[receipt.id]));
  const original=process.env.TURAS_011_RECEIPT_HASH_KEYS;
  try{process.env.TURAS_011_RECEIPT_HASH_KEYS=JSON.stringify(['synthetic-011-rotation-key-32-characters-minimum',getServerConfig().TURAS_MAINTENANCE_SECRET]);
   expect(await expireExpansionReceipts()).toBe(1);
   await withExpansionDatabase(async db=>{expect((await db.query('SELECT 1 FROM expansion_command_receipts WHERE id=$1',[receipt.id])).rowCount).toBe(0);expect((await db.query('SELECT count(*)::int AS n FROM expansion_expired_command_keys')).rows[0].n).toBe(2);});
   await expect(saveExpansionProposal(panel,customerId,command)).rejects.toMatchObject({status:409,code:'expired_receipt'});
  }finally{if(original===undefined)delete process.env.TURAS_011_RECEIPT_HASH_KEYS;else process.env.TURAS_011_RECEIPT_HASH_KEYS=original;}
 },60000);
 it('expires owner and decision rationale at 365 days without deleting a current decided head, even while disabled',async()=>{
  const customerId=DEMO_IDS.deniedCustomer;
  await assignExpansionOwner(mcteer,customerId,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:panel.membershipId,rationale:'Synthetic explicit owner retention boundary'});
  const latest=await readExpansionWorkspace(panel,customerId,{});
  const saved=await saveExpansionProposal(panel,customerId,{contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,requestKey:randomUUID(),expectedVersion:latest.scopeGeneration,content:{...discoveryHypothesis(),title:'Synthetic current decided record',problemKey:randomUUID()},sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
  const preview=await createExpansionPreview(panel,customerId,{workloadId:null,recordId:saved.recordId,revisionId:saved.revisionId,kind:'full'});
  const decision=await decideExpansionHypothesis(panel,customerId,{contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId:null,recordId:saved.recordId,revisionId:saved.revisionId,expectedVersion:saved.version,expectedAssignmentVersion:preview.expectedAssignmentVersion,previewDigest:preview.previewDigest,decision:'dismiss',rationale:'Synthetic retained decision identity with expiring detail'});
  await ageImmutable('expansion_revisions','expansion_revision_immutable','created_at',saved.revisionId!,400);
  await withExpansionDatabase(async db=>{const payloads=(await db.query('SELECT p.created_at,p.purge_at FROM expansion_payloads p LEFT JOIN expansion_owner_events e ON e.id=p.owner_event_id WHERE p.decision_id=$1 OR e.customer_id=$2',[decision.decisionId,customerId])).rows;expect(payloads).toHaveLength(2);for(const payload of payloads)expect(new Date(payload.purge_at).getTime()-new Date(payload.created_at).getTime()).toBe(365*86400000);
   await db.query("UPDATE expansion_payloads p SET purge_at=clock_timestamp()-interval '1 second' WHERE p.decision_id=$1 OR p.owner_event_id IN(SELECT id FROM expansion_owner_events WHERE customer_id=$2)",[decision.decisionId,customerId]);});
  expect((await readExpansionWorkspace(panel,customerId,{recordId:saved.recordId})).records[0].lastDecision?.rationale).toBeNull();
  const disabled=process.env.TURAS_011_DISABLED;try{process.env.TURAS_011_DISABLED='1';expect((await runExpansionCleanupTick()).purged).toBe(2);
   const view=await readExpansionWorkspace(panel,customerId,{recordId:saved.recordId});expect(view.assignment.active).toBe(true);expect(view.records[0].decided.payload?.content.title).toBe('Synthetic current decided record');expect(view.records[0].disposition).toBe('dismissed');
  }finally{if(disabled===undefined)delete process.env.TURAS_011_DISABLED;else process.env.TURAS_011_DISABLED=disabled;}
 },60000);

});
