import {beforeEach,afterEach,it,expect,vi} from 'vitest';
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
 // Once a complete receipt exists, cancellation must not race a durable
 // settlement into an unknown hold. Cancellation still reaches the caller.
 for(const failure of [false,true]){
  const budget=await ledger(),abort=new AbortController();let entered!:()=>void,release!:()=>void;
  const reached=new Promise<void>(resolve=>{entered=resolve;}),blocked=new Promise<void>(resolve=>{release=resolve;}),original=budget.settle.bind(budget);
  const spy=vi.spyOn(budget,'settle').mockImplementation(async(...args)=>{entered();await blocked;if(failure)throw Error('Synthetic settlement failure');return original(...args);});
  const pending=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>Response.json(metadata)})(endpoint,{...request,signal:abort.signal});
  const outcome=Promise.allSettled([pending]);await reached;abort.abort();release();
  expect((await outcome)[0].status).toBe('rejected');spy.mockRestore();
  expect(await budget.status()).toMatchObject(failure?{chargedMicroUsd:0,unknown:1,heldMicroUsd:16000000}:{chargedMicroUsd:1000,unknown:0,heldMicroUsd:0,admissionHeld:false});
 }
 // A hold already queued before settlement must never be erased.
 {
  const budget=await ledger(),original=budget.settle.bind(budget);
  const spy=vi.spyOn(budget,'settle').mockImplementation(async(id,receipt)=>{await budget.hold(id,'aborted');return original(id,receipt);});
  await expect(budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>Response.json(metadata)})(endpoint,request)).rejects.toThrow();spy.mockRestore();
  expect(await budget.status()).toMatchObject({chargedMicroUsd:0,unknown:1,heldMicroUsd:16000000});
 }
 // Independent evaluator processes share one reservation at a time. A second
 // request waits before its first provider call instead of becoming unconfirmed.
 const shared=await ledger();let release!:()=>void,entered!:()=>void,active=0,peak=0,number=0;
 const firstEntered=new Promise<void>(resolve=>{entered=resolve;}),blocked=new Promise<void>(resolve=>{release=resolve;});
 const provider:typeof fetch=async()=>{const id=++number;peak=Math.max(peak,++active);if(id===1){entered();await blocked;}active--;return Response.json({...metadata,providerMetadata:{gateway:{cost:'0.001',generationId:'synthetic-serial-'+id}}});};
 const first=budgetedGatewayFetch({ledger:shared,ceiling,fetch:provider})(endpoint,request);
 await firstEntered;
 const second=budgetedGatewayFetch({ledger:new QualityBudgetLedger(shared.root),ceiling,fetch:provider})(endpoint,request);
 const results=Promise.all([first,second]);
 expect(await shared.status()).toMatchObject({dispatches:1,chargedMicroUsd:0});expect(number).toBe(1);
 release();await results;
 expect(number).toBe(2);expect(peak).toBe(1);expect(await shared.status()).toMatchObject({dispatches:2,chargedMicroUsd:2000,admissionHeld:false,unknown:0});
});
it('denies a paid request below its full published bound without calling the provider',async()=>{
 const guard=budgetedGatewayFetch({ledger:await ledger(15000000),ceiling,fetch:async()=>{calls++;return Response.json(metadata);}});
 await expect(guard(endpoint,request)).rejects.toThrow('prevents dispatch');expect(calls).toBe(0);
 const occupied=await ledger(16000500),id=await occupied.dispatch(await ceiling());let observed!:()=>void;
 const seen=new Promise<void>(resolve=>{observed=resolve;});
 const pending=budgetedGatewayFetch({ledger:new QualityBudgetLedger(occupied.root),ceiling,observed:async()=>{observed();},fetch:async()=>{calls++;return Response.json(metadata);}})(endpoint,request);
 const outcome=Promise.allSettled([pending]);await seen;
 await occupied.settle(id,{chargedMicroUsd:1000,inputTokens:1,outputTokens:1,generationId:'synthetic-cap-after-wait'});
 const result=(await outcome)[0];expect(result.status).toBe('rejected');if(result.status==='rejected')expect(result.reason.message).toContain('prevents dispatch');
 expect(calls).toBe(0);expect(await occupied.status()).toMatchObject({dispatches:1,chargedMicroUsd:1000,admissionHeld:false});
});
it('blocks subsequent SDK retries when the first charge is unavailable',async()=>{
 const budget=await ledger(),observations:any[]=[],guard=budgetedGatewayFetch({ledger:budget,ceiling,failed:async value=>{observations.push(value);},fetch:async()=>{calls++;return Response.json({usage:metadata.usage,providerMetadata:{gateway:{generationId:'gateway_jsonActual'}},response:{id:'gen_upstreamJson'}});}});
 await expect(guard(endpoint,request)).rejects.toThrow('charge unavailable');await expect(guard(endpoint,request)).rejects.toThrow('holds admission');expect(calls).toBe(1);expect(await budget.status()).toMatchObject({admissionHeld:true,unknown:1,heldMicroUsd:16000000});expect(observations).toHaveLength(1);expect(observations[0]).toMatchObject({phase:'accounting',status:200,gatewayGenerationId:'gateway_jsonActual',upstreamResponseId:'gen_upstreamJson'});
 const pending=await ledger(),id=await pending.dispatch(await ceiling());let observed!:()=>void;
 const seen=new Promise<void>(resolve=>{observed=resolve;});
 const waiting=budgetedGatewayFetch({ledger:new QualityBudgetLedger(pending.root),ceiling,observed:async()=>{observed();},fetch:async()=>{throw Error('Must not dispatch after unknown');}})(endpoint,request);
 const outcome=Promise.allSettled([waiting]);await seen;await pending.hold(id,'provider_error');
 expect((await outcome)[0].status).toBe('rejected');expect(await pending.status()).toMatchObject({dispatches:1,chargedMicroUsd:0,unknown:1,heldMicroUsd:16000000});
});
it('accounts split streamed frames only after complete final usage is received',async()=>{
 const budget=await ledger(),bytes=Buffer.from('data: '+JSON.stringify({type:'finish',...metadata})+'\n\n');
 const guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,13));c.enqueue(bytes.subarray(13));c.close();}}),{headers:{'content-type':'text/event-stream'}});}});
 expect(await (await guard(endpoint,request)).text()).toBe(bytes.toString());expect(await budget.status()).toMatchObject({chargedMicroUsd:1000,admissionHeld:false});
 for(const [cancel,failure] of [[false,false],[true,false],[false,true]] as const){
  const budget=await ledger(),abort=new AbortController();let entered!:()=>void,release!:()=>void;
  const reached=new Promise<void>(resolve=>{entered=resolve;}),blocked=new Promise<void>(resolve=>{release=resolve;}),original=budget.settle.bind(budget);
  const spy=vi.spyOn(budget,'settle').mockImplementation(async(...args)=>{entered();await blocked;if(failure)throw Error('Synthetic stream settlement failure');return original(...args);});
  const response=await budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>new Response(bytes,{headers:{'content-type':'text/event-stream'}})})(endpoint,{...request,signal:abort.signal});
  const reader=response.body!.getReader();await reader.read();const pending=reader.read(),outcome=Promise.allSettled([pending]);
  await reached;let cancellationComplete=false;const cancellation=cancel?reader.cancel().then(()=>{cancellationComplete=true;}):Promise.resolve();if(cancel){await new Promise(resolve=>setImmediate(resolve));expect(cancellationComplete).toBe(false);}abort.abort();release();await cancellation;
  const result=(await outcome)[0];if(!cancel)expect(result.status).toBe('rejected');spy.mockRestore();
  expect(await budget.status()).toMatchObject(failure?{chargedMicroUsd:0,unknown:1,heldMicroUsd:16000000}:{chargedMicroUsd:1000,unknown:0,heldMicroUsd:0,admissionHeld:false});
 }

});
it('holds cancellation of an incomplete response and denies another dispatch',async()=>{
 const budget=await ledger(),guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('data: {"type":"text-delta","delta":"Synthetic"}\n\n'));}}),{headers:{'content-type':'text/event-stream'}});}});
 const response=await guard(endpoint,request);await response.body!.cancel();await expect(guard(endpoint,request)).rejects.toThrow('holds admission');expect(calls).toBe(1);expect(await budget.status()).toMatchObject({admissionHeld:true});
 const aborted=await ledger(),abort=new AbortController();let controller!:ReadableStreamDefaultController<Uint8Array>;
 const pending=budgetedGatewayFetch({ledger:aborted,ceiling,fetch:async()=>new Response(new ReadableStream({start(c){controller=c;c.enqueue(Buffer.from('{'));}}),{headers:{'content-type':'application/json'}})})(endpoint,{...request,signal:abort.signal});
 const outcome=Promise.allSettled([pending]);
 // Wait for the actual provider body before aborting; this is pre-receipt.
 while(!controller)await new Promise(resolve=>setTimeout(resolve,1));abort.abort();controller.error(abort.signal.reason);
 expect((await outcome)[0].status).toBe('rejected');expect(await aborted.status()).toMatchObject({unknown:1,chargedMicroUsd:0,heldMicroUsd:16000000});

});
it('rejects unapproved models endpoints and provider tools before dispatch',async()=>{
 const guard=budgetedGatewayFetch({ledger:await ledger(),ceiling,fetch:async()=>{calls++;return Response.json(metadata);}});
 for(const [url,init] of [[endpoint,{...request,headers:{...request.headers,'ai-model-id':'conflicting-model'}}],[endpoint,{...request,headers:{'ai-language-model-id':'unapproved-model'}}],['https://ai-gateway.vercel.sh/v4/ai/image-model',request],[endpoint,{...request,body:JSON.stringify({tools:[{type:'provider-defined'}]})}]] as const)await expect(guard(url,init)).rejects.toThrow();
 expect(calls).toBe(0);
});
it('does not claim a provider dispatch for an already aborted request',async()=>{
 const budget=await ledger(),abort=new AbortController();abort.abort();const guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async()=>{calls++;return Response.json(metadata);}});
 await expect(guard(endpoint,{...request,signal:abort.signal})).rejects.toThrow();expect(calls).toBe(0);expect(await budget.status()).toMatchObject({dispatches:0,admissionHeld:false});
 const occupied=await ledger(),id=await occupied.dispatch(await ceiling()),cancel=new AbortController();let observed!:()=>void;
 const seen=new Promise<void>(resolve=>{observed=resolve;});
 const waiting=budgetedGatewayFetch({ledger:new QualityBudgetLedger(occupied.root),ceiling,observed:async()=>{observed();},fetch:async()=>{calls++;return Response.json(metadata);}})(endpoint,{...request,signal:cancel.signal});
 const outcome=Promise.allSettled([waiting]);await seen;cancel.abort();
 expect((await outcome)[0].status).toBe('rejected');expect(calls).toBe(0);expect(await occupied.status()).toMatchObject({dispatches:1,chargedMicroUsd:0,heldMicroUsd:16000000});
 await occupied.settle(id,{chargedMicroUsd:1000,inputTokens:1,outputTokens:1,generationId:'synthetic-aborted-wait-predecessor'});
 expect(await occupied.status()).toMatchObject({dispatches:1,chargedMicroUsd:1000,admissionHeld:false});
});
it('enforces admission on the installed SDK request without contacting the provider',async()=>{
 const budget=await ledger(1);let denials=0;const parameters:unknown[]=[];
 const guard=budgetedGatewayFetch({ledger:budget,ceiling,parameters:async value=>{parameters.push(value);},denied:async()=>{denials++;},fetch:async()=>{calls++;throw Error('Unexpected provider call');}});
 await expect(generateText({model:createGateway({apiKey:'synthetic-no-provider-credential',fetch:guard})(model),prompt:'Synthetic private denial prompt',maxOutputTokens:1000,maxRetries:0})).rejects.toThrow();
 expect(parameters).toEqual([{modelId:model,maxOutputTokens:1000}]);expect(JSON.stringify(parameters)).not.toContain('private');expect(denials).toBe(1);expect(calls).toBe(0);expect(await budget.status()).toMatchObject({dispatches:0,admissionHeld:false});
});
it('reads both public catalogs without sending a model credential',async()=>{
 const budget=await ledger(),guard=budgetedGatewayFetch({ledger:budget,ceiling,fetch:async resource=>{
  const request=new Request(resource);expect(request.headers.has('authorization')).toBe(false);calls++;return Response.json({data:[]});
 }});
 for(const path of ['/v1/models','/v1/models/catalog'])expect(await (await guard('https://ai-gateway.vercel.sh'+path,{headers:{authorization:'Bearer synthetic-no-provider-credential'}})).json()).toEqual({data:[]});
 expect(calls).toBe(2);expect(await budget.status()).toMatchObject({dispatches:0,chargedMicroUsd:0});
});

