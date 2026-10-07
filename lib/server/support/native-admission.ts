import { randomUUID } from "node:crypto";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { SUPPORT_ADVICE_LIMITS } from "../../support/advice";
import type { FeaturePrincipal } from "../conversations/feature";
import type { ExecutionModelIdentity } from "../execution/native-admission";
import { supportTransaction } from "./service";
import { boundSupportToolActor } from "./tool-actor";
import { supportDigest } from "./commands";

async function injected(db: import("pg").PoolClient, principal: FeaturePrincipal, identity: ExecutionModelIdentity) {
  const bound = await boundSupportToolActor(db, principal);
  if (bound.responseAttemptId !== identity.responseAttemptId || bound.nativeSessionId !== identity.nativeSessionId || bound.nativeTurnId !== identity.turnId) throw hiddenRecord();
  const receipt = (await db.query("SELECT snapshot_digest FROM context_injection_receipts WHERE attempt_id=$1 AND turn_id=$2", [bound.responseAttemptId, identity.turnId])).rows[0];
  if (receipt?.snapshot_digest !== supportDigest(bound.snapshot))
    throw new HttpFailure(409, "support_context_changed", "Support context was not injected");
  return bound;
}
export async function admitSupportModelStep(principal: FeaturePrincipal, identity: ExecutionModelIdentity) {
  return supportTransaction(async db => {
    const bound = await injected(db, principal, identity), token = `${identity.turnId}/${identity.stepIndex}`;
    if ((await db.query("SELECT 1 FROM support_model_step_receipts WHERE attempt_id=$1 AND step_token=$2", [bound.attemptId, token])).rowCount)
      throw new HttpFailure(409, "support_step_uncertain", "A paid call may have run; no retry is allowed");
    if (!Number.isInteger(identity.stepIndex) || identity.stepIndex < 0 || identity.stepIndex >= SUPPORT_ADVICE_LIMITS.steps ||
      bound.counters.modelSteps !== identity.stepIndex || bound.counters.modelSteps >= SUPPORT_ADVICE_LIMITS.steps)
      throw new HttpFailure(429, "support_step_budget", "Support model step limit reached");
    await db.query(`INSERT INTO support_model_step_receipts(id,attempt_id,native_session_id,response_attempt_id,native_turn_id,ordinal,step_token)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), bound.attemptId, identity.nativeSessionId, identity.responseAttemptId,
    identity.turnId, identity.stepIndex + 1, token]);
    await db.query("UPDATE support_advice_attempts SET model_steps=model_steps+1 WHERE id=$1", [bound.attemptId]);
    return { mode: "support" as const, deadlineAt: bound.deadlineAt };
  });
}
export async function assertSupportProviderRelease(principal: FeaturePrincipal, identity: ExecutionModelIdentity) {
  return supportTransaction(async db => {
    const bound = await injected(db, principal, identity);
    const receipt = (await db.query(`SELECT ordinal FROM support_model_step_receipts WHERE attempt_id=$1 AND step_token=$2
      AND native_session_id=$3 AND response_attempt_id=$4 AND native_turn_id=$5`,
    [bound.attemptId, `${identity.turnId}/${identity.stepIndex}`, identity.nativeSessionId, identity.responseAttemptId, identity.turnId])).rows[0];
    if (!receipt || receipt.ordinal !== identity.stepIndex + 1 || bound.counters.modelSteps !== identity.stepIndex + 1 ||
      Date.now() >= bound.deadlineAt.getTime() || Date.now() >= bound.actor.expiresAt.getTime()) throw hiddenRecord();
  });
}
