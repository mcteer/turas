import {randomUUID,createHash} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
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
