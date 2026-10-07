export function recordSupportTelemetry(event: { operation: "read" | "write" | "review" | "model" | "cleanup";
  outcome: "committed" | "denied" | "failed" | "withheld"; correlationId?: string;
  durationMs: number; inputTokens?: number | null; outputTokens?: number | null }) {
  if (!Number.isFinite(event.durationMs) || event.durationMs < 0 || event.durationMs > 86400000) throw new Error("Invalid support timing");
  const token = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  console.info(JSON.stringify({ kind: "turas_support_metric", operation: event.operation, outcome: event.outcome,
    correlationId: event.correlationId && /^[A-Za-z0-9_-]{1,100}$/.test(event.correlationId) ? event.correlationId : null,
    durationMs: event.durationMs, inputTokens: token(event.inputTokens), outputTokens: token(event.outputTokens) }));
}
