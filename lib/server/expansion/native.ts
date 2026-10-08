import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { expansionId } from "../../contracts/expansion";
import { EXPANSION_ADVICE_LIMITS } from "../../expansion/advice";
import { getServerConfig } from "../config";
import { conversationFeature, type FeaturePrincipal } from "../conversations/feature";
import { normalizeMessageText, messageDigest } from "../conversations/dispatch";
import { expansionTransaction } from "./service";
import { expansionHash } from "./commands";
import { captureExpansionAdviceContext } from "./context";
import { expansionSourcesSchema } from "./schema";
import type { ExpansionActor } from "./policy";
import { boundExpansionToolActor } from "./tool-actor";

const changed = () => new HttpFailure(409, "expansion_context_changed", "Expansion advice inputs changed; refresh the prepared request");
async function prepared(db: PoolClient, actor: ExpansionActor, conversationId: string) {
  const feature = await conversationFeature(db, conversationId);
  if (feature.kind !== "expansion" || feature.scope.ownerMembershipId !== actor.membershipId) throw hiddenRecord();
  const meta = (await db.query(`SELECT * FROM expansion_advice_attempts WHERE conversation_id=$1 AND owner_membership_id=$2`, [conversationId, actor.membershipId])).rows[0];
  const payloads = meta ? (await db.query("SELECT kind,payload FROM expansion_advice_payloads WHERE attempt_id=$1", [meta.id])).rows : [];
  const context = payloads.find(row => row.kind === "context")?.payload;
  if (!meta || !context || new Date(meta.created_at).getTime()+30*86400000<=Date.now() || !["prepared", "running", "completed"].includes(meta.state) ||
    (await db.query("SELECT 1 FROM expansion_advice_retirements WHERE attempt_id=$1", [meta.id])).rowCount) throw changed();
  const current = await captureExpansionAdviceContext(db, actor, feature.scope,
    expansionSourcesSchema.parse(context.fence.requestRefs), context.snapshot.question);
  if (current.digest !== expansionHash(context.fence)) throw changed();
  return { feature, meta, context, instruction: payloads.find(row => row.kind === "instruction")?.payload as string };
}
async function requireWorker(db: PoolClient) {
  if (!(await db.query("SELECT 1 FROM maintenance_workers WHERE environment_id=$1 AND last_seen_at>=clock_timestamp()-interval '15 seconds' LIMIT 1", [getServerConfig().TURAS_ENVIRONMENT_ID])).rowCount)
    throw new HttpFailure(503, "maintenance_unavailable", "Expansion advice maintenance is unavailable");
}
export async function prepareExpansionNativeAttempt(actor: ExpansionActor, conversationId: string, nativeSessionId: string,
  requestKey: string, rawText: string, hasSelections: boolean, client?: PoolClient) {
  const text = normalizeMessageText(rawText).trim();
  if (!expansionId.safeParse(requestKey).success || !text || Buffer.byteLength(text, "utf8") > 16384) throw new HttpFailure(400, "invalid_input", "Invalid expansion advice message");
  if (hasSelections) throw new HttpFailure(422, "expansion_selections_denied", "Attachments cannot expand prepared expansion advice");
  const run = async (db: PoolClient) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [getServerConfig().TURAS_ENVIRONMENT_ID]);
    const { meta, instruction } = await prepared(db, actor, conversationId);
    if (meta.native_request_id !== requestKey || normalizeMessageText(instruction).trim() !== text) throw changed();
    const conversation = (await db.query(`SELECT * FROM conversations WHERE id=$1 AND owner_principal_id=$2 FOR UPDATE`, [conversationId, actor.principalId])).rows[0];
    if (!conversation || conversation.eve_session_id !== nativeSessionId || conversation.binding_state !== "bound" ||
      conversation.context_login_session_id !== actor.sessionId || conversation.context_membership_id !== actor.membershipId) throw hiddenRecord();
    if (meta.response_attempt_id) {
      const prior = (await db.query(`SELECT a.id,a.dispatch_state,m.request_key,m.body_digest FROM response_attempts a
        JOIN submitted_messages m ON m.id=a.message_id WHERE a.id=$1 AND a.conversation_id=$2 FOR UPDATE OF a`, [meta.response_attempt_id, conversationId])).rows[0];
      if (!prior || prior.request_key !== requestKey || prior.body_digest !== messageDigest(text)) throw changed();
      return { attemptId: prior.id as string, created: false, dispatchState: prior.dispatch_state as string };
    }
    const attempt = (await db.query("SELECT * FROM expansion_advice_attempts WHERE id=$1 FOR UPDATE", [meta.id])).rows[0];
    if (attempt.state !== "prepared" || attempt.response_attempt_id || Date.now() - attempt.created_at.getTime() >= EXPANSION_ADVICE_LIMITS.requestExpiryMs ||
      (await db.query("SELECT 1 FROM response_attempts WHERE conversation_id=$1", [conversationId])).rowCount) throw changed();
    await requireWorker(db);
    const messageId = randomUUID(), responseAttemptId = randomUUID(), digest = messageDigest(text);
    await db.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,$5)", [messageId, conversationId, requestKey, digest, text]);
    await db.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state) VALUES($1,$2,$3,$4,'prepared','pending')", [responseAttemptId, conversationId, messageId, digest]);
    await db.query("UPDATE expansion_advice_attempts SET response_attempt_id=$2 WHERE id=$1", [meta.id, responseAttemptId]);
    return { attemptId: responseAttemptId, created: true, dispatchState: "prepared" };
  };
  return client ? run(client) : expansionTransaction(run);
}
export async function claimExpansionNativeDispatch(actor: ExpansionActor, conversationId: string, responseAttemptId: string, dispatchStartIndex: number) {
  if (!Number.isSafeInteger(dispatchStartIndex) || dispatchStartIndex < 0) throw hiddenRecord();
  return expansionTransaction(async db => {
    const { meta, context, feature } = await prepared(db, actor, conversationId);
    await db.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [conversationId]);
    await requireWorker(db);
    const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (meta.response_attempt_id !== responseAttemptId || meta.state !== "prepared" || now.getTime() - meta.created_at.getTime() >= EXPANSION_ADVICE_LIMITS.requestExpiryMs) throw changed();
    const deadlineAt = new Date(now.getTime() + EXPANSION_ADVICE_LIMITS.deadlineMs);
    const response = await db.query(`UPDATE response_attempts SET dispatch_state='dispatching',dispatch_start_index=$2,dispatch_started_at=$3,
      deadline_at=$4,updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND conversation_id=$5 AND dispatch_state='prepared' AND response_state='pending' RETURNING id`,
    [responseAttemptId, dispatchStartIndex, now, deadlineAt, conversationId]);
    if (!response.rowCount) throw changed();
    const advice = await db.query(`UPDATE expansion_advice_attempts SET state='running',dispatch_at=$2,deadline_at=$3
      WHERE id=$1 AND response_attempt_id=$4 AND state='prepared' RETURNING id`, [meta.id, now, deadlineAt, responseAttemptId]);
    if (!advice.rowCount) throw changed();
    const generation = Number(context.fence.dependencies.find((ref:{kind:string;generation:number})=>ref.kind==='profile_collection')?.generation??0);
    const validUntil = new Date(Math.min(deadlineAt.getTime(), actor.expiresAt.getTime()));
    await db.query(`INSERT INTO context_snapshot_receipts(id,attempt_id,conversation_id,workspace_id,customer_id,owner_principal_id,login_session_id,
      membership_id,environment_id,audience,generation,as_of,valid_until,schema_version,snapshot_digest,citation_ids,complete,truncated,snapshot)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'customer-context-v1',$14,'[]',true,false,$15::jsonb)`,
    [randomUUID(), responseAttemptId, conversationId, actor.workspaceId, feature.scope.customerId, actor.principalId, actor.sessionId,
      actor.membershipId, getServerConfig().TURAS_ENVIRONMENT_ID, feature.scope.audience, generation, now, validUntil,
      expansionHash(context.snapshot), JSON.stringify({ contractVersion: "expansion-context-retained-v1", attemptId: meta.id })]);
    await db.query("UPDATE conversations SET context_valid_until=$2 WHERE id=$1", [conversationId, validUntil]);
    await db.query("UPDATE response_attempts SET context_generation=$2,context_valid_until=$3,context_login_session_id=$4,context_membership_id=$5 WHERE id=$1", [responseAttemptId, generation, validUntil, actor.sessionId, actor.membershipId]);
    await db.query("INSERT INTO watchdog_jobs(attempt_id,deadline_at,state,next_attempt_at) VALUES($1,$2,'pending',$2)", [responseAttemptId, deadlineAt]);
    return { dispatchStartIndex, dispatchStartedAt: now, deadlineAt };
  });
}
export async function readExpansionInitialContext(principal: FeaturePrincipal, turnId: string, nativeSessionId: string, recordInjection = true) {
  if (!turnId || turnId.length > 180) throw hiddenRecord();
  return expansionTransaction(async db => {
    const bound = await boundExpansionToolActor(db, principal, turnId);
    if (bound.nativeSessionId !== nativeSessionId || bound.nativeTurnId !== turnId) throw hiddenRecord();
    const digest = expansionHash(bound.snapshot);
    if (recordInjection) await db.query("INSERT INTO context_injection_receipts(attempt_id,turn_id,snapshot_digest) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [bound.responseAttemptId, turnId, digest]);
    const prior = (await db.query("SELECT snapshot_digest FROM context_injection_receipts WHERE attempt_id=$1 AND turn_id=$2", [bound.responseAttemptId, turnId])).rows[0];
    if (prior?.snapshot_digest !== digest) throw changed();
    return bound.snapshot;
  });
}
