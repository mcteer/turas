import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import type { ConversationReference } from "../../contracts/conversations";
import { getOwnedConversation } from "./repository";
import { lockProfileActor } from "../profiles/policy";

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
  context_snapshot_schema: string | null;
  context_login_session_id: string | null;
  context_membership_id: string | null;
};

async function ownedBinding(client: PoolClient, session: CurrentSession, id: string,
  readOnly: boolean): Promise<BindingRow> {
  const scope = await client.query<{ customer_id: string }>(`
    SELECT customer_id FROM conversations WHERE id=$1 AND owner_principal_id=$2
      AND workspace_id=$3 AND environment_id=$4`,
  [id, session.principalId, session.workspaceId, getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!scope.rows[0]) throw hiddenRecord();
  await lockProfileActor(client, session, scope.rows[0].customer_id,undefined,readOnly);
  const result = await client.query<BindingRow>(`
    SELECT c.* FROM conversations c WHERE c.id = $1 AND c.owner_principal_id = $2
      AND c.workspace_id = $3 AND c.environment_id = $4 ${readOnly ? "FOR SHARE" : "FOR UPDATE"}
  `, [id, session.principalId, session.workspaceId, getServerConfig().TURAS_ENVIRONMENT_ID]);
  const row = result.rows[0];
  if (!row || row.customer_id !== scope.rows[0].customer_id) throw hiddenRecord();
  if (row.context_snapshot_schema !== "customer-context-v1" ||
      row.context_login_session_id !== session.sessionId ||
      row.context_membership_id !== session.membershipId) {
    throw new HttpFailure(409, "context_changed", "Start a new conversation for current customer context");
  }
  return row;
}

export async function lockOwnedBinding(client: PoolClient, session: CurrentSession,
  id: string): Promise<BindingRow> {
  return ownedBinding(client,session,id,false);
}

export async function readOwnedBinding(client: PoolClient, session: CurrentSession,
  id: string): Promise<BindingRow> {
  return ownedBinding(client,session,id,true);
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
