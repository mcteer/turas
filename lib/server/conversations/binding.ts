import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import type { ConversationReference } from "../../contracts/conversations";
import { getOwnedConversation } from "./repository";

type BindingRow = {
  id: string;
  customer_id: string;
  creation_operation_id: string;
  binding_state: ConversationReference["bindingState"];
  eve_session_id: string | null;
  binding_attempts: number;
  binding_started_at: Date | null;
  binding_claim_token: string | null;
  binding_claim_expires_at: Date | null;
};

export async function lockOwnedBinding(client: PoolClient, session: CurrentSession, id: string): Promise<BindingRow> {
  const result = await client.query<BindingRow>(`
    SELECT c.* FROM conversations c WHERE c.id = $1 AND c.owner_principal_id = $2
      AND c.workspace_id = $3 AND c.environment_id = $4 FOR UPDATE
  `, [id, session.principalId, session.workspaceId, getServerConfig().TURAS_ENVIRONMENT_ID]);
  const row = result.rows[0];
  if (!row) throw hiddenRecord();
  const identity = await client.query(`
    SELECT 1 FROM login_sessions ls
    JOIN principals p ON p.id = ls.principal_id
    JOIN memberships m ON m.id = $2 AND m.principal_id = p.id
    JOIN workspaces w ON w.id = m.workspace_id
    LEFT JOIN partner_organizations o ON o.id = m.partner_org_id AND o.workspace_id = m.workspace_id
    WHERE ls.id = $1 AND ls.revoked_at IS NULL AND ls.expires_at > now()
      AND p.id = $3 AND p.active AND m.active AND w.active AND m.workspace_id = $4
      AND (m.kind = 'internal' OR o.active)
    FOR SHARE OF ls, p, m, w
  `, [session.sessionId, session.membershipId, session.principalId, session.workspaceId]);
  if (!identity.rowCount) throw hiddenRecord();
  if (session.kind === "partner") {
    const grant = await client.query(`SELECT 1 FROM customer_grants
      WHERE membership_id = $1 AND customer_id = $2 AND state = 'active' FOR SHARE`,
    [session.membershipId, row.customer_id]);
    if (!grant.rowCount) throw hiddenRecord();
  }
  return row;
}

export type BindingClaim =
  | { state: "bound"; eveSessionId: string }
  | { state: "pending" }
  | { state: "claimed"; claimToken: string; operationId: string };

export async function claimBinding(
  session: CurrentSession, id: string, operationId: string, now = new Date(),
): Promise<BindingClaim> {
  const decision = await withTransaction(async (client) => {
    const row = await lockOwnedBinding(client, session, id);
    if (row.creation_operation_id !== operationId) throw new HttpFailure(409, "operation_conflict", "Operation mismatch");
    if (row.binding_state === "bound" && row.eve_session_id) {
      return { state: "bound" as const, eveSessionId: row.eve_session_id };
    }
    if (row.binding_state === "failed") throw new HttpFailure(409, "binding_failed", "Start a new conversation");
    if (row.binding_claim_expires_at && row.binding_claim_expires_at.getTime() > now.getTime()) {
      return { state: "pending" as const };
    }
    if ((row.binding_started_at && now.getTime() - row.binding_started_at.getTime() > 20_000) ||
        row.binding_attempts >= 5) {
      await client.query(`UPDATE conversations SET binding_state = 'failed',
        binding_claim_token = NULL, binding_claim_expires_at = NULL, updated_at = now()
        WHERE id = $1`, [id]);
      return { state: "failed" as const };
    }
    const claimToken = randomUUID();
    await client.query(`UPDATE conversations SET binding_state = 'creating',
      binding_attempts = binding_attempts + 1,
      binding_started_at = COALESCE(binding_started_at, $2),
      binding_claim_token = $3, binding_claim_expires_at = $4,
      updated_at = now(), revision = revision + 1 WHERE id = $1`,
    [id, now, claimToken, new Date(now.getTime() + 5_000)]);
    return { state: "claimed" as const, claimToken, operationId: row.creation_operation_id };
  });
  if (decision.state === "failed") {
    throw new HttpFailure(409, "binding_failed", "Start a new conversation");
  }
  return decision;
}

export async function markBindingUncertain(
  session: CurrentSession, id: string, claimToken: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const row = await lockOwnedBinding(client, session, id);
    if (row.binding_claim_token !== claimToken || row.binding_state === "bound") return;
    await client.query(`UPDATE conversations SET binding_state = 'reconciling',
      binding_claim_token = NULL, binding_claim_expires_at = NULL,
      updated_at = now(), revision = revision + 1 WHERE id = $1`, [id]);
  });
}

export async function bindNativeSession(
  session: CurrentSession, id: string, claimToken: string, nativeSessionId: string,
): Promise<ConversationReference> {
  if (!/^wrun_[A-Za-z0-9_-]+$/.test(nativeSessionId)) {
    throw new HttpFailure(503, "invalid_native_session", "Service unavailable");
  }
  await withTransaction(async (client) => {
    const row = await lockOwnedBinding(client, session, id);
    if (row.binding_state === "bound" && row.eve_session_id === nativeSessionId) return;
    if (row.binding_state !== "creating" || row.binding_claim_token !== claimToken) {
      throw new HttpFailure(409, "binding_conflict", "Binding changed");
    }
    await client.query(`UPDATE conversations SET eve_session_id = $2,
      binding_state = 'bound', binding_claim_token = NULL,
      binding_claim_expires_at = NULL, updated_at = now(), revision = revision + 1
      WHERE id = $1`, [id, nativeSessionId]);
  });
  return getOwnedConversation(session, id);
}
