import { HttpFailure } from "../../contracts/http";
import { staffingInitialContextSchema } from "../../staffing/advice-context";
import { withTransaction } from "../db/client";
import { prepareStaffingNativeFence, readChargedStaffingSnapshot } from "./native-context";
import { admitStaffingModelStep } from "./model-admission";
import { resolveStaffingAdvisoryFence } from "./fences";
import { staffingSha256 } from "./commands";
import { boundStaffingToolActor } from "./tool-actor";

type Principal = Parameters<typeof boundStaffingToolActor>[1];
const changed = () => new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");

/** Production paid-step admission requires the charged initial snapshot and its
 * exact owned native injection. Neither a synthetic response identity nor a
 * caller-supplied partial dependency callback can authorize a provider call. */
export async function admitGovernedStaffingModelStep(principal: Principal,
  identity: { nativeSessionId: string; responseAttemptId: string; turnId: string; stepIndex: number }) {
  const prepared = await prepareStaffingNativeFence(principal);
  return withTransaction(async db => {
    return admitStaffingModelStep(db, principal, identity, async (client, attemptId, context) => {
      if (attemptId !== prepared.attemptId) throw changed();
      const view = await resolveStaffingAdvisoryFence(client, attemptId, context, { preparedOverlap: prepared.preparedOverlap });
      const row = (await client.query(`SELECT r.snapshot,r.snapshot_digest,r.valid_until,r.owner_principal_id,r.login_session_id,
        r.membership_id,r.audience,r.generation,inject.snapshot_digest AS injection_digest
        FROM context_snapshot_receipts r JOIN context_injection_receipts inject ON inject.attempt_id=r.attempt_id AND inject.turn_id=$2
        WHERE r.attempt_id=$1 AND r.conversation_id=$3`,
        [identity.responseAttemptId, identity.turnId, context.scope.conversationId])).rows[0];
      if (!row) throw changed();
      if (row.audience !== "delivery") throw changed();
      if (row.generation !== context.deliveryContext.contextVersion) throw changed();
      if (row.owner_principal_id !== context.actor.principalId) throw changed();
      if (row.login_session_id !== context.actor.sessionId) throw changed();
      if (row.membership_id !== context.actor.membershipId) throw changed();
      if (row.snapshot_digest !== row.injection_digest) throw changed();
      const snapshot = staffingInitialContextSchema.parse(row.snapshot);
      if (staffingSha256(snapshot) !== row.snapshot_digest || snapshot.customer.id !== context.scope.customerId ||
        snapshot.staffing.demandId !== context.scope.demandId || snapshot.staffing.demandRevisionId !== context.demand.revisionId ||
        snapshot.staffing.mode !== context.scope.mode || snapshot.staffing.scenarioId !== context.scope.scenarioId) throw changed();
      const consumed = (await client.query("SELECT kind,input_id,revision_id,content_digest FROM staffing_advisory_dependencies WHERE attempt_id=$1", [attemptId])).rows;
      if (view.baseDependencies.some(dep => !consumed.some(row => row.kind === dep.kind && row.input_id === dep.inputId &&
        row.revision_id === dep.revisionId && row.content_digest === dep.contentDigest))) throw changed();
      const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
      if (row.valid_until.getTime() <= now.getTime() || Date.parse(snapshot.validUntil) <= now.getTime()) throw changed();
    });
  });
}

/** A previously admitted call must still own the current native step and exact
 * injection at provider release. This never increments the paid-step counter. */
export async function assertGovernedStaffingProviderRelease(principal: Principal,
  identity: { nativeSessionId: string; responseAttemptId: string; turnId: string; stepIndex: number }) {
  const prepared = await prepareStaffingNativeFence(principal);
  return withTransaction(async db => {
    const bound = await boundStaffingToolActor(db, principal, async (client, attemptId, context) => {
      if (attemptId !== prepared.attemptId) throw changed();
      await resolveStaffingAdvisoryFence(client, attemptId, context, { preparedOverlap: prepared.preparedOverlap });
    });
    if (bound.responseAttemptId !== identity.responseAttemptId || bound.nativeTurnId !== identity.turnId ||
      !Number.isSafeInteger(identity.stepIndex) || identity.stepIndex < 0 || bound.counters.modelSteps !== identity.stepIndex + 1) throw changed();
    const receipt = (await db.query(`SELECT c.eve_session_id,step.ordinal,inject.snapshot_digest
      FROM conversations c JOIN staffing_model_step_receipts step ON step.attempt_id=$2 AND step.step_token=$3
      JOIN context_injection_receipts inject ON inject.attempt_id=$4 AND inject.turn_id=$5
      WHERE c.id=$1 AND step.environment_id=c.environment_id AND step.workspace_id=c.workspace_id`,
      [bound.scope.conversationId, bound.attemptId, `${identity.turnId}/${identity.stepIndex}`, bound.responseAttemptId, identity.turnId])).rows[0];
    const charged = await readChargedStaffingSnapshot(db, bound);
    if (!receipt || receipt.eve_session_id !== identity.nativeSessionId || receipt.ordinal !== identity.stepIndex + 1 ||
      receipt.snapshot_digest !== charged.digest) throw changed();
  });
}
