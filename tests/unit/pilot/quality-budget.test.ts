import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,rm,mkdir,writeFile,readFile,readdir,cp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {QualityBudgetLedger,qualityContinuationSchema} from '../../../scripts/pilot-quality-budget-ledger';
import {qualityOperatorAuthorization} from '../../../scripts/pilot-quality-step-authorization';
import {qualityChildEnvironment} from '../../../scripts/pilot-quality-runtime';
import {writeEvidence,evidenceDigest,readEvidence} from '../../../scripts/pilot-evidence';
let root:string;
const call={modelId:'spacexai/grok-4.7' as const,ceilingMicroUsd:16000000,pricingDigest:'d'.repeat(64)};
const authorization=()=>({contract:'pilot-quality-budget-v1' as const,id:randomUUID(),capMicroUsd:25000000,authorizationDigest:'a'.repeat(64),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),modelId:'spacexai/grok-4.7' as const,expiresAt:new Date(Date.now()+60000).toISOString()});
beforeEach(async()=>{await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});root=await mkdtemp(resolve('local-artifacts/016/quality-budget-test-'));});
afterEach(()=>{vi.useRealTimers();return rm(root,{recursive:true,force:true});});
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
 await expect(ledger.dispatchWhenAvailable(call,first,new AbortController().signal)).rejects.toThrow('Prior quality attempt');
 await expect(ledger.reserveCredit('d'.repeat(64),first)).rejects.toThrow('Prior quality attempt');
 await expect(ledger.dispatch(call,second)).rejects.toThrow('prevents dispatch');
 const unknown=await ledger.reserveCredit('d'.repeat(64),second);await ledger.holdCredit(unknown);
 await expect(ledger.beginAttempt(source)).rejects.toThrow('Unresolved provider');
});
it('serializes credit and dollar admissions while retaining their separate units',async()=>{
 const budget=await QualityBudgetLedger.create(join(root,'budget'),{...authorization(),contextCreditCap:4});
 const id=await budget.reserveCredit('d'.repeat(64));await expect(budget.dispatch(call)).rejects.toThrow('holds admission');
 await expect(budget.dispatchWhenAvailable(call,undefined,new AbortController().signal)).rejects.toThrow('holds admission');
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
 const operator={contract:'pilot-quality-operator-v1',id:randomUUID(),feature:'016',category:'model-evaluation',modelId:'spacexai/grok-4.7',capMicroUsd:25000000,automaticBillingAllowed:false,independentReviewAuthorized:true,userInstructionReference:'Synthetic bounded credit approval',recordedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
 for(const cap of [0,3,4,7,47])expect(qualityOperatorAuthorization.parse({...operator,contextCreditCap:cap}).contextCreditCap).toBe(cap);
 for(const cap of [-1,1.5,48])expect(qualityOperatorAuthorization.safeParse({...operator,contextCreditCap:cap}).success).toBe(false);
 expect(qualityOperatorAuthorization.safeParse({...operator,contextCreditCap:7,automaticBillingAllowed:true}).success).toBe(false);
 await expect(QualityBudgetLedger.create(join(root,'over-credit-cap'),{...authorization(),contextCreditCap:48})).rejects.toThrow();
 const denied=await QualityBudgetLedger.create(join(root,'unapproved'),authorization());await expect(denied.reserveCredit('d'.repeat(64))).rejects.toThrow('Explicit research credit budget required');
 for(const contextCreditCap of [3,4,7,47]){
  const budget=await QualityBudgetLedger.create(join(root,'budget-'+contextCreditCap),{...authorization(),contextCreditCap});
  for(let i=0;i<contextCreditCap-1;i++){const id=await budget.reserveCredit('d'.repeat(64));await budget.settleCredit(id,0,'synthetic-search-'+i,'e'.repeat(64));}
  const contenders=await Promise.allSettled([budget.reserveCredit('d'.repeat(64)),new QualityBudgetLedger(budget.root).reserveCredit('d'.repeat(64))]);
  expect(contenders.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  const last=contenders.find(result=>result.status==='fulfilled') as PromiseFulfilledResult<string>;await budget.settleCredit(last.value,0,'synthetic-search-last','e'.repeat(64));
  await expect(budget.reserveCredit('d'.repeat(64))).rejects.toThrow('Explicit research credit budget required');expect(await budget.status()).toMatchObject({contextCreditsConsumed:0,contextDispatches:contextCreditCap});
 }
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
 const abort=new AbortController(),waiting=Promise.allSettled([ledger.dispatchWhenAvailable(call,undefined,abort.signal)]);
 await new Promise(resolve=>setTimeout(resolve,10));abort.abort();
 const cancelled=(await waiting)[0];expect(cancelled.status).toBe('rejected');if(cancelled.status==='rejected')expect(cancelled.reason.name).toBe('AbortError');
 expect((await readdir(ledger.root)).sort()).toEqual(['authorization.json','lock']);
 const damaged=await QualityBudgetLedger.create(join(root,'damaged'),authorization());await writeFile(join(damaged.root,'event-000001.json'),'partial',{mode:0o600});
 await expect(damaged.dispatch(call)).rejects.toThrow();
});
it('rejects reused provider generation identities before admitting further work',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'budget'),authorization()),first=await ledger.dispatch(call),charge={chargedMicroUsd:1000,inputTokens:1,outputTokens:1,generationId:'synthetic-same-generation'};
 await ledger.settle(first,charge);const second=await ledger.dispatch(call);
 await expect(ledger.settle(second,charge)).rejects.toThrow('operator review');
 expect(await ledger.status()).toMatchObject({chargedMicroUsd:1000,unknown:1,admissionHeld:true});
});

