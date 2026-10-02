import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingIdSchema, STAFFING_LIMITS } from "../../contracts/staffing";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { requireStaffingConversation, staffingScopeForConversation } from "./context";
import { readStaffingDeliveryContext } from "../profiles/context";
import { resolveStaffingAdvisoryFence } from "./fences";
import { lockStaffingActor, type StaffingActor } from "./policy";
import { lockStaffingResourcePool } from "./pool-lock";
import { resolveStaffingOverlap } from "./temporal";
import { captureStaffingInitialContext } from "./initial-context";
import { normalizeMessageText, messageDigest } from "../conversations/dispatch";
import { parseStaffing } from "./commands";

const changed = () => new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");
type Overlap = { revisionId: string; contentDigest: string; intervals: ReturnType<typeof resolveStaffingOverlap> };

async function overlapPreflight(actor: StaffingActor, conversationId: string, client?: PoolClient): Promise<Overlap> {
  const read = async (db: PoolClient) => {
    const scope = await staffingScopeForConversation(db, conversationId);
    if (!scope || scope.ownerMembershipId !== actor.membershipId) throw hiddenRecord();
    await lockStaffingActor(db, actor, scope.mode === "finance" ? "finance" : "operational", { customerId: scope.customerId, write: true });
    await lockStaffingResourcePool(db, actor, "SHARE");
    await readStaffingDeliveryContext(actor, scope.customerId, scope.workloadId, db);
    return requireStaffingConversation(db, actor, conversationId);
  };
  const current = client ? await read(client) : await withTransaction(read);
  if (client && current.demand.demand!.overlap) throw new HttpFailure(503, "staffing_overlap_preflight_required", "Staffing timezone preparation requires a separate transaction");
  return { revisionId: current.demand.revisionId, contentDigest: current.demand.contentDigest,
    intervals: current.demand.demand!.overlap ? resolveStaffingOverlap(current.demand.demand!.overlap) : [] };
}

async function worker(db: PoolClient) {
  const alive = await db.query(`SELECT 1 FROM maintenance_workers WHERE environment_id=$1
    AND last_seen_at>=clock_timestamp()-interval '15 seconds' LIMIT 1`, [getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!alive.rowCount) throw new HttpFailure(503, "maintenance_unavailable", "Service unavailable");
}

/** One prepared advisory owns one server-generated native request key and one
 * response. Exact replay returns the existing association after full fencing;
 * a new key/text/selection cannot start a second turn in this conversation. */
export async function prepareStaffingNativeAttempt(actor: StaffingActor, conversationId: string, nativeSessionId: string,
  rawKey: string, rawText: string, hasSelections: boolean, client?: PoolClient) {
  const requestKey = parseStaffing(staffingIdSchema, rawKey), text = normalizeMessageText(rawText).trim();
  if (hasSelections) throw new HttpFailure(422, "staffing_selections_denied", "Attachments cannot expand a staffing explanation");
  if (!text || text.length > STAFFING_LIMITS.advisoryInstructions || Buffer.byteLength(text, "utf8") > 16_384) {
    throw new HttpFailure(422, "invalid_message", "Staffing instructions exceed the native message limits");
  }
  const overlap = await overlapPreflight(actor, conversationId, client);
  const run = async (db: PoolClient) => {
    const env = getServerConfig().TURAS_ENVIRONMENT_ID;
    // Match the existing native environment admission order before actor rows.
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [env]);
    const scope = await staffingScopeForConversation(db, conversationId);
    if (!scope || scope.ownerMembershipId !== actor.membershipId) throw hiddenRecord();
    await lockStaffingActor(db, actor, scope.mode === "finance" ? "finance" : "operational", { customerId: scope.customerId, write: true });
    await lockStaffingResourcePool(db, actor, "SHARE");
    const deliveryContext = await readStaffingDeliveryContext(actor, scope.customerId, scope.workloadId, db);
    const current = await requireStaffingConversation(db, actor, conversationId, { deferScenario: true, deferDemandHead: true });
    const meta = (await db.query(`SELECT a.id,a.native_request_id,a.response_attempt_id,a.state,p.instruction
      FROM staffing_advisory_attempts a JOIN staffing_advisory_instruction_payloads p ON p.attempt_id=a.id
      WHERE a.conversation_id=$1 AND a.owner_membership_id=$2 AND a.environment_id=$3 AND a.workspace_id=$4`,
      [conversationId, actor.membershipId, env, actor.workspaceId])).rows[0];
    if (!meta || meta.native_request_id !== requestKey || normalizeMessageText(meta.instruction).trim() !== text) throw changed();
    await resolveStaffingAdvisoryFence(db, meta.id, { ...current, actor, deliveryContext }, { preparedOverlap: overlap });
    const conversation = (await db.query(`SELECT eve_session_id,binding_state FROM conversations
      WHERE id=$1 AND owner_principal_id=$2 AND context_login_session_id=$3 AND context_membership_id=$4 FOR UPDATE`,
      [conversationId, actor.principalId, actor.sessionId, actor.membershipId])).rows[0];
    if (!conversation || conversation.eve_session_id !== nativeSessionId || conversation.binding_state !== "bound") throw hiddenRecord();
    if (meta.response_attempt_id) {
      const prior = (await db.query(`SELECT a.id,a.dispatch_state,m.request_key,m.body_digest FROM response_attempts a
        JOIN submitted_messages m ON m.id=a.message_id WHERE a.id=$1 AND a.conversation_id=$2 FOR UPDATE OF a`,
        [meta.response_attempt_id, conversationId])).rows[0];
      if (!prior || prior.request_key !== requestKey || prior.body_digest !== messageDigest(text)) throw changed();
      return { attemptId: prior.id as string, created: false, dispatchState: prior.dispatch_state as string };
    }
    const attempt = (await db.query("SELECT state,response_attempt_id,native_request_id FROM staffing_advisory_attempts WHERE id=$1 FOR UPDATE", [meta.id])).rows[0];
    if (!attempt || attempt.state !== "prepared" || attempt.response_attempt_id || attempt.native_request_id !== requestKey) throw changed();
    if ((await db.query("SELECT 1 FROM response_attempts WHERE conversation_id=$1 LIMIT 1", [conversationId])).rowCount) throw changed();
    await worker(db);
    const counts = (await db.query(`SELECT
      (SELECT count(*) FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE c.owner_principal_id=$1
        AND a.response_state IN ('pending','running','stopping') AND a.dispatch_state<>'rejected') AS principal_active,
      (SELECT count(*) FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE c.environment_id=$2
        AND a.response_state IN ('pending','running','stopping') AND a.dispatch_state<>'rejected') AS environment_active`, [actor.principalId, env])).rows[0];
    if (Number(counts.principal_active) >= 2 || Number(counts.environment_active) >= 20) throw new HttpFailure(429, "send_limit", "Send limit reached", 60);
    const messageId = randomUUID(), responseAttemptId = randomUUID(), digest = messageDigest(text);
    await db.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,$5)",
      [messageId, conversationId, requestKey, digest, text]);
    await db.query(`INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state)
      VALUES($1,$2,$3,$4,'prepared','pending')`, [responseAttemptId, conversationId, messageId, digest]);
    await db.query("UPDATE staffing_advisory_attempts SET response_attempt_id=$2,updated_at=clock_timestamp() WHERE id=$1", [meta.id, responseAttemptId]);
    return { attemptId: responseAttemptId, created: true, dispatchState: "prepared" };
  };
  return client ? run(client) : withTransaction(run);
}

