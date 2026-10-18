import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {z} from 'zod';
import {beforeAll,expect,it,vi} from 'vitest';
const provider=vi.hoisted(()=>({embed:vi.fn()}));
vi.mock('ai',async importOriginal=>({...await importOriginal<typeof import('ai')>(),embedMany:provider.embed}));
import {requireTestDatabaseUrl} from '../fixtures/database';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {searchCustomerJourneyRecords} from '../../lib/server/retrieval/search';
import {withTransaction} from '../../lib/server/db/client';
import {readCustomerAccountEvidence} from '../../lib/server/conversations/customer-accounts';
import {createOwnedConversation} from '../../lib/server/conversations/repository';
import {claimBinding,bindNativeSession} from '../../lib/server/conversations/binding';
import {prepareAttempt,claimDispatch} from '../../lib/server/conversations/dispatch';
import {authoredTool as journeyTool} from '../../agent/tools/get_customer_journey';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import type {CurrentSession} from '../../lib/server/auth/sessions';
const url=requireTestDatabaseUrl();
beforeAll(()=>{const runtime=new URL(url);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.toString();process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
it('ranks full approved journey records beyond 50, preserves long Unicode tails and paginates the actual named reader through byte bounds and provider failures',async()=>{
 const db=new Client({connectionString:url});await db.connect();const conversations:string[]=[];const priorKey=process.env.AI_GATEWAY_API_KEY;
 try{
  const author=await isolatedChatActor(db,'internal','member'),authors=[author],reviewers:CurrentSession[]=[];
  for(let i=0;i<3;i++)reviewers.push(await isolatedChatActor(db,'internal','admin',author.workspaceId));
  for(let i=0;i<2;i++)authors.push(await isolatedChatActor(db,'internal','member',author.workspaceId));
  const customerId=randomUUID();await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic long journey search',false)",[customerId,author.workspaceId]);
  const ids:string[]=[],records:Array<{recordId:string;revisionId:string}>=[];
  for(let index=0;index<60;index++){
   const summary=`Journeyprobe scoped operating observation ${index}.`;
   const context={title:`Journey observation ${index}`,summary,scope:'One synthetic governed workflow',kind:'note',stage:'Adopt',observedAt:'2026-09-30',reviewAfter:'2026-12-30',confidence:'medium',source:{kind:'note',reference:'Synthetic source reference',url:'',excerpt:index===59?'界'.repeat(3500)+' ultimatenebula':index<25?'A supplied user passage. '+('Bounded passage context. '.repeat(70)):'A supplied user passage.'},impact:null};
   const proposed=await submitProfileCommand(authors[Math.floor(index/20)],customerId,{action:'propose_record',requestKey:randomUUID(),requestedAudience:'internal',dataCategory:'other_internal',payload:{kind:'claim',text:summary,sourceType:'manual',legacyJourney:context}}) as {recordId:string;revisionId:string};
   const row=(await db.query('SELECT v.content_digest,r.version FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[proposed.revisionId])).rows[0];
   await submitProfileCommand(reviewers[Math.floor(index/20)],customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:row.content_digest,expectedRecordVersion:Number(row.version),expectedAcceptedRevisionId:null,rationale:'Human reviewed the exact isolated source observation.'});
   ids.push(proposed.revisionId);records.push(proposed);
  }
  process.env.AI_GATEWAY_API_KEY='';const signal=AbortSignal.timeout(45000),actor=reviewers[0];
  expect((await searchCustomerJourneyRecords(actor,customerId,'ultimatenebula',0,signal)).ids).toEqual([ids[59]]);
  const first=await searchCustomerJourneyRecords(actor,customerId,'journeyprobe',0,signal);
  expect(first).toMatchObject({retrieval:'keyword',memory:'not_configured',nextOffset:20,moreAvailable:true});expect(first.ids).toHaveLength(20);
  const second=await searchCustomerJourneyRecords(actor,customerId,'journeyprobe',20,signal),third=await searchCustomerJourneyRecords(actor,customerId,'journeyprobe',40,signal);
  expect(second).toMatchObject({nextOffset:40,moreAvailable:true});expect(third).toMatchObject({nextOffset:null,moreAvailable:false});
  expect([...first.ids,...second.ids,...third.ids].sort()).toEqual([...ids].sort());
  const key=randomUUID(),{conversation}=await createOwnedConversation(actor,{requestKey:key,title:'Synthetic journey read'});conversations.push(conversation.id);
  const binding=await claimBinding(actor,conversation.id,key);if(binding.state!=='claimed')throw Error('Owned binding unavailable');
  const native='wrun_'+randomUUID();await bindNativeSession(actor,conversation.id,binding.claimToken,native);
  await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'journey-search-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()",[process.env.TURAS_ENVIRONMENT_ID]);
  const attempt=await prepareAttempt(actor,conversation.id,native,randomUUID(),'Read the customer journey.');await claimDispatch(actor,conversation.id,attempt.attemptId,0);
  const principal={principalId:actor.principalId,attributes:{turasAttemptId:attempt.attemptId}},execute=journeyTool.execute;
  const ctx={session:{auth:{current:principal}},abortSignal:signal} as unknown as Parameters<typeof execute>[1];
  const toolResult=z.object({records:z.array(z.object({id:z.string()})),nextOffset:z.number().nullable(),retrieval:z.string(),reason:z.string()});
  const seen:string[]=[];let offset=0,packedEarly=false;
  for(let page=0;page<15;page++){
   const result=toolResult.parse(await execute({accountId:customerId,query:'journeyprobe',page:1,offset},ctx));
   seen.push(...result.records.map(record=>String(record.id)));
   if(result.records.length<20&&result.nextOffset!==null)packedEarly=true;
   if(result.nextOffset===null)break;
   expect(result.nextOffset).toBeGreaterThan(offset);offset=result.nextOffset;
  }
  expect(packedEarly).toBe(true);expect(seen).toHaveLength(60);expect(new Set(seen).size).toBe(60);expect([...seen].sort()).toEqual([...ids].sort());
  const fallback=toolResult.parse(await execute({accountId:customerId,query:'absentwordzzzz',page:1,offset:0},ctx));expect(fallback.retrieval).toBe('recent_fallback');expect(fallback.records.length).toBeGreaterThan(0);expect(fallback.reason).toContain('not proven matches');
  process.env.AI_GATEWAY_API_KEY='synthetic-provider-boundary-never-sent';provider.embed.mockRejectedValue(new Error('Controlled provider failure'));
  const failed=await searchCustomerJourneyRecords(actor,customerId,'ultimatenebula',0,signal);expect(failed).toMatchObject({ids:[ids[59]],retrieval:'keyword',memory:'unavailable'});expect(provider.embed).toHaveBeenCalledTimes(1);
  expect((await db.query("SELECT state FROM retrieval_embedding_operations WHERE state='unconfirmed' AND operation_kind='query' ORDER BY created_at DESC LIMIT 1")).rowCount).toBe(1);
  // Withdrawal while the provider boundary is awaiting I/O must be rechecked by actual SQL ranking.
  provider.embed.mockImplementationOnce(async()=>{
   await submitProfileCommand(reviewers[2],customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:ids[59],expectedRecordVersion:1,rationale:'Human withdraws the exact source during provider I/O.'});throw Error('Controlled failure after withdrawal');
  });
  expect((await searchCustomerJourneyRecords(actor,customerId,'ultimatenebula',0,signal)).ids).toEqual([]);
  const release=await withTransaction(client=>readCustomerAccountEvidence(client,principal,customerId,{journeyOnly:true,offset:0,citationIds:[ids[59]]}));expect(release.entries).toEqual([]);
  const calls=provider.embed.mock.calls.length;const cancelled=new AbortController();cancelled.abort(new Error('Synthetic cancellation'));
  await expect(searchCustomerJourneyRecords(actor,customerId,'journeyprobe',0,cancelled.signal)).rejects.toThrow('Synthetic cancellation');expect(provider.embed).toHaveBeenCalledTimes(calls);
  const interrupted=new AbortController();provider.embed.mockImplementationOnce(async()=>{interrupted.abort(new Error('Cancelled at provider boundary'));throw Error('Controlled provider failure');});
  await expect(searchCustomerJourneyRecords(actor,customerId,'journeyprobe',0,interrupted.signal)).rejects.toThrow('Cancelled at provider boundary');
  await expect(searchCustomerJourneyRecords({...actor,workspaceId:randomUUID()},customerId,'journeyprobe',0,signal)).rejects.toMatchObject({status:401});
 }finally{process.env.AI_GATEWAY_API_KEY=priorKey;provider.embed.mockReset();await settleSyntheticConversationAttempts(db,conversations);await db.end();}
},60000);
