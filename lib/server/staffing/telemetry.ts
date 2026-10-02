import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
const operationSchema = z.enum(["command", "registry", "import", "competency_review", "source_lifecycle", "calendar",
  "demand", "matching", "allocation", "finance", "advisory", "model", "cleanup", "read"]);
const conflictSchema = z.enum(["version_conflict", "request_key_conflict", "preview_expired", "baseline_changed", "source_changed", "capacity_conflict", "demand_conflict"]);
const recordSchema = z.object({ operation: operationSchema,
  outcome: z.enum(["validated", "committed", "reused_receipt", "conflict", "denied", "failed", "excluded"]),
  durationMs: z.number().finite().min(0).max(86_400_000), count: z.number().int().min(0).max(1_000_000).optional(),
  conflict: conflictSchema.optional(), inputTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  outputTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
}).strict();
export type StaffingTelemetryInput = z.infer<typeof recordSchema>;
export function staffingTelemetryRecord(input: unknown) { return { kind: "turas_staffing_operation" as const, ...recordSchema.parse(input) }; }
/** Observability cannot change the transaction result. No error object or
 * request-derived string is ever passed to this sink. */
export function recordStaffingTelemetry(input: StaffingTelemetryInput): void {
  try { console.info(JSON.stringify(staffingTelemetryRecord(input))); } catch { /* bounded sink failure */ }
}
const commands: Record<string, z.infer<typeof operationSchema>> = {
  advisory_prepare: "advisory",
  resource_create: "registry", resource_revise: "registry", resource_eligibility: "registry", skill_create: "registry", skill_revise: "registry",
  import_start: "import", import_complete: "import", import_map: "import", import_cancel: "source_lifecycle", import_withdraw: "source_lifecycle",
  competency_manual: "competency_review", competency_correct: "competency_review", competency_decide: "competency_review", manual_withdraw: "source_lifecycle",
  finance_input_create: "finance", finance_input_revise: "finance", finance_policy_approve: "finance", finance_scenario_create: "finance",
  allocation_propose: "allocation", allocation_revise: "allocation", allocation_cancel_proposal: "allocation", allocation_reserve: "allocation",
  allocation_review_preview: "allocation", confirm: "allocation", amend: "allocation", release: "allocation", cancel: "allocation",
  calendar_approve: "calendar",
  matching_create: "matching",
  demand_create: "demand", demand_revise: "demand", demand_qualify: "demand", demand_cancel: "demand",
};
export const staffingCommandOperation = (action: string): z.infer<typeof operationSchema> => Object.hasOwn(commands, action) ? commands[action] : "command";
export function staffingConflictCategory(rawCode: unknown): z.infer<typeof conflictSchema> | null {
  const result = conflictSchema.safeParse(rawCode); return result.success ? result.data : null;
}

/** Emit only after the governed operation settles. Caller-owned transactions
 * report validated rather than claiming an outer commit. No result, request,
 * database error or finance-dependent count is passed to the logger. */
export async function observeStaffingRead<T>(run: () => Promise<T>, callerOwnsTransaction = false): Promise<T> {
  const started = performance.now();
  try {
    const result = await run();
    recordStaffingTelemetry({ operation: "read", outcome: callerOwnsTransaction ? "validated" : "committed",
      durationMs: Math.min(86_400_000, Math.max(0, performance.now() - started)) });
    return result;
  } catch (error) {
    const conflict = error instanceof HttpFailure ? staffingConflictCategory(error.code) : null;
    recordStaffingTelemetry({ operation: "read", outcome: error instanceof HttpFailure && [401, 403, 404].includes(error.status)
      ? "denied" : conflict ? "conflict" : "failed",
      ...(conflict ? { conflict } : {}), durationMs: Math.min(86_400_000, Math.max(0, performance.now() - started)) });
    throw error;
  }
}
