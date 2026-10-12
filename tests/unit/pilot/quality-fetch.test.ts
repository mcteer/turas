import {beforeEach,afterEach,it,expect} from 'vitest';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {QualityBudgetLedger} from '../../../scripts/pilot-quality-budget-ledger';
import {budgetedGatewayFetch} from '../../../scripts/pilot-quality-fetch';
import {createGateway,generateText} from 'ai';
let root:string,calls:number;
const model='spacexai/grok-4.7' as const,endpoint='https://ai-gateway.vercel.sh/v4/ai/language-model',request={method:'POST',headers:{'ai-language-model-id':model,'content-type':'application/json'},body:JSON.stringify({prompt:[]})};
const metadata={providerMetadata:{gateway:{cost:'0.001',generationId:'synthetic-generation'}},usage:{inputTokens:{total:10},outputTokens:{total:10}}};
const ceiling=async()=>({modelId:model,ceilingMicroUsd:16000000,pricingDigest:'d'.repeat(64)});
async function ledger(capMicroUsd=25000000){return QualityBudgetLedger.create(join(root,randomUUID()),{contract:'pilot-quality-budget-v1',id:randomUUID(),capMicroUsd,authorizationDigest:'a'.repeat(64),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64),modelId:model,expiresAt:new Date(Date.now()+60000).toISOString()});}
beforeEach(async()=>{await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});root=await mkdtemp(resolve('local-artifacts/016/quality-fetch-test-'));calls=0;});
afterEach(()=>rm(root,{recursive:true,force:true}));
it('settles known Gateway charges while preserving the provider response',async()=>{
 const budget=await ledger(),guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>{calls++;return Response.json(metadata);}});
 expect(await (await guard(endpoint,request)).json()).toEqual(metadata);expect(calls).toBe(1);expect(await budget.status()).toMatchObject({chargedMicroUsd:1000,admissionHeld:false});
});
it('denies a paid request below its full published bound without calling the provider',async()=>{
 const guard=budgetedGatewayFetch({ledger:await ledger(15000000),ceiling,fetch:async()=>{calls++;return Response.json(metadata);}});
 await expect(guard(endpoint,request)).rejects.toThrow('prevents dispatch');expect(calls).toBe(0);
});
it('blocks subsequent SDK retries when the first charge is unavailable',async()=>{
 const budget=await ledger(),guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>{calls++;return Response.json({usage:metadata.usage});}});
 await expect(guard(endpoint,request)).rejects.toThrow('charge unavailable');await expect(guard(endpoint,request)).rejects.toThrow('holds admission');expect(calls).toBe(1);expect(await budget.status()).toMatchObject({admissionHeld:true});
});
it('accounts split streamed frames only after complete final usage is received',async()=>{
 const budget=await ledger(),bytes=Buffer.from('data: '+JSON.stringify({type:'finish',...metadata})+'\n\n');
 const guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,13));c.enqueue(bytes.subarray(13));c.close();}}),{headers:{'content-type':'text/event-stream'}});}});
 expect(await (await guard(endpoint,request)).text()).toBe(bytes.toString());expect(await budget.status()).toMatchObject({chargedMicroUsd:1000,admissionHeld:false});
});
it('holds cancellation of an incomplete response and denies another dispatch',async()=>{
 const budget=await ledger(),guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('data: {"type":"text-delta","delta":"Synthetic"}\n\n'));}}),{headers:{'content-type':'text/event-stream'}});}});
 const response=await guard(endpoint,request);await response.body!.cancel();await expect(guard(endpoint,request)).rejects.toThrow('holds admission');expect(calls).toBe(1);expect(await budget.status()).toMatchObject({admissionHeld:true});
});
it('rejects unapproved models endpoints and provider tools before dispatch',async()=>{
 const guard=budgetedGatewayFetch({ledger:await ledger(),ceiling,fetch:async()=>{calls++;return Response.json(metadata);}});
 for(const [url,init] of [[endpoint,{...request,headers:{...request.headers,'ai-model-id':'conflicting-model'}}],[endpoint,{...request,headers:{'ai-language-model-id':'unapproved-model'}}],['https://ai-gateway.vercel.sh/v4/ai/image-model',request],[endpoint,{...request,body:JSON.stringify({tools:[{type:'provider-defined'}]})}]] as const)await expect(guard(url,init)).rejects.toThrow();
 expect(calls).toBe(0);
});
it('does not claim a provider dispatch for an already aborted request',async()=>{
 const budget=await ledger(),abort=new AbortController();abort.abort();const guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>{calls++;return Response.json(metadata);}});
 await expect(guard(endpoint,{...request,signal:abort.signal})).rejects.toThrow();expect(calls).toBe(0);expect(await budget.status()).toMatchObject({dispatches:0,admissionHeld:false});
});
it('enforces admission on the installed SDK request without contacting the provider',async()=>{
 const budget=await ledger(1);let denials=0;
 const guard=budgetedGatewayFetch({ledger:budget,ceiling,denied:async()=>{denials++;},fetch:async()=>{calls++;throw Error('Unexpected provider call');}});
 await expect(generateText({model:createGateway({apiKey:'synthetic-no-provider-credential',fetch:guard})(model),prompt:'Synthetic denial',maxRetries:0})).rejects.toThrow();
 expect(denials).toBe(1);expect(calls).toBe(0);expect(await budget.status()).toMatchObject({dispatches:0,admissionHeld:false});
});
it('reads both public catalogs without sending a model credential',async()=>{
 const budget=await ledger(),guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async resource=>{
  const request=new Request(resource);expect(request.headers.has('authorization')).toBe(false);calls++;return Response.json({data:[]});
 }});
 for(const path of ['/v1/models','/v1/models/catalog'])expect(await (await guard('https://ai-gateway.vercel.sh'+path,{headers:{authorization:'Bearer synthetic-no-provider-credential'}})).json()).toEqual({data:[]});
 expect(calls).toBe(2);expect(await budget.status()).toMatchObject({dispatches:0,chargedMicroUsd:0});
});
