import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { staffingScopeForConversation } from "./context";
import { boundStaffingToolActor } from "./tool-actor";
import { prepareStaffingNativeFence, readChargedStaffingSnapshot } from "./native-context";
import { resolveStaffingAdvisoryFence } from "./fences";

type Prepared = Awaited<ReturnType<typeof prepareStaffingNativeFence>>;
export type StaffingNativeRelease = Prepared & { principal: { principalId: string; attributes: { turasAttemptId: string } };
  conversationId: string; responseAttemptId: string; nativeSessionId: string; incomingTurnId?: string; allowUnclaimedTurn?: boolean };
const changed = () => new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");

/** Native identifiers are association metadata, never authority. The final
 * release still rechecks the server-owned login and all consumed sources. */
export async function prepareStaffingReleaseForNative(nativeSessionId: string, expected?: {
  actor?: CurrentSession; responseAttemptId?: string; incomingTurnId?: string; allowUnclaimedTurn?: boolean }) {
  const conversationId = await withTransaction(async db => {
    const row = (await db.query(`SELECT id,owner_principal_id,workspace_id FROM conversations
      WHERE eve_session_id=$1 AND environment_id=$2 AND binding_state='bound'`,
      [nativeSessionId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!row || expected?.actor && (row.owner_principal_id !== expected.actor.principalId || row.workspace_id !== expected.actor.workspaceId)) throw hiddenRecord();
    return row.id as string;
  });
  return prepareStaffingNativeRelease(conversationId, { ...expected, nativeSessionId });
}

/** Read only immutable association metadata, then resolve strict zoned endpoints
 * outside the final transaction. Completed history can remain readable while
 * its original snapshot and all current authority/dependencies remain valid.
 * Cancelled, stopped, expired and uncertain content is never released here. */
export async function prepareStaffingNativeRelease(conversationId: string, expected?: {
  actor?: CurrentSession; nativeSessionId?: string; responseAttemptId?: string; incomingTurnId?: string; allowUnclaimedTurn?: boolean }) {
  const metadata = await withTransaction(async db => {
    const scope = await staffingScopeForConversation(db, conversationId);
    if (!scope) return null;
    const row = (await db.query(`SELECT c.owner_principal_id,c.eve_session_id,a.response_attempt_id
      FROM conversations c JOIN staffing_advisory_attempts a ON a.conversation_id=c.id
      WHERE c.id=$1 AND c.environment_id=$2 AND c.workspace_id=a.workspace_id`,
      [conversationId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!row || !row.response_attempt_id || !row.eve_session_id ||
      expected?.actor && (expected.actor.principalId !== row.owner_principal_id || expected.actor.membershipId !== scope.ownerMembershipId) ||
      expected?.nativeSessionId && expected.nativeSessionId !== row.eve_session_id ||
      expected?.responseAttemptId && expected.responseAttemptId !== row.response_attempt_id) throw hiddenRecord();
    return { principal: { principalId: row.owner_principal_id as string, attributes: { turasAttemptId: row.response_attempt_id as string } },
      conversationId, responseAttemptId: row.response_attempt_id as string, nativeSessionId: row.eve_session_id as string,
      incomingTurnId: expected?.incomingTurnId, allowUnclaimedTurn: expected?.allowUnclaimedTurn };
  });
  if (!metadata) return null;
  const prepared = await prepareStaffingNativeFence(metadata.principal, { release: true, incomingTurnId: metadata.incomingTurnId, allowUnclaimedTurn: metadata.allowUnclaimedTurn });
  return { ...metadata, ...prepared } satisfies StaffingNativeRelease;
}

/** This is the final source/authority fence, not a cached permission check.
 * It acquires the full domain prefix before conversation/response/advisory
 * mutexes and must run in the same transaction as enqueue/projection/replay. */
export async function assertStaffingNativeRelease(db: PoolClient, prepared: StaffingNativeRelease, actor?: CurrentSession) {
  const bound = await boundStaffingToolActor(db, prepared.principal, async (client, attemptId, context) => {
    if (attemptId !== prepared.attemptId) throw changed();
    await resolveStaffingAdvisoryFence(client, attemptId, context, { preparedOverlap: prepared.preparedOverlap });
  }, { release: true, incomingTurnId: prepared.incomingTurnId, allowUnclaimedTurn: prepared.allowUnclaimedTurn });
  if (bound.scope.conversationId !== prepared.conversationId || bound.responseAttemptId !== prepared.responseAttemptId ||
    actor && (actor.sessionId !== bound.actor.sessionId || actor.membershipId !== bound.actor.membershipId ||
      actor.principalId !== bound.actor.principalId || actor.workspaceId !== bound.actor.workspaceId)) throw hiddenRecord();
  const native = (await db.query("SELECT eve_session_id FROM conversations WHERE id=$1", [prepared.conversationId])).rows[0];
  if (native?.eve_session_id !== prepared.nativeSessionId) throw hiddenRecord();
  await readChargedStaffingSnapshot(db, bound);
  return bound;
}
