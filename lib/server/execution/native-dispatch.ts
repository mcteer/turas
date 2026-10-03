import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { EXECUTION_ADVICE_LIMITS } from "../../execution/advice";
import { conversationFeature } from "../conversations/feature";
import { normalizeMessageText, messageDigest } from "../conversations/dispatch";
import { getServerConfig } from "../config";
import { executionTransaction } from "./commands";
import { selectExecutionAdviceInputs, assertExecutionDependencies } from "./dependencies";
import { captureExecutionInitialContext } from "./initial-context";
import { executionId } from "./fields";
import type { ExecutionActor } from "./policy";
const changed = () => new HttpFailure(409, "execution_context_changed", "Execution explanation inputs changed");
async function worker(db: PoolClient) {
  if (!(await db.query("SELECT 1 FROM maintenance_workers WHERE environment_id=$1 AND last_seen_at>=clock_timestamp()-interval '15 seconds' LIMIT 1", [getServerConfig().TURAS_ENVIRONMENT_ID])).rowCount)
    throw new HttpFailure(503, "maintenance_unavailable", "Service unavailable");
}
export async function prepareExecutionNativeAttempt(actor: ExecutionActor, conversationId: string, nativeSessionId: string,
  requestKey: string, rawText: string, hasSelections: boolean, client?: PoolClient) {
  const text = normalizeMessageText(rawText).trim();
  if (!executionId.safeParse(requestKey).success || !text || text.length > 4000 || Buffer.byteLength(text, "utf8") > 16384)
    throw new HttpFailure(400, "invalid_input", "Invalid execution explanation message");
  if (hasSelections) throw new HttpFailure(422, "execution_selections_denied", "Attachments cannot expand this explanation");
  const run = async (db: PoolClient) => {
    const env = getServerConfig().TURAS_ENVIRONMENT_ID;
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [env]);
    const feature = await conversationFeature(db, conversationId);
    if (feature.kind !== "execution" || feature.scope.ownerMembershipId !== actor.membershipId) throw hiddenRecord();
    const meta = (await db.query(`SELECT a.id,a.native_request_id,a.response_attempt_id,a.state,p.instruction FROM execution_advice_attempts a
      JOIN execution_advice_instruction_payloads p ON p.attempt_id=a.id WHERE a.conversation_id=$1 AND a.owner_membership_id=$2`, [conversationId, actor.membershipId])).rows[0];
    if (!meta || meta.native_request_id !== requestKey || normalizeMessageText(meta.instruction).trim() !== text) throw changed();
    if (!["prepared", "running", "completed"].includes(meta.state)) throw changed();
    const current = await selectExecutionAdviceInputs(db, actor, feature.scope, meta.id);
    if (meta.state !== "prepared") await assertExecutionDependencies(db, meta.id, current.dependencies);
    const conversation = (await db.query(`SELECT eve_session_id,binding_state,context_login_session_id,context_membership_id FROM conversations
      WHERE id=$1 AND owner_principal_id=$2 FOR UPDATE`, [conversationId, actor.principalId])).rows[0];
    if (!conversation || conversation.eve_session_id !== nativeSessionId || conversation.binding_state !== "bound" ||
      conversation.context_login_session_id !== actor.sessionId || conversation.context_membership_id !== actor.membershipId) throw hiddenRecord();
    if (meta.response_attempt_id) {
      const prior = (await db.query(`SELECT a.id,a.dispatch_state,m.request_key,m.body_digest FROM response_attempts a JOIN submitted_messages m ON m.id=a.message_id
        WHERE a.id=$1 AND a.conversation_id=$2 FOR UPDATE OF a`, [meta.response_attempt_id, conversationId])).rows[0];
      if (!prior || prior.request_key !== requestKey || prior.body_digest !== messageDigest(text)) throw changed();
      return { attemptId: prior.id as string, created: false, dispatchState: prior.dispatch_state as string };
    }
    const attempt = (await db.query("SELECT state,response_attempt_id,native_request_id FROM execution_advice_attempts WHERE id=$1 FOR UPDATE", [meta.id])).rows[0];
    if (!attempt || attempt.state !== "prepared" || attempt.response_attempt_id || attempt.native_request_id !== requestKey ||
      (await db.query("SELECT 1 FROM response_attempts WHERE conversation_id=$1", [conversationId])).rowCount) throw changed();
    await worker(db);
    const counts = (await db.query(`SELECT
      (SELECT count(*) FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE c.owner_principal_id=$1
        AND a.response_state IN ('pending','running','stopping') AND a.dispatch_state<>'rejected') AS principal_active,
      (SELECT count(*) FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE c.environment_id=$2
        AND a.response_state IN ('pending','running','stopping') AND a.dispatch_state<>'rejected') AS environment_active`, [actor.principalId, env])).rows[0];
    if (Number(counts.principal_active) >= 2 || Number(counts.environment_active) >= 20) throw new HttpFailure(429, "send_limit", "Send limit reached", 60);
    const messageId = randomUUID(), responseAttemptId = randomUUID(), digest = messageDigest(text);
    await db.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,$5)", [messageId, conversationId, requestKey, digest, text]);
    await db.query(`INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state) VALUES($1,$2,$3,$4,'prepared','pending')`, [responseAttemptId, conversationId, messageId, digest]);
    await db.query("UPDATE execution_advice_attempts SET response_attempt_id=$2 WHERE id=$1", [meta.id, responseAttemptId]);
    return { attemptId: responseAttemptId, created: true, dispatchState: "prepared" };
  };
  return client ? run(client) : executionTransaction(run);
}
export async function claimExecutionNativeDispatch(actor: ExecutionActor, conversationId: string, responseAttemptId: string, dispatchStartIndex: number) {
  if (!Number.isSafeInteger(dispatchStartIndex) || dispatchStartIndex < 0) throw hiddenRecord();
  return executionTransaction(async db => {
    await captureExecutionInitialContext(db, actor, conversationId, responseAttemptId);
    await worker(db);
    const dispatchStartedAt = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date,
      deadlineAt = new Date(dispatchStartedAt.getTime() + EXECUTION_ADVICE_LIMITS.deadlineMs);
    const response = await db.query(`UPDATE response_attempts SET dispatch_state='dispatching',dispatch_start_index=$2,dispatch_started_at=$3,
      deadline_at=$4,updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND conversation_id=$5 AND dispatch_state='prepared' AND response_state='pending' RETURNING id`,
      [responseAttemptId, dispatchStartIndex, dispatchStartedAt, deadlineAt, conversationId]);
    if (!response.rowCount) throw changed();
    const advice = await db.query(`UPDATE execution_advice_attempts SET state='running',dispatch_at=$2,deadline_at=$3
      WHERE response_attempt_id=$1 AND conversation_id=$4 AND state='prepared' RETURNING id`, [responseAttemptId, dispatchStartedAt, deadlineAt, conversationId]);
    if (!advice.rowCount) throw changed();
    await db.query("INSERT INTO watchdog_jobs(attempt_id,deadline_at,state,next_attempt_at) VALUES($1,$2,'pending',$2)", [responseAttemptId, deadlineAt]);
    return { dispatchStartIndex, dispatchStartedAt, deadlineAt };
  });
}
