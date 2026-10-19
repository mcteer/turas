import { describe,it,expect,vi } from 'vitest';
import type { wrapLanguageModel } from 'ai';
import { wrapLearningModel,registerLearningModelCallbacks } from '../../lib/server/learning/model-budget';
type Model=Parameters<typeof wrapLanguageModel>[0]['model'];
function fixture(purpose:'draft'|'evaluation_candidate'='draft'){
 const generate=vi.fn(async()=>({content:[{type:'text',text:'Synthetic output'}],finishReason:'stop',usage:{inputTokens:{total:10},outputTokens:{total:20}},providerMetadata:{gateway:{cost:'0.001',generationId:'synthetic-generation'}},warnings:[]}));
 const stream=vi.fn(async()=>({stream:new ReadableStream({start(c){c.enqueue({type:'response-metadata',id:'synthetic-upstream-response'} as never);c.enqueue({type:'text-delta',id:'synthetic',delta:'Synthetic output',providerMetadata:{gateway:{generationId:'synthetic-generation'}}} as never);c.enqueue({type:'finish',finishReason:'stop',usage:{inputTokens:{total:10},outputTokens:{total:20}},providerMetadata:{gateway:{cost:'0.001'}}});c.close();}})}));
 const model={specificationVersion:'v4',provider:'synthetic',modelId:'spacexai/grok-4.7',supportedUrls:{},doGenerate:generate,doStream:stream} as unknown as Model;
 const deadlineAt=new Date(Date.now()+10000),beforeProvider=vi.fn(async()=>{}),chargeInput=vi.fn(async()=>{}),settle=vi.fn(async()=>{}),fail=vi.fn(async()=>{}),rememberIdentity=vi.fn(async(_kind:'provider_response'|'gateway_generation',_value:string)=>{});
 registerLearningModelCallbacks(deadlineAt,{purpose,chargeInput,settle,fail,rememberIdentity});
 return {wrapped:wrapLearningModel(model,{deadlineAt,beforeProvider}),model,generate,stream,beforeProvider,chargeInput,settle,fail,rememberIdentity};
}
describe('learning single-dispatch SDK wrapper',()=>{
 it.each(['doGenerate','doStream'] as const)('blocks retries across both provider paths after %s',async path=>{
  const f=fixture();const result=await f.wrapped[path]({prompt:[]});if('stream' in result){const reader=result.stream.getReader();while(!(await reader.read()).done){} }
  expect(f.beforeProvider).toHaveBeenCalledTimes(1);expect(f.settle).toHaveBeenCalledTimes(1);
  if(path==='doStream')expect(f.settle).toHaveBeenCalledWith(expect.objectContaining({responseId:'synthetic-upstream-response',metadata:{gateway:{cost:'0.001',generationId:'synthetic-generation'}}}));
  expect(f.rememberIdentity).toHaveBeenCalledWith('gateway_generation','synthetic-generation');if(path==='doStream')expect(f.rememberIdentity).toHaveBeenCalledWith('provider_response','synthetic-upstream-response');
  await expect(f.wrapped.doGenerate({prompt:[]})).rejects.toMatchObject({code:'learning_step_uncertain'});
  expect(f.generate.mock.calls.length+f.stream.mock.calls.length).toBe(1);
 });
 it('removes all tools from evaluation and rejects forced tools before dispatch',async()=>{
  const f=fixture('evaluation_candidate');await f.wrapped.doGenerate({prompt:[],tools:[{type:'function',name:'learning_summary',inputSchema:{}}]});
  expect((f.generate.mock.calls[0] as unknown as [{tools:unknown[]}])[0].tools).toEqual([]);
  const g=fixture('evaluation_candidate');await expect(g.wrapped.doGenerate({prompt:[],toolChoice:{type:'tool',toolName:'learning_summary'}})).rejects.toMatchObject({code:'learning_tool_denied'});expect(g.generate).not.toHaveBeenCalled();
  const h=fixture('evaluation_candidate');h.stream.mockImplementationOnce(async()=>({stream:new ReadableStream({start(controller){controller.enqueue({type:'tool-input-start',id:'synthetic',toolName:'forbidden',providerMetadata:{gateway:{generationId:'gen_synthetic_before_rejection'}}} as never);controller.close();}})}));
  const denied=await h.wrapped.doStream({prompt:[]});await expect(denied.stream.getReader().read()).rejects.toMatchObject({code:'learning_tool_denied'});
  expect(h.rememberIdentity).toHaveBeenCalledWith('gateway_generation','gen_synthetic_before_rejection');expect(h.rememberIdentity.mock.invocationCallOrder[0]).toBeLessThan(h.fail.mock.invocationCallOrder[0]);expect(h.settle).not.toHaveBeenCalled();
 });
 it('requires durable callbacks and stops unknown accounting without retry',async()=>{
  const f=fixture();await expect(wrapLearningModel(f.model).doGenerate({prompt:[]})).rejects.toMatchObject({code:'learning_step_unadmitted'});
  f.settle.mockRejectedValueOnce(Error('Unknown provider cost'));
  await expect(f.wrapped.doGenerate({prompt:[]})).rejects.toThrow('Unknown provider cost');expect(f.fail).toHaveBeenCalledTimes(1);
  await expect(f.wrapped.doStream({prompt:[]})).rejects.toMatchObject({code:'learning_step_uncertain'});
  const g=fixture();g.generate.mockRejectedValueOnce(Object.assign(Error('Synthetic SDK failure'),{generationId:'gen_synthetic_sdk_failure'}));
  await expect(g.wrapped.doGenerate({prompt:[]})).rejects.toThrow('Synthetic SDK failure');expect(g.rememberIdentity).toHaveBeenCalledWith('gateway_generation','gen_synthetic_sdk_failure');expect(g.rememberIdentity.mock.invocationCallOrder[0]).toBeLessThan(g.fail.mock.invocationCallOrder[0]);expect(g.settle).not.toHaveBeenCalled();
 });
 it('charges cumulative input before provider release and fences an input-budget failure',async()=>{
  const f=fixture();f.chargeInput.mockRejectedValueOnce(Error('Cumulative input limit'));
  await expect(f.wrapped.doGenerate({prompt:[]})).rejects.toThrow('Cumulative input limit');expect(f.beforeProvider).not.toHaveBeenCalled();expect(f.generate).not.toHaveBeenCalled();
  await expect(f.wrapped.doGenerate({prompt:[]})).rejects.toMatchObject({code:'learning_step_uncertain'});
 });
 it('settles a known provider overrun before rejecting release and forbids both retry paths',async()=>{
  const f=fixture();f.generate.mockImplementationOnce(async()=>({content:[{type:'text',text:'Synthetic overrun'}],finishReason:'stop',usage:{inputTokens:{total:10},outputTokens:{total:8193}},providerMetadata:{gateway:{cost:'0.001',generationId:'synthetic-overrun'}},warnings:[]}));
  await expect(f.wrapped.doGenerate({prompt:[]})).rejects.toMatchObject({code:'learning_output_budget'});expect(f.settle).toHaveBeenCalledWith(expect.objectContaining({outputTokens:8193}));expect(f.fail).not.toHaveBeenCalled();await expect(f.wrapped.doStream({prompt:[]})).rejects.toMatchObject({code:'learning_step_uncertain'});
 });
 it('holds a stream ending without a finish receipt and never invokes another provider path',async()=>{
  const f=fixture();f.stream.mockImplementationOnce(async()=>({stream:new ReadableStream({start(controller){controller.enqueue({type:'text-delta',id:'synthetic',delta:'Unconfirmed body'} as never);controller.close();}})}));
  const result=await f.wrapped.doStream({prompt:[]}),reader=result.stream.getReader();await expect(async()=>{while(!(await reader.read()).done){} }).rejects.toMatchObject({code:'accounting_unknown'});expect(f.fail).toHaveBeenCalledTimes(1);expect(f.settle).not.toHaveBeenCalled();await expect(f.wrapped.doGenerate({prompt:[]})).rejects.toMatchObject({code:'learning_step_uncertain'});expect(f.generate).not.toHaveBeenCalled();
 });
});
