import {withTransaction} from '../../lib/server/db/client';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createProfileTestSession } from '../fixtures/profiles';
import { withExpansionDatabase } from '../fixtures/expansion/environment';
import { DEMO_IDS } from '../../lib/server/bootstrap-ids';
import type { CurrentSession } from '../../lib/server/auth/sessions';
import { assignExpansionOwner, readExpansionOwners } from '../../lib/server/expansion/owners';
import { createExpansionPreview,decideExpansionHypothesis,expansionAllowedDecisions } from '../../lib/server/expansion/review';
import { saveExpansionProposal } from '../../lib/server/expansion/service';
import { readExpansionWorkspace } from '../../lib/server/expansion/projection';
import { discoveryHypothesis } from '../fixtures/expansion';
import { requireExpansionReviewer } from '../../lib/server/expansion/policy';
describe('Expansion account-owner decisions', () => {
 let mcteer: CurrentSession, panel: CurrentSession, partner: CurrentSession;
 beforeAll(async () => { ({ mcteer, panel, partner } = await withExpansionDatabase(async db => ({
  mcteer: await createProfileTestSession(db, 'mcteer'), panel: await createProfileTestSession(db, 'panel'), partner: await createProfileTestSession(db, 'partner') }))); });
 async function customer() { const id = randomUUID(); await withExpansionDatabase(db => db.query(
  "INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic owner customer',true)",[id,DEMO_IDS.workspace])); return id; }
 function command(membershipId: string | null, expectedVersion = 0) { return { contractVersion: 'expansion-v1', operation: 'assign_owner', requestKey: randomUUID(),
  expectedVersion, membershipId, rationale: 'Synthetic accountable ownership decision' }; }
 async function proposal(id:string){return saveExpansionProposal(panel,id,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:null,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});}
 it('transition matrix requires reopening and preserves distinct defer/dismiss states',()=>{
  expect(expansionAllowedDecisions('deferred')).toEqual(['defer','reopen']);
  expect(expansionAllowedDecisions('dismissed')).toEqual(['dismiss','reopen']);
 });
 it('exact owner preview rejects reassignment and missing qualification evidence',async()=>{
  const id=await customer(),saved=await proposal(id);await assignExpansionOwner(mcteer,id,command(panel.membershipId));
  const input={workloadId:null,recordId:saved.recordId,revisionId:saved.revisionId,kind:'full'};
  await expect(createExpansionPreview(mcteer,id,input)).rejects.toMatchObject({status:403});
  const preview=await createExpansionPreview(panel,id,input);
  const decide={contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId:null,recordId:saved.recordId,revisionId:saved.revisionId,expectedVersion:saved.version,
   expectedAssignmentVersion:preview.expectedAssignmentVersion,previewDigest:preview.previewDigest,decision:'qualify',rationale:'Synthetic owner review'};
  await expect(decideExpansionHypothesis(panel,id,decide)).rejects.toMatchObject({status:409});
  await assignExpansionOwner(mcteer,id,command(mcteer.membershipId,1));
  await expect(decideExpansionHypothesis(panel,id,{...decide,decision:'dismiss'})).rejects.toMatchObject({status:403});
 });
 it('same-key dismissal is one decision; edits preserve dismissal and explicit reopening returns proposed',async()=>{
  const id=await customer(),saved=await proposal(id);await assignExpansionOwner(mcteer,id,command(panel.membershipId));
  const input={workloadId:null,recordId:saved.recordId,revisionId:saved.revisionId,kind:'metadata'};
  const preview=await createExpansionPreview(panel,id,input),decision={contractVersion:'expansion-v1',operation:'decide_hypothesis',requestKey:randomUUID(),workloadId:null,
   recordId:saved.recordId,revisionId:saved.revisionId,expectedVersion:saved.version,expectedAssignmentVersion:preview.expectedAssignmentVersion,previewDigest:preview.previewDigest,decision:'dismiss',rationale:'Synthetic no-fit decision'};
  const[a,b]=await Promise.all([decideExpansionHypothesis(panel,id,decision),decideExpansionHypothesis(panel,id,decision)]);expect(a).toEqual(b);expect(a.outcome).toBe('dismissed');
  const edit=await saveExpansionProposal(panel,id,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:null,recordId:saved.recordId,
   expectedVersion:a.version,content:{...discoveryHypothesis(),title:'Changed dismissed proposal'},sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
  expect((await readExpansionWorkspace(panel,id,{recordId:saved.recordId})).records[0].disposition).toBe('dismissed');
  const next=await createExpansionPreview(panel,id,{...input,revisionId:edit.revisionId});
  expect((await decideExpansionHypothesis(panel,id,{...decision,requestKey:randomUUID(),revisionId:edit.revisionId,expectedVersion:edit.version,
   previewDigest:next.previewDigest,decision:'reopen',rationale:'Owner explicitly revisits discovery'})).outcome).toBe('proposed');
 });
 it('does not backfill ownership or grant admin an implicit review override', async () => {
  const id=await customer(), view=await readExpansionOwners(panel,id); expect(view.assignment.membershipId).toBeNull(); expect(view.candidates).toEqual([]);
  expect(()=>requireExpansionReviewer(mcteer,view.assignment)).toThrow();
 });
 it('only mcteer assigns an active internal member; partners cannot inspect',async()=>{
  const id=await customer(); await expect(assignExpansionOwner(panel,id,command(panel.membershipId))).rejects.toMatchObject({status:403});
  await expect(readExpansionOwners(partner,id)).rejects.toMatchObject({status:404});
  await expect(assignExpansionOwner(mcteer,id,command(partner.membershipId))).rejects.toMatchObject({status:422});
  const saved=await assignExpansionOwner(mcteer,id,command(panel.membershipId)); expect(saved.version).toBe(1);
  const view=await readExpansionOwners(panel,id); expect(view.assignment.membershipId).toBe(panel.membershipId);
  expect(()=>requireExpansionReviewer(panel,view.assignment)).not.toThrow(); expect(()=>requireExpansionReviewer(mcteer,view.assignment)).toThrow();
 });
 it('same-key races create one immutable assignment event and reject changed input',async()=>{
  const id=await customer(),input=command(panel.membershipId);const[a,b]=await Promise.all([assignExpansionOwner(mcteer,id,input),assignExpansionOwner(mcteer,id,input)]);expect(a).toEqual(b);
  await withExpansionDatabase(async db=>expect(Number((await db.query('SELECT count(*) AS n FROM expansion_owner_events WHERE customer_id=$1',[id])).rows[0].n)).toBe(1));
  await expect(assignExpansionOwner(mcteer,id,{...input,rationale:'Different input'})).rejects.toMatchObject({status:409});
 });
 it('reassignment and unassignment advance generations with exact versions',async()=>{
  const id=await customer();await assignExpansionOwner(mcteer,id,command(panel.membershipId));
  await expect(assignExpansionOwner(mcteer,id,command(mcteer.membershipId))).rejects.toMatchObject({status:409});
  await assignExpansionOwner(mcteer,id,command(mcteer.membershipId,1));await assignExpansionOwner(mcteer,id,command(null,2));
  expect((await readExpansionOwners(mcteer,id)).assignment).toMatchObject({membershipId:null,version:3,generation:3,active:false});
 });
 it('inactive assigned ownership blocks review without granting a different internal member authority',async()=>{
  const id=await customer(),saved=await proposal(id);await assignExpansionOwner(mcteer,id,command(mcteer.membershipId));
  await withExpansionDatabase(db=>db.query('UPDATE principals SET active=false WHERE id=$1',[mcteer.principalId]));
  try{expect((await readExpansionWorkspace(panel,id,{})).assignment.active).toBe(false);
   await expect(createExpansionPreview(panel,id,{workloadId:null,recordId:saved.recordId,revisionId:saved.revisionId,kind:'full'})).rejects.toMatchObject({status:403});
  }finally{await withExpansionDatabase(db=>db.query('UPDATE principals SET active=true WHERE id=$1',[mcteer.principalId]));}
 });
 it('defer dates are strictly future UTC days through the inclusive 366-day limit',async()=>{
  const id=await customer(),saved=await proposal(id);await assignExpansionOwner(mcteer,id,command(panel.membershipId));
  const preview=await createExpansionPreview(panel,id,{workloadId:null,recordId:saved.recordId,revisionId:saved.revisionId,kind:'full'});
  const base={contractVersion:'expansion-v1',operation:'decide_hypothesis',workloadId:null,recordId:saved.recordId,revisionId:saved.revisionId,expectedVersion:saved.version,expectedAssignmentVersion:preview.expectedAssignmentVersion,previewDigest:preview.previewDigest,decision:'defer',rationale:'Owner explicitly schedules a synthetic validation checkpoint'};
  for(const days of [0,367])await expect(decideExpansionHypothesis(panel,id,{...base,requestKey:randomUUID(),revisitDate:new Date(Date.now()+days*86400000).toISOString().slice(0,10)})).rejects.toMatchObject({status:422});
  const revisitDate=new Date(Date.now()+366*86400000).toISOString().slice(0,10);expect((await decideExpansionHypothesis(panel,id,{...base,requestKey:randomUUID(),revisitDate})).outcome).toBe('deferred');
  expect((await readExpansionWorkspace(panel,id,{recordId:saved.recordId})).records[0].lastDecision?.revisitDate).toBe(revisitDate);
  // Only the owned fixture clock advances; deployed decision headers stay immutable.
  await withTransaction(async db=>{await db.query('ALTER TABLE expansion_decisions DISABLE TRIGGER expansion_decision_immutable');await db.query("UPDATE expansion_decisions SET revisit_date=(clock_timestamp() AT TIME ZONE 'UTC')::date WHERE record_id=$1",[saved.recordId]);await db.query('ALTER TABLE expansion_decisions ENABLE TRIGGER expansion_decision_immutable');});
  const due=await readExpansionWorkspace(panel,id,{recordId:saved.recordId});expect(due.records[0].disposition).toBe('deferred');expect(due.records[0].reviewReasons).toContain('Deferred revisit due');
 });

});
