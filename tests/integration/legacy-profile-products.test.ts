import {projectNativeEvent} from '../../lib/server/conversations/projection';
import {wrapOrdinaryChatModel} from '../../lib/server/conversations/model-budget';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {authoredTool as adoptionTool} from '../../agent/tools/get_customer_adoption';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import {importPublicCustomerInventory} from '../../lib/server/profiles/public-inventory';
import {createOwnedConversation} from '../../lib/server/conversations/repository';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt,claimDispatch} from '../../lib/server/conversations/dispatch';
import {refreshOrdinaryKnowledge} from '../../lib/server/conversations/current-knowledge';
import {adoptionAccountsInTurn} from '../../lib/server/conversations/adoption-context';
import {randomUUID,createHash} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it,vi} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {legacyResearchFixture,legacyResearchSource} from '../fixtures/legacy-research';
import {readProfile} from '../../lib/server/profiles/read';
import {withTransaction} from '../../lib/server/db/client';
import {readPublicCustomerInventory} from '../../lib/server/profiles/public-inventory';
import {readEligibleContext} from '../../lib/server/profiles/context';
import {recallPublicLearning} from '../../lib/server/research/specialists/research-cache/public-learning';
const isolated=requireTestDatabaseUrl();
beforeAll(()=>{const url=new URL(isolated);url.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=url.href;process.env.DATABASE_URL_UNPOOLED=url.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
const products=(profile:unknown)=>[...new Set((profile as {attributedResearch:{productNames:string[]}[]}).attributedResearch.flatMap(source=>source.productNames))];
it('uses the original eight ordered1600-character learning passages across profile and later account reads',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const {actor,customerId,identity}=await legacyResearchFixture(db);
  const first=await legacyResearchSource(db,identity,customerId,{quote:'Next.js was evaluated for an historical proof of concept. '+ 'x'.repeat(1600)+' AI SDK, AI Gateway and Vercel Sandbox.',passage:'Next.js was evaluated. AI SDK, AI Gateway and Vercel Sandbox.'});
  for(let i=1;i<8;i++)await legacyResearchSource(db,identity,customerId,{quote:i===1?'Vercel Connect calls the external service; reverse integration is not customer adoption.':'No product finding retained in this synthetic passage.',age:i});
  await legacyResearchSource(db,identity,customerId,{quote:'Vercel Workflows and Vercel Blob appear in a ninth, older passage.',age:100});
  const retained=await recallPublicLearning(identity,customerId,'',new AbortController().signal);
  expect(retained).toHaveLength(8);expect(retained.find(row=>row.url===first.url)).toMatchObject({quoteTruncated:true});
  expect(retained.every(row=>row.quote.length<=1600)).toBe(true);
  expect(products(await readProfile(actor,customerId)).sort()).toEqual(['Connect','Next.js']);
  expect((await withTransaction(client=>readPublicCustomerInventory(client,actor,{query:'AI Gateway'}))).accounts).toEqual([]);
  expect((await withTransaction(client=>readPublicCustomerInventory(client,actor,{query:'Next.js'}))).accounts.map(row=>row.id)).toEqual([customerId]);
  // Newer canonical-only sources may not crowd out the original ledger's eight selections.
  for(let i=0;i<51;i++)await legacyResearchSource(db,identity,customerId,{quote:'AI SDK appears in a later canonical-only source.',ledger:false});
  expect(products(await readProfile(actor,customerId)).sort()).toEqual(['Connect','Next.js']);
  const account=await readEligibleContext(actor,customerId,{includeProductIndex:true}) as {productIndex:{products:{name:string}[]}};
  expect(account.productIndex.products.map(item=>item.name).sort()).toEqual(['Connect','Next.js']);
  await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic withdrawal')",[randomUUID(),first.revisionId]);
  expect(products(await readProfile(actor,customerId)).sort()).toEqual(['Blob','Connect','Workflows']);
  expect((await recallPublicLearning(identity,customerId,'',new AbortController().signal)).map(row=>row.url)).not.toContain(first.url);
 }finally{await db.end();}
});
it('uses exact canonical passages only for URLs absent from learning, preserving ledger precedence and dates',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const {actor,customerId,identity}=await legacyResearchFixture(db);
  const original=await legacyResearchSource(db,identity,customerId,{quote:'The retained account passage establishes Next.js.',passage:'Incidental canonical text names AI Gateway and Vercel Sandbox.'});
  const fallback=await legacyResearchSource(db,identity,customerId,{quote:'Exact canonical passage describes Vercel Blob.',ledger:false,age:50});
  const full='The complete document also mentions AI SDK and Vercel Workflows.';
  await db.query('INSERT INTO independent_research_documents(source_revision_id,document_text,document_digest) VALUES($1,$2,$3)',[fallback.revisionId,full,createHash('sha256').update(full).digest('hex')]);
  const retained=await recallPublicLearning(identity,customerId,'',new AbortController().signal);
  expect(retained.map(row=>row.url)).toEqual([original.url,fallback.url]);
  expect(retained.find(row=>row.url===fallback.url)).toMatchObject({quote:'Exact canonical passage describes Vercel Blob.',publishedAt:'2022-03-29',lastSeen:fallback.checkedAt});
  expect(products(await readProfile(actor,customerId)).sort()).toEqual(['Blob','Next.js']);
 }finally{await db.end();}
});