const continuedSource={sourceCommit:'1'.repeat(40),sourceDigest:'2'.repeat(64),catalogDigest:'3'.repeat(64)};
async function continuation(ledger:QualityBudgetLedger){
 const authority=await ledger.currentAuthority();
 return qualityContinuationSchema.parse({contract:'pilot-quality-continuation-v1',id:randomUUID(),budgetId:authority.id,ledgerRoot:ledger.root,originalAuthorizationDigest:authority.originalAuthorizationDigest,previousAuthorityDigest:authority.authorizationDigest,journalHeadDigest:authority.journalHeadDigest,...continuedSource,userInstructionReference:'Synthetic explicit continuation approval, no provider use',recordedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});
}
function expire(){vi.useFakeTimers();vi.setSystemTime(Date.now()+120000);}

it('continues the exact expired journal without replacing original charges credits or authorization',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'budget'),{...authorization(),contextCreditCap:4}),id=await ledger.dispatch(call);
 await ledger.settle(id,{chargedMicroUsd:10000000,inputTokens:1,outputTokens:1,generationId:'synthetic-prior-charge'});
 const credit=await ledger.reserveCredit('d'.repeat(64));await ledger.settleCredit(credit,1,'synthetic-prior-credit','e'.repeat(64));
 const originals=new Map(await Promise.all((await readdir(ledger.root)).map(async name=>[name,await readFile(join(ledger.root,name),'utf8')] as const)));
 expire();expect((await ledger.status()).admissionHeld).toBe(true);
 await expect(ledger.dispatchWhenAvailable(call,undefined,new AbortController().signal)).rejects.toThrow('holds admission');
 const approved=await continuation(ledger),receipt=await ledger.continueAuthorization(approved);
 expect(receipt).toMatchObject({originalAuthorizationUnchanged:true,capMicroUsd:25000000,chargedMicroUsd:10000000,contextDispatches:1});
 for(const [name,bytes] of originals)expect(await readFile(join(ledger.root,name),'utf8')).toBe(bytes);
 const restored=new QualityBudgetLedger(ledger.root);
 await expect(restored.dispatch(call)).rejects.toThrow('Prior quality attempt');
 await expect(restored.beginAttempt({...continuedSource,sourceDigest:'f'.repeat(64)})).rejects.toThrow('Continuation source');
 const attempt=await restored.beginAttempt(continuedSource);
 await expect(restored.dispatch(call,attempt)).rejects.toThrow('prevents dispatch');
 expect(await restored.status()).toMatchObject({chargedMicroUsd:10000000,dispatches:1,contextCreditsConsumed:1,contextDispatches:1,capMicroUsd:25000000,admissionHeld:false});
});

it('rejects mismatched stale overlong or cap-expanding continuation records without appending them',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'budget'),authorization());expire();const approved=await continuation(ledger),head=(await ledger.currentAuthority()).journalHeadDigest;
 for(const change of [{budgetId:randomUUID()},{ledgerRoot:join(root,'other')},{originalAuthorizationDigest:'f'.repeat(64)},{previousAuthorityDigest:'f'.repeat(64)},{journalHeadDigest:'f'.repeat(64)},{recordedAt:new Date(Date.now()+1000).toISOString()},{expiresAt:new Date(Date.now()-1000).toISOString()},{expiresAt:new Date(Date.now()+86400001).toISOString()},{capMicroUsd:50000000},{contextCreditCap:5}]){
  await expect(ledger.continueAuthorization({...approved,...change})).rejects.toThrow();
  expect((await ledger.currentAuthority()).journalHeadDigest).toBe(head);
 }
 await ledger.continueAuthorization(approved);
 await expect(ledger.continueAuthorization(approved)).rejects.toThrow('Exact unencumbered');
 const copied=join(root,'copied');await cp(ledger.root,copied,{recursive:true});
 await expect(new QualityBudgetLedger(copied).currentAuthority()).rejects.toThrow('Exact unencumbered');
});

