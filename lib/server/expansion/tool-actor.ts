import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { expansionId } from "../../contracts/expansion";
import { getServerConfig } from "../config";
import { conversationFeature, type FeaturePrincipal } from "../conversations/feature";
import type { ExpansionActor } from "./policy";
import { captureExpansionAdviceContext } from "./context";
import { expansionHash } from "./commands";
import { z } from 'zod';
import { expansionSourceSchema, expansionSourcesSchema } from "./schema";

export async function boundExpansionToolActor(db: PoolClient, principal: FeaturePrincipal, incomingTurnId?: string, release = false, allowUnclaimedTurn = false) {
  const responseAttemptId = principal?.attributes?.turasAttemptId;
  if (!expansionId.safeParse(responseAttemptId).success || !expansionId.safeParse(principal?.principalId).success) throw hiddenRecord();
  const row = (await db.query(`SELECT a.id,a.conversation_id,a.owner_membership_id,c.context_login_session_id,c.owner_principal_id,c.workspace_id,
    s.expires_at,p.login_name,p.display_name,m.kind,m.role FROM expansion_advice_attempts a JOIN conversations c ON c.id=a.conversation_id
    JOIN response_attempts r ON r.id=a.response_attempt_id AND r.conversation_id=c.id JOIN memberships m ON m.id=a.owner_membership_id
    JOIN principals p ON p.id=c.owner_principal_id JOIN login_sessions s ON s.id=c.context_login_session_id
    WHERE a.response_attempt_id=$1 AND c.owner_principal_id=$2 AND a.environment_id=$3 AND c.environment_id=a.environment_id
      AND c.workspace_id=a.workspace_id AND m.workspace_id=c.workspace_id AND m.principal_id=c.owner_principal_id AND s.principal_id=c.owner_principal_id`,
  [responseAttemptId, principal!.principalId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!row) throw hiddenRecord();
  const actor: ExpansionActor = { sessionId: row.context_login_session_id, token: "", expiresAt: row.expires_at,
    principalId: row.owner_principal_id, membershipId: row.owner_membership_id, workspaceId: row.workspace_id,
    loginName: row.login_name, displayName: row.display_name, kind: row.kind, role: row.role };
  const feature = await conversationFeature(db, row.conversation_id);
  if (feature.kind !== "expansion") throw hiddenRecord();
  const payloads = (await db.query("SELECT kind,payload,content_digest FROM expansion_advice_payloads WHERE attempt_id=$1", [row.id])).rows;
  const context = payloads.find(payload => payload.kind === "context")?.payload;
  const refs = z.array(expansionSourceSchema).max(200).parse(payloads.find(payload => payload.kind === "source_map")?.payload);
  if (payloads.some(payload=>expansionHash(payload.payload)!==payload.content_digest)) throw hiddenRecord();
  if (!context || (await db.query("SELECT 1 FROM expansion_advice_retirements WHERE attempt_id=$1", [row.id])).rowCount)
    throw new HttpFailure(409, "expansion_context_changed", "Expansion advice content is no longer retained");
  const current = await captureExpansionAdviceContext(db, actor, feature.scope, expansionSourcesSchema.parse(context.fence.requestRefs), context.snapshot.question);
  if (current.digest !== expansionHash(context.fence)) throw new HttpFailure(409, "expansion_context_changed", "Expansion advice sources changed");
  await db.query("SELECT id FROM conversations WHERE id=$1 FOR SHARE", [row.conversation_id]);
  await db.query("SELECT id FROM response_attempts WHERE id=$1 FOR SHARE", [responseAttemptId]);
  const attempt = (await db.query(`SELECT a.*,r.response_state,r.dispatch_state,r.native_turn_id AS response_turn,
    r.deadline_at AS response_deadline,c.eve_session_id,c.binding_state,s.revoked_at,s.expires_at,clock_timestamp() AS now
    FROM expansion_advice_attempts a JOIN response_attempts r ON r.id=a.response_attempt_id
    JOIN conversations c ON c.id=a.conversation_id JOIN login_sessions s ON s.id=c.context_login_session_id WHERE a.id=$1 FOR UPDATE OF a`, [row.id])).rows[0];
  if (!attempt || new Date(attempt.created_at).getTime()+30*86400000<=Date.now() || attempt.revoked_at || attempt.expires_at.getTime() <= attempt.now.getTime()) throw hiddenRecord();
  const completed = release && attempt.state === "completed" && attempt.response_state === "completed" && attempt.dispatch_state === "admitted";
  if (!completed && (attempt.state !== "running" || !["pending", "running"].includes(attempt.response_state) ||
    !["dispatching", "admitted"].includes(attempt.dispatch_state) || attempt.binding_state !== "bound" || !attempt.eve_session_id ||
    (!attempt.response_turn && !incomingTurnId && !(release && allowUnclaimedTurn && attempt.dispatch_state === "dispatching")) || (incomingTurnId && attempt.response_turn && incomingTurnId !== attempt.response_turn) ||
    !attempt.deadline_at || attempt.deadline_at.getTime() <= attempt.now.getTime() ||
    !attempt.response_deadline || attempt.response_deadline.getTime() <= attempt.now.getTime()))
    throw new HttpFailure(409, "expansion_advice_unavailable", "Expansion advice is no longer active");
  if (attempt.binding_state !== "bound" || !attempt.eve_session_id || incomingTurnId && attempt.response_turn && incomingTurnId !== attempt.response_turn) throw hiddenRecord();
  return { actor, scope: feature.scope, attemptId: row.id as string, responseAttemptId: responseAttemptId as string,
    nativeSessionId: attempt.eve_session_id as string, nativeTurnId: (attempt.response_turn ?? incomingTurnId) as string,
    deadlineAt: attempt.deadline_at as Date, snapshot: context.snapshot, refs,
    counters: { modelSteps: Number(attempt.model_steps), readCalls: Number(attempt.read_calls), contextBytes: Number(attempt.context_bytes) } };
}