/** Claim once and capture all initial content in the same transaction. A crash
 * after commit leaves a durable possible-dispatch outcome and cannot redispatch.
 * Native IO and cursor acquisition remain outside this transaction. */
export async function claimStaffingNativeDispatch(actor: StaffingActor, conversationId: string, responseAttemptId: string,
  dispatchStartIndex: number) {
  if (!Number.isSafeInteger(dispatchStartIndex) || dispatchStartIndex < 0) throw new HttpFailure(503, "invalid_native_cursor", "Service unavailable");
  return withTransaction(async db => {
    const scope = await staffingScopeForConversation(db, conversationId);
    if (!scope) throw hiddenRecord();
    await captureStaffingInitialContext(db, actor, conversationId, responseAttemptId, scope.customerId);
    await worker(db);
    const dispatchStartedAt = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    const deadlineAt = new Date(dispatchStartedAt.getTime() + STAFFING_LIMITS.advisoryDeadlineMilliseconds);
    const updated = await db.query(`UPDATE response_attempts SET dispatch_state='dispatching',dispatch_start_index=$2,
      dispatch_started_at=$3,deadline_at=$4,updated_at=clock_timestamp(),revision=revision+1
      WHERE id=$1 AND conversation_id=$5 AND dispatch_state='prepared' AND response_state='pending' RETURNING id`,
      [responseAttemptId, dispatchStartIndex, dispatchStartedAt, deadlineAt, conversationId]);
    if (!updated.rowCount) throw changed();
    const advice = await db.query(`UPDATE staffing_advisory_attempts SET state='running',dispatch_at=$2,deadline_at=$3,
      updated_at=clock_timestamp() WHERE response_attempt_id=$1 AND conversation_id=$4 AND state='prepared' RETURNING id`,
      [responseAttemptId, dispatchStartedAt, deadlineAt, conversationId]);
    if (!advice.rowCount) throw changed();
    await db.query("INSERT INTO watchdog_jobs(attempt_id,deadline_at,state,next_attempt_at) VALUES($1,$2,'pending',$2)", [responseAttemptId, deadlineAt]);
    return { dispatchStartIndex, dispatchStartedAt, deadlineAt };
  });
}
