import { wrapLanguageModel } from "ai";
import { HttpFailure } from "../../contracts/http";
import { EXECUTION_ADVICE_LIMITS, executionReadSchemas } from "../../execution/advice";
type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
export function wrapExecutionModel(model: Model, governance?: { deadlineAt: Date; beforeProvider: () => Promise<void> }) {
  let invoked = false;
  const allowed = new Set(Object.keys(executionReadSchemas));
  return wrapLanguageModel({ model, middleware: {
    transformParams: async ({ params }) => {
      if (!governance) throw new HttpFailure(403, "execution_step_unadmitted", "Durable execution model admission required");
      if (invoked) throw new HttpFailure(409, "execution_step_uncertain", "A model call may have run; no paid retry is allowed");
      const tools = params.tools?.filter(t => t.type === "function" && allowed.has(t.name));
      if (params.toolChoice?.type === "tool" && (!allowed.has(params.toolChoice.toolName) || !tools?.some(t => t.type === "function" && params.toolChoice?.type === "tool" && t.name === params.toolChoice.toolName)))
        throw new HttpFailure(403, "execution_tool_denied", "Only the bound execution reads and procedure are available");
      invoked = true; params.abortSignal?.throwIfAborted();
      if (!(governance.deadlineAt instanceof Date) || !Number.isFinite(governance.deadlineAt.getTime()) || governance.deadlineAt.getTime() <= Date.now())
        throw new HttpFailure(409, "execution_advice_expired", "Execution explanation deadline reached");
      await governance.beforeProvider();
      const remaining = governance.deadlineAt.getTime() - Date.now();
      if (remaining <= 0) throw new HttpFailure(409, "execution_advice_expired", "Execution explanation deadline reached");
      const deadlineSignal = AbortSignal.timeout(Math.min(remaining, EXECUTION_ADVICE_LIMITS.deadlineMs));
      return { ...params, tools, abortSignal: params.abortSignal ? AbortSignal.any([params.abortSignal, deadlineSignal]) : deadlineSignal,
        maxOutputTokens: Number.isSafeInteger(params.maxOutputTokens) && (params.maxOutputTokens ?? 0) > 0
          ? Math.min(params.maxOutputTokens!, EXECUTION_ADVICE_LIMITS.outputTokens) : EXECUTION_ADVICE_LIMITS.outputTokens };
    },
    wrapGenerate: async ({ doGenerate, params }) => { params.abortSignal?.throwIfAborted(); return doGenerate(); },
    wrapStream: async ({ doStream, params }) => { params.abortSignal?.throwIfAborted(); return doStream(); },
  } });
}
export function executionReportedTokens(usage: unknown, key: "inputTokens" | "outputTokens"): number | null {
  if (!usage || typeof usage !== "object" || !(key in usage)) return null;
  const value = (usage as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
