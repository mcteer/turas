import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { hiddenRecord } from "../../contracts/http";
import { readCurrentAttemptContext } from "./attempt-context";
import { readCurrentArtifactDraft } from "../artifacts/context";
import { planningScopeForConversation,type PlanningScope } from "../plans/context";

type ToolPrincipal = { principalId?: string; attributes?: Record<string, unknown> } | null | undefined;

export async function boundToolActor(client: PoolClient, principal: ToolPrincipal): Promise<{
  actor: CurrentSession; customerId: string; generation: string; attemptId: string;
  planning:PlanningScope|null;
}> {
  const attemptId = principal?.attributes?.turasAttemptId;
  if (!principal?.principalId || typeof attemptId !== "string") throw hiddenRecord();
  await readCurrentAttemptContext(client, attemptId, principal.principalId);
  const artifact = await readCurrentArtifactDraft(client,attemptId,principal.principalId);
  if (artifact) {
    const injected = await client.query(`SELECT 1 FROM artifact_context_injection_receipts
      WHERE attempt_id=$1 AND injection_digest=$2 LIMIT 1`, [attemptId,artifact.digest]);
    if (!injected.rowCount) throw hiddenRecord();
  }
  const result = await client.query<{ customer_id: string; generation: string;
    login_session_id: string; membership_id: string; workspace_id: string;
    owner_principal_id: string; expires_at: Date; login_name: string; display_name: string;
    conversation_id:string;
    kind: "internal" | "partner"; role: "admin" | "member" }>(`
    SELECT r.customer_id,r.generation,r.login_session_id,r.membership_id,r.workspace_id,
      r.conversation_id,
      r.owner_principal_id,s.expires_at,p.login_name,p.display_name,m.kind,m.role
    FROM context_snapshot_receipts r
    JOIN login_sessions s ON s.id=r.login_session_id
    JOIN principals p ON p.id=r.owner_principal_id
    JOIN memberships m ON m.id=r.membership_id
    WHERE r.attempt_id=$1 AND r.owner_principal_id=$2`, [attemptId, principal.principalId]);
  const row = result.rows[0];
  if (!row) throw hiddenRecord();
  const planning=await planningScopeForConversation(client,row.conversation_id);
  if (planning && (planning.ownerMembershipId!==row.membership_id ||
      planning.customerId!==row.customer_id)) throw hiddenRecord();
  return { attemptId, customerId: row.customer_id, generation: row.generation,
    planning,
    actor: { sessionId: row.login_session_id, token: "", expiresAt: row.expires_at,
      principalId: row.owner_principal_id, membershipId: row.membership_id,
      workspaceId: row.workspace_id, loginName: row.login_name, displayName: row.display_name,
      kind: row.kind, role: row.role } };
}
