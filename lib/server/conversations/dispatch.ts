import {assertNativeConversationOpen} from './native-retirement-state';
import {ordinaryNativeFilesEnabled,assertNativeFileEvaluationOpen} from './native-file-policy';
import {assertCustomerQuestionReads} from "./customer-accounts";
import { prepareExecutionNativeAttempt, claimExecutionNativeDispatch } from "../execution/native-dispatch";
import { prepareExpansionNativeAttempt, claimExpansionNativeDispatch } from "../expansion/native";
import { prepareSupportNativeAttempt, claimSupportNativeDispatch } from "../support/native";
import { conversationFeature } from "./feature";
import { prepareLearningNativeAttempt,claimLearningNativeDispatch } from '../learning/native';
import { randomUUID } from "node:crypto";
import {messageDigest,normalizeMessageText} from './message-integrity';
export {messageDigest,normalizeMessageText} from './message-integrity';
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { lockOwnedBinding } from "./binding";
import { captureAttemptContext, readCurrentAttemptContext } from "../profiles/attempt-context";
import { artifactContextSchemaReady, assertArtifactDependenciesCurrent } from "../artifacts/context-fence";
import { assertRetrievalDependenciesCurrent } from "../retrieval/fences";
import { canonicalArtifactSendDigest, captureArtifactDraft,
  type DraftSelection } from "../artifacts/context";
import { planningScopeForConversation } from "../plans/context";
import { staffingScopeForConversation } from "../staffing/context";
import { prepareStaffingNativeAttempt, claimStaffingNativeDispatch } from "../staffing/native-dispatch";
import { prepareGovernedNativeRelease, assertGovernedNativeRelease } from "./native-release";
import { staffingSha256 } from "../staffing/commands";
import type { PoolClient } from "pg";
import { captureGeneralContext } from "./general-context";
import { titleFromMessage } from "../../conversations/title";
import {deriveSteeringAttempt} from './steering';
import {parseOrdinaryNativeMessage,nativeMessageDigest,summarizeNativeMessage,sameNativeUploadReferences,canonicalNativeUploadTransport} from "./native-message";
import {nativeMessageText,type OrdinaryNativeMessage} from "../../conversations/native-message";
import {attachmentLimits,parseAttachmentMessage} from '../../conversations/attachment-text';
import {bindNativeUploads} from './native-uploads';