it('retains original per-URL passage interleaving rather than taking every passage from one source first',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const {customerId,identity}=await legacyResearchFixture(db);
  const first=await legacyResearchSource(db,identity,customerId,{quote:'First source first retained passage.',age:0});
  const second=await legacyResearchSource(db,identity,customerId,{quote:'Second source first retained passage.',age:1});
  for(const [source,quote,age] of [[first,'First source second retained passage.',20],[second,'Second source second retained passage.',21]] as const){
   await db.query(`INSERT INTO turas_public_learning(environment_id,workspace_id,account_id,id,source_id,snapshot_id,url,title,passage_id,quote,published_at,source_type,last_seen)
    VALUES($1,$2,$3,$4,'synthetic',$5,$6,'Synthetic source','p2',$7,'2022-03-29','customer_publication',now()-$8*interval '1 second')`,[identity.environmentId,identity.workspaceId,customerId,randomUUID(),source.snapshotId,source.url,quote,age]);
  }
  expect((await recallPublicLearning(identity,customerId,'',new AbortController().signal)).map(row=>row.quote)).toEqual([
   'First source first retained passage.','Second source first retained passage.','First source second retained passage.','Second source second retained passage.',
  ]);
 }finally{await db.end();}
});

it('name, workload and curated product discovery bypasses retained research without changing OR or signal matches',async()=>{
 const owner=new Client({connectionString:isolated});await owner.connect();try{
  const {actor,customerId,identity}=await legacyResearchFixture(owner);
  const source=await legacyResearchSource(owner,identity,customerId,{quote:'Vercel Firewall and Next.js are retained research labels.'});
  await owner.query("INSERT INTO customer_reference_aliases(customer_id,alias,kind) VALUES($1,'Synthetic delivery workload','documented_workload')",[customerId]);
  const nameMatchId=randomUUID();
  await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Vercel Name Match',false)",[nameMatchId,actor.workspaceId]);
  const importId=randomUUID();
  await owner.query(`INSERT INTO public_customer_inventory_imports(id,workspace_id,customer_id,reference_version,reviewed_on,directory_url,directory_listed,story_count,input_digest,imported_by)
   VALUES($1,$2,$3,'synthetic-query-boundary','2026-10-15','https://vercel.com/customers',true,1,$4,$5)`,[importId,actor.workspaceId,customerId,createHash('sha256').update(importId).digest('hex'),actor.membershipId]);
  await owner.query(`INSERT INTO public_customer_inventory_stories(id,import_id,source_revision_id,workload,products,signals,title,published_on,summary,cautions)
   VALUES($1,$2,$3,'Synthetic cited workload',ARRAY['Fixture Curated Product'],ARRAY['Product adoption'],'Synthetic checked story','2026-10-15','Synthetic story scope','{}')`,[randomUUID(),importId,source.revisionId]);
  await withTransaction(async client=>{
   const observed=vi.spyOn(client,'query');try{
    for(const query of ['parity account','delivery workload','Fixture Curated Product','']){
     observed.mockClear();
     expect((await readPublicCustomerInventory(client,actor,{query,signal:'Product adoption'})).accounts.map(row=>row.id)).toEqual([customerId]);
     const sql=observed.mock.calls.map(call=>String(call[0]));
     expect(sql.some(statement=>statement.includes('WITH learning AS'))).toBe(false);
     expect(sql.some(statement=>/SELECT v\.id,v\.customer_id,(?:v\.title,v\.passage,)?v\.location/.test(statement))).toBe(false);
    }
    observed.mockClear();
    expect((await readPublicCustomerInventory(client,actor,{query:'vercel'})).accounts.map(row=>row.id).sort()).toEqual([customerId,nameMatchId].sort());
    expect(observed.mock.calls.some(call=>String(call[0]).includes('WITH learning AS'))).toBe(true);
    expect((await readPublicCustomerInventory(client,actor,{query:'parity account',signal:'Operational trust'})).accounts).toEqual([]);
   }finally{observed.mockRestore();}
  });
 }finally{await owner.end();}
});

