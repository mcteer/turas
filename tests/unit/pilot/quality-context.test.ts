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
async function ledger(contextCreditCap=4){return QualityBudgetLedger.create(join(root,randomUUID()),{contract:'pilot-quality-budget-v1',id:randomUUID(),capMicroUsd:25000000,contextCreditCap,authorizationDigest:'a'.repeat(64),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),modelId:'anthropic/claude-sonnet-5.5',expiresAt:new Date(Date.now()+60000).toISOString()});}
function transport(options:{topup?:boolean;payload?:unknown}={}):typeof fetch{return async(resource,init)=>{
 const forwarded=new Request(resource,init),url=new URL(forwarded.url);
 if(url.pathname==='/v1/org/usage'){accountCalls++;return Response.json({credits_remaining:10,auto_topup:{enabled:options.topup??false},key_metadata:{credits_consumed:0},request_id:'synthetic-account-'+accountCalls});}
 expect(forwarded.method).toBe('POST');expect(forwarded.headers.get('authorization')).toBe('Bearer synthetic-context-key');expect(await forwarded.json()).toEqual(JSON.parse(request.body));
 searchCalls++;return Response.json(options.payload??result,{headers:{'x-credits-used':'1'}});
};}
it('settles exact existing credit usage without converting it to dollars',async()=>{
 for(const [index,inputKind]of ['url','request','page-url','page-request'].entries()){
  const budget=await ledger(),receipts:unknown[]=[];
  const pagePayload={success:true,url:'https://vercel.com/docs/builds',markdown:'x'.repeat(70000),request_id:'synthetic-page',key_metadata:{credits_consumed:1,credits_remaining:9}};
  const page=inputKind.startsWith('page-'),pageEndpoint='https://api.context.dev/v1/web/scrape/markdown?'+new URLSearchParams({url:'https://vercel.com/docs/builds',useMainContentOnly:'true',includeHTML:'false',includeImages:'false',maxAgeMs:'0'});
  const pageTransport:typeof fetch=async(resource,init)=>{const actual=new Request(resource,init);if(new URL(actual.url).pathname==='/v1/org/usage')return transport()(resource,init);expect(actual.method).toBe('GET');expect(actual.url).toBe(pageEndpoint);expect(actual.headers.get('authorization')).toBe('Bearer synthetic-context-key');searchCalls++;return Response.json(pagePayload,{headers:{'x-credits-used':'1'}});};
  const guarded=budgetedQualityContextFetch({ledger:budget,fetch:page?pageTransport:transport(),scope:async()=>{},evidence:async receipt=>{receipts.push(receipt);}});
  const selected=page?pageEndpoint:endpoint,options=page?{headers:request.headers}:request;
  const response=inputKind.endsWith('request')?await guarded(new Request(selected,options)):await guarded(selected,options);
  expect(await response.json()).toEqual(page?pagePayload:result);expect(searchCalls).toBe(index+1);expect(accountCalls).toBe((index+1)*2);
  expect(await budget.status()).toMatchObject({chargedMicroUsd:0,contextCreditsConsumed:1,contextDispatches:1,unknown:0,admissionHeld:false});
  expect(receipts).toHaveLength(1);expect(receipts[0]).toMatchObject({creditsConsumed:1,dollarConversion:'not_performed',automaticBillingEnabled:false});
 }
});
it('denies absent credit authority and enabled automatic billing before search dispatch',async()=>{
 for(const [cap,topup] of [[0,false],[4,true]] as const){const budget=await ledger(cap),guarded=budgetedQualityContextFetch({ledger:budget,fetch:transport({topup}),scope:async()=>{},evidence:async()=>{}});await expect(guarded(endpoint,request)).rejects.toThrow();expect(await budget.status()).toMatchObject({contextDispatches:0});}
 expect(searchCalls).toBe(0);
});
it('holds missing credit receipts and blocks every later provider',async()=>{
 const budget=await ledger(),guarded=budgetedQualityContextFetch({ledger:budget,fetch:transport({payload:{request_id:'synthetic-search'}}),scope:async()=>{},evidence:async()=>{}});
 await expect(guarded(endpoint,request)).rejects.toThrow();expect(searchCalls).toBe(1);expect(await budget.status()).toMatchObject({unknown:1,admissionHeld:true});
 await expect(budget.dispatch({modelId:'anthropic/claude-sonnet-5.5',ceilingMicroUsd:16000000,pricingDigest:'d'.repeat(64)})).rejects.toThrow('holds admission');
});
it('rejects another credential changed pricing options and unapproved endpoints',async()=>{
 const guarded=budgetedQualityContextFetch({ledger:await ledger(),fetch:transport(),scope:async()=>{},evidence:async()=>{}});
 for(const [url,init] of [[endpoint,{...request,headers:{authorization:'Bearer another-key'}}],[endpoint,{...request,body:JSON.stringify({...JSON.parse(request.body),highlightsOptions:{enabled:true}})}],['https://api.context.dev/v1/web/answers',request]] as const)await expect(guarded(url,init)).rejects.toThrow();
 const page='https://api.context.dev/v1/web/scrape/markdown?'+new URLSearchParams({url:'https://vercel.com/docs/builds',useMainContentOnly:'true',includeHTML:'false',includeImages:'false',maxAgeMs:'0'});
 for(const url of [page+'&includeImages=true',page+'&actions=click',page.replace('https%3A%2F%2Fvercel.com','http%3A%2F%2Fvercel.com'),page.replace('maxAgeMs=0','maxAgeMs=1')])await expect(guarded(url,{headers:request.headers})).rejects.toThrow();
 for(const target of ['https://127.0.0.1/path','https://localhost/path','https://service.internal/path','https://vercel.com/docs?x=1','https://vercel.com/docs#part']){const url=new URL(page);url.searchParams.set('url',target);await expect(guarded(url,{headers:request.headers})).rejects.toThrow();}
 expect(searchCalls).toBe(0);expect(accountCalls).toBe(0);
});
it('checks the current synthetic source before reading account or dispatching research',async()=>{
 const guarded=budgetedQualityContextFetch({ledger:await ledger(),fetch:transport(),scope:async()=>{throw Error('Source changed');},evidence:async()=>{}});
 await expect(guarded(endpoint,request)).rejects.toThrow('Source changed');expect(searchCalls).toBe(0);expect(accountCalls).toBe(0);
});
