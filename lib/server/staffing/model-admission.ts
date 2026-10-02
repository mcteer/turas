import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { boundStaffingToolActor, type StaffingToolFenceContext } from "./tool-actor";
import { assertStaffingStepLimits } from "./model-budget";
import { requireStaffingEnvironment } from "./repository";

type Principal = Parameters<typeof boundStaffingToolActor>[1];
/** Reserve a paid call once, before provider IO. No model invocation or automatic
 * retry occurs here. Until the consumed-dependency fence is implemented and
 * supplied, callers cannot use this helper to admit a provider call. */
export async function admitStaffingModelStep(db: PoolClient, principal: Principal,
  identity: { nativeSessionId: string; responseAttemptId: string; turnId: string; stepIndex: number },
  fenceConsumedDependencies: (db: PoolClient, attemptId: string, context: StaffingToolFenceContext) => Promise<void>) {
  if (typeof fenceConsumedDependencies !== "function") throw hiddenRecord();
  const bound = await boundStaffingToolActor(db, principal, fenceConsumedDependencies);
  await requireStaffingEnvironment(db, true);
  if (identity.responseAttemptId !== bound.responseAttemptId) throw hiddenRecord();
  const native = (await db.query(`SELECT c.eve_session_id,a.native_turn_id FROM conversations c
    JOIN response_attempts a ON a.conversation_id=c.id WHERE c.id=$1 AND a.id=$2`,
    [bound.scope.conversationId, bound.responseAttemptId])).rows[0];
  if (!native || native.eve_session_id !== identity.nativeSessionId || native.native_turn_id !== identity.turnId) throw hiddenRecord();
  const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
  assertStaffingStepLimits({ turnId: identity.turnId, stepIndex: identity.stepIndex,
    stepsAdmitted: bound.counters.modelSteps, deadlineAt: bound.deadlineAt }, now.getTime());
  const stepToken = `${identity.turnId}/${identity.stepIndex}`;
  if (stepToken.length > 200) throw hiddenRecord();
  const prior = await db.query("SELECT 1 FROM staffing_model_step_receipts WHERE attempt_id=$1 AND step_token=$2", [bound.attemptId, stepToken]);
  if (prior.rowCount) throw new HttpFailure(409, "staffing_step_uncertain", "A previous model call may have run; review its owned status");
  if (identity.stepIndex !== bound.counters.modelSteps) throw new HttpFailure(409, "staffing_step_changed", "Staffing model step changed");
  // Recheck after dependency queries; a lock wait cannot extend the deadline.
  const late = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
  if (bound.actor.expiresAt.getTime() <= late.getTime()) throw new HttpFailure(401, "authentication_required", "Sign in again");
  assertStaffingStepLimits({ turnId: identity.turnId, stepIndex: identity.stepIndex,
    stepsAdmitted: bound.counters.modelSteps, deadlineAt: bound.deadlineAt }, late.getTime());
  await db.query(`INSERT INTO staffing_model_step_receipts(id,environment_id,workspace_id,attempt_id,ordinal,step_token)
    VALUES($1,$2,$3,$4,$5,$6)`, [randomUUID(), getServerConfig().TURAS_ENVIRONMENT_ID, bound.actor.workspaceId,
    bound.attemptId, bound.counters.modelSteps + 1, stepToken]);
  await db.query("UPDATE staffing_advisory_attempts SET model_steps=model_steps+1,updated_at=clock_timestamp() WHERE id=$1", [bound.attemptId]);
  const release = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
  if (bound.actor.expiresAt.getTime() <= release.getTime()) throw new HttpFailure(401, "authentication_required", "Sign in again");
  assertStaffingStepLimits({ turnId: identity.turnId, stepIndex: identity.stepIndex,
    stepsAdmitted: bound.counters.modelSteps, deadlineAt: bound.deadlineAt }, release.getTime());
  return { mode: bound.scope.mode, deadlineAt: bound.deadlineAt };
}