it('batch recall preserves each independent eight-passage boundary with constant authorization and eligibility queries',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const {identity,customerId}=await legacyResearchFixture(db);
  const ids=[customerId];
  for(let account=0;account<12;account++){
   const id=account===0?customerId:randomUUID();if(account) {ids.push(id);await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic batch recall',false)",[id,identity.workspaceId]);}
   for(let i=0;i<9;i++)await legacyResearchSource(db,identity,id,{quote:`Account ${account} passage ${i} Next.js `+'x'.repeat(i===0?1700:0),age:i,ledger:i!==8});
  }
  const {recallPublicLearningForAccounts}=await import('../../lib/server/research/specialists/research-cache/public-learning-read');
  let queryCount=0;
  const batch=await withTransaction(async client=>{const spy=vi.spyOn(client,'query');try{const rows=await recallPublicLearningForAccounts(identity,ids,new AbortController().signal,client);queryCount=spy.mock.calls.length;return rows;}finally{spy.mockRestore();}});
  expect(batch).toHaveLength(96);expect(queryCount).toBeLessThanOrEqual(26);
  for(const id of ids){
   const individual=await withTransaction(client=>recallPublicLearning(identity,id,'',new AbortController().signal,false,client));
   expect(batch.filter(row=>row.accountId===id)).toEqual(individual);
   expect(individual).toHaveLength(8);expect(individual[0].quote).toHaveLength(1600);expect(individual[0].quoteTruncated).toBe(true);
  }
  const smallQueries=await withTransaction(async client=>{const spy=vi.spyOn(client,'query');try{await recallPublicLearningForAccounts(identity,[customerId],new AbortController().signal,client);return spy.mock.calls.length;}finally{spy.mockRestore();}});
  expect(queryCount).toBe(smallQueries);
 }finally{await db.end();}
});

