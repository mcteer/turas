import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingInitialContextSchema, staffingContextInstruction } from "../../staffing/advice-context";
import { getServerConfig } from "../config";
import { readStaffingDeliveryContext } from "../profiles/context";
import { requireStaffingConversation, staffingScopeForConversation } from "./context";
import { resolveStaffingAdvisoryFence, staffingToolDependencies, staffingScenarioToolDependencies, staffingModelCitations } from "./fences";
import { staffingContextCharge } from "./model-budget";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { lockStaffingResourcePool } from "./pool-lock";
import { staffingSha256 } from "./commands";
import { requireStaffingEnvironment } from "./repository";

const changed = () => new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");

/** Capture once in the dispatch-claim transaction before any provider IO.
 * Call before conversation/response/advisory mutexes: the full governed domain
 * prefix comes first. This function does not dispatch, initialize or migrate.
 * Native entry points remain closed until the complete output bridge is wired. */
export async function captureStaffingInitialContext(db: PoolClient, actor: StaffingActor,
  conversationId: string, responseAttemptId: string, customerId: string) {
  const scope = await staffingScopeForConversation(db, conversationId);
  if (!scope || scope.ownerMembershipId !== actor.membershipId || scope.customerId !== customerId) throw hiddenRecord();
  await lockStaffingActor(db, actor, scope.mode === "finance" ? "finance" : "operational", { customerId });
  await requireStaffingEnvironment(db, true);
  await lockStaffingResourcePool(db, actor, "SHARE");
  const deliveryContext = await readStaffingDeliveryContext(actor, customerId, scope.workloadId, db);
  const current = await requireStaffingConversation(db, actor, conversationId, { deferScenario: true, deferDemandHead: true });
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const metadata = (await db.query(`SELECT id,response_attempt_id,state,dependency_count FROM staffing_advisory_attempts
    WHERE conversation_id=$1 AND owner_membership_id=$2 AND environment_id=$3 AND workspace_id=$4`,
    [conversationId, actor.membershipId, env, actor.workspaceId])).rows[0];
  if (!metadata || metadata.response_attempt_id !== responseAttemptId || metadata.state !== "prepared" || Number(metadata.dependency_count) !== 0) throw changed();
  const view = await resolveStaffingAdvisoryFence(db, metadata.id, { ...current, actor, deliveryContext });
  const dependencies = scope.scenarioId ? staffingScenarioToolDependencies(view) : staffingToolDependencies(view);
  const snapshot = staffingInitialContextSchema.parse({ ...deliveryContext, staffing: {
    contractVersion: "staffing-advice-v1", mode: scope.mode, demandId: scope.demandId,
    demandRevisionId: current.demand.revisionId, demand: current.demand.demand,
    scenarioId: scope.scenarioId, citations: staffingModelCitations(view, dependencies), planningOnly: true,
  } });
  // Cancellation takes conversation -> response -> advisory. The domain locks
  // are already held, so no later request can invert their authoritative prefix.
  const conversation = (await db.query(`SELECT context_audience,context_generation,context_valid_until,context_snapshot_schema,
    context_login_session_id,context_membership_id FROM conversations WHERE id=$1 AND owner_principal_id=$2
      AND environment_id=$3 AND workspace_id=$4 FOR UPDATE`, [conversationId, actor.principalId, env, actor.workspaceId])).rows[0];
  if (!conversation || conversation.context_audience !== "delivery" || conversation.context_generation !== snapshot.contextVersion ||
    conversation.context_snapshot_schema !== "customer-context-v1" || conversation.context_login_session_id !== actor.sessionId ||
    conversation.context_membership_id !== actor.membershipId) throw changed();
  const response = (await db.query(`SELECT dispatch_state,response_state FROM response_attempts
    WHERE id=$1 AND conversation_id=$2 FOR UPDATE`, [responseAttemptId, conversationId])).rows[0];
  const attempt = (await db.query(`SELECT state,response_attempt_id,read_calls,model_steps,context_bytes,dependency_count
    FROM staffing_advisory_attempts WHERE id=$1 FOR UPDATE`, [metadata.id])).rows[0];
  if (!response || response.dispatch_state !== "prepared" || response.response_state !== "pending" ||
    !attempt || attempt.state !== "prepared" || attempt.response_attempt_id !== responseAttemptId ||
    Number(attempt.read_calls) !== 0 || Number(attempt.model_steps) !== 0 || Number(attempt.dependency_count) !== 0) throw changed();
  const existing = await db.query("SELECT 1 FROM context_snapshot_receipts WHERE attempt_id=$1", [responseAttemptId]);
  const consumed = await db.query("SELECT 1 FROM staffing_advisory_dependencies WHERE attempt_id=$1 LIMIT 1", [metadata.id]);
  if (existing.rowCount || consumed.rowCount) throw changed();
  const deadline = new Date(Math.min(Date.parse(snapshot.validUntil), conversation.context_valid_until?.getTime() ?? Infinity));
  snapshot.validUntil = deadline.toISOString();
  const budget = staffingContextCharge({ contextBytes: Number(attempt.context_bytes), readCalls: 0, dependencyCount: 0 },
    { bytes: Buffer.byteLength(staffingContextInstruction(snapshot), "utf8"), read: false, dependencyCount: dependencies.length });
  const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
  if (deadline.getTime() <= now.getTime() || actor.expiresAt.getTime() <= now.getTime()) throw changed();
  for (const dep of dependencies) await db.query(`INSERT INTO staffing_advisory_dependencies
    (id,environment_id,workspace_id,attempt_id,kind,input_id,revision_id,generation,content_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(), env, actor.workspaceId, metadata.id, dep.kind, dep.inputId, dep.revisionId, dep.generation, dep.contentDigest]);
  await db.query(`INSERT INTO context_snapshot_receipts(id,attempt_id,conversation_id,workspace_id,customer_id,owner_principal_id,
    login_session_id,membership_id,environment_id,audience,generation,as_of,valid_until,schema_version,snapshot_digest,citation_ids,complete,truncated,snapshot)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'delivery',$10,$11,$12,'customer-context-v1',$13,$14,$15,$16,$17)`,
    [randomUUID(), responseAttemptId, conversationId, actor.workspaceId, customerId, actor.principalId, actor.sessionId, actor.membershipId,
      env, snapshot.contextVersion, snapshot.asOf, deadline, staffingSha256(snapshot), JSON.stringify(snapshot.entries.map(entry => entry.citationId)),
      snapshot.complete, snapshot.truncated, JSON.stringify(snapshot)]);
  await db.query("UPDATE conversations SET context_valid_until=$2 WHERE id=$1", [conversationId, deadline]);
  await db.query(`UPDATE response_attempts SET context_generation=$2,context_valid_until=$3,context_login_session_id=$4,
    context_membership_id=$5 WHERE id=$1`, [responseAttemptId, snapshot.contextVersion, deadline, actor.sessionId, actor.membershipId]);
  await db.query("UPDATE staffing_advisory_attempts SET context_bytes=$2,dependency_count=$3,updated_at=clock_timestamp() WHERE id=$1",
    [metadata.id, budget.contextBytes, budget.dependencyCount]);
  const release = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
  if (deadline.getTime() <= release.getTime() || actor.expiresAt.getTime() <= release.getTime()) throw changed();
  return snapshot;
}
