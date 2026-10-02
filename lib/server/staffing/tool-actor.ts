import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingIdSchema } from "../../contracts/staffing";
import { getServerConfig } from "../config";
import { requireStaffingConversation, staffingScopeForConversation } from "./context";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { staffingSha256 } from "./commands";
import { readStaffingDeliveryContext } from "../profiles/context";
import { lockStaffingResourcePool } from "./pool-lock";
import { requireStaffingEnvironment } from "./repository";
type Principal = { principalId?: string; attributes?: Record<string, unknown> } | null | undefined;
export type StaffingActorReleaseOptions = { release?: boolean; incomingTurnId?: string; allowUnclaimedTurn?: boolean };
export type StaffingToolFenceContext = Awaited<ReturnType<typeof requireStaffingConversation>> & {
  actor: StaffingActor; deliveryContext: Awaited<ReturnType<typeof readStaffingDeliveryContext>>;
};

/** No default profile snapshot or artifact/research context is consulted. Native
 * principal attributes identify a server-owned response, never a caller scope.
 * Callers must still fence and durably charge the consumed dependency union
 * before releasing domain content or replaying a previously returned result. */
export async function boundStaffingToolActor(db: PoolClient, principal: Principal,
  beforeAttemptLock?: (db: PoolClient, attemptId: string, context: StaffingToolFenceContext) => Promise<void>,
  options: StaffingActorReleaseOptions = {}) {
  const responseAttemptId = principal?.attributes?.turasAttemptId;
  if (!staffingIdSchema.safeParse(principal?.principalId).success || !staffingIdSchema.safeParse(responseAttemptId).success) throw hiddenRecord();
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const row = (await db.query(`SELECT a.id,a.conversation_id,b.owner_membership_id,b.mode,b.customer_id,
    c.workspace_id,c.context_login_session_id,c.owner_principal_id,s.expires_at,p.login_name,p.display_name,m.kind,m.role
    FROM staffing_advisory_attempts a JOIN staffing_conversation_bindings b ON b.id=a.binding_id
    JOIN conversations c ON c.id=a.conversation_id JOIN memberships m ON m.id=b.owner_membership_id
    JOIN principals p ON p.id=c.owner_principal_id JOIN login_sessions s ON s.id=c.context_login_session_id
    JOIN response_attempts response ON response.id=a.response_attempt_id AND response.conversation_id=c.id
    WHERE a.response_attempt_id=$1 AND c.owner_principal_id=$2 AND a.environment_id=$3
      AND b.environment_id=a.environment_id AND c.environment_id=a.environment_id
      AND a.workspace_id=c.workspace_id AND b.workspace_id=c.workspace_id
      AND m.workspace_id=c.workspace_id AND m.principal_id=c.owner_principal_id
      AND s.principal_id=c.owner_principal_id AND a.owner_membership_id=b.owner_membership_id`,
    [responseAttemptId, principal!.principalId, env])).rows[0];
  if (!row) throw hiddenRecord();
  const actor: StaffingActor = { sessionId: row.context_login_session_id, token: "", expiresAt: row.expires_at,
    principalId: row.owner_principal_id, membershipId: row.owner_membership_id, workspaceId: row.workspace_id,
    loginName: row.login_name, displayName: row.display_name, kind: row.kind, role: row.role };
  // Current role, source, baseline and same-baseline scenario checks acquire
  // the governed domain prefix before the attempt quota/receipt mutex.
  const scope = await staffingScopeForConversation(db, row.conversation_id);
  if (!scope || scope.ownerMembershipId !== actor.membershipId || scope.customerId !== row.customer_id) throw hiddenRecord();
  await lockStaffingActor(db, actor, scope.mode === "finance" ? "finance" : "operational", { customerId: scope.customerId });
  // The disable switch closes every native content/provider surface. Owner
  // status, deterministic reads and metadata-only settlement use other paths.
  await requireStaffingEnvironment(db, true);
  await lockStaffingResourcePool(db, actor, "SHARE");
  const deliveryContext = await readStaffingDeliveryContext(actor, scope.customerId, scope.workloadId, db);
  const current = await requireStaffingConversation(db, actor, row.conversation_id, beforeAttemptLock ?
    { deferScenario: true, deferDemandHead: true } : {});
  const dependencyRows = () => db.query(`SELECT kind,input_id,revision_id,generation,content_digest FROM staffing_advisory_dependencies
    WHERE attempt_id=$1 ORDER BY kind,input_id,revision_id`, [row.id]);
  const dependencyDigest = beforeAttemptLock ? staffingSha256((await dependencyRows()).rows) : null;
  if (beforeAttemptLock) {
    await beforeAttemptLock(db, row.id, { ...current, actor, deliveryContext });
    // Even a test/custom resolver cannot bypass finance scope validation. The
    // production resolver acquires its complete resource prefix before this.
    if (scope.scenarioId) await requireStaffingConversation(db, actor, row.conversation_id);
  }
  // Cancellation takes response -> advisory. Acquire the same row order so
  // cancellation cannot change response state between validation and release.
  if (options.release) await db.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [row.conversation_id]);
  await db.query(`SELECT id FROM response_attempts WHERE id=$1 AND conversation_id=$2 FOR ${options.release ? "UPDATE" : "SHARE"}`,
    [responseAttemptId, row.conversation_id]);
  const attempt = (await db.query(`SELECT a.state,a.deadline_at,a.read_calls,a.model_steps,a.context_bytes,a.dependency_count,
    response.response_state,response.dispatch_state,response.native_turn_id,response.deadline_at AS response_deadline_at,
    conversation.context_valid_until AS context_deadline_at,
    s.revoked_at,s.expires_at,clock_timestamp() AS now FROM staffing_advisory_attempts a
    JOIN response_attempts response ON response.id=a.response_attempt_id JOIN conversations conversation ON conversation.id=a.conversation_id
    JOIN login_sessions s ON s.id=$3
    WHERE a.id=$1 AND a.response_attempt_id=$2 AND a.conversation_id=$4 AND a.owner_membership_id=$5
    FOR UPDATE OF a`, [row.id, responseAttemptId, actor.sessionId, row.conversation_id, actor.membershipId])).rows[0];
  if (!attempt || attempt.revoked_at || attempt.expires_at.getTime() <= attempt.now.getTime()) {
    throw new HttpFailure(401, "authentication_required", "Sign in again");
  }
  const incoming = options.release && typeof options.incomingTurnId === "string" && options.incomingTurnId.length > 0 && options.incomingTurnId.length <= 200
    ? options.incomingTurnId : null;
  if (incoming && attempt.native_turn_id && incoming !== attempt.native_turn_id) throw hiddenRecord();
  const completedRelease = options.release && attempt.state === "completed" && attempt.response_state === "completed" && attempt.dispatch_state === "admitted";
  const activeRelease = attempt.state === "running" && ["pending", "running"].includes(attempt.response_state) &&
    ["dispatching", "admitted"].includes(attempt.dispatch_state) && attempt.deadline_at && attempt.deadline_at.getTime() > attempt.now.getTime() &&
    (!attempt.response_deadline_at || attempt.response_deadline_at.getTime() > attempt.now.getTime());
  if ((!activeRelease && !completedRelease) || (!attempt.native_turn_id && !incoming && !(options.release && options.allowUnclaimedTurn)) ||
    attempt.context_deadline_at && attempt.context_deadline_at.getTime() <= attempt.now.getTime()) {
    throw new HttpFailure(409, "staffing_advisory_unavailable", "Staffing explanation is no longer active");
  }
  if (beforeAttemptLock && staffingSha256((await dependencyRows()).rows) !== dependencyDigest) {
    throw new HttpFailure(409, "staffing_context_changed", "Staffing explanation dependencies changed");
  }
  return { actor, scope: current.scope, demand: current.demand, deliveryContext, attemptId: row.id as string,
    consumedDependenciesFenced: Boolean(beforeAttemptLock),
    responseAttemptId: responseAttemptId as string, nativeTurnId: (attempt.native_turn_id ?? incoming) as string | null, releaseCompleted: Boolean(completedRelease),
    deadlineAt: new Date(Math.min(completedRelease ? Infinity : attempt.deadline_at.getTime(),
      completedRelease ? Infinity : attempt.response_deadline_at?.getTime() ?? Infinity,
      attempt.context_deadline_at?.getTime() ?? Infinity, actor.expiresAt.getTime())),
    counters: { readCalls: Number(attempt.read_calls), modelSteps: Number(attempt.model_steps),
      contextBytes: Number(attempt.context_bytes), dependencyCount: Number(attempt.dependency_count) } };
}
