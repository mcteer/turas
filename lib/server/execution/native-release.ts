import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { hiddenRecord } from "../../contracts/http";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { executionScopeForConversation } from "./context";
import { boundExecutionToolActor } from "./tool-actor";
import { readChargedExecutionSnapshot } from "./initial-context";
export type ExecutionNativeRelease = { principal: { principalId: string; attributes: { turasAttemptId: string } };
  conversationId: string; responseAttemptId: string; nativeSessionId: string; incomingTurnId?: string; allowUnclaimedTurn?: boolean };
type Expected = { actor?: CurrentSession; responseAttemptId?: string; nativeSessionId?: string; incomingTurnId?: string; allowUnclaimedTurn?: boolean };
export async function prepareExecutionReleaseForNative(nativeSessionId: string, expected?: Expected) {
  const id = await withTransaction(async db => {
    const row = (await db.query("SELECT id,owner_principal_id FROM conversations WHERE eve_session_id=$1 AND environment_id=$2 AND binding_state='bound'", [nativeSessionId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!row || expected?.actor && row.owner_principal_id !== expected.actor.principalId) throw hiddenRecord();
    return row.id as string;
  });
  return prepareExecutionNativeRelease(id, { ...expected, nativeSessionId });
}
/** Immutable association metadata only; no cached permission or source decision. */
export async function prepareExecutionNativeRelease(conversationId: string, expected?: Expected): Promise<ExecutionNativeRelease | null> {
  return withTransaction(async db => {
    const scope = await executionScopeForConversation(db, conversationId); if (!scope) return null;
    const row = (await db.query(`SELECT c.owner_principal_id,c.eve_session_id,a.response_attempt_id FROM conversations c
      JOIN execution_advice_attempts a ON a.conversation_id=c.id WHERE c.id=$1 AND c.environment_id=$2 AND c.workspace_id=a.workspace_id`, [conversationId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!row || !row.response_attempt_id || !row.eve_session_id || expected?.actor && (expected.actor.principalId !== row.owner_principal_id || expected.actor.membershipId !== scope.ownerMembershipId) ||
      expected?.nativeSessionId && row.eve_session_id !== expected.nativeSessionId || expected?.responseAttemptId && row.response_attempt_id !== expected.responseAttemptId) throw hiddenRecord();
    return { principal: { principalId: row.owner_principal_id, attributes: { turasAttemptId: row.response_attempt_id } }, conversationId,
      responseAttemptId: row.response_attempt_id, nativeSessionId: row.eve_session_id, incomingTurnId: expected?.incomingTurnId, allowUnclaimedTurn: expected?.allowUnclaimedTurn };
  });
}
export async function assertExecutionNativeRelease(db: PoolClient, prepared: ExecutionNativeRelease, actor?: CurrentSession) {
  const bound = await boundExecutionToolActor(db, prepared.principal, { release: true, incomingTurnId: prepared.incomingTurnId, allowUnclaimedTurn: prepared.allowUnclaimedTurn });
  if (bound.scope.conversationId !== prepared.conversationId || bound.responseAttemptId !== prepared.responseAttemptId || bound.nativeSessionId !== prepared.nativeSessionId ||
    actor && (actor.sessionId !== bound.actor.sessionId || actor.membershipId !== bound.actor.membershipId || actor.principalId !== bound.actor.principalId || actor.workspaceId !== bound.actor.workspaceId)) throw hiddenRecord();
  await readChargedExecutionSnapshot(db, bound); return bound;
}
