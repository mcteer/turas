import {discoveryHypothesis} from '../fixtures/expansion';
import {saveExpansionProposal} from '../../lib/server/expansion/service';
import {describe,it,expect,beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {createProfileTestSession} from '../fixtures/profiles';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {requireExpansionEnvironment,lockExpansionActor,expansionAssignment,requireExpansionReviewer,isExpansionOwnerAdministrator} from '../../lib/server/expansion/policy';
import {withTransaction} from '../../lib/server/db/client';
import {dependencyUnion} from '../../lib/server/expansion/dependencies';
import {expansionHash,expansionOpaqueHashes,lockExpansionCommandKey,saveExpansionReceipt,expansionReceipt,admitExpansionRequest} from '../../lib/server/expansion/commands';
import {getServerConfig} from '../../lib/server/config';

describe('Expansion foundational authorization and integrity',()=>{
 let panel:CurrentSession,mcteer:CurrentSession,partner:CurrentSession;
 beforeAll(async()=>{({panel,mcteer,partner}=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer'),partner:await createProfileTestSession(db,'partner')})));});
 it('internal read permission never establishes owner decision authority',async()=>{
  await withTransaction(async db=>{await lockExpansionActor(db,panel,DEMO_IDS.sharedCustomer);const owner=await expansionAssignment(db,panel,DEMO_IDS.sharedCustomer);expect(owner.membershipId).toBeNull();expect(()=>requireExpansionReviewer(mcteer,owner)).toThrow();});
  expect(isExpansionOwnerAdministrator(mcteer)).toBe(true);expect(isExpansionOwnerAdministrator(panel)).toBe(false);
  await expect(withTransaction(db=>lockExpansionActor(db,partner,DEMO_IDS.sharedCustomer))).rejects.toMatchObject({status:404});
 });
 it('revoked sessions fail before record retrieval',async()=>{
  const revoked=await withExpansionDatabase(db=>createProfileTestSession(db,'panel'));
  await withExpansionDatabase(db=>db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[revoked.sessionId]));
  await expect(withTransaction(db=>lockExpansionActor(db,revoked,DEMO_IDS.sharedCustomer))).rejects.toMatchObject({status:401});
 });
 it('rejects conflicting source generation and digest instead of choosing one',async()=>{
  await withExpansionDatabase(async db=>{const id=randomUUID(),refs=[{id:randomUUID(),kind:'accepted_profile' as const,sourceRevisionId:id,generation:1,contentDigest:expansionHash('one'),locator:{kind:'profile_field' as const,fieldPath:'text'}},{id:randomUUID(),kind:'accepted_profile' as const,sourceRevisionId:id,generation:2,contentDigest:expansionHash('two'),locator:{kind:'profile_field' as const,fieldPath:'text'}}];
   await expect(dependencyUnion(db,panel,DEMO_IDS.sharedCustomer,refs)).rejects.toMatchObject({status:409});
  });
 });
 it('rejects forged workspace identity and an environment-marker mismatch',async()=>{
  await expect(withTransaction(db=>lockExpansionActor(db,{...panel,workspaceId:randomUUID()},DEMO_IDS.sharedCustomer))).rejects.toMatchObject({status:401});
  await withExpansionDatabase(async db=>{const prior=process.env.TURAS_ENVIRONMENT_ID;try{process.env.TURAS_ENVIRONMENT_ID='test-foreign-expansion-marker';await expect(requireExpansionEnvironment(db)).rejects.toMatchObject({status:503});}finally{process.env.TURAS_ENVIRONMENT_ID=prior;}});
 });
 it('fails closed above the dependency union bound',async()=>{
  await withExpansionDatabase(async db=>{const refs=Array.from({length:201},()=>({id:randomUUID(),kind:'accepted_profile' as const,sourceRevisionId:randomUUID(),generation:1,contentDigest:'a'.repeat(64),locator:{kind:'profile_field' as const,fieldPath:'claim.text'}}));
   await expect(dependencyUnion(db,panel,DEMO_IDS.sharedCustomer,refs)).rejects.toMatchObject({status:422});});
 });
 it('expired request keys stay fenced even while new work is disabled',async()=>{
  const key=randomUUID(),env=getServerConfig().TURAS_ENVIRONMENT_ID;
  const hash=expansionOpaqueHashes([env,panel.workspaceId,panel.membershipId,key])[0];
  await withExpansionDatabase(db=>db.query('INSERT INTO expansion_expired_command_keys(key_hash) VALUES($1)',[hash]));
  await expect(withTransaction(async db=>{await lockExpansionActor(db,panel,DEMO_IDS.sharedCustomer);await lockExpansionCommandKey(db,panel,key);})).rejects.toMatchObject({status:409,code:'expired_receipt'});
 });
 it('same-key receipt reconciliation preserves exact input and scope',async()=>{
  const key=randomUUID(),digest=expansionHash('synthetic request');
  const first=await withTransaction(async db=>{await lockExpansionActor(db,panel,DEMO_IDS.sharedCustomer);await lockExpansionCommandKey(db,panel,key);return saveExpansionReceipt(db,panel,DEMO_IDS.sharedCustomer,key,digest,{operation:'assign_owner',recordId:null,revisionId:null,decisionId:null,outcome:'assigned',version:1});});
  expect(await withTransaction(async db=>{await lockExpansionActor(db,panel,DEMO_IDS.sharedCustomer);await lockExpansionCommandKey(db,panel,key);return expansionReceipt(db,panel,DEMO_IDS.sharedCustomer,key,digest);})).toEqual(first);
  await expect(withTransaction(db=>expansionReceipt(db,panel,DEMO_IDS.sharedCustomer,key,expansionHash('changed')))).rejects.toMatchObject({status:409});
  await expect(withTransaction(db=>expansionReceipt(db,panel,DEMO_IDS.deniedCustomer,key,digest))).rejects.toMatchObject({status:404});
 });
 it('composite scope keys reject a workload from another customer',async()=>{
  await withExpansionDatabase(async db=>{
   const workload=randomUUID();await db.query("INSERT INTO customer_workloads(id,workspace_id,customer_id,display_name) VALUES($1,$2,$3,'Synthetic scoped workload')",[workload,DEMO_IDS.workspace,DEMO_IDS.sharedCustomer]);
   await expect(db.query('INSERT INTO expansion_scopes(id,environment_id,workspace_id,customer_id,workload_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,DEMO_IDS.workspace,DEMO_IDS.deniedCustomer,workload])).rejects.toMatchObject({code:'23503'});
  });
 });
 it('runtime cannot edit revision metadata or payload prose',async()=>{
  await withExpansionDatabase(async db=>{
   await db.query('BEGIN');try{await db.query('SET LOCAL ROLE turas_runtime');await expect(db.query('UPDATE expansion_payloads SET content=\'{}\'::jsonb')).rejects.toMatchObject({code:'42501'});}finally{await db.query('ROLLBACK');}
   const scope=randomUUID(),record=randomUUID(),revision=randomUUID();
   await db.query('INSERT INTO expansion_scopes(id,environment_id,workspace_id,customer_id) VALUES($1,$2,$3,$4)',[scope,getServerConfig().TURAS_ENVIRONMENT_ID,DEMO_IDS.workspace,DEMO_IDS.sharedCustomer]);
   await db.query('INSERT INTO expansion_hypotheses(id,scope_id,environment_id,workspace_id,customer_id,creator_membership_id,product_key,duplicate_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[record,scope,getServerConfig().TURAS_ENVIRONMENT_ID,DEMO_IDS.workspace,DEMO_IDS.sharedCustomer,panel.membershipId,'synthetic',expansionHash('duplicate')]);
   await db.query('INSERT INTO expansion_revisions(id,record_id,scope_id,revision_number,author_membership_id,content_digest,source_digest,vocabulary_version,ranking_version) VALUES($1,$2,$3,1,$4,$5,$5,$6,$7)',[revision,record,scope,panel.membershipId,expansionHash('content'),'expansion-products-v1','expansion-ranking-v1']);
   await expect(db.query('UPDATE expansion_revisions SET revision_number=2 WHERE id=$1',[revision])).rejects.toThrow();
   await expect(db.query('DELETE FROM expansion_revisions WHERE id=$1',[revision])).rejects.toThrow();
  });
 });
 it('commits quota before rejected source work and enforces read/write limits',async()=>{
  for(let index=0;index<120;index++)await admitExpansionRequest(panel,DEMO_IDS.sharedCustomer,'read');
  await expect(admitExpansionRequest(panel,DEMO_IDS.sharedCustomer,'read')).rejects.toMatchObject({status:429});
  for(let index=0;index<30;index++)await expect(saveExpansionProposal(panel,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),
   workloadId:null,expectedVersion:0,content:{...discoveryHypothesis(),nextReviewDate:'2020-01-01'},sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]})).rejects.toMatchObject({status:422});
  await expect(admitExpansionRequest(panel,DEMO_IDS.sharedCustomer,'write')).rejects.toMatchObject({status:429});
 },60000);
 it('expired-key cleanup and new admission serialize on the same opaque mutex',async()=>{
  const customerId=randomUUID(),requestKey=randomUUID();await withExpansionDatabase(db=>db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic expiry race',true)",[customerId,panel.workspaceId]));
  let ready!:()=>void,release!:()=>void;
  const locked=new Promise<void>(resolve=>{ready=resolve}),go=new Promise<void>(resolve=>{release=resolve});
  const cleanup=withExpansionDatabase(async db=>{
   await db.query('BEGIN');const hashes=await lockExpansionCommandKey(db,panel,requestKey);ready();await go;
   await db.query('INSERT INTO expansion_expired_command_keys(key_hash) VALUES($1)',[hashes[0]]);await db.query('COMMIT');
  });
  await locked;
  const save=saveExpansionProposal(panel,customerId,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey,workloadId:null,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
  const denied=expect(save).rejects.toMatchObject({status:409,code:'expired_receipt'});release();await cleanup;await denied;
  await withExpansionDatabase(async db=>expect((await db.query('SELECT 1 FROM expansion_hypotheses WHERE customer_id=$1',[customerId])).rowCount).toBe(0));
 });

 it('keeps scope and product identity immutable even for direct database writes',async()=>{
  const customerId=randomUUID(),other=randomUUID(),scopeId=randomUUID();
  await withExpansionDatabase(async db=>{
   for(const id of [customerId,other])await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic immutable identity',true)",[id,panel.workspaceId]);
   await db.query('INSERT INTO expansion_scopes(id,environment_id,workspace_id,customer_id) VALUES($1,$2,$3,$4)',[scopeId,getServerConfig().TURAS_ENVIRONMENT_ID,panel.workspaceId,customerId]);
   await expect(db.query('UPDATE expansion_scopes SET customer_id=$2 WHERE id=$1',[scopeId,other])).rejects.toMatchObject({code:'23514'});
  });
  const saved=await saveExpansionProposal(mcteer,customerId,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:null,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
  await withExpansionDatabase(async db=>await expect(db.query("UPDATE expansion_hypotheses SET product_key='different-product' WHERE id=$1",[saved.recordId])).rejects.toMatchObject({code:'23514'}));
 });
 it('rejects foreign revision authors and customer-mismatched receipt references',async()=>{
  const workspaceId=randomUUID(),principalId=randomUUID(),memberId=randomUUID(),customerId=randomUUID(),other=randomUUID();
  await withExpansionDatabase(async db=>{
   await db.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic foreign membership')",[workspaceId]);
   await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic foreign author')",[principalId,`synthetic-${principalId}`]);
   await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[memberId,principalId,workspaceId]);
   for(const id of [customerId,other])await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic receipt boundary',true)",[id,panel.workspaceId]);
  });
  const saved=await saveExpansionProposal(mcteer,customerId,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:null,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
  await withExpansionDatabase(async db=>{
   const scope=(await db.query('SELECT scope_id FROM expansion_hypotheses WHERE id=$1',[saved.recordId])).rows[0].scope_id;
   await expect(db.query(`INSERT INTO expansion_revisions(id,record_id,scope_id,revision_number,author_membership_id,content_digest,source_digest,vocabulary_version,ranking_version)
    VALUES($1,$2,$3,2,$4,$5,$5,'expansion-products-v1','expansion-ranking-v1')`,[randomUUID(),saved.recordId,scope,memberId,expansionHash('synthetic')])).rejects.toMatchObject({code:'23503'});
   await expect(db.query(`INSERT INTO expansion_command_receipts(id,environment_id,workspace_id,customer_id,actor_membership_id,request_key,request_digest,operation,record_id,outcome,version)
    VALUES($1,$2,$3,$4,$5,$6,$7,'save_hypothesis',$8,'proposed',1)`,[randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,panel.workspaceId,other,panel.membershipId,randomUUID(),expansionHash('synthetic'),saved.recordId])).rejects.toMatchObject({code:'23503'});
  });
 });

 it('preserves an early cleanup job until the actual payload deadline is due',async()=>{
  const customerId=randomUUID();await withExpansionDatabase(db=>db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic cleanup boundary',true)",[customerId,mcteer.workspaceId]));
  const saved=await saveExpansionProposal(mcteer,customerId,{contractVersion:'expansion-v1',operation:'save_hypothesis',workloadId:null,requestKey:randomUUID(),expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
  await withExpansionDatabase(async db=>{const payload=(await db.query("UPDATE expansion_payloads SET purge_at=clock_timestamp()+interval '1 day' WHERE revision_id=$1 RETURNING id",[saved.revisionId])).rows[0];await db.query("INSERT INTO expansion_cleanup_jobs(id,payload_id,deadline) VALUES($1,$2,clock_timestamp()-interval '1 second')",[randomUUID(),payload.id]);expect((await db.query('SELECT turas_expansion_purge($1,$2) AS purged',[getServerConfig().TURAS_ENVIRONMENT_ID,payload.id])).rows[0].purged).toBe(false);expect((await db.query('SELECT 1 FROM expansion_cleanup_jobs WHERE payload_id=$1',[payload.id])).rowCount).toBe(1);});
 });

});
