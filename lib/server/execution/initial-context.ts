import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { executionContextCharge } from "../../execution/advice";
import { executionInitialContextSchema, executionContextInstruction } from "../../execution/advice-context";
import { conversationFeature, type FeaturePrincipal } from "../conversations/feature";
import { getServerConfig } from "../config";
import { executionDigest, executionTransaction } from "./commands";
import { selectExecutionAdviceInputs, insertExecutionDependencies } from "./dependencies";
import { boundExecutionToolActor } from "./tool-actor";
import type { ExecutionActor } from "./policy";
const changed = () => new HttpFailure(409, "source_changed", "Execution explanation inputs changed");

export async function captureExecutionInitialContext(db: PoolClient, actor: ExecutionActor, conversationId: string, responseAttemptId: string) {
  const feature = await conversationFeature(db, conversationId);
  if (feature.kind !== "execution" || feature.scope.ownerMembershipId !== actor.membershipId) throw hiddenRecord();
  const metadata = (await db.query("SELECT id,response_attempt_id,state FROM execution_advice_attempts WHERE conversation_id=$1 AND owner_membership_id=$2", [conversationId, actor.membershipId])).rows[0];
  if (!metadata || metadata.state !== "prepared" || metadata.response_attempt_id !== responseAttemptId) throw changed();
  const current = await selectExecutionAdviceInputs(db, actor, feature.scope, metadata.id), { view, summary, identity, dependencies } = current;
  const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
  const tomorrow = new Date(now); tomorrow.setUTCHours(24, 0, 0, 0);
  const validUntil = new Date(Math.min(tomorrow.getTime(), actor.expiresAt.getTime()));
  const snapshot = executionInitialContextSchema.parse({ contractVersion: "customer-context-v1", ...identity, asOf: summary.asOf, validUntil: validUntil.toISOString(),
    entries: [], complete: true, truncated: false, execution: { contractVersion: "execution-advice-v1", engagementId: feature.scope.engagementId,
      baselineId: feature.scope.baselineId, generation: feature.scope.generation, period: feature.scope.period,
      summary, milestones: view.milestones.map(m => ({ id: m.id, key: m.key, title: m.title, state: m.state, version: m.version, plannedDate: m.plannedDate, unknownDateReason: m.unknownPlannedDateReason })),
      citations: dependencies.filter(d => !["actor", "session"].includes(d.kind)) } });
  await db.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [conversationId]);
  const response = (await db.query("SELECT dispatch_state,response_state FROM response_attempts WHERE id=$1 AND conversation_id=$2 FOR UPDATE", [responseAttemptId, conversationId])).rows[0];
  const attempt = (await db.query("SELECT state,response_attempt_id,context_bytes,read_calls,model_steps,dependency_count FROM execution_advice_attempts WHERE id=$1 FOR UPDATE", [metadata.id])).rows[0];
  if (!response || response.dispatch_state !== "prepared" || response.response_state !== "pending" || !attempt || attempt.state !== "prepared" ||
    attempt.response_attempt_id !== responseAttemptId || Number(attempt.read_calls) || Number(attempt.model_steps) || Number(attempt.dependency_count) ||
    (await db.query("SELECT 1 FROM context_snapshot_receipts WHERE attempt_id=$1", [responseAttemptId])).rowCount) throw changed();
  const charge = executionContextCharge({ contextBytes: Number(attempt.context_bytes), readCalls: 0, dependencyCount: 0 },
    { bytes: Buffer.byteLength(executionContextInstruction(snapshot), "utf8"), read: false, dependencyCount: dependencies.length });
  await insertExecutionDependencies(db, metadata.id, dependencies);
  await db.query(`INSERT INTO context_snapshot_receipts(id,attempt_id,conversation_id,workspace_id,customer_id,owner_principal_id,login_session_id,
    membership_id,environment_id,audience,generation,as_of,valid_until,schema_version,snapshot_digest,citation_ids,complete,truncated,snapshot)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'internal',$10,$11,$12,'customer-context-v1',$13,$14,true,false,$15)`,
    [randomUUID(), responseAttemptId, conversationId, actor.workspaceId, feature.scope.customerId, actor.principalId, actor.sessionId, actor.membershipId,
      getServerConfig().TURAS_ENVIRONMENT_ID, identity.contextVersion, snapshot.asOf, snapshot.validUntil, executionDigest(snapshot), JSON.stringify(snapshot.execution.citations.map(d => d.revisionId).filter(Boolean)), JSON.stringify({contractVersion:"execution-context-retained-v1",attemptId:metadata.id})]);
  await db.query("INSERT INTO execution_advice_context_payloads(attempt_id,snapshot) VALUES($1,$2)",[metadata.id,JSON.stringify(snapshot)]);
  await db.query("UPDATE conversations SET context_valid_until=$2 WHERE id=$1", [conversationId, snapshot.validUntil]);
  await db.query(`UPDATE response_attempts SET context_generation=$2,context_valid_until=$3,context_login_session_id=$4,context_membership_id=$5 WHERE id=$1`,
    [responseAttemptId, identity.contextVersion, snapshot.validUntil, actor.sessionId, actor.membershipId]);
  await db.query("UPDATE execution_advice_attempts SET context_bytes=$2,dependency_count=$3 WHERE id=$1", [metadata.id, charge.contextBytes, charge.dependencyCount]);
  if ((await db.query("SELECT clock_timestamp() AS now")).rows[0].now.getTime() >= validUntil.getTime()) throw changed();
  return snapshot;
}
export async function readChargedExecutionSnapshot(db: PoolClient, bound: Awaited<ReturnType<typeof boundExecutionToolActor>>) {
  const row = (await db.query(`SELECT p.snapshot,snapshot_digest,owner_principal_id,login_session_id,membership_id,audience,generation,valid_until,
    r.environment_id,r.workspace_id,r.customer_id FROM context_snapshot_receipts r JOIN execution_advice_attempts a ON a.response_attempt_id=r.attempt_id JOIN execution_advice_context_payloads p ON p.attempt_id=a.id WHERE r.attempt_id=$1 AND r.conversation_id=$2`, [bound.responseAttemptId, bound.scope.conversationId])).rows[0];
  if (!row || row.owner_principal_id !== bound.actor.principalId || row.login_session_id !== bound.actor.sessionId || row.membership_id !== bound.actor.membershipId ||
    row.audience !== "internal" || row.generation !== bound.current.identity.contextVersion || row.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID ||
    row.workspace_id !== bound.actor.workspaceId || row.customer_id !== bound.scope.customerId) throw changed();
  const snapshot = executionInitialContextSchema.parse(row.snapshot);
  if (executionDigest(snapshot) !== row.snapshot_digest || snapshot.execution.engagementId !== bound.scope.engagementId || snapshot.execution.baselineId !== bound.scope.baselineId ||
    snapshot.execution.generation !== bound.scope.generation || executionDigest(snapshot.execution.period) !== executionDigest(bound.scope.period) ||
    row.valid_until.getTime() <= Date.now() || Date.parse(snapshot.validUntil) <= Date.now() ||
    Buffer.byteLength(executionContextInstruction(snapshot), "utf8") > bound.counters.contextBytes) throw changed();
  return { snapshot, digest: row.snapshot_digest as string };
}
export async function readExecutionInitialContext(principal: FeaturePrincipal, turnId: string, nativeSessionId: string, recordInjection = true) {
  if (!turnId || turnId.length > 180) throw hiddenRecord();
  return executionTransaction(async db => {
    const bound = await boundExecutionToolActor(db, principal, { release: true, incomingTurnId: turnId });
    if (bound.nativeSessionId !== nativeSessionId || bound.nativeTurnId && bound.nativeTurnId !== turnId) throw hiddenRecord();
    const charged = await readChargedExecutionSnapshot(db, bound);
    const prior = (await db.query("SELECT snapshot_digest FROM context_injection_receipts WHERE attempt_id=$1 AND turn_id=$2", [bound.responseAttemptId, turnId])).rows[0];
    if (prior && prior.snapshot_digest !== charged.digest || !prior && !recordInjection) throw changed();
    if (!prior) await db.query("INSERT INTO context_injection_receipts(attempt_id,turn_id,snapshot_digest) VALUES($1,$2,$3)", [bound.responseAttemptId, turnId, charged.digest]);
    if (Date.now() >= bound.deadlineAt.getTime() || Date.now() >= bound.actor.expiresAt.getTime()) throw changed();
    return charged.snapshot;
  });
}
