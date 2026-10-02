/** Classify real captured metadata only. A durable stop does not establish that
 * the native provider stopped; unresolved completion stays explicitly unknown. */
export function staffingLiveCancellationOutcome(input: {
  adviceState: string; responseState: string | null; reconciliation: string;
  nativeTerminalCount: number; paidReceiptsUnchanged: boolean;
}) {
  if (input.adviceState !== "cancelled" || !input.paidReceiptsUnchanged ||
      !Number.isSafeInteger(input.nativeTerminalCount) || input.nativeTerminalCount < 0)
    throw new Error("Owned cancellation evidence is inconsistent");
  if (input.nativeTerminalCount > 0 && ["cancelled", "failed", "completed"].includes(input.responseState ?? "") &&
      input.reconciliation === "settled")
    return { state: "cancelled" as const, terminalSource: "native-projection" as const };
  if (input.nativeTerminalCount === 0 && input.responseState === "stopping" && input.reconciliation === "retry")
    return { state: "unconfirmed" as const, terminalSource: "durable-reconciliation" as const };
  throw new Error("Owned cancellation has no consistent terminal or uncertain reconciliation");
}
