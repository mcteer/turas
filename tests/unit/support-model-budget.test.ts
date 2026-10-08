import { describe, expect, it, vi } from "vitest";
import type { wrapLanguageModel } from "ai";
import { z } from "zod";
import { supportAdviceResultSchema } from "../../lib/support/advice";
import { wrapSupportModel } from "../../lib/server/support/model-budget";
type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
function provider() {
  const generate = vi.fn(async () => ({ content: [{ type: "text", text: "Synthetic support advice" }],
    finishReason: "stop", usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] }));
  const stream = vi.fn(async () => ({ stream: new ReadableStream({ start(controller) { controller.close(); } }) }));
  return { model: { specificationVersion: "v4", provider: "synthetic", modelId: "synthetic", supportedUrls: {},
    doGenerate: generate, doStream: stream } as unknown as Model, generate, stream };
}
describe("support paid-call wrapper", () => {
  it.each(["doGenerate", "doStream"] as const)("enforces the authored output contract on %s without weakening admission", async path => {
    const p = provider(), beforeProvider = vi.fn(async () => {});
    const wrapped = wrapSupportModel(p.model, { deadlineAt: new Date(Date.now() + 10000), beforeProvider });
    await wrapped[path]({ prompt: [], responseFormat: { type: "json", schema: { type: "object", properties: { invented: { type: "string" } } } } });
    const call = (path === "doGenerate" ? p.generate : p.stream).mock.calls[0] as unknown as [{ responseFormat: unknown }];
    expect(call[0].responseFormat).toEqual({ type: "json", name: "support_advice_v1", schema: z.toJSONSchema(supportAdviceResultSchema) });
    expect(beforeProvider).toHaveBeenCalledTimes(1);
    await expect(wrapped.doGenerate({ prompt: [] })).rejects.toMatchObject({ code: "support_step_uncertain" });
    expect(p.generate.mock.calls.length + p.stream.mock.calls.length).toBe(1);
  });
  it("denies unadmitted work and prevents retry after a failed source fence", async () => {
    const p = provider();
    await expect(wrapSupportModel(p.model).doGenerate({ prompt: [] })).rejects.toMatchObject({ code: "support_step_unadmitted" });
    const beforeProvider = vi.fn(async () => { throw new Error("Synthetic source withdrawn"); });
    const wrapped = wrapSupportModel(p.model, { deadlineAt: new Date(Date.now() + 10000), beforeProvider });
    await expect(wrapped.doGenerate({ prompt: [] })).rejects.toThrow("Synthetic source withdrawn");
    await expect(wrapped.doStream({ prompt: [] })).rejects.toMatchObject({ code: "support_step_uncertain" });
    expect(beforeProvider).toHaveBeenCalledTimes(1); expect(p.generate).not.toHaveBeenCalled(); expect(p.stream).not.toHaveBeenCalled();
  });
  it("filters to three reads and one procedure, clamps output and carries cancellation", async () => {
    const p = provider(), stop = new AbortController();
    const tools = ["support_summary", "support_actions", "support_evidence", "load_skill", "research", "bash", "approve_context"]
      .map(name => ({ type: "function" as const, name, inputSchema: { type: "object" as const } }));
    const wrapped = wrapSupportModel(p.model, { deadlineAt: new Date(Date.now() + 10000), beforeProvider: async () => {} });
    await wrapped.doGenerate({ prompt: [], tools, maxOutputTokens: 8000, abortSignal: stop.signal });
    const params = p.generate.mock.calls[0] as unknown as [{ tools: { name: string }[]; maxOutputTokens: number; abortSignal: AbortSignal }];
    expect(params[0].tools.map(tool => tool.name)).toEqual(["support_summary", "support_actions", "support_evidence", "load_skill"]);
    expect(params[0].maxOutputTokens).toBe(4096); stop.abort(); expect(params[0].abortSignal.aborted).toBe(true);
    await expect(wrapped.doStream({ prompt: [] })).rejects.toMatchObject({ code: "support_step_uncertain" });
  });
  it("rejects expired deadlines and forced forbidden tools before provider IO", async () => {
    const p = provider(), beforeProvider = vi.fn(async () => {});
    await expect(wrapSupportModel(p.model, { deadlineAt: new Date(0), beforeProvider }).doGenerate({ prompt: [] }))
      .rejects.toMatchObject({ code: "support_advice_expired" });
    await expect(wrapSupportModel(p.model, { deadlineAt: new Date(Date.now() + 10000), beforeProvider })
      .doStream({ prompt: [], toolChoice: { type: "tool", toolName: "research" } })).rejects.toMatchObject({ code: "support_tool_denied" });
    expect(beforeProvider).not.toHaveBeenCalled(); expect(p.generate).not.toHaveBeenCalled(); expect(p.stream).not.toHaveBeenCalled();
  });
});