it('batch canonical eligibility requires every matching head and never refills a selected slot after final eligibility',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const {identity,customerId}=await legacyResearchFixture(db);
  const first=await legacyResearchSource(db,identity,customerId,{quote:'Next.js retained first',age:0});
  for(let i=1;i<9;i++)await legacyResearchSource(db,identity,customerId,{quote:`Retained ${i} Vercel Blob`,age:i});
  // Valid digest but no projectable text is deliberately only a final-policy exclusion.
  await db.query('INSERT INTO independent_research_documents(source_revision_id,document_text,document_digest) VALUES($1,$2,$3)',[first.revisionId,'   ',createHash('sha256').update('   ').digest('hex')]);
  const {recallPublicLearningForAccounts}=await import('../../lib/server/research/specialists/research-cache/public-learning-read');
  const rows=await withTransaction(client=>recallPublicLearningForAccounts(identity,[customerId],new AbortController().signal,client));
  expect(rows).toHaveLength(7);expect(rows.map(row=>row.url)).not.toContain(first.url);
  const {researchSourcesAreEligibleInTransaction,researchSourceKey}=await import('../../lib/server/research/specialists/account');
  await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic withdrawal')",[randomUUID(),first.revisionId]);
  const refs=[{accountId:customerId,url:first.url},{accountId:customerId,url:'https://example.com/no-canonical-head'}];
  const eligible=await withTransaction(client=>researchSourcesAreEligibleInTransaction(client,identity,refs));
  expect(eligible.get(researchSourceKey(refs[0]))).toBe(false);expect(eligible.get(researchSourceKey(refs[1]))).toBe(true);
  const {researchSourceIsEligibleInTransaction}=await import('../../lib/server/research/specialists/account');
  expect(await withTransaction(client=>researchSourceIsEligibleInTransaction(client,identity,customerId.toUpperCase(),first.url))).toBe(false);
  expect(researchSourceKey({accountId:customerId.toUpperCase(),url:first.url})).toBe(researchSourceKey(refs[0]));
  const conflicted=await legacyResearchSource(db,identity,customerId,{quote:'Synthetic confirmed conflict'});
  await db.query(`INSERT INTO evidence_conflict_targets(id,environment_id,scope,workspace_id,customer_id,first_kind,first_revision_id,second_kind,second_revision_id,period_start,period_end,state,rationale)
   VALUES($1,$2,'customer',$3,$4,'verified_research',$5,'verified_research',$6,'2026-01-01','2026-12-31','confirmed','Synthetic uppercase UUID conflict')`,[randomUUID(),identity.environmentId,identity.workspaceId,customerId,conflicted.revisionId,randomUUID()]);
  expect(await withTransaction(client=>researchSourceIsEligibleInTransaction(client,identity,customerId.toUpperCase(),conflicted.url))).toBe(false);

 }finally{await db.end();}
});

it('batch recall rejects an entire requested customer set when a partner grant is absent or revoked',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const {identity,customerId}=await legacyResearchFixture(db);
  const other=randomUUID();await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic ungranted account',false)",[other,identity.workspaceId]);
  await legacyResearchSource(db,identity,customerId,{quote:'Next.js delivery evidence'});
  const {isolatedChatActor}=await import('../fixtures/isolated-chat-actor');
  const partner=await isolatedChatActor(db,'partner','member',identity.workspaceId);
  await db.query("INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),partner.workspaceId,customerId,partner.membershipId,partner.principalId]);
  const actor={...partner,userId:partner.principalId,environmentId:identity.environmentId};
  const {recallPublicLearningForAccounts}=await import('../../lib/server/research/specialists/research-cache/public-learning-read');
  expect(await withTransaction(client=>recallPublicLearningForAccounts(actor,[customerId],new AbortController().signal,client))).toHaveLength(1);
  await expect(withTransaction(client=>recallPublicLearningForAccounts(actor,[customerId,other],new AbortController().signal,client))).rejects.toMatchObject({status:404});
  await db.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[customerId,partner.membershipId]);
  await expect(withTransaction(client=>recallPublicLearningForAccounts(actor,[customerId],new AbortController().signal,client))).rejects.toMatchObject({status:404});
 }finally{await db.end();}
});


