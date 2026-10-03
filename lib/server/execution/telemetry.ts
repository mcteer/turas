import { z } from "zod";
const eventSchema = z.object({ operation: z.enum(["admission", "read", "model", "release", "cleanup"]), outcome: z.enum(["committed", "denied", "failed", "unconfirmed"]),
  durationMs: z.number().finite().min(0).max(86400000), inputTokens: z.number().int().nonnegative().safe().nullable().optional(), outputTokens: z.number().int().nonnegative().safe().nullable().optional() }).strict();
export function recordExecutionTelemetry(raw: unknown) {
  const value = eventSchema.parse(raw);
  if (process.env.NODE_ENV !== "test") console.info(JSON.stringify({ operation: `execution.${value.operation}`, outcome: value.outcome,
    durationMs: value.durationMs, inputTokens: value.inputTokens, outputTokens: value.outputTokens }));
  return value;
}
