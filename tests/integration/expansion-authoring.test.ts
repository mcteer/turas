import {randomUUID} from 'node:crypto';
import {beforeAll,describe,it,expect} from 'vitest';
import {createProfileTestSession} from '../fixtures/profiles';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import type {ExpansionSaveCommand} from '../../lib/server/expansion/schema';
import {searchExpansionEvidence} from '../../lib/server/expansion/sources';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {weakPublicExpansionEvidence} from '../fixtures/expansion/evidence';
import {discoveryHypothesis} from '../fixtures/expansion';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {readExpansionReceipt,lockExpansionCommandKey,saveExpansionReceipt,expansionHash} from '../../lib/server/expansion/commands';
import {saveExpansionProposal} from '../../lib/server/expansion/service';
import {readExpansionRevision,readExpansionWorkspace} from '../../lib/server/expansion/projection';
describe('Human expansion authoring',()=>{
 let panel:CurrentSession,partner:CurrentSession;
 beforeAll(async()=>{({panel,partner}=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),partner:await createProfileTestSession(db,'partner')})));});
 async function customer(){const id=randomUUID();await withExpansionDatabase(db=>db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic authoring customer',true)",[id,DEMO_IDS.workspace]));return id;}
 const command=():ExpansionSaveCommand=>({contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:null,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
 it('a same-key race saves one proposed revision and no decision',async()=>{
  const id=await customer(),input=command();const[first,replay]=await Promise.all([saveExpansionProposal(panel,id,input),saveExpansionProposal(panel,id,input)]);expect(first).toEqual(replay);expect(first.outcome).toBe('proposed');
  await withExpansionDatabase(async db=>{expect(Number((await db.query('SELECT count(*) AS n FROM expansion_revisions WHERE record_id=$1',[first.recordId])).rows[0].n)).toBe(1);expect((await db.query('SELECT decided_revision_id FROM expansion_hypotheses WHERE id=$1',[first.recordId])).rows[0].decided_revision_id).toBeNull();});
  await expect(saveExpansionProposal(panel,id,{...input,content:{...input.content,title:'Changed input'}})).rejects.toMatchObject({status:409});
 });
 it('receipt reconciliation waits for the in-flight key and rechecks current authorization',async()=>{
  const id=await customer(),input=command();let unlock!:()=>void,locked!:()=>void;
  const ready=new Promise<void>(resolve=>{locked=resolve}),release=new Promise<void>(resolve=>{unlock=resolve});
  const writer=withExpansionDatabase(async db=>{
   await db.query('BEGIN');await lockExpansionCommandKey(db,panel,input.requestKey);locked();await release;const result=await saveExpansionReceipt(db,panel,id,input.requestKey,expansionHash(input),{operation:'save_hypothesis',recordId:null,revisionId:null,decisionId:null,outcome:'proposed',version:0});await db.query('COMMIT');return result;
  });
  await ready;const lookup=readExpansionReceipt(panel,input.requestKey);
  unlock();const saved=await writer;expect(await lookup).toEqual(saved);
  expect(await readExpansionReceipt(panel,input.requestKey)).toEqual(saved);
  await expect(readExpansionReceipt(partner,input.requestKey)).rejects.toMatchObject({status:404});
 });
 it('new revisions do not inherit qualification and invalid identity edits fail',async()=>{
  const id=await customer(),input=command(),first=await saveExpansionProposal(panel,id,input);
  const revised=await saveExpansionProposal(panel,id,{...input,requestKey:randomUUID(),recordId:first.recordId,expectedVersion:first.version,content:{...input.content,title:'Revised proposal'}});expect(revised.version).toBe(2);
  await expect(saveExpansionProposal(panel,id,{...input,requestKey:randomUUID(),recordId:first.recordId,expectedVersion:2,content:{...input.content,productKey:'different-product'}})).rejects.toMatchObject({status:409});
 });
 it('direct revision reads cannot cross customer or partner authority',async()=>{
  const id=await customer(),other=await customer(),saved=await saveExpansionProposal(panel,id,command());
  await withExpansionDatabase(async db=>{
   await expect(readExpansionRevision(db,panel,other,null,saved.revisionId)).rejects.toMatchObject({status:404});
   await expect(readExpansionRevision(db,partner,id,null,saved.revisionId)).rejects.toMatchObject({status:404});
  });
 });
 it('history pages bind the exact actor/scope/head and historical reads recheck original eligibility',async()=>{
  const id=await customer(),input=command(),first=await saveExpansionProposal(panel,id,input);
  const second=await saveExpansionProposal(panel,id,{...input,requestKey:randomUUID(),recordId:first.recordId,expectedVersion:first.version,content:{...input.content,title:'Second revision'}});
  const page=await readExpansionWorkspace(panel,id,{recordId:first.recordId,limit:1});expect(page.records[0].history?.revisions.map(item=>item.ordinal)).toEqual([2]);
  const cursor=page.records[0].history?.nextCursor;expect(cursor).toBeTruthy();
  const older=await readExpansionWorkspace(panel,id,{recordId:first.recordId,limit:1,cursor});expect(older.records[0].history?.revisions.map(item=>item.ordinal)).toEqual([1]);
  const detail=await readExpansionWorkspace(panel,id,{recordId:first.recordId,revisionId:first.revisionId,limit:1});expect(detail.records[0].history?.selected?.payload?.content.title).toBe(input.content.title);
  await saveExpansionProposal(panel,id,{...input,requestKey:randomUUID(),recordId:first.recordId,expectedVersion:second.version,content:{...input.content,title:'Third revision'}});
  await expect(readExpansionWorkspace(panel,id,{recordId:first.recordId,limit:1,cursor})).rejects.toMatchObject({status:409});
 });
 it('weak public observations remain attributed and source withdrawal withholds current and historical prose',async()=>{
  const id=await customer(),publicEvidence=await weakPublicExpansionEvidence(panel,id),input=command();
  input.sourceRefs=[publicEvidence.reference];
  input.content.assertions=[{purpose:'product_suitability',classification:'attributed_observation',text:publicEvidence.passage,sourceKeys:[publicEvidence.reference.id]}];
  const before=await withExpansionDatabase(async db=>(await db.query(`SELECT (SELECT count(*) FROM profile_records WHERE customer_id=$1) AS profiles,
   (SELECT count(*) FROM delivery_plans WHERE customer_id=$1) AS plans`,[id])).rows[0]);
  const saved=await saveExpansionProposal(panel,id,input);
  const found=await searchExpansionEvidence(panel,id,null,'public marketing observation');
  expect(found.results[0]?.title).toMatch(/^Synthetic Public Observation X+/);expect(found.results[0]?.caveats).toContain('Discovery-only evidence; qualification requires stronger direct support.');
  expect((await readExpansionWorkspace(panel,id,{})).records[0].working.payload?.content.assertions[0].classification).toBe('attributed_observation');
  await expect(saveExpansionProposal(panel,id,{...input,requestKey:randomUUID(),recordId:saved.recordId,expectedVersion:saved.version,
   content:{...input.content,assertions:[{...input.content.assertions[0],classification:'accepted_fact'}]}})).rejects.toMatchObject({status:422});
  const after=await withExpansionDatabase(async db=>(await db.query(`SELECT (SELECT count(*) FROM profile_records WHERE customer_id=$1) AS profiles,
   (SELECT count(*) FROM delivery_plans WHERE customer_id=$1) AS plans`,[id])).rows[0]);expect(after).toEqual(before);
  await withExpansionDatabase(db=>db.query(`INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,actor_membership_id,rationale)
   VALUES($1,$2,1,'withdraw',$3,'Synthetic public source withdrawn while maintenance is paused')`,[randomUUID(),publicEvidence.reference.sourceRevisionId,panel.membershipId]));
  const hidden=await readExpansionWorkspace(panel,id,{recordId:saved.recordId,revisionId:saved.revisionId});
  expect(hidden.records[0].working.payload).toBeNull();expect(hidden.records[0].history?.selected?.payload).toBeNull();expect(hidden.records[0].disposition).toBe('proposed');
 });
 it('does not admit pending profile claims or another customer’s original source',async()=>{
  const id=await customer(),other=await customer(),foreign=await weakPublicExpansionEvidence(panel,other);
  const pending=await submitProfileCommand(panel,id,{action:'propose_record',requestKey:randomUUID(),workloadId:null,requestedAudience:'internal',dataCategory:'other_internal',
   payload:{kind:'claim',text:'Pending synthetic operating claim',sourceType:'manual',sourceExcerpt:'Unreviewed synthetic assertion'}}) as {revisionId:string};
  const revision=await withExpansionDatabase(async db=>(await db.query('SELECT content_digest FROM profile_revisions WHERE id=$1',[pending.revisionId])).rows[0]);
  for(const reference of [foreign.reference,{id:randomUUID(),kind:'accepted_profile',sourceRevisionId:pending.revisionId,generation:1,contentDigest:revision.content_digest,locator:{kind:'profile_field',fieldPath:'text'}}]){
   await expect(saveExpansionProposal(panel,id,{...command(),sourceRefs:[reference]})).rejects.toMatchObject({status:409});
  }
  expect((await readExpansionWorkspace(panel,id,{})).records).toHaveLength(0);
 });
 it('partners cannot read or save even an assigned customer',async()=>{
  await expect(saveExpansionProposal(partner,DEMO_IDS.sharedCustomer,command())).rejects.toMatchObject({status:404});
  await expect(readExpansionWorkspace(partner,DEMO_IDS.sharedCustomer,{})).rejects.toMatchObject({status:404});
 });
 it('historical receipt replay does not require a former next-step owner to remain active',async()=>{
  const id=await customer(),input=command();input.content.nextStep.owner={kind:'membership',membershipId:DEMO_IDS.mcteerMembership};
  const first=await saveExpansionProposal(panel,id,input);
  await withExpansionDatabase(db=>db.query('UPDATE principals SET active=false WHERE id=$1',[DEMO_IDS.mcteer]));
  try{expect(await saveExpansionProposal(panel,id,input)).toEqual(first);
   await expect(saveExpansionProposal(panel,id,{...input,requestKey:randomUUID(),recordId:first.recordId,expectedVersion:first.version})).rejects.toMatchObject({status:422});
  }finally{await withExpansionDatabase(db=>db.query('UPDATE principals SET active=true WHERE id=$1',[DEMO_IDS.mcteer]));}
 });
 it('same-key receipt survives disable while new mutations do not',async()=>{
  const id=await customer(),input=command(),first=await saveExpansionProposal(panel,id,input),prior=process.env.TURAS_011_DISABLED;
  try{process.env.TURAS_011_DISABLED='1';expect(await saveExpansionProposal(panel,id,input)).toEqual(first);await expect(saveExpansionProposal(panel,id,{...input,requestKey:randomUUID()})).rejects.toMatchObject({status:503});}finally{if(prior===undefined)delete process.env.TURAS_011_DISABLED;else process.env.TURAS_011_DISABLED=prior;}
 });
});
