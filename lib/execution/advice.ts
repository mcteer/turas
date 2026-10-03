import { z } from "zod";
import { HttpFailure } from "../contracts/http";
import { executionId, executionPeriodSchema, executionVersion } from "../server/execution/fields";

export const EXECUTION_ADVICE_LIMITS = { steps: 6, reads: 6, outputTokens: 4096, deadlineMs: 120000,
  contextBytes: 24576, dependencies: 200, hourlyAdmissions: 5 } as const;
export const executionAdvicePrompt = "Explain the reviewed delivery status, milestones, blockers, effort and handoff for this bound engagement and period. Cite the exact evidence, preserve unknowns, and suggest only human next steps.";
export const executionAdviceSchema = z.object({ requestKey: executionId, conversationId: executionId,
  expectedGeneration: executionVersion, from: executionPeriodSchema.shape.from, to: executionPeriodSchema.shape.to }).strict()
  .refine(input => executionPeriodSchema.safeParse({ from: input.from, to: input.to }).success, "Period must contain 1–91 dates");
export type ExecutionAdviceScope = { bindingId: string; conversationId: string; ownerMembershipId: string;
  customerId: string; engagementId: string; baselineId: string; generation: number; period: { from: string; to: string } };
export const executionRecordKinds = ["activity", "raid", "decision", "scope_change", "effort_budget", "estimate", "handoff", "closeout", "outcome"] as const;
export const executionReadSchemas = {
  execution_summary: z.object({}).strict(),
  execution_effort: z.object({}).strict(),
  execution_records: z.object({ kind: z.enum(executionRecordKinds).optional(), cursor: z.string().min(1).max(4096).optional(), limit: z.number().int().min(1).max(20).default(20) }).strict(),
  load_skill: z.object({ skill: z.literal("execution-explanation") }).strict(),
};
export type ExecutionReadTool = keyof typeof executionReadSchemas;
export function executionToolInput(tool: string, input: unknown) {
  if (!Object.hasOwn(executionReadSchemas, tool)) throw new HttpFailure(403, "execution_tool_denied", "Only the bound execution reads and procedure are available");
  const parsed = executionReadSchemas[tool as ExecutionReadTool].safeParse(input);
  if (!parsed.success) throw new HttpFailure(400, "invalid_input", "Invalid execution tool input");
  return parsed.data;
}
export function executionContextCharge(current: { contextBytes: number; readCalls: number; dependencyCount: number },
  charge: { bytes: number; read: boolean; dependencyCount: number }) {
  if (![...Object.values(current), charge.bytes, charge.dependencyCount].every(n => Number.isSafeInteger(n) && n >= 0) ||
    typeof charge.read !== "boolean" || charge.dependencyCount < current.dependencyCount) throw new HttpFailure(409, "execution_context_changed", "Execution explanation context changed");
  const next = { contextBytes: current.contextBytes + charge.bytes, readCalls: current.readCalls + Number(charge.read), dependencyCount: charge.dependencyCount };
  if (next.contextBytes > EXECUTION_ADVICE_LIMITS.contextBytes || next.readCalls > EXECUTION_ADVICE_LIMITS.reads || next.dependencyCount > EXECUTION_ADVICE_LIMITS.dependencies)
    throw new HttpFailure(429, "execution_context_budget", "Execution explanation context limit reached");
  return next;
}
export function assertExecutionStepLimits(input: { turnId: string; stepIndex: number; stepsAdmitted: number; deadlineAt: Date }, now = Date.now()) {
  if (!Number.isSafeInteger(input.stepIndex) || input.stepIndex < 0 || input.stepIndex >= EXECUTION_ADVICE_LIMITS.steps ||
    !Number.isSafeInteger(input.stepsAdmitted) || input.stepsAdmitted !== input.stepIndex || !input.turnId || input.turnId.length > 180)
    throw new HttpFailure(429, "execution_step_budget", "Execution explanation model limit reached");
  if (!Number.isFinite(now) || !(input.deadlineAt instanceof Date) || !Number.isFinite(input.deadlineAt.getTime()) || input.deadlineAt.getTime() <= now)
    throw new HttpFailure(409, "execution_advice_expired", "Execution explanation deadline reached");
}
