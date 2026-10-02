import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { staffingAdvisoryStartSchema } from "../../contracts/staffing-advisory";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { parseStaffing, runStaffingCommand, staffingSha256 } from "./commands";
import { readDemand } from "./demands";
import { createFreshStaffingConversation, requireStaffingConversation } from "./context";
import type { StaffingActor } from "./policy";
import { staffingContextCharge } from "./model-budget";
import { readStaffingScenario } from "./scenarios";

/** Persist one fresh private request before native binding or provider IO. Native
 * dispatch is a separate owned operation; this function never invokes a model. */
export async function prepareStaffingAdvisory(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingAdvisoryStartSchema, raw), request = { ...input, action: "advisory_prepare" };
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  return runStaffingCommand(actor, request, { capability: input.mode === "finance" ? "finance" : "operational",
    customerId: input.customerId, rateKind: "advisory", authorizeReplay: async db => {
      const old = (await db.query(`SELECT a.conversation_id FROM staffing_advisory_attempts a JOIN staffing_conversation_bindings b ON b.id=a.binding_id
        WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.owner_membership_id=$3 AND a.request_key=$4 AND b.customer_id=$5`,
        [env, actor.workspaceId, actor.membershipId, input.requestKey, input.customerId])).rows[0];
      if (!old) throw hiddenRecord();
      await requireStaffingConversation(db, actor, old.conversation_id);
    } }, async db => {
    const demand = await readDemand(actor, input.demandId, db);
    if (demand.customerId !== input.customerId) throw hiddenRecord();
    if (demand.revisionId !== input.revisionId || demand.contentDigest !== input.contentDigest || demand.aggregateVersion !== input.expectedAggregateVersion ||
      demand.state !== "qualified" || demand.reviewRequired || demand.contentAvailability !== "readable" || !demand.demand) {
      throw new HttpFailure(409, "context_changed", "Review the current qualified staffing demand");
    }
    if (input.scenarioId) {
      const scenario = await readStaffingScenario(actor, input.scenarioId, db);
      if (scenario.customerId !== demand.customerId || scenario.engagementId !== demand.engagementId || scenario.baselineId !== demand.baselineId) throw hiddenRecord();
      if (scenario.contentAvailability !== "readable" || !scenario.content || scenario.status === "stale") {
        throw new HttpFailure(409, "context_changed", "Review the current planning scenario");
      }
    }
    // Serialize the rolling admission window across different demand heads and
    // wall-clock hour boundaries. No external work or provider call holds it.
    const mutex = staffingSha256({ environment: env, workspace: actor.workspaceId, actor: actor.membershipId, operation: "advisory_hour" });
    await db.query("SELECT pg_advisory_xact_lock($1::bigint)", [BigInt.asIntN(64, BigInt(`0x${mutex.slice(0, 16)}`)).toString()]);
    const count = (await db.query(`SELECT count(*)::int AS n FROM staffing_advisory_attempts WHERE environment_id=$1 AND workspace_id=$2
      AND owner_membership_id=$3 AND created_at>clock_timestamp()-interval '1 hour'`, [env, actor.workspaceId, actor.membershipId])).rows[0];
    if (Number(count.n) >= 5) throw new HttpFailure(429, "staffing_advisory_limit", "Staffing explanation limit reached", 3600);
    const fresh = await createFreshStaffingConversation(db, actor, demand, input.mode, input.scenarioId), attemptId = randomUUID(), nativeRequestId = randomUUID();
    const budget = staffingContextCharge({ contextBytes: 0, readCalls: 0, dependencyCount: 0 },
      { bytes: Buffer.byteLength(input.instructions, "utf8"), read: false, dependencyCount: 0 });
    await db.query(`INSERT INTO staffing_advisory_attempts(id,environment_id,workspace_id,binding_id,conversation_id,
      request_key,request_digest,owner_membership_id,state,context_bytes,native_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'prepared',$9,$10)`,
      [attemptId, env, actor.workspaceId, fresh.bindingId, fresh.conversationId, input.requestKey, staffingSha256(request), actor.membershipId, budget.contextBytes, nativeRequestId]);
    await db.query("INSERT INTO staffing_advisory_instruction_payloads(attempt_id,instruction) VALUES($1,$2)", [attemptId, input.instructions]);
    return { attemptId, conversationId: fresh.conversationId, operationId: fresh.operationId, nativeRequestId, demandId: demand.demandId, revisionId: demand.revisionId,
      contentDigest: demand.contentDigest, state: "prepared" };
  }, client);
}
