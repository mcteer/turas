import {beforeAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {stopExpansionAdvice} from '../../lib/server/expansion/advice-controls';
import {prepareExpansionAdvice} from '../../lib/server/expansion/advisory';
import {saveExpansionProposal} from '../../lib/server/expansion/service';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {createProfileTestSession} from '../fixtures/profiles';
import {discoveryHypothesis} from '../fixtures/expansion';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import type {CurrentSession} from '../../lib/server/auth/sessions';

describe('Selected-only atomic expansion advice preparation',()=>{
 let actor:CurrentSession,partner:CurrentSession;
 beforeAll(async()=>{({actor,partner}=await withExpansionDatabase(async db=>({actor:await createProfileTestSession(db,'panel'),partner:await createProfileTestSession(db,'partner')})));});
 const request=(workloadId:string|null=null)=>({contractVersion:'expansion-v1',expectedVersion:0,requestKey:randomUUID(),workloadId,question:'Which customer need should we validate first?',selectedEngagementIds:[],sourceRefs:[],selectedHypothesisIds:[] as string[]});
 async function workload(){const id=randomUUID();await withExpansionDatabase(db=>db.query("INSERT INTO customer_workloads(id,workspace_id,customer_id,display_name) VALUES($1,$2,$3,'Synthetic advice scope')",[id,actor.workspaceId,DEMO_IDS.sharedCustomer]));return id;}
 it('creates a fresh private conversation without requiring an assigned account owner and replays the exact key',async()=>{
  const input=request(),prepared=await prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,input);
  expect(prepared.state).toBe('prepared');expect(await prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,input)).toEqual(prepared);
  await expect(prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,{...input,question:'A changed question'})).rejects.toMatchObject({code:'key_conflict'});
  const stored=await withExpansionDatabase(db=>db.query(`SELECT c.owner_principal_id,c.context_audience,a.context_bytes,a.dependency_count,p.payload
   FROM expansion_advice_attempts a JOIN conversations c ON c.id=a.conversation_id JOIN expansion_advice_payloads p ON p.attempt_id=a.id AND p.kind='context' WHERE a.id=$1`,[prepared.attemptId]));
  expect(stored.rows[0]).toMatchObject({owner_principal_id:actor.principalId,context_audience:'internal'});
  expect(stored.rows[0].context_bytes).toBeGreaterThan(0);expect(stored.rows[0].context_bytes).toBeLessThanOrEqual(24576);
  expect(stored.rows[0].payload.snapshot).toMatchObject({question:input.question,proposalTimezone:'UTC',assignment:{membershipId:null},hypotheses:[],evidence:[]});
  const messages=await withExpansionDatabase(db=>db.query('SELECT count(*) AS n FROM submitted_messages WHERE conversation_id=$1',[prepared.conversationId]));expect(Number(messages.rows[0].n)).toBe(0);
  await expect(prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,request())).rejects.toMatchObject({code:'advice_active'});
 });
 it('includes exactly the selected hypothesis and rejects wrong-scope selections without creating a conversation',async()=>{
  const scope=await workload(),other=await workload();
  const saved=await saveExpansionProposal(actor,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:scope,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]});
  const input={...request(scope),expectedVersion:saved.version,selectedHypothesisIds:[saved.recordId!]};
  const prepared=await prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,input);
  const payload=(await withExpansionDatabase(db=>db.query("SELECT payload FROM expansion_advice_payloads WHERE attempt_id=$1 AND kind='context'",[prepared.attemptId]))).rows[0].payload;
  expect(payload.snapshot.hypotheses).toHaveLength(1);expect(payload.snapshot.hypotheses[0]).toMatchObject({id:saved.recordId,disposition:'proposed',availability:'eligible',content:{title:discoveryHypothesis().title}});
  const before=Number((await withExpansionDatabase(db=>db.query('SELECT count(*) AS n FROM conversations'))).rows[0].n);
  await expect(prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,{...input,requestKey:randomUUID(),workloadId:other,expectedVersion:0})).rejects.toMatchObject({status:404});
  expect(Number((await withExpansionDatabase(db=>db.query('SELECT count(*) AS n FROM conversations'))).rows[0].n)).toBe(before);
 });
 it('rejects partner authority and injected conversation or attachment fields before admission',async()=>{
  await expect(prepareExpansionAdvice(partner,DEMO_IDS.sharedCustomer,request())).rejects.toMatchObject({status:404});
  for(const patch of [{attachments:[]},{conversationId:randomUUID()},{audience:'delivery'}])await expect(prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,{...request(),...patch})).rejects.toMatchObject({status:400});
 });
 it('rejects replay after selected working-head changes and refuses oversized context atomically',async()=>{
  const scope=await workload();
  const command={contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:scope,expectedVersion:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]};
  const saved=await saveExpansionProposal(actor,DEMO_IDS.sharedCustomer,command);
  const input={...request(scope),expectedVersion:saved.version,selectedHypothesisIds:[saved.recordId!]};await prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,input);
  await saveExpansionProposal(actor,DEMO_IDS.sharedCustomer,{...command,requestKey:randomUUID(),recordId:saved.recordId,expectedVersion:saved.version,content:{...command.content,title:'Explicit human working edit'}});
  await expect(prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,input)).rejects.toMatchObject({code:'expansion_context_changed'});
  const largeScope=await workload(),ids:string[]=[];
  for(let index=0;index<5;index++){
   const content={...discoveryHypothesis(),productKey:`synthetic-${index}`,problem:'P'.repeat(2000),customerBenefit:'B'.repeat(2000),proposedEngagement:'E'.repeat(2000)};
   ids.push((await saveExpansionProposal(actor,DEMO_IDS.sharedCustomer,{...command,requestKey:randomUUID(),workloadId:largeScope,expectedVersion:index,content})).recordId!);
  }
  const before=Number((await withExpansionDatabase(db=>db.query('SELECT count(*) AS n FROM conversations'))).rows[0].n);
  await expect(prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,{...request(largeScope),expectedVersion:5,selectedHypothesisIds:ids})).rejects.toMatchObject({code:'scope_too_large'});
  expect(Number((await withExpansionDatabase(db=>db.query('SELECT count(*) AS n FROM conversations'))).rows[0].n)).toBe(before);
 });
 it('admits five attempts per rolling hour across scopes and counts exact replay only once',async()=>{
  const owner=await withExpansionDatabase(db=>createProfileTestSession(db,'mcteer'));
  const scope=await workload();
  for(let index=0;index<5;index++){
   const input=request(scope),prepared=await prepareExpansionAdvice(owner,DEMO_IDS.sharedCustomer,input);
   expect(await prepareExpansionAdvice(owner,DEMO_IDS.sharedCustomer,input)).toEqual(prepared);
   await stopExpansionAdvice(owner,DEMO_IDS.sharedCustomer,prepared.attemptId,{});
  }
  await expect(prepareExpansionAdvice(owner,DEMO_IDS.sharedCustomer,request(await workload()))).rejects.toMatchObject({code:'advice_limit',status:429});
  const stored=await withExpansionDatabase(db=>db.query('SELECT count(*)::int AS n FROM expansion_advice_attempts WHERE owner_membership_id=$1',[owner.membershipId]));
  expect(stored.rows[0].n).toBe(5);
 });

});
