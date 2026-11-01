import {it,expect,vi} from 'vitest';
import {createGateway} from 'ai';
const staffing=vi.hoisted(()=>({enabled:false,admit:vi.fn(async()=>({mode:'operational',deadlineAt:new Date(Date.now()+60000)}))}));
vi.mock('../../../lib/server/staffing/native-context',()=>({staffingResponseScope:async()=>staffing.enabled?{}:null}));
vi.mock('../../../lib/server/staffing/native-admission',()=>({admitGovernedStaffingModelStep:staffing.admit,assertGovernedStaffingProviderRelease:async()=>{}}));
vi.mock('../../../lib/server/conversations/feature',()=>({responseFeature:async()=>null}));
vi.mock('../../../lib/server/db/client',()=>({withTransaction:async(run:(db:unknown)=>unknown)=>run({query:async()=>({rows:[{schema_version:0}]})})}));
import agent from '../../../agent/agent';
import {turnFixture} from '../../fixtures/eve-v27';
import {selectTurasGatewayModel} from '../../../lib/server/models/gateway-routing';
import {wrapSupportModel} from '../../../lib/server/support/model-budget';
type Model=Extract<Parameters<typeof wrapSupportModel>[0],{specificationVersion:'v4'}>;
const fake=(methods:Partial<Model>)=>({specificationVersion:'v4',provider:'synthetic-no-network',modelId:'anthropic/claude-sonnet-5.5',supportedUrls:{},...methods}) as Model;

it('serializes the actual session selection with the same model and request-local Anthropic-only route',async()=>{
 const fixture=turnFixture();
 const model=agent.model;if(!model||typeof model!=='object')throw Error('Missing dynamic model');
 const selection=await Reflect.get(model,Symbol.for('eve.dynamic'))({session:{id:'wrun_synthetic',auth:{current:null}},turn:{id:'turn_0'},view:fixture.snapshot.view});
 expect(JSON.parse(JSON.stringify(selection))).toEqual({model:'anthropic/claude-sonnet-5.5',modelOptions:{providerOptions:{gateway:{only:['anthropic']}}}});
 expect((agent as unknown as {reasoning?:string}).reasoning).toBe('low');
});

it('passes the route through the actual support guard without replacing the model or permitting a second generate call',async()=>{
 const order:string[]=[],observed:unknown[]=[];
 const model=wrapSupportModel(fake({doGenerate:async params=>{order.push('sdk');observed.push(params.providerOptions);return {content:[],finishReason:{unified:'stop' as const,raw:'stop'},usage:{inputTokens:{total:0,noCache:0,cacheRead:0,cacheWrite:0},outputTokens:{total:0,text:0,reasoning:0}},warnings:[]};}}),{deadlineAt:new Date(Date.now()+60000),beforeProvider:async()=>{order.push('release');}});
 const selection=selectTurasGatewayModel(model);expect(selection.model).toBe(model);
 const providerOptions={...selection.modelOptions!.providerOptions,gateway:{...selection.modelOptions!.providerOptions!.gateway,sessionId:'synthetic-session'},anthropic:{metadata:{userId:'synthetic-user'}}};
 await model.doGenerate({prompt:[],providerOptions});
 expect(observed).toEqual([providerOptions]);expect(providerOptions.gateway.only).toEqual(['anthropic']);expect(order).toEqual(['release','sdk']);
 await expect(model.doGenerate({prompt:[],providerOptions})).rejects.toThrow('no paid retry');expect(order).toEqual(['release','sdk']);
});

it('preserves the same route and shared no-replay guard for streaming calls',async()=>{
 const order:string[]=[],observed:unknown[]=[];
 const model=wrapSupportModel(fake({doStream:async params=>{order.push('sdk');observed.push(params.providerOptions);return {stream:new ReadableStream({start(controller){controller.close();}})};}}),{deadlineAt:new Date(Date.now()+60000),beforeProvider:async()=>{order.push('release');}});
 const selection=selectTurasGatewayModel(model),providerOptions=selection.modelOptions!.providerOptions;
 await model.doStream({prompt:[],providerOptions});expect(observed).toEqual([{gateway:{only:['anthropic']}}]);expect(order).toEqual(['release','sdk']);
 await expect(model.doGenerate({prompt:[],providerOptions})).rejects.toThrow('no paid retry');expect(order).toEqual(['release','sdk']);
});

it('serializes the selection through the installed Gateway SDK for generate and stream without real network access',async()=>{
 const realNetwork=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw Error('Real network forbidden');});
 const requests:{headers:Headers;body:Record<string,unknown>}[]=[];
 try{
  const localGateway=createGateway({apiKey:'synthetic-no-network',fetch:async(_url,init)=>{
   requests.push({headers:new Headers(init?.headers),body:JSON.parse(String(init?.body))});
   throw Error('Synthetic Gateway wire interception');
  }});
  const selection=selectTurasGatewayModel(localGateway('anthropic/claude-sonnet-5.5'));
  const providerOptions={...selection.modelOptions.providerOptions,gateway:{...selection.modelOptions.providerOptions.gateway,sessionId:'synthetic-session'},anthropic:{metadata:{userId:'synthetic-user'}}};
  for(const method of ['doGenerate','doStream'] as const)await expect(selection.model[method]({prompt:[],providerOptions})).rejects.toThrow();
  expect(requests).toHaveLength(2);
  for(const [i,request] of requests.entries()){
   expect(request.headers.get('ai-language-model-id')).toBe('anthropic/claude-sonnet-5.5');
   expect(request.headers.get('ai-language-model-streaming')).toBe(String(i===1));
   expect(request.body.providerOptions).toEqual(providerOptions);
  }
  expect(realNetwork).not.toHaveBeenCalled();
 }finally{realNetwork.mockRestore();}
});

it('passes upcoming zero-based model ordinals into governed admission before request facts exist',async()=>{
 staffing.enabled=true;staffing.admit.mockClear();
 try{
  const fixture=turnFixture();const resolve=Reflect.get(agent.model!,Symbol.for('eve.dynamic'));
  const ctx=()=>({session:{id:'wrun_synthetic',auth:{current:{principalId:'owned',attributes:{turasAttemptId:'attempt'}}}},turn:{id:'turn_0'},view:fixture.snapshot.view});
  await resolve(ctx());
  fixture.commit({type:'model.requested',scope:{turnId:'turn_0',runId:'run_0'},data:{runId:'run_0',owner:{turnId:'turn_0'}}},
   {type:'model.started',scope:{turnId:'turn_0',runId:'run_0'},data:{runId:'run_0',modelId:'synthetic',attempt:0}},
   {type:'model.settled',scope:{turnId:'turn_0',runId:'run_0'},data:{runId:'run_0',outcome:'completed'}});
  await resolve(ctx());
  expect(staffing.admit.mock.calls.map(call=>(call as unknown as [unknown,{stepIndex:number}])[1].stepIndex)).toEqual([0,1]);
 }finally{staffing.enabled=false;}
});
