import {test,vi,afterEach} from 'vitest';
import assert from 'node:assert/strict';
import {readPublicSource} from '../../lib/server/research/specialists/solution-research/provider';

const url='https://example.org/engineering/talk';
const page={success:true,url,markdown:'Verified conference transcript. '.repeat(20),metadata:{title:'Engineering talk'}};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
function setup(fetcher:typeof fetch){vi.stubEnv('TURAS_MAINTENANCE_SECRET','synthetic-page-contract-secret-32');vi.stubEnv('CONTEXT_DEV_API_KEY','synthetic-test-key');vi.stubGlobal('fetch',fetcher);vi.spyOn(console,'warn').mockImplementation(()=>{});}

test('a transient page timeout retries once and retains only the successful evidence',async()=>{
 let calls=0;
 setup(async()=>{if(++calls===1)throw new DOMException('Timed out','TimeoutError');return Response.json(page);});
 const result=await readPublicSource(url,new AbortController().signal);
 assert.equal(calls,2);assert.equal(result.source.excerpt,page.markdown);assert.equal(result.source.url,url);
});

test('gateway failure recovers once; repeated failure remains unavailable',async()=>{
 for(const status of [408,502,503,504]){
  {
   let calls=0;setup(async()=>{calls++;return new Response('Unavailable',{status});});
   await assert.rejects(readPublicSource(url,new AbortController().signal),(e:unknown)=>Boolean(e&&typeof e==='object'&&'reason'in e&&e.reason==='unavailable'&&'httpStatus'in e&&e.httpStatus===status));
   assert.equal(calls,2);
  }
 }
});

test('permissions, rate limits, missing pages and invalid evidence are not retried',async()=>{
 for(const response of [()=>new Response('Denied',{status:401}),()=>new Response('Denied',{status:403}),()=>new Response('Missing',{status:404}),()=>new Response('Limited',{status:429}),()=>Response.json({...page,partial:true}),()=>Response.json({...page,finalDOMState:'still-loading'}),()=>new Response('invalid json'),()=>new Response('x'.repeat(1_000_001))]){
  {
   let calls=0;setup(async()=>{calls++;return response();});
   await assert.rejects(readPublicSource(url,new AbortController().signal));assert.equal(calls,1);
  }
 }
});

test('cancellation during backoff prevents a second request',async()=>{
 const controller=new AbortController();let calls=0;
 setup(async()=>{calls++;setTimeout(()=>controller.abort(),25);throw new DOMException('Timed out','TimeoutError');});
 await assert.rejects(readPublicSource(url,controller.signal),(e:unknown)=>e instanceof Error&&e.name==='AbortError');assert.equal(calls,1);
});

test('network failure can recover, but retried partial evidence is still rejected',async()=>{
 let calls=0;setup(async()=>{if(++calls===1)throw new TypeError('Network failure');return Response.json({...page,partial:true});});
 await assert.rejects(readPublicSource(url,new AbortController().signal),(e:unknown)=>Boolean(e&&typeof e==='object'&&'reason'in e&&e.reason==='invalid_response'));assert.equal(calls,2);
});
