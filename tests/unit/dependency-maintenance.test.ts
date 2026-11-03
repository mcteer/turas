import {beforeEach,describe,expect,it,vi} from 'vitest';
import {MockLanguageModelV4} from 'ai/test';
import type {LanguageModelV4FinishReason,LanguageModelV4Usage} from '@ai-sdk/provider';
import type {PoolClient} from 'pg';

const seams=vi.hoisted(()=>({settle:vi.fn(),complete:vi.fn(),authorize:vi.fn(),ready:vi.fn()}));
vi.mock('../../lib/server/db/client',()=>({withTransaction:async(fn:(db:unknown)=>unknown)=>fn({})}));
vi.mock('../../lib/server/research/specialists/discussions',()=>({authorizeSpecialistWorker:seams.authorize}));
vi.mock('../../lib/server/research/specialists/discussion-budget',()=>({
 reserveLockedSpecialistOperation:async()=>({id:'operation-1'}),
 remainingLockedSpecialistAllowance:async()=>({inputTokens:1000000,outputTokens:100000,microUsd:1000000}),
 settleSpecialistOperation:seams.settle,markSpecialistOperationCompleted:seams.complete,
}));
vi.mock('../../lib/server/mcp/schema',()=>({assertMcpReady:seams.ready}));
vi.mock('../../lib/server/config',()=>({getServerConfig:()=>({TURAS_ENVIRONMENT_ID:'owned-test'})}));
import {guardSpecialistProvider} from '../../lib/server/research/specialists/discussion-provider';
import {authenticateMcpCredential,newMcpCredential} from '../../lib/server/mcp/credentials';

beforeEach(()=>{
 vi.clearAllMocks();
 seams.authorize.mockResolvedValue({discussion:{id:'discussion-1',conversation_id:'conversation-1',expires_at:new Date(Date.now()+60000)},assignmentId:'assignment-1'});
});

describe('specialist provider termination accounting',()=>{
 const usage:LanguageModelV4Usage={inputTokens:{total:5,noCache:5,cacheRead:0,cacheWrite:0},outputTokens:{total:2,text:2,reasoning:0}};
 const identity={attemptId:'attempt-1',principalId:'principal-1',parentSessionId:'parent-1',workerSessionId:'worker-1',kind:'customer-update' as const,turnId:'turn-1',stepIndex:0};
 for(const transport of ['generate','stream'] as const)for(const externalFee of [false,true]){
  it.each(['stop','error','interrupted'])(`${transport} preserves completion authority (external fee=${externalFee}, finish=%s)`,async reason=>{
   const finishReason={unified:reason,raw:reason} as LanguageModelV4FinishReason;
   const model=new MockLanguageModelV4({
    doGenerate:{content:[{type:'text',text:'Retained partial result.'}],finishReason,usage,warnings:[],providerMetadata:{gateway:{cost:'0.000001'}}},
    doStream:async()=>({stream:new ReadableStream({start(controller){controller.enqueue({type:'finish',finishReason,usage,providerMetadata:{gateway:{cost:'0.000001'}}});controller.close();}})}),
   });
   const guarded=guardSpecialistProvider(model,identity,async()=>({input:0,output:0,observedAt:new Date().toISOString()}));
   const params={prompt:[{role:'user' as const,content:[{type:'text' as const,text:'Synthetic accounting fixture.'}]}],maxOutputTokens:10,
    ...(externalFee?{tools:[{type:'function' as const,name:'exa_search',inputSchema:{type:'object' as const,properties:{}}}]}:{}),
   };
   if(transport==='generate')expect((await guarded.doGenerate(params)).finishReason).toEqual(finishReason);
   else {const result=await guarded.doStream(params);const reader=result.stream.getReader();expect((await reader.read()).value).toMatchObject({type:'finish',finishReason});expect((await reader.read()).done).toBe(true);}
   expect(seams.settle).toHaveBeenCalledTimes(reason==='stop'&&!externalFee?1:0);
   expect(seams.complete).toHaveBeenCalledTimes(reason==='stop'&&externalFee?1:0);
  });
 }
});

describe('MCP credential syntax remains separate from authorization',()=>{
 it.each([null,'Bearer ','Bearer invalid','bearer tmcp.invalid','Bearer '+'x'.repeat(100000)])('rejects malformed credentials before database access',async header=>{
  const query=vi.fn();
  await expect(authenticateMcpCredential({query} as unknown as PoolClient,header)).rejects.toMatchObject({status:401,code:'unauthorized'});
  expect(query).not.toHaveBeenCalled();expect(seams.ready).not.toHaveBeenCalled();
 });
 it('does not authenticate a syntactically valid unissued credential',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[]});
  await expect(authenticateMcpCredential({query} as unknown as PoolClient,'Bearer '+newMcpCredential().credential)).rejects.toMatchObject({status:401,code:'unauthorized'});
  expect(seams.ready).toHaveBeenCalledOnce();expect(query).toHaveBeenCalledOnce();
 });
});
