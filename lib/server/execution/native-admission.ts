import { randomUUID } from "node:crypto";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { assertExecutionStepLimits } from "../../execution/advice";
import type { FeaturePrincipal } from "../conversations/feature";
import { executionTransaction } from "./commands";
import { boundExecutionToolActor } from "./tool-actor";
import { readChargedExecutionSnapshot } from "./initial-context";
export type ExecutionModelIdentity = { nativeSessionId: string; responseAttemptId: string; turnId: string; stepIndex: number };
async function injected(db: import("pg").PoolClient, principal: FeaturePrincipal, identity: ExecutionModelIdentity) {
  const bound = await boundExecutionToolActor(db, principal);
  if (bound.responseAttemptId !== identity.responseAttemptId || bound.nativeSessionId !== identity.nativeSessionId || bound.nativeTurnId !== identity.turnId) throw hiddenRecord();
  const charged = await readChargedExecutionSnapshot(db, bound);
  const row = (await db.query("SELECT snapshot_digest FROM context_injection_receipts WHERE attempt_id=$1 AND turn_id=$2", [bound.responseAttemptId, identity.turnId])).rows[0];
  if (row?.snapshot_digest !== charged.digest) throw new HttpFailure(409, "execution_context_changed", "Execution context was not injected");
  return bound;
}
/** The unique step receipt commits before actual provider IO. A repeated native
 * step is uncertain, never another authorization to spend. */
export async function admitExecutionModelStep(principal: FeaturePrincipal, identity: ExecutionModelIdentity) {
  return executionTransaction(async db => {
    const bound = await injected(db, principal, identity), stepToken = `${identity.turnId}/${identity.stepIndex}`;
    if ((await db.query("SELECT 1 FROM execution_advice_steps WHERE attempt_id=$1 AND step_token=$2", [bound.attemptId, stepToken])).rowCount)
      throw new HttpFailure(409, "execution_step_uncertain", "A model call may have run; review its owned status");
    const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    assertExecutionStepLimits({ ...identity, stepsAdmitted: bound.counters.modelSteps, deadlineAt: bound.deadlineAt }, now.getTime());
    if (bound.actor.expiresAt.getTime() <= now.getTime()) throw hiddenRecord();
    await db.query("INSERT INTO execution_advice_steps(id,attempt_id,ordinal,step_token) VALUES($1,$2,$3,$4)", [randomUUID(), bound.attemptId, bound.counters.modelSteps + 1, stepToken]);
    await db.query("UPDATE execution_advice_attempts SET model_steps=model_steps+1 WHERE id=$1", [bound.attemptId]);
    const release = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    assertExecutionStepLimits({ ...identity, stepsAdmitted: bound.counters.modelSteps, deadlineAt: bound.deadlineAt }, release.getTime());
    if (bound.actor.expiresAt.getTime() <= release.getTime()) throw hiddenRecord();
    return { mode: "execution" as const, deadlineAt: bound.deadlineAt };
  });
}
export async function assertExecutionProviderRelease(principal: FeaturePrincipal, identity: ExecutionModelIdentity) {
  return executionTransaction(async db => {
    const bound = await injected(db, principal, identity);
    const row = (await db.query("SELECT ordinal FROM execution_advice_steps WHERE attempt_id=$1 AND step_token=$2", [bound.attemptId, `${identity.turnId}/${identity.stepIndex}`])).rows[0];
    if (!row || row.ordinal !== identity.stepIndex + 1 || bound.counters.modelSteps !== identity.stepIndex + 1 ||
      Date.now() >= bound.deadlineAt.getTime() || Date.now() >= bound.actor.expiresAt.getTime()) throw hiddenRecord();
  });
}