it('keeps pending and unknown dollar or credit holds closed under a fresh continuation proposal',async()=>{
 for(const kind of ['dollar-pending','dollar-unknown','credit-pending','credit-unknown']){
  const ledger=await QualityBudgetLedger.create(join(root,kind),{...authorization(),contextCreditCap:4});
  if(kind.startsWith('dollar')){const id=await ledger.dispatch(call);if(kind.endsWith('unknown'))await ledger.hold(id,'provider_error');}
  else{const id=await ledger.reserveCredit('d'.repeat(64));if(kind.endsWith('unknown'))await ledger.holdCredit(id);}
  expire();const head=(await ledger.currentAuthority()).journalHeadDigest;
  await expect(ledger.continueAuthorization(await continuation(ledger))).rejects.toThrow('Exact unencumbered');
  expect((await ledger.currentAuthority()).journalHeadDigest).toBe(head);expect((await ledger.status()).admissionHeld).toBe(true);vi.useRealTimers();
 }
});

it('invalidates old attempts and runtimes when a separately approved continuation becomes current',async()=>{
 const ledger=await QualityBudgetLedger.create(join(root,'budget'),{...authorization(),contextCreditCap:7}),oldAttempt=await ledger.beginAttempt(continuedSource),original=await ledger.currentAuthority();
 const runtimeFile=join(root,'runtime.json'),previous=process.env.TURAS_016_QUALITY_RUNTIME_FILE;
 try{
  const runtime={contract:'pilot-quality-runtime-v1',id:original.id,attemptId:oldAttempt,sourceRoot:process.cwd(),ledgerRoot:ledger.root,...continuedSource,authorizationDigest:original.authorizationDigest,capMicroUsd:original.capMicroUsd,contextCreditCap:7,expiresAt:original.expiresAt};
  await writeEvidence(root,'runtime.json',runtime);process.env.TURAS_016_QUALITY_RUNTIME_FILE=runtimeFile;
  expect((await qualityChildEnvironment()).TURAS_ALLOW_LIVE_MODEL_TESTS).toBe('1');
  for(const contextCreditCap of [4,8]){await writeEvidence(root,`mismatched-runtime-${contextCreditCap}.json`,{...runtime,contextCreditCap});process.env.TURAS_016_QUALITY_RUNTIME_FILE=join(root,`mismatched-runtime-${contextCreditCap}.json`);await expect(qualityChildEnvironment()).rejects.toThrow();}
  process.env.TURAS_016_QUALITY_RUNTIME_FILE=runtimeFile;
  expire();await ledger.continueAuthorization(await continuation(ledger));
  await expect(ledger.dispatch(call,oldAttempt)).rejects.toThrow('Prior quality attempt');
  await expect(ledger.reserveCredit('d'.repeat(64),oldAttempt)).rejects.toThrow('Prior quality attempt');
  await expect(qualityChildEnvironment()).rejects.toThrow('runtime scope');
  const attemptId=await ledger.beginAttempt(continuedSource),current=await ledger.currentAuthority();
  await writeEvidence(root,'current-runtime.json',{...runtime,attemptId,authorizationDigest:current.authorizationDigest,expiresAt:current.expiresAt});process.env.TURAS_016_QUALITY_RUNTIME_FILE=join(root,'current-runtime.json');
  expect((await qualityChildEnvironment()).TURAS_ALLOW_LIVE_MODEL_TESTS).toBe('1');
  const dispatch=await ledger.dispatch({...call,ceilingMicroUsd:1000},attemptId);await ledger.settle(dispatch,{chargedMicroUsd:1,inputTokens:1,outputTokens:1,generationId:'synthetic-continued-generation'});
  expect(await ledger.status()).toMatchObject({dispatches:1,chargedMicroUsd:1,unknown:0});
  vi.setSystemTime(Date.now()+3600001);
  await expect(ledger.dispatch(call,attemptId)).rejects.toThrow('holds admission');
  await expect(ledger.beginAttempt(continuedSource)).rejects.toThrow('Unresolved provider');
  await expect(qualityChildEnvironment()).rejects.toThrow('runtime scope');
 }finally{if(previous===undefined)delete process.env.TURAS_016_QUALITY_RUNTIME_FILE;else process.env.TURAS_016_QUALITY_RUNTIME_FILE=previous;}
});

