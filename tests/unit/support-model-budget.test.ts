import { describe, expect, it, vi } from "vitest";
import type { wrapLanguageModel } from "ai";
import { z } from "zod";
import { supportAdviceResultSchema, validateSupportAdviceResult } from "../../lib/support/advice";
import { wrapSupportModel } from "../../lib/server/support/model-budget";
import { supportProviderSchema } from "../../lib/server/support/provider-schema";
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
    const call = (path === "doGenerate" ? p.generate : p.stream).mock.calls[0] as unknown as [{ responseFormat: { type: string; name: string; schema: any } }];
    const raw = z.toJSONSchema(supportAdviceResultSchema), before = JSON.stringify(raw), wire = call[0].responseFormat.schema;
    expect(call[0].responseFormat.type).toBe("json"); expect(call[0].responseFormat.name).toBe("support_advice_v1");
    function check(node: any) {
      if (!node || typeof node !== "object") return;
      for (const key of ["minLength", "maxLength", "minimum", "maximum", "maxItems", "not", "oneOf"]) expect(node).not.toHaveProperty(key);
      if (node.type === "object") expect(node.additionalProperties).toBe(false);
      for (const value of Object.values(node)) check(value);
    }
    check(wire);
    expect(wire.required).toEqual(raw.required);
    expect(wire.properties.summary.description).toContain('"maxLength":2000');
    expect(wire.properties.facts.items.properties.citationKeys.items.format).toBe("uuid");
    const content = wire.properties.actionSuggestions.items.properties.content;
    expect(content.properties.disposition.const).toBe("open");
    expect(content.properties.owner.anyOf.map((branch: any) => branch.properties.kind.const)).toEqual(["membership", "customer_role", "unassigned"]);
    for (const key of ["handoff", "completedDate", "basedOnAssessmentRevisionId"]) expect(content.properties).not.toHaveProperty(key);
    expect(JSON.stringify(raw)).toBe(before);
    // The grammar projection does not replace server-side shape, authority or
    // temporal validation, even for fields the provider cannot constrain.
    const valid = { contractVersion: "support-advice-v1", summary: "Reviewed scope", facts: [], unknowns: [], actionSuggestions: [] };
    expect(() => validateSupportAdviceResult(valid, [])).not.toThrow();
    for (const invalid of [{ ...valid, summary: "" }, { ...valid, summary: "x".repeat(2001) }, { ...valid, unknowns: Array(21).fill("Unknown") },
      { ...valid, facts: [{ statement: "Unsupported", citationKeys: [] }] },
      { ...valid, facts: [{ statement: "Invalid identity", citationKeys: ["not-a-uuid"] }] },
      { ...valid, facts: [{ statement: "Unavailable source", citationKeys: ["00000000-0000-4000-8000-000000000111"] }] }])
      expect(() => validateSupportAdviceResult(invalid, [])).toThrow();
    const suggestion = { content: { contractVersion: "support-v1", title: "Review", observationDate: "2026-01-01", nextReviewDate: "2026-01-02", timezone: "UTC",
      desiredOutcome: "Known readiness", rationale: "Check sources", validationCriterion: "Reviewed result", priority: "normal", owner: { kind: "unassigned", reason: "Owner unknown" }, disposition: "open", outcomeSourceKeys: [] }, citationKeys: [] };
    expect(() => validateSupportAdviceResult({ ...valid, actionSuggestions: [suggestion] }, [])).not.toThrow();
    for (const [key, value] of [["handoff", {}], ["completedDate", "2026-01-01"], ["basedOnAssessmentRevisionId", "00000000-0000-4000-8000-000000000111"], ["observationDate", "2026-02-30"]])
      expect(() => validateSupportAdviceResult({ ...valid, actionSuggestions: [{ ...suggestion, content: { ...suggestion.content, [key as string]: value } }] }, [])).toThrow();
    expect(beforeProvider).toHaveBeenCalledTimes(1);
    await expect(wrapped.doGenerate({ prompt: [] })).rejects.toMatchObject({ code: "support_step_uncertain" });
    expect(p.generate.mock.calls.length + p.stream.mock.calls.length).toBe(1);
  });
  it("preserves structural constraints and supported formats while projecting provider-only limits", () => {
    const raw = { type: "object", additionalProperties: false, required: ["identity", "day", "values", "kind"], properties: {
      identity: { type: "string", format: "uuid", pattern: "^(?!forbidden).+$", minLength: 1, maxLength: 36 },
      day: { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      values: { type: "array", minItems: 1, maxItems: 2, items: { $ref: "#/$defs/item" } },
      many: { type: "array", minItems: 2, items: { type: "number", minimum: 1, maximum: 5 } },
      kind: { type: "string", enum: ["first", "second"] }, forbidden: { not: {} },
    }, $defs: { item: { type: "object", additionalProperties: false, required: ["tag"], properties: { tag: { const: "fixed", type: "string" } } } } };
    const before = structuredClone(raw), wire = supportProviderSchema(raw) as any;
    expect(raw).toEqual(before); expect(wire.required).toEqual(raw.required); expect(wire.additionalProperties).toBe(false);
    expect(wire.properties.kind.enum).toEqual(["first", "second"]); expect(wire.$defs.item.properties.tag.const).toBe("fixed");
    expect(wire.properties.identity.format).toBe("uuid"); expect(wire.properties.identity).not.toHaveProperty("pattern");
    expect(wire.properties.identity.description).toContain("pattern");
    for (const pattern of ["^(?=value)value$", "(?<=x)y", "(x)\\1", "\\bword\\b", "x{1,10000}"]) {
      const projected = supportProviderSchema({ type: "string", pattern }) as any;
      expect(projected).not.toHaveProperty("pattern"); expect(projected.description).toContain("pattern");
    }
    expect(wire.properties.day).toEqual(raw.properties.day);
    expect(wire.properties.values.minItems).toBe(1); expect(wire.properties.values.items.$ref).toBe("#/$defs/item");
    expect(wire.properties.many).not.toHaveProperty("minItems"); expect(wire.properties.many.items).not.toHaveProperty("minimum");
    expect(wire.properties).not.toHaveProperty("forbidden");
    expect(() => supportProviderSchema({ ...raw, required: [...raw.required, "forbidden"] })).toThrow("forbidden property");
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
