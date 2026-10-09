import {randomUUID} from 'node:crypto';
import {beforeAll,describe,it,expect} from 'vitest';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {createProfileTestSession} from '../fixtures/profiles';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {supportedExpansionProposal} from '../fixtures/expansion/supported';
import {assignExpansionOwner} from '../../lib/server/expansion/owners';
import {createExpansionPreview,decideExpansionHypothesis} from '../../lib/server/expansion/review';
import {saveExpansionProposal} from '../../lib/server/expansion/service';
import {readExpansionWorkspace} from '../../lib/server/expansion/projection';
import {submitProfileCommand} from '../../lib/server/profiles/service';
describe('Exact expansion disposition races',()=>{
 let panel:CurrentSession,mcteer:CurrentSession;
 beforeAll(async()=>{({panel,mcteer}=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer')})));});
 async function prepare(){
  const customerId=randomUUID();await withExpansionDatabase(db=>db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic disposition race',true)",[customerId,panel.workspaceId]));
  await assignExpansionOwner(mcteer,customerId,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:panel.membershipId,rationale:'Explicit synthetic designated owner'});
  const fixture=await supportedExpansionProposal(panel,mcteer,customerId),preview=await createExpansionPreview(panel,customerId,{workloadId:null,recordId:fixture.saved.recordId,revisionId:fixture.saved.revisionId,kind:'full'});
  expect(preview.qualificationChecks).toEqual([]);
  const decision={contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId:null,recordId:fixture.saved.recordId,revisionId:fixture.saved.revisionId,
   expectedVersion:fixture.saved.version,previewDigest:preview.previewDigest,expectedAssignmentVersion:preview.expectedAssignmentVersion,decision:'qualify',rationale:'Current owner reviews the exact need, support and proposed validation'};
  return {customerId,...fixture,decision};
 }
 it('one successful same-key qualification retains an old decided head across proposed edits',async()=>{
  const f=await prepare();const[a,b]=await Promise.all([decideExpansionHypothesis(panel,f.customerId,f.decision),decideExpansionHypothesis(panel,f.customerId,f.decision)]);expect(a).toEqual(b);
  const edited=await saveExpansionProposal(panel,f.customerId,{...f.command,requestKey:randomUUID(),recordId:f.saved.recordId,expectedVersion:a.version,content:{...f.command.content,title:'Synthetic proposed changes'}});
  const view=await readExpansionWorkspace(panel,f.customerId,{recordId:f.saved.recordId}),record=view.records[0];
  expect(record.disposition).toBe('qualified');expect(record.decidedRevisionId).toBe(f.saved.revisionId);expect(record.workingRevisionId).toBe(edited.revisionId);expect(record.reviewReasons).toContain('Proposed changes require review');expect(record.lastDecision?.reviewerName).toBe('panel');expect(record.lastDecision?.rationale).toBe(f.decision.rationale);
  await withExpansionDatabase(async db=>expect(Number((await db.query('SELECT count(*) AS n FROM expansion_decisions WHERE record_id=$1',[f.saved.recordId])).rows[0].n)).toBe(1));
 });
 it('an edit invalidates a prepared decision rather than applying it to a newer working head',async()=>{
  const f=await prepare();await saveExpansionProposal(panel,f.customerId,{...f.command,requestKey:randomUUID(),recordId:f.saved.recordId,expectedVersion:f.saved.version,content:{...f.command.content,title:'Changed during owner review'}});
  await expect(decideExpansionHypothesis(panel,f.customerId,f.decision)).rejects.toMatchObject({status:409});
  expect((await readExpansionWorkspace(panel,f.customerId,{recordId:f.saved.recordId})).records[0].disposition).toBe('proposed');
 });
 it('source withdrawal invalidates full review but permits an explicit metadata-only dismissal',async()=>{
  const f=await prepare();const version=await withExpansionDatabase(async db=>Number((await db.query('SELECT r.version FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1',[f.need.reviewedRevisionId])).rows[0].version));
  await submitProfileCommand(mcteer,f.customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:f.need.reviewedRevisionId,expectedRecordVersion:version,rationale:'Synthetic source withdrawal during exact review'});
  await expect(decideExpansionHypothesis(panel,f.customerId,f.decision)).rejects.toMatchObject({status:409});
  const metadata=await createExpansionPreview(panel,f.customerId,{workloadId:null,recordId:f.saved.recordId,revisionId:f.saved.revisionId,kind:'metadata'});expect(metadata.content).toBeNull();
  expect((await decideExpansionHypothesis(panel,f.customerId,{...f.decision,requestKey:randomUUID(),previewDigest:metadata.previewDigest,decision:'dismiss',rationale:'Owner dismisses unavailable content without releasing withdrawn prose'})).outcome).toBe('dismissed');
  expect((await readExpansionWorkspace(panel,f.customerId,{recordId:f.saved.recordId})).records[0].lastDecision?.rationale).toBeNull();
 });
 it('reassignment racing qualification either blocks it or marks the old qualification for fresh owner review',async()=>{
  const f=await prepare();const results=await Promise.allSettled([decideExpansionHypothesis(panel,f.customerId,f.decision),assignExpansionOwner(mcteer,f.customerId,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:1,membershipId:mcteer.membershipId,rationale:'Explicit concurrent owner reassignment'})]);
  expect(results[1].status).toBe('fulfilled');const view=await readExpansionWorkspace(panel,f.customerId,{recordId:f.saved.recordId});expect(view.assignment.membershipId).toBe(mcteer.membershipId);
  if(results[0].status==='fulfilled'){expect(view.records[0].disposition).toBe('qualified');expect(view.records[0].reviewReasons).toContain('Account owner changed');expect(await decideExpansionHypothesis(panel,f.customerId,f.decision)).toEqual(results[0].value);}
  else{expect([403,409]).toContain(results[0].reason.status);expect(view.records[0].disposition).toBe('proposed');}
 });
 it('two different-key decisions using one preview cannot both commit',async()=>{
  const f=await prepare(),revisitDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const results=await Promise.allSettled([decideExpansionHypothesis(panel,f.customerId,{...f.decision,decision:'dismiss'}),decideExpansionHypothesis(panel,f.customerId,{...f.decision,requestKey:randomUUID(),decision:'defer',revisitDate})]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);const failed=results.find(result=>result.status==='rejected');expect(failed?.reason.status).toBe(409);
  await withExpansionDatabase(async db=>expect(Number((await db.query('SELECT count(*) AS n FROM expansion_decisions WHERE record_id=$1',[f.saved.recordId])).rows[0].n)).toBe(1));
 });
});
