import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type AuditInput = {
  actorPrincipalId?: string;
  actorSessionId?: string;
  workspaceId?: string;
  customerId?: string;
  subjectId?: string;
  action: string;
  outcome: string;
  correlationId?: string;
};

export async function appendAccessAudit(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(`
    INSERT INTO access_audit
      (id, actor_principal_id, actor_session_id, workspace_id, customer_id,
       subject_id, action, outcome, correlation_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    randomUUID(), input.actorPrincipalId ?? null, input.actorSessionId ?? null,
    input.workspaceId ?? null, input.customerId ?? null, input.subjectId ?? null,
    input.action, input.outcome, input.correlationId ?? randomUUID(),
  ]);
}
