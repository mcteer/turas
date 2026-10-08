import {failExpansionModel} from "./model-failure";
import { wrapLanguageModel } from "ai";
import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
import { EXPANSION_ADVICE_LIMITS, expansionSummaryToolSchema, expansionHypothesesToolSchema,
  expansionEvidenceToolSchema, expansionSkillToolSchema, expansionAdviceResultSchema } from "../../expansion/advice";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
export const expansionReadSchemas = { expansion_summary: expansionSummaryToolSchema, expansion_hypotheses: expansionHypothesesToolSchema,
  expansion_evidence: expansionEvidenceToolSchema, load_skill: expansionSkillToolSchema };

/** One wrapper per durably reserved paid step. Both SDK provider paths share the
 * same single-invocation fence; a retry cannot silently incur another paid call. */
export function wrapExpansionModel(model: Model, governance?: { deadlineAt: Date; beforeProvider: () => Promise<void> }) {
  let invoked = false;
  let observedUsage: {inputTokens?: number; outputTokens?: number} = {};
  const fail = async (error: unknown) => {
    if (governance) await failExpansionModel(governance.deadlineAt, {
      code: error instanceof HttpFailure ? error.code : "invalid_native_step", ...observedUsage,
    });
  };
  const assertOutputUsage = (usage: { inputTokens: { total: number | undefined }; outputTokens: { total: number | undefined } }) => {
    const total = usage.outputTokens.total;
    const input = usage.inputTokens.total;
    observedUsage = {
      ...(Number.isSafeInteger(input) && input !== undefined && input >= 0 ? {inputTokens: input} : {}),
      ...(Number.isSafeInteger(total) && total !== undefined && total >= 0 ? {outputTokens: total} : {}),
    };
    if (!Number.isSafeInteger(total) || total === undefined || total < 0 || total > EXPANSION_ADVICE_LIMITS.outputTokens)
      throw new HttpFailure(429, "expansion_output_budget", "Actual expansion output usage exceeds its limit or is unknown");
  };
  const allowed = new Set(Object.keys(expansionReadSchemas));
  const assertToolCall=(name:string,input:unknown)=>{
    if(!allowed.has(name))throw new HttpFailure(403,'expansion_tool_denied','Forbidden expansion tool');
    let value=input;if(typeof value==='string')try{value=JSON.parse(value);}catch{throw new HttpFailure(422,'invalid_tool_input','Malformed expansion tool input');}
    const schema=name==='load_skill'?z.object({skill:z.literal('product-expansion')}).strict():expansionReadSchemas[name as keyof typeof expansionReadSchemas];
    if(!schema.safeParse(value).success)throw new HttpFailure(422,'invalid_tool_input','Malformed expansion tool input');
  };
  return wrapLanguageModel({ model, middleware: {
    transformParams: async ({ params }) => {
      if (!governance) throw new HttpFailure(403, "expansion_step_unadmitted", "Durable expansion model admission required");
      if (invoked) throw new HttpFailure(409, "expansion_step_uncertain", "A model call may have run; no paid retry is allowed");
      invoked=true;
      try {
      const tools = params.tools?.filter(tool => tool.type === "function" && allowed.has(tool.name)).map(tool => {
        if (tool.type !== "function") return tool;
        const schema = tool.name === "load_skill" ? z.object({ skill: z.literal("product-expansion") }).strict()
          : expansionReadSchemas[tool.name as keyof typeof expansionReadSchemas];
        return { ...tool, inputSchema: z.toJSONSchema(schema) };
      });
      const forced = params.toolChoice?.type === "tool" ? params.toolChoice.toolName : null;
      if (forced && (!allowed.has(forced) || !tools?.some(tool => tool.type === "function" && tool.name === forced)))
        throw new HttpFailure(403, "expansion_tool_denied", "Only bound expansion reads and procedure are available");
      const promptBytes = Buffer.byteLength(JSON.stringify(params.prompt), "utf8");
      if (promptBytes > EXPANSION_ADVICE_LIMITS.contextBytes)
        throw new HttpFailure(429, "expansion_context_budget", "Narrow expansion advice context");
      params.abortSignal?.throwIfAborted();
      if (!(governance.deadlineAt instanceof Date) || !Number.isFinite(governance.deadlineAt.getTime()) || governance.deadlineAt.getTime() <= Date.now())
        throw new HttpFailure(409, "expansion_advice_expired", "Expansion advice deadline reached");
      await governance.beforeProvider();
      const remaining = governance.deadlineAt.getTime() - Date.now();
      if (remaining <= 0) throw new HttpFailure(409, "expansion_advice_expired", "Expansion advice deadline reached");
      const deadline = AbortSignal.timeout(Math.min(remaining, EXPANSION_ADVICE_LIMITS.deadlineMs));
      return { ...params, tools,
        responseFormat: { type: "json", name: "expansion_advice_v1", schema: z.toJSONSchema(expansionAdviceResultSchema) },
        abortSignal: params.abortSignal ? AbortSignal.any([params.abortSignal, deadline]) : deadline,
        maxOutputTokens: Number.isSafeInteger(params.maxOutputTokens) && (params.maxOutputTokens ?? 0) > 0
          ? Math.min(params.maxOutputTokens!, EXPANSION_ADVICE_LIMITS.requestedOutputTokens) : EXPANSION_ADVICE_LIMITS.requestedOutputTokens };
      } catch(error){await fail(error);throw error;}
    },
    wrapGenerate: async ({doGenerate,params})=>{try{params.abortSignal?.throwIfAborted();const result=await doGenerate();assertOutputUsage(result.usage);for(const item of result.content)if(item.type==='tool-call')assertToolCall(item.toolName,item.input);return result;}catch(error){if(governance)await fail(error);throw error;}},
    wrapStream: async ({doStream,params})=>{try{params.abortSignal?.throwIfAborted();const result=await doStream();let finished=false;return {...result,stream:result.stream.pipeThrough(new TransformStream({async transform(chunk,controller){try{if(chunk.type==='finish'){assertOutputUsage(chunk.usage);finished=true;}if(chunk.type==='tool-input-start'&&!allowed.has(chunk.toolName))throw new HttpFailure(403,'expansion_tool_denied','Forbidden expansion tool');if(chunk.type==='tool-call')assertToolCall(chunk.toolName,chunk.input);controller.enqueue(chunk);}catch(error){await fail(error);controller.error(error);}},async flush(){if(!finished){const error=new HttpFailure(429,'expansion_output_budget','Actual expansion output usage is unknown');await fail(error);throw error;}}}))};}catch(error){if(governance)await fail(error);throw error;}},
  } });
}
