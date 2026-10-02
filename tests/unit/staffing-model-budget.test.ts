import { describe, expect, it, vi } from "vitest";
import type { wrapLanguageModel } from "ai";
import { wrapStaffingModel, assertStaffingStepLimits, staffingReportedTokens, staffingContextCharge } from "../../lib/server/staffing/model-budget";
type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
function provider() {
  const generate = vi.fn(async () => ({ content: [{ type: "text", text: "Synthetic staffing explanation" }],
    finishReason: "stop", usage: { inputTokens: { total: 1 }, outputTokens: { total: 2 } }, warnings: [] }));
  const stream = vi.fn(async () => ({ stream: new ReadableStream({ start(controller) { controller.close(); } }) }));
  return { model: { specificationVersion: "v4", provider: "synthetic", modelId: "spacexai/grok-4.7", supportedUrls: {},
    doGenerate: generate, doStream: stream } as unknown as Model, generate, stream };
}
describe("staffing provider output and pre-admission budgets", () => {
  it("fences each admitted call immediately before IO and prevents retry after a failed release", async () => {
    const p = provider(), beforeProvider = vi.fn(async () => { throw new Error("Synthetic source withdrawn"); });
    const model = wrapStaffingModel(p.model, "operational", { deadlineAt: new Date(Date.now() + 10_000), beforeProvider });
    await expect(model.doGenerate({ prompt: [] })).rejects.toThrow("Synthetic source withdrawn");
    await expect(model.doStream({ prompt: [] })).rejects.toMatchObject({ code: "staffing_step_uncertain" });
    expect(beforeProvider).toHaveBeenCalledTimes(1); expect(p.generate).not.toHaveBeenCalled(); expect(p.stream).not.toHaveBeenCalled();
  });
  it("preserves caller cancellation and the original deadline on generate and stream", async () => {
    for (const stream of [false, true]) {
      const p = provider(), stop = new AbortController(), beforeProvider = vi.fn(async () => {});
      const model = wrapStaffingModel(p.model, "finance", { deadlineAt: new Date(Date.now() + 40), beforeProvider });
      if (stream) await model.doStream({ prompt: [], abortSignal: stop.signal });
      else await model.doGenerate({ prompt: [], abortSignal: stop.signal });
      const signal = ((stream ? p.stream : p.generate).mock.calls[0] as unknown as [{ abortSignal: AbortSignal }])[0].abortSignal;
      expect(signal).toBeInstanceOf(AbortSignal); expect(beforeProvider).toHaveBeenCalledTimes(1);
      stop.abort(new Error("Synthetic stop")); expect(signal.aborted).toBe(true);
    }
    const p = provider(), beforeProvider = vi.fn(async () => {});
    await expect(wrapStaffingModel(p.model, "operational", { deadlineAt: new Date(Date.now() - 1), beforeProvider })
      .doGenerate({ prompt: [] })).rejects.toMatchObject({ code: "staffing_advisory_expired" });
    expect(beforeProvider).not.toHaveBeenCalled(); expect(p.generate).not.toHaveBeenCalled();
    const expiredDuringFence = provider();
    await expect(wrapStaffingModel(expiredDuringFence.model, "operational", {
      deadlineAt: new Date(Date.now() + 10), beforeProvider: async () => { await new Promise(resolve => setTimeout(resolve, 20)); },
    }).doStream({ prompt: [] })).rejects.toMatchObject({ code: "staffing_advisory_expired" });
    expect(expiredDuringFence.stream).not.toHaveBeenCalled();
  });
  it("shares exact UTF-8 context, six reads and two hundred dependency identities without clipping warnings", () => {
    const initial = staffingContextCharge({ contextBytes: 0, readCalls: 0, dependencyCount: 0 },
      { bytes: Buffer.byteLength("重要😀", "utf8"), read: false, dependencyCount: 0 });
    expect(initial).toEqual({ contextBytes: 10, readCalls: 0, dependencyCount: 0 });
    const last = { contextBytes: 24_575, readCalls: 5, dependencyCount: 199 };
    expect(staffingContextCharge(last, { bytes: 1, read: true, dependencyCount: 200 })).toEqual({ contextBytes: 24_576, readCalls: 6, dependencyCount: 200 });
    for (const charge of [{ bytes: 2, read: true, dependencyCount: 200 }, { bytes: 0, read: false, dependencyCount: 201 },
      { bytes: -1, read: false, dependencyCount: 199 }, { bytes: 0.5, read: false, dependencyCount: 199 }, { bytes: 0, read: false, dependencyCount: 198 }]) {
      expect(() => staffingContextCharge(last, charge)).toThrow();
    }
    expect(() => staffingContextCharge({ ...last, readCalls: 6 }, { bytes: 0, read: true, dependencyCount: 199 })).toThrow();
    expect(() => staffingContextCharge({ ...last, contextBytes: Number.MAX_SAFE_INTEGER }, { bytes: 1, read: false, dependencyCount: 199 })).toThrow();
  });
  it("clamps generate and stream at the provider boundary, preserving tighter valid limits", async () => {
    const p = provider();
    for (const requested of [16_384, 1024, undefined, 0, -1, 1.5, NaN, Infinity]) {
      await wrapStaffingModel(p.model).doGenerate({ prompt: [], maxOutputTokens: requested });
      await wrapStaffingModel(p.model).doStream({ prompt: [], maxOutputTokens: requested });
    }
    for (const method of [p.generate, p.stream]) expect(method.mock.calls.map(args => (args as unknown as [{ maxOutputTokens: number }])[0].maxOutputTokens))
      .toEqual([4096, 1024, 4096, 4096, 4096, 4096, 4096, 4096]);
  });
  it("prevents a second provider invocation across retries and generate/stream paths after uncertainty", async () => {
    const p = provider(), model = wrapStaffingModel(p.model);
    p.generate.mockRejectedValueOnce(new Error("Synthetic ambiguous provider transport"));
    await expect(model.doGenerate({ prompt: [] })).rejects.toThrow("Synthetic ambiguous");
    await expect(model.doGenerate({ prompt: [] })).rejects.toMatchObject({ status: 409, code: "staffing_step_uncertain" });
    await expect(model.doStream({ prompt: [] })).rejects.toMatchObject({ status: 409, code: "staffing_step_uncertain" });
    expect(p.generate).toHaveBeenCalledTimes(1); expect(p.stream).not.toHaveBeenCalled();
    const streaming = provider(), streamed = wrapStaffingModel(streaming.model);
    await streamed.doStream({ prompt: [] });
    await expect(streamed.doGenerate({ prompt: [] })).rejects.toMatchObject({ status: 409 });
    expect(streaming.stream).toHaveBeenCalledTimes(1); expect(streaming.generate).not.toHaveBeenCalled();
  });
  it("filters the provider catalog to bound reads and the procedure, denying forced generic or operational finance tools", async () => {
    const tools = ["read_staffing_demand", "match_staffing_resources", "read_staffing_capacity", "read_staffing_scenario", "load_skill",
      "research", "search_evidence", "save_delivery_plan_draft", "bash", "agent"].map(name =>
      ({ type: "function" as const, name, description: "Synthetic capability", inputSchema: { type: "object" as const } }));
    const operational = provider(); await wrapStaffingModel(operational.model).doGenerate({ prompt: [], tools });
    expect((operational.generate.mock.calls[0] as unknown as [{ tools: { name: string }[] }])[0].tools.map(tool => tool.name))
      .toEqual(["read_staffing_demand", "match_staffing_resources", "read_staffing_capacity", "load_skill"]);
    const finance = provider(); await wrapStaffingModel(finance.model, "finance").doStream({ prompt: [], tools });
    expect((finance.stream.mock.calls[0] as unknown as [{ tools: { name: string }[] }])[0].tools.map(tool => tool.name))
      .toEqual(["read_staffing_demand", "match_staffing_resources", "read_staffing_capacity", "read_staffing_scenario", "load_skill"]);
    for (const toolName of ["research", "bash", "read_staffing_scenario"]) {
      const denied = provider();
      await expect(wrapStaffingModel(denied.model).doGenerate({ prompt: [], tools, toolChoice: { type: "tool", toolName } }))
        .rejects.toMatchObject({ status: 403 });
      expect(denied.generate).not.toHaveBeenCalled();
    }
  });
  it("rejects step seven, invalid identities and exhausted admission count before invoking a provider", async () => {
    const p = provider(), model = wrapStaffingModel(p.model), now = Date.parse("2026-09-30T12:00:00Z");
    for (const patch of [{ stepIndex: 6 }, { stepIndex: -1 }, { stepIndex: 0.5 }, { stepsAdmitted: 6 }, { stepsAdmitted: 7 }, { stepsAdmitted: -1 }, { turnId: "" }, { turnId: "x".repeat(201) }]) {
      await expect((async () => {
        assertStaffingStepLimits({ turnId: "turn", stepIndex: 0, stepsAdmitted: 0, deadlineAt: new Date(now + 120_000), ...patch }, now);
        await model.doGenerate({ prompt: [] });
      })()).rejects.toBeDefined();
    }
    expect(p.generate).not.toHaveBeenCalled(); expect(p.stream).not.toHaveBeenCalled();
    expect(() => assertStaffingStepLimits({ turnId: "turn", stepIndex: 5, stepsAdmitted: 5, deadlineAt: new Date(now + 1) }, now)).not.toThrow();
  });
  it("fails closed at the exact dispatch deadline and on invalid clock/deadline", () => {
    const now = Date.parse("2026-09-30T12:00:00Z"), input = { turnId: "turn", stepIndex: 0, stepsAdmitted: 0, deadlineAt: new Date(now) };
    expect(() => assertStaffingStepLimits(input, now)).toThrow();
    expect(() => assertStaffingStepLimits({ ...input, deadlineAt: new Date(NaN) }, now)).toThrow();
    expect(() => assertStaffingStepLimits(input, NaN)).toThrow();
  });
  it("keeps unavailable or invalid actual usage unknown and preserves an actual reported zero", () => {
    for (const usage of [null, {}, { outputTokens: -1 }, { outputTokens: 1.5 }, { outputTokens: "12" }, { outputTokens: Infinity }])
      expect(staffingReportedTokens(usage, "outputTokens")).toBeNull();
    expect(staffingReportedTokens({ inputTokens: 12, outputTokens: 0 }, "inputTokens")).toBe(12);
    expect(staffingReportedTokens({ inputTokens: 12, outputTokens: 0 }, "outputTokens")).toBe(0);
  });
});
