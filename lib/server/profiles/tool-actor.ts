import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { hiddenRecord } from "../../contracts/http";
import { readCurrentAttemptContext } from "./attempt-context";

type ToolPrincipal = { principalId?: string; attributes?: Record<string, unknown> } | null | undefined;

export async function boundToolActor(client: PoolClient, principal: ToolPrincipal): Promise<{
  actor: CurrentSession; customerId: string; generation: string; attemptId: string;
}> {
  const attemptId = principal?.attributes?.turasAttemptId;
  if (!principal?.principalId || typeof attemptId !== "string") throw hiddenRecord();
  await readCurrentAttemptContext(client, attemptId, principal.principalId);
  const result = await client.query<{ customer_id: string; generation: string;
    login_session_id: string; membership_id: string; workspace_id: string;
    owner_principal_id: string; expires_at: Date; login_name: string; display_name: string;
    kind: "internal" | "partner"; role: "admin" | "member" }>(`
    SELECT r.customer_id,r.generation,r.login_session_id,r.membership_id,r.workspace_id,
      r.owner_principal_id,s.expires_at,p.login_name,p.display_name,m.kind,m.role
    FROM context_snapshot_receipts r
    JOIN login_sessions s ON s.id=r.login_session_id
    JOIN principals p ON p.id=r.owner_principal_id
    JOIN memberships m ON m.id=r.membership_id
    WHERE r.attempt_id=$1 AND r.owner_principal_id=$2`, [attemptId, principal.principalId]);
  const row = result.rows[0];
  if (!row) throw hiddenRecord();
  return { attemptId, customerId: row.customer_id, generation: row.generation,
    actor: { sessionId: row.login_session_id, token: "", expiresAt: row.expires_at,
      principalId: row.owner_principal_id, membershipId: row.membership_id,
      workspaceId: row.workspace_id, loginName: row.login_name, displayName: row.display_name,
      kind: row.kind, role: row.role } };
}
