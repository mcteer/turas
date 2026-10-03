import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { executionId } from "./fields";
import { getServerConfig } from "../config";
import { conversationFeature, type FeaturePrincipal } from "../conversations/feature";
import { executionDigest } from "./commands";
import type { ExecutionActor } from "./policy";
import { selectExecutionAdviceInputs, assertExecutionDependencies, readExecutionDependencies } from "./dependencies";

export type ExecutionReleaseOptions = { release?: boolean; incomingTurnId?: string; allowUnclaimedTurn?: boolean };
const changed = () => new HttpFailure(409, "source_changed", "Execution explanation inputs changed");
/** Own association IDs do not authorize content. Resolve current actor, immutable
 * scope and the complete consumed closure before the native cancellation mutexes. */
export async function boundExecutionToolActor(db: PoolClient, principal: FeaturePrincipal, options: ExecutionReleaseOptions = {}) {
  const responseAttemptId = principal?.attributes?.turasAttemptId;
  if (!executionId.safeParse(responseAttemptId).success || !executionId.safeParse(principal?.principalId).success) throw hiddenRecord();
  const row = (await db.query(`SELECT a.id,a.conversation_id,a.owner_membership_id,c.context_login_session_id,c.owner_principal_id,c.workspace_id,
    s.expires_at,p.login_name,p.display_name,m.kind,m.role FROM execution_advice_attempts a JOIN conversations c ON c.id=a.conversation_id
    JOIN response_attempts r ON r.id=a.response_attempt_id AND r.conversation_id=c.id JOIN memberships m ON m.id=a.owner_membership_id
    JOIN principals p ON p.id=c.owner_principal_id JOIN login_sessions s ON s.id=c.context_login_session_id
    WHERE a.response_attempt_id=$1 AND c.owner_principal_id=$2 AND a.environment_id=$3 AND c.environment_id=a.environment_id
      AND c.workspace_id=a.workspace_id AND m.workspace_id=c.workspace_id AND m.principal_id=c.owner_principal_id AND s.principal_id=c.owner_principal_id`,
    [responseAttemptId, principal!.principalId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!row) throw hiddenRecord();
  if ((await db.query("SELECT 1 FROM execution_advice_retirements WHERE attempt_id=$1",[row.id])).rowCount) throw changed();
  const actor: ExecutionActor = { sessionId: row.context_login_session_id, token: "", expiresAt: row.expires_at,
    principalId: row.owner_principal_id, membershipId: row.owner_membership_id, workspaceId: row.workspace_id,
    loginName: row.login_name, displayName: row.display_name, kind: row.kind, role: row.role };
  const feature = await conversationFeature(db, row.conversation_id);
  if (feature.kind !== "execution") throw hiddenRecord();
  const current = await selectExecutionAdviceInputs(db, actor, feature.scope, row.id);
  const consumed = await assertExecutionDependencies(db, row.id, current.dependencies);
  await db.query(`SELECT id FROM conversations WHERE id=$1 FOR ${options.release ? "UPDATE" : "SHARE"}`, [row.conversation_id]);
  await db.query(`SELECT id FROM response_attempts WHERE id=$1 AND conversation_id=$2 FOR ${options.release ? "UPDATE" : "SHARE"}`, [responseAttemptId, row.conversation_id]);
  const attempt = (await db.query(`SELECT a.state,a.model_steps,a.read_calls,a.context_bytes,a.dependency_count,a.deadline_at,
    r.response_state,r.dispatch_state,r.native_turn_id,r.deadline_at AS response_deadline,c.context_valid_until,c.eve_session_id,c.binding_state,
    s.revoked_at,s.expires_at,clock_timestamp() AS now FROM execution_advice_attempts a JOIN response_attempts r ON r.id=a.response_attempt_id
    JOIN conversations c ON c.id=a.conversation_id JOIN login_sessions s ON s.id=c.context_login_session_id WHERE a.id=$1 FOR UPDATE OF a`, [row.id])).rows[0];
  if (!attempt || attempt.revoked_at || attempt.expires_at.getTime() <= attempt.now.getTime()) throw new HttpFailure(401, "unauthorized", "Sign in again");
  const incoming = options.release && typeof options.incomingTurnId === "string" && options.incomingTurnId.length > 0 && options.incomingTurnId.length <= 180 ? options.incomingTurnId : null;
  const completed = options.release && attempt.state === "completed" && attempt.response_state === "completed" && attempt.dispatch_state === "admitted";
  const active = attempt.state === "running" && ["pending", "running"].includes(attempt.response_state) && ["dispatching", "admitted"].includes(attempt.dispatch_state) &&
    attempt.deadline_at?.getTime() > attempt.now.getTime() && attempt.response_deadline?.getTime() > attempt.now.getTime();
  if ((!completed && !active) || attempt.binding_state !== "bound" || !attempt.eve_session_id ||
    incoming && attempt.native_turn_id && incoming !== attempt.native_turn_id ||
    !attempt.native_turn_id && !incoming && !(options.release && options.allowUnclaimedTurn) ||
    !attempt.context_valid_until || attempt.context_valid_until.getTime() <= attempt.now.getTime())
    throw new HttpFailure(409, "execution_advice_unavailable", "Execution explanation is no longer active");
  if (Number(attempt.dependency_count) !== consumed.length || executionDigest(await readExecutionDependencies(db, row.id)) !== executionDigest(consumed)) throw changed();
  return { actor, scope: feature.scope, attemptId: row.id as string, responseAttemptId: responseAttemptId as string,
    nativeSessionId: attempt.eve_session_id as string, nativeTurnId: attempt.native_turn_id as string | null,
    deadlineAt: attempt.deadline_at as Date, current, consumedDependencies: consumed,
    counters: { modelSteps: Number(attempt.model_steps), readCalls: Number(attempt.read_calls), contextBytes: Number(attempt.context_bytes), dependencyCount: Number(attempt.dependency_count) } };
}
