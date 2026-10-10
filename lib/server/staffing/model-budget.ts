import { wrapExecutionModel } from "../execution/model-budget";
import { wrapLearningModel } from '../learning/model-budget';
import { wrapExpansionModel } from "../expansion/model-budget";
import { wrapSupportModel } from "../support/model-budget";
import { wrapLanguageModel } from "ai";
import { STAFFING_LIMITS } from "../../contracts/staffing";
import { HttpFailure } from "../../contracts/http";
type Model = Parameters<typeof wrapLanguageModel>[0]["model"];

/** Arithmetic for locked persisted context counters. Callers must reserve before
 * content release and use an exact dependency union, never a truncation estimate. */
export function staffingContextCharge(current: { contextBytes: number; readCalls: number; dependencyCount: number },
  charge: { bytes: number; read: boolean; dependencyCount: number }) {
  if (![current.contextBytes, current.readCalls, current.dependencyCount, charge.bytes, charge.dependencyCount]
    .every(value => Number.isSafeInteger(value) && value >= 0) || typeof charge.read !== "boolean" || charge.dependencyCount < current.dependencyCount) {
    throw new HttpFailure(409, "staffing_context_changed", "Staffing explanation context is unavailable");
  }
  const next = { contextBytes: current.contextBytes + charge.bytes, readCalls: current.readCalls + Number(charge.read), dependencyCount: charge.dependencyCount };
  if (!Number.isSafeInteger(next.contextBytes) || next.contextBytes > STAFFING_LIMITS.advisoryContextBytes ||
    next.readCalls > STAFFING_LIMITS.advisoryReads || next.dependencyCount > STAFFING_LIMITS.advisoryDependencies) {
    throw new HttpFailure(429, "staffing_context_budget", "Staffing explanation context limit reached");
  }
  return next;
}

/** Both provider paths receive a finite output limit. Durable admission and
 * current dependency fencing must run before calling this wrapped model. */
export function wrapStaffingModel(model: Model, mode: "operational" | "finance" | "execution" | "support" | "expansion" | 'learning' = "operational",
  governance?: { deadlineAt: Date; beforeProvider: () => Promise<void> }): ReturnType<typeof wrapLanguageModel> {
  if(mode==='learning')return wrapLearningModel(model,governance);
  if (mode === "execution") return wrapExecutionModel(model, governance);
  if (mode === "expansion") return wrapExpansionModel(model, governance);
  if (mode === "support") return wrapSupportModel(model, governance);
  // One wrapper is created for one durably admitted step. SDK retries cannot
  // make a second generate/stream call after the first may have reached billing.
  let invoked = false;
  const claim = () => {
    if (invoked) throw new HttpFailure(409, "staffing_step_uncertain", "A model call may have run; no paid retry is allowed");
    invoked = true;
  };
  const allowed = new Set(["read_staffing_demand", "match_staffing_resources", "read_staffing_capacity", "load_skill"]);
  if (mode === "finance") allowed.add("read_staffing_scenario");
  return wrapLanguageModel({ model, middleware: {
    transformParams: async ({ params }) => {
      const tools = params.tools?.filter(tool => tool.type === "function" && allowed.has(tool.name));
      const forcedTool = params.toolChoice?.type === "tool" ? params.toolChoice.toolName : null;
      if (forcedTool && (!allowed.has(forcedTool) || !tools?.some(tool => tool.type === "function" && tool.name === forcedTool))) {
        throw new HttpFailure(403, "staffing_tool_denied", "Only the bound staffing reads and procedure are available");
      }
      claim();
      if (governance) {
        if (!(governance.deadlineAt instanceof Date) || !Number.isFinite(governance.deadlineAt.getTime()) ||
          governance.deadlineAt.getTime() <= Date.now()) {
          throw new HttpFailure(409, "staffing_advisory_expired", "Staffing advisory deadline reached");
        }
        params.abortSignal?.throwIfAborted();
        // The paid receipt already exists. Recheck current sources and cancel
        // state immediately before IO; never reserve another paid step here.
        await governance.beforeProvider();
      }
      const remaining = governance ? governance.deadlineAt.getTime() - Date.now() : null;
      if (remaining !== null && remaining <= 0) throw new HttpFailure(409, "staffing_advisory_expired", "Staffing advisory deadline reached");
      params.abortSignal?.throwIfAborted();
      const deadlineSignal = remaining === null ? undefined : AbortSignal.timeout(Math.min(remaining, STAFFING_LIMITS.advisoryDeadlineMilliseconds));
      return { ...params, tools, abortSignal: deadlineSignal
        ? params.abortSignal ? AbortSignal.any([params.abortSignal, deadlineSignal]) : deadlineSignal : params.abortSignal,
        maxOutputTokens: Number.isSafeInteger(params.maxOutputTokens) && (params.maxOutputTokens ?? 0) > 0
          ? Math.min(params.maxOutputTokens!, STAFFING_LIMITS.advisoryOutputTokens) : STAFFING_LIMITS.advisoryOutputTokens };
    },
    wrapGenerate: async ({ doGenerate, params }) => { params.abortSignal?.throwIfAborted(); return doGenerate(); },
    wrapStream: async ({ doStream, params }) => { params.abortSignal?.throwIfAborted(); return doStream(); },
  } });
}

/** Validation of already locked persisted attempt values, not an admission
 * reservation. The caller must append a unique step receipt before provider IO. */
export function assertStaffingStepLimits(input: { turnId: string; stepIndex: number; stepsAdmitted: number; deadlineAt: Date }, now = Date.now()): void {
  if (!Number.isSafeInteger(input.stepIndex) || input.stepIndex < 0 || input.stepIndex >= STAFFING_LIMITS.advisorySteps ||
    !Number.isSafeInteger(input.stepsAdmitted) || input.stepsAdmitted < 0 || input.stepsAdmitted >= STAFFING_LIMITS.advisorySteps ||
    !input.turnId || input.turnId.length > 200) throw new HttpFailure(429, "staffing_step_budget", "Staffing advisory model limit reached");
  if (!Number.isFinite(now) || !(input.deadlineAt instanceof Date) || !Number.isFinite(input.deadlineAt.getTime()) || input.deadlineAt.getTime() <= now) {
    throw new HttpFailure(409, "staffing_advisory_expired", "Staffing advisory deadline reached");
  }
}

/** Native event-reported token counts only; missing counts remain unknown. */
export function staffingReportedTokens(usage: unknown, key: "inputTokens" | "outputTokens"): number | null {
  if (typeof usage !== "object" || usage === null || !(key in usage)) return null;
  const value = (usage as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
