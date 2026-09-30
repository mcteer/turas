import { describe,expect,it,vi } from "vitest";
import type { wrapLanguageModel } from "ai";
import { admitPlanModelStep,wrapPlanModel } from "../../lib/server/plans/model-budget";

type Model=Parameters<typeof wrapLanguageModel>[0]["model"];

function fakeProvider() {
  const observed:number[]=[];
  const doGenerate=vi.fn(async (options:{maxOutputTokens?:number})=>{
    observed.push(options.maxOutputTokens ?? -1);
    return {content:[{type:"text",text:"Synthetic proposal"}],
      finishReason:"stop",usage:{inputTokens:{total:1},outputTokens:{total:2}},
      warnings:[]};
  });
  const model={specificationVersion:"v4",provider:"synthetic",
    modelId:"spacexai/grok-4.7",supportedUrls:{},doGenerate,
    doStream:vi.fn()} as unknown as Model;
  return {model,doGenerate,observed};
}

describe("planning model output limit",()=>{
  it("clamps a larger setting at the provider boundary",async()=>{
    const provider=fakeProvider();
    const model=wrapPlanModel(provider.model);
    await model.doGenerate({prompt:[],maxOutputTokens:16_384});
    expect(provider.observed).toEqual([4_096]);
    expect(provider.doGenerate).toHaveBeenCalledTimes(1);
  });

  it("preserves a tighter setting and sets a limit when omitted",async()=>{
    const provider=fakeProvider();
    const model=wrapPlanModel(provider.model);
    await model.doGenerate({prompt:[],maxOutputTokens:1_024});
    await model.doGenerate({prompt:[]});
    expect(provider.observed).toEqual([1_024,4_096]);
  });

  it("rejects step seven before touching the database or paid provider",async()=>{
    const provider=fakeProvider();
    const model=wrapPlanModel(provider.model);
    const client={query:vi.fn()} as unknown as Parameters<typeof admitPlanModelStep>[0];
    const actor={} as Parameters<typeof admitPlanModelStep>[1];
    await expect((async()=>{
      await admitPlanModelStep(client,actor,{nativeSessionId:"synthetic",
        responseAttemptId:"synthetic",turnId:"turn",stepIndex:6});
      await model.doGenerate({prompt:[]});
    })()).rejects.toMatchObject({code:"plan_step_budget"});
    expect(client.query).not.toHaveBeenCalled();
    expect(provider.doGenerate).not.toHaveBeenCalled();
  });
});
