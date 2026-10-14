import {beforeEach,afterEach,it,expect} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {QualityBudgetLedger} from '../../../scripts/pilot-quality-budget-ledger';
import {budgetedQualityContextFetch} from '../../../scripts/pilot-quality-context';
let root:string,searchCalls:number,accountCalls:number,previousKey:string|undefined;
const endpoint='https://api.context.dev/v1/web/search',request={method:'POST',headers:{authorization:'Bearer synthetic-context-key'},body:JSON.stringify({query:'Synthetic public query',numResults:10,markdownOptions:{enabled:false},highlightsOptions:{enabled:false}})};
const result={request_id:'synthetic-search',query:'Synthetic public query',results:[],key_metadata:{credits_consumed:1,credits_remaining:9}};
beforeEach(async()=>{await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});root=await mkdtemp(resolve('local-artifacts/016/quality-context-test-'));searchCalls=accountCalls=0;previousKey=process.env.CONTEXT_API_KEY;process.env.CONTEXT_API_KEY='synthetic-context-key';});
afterEach(async()=>{if(previousKey===undefined)delete process.env.CONTEXT_API_KEY;else process.env.CONTEXT_API_KEY=previousKey;await rm(root,{recursive:true,force:true});});
async function ledger(contextCreditCap=4){return QualityBudgetLedger.create(join(root,randomUUID()),{contract:'pilot-quality-budget-v1',id:randomUUID(),capMicroUsd:25000000,contextCreditCap,authorizationDigest:'a'.repeat(64),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),modelId:'spacexai/grok-4.7',expiresAt:new Date(Date.now()+60000).toISOString()});}
function transport(options:{topup?:boolean;payload?:unknown}={}):typeof fetch{return async resource=>{
 const url=new URL(resource instanceof Request?resource.url:String(resource));
 if(url.pathname==='/v1/org/usage'){accountCalls++;return Response.json({credits_remaining:10,auto_topup:{enabled:options.topup??false},key_metadata:{credits_consumed:0},request_id:'synthetic-account-'+accountCalls});}
 searchCalls++;return Response.json(options.payload??result,{headers:{'x-credits-used':'1'}});
};}
it('settles exact existing credit usage without converting it to dollars',async()=>{
 const budget=await ledger(),receipts:unknown[]=[];
 const guarded=budgetedQualityContextFetch({ledger:budget,fetch:transport(),scope:async()=>{},evidence:async receipt=>{receipts.push(receipt);}});
 expect(await (await guarded(endpoint,request)).json()).toEqual(result);expect(searchCalls).toBe(1);expect(accountCalls).toBe(2);
 expect(await budget.status()).toMatchObject({chargedMicroUsd:0,contextCreditsConsumed:1,contextDispatches:1,unknown:0,admissionHeld:false});
 expect(receipts).toHaveLength(1);expect(receipts[0]).toMatchObject({creditsConsumed:1,dollarConversion:'not_performed',automaticBillingEnabled:false});
});
it('denies absent credit authority and enabled automatic billing before search dispatch',async()=>{
 for(const [cap,topup] of [[0,false],[4,true]] as const){const budget=await ledger(cap),guarded=budgetedQualityContextFetch({ledger:budget,fetch:transport({topup}),scope:async()=>{},evidence:async()=>{}});await expect(guarded(endpoint,request)).rejects.toThrow();expect(await budget.status()).toMatchObject({contextDispatches:0});}
 expect(searchCalls).toBe(0);
});
it('holds missing credit receipts and blocks every later provider',async()=>{
 const budget=await ledger(),guarded=budgetedQualityContextFetch({ledger:budget,fetch:transport({payload:{request_id:'synthetic-search'}}),scope:async()=>{},evidence:async()=>{}});
 await expect(guarded(endpoint,request)).rejects.toThrow();expect(searchCalls).toBe(1);expect(await budget.status()).toMatchObject({unknown:1,admissionHeld:true});
 await expect(budget.dispatch({modelId:'spacexai/grok-4.7',ceilingMicroUsd:16000000,pricingDigest:'d'.repeat(64)})).rejects.toThrow('holds admission');
});
it('rejects another credential changed pricing options and unapproved endpoints',async()=>{
 const guarded=budgetedQualityContextFetch({ledger:await ledger(),fetch:transport(),scope:async()=>{},evidence:async()=>{}});
 for(const [url,init] of [[endpoint,{...request,headers:{authorization:'Bearer another-key'}}],[endpoint,{...request,body:JSON.stringify({...JSON.parse(request.body),highlightsOptions:{enabled:true}})}],['https://api.context.dev/v1/web/answers',request]] as const)await expect(guarded(url,init)).rejects.toThrow();
 expect(searchCalls).toBe(0);expect(accountCalls).toBe(0);
});
it('checks the current synthetic source before reading account or dispatching research',async()=>{
 const guarded=budgetedQualityContextFetch({ledger:await ledger(),fetch:transport(),scope:async()=>{throw Error('Source changed');},evidence:async()=>{}});
 await expect(guarded(endpoint,request)).rejects.toThrow('Source changed');expect(searchCalls).toBe(0);expect(accountCalls).toBe(0);
});
