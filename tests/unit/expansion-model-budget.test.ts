import { describe, expect, it, vi } from "vitest";
import type { wrapLanguageModel } from "ai";
import { z } from "zod";
import { expansionAdviceResultSchema } from "../../lib/expansion/advice";
import { wrapExpansionModel } from "../../lib/server/expansion/model-budget";
type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
function provider() {
  const generate = vi.fn(async () => ({ content: [{ type: "text", text: "Synthetic expansion advice" }],
    finishReason: "stop", usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] }));
  const stream = vi.fn(async () => ({ stream: new ReadableStream({ start(controller) { controller.close(); } }) }));
  return { model: { specificationVersion: "v4", provider: "synthetic", modelId: "synthetic", expansionedUrls: {},
    doGenerate: generate, doStream: stream } as unknown as Model, generate, stream };
}
describe("expansion paid-call wrapper", () => {
  it.each(["doGenerate", "doStream"] as const)("enforces the authored output contract on %s without weakening admission", async path => {
    const p = provider(), beforeProvider = vi.fn(async () => {});
    const wrapped = wrapExpansionModel(p.model, { deadlineAt: new Date(Date.now() + 10000), beforeProvider });
    await wrapped[path]({ prompt: [], responseFormat: { type: "json", schema: { type: "object", properties: { invented: { type: "string" } } } } });
    const call = (path === "doGenerate" ? p.generate : p.stream).mock.calls[0] as unknown as [{ responseFormat: unknown }];
    expect(call[0].responseFormat).toEqual({ type: "json", name: "expansion_advice_v1", schema: z.toJSONSchema(expansionAdviceResultSchema) });
    expect(beforeProvider).toHaveBeenCalledTimes(1);
    await expect(wrapped.doGenerate({ prompt: [] })).rejects.toMatchObject({ code: "expansion_step_uncertain" });
    expect(p.generate.mock.calls.length + p.stream.mock.calls.length).toBe(1);
  });
  it("denies unadmitted work and prevents retry after a failed source fence", async () => {
    const p = provider();
    await expect(wrapExpansionModel(p.model).doGenerate({ prompt: [] })).rejects.toMatchObject({ code: "expansion_step_unadmitted" });
    const beforeProvider = vi.fn(async () => { throw new Error("Synthetic source withdrawn"); });
    const wrapped = wrapExpansionModel(p.model, { deadlineAt: new Date(Date.now() + 10000), beforeProvider });
    await expect(wrapped.doGenerate({ prompt: [] })).rejects.toThrow("Synthetic source withdrawn");
    await expect(wrapped.doStream({ prompt: [] })).rejects.toMatchObject({ code: "expansion_step_uncertain" });
    expect(beforeProvider).toHaveBeenCalledTimes(1); expect(p.generate).not.toHaveBeenCalled(); expect(p.stream).not.toHaveBeenCalled();
  });
  it("filters to three reads and one procedure, clamps output and carries cancellation", async () => {
    const p = provider(), stop = new AbortController();
    const tools = ["expansion_summary", "expansion_hypotheses", "expansion_evidence", "load_skill", "research", "bash", "approve_context"]
      .map(name => ({ type: "function" as const, name, inputSchema: { type: "object" as const } }));
    const wrapped = wrapExpansionModel(p.model, { deadlineAt: new Date(Date.now() + 10000), beforeProvider: async () => {} });
    await wrapped.doGenerate({ prompt: [], tools, maxOutputTokens: 8000, abortSignal: stop.signal });
    const params = p.generate.mock.calls[0] as unknown as [{ tools: { name: string }[]; maxOutputTokens: number; abortSignal: AbortSignal }];
    expect(params[0].tools.map(tool => tool.name)).toEqual(["expansion_summary", "expansion_hypotheses", "expansion_evidence", "load_skill"]);
    expect(params[0].maxOutputTokens).toBe(4096); stop.abort(); expect(params[0].abortSignal.aborted).toBe(true);
    await expect(wrapped.doStream({ prompt: [] })).rejects.toMatchObject({ code: "expansion_step_uncertain" });
  });
  it("rejects expired deadlines and forced forbidden tools before provider IO", async () => {
    const p = provider(), beforeProvider = vi.fn(async () => {});
    await expect(wrapExpansionModel(p.model, { deadlineAt: new Date(0), beforeProvider }).doGenerate({ prompt: [] }))
      .rejects.toMatchObject({ code: "expansion_advice_expired" });
    await expect(wrapExpansionModel(p.model, { deadlineAt: new Date(Date.now() + 10000), beforeProvider })
      .doStream({ prompt: [], toolChoice: { type: "tool", toolName: "research" } })).rejects.toMatchObject({ code: "expansion_tool_denied" });
    expect(beforeProvider).not.toHaveBeenCalled(); expect(p.generate).not.toHaveBeenCalled(); expect(p.stream).not.toHaveBeenCalled();
  });
  it.each(["doGenerate", "doStream"] as const)("rejects excessive actual provider prompt bytes on %s",async path=>{
    const p=provider(),beforeProvider=vi.fn(async()=>{});
    const wrapped=wrapExpansionModel(p.model,{deadlineAt:new Date(Date.now()+10000),beforeProvider});
    await expect(wrapped[path]({prompt:[{role:'system',content:'é'.repeat(12288)}]})).rejects.toMatchObject({code:'expansion_context_budget'});
    expect(beforeProvider).not.toHaveBeenCalled();expect(p.generate).not.toHaveBeenCalled();expect(p.stream).not.toHaveBeenCalled();
  });

  it('rejects forbidden or malformed provider tool calls before framework execution',async()=>{
    for(const [toolName,input] of [['bash','{}'],['load_skill','{"skill":"other"}'],['expansion_evidence','{"sourceKeys":[]}']]){
      const p=provider();const model={...p.model,doGenerate:async()=>({content:[{type:'tool-call',toolCallId:'synthetic-call',toolName,input}],finishReason:'tool-calls',usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]})} as unknown as Model;
      const wrapped=wrapExpansionModel(model,{deadlineAt:new Date(Date.now()+10000),beforeProvider:async()=>{}});
      await expect(wrapped.doGenerate({prompt:[]})).rejects.toBeInstanceOf(Error);
      await expect(wrapped.doGenerate({prompt:[]})).rejects.toMatchObject({code:'expansion_step_uncertain'});
    }
  });

  it.each([4916, undefined, -1])("withholds generated output with inadmissible actual usage %s", async total => {
    const p = provider();
    const model = {...p.model, doGenerate: async () => ({content: [{type: "text", text: "Must not release"}], finishReason: "stop",
      usage: {inputTokens: {total: 1}, outputTokens: {total}}, warnings: []})} as unknown as Model;
    const wrapped = wrapExpansionModel(model, {deadlineAt: new Date(Date.now()+10000), beforeProvider: async()=>{}});
    await expect(wrapped.doGenerate({prompt: []})).rejects.toMatchObject({code: "expansion_output_budget"});
    await expect(wrapped.doGenerate({prompt: []})).rejects.toMatchObject({code: "expansion_step_uncertain"});
  });
  it.each([4916, undefined])("withholds stream completion with inadmissible actual usage %s", async total => {
    const p = provider();
    const model = {...p.model, doStream: async () => ({stream: new ReadableStream({start(controller) {
      controller.enqueue({type: "finish", finishReason: "stop", usage: {inputTokens: {total: 1}, outputTokens: {total}}}); controller.close();
    }})})} as unknown as Model;
    const wrapped = wrapExpansionModel(model, {deadlineAt: new Date(Date.now()+10000), beforeProvider: async()=>{}});
    const result = await wrapped.doStream({prompt: []});
    await expect(result.stream.getReader().read()).rejects.toMatchObject({code: "expansion_output_budget"});
  });

  it("releases a stream only with confirmed in-limit terminal usage", async()=>{
    const p=provider();
    const model={...p.model,doStream:async()=>({stream:new ReadableStream({start(controller){
      controller.enqueue({type:"finish",finishReason:"stop",usage:{inputTokens:{total:1},outputTokens:{total:4096}}});controller.close();
    }})})} as unknown as Model;
    const result=await wrapExpansionModel(model,{deadlineAt:new Date(Date.now()+10000),beforeProvider:async()=>{}}).doStream({prompt:[]});
    const reader=result.stream.getReader();expect((await reader.read()).value?.type).toBe("finish");expect((await reader.read()).done).toBe(true);
  });
  it("rejects a stream ending without terminal usage",async()=>{
    const result=await wrapExpansionModel(provider().model,{deadlineAt:new Date(Date.now()+10000),beforeProvider:async()=>{}}).doStream({prompt:[]});
    await expect(result.stream.getReader().read()).rejects.toMatchObject({code:"expansion_output_budget"});
  });

});