it('keeps unrelated vendor prose out of the adoption tool and following model-context refresh',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();const owned:string[]=[];
 try{
  const {actor,customerId,identity}=await legacyResearchFixture(db);
  const admin=await isolatedChatActor(db,'internal','admin',actor.workspaceId);
  const passage='The synthetic customer uses Next.js for Storefront. A different company uses Vercel Blob.';
  const {url,revisionId}=await legacyResearchSource(db,identity,customerId,{quote:passage,url:`https://vercel.com/customers/fixture-${randomUUID()}`});
  expect(await importPublicCustomerInventory(admin,{version:'adoption-synthetic-v1',reviewedAt:'2026-10-01',directoryUrl:'https://vercel.com/customers',accounts:[{
   id:'adoption-fixture',name:'Synthetic parity account',aliases:[],directoryListed:true,formalMaturity:'unknown',internalEngagement:'not_available',
   evidence:[{url,title:'Synthetic storefront story',publishedAt:'2022-03-29',scope:'Storefront',signal:'Product adoption',products:['Next.js'],summary:'Dated storefront story.',cautions:[]}],
  }]})).toMatchObject({boundStories:1});
  expect(JSON.stringify(await readEligibleContext(actor,customerId))).toContain(passage);
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'adoption-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
  const requestKey=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey});owned.push(conversation.id);
  const binding=await claimBinding(actor,conversation.id,requestKey);if(binding.state!=='claimed')throw Error('Binding unavailable');
  const native='wrun_'+randomUUID();await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  const attempt=await prepareAttempt(actor,conversation.id,native,randomUUID(),'Which frameworks does this customer use?');
  await claimDispatch(actor,conversation.id,attempt.attemptId,0);
  const principal={principalId:actor.principalId,attributes:{turasAttemptId:attempt.attemptId}};
  const ctx={session:{auth:{current:principal}}} as unknown as Parameters<typeof adoptionTool.execute>[1];
  const outsider=await isolatedChatActor(db,'partner','member',actor.workspaceId);
  const outsiderKey=randomUUID(),{conversation:denied}=await createOwnedConversation(outsider,{requestKey:outsiderKey});owned.push(denied.id);
  const deniedBinding=await claimBinding(outsider,denied.id,outsiderKey);if(deniedBinding.state!=='claimed')throw Error('Binding unavailable');
  const outsiderNative='wrun_'+randomUUID();await bindNativeSession(outsider,denied.id,deniedBinding.claimToken,outsiderNative);
  const deniedAttempt=await prepareAttempt(outsider,denied.id,outsiderNative,randomUUID(),'Which frameworks does this customer use?');
  await claimDispatch(outsider,denied.id,deniedAttempt.attemptId,0);
  const outsiderCtx={session:{auth:{current:{principalId:outsider.principalId,attributes:{turasAttemptId:deniedAttempt.attemptId}}}}} as unknown as Parameters<typeof adoptionTool.execute>[1];
  await expect(adoptionTool.execute({accountId:customerId,page:1},outsiderCtx)).rejects.toMatchObject({status:404});
  const result=await adoptionTool.execute({accountId:customerId,page:1},ctx);
  const expected={type:'attributed_research',citationId:revisionId,name:'Next.js',workload:'Storefront',publishedAt:'2022-03-29',url};
  expect(result).toMatchObject({contractVersion:'customer-adoption-v1',coverage:'partial',entries:[expected]});
  expect(JSON.stringify(result)).not.toContain('Vercel Blob');
  const ids=adoptionAccountsInTurn([{role:'user',content:'Which frameworks does this customer use?'},
   {role:'tool',content:[{type:'tool-result',toolName:'get_customer_adoption',output:{type:'json',value:result}}]}]);
  const turnId='turn_'+randomUUID();
  await projectNativeEvent(native,attempt.attemptId,{type:'message.received',data:{message:'Which frameworks does this customer use?',turnId},meta:{id:'evt_'+randomUUID(),at:new Date().toISOString()}});
  await db.query(`INSERT INTO general_context_injections(attempt_id,turn_id,snapshot_digest)
    SELECT attempt_id,$2,snapshot_digest FROM general_context_receipts WHERE attempt_id=$1`,[attempt.attemptId,turnId]);
  let providerPrompt:unknown;
  const provider={specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},
   async doGenerate(options:{prompt:unknown}){providerPrompt=options.prompt;return {};},
   async doStream(){throw Error('Unused fixture stream');},
  } as unknown as Parameters<typeof wrapOrdinaryChatModel>[0];
  await wrapOrdinaryChatModel(provider,principal,native,turnId).doGenerate({prompt:[
   {role:'user',content:[{type:'text',text:'Which frameworks does this customer use?'}]},
   {role:'tool',content:[{type:'tool-result',toolName:'get_customer_adoption',toolCallId:'fixture-adoption',output:{type:'json',value:JSON.parse(JSON.stringify(result))}}]},
  ]});
  expect(JSON.stringify(providerPrompt)).toContain('ordinary-current-knowledge-v1');
  expect(JSON.stringify(providerPrompt)).toContain('Next.js');
  expect(JSON.stringify(providerPrompt)).not.toContain('Vercel Blob');
  const ordinary=await withTransaction(client=>refreshOrdinaryKnowledge(client,actor,principal,conversation.id,attempt.attemptId));
  expect(JSON.stringify(ordinary)).toContain(passage);
  const conflict=randomUUID();
  await db.query(`INSERT INTO evidence_conflict_targets(id,environment_id,scope,workspace_id,customer_id,first_kind,first_revision_id,second_kind,second_revision_id,period_start,period_end,state,rationale)
    VALUES($1,$2,'customer',$3,$4,'verified_research',$5,'verified_research',$6,'2022-01-01','2022-12-31','confirmed','Synthetic adoption conflict')`,[conflict,identity.environmentId,identity.workspaceId,customerId,revisionId,randomUUID()]);
  expect(await adoptionTool.execute({accountId:customerId,page:1},ctx)).toMatchObject({entries:[],coverage:'partial'});
  expect((await withTransaction(client=>refreshOrdinaryKnowledge(client,actor,principal,conversation.id,attempt.attemptId,ids)))?.contexts).toMatchObject([{entries:[]}]);
  await db.query("UPDATE evidence_conflict_targets SET state='resolved' WHERE id=$1",[conflict]);
  const proposed=await submitProfileCommand(actor,customerId,{action:'propose_record',requestKey:randomUUID(),
    payload:{kind:'product_use',productKey:'fixture-evaluated-product',displayName:'Fixture evaluated product',state:'evaluating',usageDescription:'Synthetic review',observedAt:'2026-09-01T00:00:00Z'}}) as {revisionId:string};
  const draft=(await db.query(`SELECT v.content_digest,r.version FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1`,[proposed.revisionId])).rows[0];
  await submitProfileCommand(admin,customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:draft.content_digest,expectedRecordVersion:Number(draft.version),expectedAcceptedRevisionId:null,rationale:'Reviewed the synthetic evaluating state'});
  expect(await adoptionTool.execute({accountId:customerId,page:1},ctx)).toMatchObject({entries:[{citationId:proposed.revisionId,state:'evaluating'},expected]});
  await db.query(`INSERT INTO evidence_conflict_targets(id,environment_id,scope,workspace_id,customer_id,first_kind,first_revision_id,second_kind,second_revision_id,period_start,period_end,state,rationale)
    VALUES($1,$2,'customer',$3,$4,'accepted_profile',$5,'accepted_profile',$6,'2026-01-01','2026-12-31','confirmed','Synthetic reviewed adoption conflict')`,[randomUUID(),identity.environmentId,identity.workspaceId,customerId,proposed.revisionId,randomUUID()]);
  expect(await adoptionTool.execute({accountId:customerId,page:1},ctx)).toMatchObject({entries:[expected]});
  await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic withdrawal')",[randomUUID(),revisionId]);
  expect(await adoptionTool.execute({accountId:customerId,page:1},ctx)).toMatchObject({entries:[],coverage:'partial'});
 }finally{try{await settleSyntheticConversationAttempts(db,owned);}finally{await db.end();}}
});