async function requireWorkerHeartbeat(client: import("pg").PoolClient): Promise<void> {
  const result = await client.query(`SELECT 1 FROM maintenance_workers
    WHERE environment_id = $1 AND last_seen_at >= now() - interval '15 seconds' LIMIT 1`,
  [getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!result.rowCount) throw new HttpFailure(503, "maintenance_unavailable", "Service unavailable");
}

export type PrepareAttemptBoundary='prepare-feature'|'prepare-environment'|'prepare-owner'|'prepare-admission'|'prepare-planning'|'prepare-context'|'prepare-artifacts'|'prepare-customer-reads'|'prepare-replay'|'prepare-active'|'prepare-heartbeat'|'prepare-quota'|'prepare-message'|'prepare-title'|'prepare-attempt';
export async function prepareAttempt(
  session: CurrentSession, conversationId: string, nativeSessionId: string,
  requestKey: string, rawText: string|OrdinaryNativeMessage, selections: readonly DraftSelection[] = [],
  existingClient?: PoolClient,
  boundary?:(stage:PrepareAttemptBoundary)=>void,
): Promise<{ attemptId: string; created: boolean; dispatchState: string; governed?: boolean }> {
  boundary?.('prepare-feature');
  const feature = existingClient ? await conversationFeature(existingClient, conversationId) : await withTransaction(db => conversationFeature(db, conversationId));
  if(typeof rawText!=='string'&&feature.kind!=='normal')throw new HttpFailure(422,'native_files_scope','Use the governed source workflow for this conversation');
  const textInput=typeof rawText==='string'?rawText:'';
  if(feature.kind==='learning')return {...await prepareLearningNativeAttempt(session,conversationId,nativeSessionId,requestKey,textInput,selections.length>0,existingClient),governed:true};
  if (feature.kind === "execution") return { ...await prepareExecutionNativeAttempt(session, conversationId, nativeSessionId, requestKey, textInput, selections.length > 0, existingClient), governed: true };
  if(feature.kind==="expansion")return {...await prepareExpansionNativeAttempt(session,conversationId,nativeSessionId,requestKey,textInput,selections.length>0,existingClient),governed:true};
  if (feature.kind === "support") return { ...await prepareSupportNativeAttempt(session, conversationId, nativeSessionId, requestKey, textInput, selections.length > 0, existingClient), governed: true };
  if (feature.kind === "staffing") return { ...await prepareStaffingNativeAttempt(session, conversationId, nativeSessionId, requestKey, textInput, selections.length > 0, existingClient), governed: true };
  const nativeParts=typeof rawText==='string'?null:parseOrdinaryNativeMessage(rawText);
  if(nativeParts&&selections.length)throw new HttpFailure(422,'native_file_selections','Send native files separately from selected source passages');
  const text=nativeParts?summarizeNativeMessage(nativeParts):normalizeMessageText(textInput);
  const suppliedText=nativeParts?nativeMessageText(nativeParts):text;
  if (!text.trim()) throw new HttpFailure(422, "invalid_message", "Message required");
  const documentMessage=feature.kind==='normal'?parseAttachmentMessage(suppliedText):null;
  if (Buffer.byteLength(text, "utf8") > (documentMessage||nativeParts?attachmentLimits.messageBytes:16*1024)) {
    throw new HttpFailure(413, "message_too_large", "Message too large");
  }
  const digest = nativeParts?nativeMessageDigest(nativeParts):selections.length ? canonicalArtifactSendDigest(text,selections) : messageDigest(text);
  const run = async (client: PoolClient) => {
    const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
    if(nativeParts&&(Number((await client.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[environmentId])).rows[0]?.schema_version??0)<72||!ordinaryNativeFilesEnabled(conversationId)))throw new HttpFailure(503,'native_files_unavailable','Native file messages are not enabled');
    if(documentMessage && (Number((await client.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[environmentId])).rows[0]?.schema_version??0)<71 || process.env.TURAS_ORDINARY_ATTACHMENTS_DISABLED==='1'))
      throw new HttpFailure(503,'attachments_unavailable','Document messages are temporarily unavailable');
    boundary?.('prepare-environment');await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [environmentId]);
    boundary?.('prepare-owner');const conversation = await lockOwnedBinding(client, session, conversationId);
    boundary?.('prepare-admission');await assertNativeConversationOpen(client,conversationId);
    assertNativeFileEvaluationOpen(conversationId);
    // A first feature binder can win after the metadata preflight. Never let
    // an ordinary send cross that committed scope under the conversation lock.
    if (["execution", "staffing", "support", "expansion", "learning"].includes((await conversationFeature(client, conversationId)).kind))
      throw new HttpFailure(409, "conversation_already_bound", "Use the bound workflow to start this explanation");
    if (conversation.customer_id === null && (selections.length || process.env.TURAS_GENERAL_CHAT_DISABLED === "1")) {
      throw new HttpFailure(422,"general_scope_only","Customer sources require a customer-scoped conversation");
    }
    if (conversation.binding_state !== "bound" || conversation.eve_session_id !== nativeSessionId) {
      throw hiddenRecord();
    }
    boundary?.('prepare-planning');const planning=await planningScopeForConversation(client,conversationId);
    if (planning) {
      if (selections.length) throw new HttpFailure(422,"planning_selections_denied",
        "Source selections are unavailable during drafting");
      const selected=await client.query<{id:string;state:string;request_key:string;
        actor_membership_id:string;actor_session_id:string;deadline_at:Date;
        instructions:string}>(`SELECT drafting.id,drafting.state,drafting.request_key,
          drafting.actor_membership_id,drafting.actor_session_id,drafting.deadline_at,
          payload.instructions FROM plan_drafting_attempts drafting
          JOIN plan_drafting_instruction_payloads payload ON payload.attempt_id=drafting.id
          WHERE drafting.conversation_id=$1 FOR UPDATE OF drafting`,[conversationId]);
      const row=selected.rows[0];
      if (!row || row.request_key!==requestKey ||
          row.actor_membership_id!==session.membershipId ||
          row.actor_session_id!==session.sessionId ||
          !["prepared","running"].includes(row.state) ||
          row.deadline_at.getTime()<=Date.now() ||
          normalizeMessageText(row.instructions).trim()!==text) {
        throw new HttpFailure(409,"plan_draft_changed",
          "Plan drafting context changed");
      }
    }
    boundary?.('prepare-context');const context = await client.query<{ context_snapshot_schema: string | null;
      context_generation: string | null; context_valid_until: Date | null }>(
      "SELECT context_snapshot_schema,context_generation,context_valid_until FROM conversations WHERE id=$1",
      [conversationId]);
    if (conversation.customer_id !== null && (context.rows[0]?.context_snapshot_schema !== "customer-context-v1" ||
        context.rows[0]?.context_generation === null)) {
      throw new HttpFailure(409, "historical_conversation", "Start a new conversation for current customer context");
    }
    const liveNormal=feature.kind==='normal' && (conversation.customer_id===null || !!conversation.live_customer_context);
    if (!liveNormal && context.rows[0].context_valid_until && context.rows[0].context_valid_until.getTime() <= Date.now()) {
      throw new HttpFailure(409, "context_changed", "Start a new conversation for current customer context");
    }
    boundary?.('prepare-artifacts');await assertArtifactDependenciesCurrent(client, conversationId);
    boundary?.('prepare-customer-reads');if(liveNormal)await assertCustomerQuestionReads(client,session,conversationId,undefined,false);
    else await assertRetrievalDependenciesCurrent(client, conversationId);
    boundary?.('prepare-replay');const existing = await client.query<{ id: string; body_digest: string; attempt_id: string; dispatch_state: string; native_parts:unknown }>(`
      SELECT sm.id, sm.body_digest, a.id AS attempt_id, a.dispatch_state,to_jsonb(sm)->'ordinary_native_parts' AS native_parts
      FROM submitted_messages sm JOIN response_attempts a ON a.message_id = sm.id
      WHERE sm.conversation_id = $1 AND sm.request_key = $2
    `, [conversationId, requestKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].body_digest !== digest || !sameNativeUploadReferences(existing.rows[0].native_parts,nativeParts)) {
        throw new HttpFailure(409, "request_key_conflict", "Request key already used");
      }
      return { attemptId: existing.rows[0].attempt_id, created: false,
        dispatchState: existing.rows[0].dispatch_state };
    }
    boundary?.('prepare-active');const outstanding = await client.query(`SELECT 1 FROM response_attempts
      WHERE conversation_id = $1 AND response_state IN ('pending','running','stopping')
        AND dispatch_state <> 'rejected' LIMIT 1`, [conversationId]);
    if (outstanding.rowCount) {
      throw new HttpFailure(409, "conversation_busy", "Conversation has an active response");
    }
    boundary?.('prepare-heartbeat');await requireWorkerHeartbeat(client);
    boundary?.('prepare-quota');const limits = await client.query<{
      principal_active: string; environment_active: string; recent_sends: string; output_tokens: string;
    }>(`
      SELECT
        (SELECT count(*) FROM response_attempts a JOIN conversations c ON c.id = a.conversation_id
          WHERE c.owner_principal_id = $1 AND a.response_state IN ('pending','running','stopping')
            AND a.dispatch_state <> 'rejected') AS principal_active,
        (SELECT count(*) FROM response_attempts a JOIN conversations c ON c.id = a.conversation_id
          WHERE c.environment_id = $2 AND a.response_state IN ('pending','running','stopping')
            AND a.dispatch_state <> 'rejected') AS environment_active,
        (SELECT count(*) FROM submitted_messages sm JOIN conversations c ON c.id = sm.conversation_id
          WHERE c.owner_principal_id = $1 AND sm.created_at > now() - interval '1 minute') AS recent_sends,
        (SELECT coalesce(sum(a.output_tokens),0) FROM response_attempts a
          WHERE a.conversation_id = $3) AS output_tokens
    `, [session.principalId, environmentId, conversationId]);
    const counts = limits.rows[0];
    if (Number(counts.principal_active) >= 2 || Number(counts.environment_active) >= 20 ||
        Number(counts.recent_sends) >= 20 || Number(counts.output_tokens) >= 20_000) {
      throw new HttpFailure(429, "send_limit", "Send limit reached", 60);
    }
    const messageId = randomUUID();
    const attemptId = randomUUID();
    boundary?.('prepare-message');if(nativeParts)await client.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text,ordinary_native_parts) VALUES($1,$2,$3,$4,$5,$6)`,[messageId,conversationId,requestKey,digest,text,JSON.stringify(nativeParts)]);
    else await client.query(`INSERT INTO submitted_messages
      (id, conversation_id, request_key, body_digest, text)
      VALUES ($1,$2,$3,$4,$5)`, [messageId, conversationId, requestKey, digest, text]);
    if(nativeParts)await bindNativeUploads(client,session,conversationId,messageId,nativeParts);
    boundary?.('prepare-title');await client.query(`UPDATE conversations SET title=$2 WHERE id=$1
      AND title='New conversation' AND NOT EXISTS(SELECT 1 FROM submitted_messages
        WHERE conversation_id=$1 AND id<>$3)`,[conversationId,titleFromMessage(documentMessage?(documentMessage.prompt||`Attachment: ${documentMessage.documents[0].filename}`):text),messageId]);
    boundary?.('prepare-attempt');await client.query(`INSERT INTO response_attempts
      (id, conversation_id, message_id, input_digest, dispatch_state, response_state)
      VALUES ($1,$2,$3,$4,'prepared','pending')`, [attemptId, conversationId, messageId, nativeParts?messageDigest(text):digest]);
    if (planning) {
      await client.query(`UPDATE plan_drafting_attempts SET state='running',
        response_attempt_id=$2,updated_at=now() WHERE conversation_id=$1
          AND state='prepared'`,[conversationId,attemptId]);
    }
    if (selections.length && conversation.customer_id) await captureArtifactDraft(client,session,conversationId,
      conversation.customer_id,attemptId,messageDigest(text),digest,selections);
    return { attemptId, created: true, dispatchState: "prepared" };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

export async function claimDispatch(
  session: CurrentSession, conversationId: string, attemptId: string, dispatchStartIndex: number,
): Promise<{ dispatchStartIndex: number; dispatchStartedAt: Date; deadlineAt: Date }> {
  if (!Number.isSafeInteger(dispatchStartIndex) || dispatchStartIndex < 0) {
    throw new HttpFailure(503, "invalid_native_cursor", "Service unavailable");
  }
  const feature = await withTransaction(db => conversationFeature(db, conversationId));
  if(feature.kind==='learning')return claimLearningNativeDispatch(session,conversationId,attemptId,dispatchStartIndex);
  if (feature.kind === "execution") return claimExecutionNativeDispatch(session, conversationId, attemptId, dispatchStartIndex);
  if(feature.kind==="expansion")return claimExpansionNativeDispatch(session,conversationId,attemptId,dispatchStartIndex);
  if (feature.kind === "support") return claimSupportNativeDispatch(session, conversationId, attemptId, dispatchStartIndex);
  if (feature.kind === "staffing") {
    return claimStaffingNativeDispatch(session, conversationId, attemptId, dispatchStartIndex);
  }
  return withTransaction(async (client) => {
    const conversation = await lockOwnedBinding(client, session, conversationId);
    await requireWorkerHeartbeat(client);
    const attempt = await client.query<{ dispatch_state: string; response_state: string }>(`
      SELECT dispatch_state, response_state FROM response_attempts
      WHERE id = $1 AND conversation_id = $2 FOR UPDATE
    `, [attemptId, conversationId]);
    if (!attempt.rows[0] || attempt.rows[0].dispatch_state !== "prepared" ||
        attempt.rows[0].response_state !== "pending") {
      throw new HttpFailure(409, "dispatch_claimed", "Dispatch already claimed");
    }
    if (conversation.customer_id) await captureAttemptContext(client, session, conversationId, attemptId, conversation.customer_id);
    if(!conversation.customer_id || conversation.live_customer_context && (await conversationFeature(client,conversationId)).kind==='normal')
      await captureGeneralContext(client,session,conversationId,attemptId);
    const dispatchStartedAt = new Date();
    const deadlineAt = new Date(dispatchStartedAt.getTime() + 120_000);
    await client.query(`UPDATE response_attempts SET dispatch_state = 'dispatching',
      dispatch_start_index = $2, dispatch_started_at = $3, deadline_at = $4,
      updated_at = now(), revision = revision + 1 WHERE id = $1`,
    [attemptId, dispatchStartIndex, dispatchStartedAt, deadlineAt]);
    await client.query(`INSERT INTO watchdog_jobs
      (attempt_id, deadline_at, state, next_attempt_at)
      VALUES ($1,$2,'pending',$2)`, [attemptId, deadlineAt]);
    return { dispatchStartIndex, dispatchStartedAt, deadlineAt };
  });
}

export async function getAttemptReceipt(
  session: CurrentSession, conversationId: string, attemptId: string,
): Promise<Response | null> {
  const prepared = await prepareGovernedNativeRelease(conversationId, { actor: session, responseAttemptId: attemptId, allowUnclaimedTurn: true });
  return withTransaction(async (client) => {
    if (prepared) await assertGovernedNativeRelease(client, prepared, session);
    else await lockOwnedBinding(client, session, conversationId);
    const result = await client.query<{
      dispatch_state: string; native_receipt: unknown; native_response_status: number | null;
      native_response_headers: Record<string, string> | null;
    }>(`SELECT dispatch_state, native_receipt, native_response_status, native_response_headers
      FROM response_attempts WHERE id = $1 AND conversation_id = $2`,
    [attemptId, conversationId]);
    const row = result.rows[0];
    if (!row) throw hiddenRecord();
    if (!['admitted', 'rejected'].includes(row.dispatch_state) ||
        !row.native_receipt || !row.native_response_status) return null;
    return Response.json(row.native_receipt, {
      status: row.native_response_status,
      headers: { ...(row.native_response_headers ?? {}), "Cache-Control": "private, no-store" },
    });
  });
}

export async function recordNativePreAdmissionRejection(
  session: CurrentSession, conversationId: string, attemptId: string, nativeResponse: Response,
): Promise<void> {
  const receipt = await nativeResponse.clone().json() as unknown;
  if (nativeResponse.status !== 409 || typeof receipt !== "object" || receipt === null ||
      !("code" in receipt) || receipt.code !== "session_not_ready") {
    throw new HttpFailure(503, "invalid_native_rejection", "Service unavailable");
  }
  await withTransaction(async (client) => {
    await lockOwnedBinding(client, session, conversationId);
    const changed = await client.query(`UPDATE response_attempts SET dispatch_state = 'rejected',
      response_state = 'failed', native_receipt = $2, native_response_status = 409,
      native_response_headers = '{}'::jsonb, last_error_code = 'session_not_ready',
      updated_at = now(), revision = revision + 1
      WHERE id = $1 AND conversation_id = $3 AND dispatch_state = 'dispatching'`,
    [attemptId, JSON.stringify(receipt), conversationId]);
    if (!changed.rowCount) throw new HttpFailure(409, "dispatch_claimed", "Dispatch state changed");
    const governedFeature = await conversationFeature(client, conversationId);
    if(governedFeature.kind==='learning')await client.query("UPDATE learning_attempts SET state='failed',failure_code='native_pre_admission_rejected',settled_at=clock_timestamp(),version=version+1 WHERE response_attempt_id=$1 AND conversation_id=$2 AND state='running'",[attemptId,conversationId]);
    if (governedFeature.kind === "staffing" || governedFeature.kind === "execution") await client.query(`UPDATE ${governedFeature.kind === "staffing" ? "staffing_advisory_attempts" : "execution_advice_attempts"} SET state='failed',
      failure_code='native_pre_admission_rejected',settled_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE response_attempt_id=$1 AND conversation_id=$2 AND state='running'`, [attemptId, conversationId]);
    await client.query(`UPDATE watchdog_jobs SET state = 'settled', updated_at = now()
      WHERE attempt_id = $1`, [attemptId]);
  });
}

export async function recordNativeReceipt(
  session: CurrentSession, conversationId: string, attemptId: string, nativeResponse: Response,
): Promise<void> {
  const body = await nativeResponse.clone().text();
  if (Buffer.byteLength(body) > 32 * 1024) {
    throw new HttpFailure(503, "invalid_native_receipt", "Service unavailable");
  }
  let receipt: unknown;
  try { receipt = JSON.parse(body); }
  catch { throw new HttpFailure(503, "invalid_native_receipt", "Service unavailable"); }
  const deliveryId = typeof receipt === "object" && receipt !== null &&
    "deliveryId" in receipt && typeof receipt.deliveryId === "string" ? receipt.deliveryId : null;
  const headers: Record<string, string> = {};
  for (const [key, value] of nativeResponse.headers) {
    if (key === "content-type" || key.startsWith("x-eve-")) headers[key] = value;
  }
  const prepared = await prepareGovernedNativeRelease(conversationId, { actor: session, responseAttemptId: attemptId, allowUnclaimedTurn: true });
  await withTransaction(async (client) => {
    if (prepared) await assertGovernedNativeRelease(client, prepared, session);
    else await lockOwnedBinding(client, session, conversationId);
    const prior = (await client.query(`SELECT a.*,c.eve_session_id,sm.text AS original_text,sm.body_digest AS original_body_digest,to_jsonb(sm)->'ordinary_native_parts' AS original_parts,
      e.native_session_id AS projected_session,e.turn_id AS projected_turn,e.visible_payload
      FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id
      JOIN submitted_messages sm ON sm.id=a.message_id AND sm.conversation_id=a.conversation_id
      LEFT JOIN event_projections e ON e.native_event_id=a.input_event_id AND e.conversation_id=a.conversation_id AND e.event_type='message.received'
      WHERE a.id=$1 AND a.conversation_id=$2 FOR UPDATE OF a`,[attemptId,conversationId])).rows[0];
    if (prior?.native_receipt !== null && prior?.native_receipt !== undefined) {
      if (staffingSha256(prior.native_receipt) !== staffingSha256(receipt) || prior.native_response_status !== nativeResponse.status ||
        staffingSha256(prior.native_response_headers) !== staffingSha256(headers)) {
        throw new HttpFailure(409, "native_receipt_changed", "Native receipt differs from the saved result");
      }
      return;
    }
    if(prior?.native_delivery_id && prior.native_delivery_id!==deliveryId)
      throw new HttpFailure(409,'native_receipt_changed','Native delivery differs from the accepted input');
    let projectedOrdinary=false;
    if(!prepared && prior?.dispatch_state==='admitted' && (await conversationFeature(client,conversationId)).kind==='normal'){
      const artifact=await artifactContextSchemaReady(client)?(await client.query('SELECT native_text_digest,canonical_request_digest FROM artifact_context_receipts WHERE attempt_id=$1',[attemptId])).rows[0]:undefined;
      const originalBound=Array.isArray(prior.original_parts)
        ? nativeMessageDigest(parseOrdinaryNativeMessage(prior.original_parts))===prior.original_body_digest &&
          summarizeNativeMessage(prior.original_parts)===prior.original_text && messageDigest(prior.original_text)===prior.input_digest
        : artifact ? artifact.canonical_request_digest===prior.original_body_digest && prior.original_body_digest===prior.input_digest
        : typeof prior.original_text==='string' && messageDigest(prior.original_text)===prior.input_digest && prior.original_body_digest===prior.input_digest;
      projectedOrdinary=originalBound && !!deliveryId && prior.native_delivery_id===deliveryId && !!prior.input_event_id && !!prior.native_turn_id &&
        prior.projected_session===prior.eve_session_id && prior.projected_turn===prior.native_turn_id &&
        typeof prior.visible_payload?.message==='string' && messageDigest(prior.visible_payload.message)===(artifact?.native_text_digest??prior.input_digest);
    }
    const result = await client.query(`UPDATE response_attempts SET
      dispatch_state = 'admitted', native_delivery_id = $2,
      native_receipt = $3, native_response_status = $4, native_response_headers = $5,
      updated_at = now(), revision = revision + 1
      WHERE id = $1 AND conversation_id = $6 AND (dispatch_state = 'dispatching' OR ($7 AND dispatch_state='admitted'))
        AND native_receipt IS NULL`,
    [attemptId, deliveryId, JSON.stringify(receipt), nativeResponse.status,
      JSON.stringify(headers), conversationId, Boolean(prepared)||projectedOrdinary]);
    if (!result.rowCount) throw new HttpFailure(409, "dispatch_claimed", "Dispatch state changed");
  });
}

export async function markDispatchUncertain(
  session: CurrentSession, conversationId: string, attemptId: string, code = "receipt_unavailable",
): Promise<void> {
  await withTransaction(async (client) => {
    await lockOwnedBinding(client, session, conversationId);
    await client.query(`UPDATE response_attempts SET dispatch_state = 'uncertain',
      last_error_code = $2, updated_at = now(), revision = revision + 1
      WHERE id = $1 AND conversation_id = $3 AND dispatch_state = 'dispatching'`,
    [attemptId, code, conversationId]);
    const governedFeature = await conversationFeature(client, conversationId);
    if(governedFeature.kind==='learning')await client.query("UPDATE learning_attempts SET state='unconfirmed',failure_code='native_completion_unconfirmed',version=version+1 WHERE response_attempt_id=$1 AND conversation_id=$2 AND state='running'",[attemptId,conversationId]);
    if (governedFeature.kind === "staffing" || governedFeature.kind === "execution") await client.query(`UPDATE ${governedFeature.kind === "staffing" ? "staffing_advisory_attempts" : "execution_advice_attempts"} SET state='unconfirmed',
      failure_code='native_completion_unconfirmed',settled_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE response_attempt_id=$1 AND conversation_id=$2 AND state='running'`, [attemptId, conversationId]);
  });
}

export async function deriveNativeAttempt(
  session: CurrentSession, nativeSessionId: string, requestKey: string, message: unknown,
  options:{trustedHydrated?:true}={},
): Promise<string> {
  const steering=await deriveSteeringAttempt(session,nativeSessionId,requestKey,message,options);
  if(steering)return steering;
  const staffingAttempt = await withTransaction(async db => {
    const row = (await db.query(`SELECT a.id,a.conversation_id FROM response_attempts a JOIN submitted_messages sm ON sm.id=a.message_id
      JOIN conversations c ON c.id=a.conversation_id WHERE c.eve_session_id=$1 AND c.owner_principal_id=$2 AND c.environment_id=$3
      AND sm.request_key=$4 AND a.dispatch_state='dispatching'`,
      [nativeSessionId, session.principalId, getServerConfig().TURAS_ENVIRONMENT_ID, requestKey])).rows[0];
    return row && ["staffing", "execution", "support", "expansion", "learning"].includes((await conversationFeature(db, row.conversation_id)).kind) ? row as { id: string; conversation_id: string } : null;
  });
  if (staffingAttempt) {
    if(typeof message!=='string')throw hiddenRecord();
    const text=message;
    const prepared = await prepareGovernedNativeRelease(staffingAttempt.conversation_id,
      { actor: session, nativeSessionId, responseAttemptId: staffingAttempt.id, allowUnclaimedTurn: true });
    if (!prepared) throw hiddenRecord();
    return withTransaction(async db => {
      await assertGovernedNativeRelease(db, prepared, session);
      const row = (await db.query(`SELECT a.dispatch_state,sm.body_digest,sm.request_key FROM response_attempts a
        JOIN submitted_messages sm ON sm.id=a.message_id WHERE a.id=$1 AND a.conversation_id=$2`,
        [staffingAttempt.id, staffingAttempt.conversation_id])).rows[0];
      if (!row || row.dispatch_state !== "dispatching" || row.request_key !== requestKey || row.body_digest !== messageDigest(text)) throw hiddenRecord();
      return staffingAttempt.id;
    });
  }
  const result = await withTransaction(async (client) => {
    const found = await client.query<{ id: string; conversation_id: string; body_digest: string;ordinary_native_parts:unknown }>(`
      SELECT a.id, a.conversation_id, sm.body_digest,sm.ordinary_native_parts
      FROM response_attempts a
      JOIN submitted_messages sm ON sm.id = a.message_id
      JOIN conversations c ON c.id = a.conversation_id
      WHERE c.eve_session_id = $1 AND c.owner_principal_id = $2
        AND c.environment_id = $3 AND sm.request_key = $4 AND c.workspace_id=$5 AND c.binding_state='bound'
        AND a.dispatch_state = 'dispatching'
      LIMIT 1
    `, [nativeSessionId, session.principalId,
      getServerConfig().TURAS_ENVIRONMENT_ID, requestKey,session.workspaceId]);
    const row = found.rows[0];
    if (!row) throw hiddenRecord();
    assertNativeFileEvaluationOpen(row.conversation_id);
    // Compare the exact saved public input before parsing its server transport:
    // generated file hints are not additional user text or document envelopes.
    const transport=canonicalNativeUploadTransport(row.ordinary_native_parts,message,row.body_digest);
    const resolved=transport??message;
    const nativeParts=typeof resolved==='string'?null:transport!==null?transport as OrdinaryNativeMessage:parseOrdinaryNativeMessage(resolved,options);
    const text=nativeParts?summarizeNativeMessage(nativeParts):resolved as string;
    if(nativeParts&&!ordinaryNativeFilesEnabled(row.conversation_id))throw hiddenRecord();
    const artifact = await artifactContextSchemaReady(client)
      ? await client.query<{ native_text_digest: string }>(
        "SELECT native_text_digest FROM artifact_context_receipts WHERE attempt_id=$1", [row.id])
      : null;
    const uploadTransport=transport!==null;
    if(uploadTransport&&(!ordinaryNativeFilesEnabled(row.conversation_id)||(await conversationFeature(client,row.conversation_id)).kind!=='normal'))throw hiddenRecord();
    if (!uploadTransport && (nativeParts ? row.body_digest!==nativeMessageDigest(nativeParts)||(await conversationFeature(client,row.conversation_id)).kind!=='normal' : (artifact?.rows[0]?.native_text_digest ?? row.body_digest) !== messageDigest(text))) throw hiddenRecord();
    await lockOwnedBinding(client, session, row.conversation_id);
    await readCurrentAttemptContext(client, row.id, session.principalId);
    return row.id;
  });
  return result;
}
