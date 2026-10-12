import {beforeEach,afterEach,it,expect} from 'vitest';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {QualityBudgetLedger} from '../../../scripts/pilot-quality-budget-ledger';
let root:string;
const call={modelId:'spacexai/grok-4.7' as const,ceilingMicroUsd:16000000,pricingDigest:'d'.repeat(64)};
const authorization=()=>({contract:'pilot-quality-budget-v1' as const,id:randomUUID(),capMicroUsd:25000000,authorizationDigest:'a'.repeat(64),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),modelId:'spacexai/grok-4.7' as const,expiresAt:new Date(Date.now()+60000).toISOString()});
beforeEach(async()=>{await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});root=await mkdtemp(resolve('local-artifacts/016/quality-budget-test-'));});
afterEach(()=>rm(root,{recursive:true,force:true}));
it('admits at most one concurrent provider dispatch across independent ledger clients',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'budget'),authorization());
 const results=await Promise.allSettled([ledger.dispatch(call),new QualityBudgetLedger(ledger.root).dispatch(call)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const id=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<string>).value;
 await ledger.settle(id,{chargedMicroUsd:1000,inputTokens:100,outputTokens:100,generationId:'synthetic-generation'});
 expect(await ledger.status()).toMatchObject({chargedMicroUsd:1000,dispatches:1,admissionHeld:false});
});
it('refuses insufficient budget before recording a dispatch',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'budget'),{...authorization(),capMicroUsd:15000000});
 await expect(ledger.dispatch(call)).rejects.toThrow('prevents dispatch');expect(await ledger.status()).toMatchObject({dispatches:0,chargedMicroUsd:0});
});
it('retains prior charges and credits across corrected source attempts and blocks unresolved retries',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'budget'),{...authorization(),contextCreditCap:4});
 const source={sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)};
 const first=await ledger.beginAttempt(source),dispatch=await ledger.dispatch(call,first);
 await expect(ledger.beginAttempt(source)).rejects.toThrow('Unresolved provider');
 await ledger.settle(dispatch,{chargedMicroUsd:10000000,inputTokens:1,outputTokens:1,generationId:'synthetic-original'});
 const credit=await ledger.reserveCredit('d'.repeat(64),first);await ledger.settleCredit(credit,1,'synthetic-search','e'.repeat(64));
 const second=await ledger.beginAttempt({...source,sourceDigest:'f'.repeat(64)});
 expect(second).not.toBe(first);expect(await ledger.currentSource()).toMatchObject({attemptId:second,sourceDigest:'f'.repeat(64)});
 expect(await ledger.status()).toMatchObject({chargedMicroUsd:10000000,contextCreditsConsumed:1,contextDispatches:1});
 await expect(ledger.dispatch(call,first)).rejects.toThrow('Prior quality attempt');
 await expect(ledger.reserveCredit('d'.repeat(64),first)).rejects.toThrow('Prior quality attempt');
 await expect(ledger.dispatch(call,second)).rejects.toThrow('prevents dispatch');
 const unknown=await ledger.reserveCredit('d'.repeat(64),second);await ledger.holdCredit(unknown);
 await expect(ledger.beginAttempt(source)).rejects.toThrow('Unresolved provider');
});
it('serializes credit and dollar admissions while retaining their separate units',async()=>{
 const budget=await QualityBudgetLedger.create(join(root,'budget'),{...authorization(),contextCreditCap:4});
 const id=await budget.reserveCredit('d'.repeat(64));await expect(budget.dispatch(call)).rejects.toThrow('holds admission');
 await budget.settleCredit(id,1,'synthetic-search','e'.repeat(64));
 expect(await budget.status()).toMatchObject({chargedMicroUsd:0,contextCreditsConsumed:1,contextDispatches:1,admissionHeld:false});
 await budget.dispatch(call);await expect(budget.reserveCredit('d'.repeat(64))).rejects.toThrow('holds admission');
});
it('holds every provider after an unknown or invalid credit charge',async()=>{
 const budget=await QualityBudgetLedger.create(join(root,'budget'),{...authorization(),contextCreditCap:4});
 const id=await budget.reserveCredit('d'.repeat(64));await expect(budget.settleCredit(id,2,'synthetic-search','e'.repeat(64))).rejects.toThrow('requires operator review');
 await expect(budget.dispatch(call)).rejects.toThrow('holds admission');await expect(budget.reserveCredit('d'.repeat(64))).rejects.toThrow('holds admission');
 expect(await budget.status()).toMatchObject({unknown:1,admissionHeld:true});
});
it('requires explicit credit authority and never reuses the four-call allowance',async()=>{
 const denied=await QualityBudgetLedger.create(join(root,'unapproved'),authorization());await expect(denied.reserveCredit('d'.repeat(64))).rejects.toThrow('Explicit research credit budget required');
 const budget=await QualityBudgetLedger.create(join(root,'budget'),{...authorization(),contextCreditCap:4});
 for(let i=0;i<4;i++){const id=await budget.reserveCredit('d'.repeat(64));await budget.settleCredit(id,0,'synthetic-search-'+i,'e'.repeat(64));}
 await expect(budget.reserveCredit('d'.repeat(64))).rejects.toThrow('Explicit research credit budget required');expect(await budget.status()).toMatchObject({contextCreditsConsumed:0,contextDispatches:4});
});
it('retains uncertain dispatch holds across clients without permitting retries',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'budget'),authorization()),id=await ledger.dispatch(call);
 await ledger.hold(id,'provider_error');await ledger.hold(id,'provider_error');
 await expect(new QualityBudgetLedger(ledger.root).dispatch(call)).rejects.toThrow('holds admission');
 expect(await ledger.status()).toMatchObject({unknown:1,admissionHeld:true});
});
it('holds overruns and invalid accounting instead of releasing their reservations',async()=>{
 for(const [name,cost,tokens] of [['overrun',16000001,1],['usage',1,500001]] as const){
  const ledger=await QualityBudgetLedger.create(join(root,name),authorization()),id=await ledger.dispatch(call);
  await expect(ledger.settle(id,{chargedMicroUsd:cost,inputTokens:tokens,outputTokens:1,generationId:'synthetic-'+name})).rejects.toThrow('operator review');
  expect(await ledger.status()).toMatchObject({unknown:1,admissionHeld:true});
 }
});
it('never steals an interrupted accounting lock or accepts a damaged journal',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'locked'),authorization());await mkdir(join(ledger.root,'lock'),{mode:0o700});
 await expect(ledger.status()).rejects.toThrow('lock unavailable');
 const damaged=await QualityBudgetLedger.create(join(root,'damaged'),authorization());await writeFile(join(damaged.root,'event-000001.json'),'partial',{mode:0o600});
 await expect(damaged.dispatch(call)).rejects.toThrow();
});
it('rejects reused provider generation identities before admitting further work',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'budget'),authorization()),first=await ledger.dispatch(call),charge={chargedMicroUsd:1000,inputTokens:1,outputTokens:1,generationId:'synthetic-same-generation'};
 await ledger.settle(first,charge);const second=await ledger.dispatch(call);
 await expect(ledger.settle(second,charge)).rejects.toThrow('operator review');
 expect(await ledger.status()).toMatchObject({chargedMicroUsd:1000,unknown:1,admissionHeld:true});
});
