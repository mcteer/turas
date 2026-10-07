import { wrapLanguageModel } from "ai";
import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
import { SUPPORT_ADVICE_LIMITS, supportSummaryToolSchema, supportActionsToolSchema,
  supportEvidenceToolSchema, supportSkillToolSchema, supportAdviceResultSchema } from "../../support/advice";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
export const supportReadSchemas = { support_summary: supportSummaryToolSchema, support_actions: supportActionsToolSchema,
  support_evidence: supportEvidenceToolSchema, load_skill: supportSkillToolSchema };

/** One wrapper per durably reserved paid step. Both SDK provider paths share the
 * same single-invocation fence; a retry cannot silently incur another paid call. */
export function wrapSupportModel(model: Model, governance?: { deadlineAt: Date; beforeProvider: () => Promise<void> }) {
  let invoked = false;
  const allowed = new Set(Object.keys(supportReadSchemas));
  return wrapLanguageModel({ model, middleware: {
    transformParams: async ({ params }) => {
      if (!governance) throw new HttpFailure(403, "support_step_unadmitted", "Durable support model admission required");
      if (invoked) throw new HttpFailure(409, "support_step_uncertain", "A model call may have run; no paid retry is allowed");
      const tools = params.tools?.filter(tool => tool.type === "function" && allowed.has(tool.name)).map(tool => {
        if (tool.type !== "function") return tool;
        const schema = tool.name === "load_skill" ? z.object({ skill: z.literal("tam-support-guidance") }).strict()
          : supportReadSchemas[tool.name as keyof typeof supportReadSchemas];
        return { ...tool, inputSchema: z.toJSONSchema(schema) };
      });
      const forced = params.toolChoice?.type === "tool" ? params.toolChoice.toolName : null;
      if (forced && (!allowed.has(forced) || !tools?.some(tool => tool.type === "function" && tool.name === forced)))
        throw new HttpFailure(403, "support_tool_denied", "Only bound support reads and procedure are available");
      invoked = true;
      params.abortSignal?.throwIfAborted();
      if (!(governance.deadlineAt instanceof Date) || !Number.isFinite(governance.deadlineAt.getTime()) || governance.deadlineAt.getTime() <= Date.now())
        throw new HttpFailure(409, "support_advice_expired", "Support advice deadline reached");
      await governance.beforeProvider();
      const remaining = governance.deadlineAt.getTime() - Date.now();
      if (remaining <= 0) throw new HttpFailure(409, "support_advice_expired", "Support advice deadline reached");
      const deadline = AbortSignal.timeout(Math.min(remaining, SUPPORT_ADVICE_LIMITS.deadlineMs));
      return { ...params, tools,
        responseFormat: { type: "json", name: "support_advice_v1", schema: z.toJSONSchema(supportAdviceResultSchema) },
        abortSignal: params.abortSignal ? AbortSignal.any([params.abortSignal, deadline]) : deadline,
        maxOutputTokens: Number.isSafeInteger(params.maxOutputTokens) && (params.maxOutputTokens ?? 0) > 0
          ? Math.min(params.maxOutputTokens!, SUPPORT_ADVICE_LIMITS.outputTokens) : SUPPORT_ADVICE_LIMITS.outputTokens };
    },
    wrapGenerate: async ({ doGenerate, params }) => { params.abortSignal?.throwIfAborted(); return doGenerate(); },
    wrapStream: async ({ doStream, params }) => { params.abortSignal?.throwIfAborted(); return doStream(); },
  } });
}
