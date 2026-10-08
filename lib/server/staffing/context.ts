import { assertFreshFeatureConversation, conversationFeature } from "../conversations/feature";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import { readDemand } from "./demands";
import { readStaffingScenario } from "./scenarios";
import { lockStaffingActor, type StaffingActor } from "./policy";
export type StaffingScope = { bindingId: string; conversationId: string; ownerMembershipId: string;
  customerId: string; workloadId: string | null; demandId: string; demandRevisionId: string;
  mode: "operational" | "finance"; scenarioId: string | null };

/** Metadata only. Consumers must perform live actor and dependency checks before
 * releasing any context. Older features work before the 007 schema is installed. */
export async function staffingScopeForConversation(db: PoolClient, conversationId: string): Promise<StaffingScope | null> {
  const marker = (await db.query("SELECT schema_version FROM turas_environment LIMIT 1")).rows[0];
  if (Number(marker?.schema_version ?? 0) < 34) return null;
  const row = (await db.query(`SELECT id,owner_membership_id,customer_id,workload_id,demand_id,demand_revision_id,mode,scenario_id
    FROM staffing_conversation_bindings WHERE conversation_id=$1 AND environment_id=$2`,
    [conversationId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  return row ? { bindingId: row.id, conversationId, ownerMembershipId: row.owner_membership_id,
    customerId: row.customer_id, workloadId: row.workload_id, demandId: row.demand_id,
    demandRevisionId: row.demand_revision_id, mode: row.mode, scenarioId: row.scenario_id } : null;
}

/** Until staffing's own charged context and complete dependency bridge are
 * connected, every generic native surface stays closed for this binding.
 * Capture alone is insufficient: existing/uncertain sessions can reach history,
 * reconnect, event projection or an exact dispatch replay without capture. */
export async function rejectUnbridgedStaffingNative(db: PoolClient, conversationId: string) {
  if (["staffing", "execution", "support"].includes((await conversationFeature(db, conversationId)).kind)) {
    throw new HttpFailure(503, "staffing_native_unavailable", "Staffing explanation context is not available");
  }
}

/** Live scope checks precede content retrieval. The native request/step/read and
 * output-fence layers additionally bind their immutable consumed dependencies. */
export async function requireStaffingConversation(db: PoolClient, actor: StaffingActor, conversationId: string,
  options: { deferScenario?: boolean; deferDemandHead?: boolean } = {}) {
  const scope = await staffingScopeForConversation(db, conversationId);
  if (!scope || scope.ownerMembershipId !== actor.membershipId) throw hiddenRecord();
  await lockStaffingActor(db, actor, scope.mode === "finance" ? "finance" : "operational", { customerId: scope.customerId });
  // Finance snapshots take this mutex. Acquire it before the demand and any
  // workforce prefix, never upgrade a held engagement SHARE after resources.
  const demand = await readDemand(actor, scope.demandId, db, scope.scenarioId ? "UPDATE" : "SHARE", Boolean(options.deferDemandHead));
  if (demand.customerId !== scope.customerId || demand.workloadId !== scope.workloadId || demand.revisionId !== scope.demandRevisionId ||
    demand.state !== "qualified" || demand.reviewRequired || demand.contentAvailability !== "readable" || !demand.demand) {
    throw new HttpFailure(409, "context_changed", "Start a new staffing explanation");
  }
  const row = (await db.query(`SELECT c.context_audience,c.context_generation,c.context_membership_id,c.context_login_session_id,
    p.delivery_generation FROM conversations c JOIN customer_profile_state p ON p.customer_id=c.customer_id AND p.workspace_id=c.workspace_id
    WHERE c.id=$1 AND c.environment_id=$2 AND c.workspace_id=$3 AND c.owner_principal_id=$4`,
    [conversationId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, actor.principalId])).rows[0];
  if (!row || row.context_audience !== "delivery" || row.context_generation !== row.delivery_generation ||
    row.context_membership_id !== actor.membershipId || row.context_login_session_id !== actor.sessionId) {
    throw new HttpFailure(409, "context_changed", "Start a new staffing explanation");
  }
  if (scope.scenarioId && !options.deferScenario) {
    if (scope.mode !== "finance") throw new HttpFailure(409, "context_changed", "Start a new staffing explanation");
    const scenario = await readStaffingScenario(actor, scope.scenarioId, db);
    if (scenario.customerId !== scope.customerId || scenario.engagementId !== demand.engagementId ||
      scenario.baselineId !== demand.baselineId || scenario.contentAvailability !== "readable" || !scenario.content || scenario.status === "stale") {
      throw new HttpFailure(409, "context_changed", "Start a new staffing explanation");
    }
  }
  return { scope, demand };
}

/** Caller holds current actor/demand locks; no provider/session IO occurs here.
 * The database independently rejects populated or mixed conversation bindings. */
export async function createFreshStaffingConversation(db: PoolClient, actor: StaffingActor,
  demand: Awaited<ReturnType<typeof readDemand>>, mode: StaffingScope["mode"], scenarioId: string | null) {
  if (!demand.demand || demand.state !== "qualified" || demand.reviewRequired || demand.contentAvailability !== "readable" ||
    mode === "operational" && scenarioId !== null) throw new HttpFailure(409, "context_changed", "Current qualified demand required");
  await lockStaffingActor(db, actor, mode === "finance" ? "finance" : "operational", { customerId: demand.customerId, write: true });
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const state = (await db.query("SELECT delivery_generation FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2 FOR SHARE", [demand.customerId, actor.workspaceId])).rows[0];
  if (!state) throw hiddenRecord();
  const conversationId = randomUUID(), operationId = randomUUID(), bindingId = randomUUID();
  await db.query(`INSERT INTO conversations(id,environment_id,workspace_id,customer_id,owner_principal_id,
    creation_operation_id,binding_state,title,context_audience,context_generation,context_snapshot_schema,context_login_session_id,context_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,'unbound','Staffing explanation','delivery',$7,'customer-context-v1',$8,$9)`,
    [conversationId, env, actor.workspaceId, demand.customerId, actor.principalId, operationId, state.delivery_generation, actor.sessionId, actor.membershipId]);
  await assertFreshFeatureConversation(db,conversationId);
  await db.query(`INSERT INTO staffing_conversation_bindings(id,environment_id,workspace_id,conversation_id,
    owner_membership_id,customer_id,workload_id,demand_id,demand_revision_id,mode,scenario_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [bindingId, env, actor.workspaceId, conversationId, actor.membershipId, demand.customerId, demand.workloadId, demand.demandId, demand.revisionId, mode, scenarioId]);
  return { conversationId, operationId, bindingId };
}
