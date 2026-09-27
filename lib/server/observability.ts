export type OperationalEvent = {
  action: string;
  outcome: "allowed" | "denied" | "failed";
  correlationId: string;
  actorId?: string;
  workspaceId?: string;
  customerId?: string;
  errorCode?: string;
};

export function recordOperationalEvent(event: OperationalEvent): void {
  const { action, outcome, correlationId, actorId, workspaceId, customerId, errorCode } = event;
  console.info(JSON.stringify({
    kind: "turas_operation",
    action,
    outcome,
    correlationId,
    actorId,
    workspaceId,
    customerId,
    errorCode,
    at: new Date().toISOString(),
  }));
}