const roots:string[]=[];afterEach(async()=>{for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
const source={sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)},next={...source,sourceCommit:'d'.repeat(40),sourceDigest:'e'.repeat(64)};
async function setup(){await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/resumption-test-'));roots.push(root);const ledger=await QualityBudgetLedger.create(join(root,'ledger'),{contract:'pilot-quality-budget-v1',id:randomUUID(),capMicroUsd:25000000,contextCreditCap:4,authorizationDigest:'a'.repeat(64),sourceDigest:source.sourceDigest,catalogDigest:source.catalogDigest,modelId:call.modelId,expiresAt:new Date(Date.now()+60000).toISOString()}),attempt=await ledger.beginAttempt(source),id=await ledger.dispatch(call,attempt);await ledger.hold(id,'provider_error');const authority=await ledger.currentAuthority(),events=await Promise.all((await readdir(ledger.root)).filter(n=>n.startsWith('event-')).sort().map(n=>readEvidence(ledger.root,n))),dispatch=events.find((e:any)=>e.kind==='dispatch'),unknown=events.find((e:any)=>e.kind==='unknown'),approval={contract:'pilot-quality-reviewed-resumption-v1',id:randomUUID(),budgetId:authority.id,ledgerRoot:ledger.root,originalAuthorizationDigest:authority.originalAuthorizationDigest,previousAuthorityDigest:authority.authorizationDigest,journalHeadDigest:authority.journalHeadDigest,...next,unknownDispatches:[{id,dispatchDigest:evidenceDigest(JSON.stringify(dispatch)),unknownDigest:evidenceDigest(JSON.stringify(unknown)),permanentHoldMicroUsd:16000000}],additionalAllowanceMicroUsd:12000000,taskAdmissionDigest:'1'.repeat(64),independentReviewDigest:'2'.repeat(64),userInstructionReference:'Synthetic explicit independent operator review, finite additive allowance',recordedAt:new Date().toISOString(),uncertainRequestsMayRetry:false,unknownChargeSettled:false,automaticTopUp:false};return{ledger,id,attempt,approval};}
it('preserves original bytes and full unknown exposure while admitting only reviewed new-source work',async()=>{const{ledger,id,attempt,approval}=await setup();const before=await Promise.all((await readdir(ledger.root)).filter(n=>n.startsWith('event-')).sort().map(async n=>[n,await readFile(join(ledger.root,n),'utf8')]as const));await ledger.reviewResumption(approval);for(const[n,bytes]of before)expect(await readFile(join(ledger.root,n),'utf8')).toBe(bytes);const replay=new QualityBudgetLedger(ledger.root);expect(await replay.currentAuthority()).toMatchObject({originalCapMicroUsd:25000000,capMicroUsd:37000000,additionalAllowanceMicroUsd:12000000});expect(await replay.status()).toMatchObject({unknown:1,heldMicroUsd:16000000,permanentHeldMicroUsd:16000000,admissionHeld:false});await expect(replay.dispatch(call,attempt)).rejects.toThrow('Prior quality');await expect(replay.beginAttempt(source)).rejects.toThrow('source differs');const fresh=await replay.beginAttempt(next),dispatch=await replay.dispatch(call,fresh);await expect(replay.settle(id,{chargedMicroUsd:0,inputTokens:0,outputTokens:0,generationId:'fake'})).rejects.toThrow('cannot settle');expect(await replay.status()).toMatchObject({heldMicroUsd:32000000,admissionHeld:true});await replay.settle(dispatch,{chargedMicroUsd:7000000,inputTokens:1,outputTokens:1,generationId:'synthetic-new'});expect(await replay.status()).toMatchObject({chargedMicroUsd:7000000,unknown:1,heldMicroUsd:16000000});await expect(replay.dispatch(call,fresh)).rejects.toThrow('prevents dispatch');
 // An already continued, clean journal needs a new reviewed source without a
 // fabricated unknown dispatch, added money, or a new expiry.
 const clean=await QualityBudgetLedger.create(join(root,'clean-source-review'),{...authorization(),contextCreditCap:4});
 const charged=await clean.dispatch(call);await clean.settle(charged,{chargedMicroUsd:1000,inputTokens:1,outputTokens:1,generationId:'synthetic-clean-prior'});
 const credit=await clean.reserveCredit('4'.repeat(64));await clean.settleCredit(credit,1,'synthetic-clean-credit','5'.repeat(64));
 expire();await clean.continueAuthorization(await continuation(clean));
 const cleanAuthority=await clean.currentAuthority(),cleanStatus=await clean.status();
 const cleanBytes=new Map(await Promise.all((await readdir(clean.root)).map(async name=>[name,await readFile(join(clean.root,name),'utf8')]as const)));
 const sourceOnly={...approval,id:randomUUID(),budgetId:cleanAuthority.id,ledgerRoot:clean.root,
  originalAuthorizationDigest:cleanAuthority.originalAuthorizationDigest,previousAuthorityDigest:cleanAuthority.authorizationDigest,
  journalHeadDigest:cleanAuthority.journalHeadDigest,unknownDispatches:[],additionalAllowanceMicroUsd:0,recordedAt:new Date().toISOString()};
 for(const change of[{additionalAllowanceMicroUsd:1},{journalHeadDigest:'0'.repeat(64)},{previousAuthorityDigest:'0'.repeat(64)}]){
  await expect(clean.reviewResumption({...sourceOnly,...change})).rejects.toThrow();
  expect((await clean.currentAuthority()).journalHeadDigest).toBe(cleanAuthority.journalHeadDigest);
 }
 const reviewTime=Date.now();vi.setSystemTime(Date.parse(cleanAuthority.expiresAt)+1);
 await expect(clean.reviewResumption(sourceOnly)).rejects.toThrow('Exact reviewed');
 vi.setSystemTime(reviewTime);
 await clean.reviewResumption(sourceOnly);
 for(const[name,bytes]of cleanBytes)expect(await readFile(join(clean.root,name),'utf8')).toBe(bytes);
 const restored=new QualityBudgetLedger(clean.root),adopted=await restored.currentAuthority();
 expect(adopted).toMatchObject({id:cleanAuthority.id,originalAuthorizationDigest:cleanAuthority.originalAuthorizationDigest,
  capMicroUsd:25000000,originalCapMicroUsd:25000000,additionalAllowanceMicroUsd:0,expiresAt:cleanAuthority.expiresAt});
 expect(await restored.status()).toEqual(cleanStatus);
 expect((await readdir(clean.root)).length).toBe(cleanBytes.size+1);
 await expect(restored.beginAttempt(continuedSource)).rejects.toThrow('source differs');
 const cleanAttempt=await restored.beginAttempt(next),pending=await restored.dispatch(call,cleanAttempt),pendingAuthority=await restored.currentAuthority();
 await expect(restored.reviewResumption({...sourceOnly,id:randomUUID(),previousAuthorityDigest:pendingAuthority.authorizationDigest,
  journalHeadDigest:pendingAuthority.journalHeadDigest})).rejects.toThrow('Exact reviewed');
 await restored.settle(pending,{chargedMicroUsd:1,inputTokens:1,outputTokens:1,generationId:'synthetic-reviewed-clean'});
});
it('rejects stale authority, incomplete unknown sets, reduced holds and active unrelated calls',async()=>{for(const change of[{journalHeadDigest:'0'.repeat(64)},{unknownDispatches:[]},{unknownDispatches:[],additionalAllowanceMicroUsd:0},{unknownDispatches:[{id:randomUUID(),dispatchDigest:'0'.repeat(64),unknownDigest:'0'.repeat(64),permanentHoldMicroUsd:1}]},{previousAuthorityDigest:'0'.repeat(64)},{uncertainRequestsMayRetry:true}]){const{ledger,approval}=await setup();await expect(ledger.reviewResumption({...approval,...change})).rejects.toThrow();expect(await ledger.status()).toMatchObject({admissionHeld:true,capMicroUsd:25000000});}});
it('a higher genuine exposure blocks admission again without reducing the permanent reservation',async()=>{const{ledger,id,approval}=await setup();await ledger.reviewResumption(approval);await ledger.recordUnknownExposure(id,18000000,'3'.repeat(64));expect(await new QualityBudgetLedger(ledger.root).status()).toMatchObject({unknown:1,heldMicroUsd:18000000,permanentHeldMicroUsd:16000000,admissionHeld:true});await expect(ledger.beginAttempt(next)).rejects.toThrow('Unresolved provider');await expect(ledger.recordUnknownExposure(id,1,'3'.repeat(64))).rejects.toThrow('cannot decrease');});
