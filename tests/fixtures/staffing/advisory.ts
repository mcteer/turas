import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { createSyntheticDemandBaseline } from "./demands";
import { createProfileTestSession } from "../profiles";
import { createDemand, qualifyDemand, readDemand } from "../../../lib/server/staffing/demands";
import { createFreshStaffingConversation } from "../../../lib/server/staffing/context";
import { staffingExact } from "./allocations";
import { requireOwnedStaffingClone } from "../../../scripts/staffing-eval-environment";

/** Synthetic DB identities for quota/ownership transactions only. Never claim
 * these are a real native session, provider call, transport or output proof. */
export async function createSyntheticRunningAdvisoryFixture(db: PoolClient) {
  requireOwnedStaffingClone();
  const baseline = await createSyntheticDemandBaseline(db), actor = await createProfileTestSession(db, "panel");
  const draft = await createDemand(actor, { requestKey: randomUUID(), rationale: "Synthetic bounded-read demand", demand: baseline.demand }, db);
  const qualified = await qualifyDemand(actor, draft.demandId, { ...staffingExact(draft), requestKey: randomUUID(), rationale: "Synthetic bounded-read qualification" }, db);
  const demand = await readDemand(actor, qualified.demandId, db), scope = await createFreshStaffingConversation(db, actor, demand, "operational", null);
  const messageId = randomUUID(), responseAttemptId = randomUUID(), attemptId = randomUUID(), nativeSessionId = `wrun_synthetic_${randomUUID().replaceAll("-", "")}`;
  const turnId = `synthetic_${randomUUID()}`;
  await db.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text)
    VALUES($1,$2,$3,$4,'Synthetic quota transaction fixture')`, [messageId, scope.conversationId, randomUUID(), "d".repeat(64)]);
  await db.query(`INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,native_turn_id)
    VALUES($1,$2,$3,$4,'admitted','running',$5)`, [responseAttemptId, scope.conversationId, messageId, "d".repeat(64), turnId]);
  await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1", [scope.conversationId, nativeSessionId]);
  await db.query(`INSERT INTO staffing_advisory_attempts(id,environment_id,workspace_id,binding_id,conversation_id,request_key,request_digest,
    owner_membership_id,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'prepared')`,
    [attemptId, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, scope.bindingId, scope.conversationId, randomUUID(), "e".repeat(64), actor.membershipId]);
  await db.query(`UPDATE staffing_advisory_attempts SET state='running',response_attempt_id=$2,native_request_id=$3,
    dispatch_at=now(),deadline_at=now()+interval '120 seconds' WHERE id=$1`, [attemptId, responseAttemptId, randomUUID()]);
  return { actor, demand, scope, attemptId, responseAttemptId, nativeSessionId, turnId,
    principal: { principalId: actor.principalId, attributes: { turasAttemptId: responseAttemptId } } };
}
