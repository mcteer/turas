import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import type {PoolClient} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {importPublicCustomerInventory,listPublicCustomerInventory} from '../../lib/server/profiles/public-inventory';
import {createOwnedConversation} from '../../lib/server/conversations/repository';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt,claimDispatch} from '../../lib/server/conversations/dispatch';
import {assertCustomerQuestionReads} from '../../lib/server/conversations/customer-accounts';
import {readCustomerAccountEvidence} from '../../lib/server/conversations/customer-accounts';
import {readProfile} from '../../lib/server/profiles/read';
import {readPublicInventoryReference} from '../../lib/server/profiles/public-inventory-reference';
import {withTransaction} from '../../lib/server/db/client';
const isolated=requireTestDatabaseUrl();
const ownedConversationIds:string[]=[];
beforeAll(()=>{const runtime=new URL(isolated);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.href;process.env.DATABASE_URL_UNPOOLED=runtime.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});

it('ports dated curated signals only onto checked sources, searches new research products, and rechecks grants and withdrawal',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const admin=await isolatedChatActor(db,'internal','admin'),partner=await isolatedChatActor(db,'partner','member',admin.workspaceId);
  const prefix='Inventory '+randomUUID(),a=randomUUID(),b=randomUUID(),c=randomUUID(),url='https://vercel.com/customers/fixture-'+randomUUID();
  for(const [id,suffix] of [[a,'A'],[b,'B'],[c,'C']])await db.query('INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,false)',[id,admin.workspaceId,prefix+' '+suffix]);
  const sourceId=randomUUID(),revisionId=randomUUID();
  await db.query("INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,canonical_location,trusted_ingest_identity) VALUES($1,$2,$3,'independent_research',$4,'synthetic-public-inventory')",[sourceId,admin.workspaceId,a,url]);
  await db.query(`INSERT INTO evidence_source_revisions(id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,passage_digest,retrieval_at,rights,audience,quality_input)
   VALUES($1,$2,$3,$4,1,$5,'Synthetic customer story','Synthetic account uses Vercel Sandboxes for its documented workload.','Synthetic account uses Vercel Sandboxes for its documented workload.',$6,now(),'Synthetic only','delivery','{}')`,[revisionId,sourceId,admin.workspaceId,a,url,'a'.repeat(64)]);
  await db.query(`INSERT INTO research_checks(source_revision_id,trusted_ingest_identity,check_version,identity_result,scope_result,integrity_result,content_result,rationale)
   VALUES($1,'synthetic-public-inventory','synthetic',true,true,true,true,'Synthetic only')`,[revisionId]);
  const snapshot={version:'synthetic-inventory-v1',reviewedAt:'2026-10-01',directoryUrl:'https://vercel.com/customers',accounts:[
   {id:'public-fixture-one',name:prefix+' A',aliases:[],directoryListed:true,formalMaturity:'unknown',internalEngagement:'not_available',evidence:[{url,title:'Synthetic customer story',publishedAt:'2026-09-01',scope:'Synthetic legacy checkout',signal:'Operational trust',products:['Fixture Legacy Product'],summary:'Dated synthetic public reference only.',cautions:[]}]},
   {id:'public-fixture-two',name:prefix+' B',aliases:[],directoryListed:true,formalMaturity:'unknown',internalEngagement:'not_available',evidence:[]},
   {id:'public-unresolved',name:prefix+' unresolved',aliases:[],directoryListed:true,formalMaturity:'unknown',internalEngagement:'not_available',evidence:[]}]};
  await expect(importPublicCustomerInventory(partner,snapshot)).rejects.toMatchObject({status:404});
  expect(await importPublicCustomerInventory(admin,snapshot)).toEqual({imported:2,replayed:0,unresolved:1,boundStories:1,unboundStories:0});
  expect(await importPublicCustomerInventory(admin,snapshot)).toMatchObject({imported:0,replayed:2});
  expect(Number((await db.query('SELECT count(*) AS n FROM profile_records WHERE customer_id=ANY($1::uuid[])',[[a,b,c]])).rows[0].n)).toBe(0);
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'inventory-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
  async function chat(actor:typeof admin){const key=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey:key});ownedConversationIds.push(conversation.id);const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Binding unavailable');const native='wrun_'+randomUUID();await bindNativeSession(actor,conversation.id,binding.claimToken,native);const attempt=await prepareAttempt(actor,conversation.id,native,randomUUID(),'Find customers by public product evidence.');await claimDispatch(actor,conversation.id,attempt.attemptId,0);return {conversation,attempt,principal:{principalId:actor.principalId,attributes:{turasAttemptId:attempt.attemptId}}};}
  const owner=await chat(admin),read=(input:unknown)=>withTransaction(client=>listPublicCustomerInventory(client,owner.principal,input));
  const all=await read({query:prefix});expect(all.total).toBe(3);expect(all.accounts.every(account=>account.formalMaturity==='unknown')).toBe(true);
  expect(all.accounts.find(account=>account.id===a)).toMatchObject({storyCount:1,directoryListed:true});expect(all.accounts.find(account=>account.id===c)).toMatchObject({storyCount:null,directoryListed:null});
  expect((await read({query:'Fixture Legacy Product',signal:'Operational trust'})).accounts.map(account=>account.id)).toEqual([a]);
  const evidence=await withTransaction(client=>readCustomerAccountEvidence(client,owner.principal,a));
  expect(evidence.publicInventory?.evidence[0]).toMatchObject({products:['Fixture Legacy Product'],signals:['Operational trust'],scope:'Synthetic legacy checkout',publishedAt:'2026-09-01'});
  expect(JSON.stringify(await readProfile(admin,a))).toContain('Fixture Legacy Product');
  const workloadAlias=prefix+' Product';
  await db.query("INSERT INTO customer_reference_aliases(customer_id,alias,kind) VALUES($1,$2,'documented_workload')",[a,workloadAlias]);
  const scoped={...snapshot,version:'synthetic-inventory-scoped-v2',accounts:[snapshot.accounts[0],{...snapshot.accounts[0],id:'public-product-alias',name:workloadAlias,evidence:[{...snapshot.accounts[0].evidence[0],scope:'Synthetic secondary workload',products:['Another Legacy Product'],signal:'Platform reuse'}]}]};
  expect(await importPublicCustomerInventory(admin,scoped)).toMatchObject({imported:1,unresolved:0,boundStories:2});
  expect((await withTransaction(client=>readPublicInventoryReference(client,admin,a)))?.evidence.map(story=>story.products)).toEqual(expect.arrayContaining([['Fixture Legacy Product'],['Another Legacy Product']]));
  expect((await read({query:'Sandbox'})).accounts.map(account=>account.id)).toContain(a);
  const first=await read({query:prefix,limit:1});expect(first.nextOffset).toBe(1);expect((await read({query:prefix,offset:1,limit:1})).accounts[0].id).not.toBe(first.accounts[0].id);
  await db.query("INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),admin.workspaceId,a,partner.membershipId,admin.principalId]);
  const assigned=await chat(partner);expect((await withTransaction(client=>listPublicCustomerInventory(client,assigned.principal,{query:prefix}))).accounts.map(account=>account.id)).toEqual([a]);
  await db.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[a,partner.membershipId]);
  await expect(withTransaction(client=>assertCustomerQuestionReads(client,partner,assigned.conversation.id,assigned.attempt.attemptId))).rejects.toMatchObject({status:404});
  expect((await withTransaction(client=>listPublicCustomerInventory(client,assigned.principal,{query:prefix}))).accounts).toEqual([]);
  const successor=randomUUID();
  await db.query(`INSERT INTO evidence_source_revisions(id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,passage_digest,retrieval_at,rights,audience,quality_input)
   SELECT $1,source_id,workspace_id,customer_id,2,location,title,passage||E'\n\nAdditional checked detail.',supported_claim,$2,now(),rights,audience,quality_input FROM evidence_source_revisions WHERE id=$3`,[successor,'b'.repeat(64),revisionId]);
  await db.query(`INSERT INTO research_checks(source_revision_id,trusted_ingest_identity,check_version,identity_result,scope_result,integrity_result,content_result,rationale)
   VALUES($1,'synthetic-public-inventory','synthetic',true,true,true,true,'{"retainedPreviousClaim":true}')`,[successor]);
  await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'supersede','Synthetic checked successor')",[randomUUID(),revisionId]);
  const retained=await withTransaction(client=>readPublicInventoryReference(client,admin,a));
  expect(retained?.evidence.find(story=>story.scope==='Synthetic legacy checkout')).toMatchObject({sourceRevisionId:successor,referenceSourceRevisionId:revisionId,products:['Fixture Legacy Product']});
  expect((await read({query:'Fixture Legacy Product',signal:'Operational trust'})).accounts.map(account=>account.id)).toEqual([a]);
  await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic withdrawal')",[randomUUID(),successor]);
  expect((await read({query:'Fixture Legacy Product',signal:'Operational trust'})).accounts).toEqual([]);
  expect((await read({query:'Sandbox'})).accounts.map(account=>account.id)).not.toContain(a);
  expect((await db.query("SELECT has_table_privilege('turas_runtime','public_customer_inventory_imports','UPDATE') AS can_rewrite,has_table_privilege('turas_runtime','public_customer_inventory_stories','DELETE') AS can_delete")).rows[0]).toEqual({can_rewrite:false,can_delete:false});
 }finally{try{await settleSyntheticConversationAttempts(db,ownedConversationIds);}finally{await db.end();}}
});