it('retains bounded safe provider failure metadata and the full unknown reservation',async()=>{const budget=await ledger(),observations:any[]=[];const guard=budgetedGatewayFetch({ledger:budget,ceiling,failed:async value=>{observations.push(value);},fetch:async()=>{calls++;return Response.json({error:{code:'rate_limit_exceeded',message:'Synthetic sensitive provider detail'},providerMetadata:{gateway:{generationId:'gen_syntheticActualProviderId'}}},{status:429});}});await expect(guard(endpoint,request)).rejects.toThrow('cost review');expect(observations).toHaveLength(1);expect(observations[0]).toMatchObject({phase:'http',status:429,providerCode:'rate_limit_exceeded',gatewayGenerationId:'gen_syntheticActualProviderId',responseBodyComplete:true});expect(JSON.stringify(observations)).not.toContain('sensitive');expect(await budget.status()).toMatchObject({unknown:1,heldMicroUsd:16000000,admissionHeld:true});await expect(guard(endpoint,request)).rejects.toThrow('holds admission');expect(calls).toBe(1);});
it('bounds failure-body retention without accepting an incomplete body as complete',async()=>{const budget=await ledger(),observations:any[]=[];const guard=budgetedGatewayFetch({ledger:budget,ceiling,failed:async value=>{observations.push(value);},fetch:async()=>new Response('x'.repeat(20000),{status:500})});await expect(guard(endpoint,request)).rejects.toThrow('cost review');expect(observations[0]).toMatchObject({status:500,responseBodyBytes:0,responseBodyComplete:false});expect(JSON.stringify(observations)).not.toContain('xxx');});
it('retains an actual streamed generation identity when final accounting is lost',async()=>{const budget=await ledger(),observations:any[]=[];const body='data: '+JSON.stringify({type:'response-metadata',id:'gen_syntheticStreamId'})+'\n\n';const guard=budgetedGatewayFetch({ledger:budget,ceiling,failed:async value=>{observations.push(value);},fetch:async()=>new Response(body,{headers:{'content-type':'text/event-stream'}})});const response=await guard(endpoint,request);await expect(response.text()).rejects.toThrow('final accounting');expect(observations[0]).toMatchObject({phase:'stream',status:200,upstreamResponseId:'gen_syntheticStreamId'});expect(await budget.status()).toMatchObject({unknown:1,admissionHeld:true});});

it('keeps Gateway generation authority distinct from an upstream gen-shaped response ID',async()=>{const budget=await ledger(),observations:any[]=[];const body='data: '+JSON.stringify({type:'response-metadata',id:'gen_upstreamOnly'})+'\n\ndata: '+JSON.stringify({type:'provider-metadata',providerMetadata:{gateway:{generationId:'gateway_actualDifferent'}}})+'\n\ndata: '+JSON.stringify({type:'error',error:'Synthetic provider failure'})+'\n\n';const guard=budgetedGatewayFetch({ledger:budget,ceiling,failed:async v=>{observations.push(v);},fetch:async()=>new Response(body,{headers:{'content-type':'text/event-stream'}})});await expect((await guard(endpoint,request)).text()).rejects.toThrow('stream failed');expect(observations[0]).toMatchObject({gatewayGenerationId:'gateway_actualDifferent',upstreamResponseId:'gen_upstreamOnly'});expect(await budget.status()).toMatchObject({unknown:1,heldMicroUsd:16000000});});
