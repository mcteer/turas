import { prepareExecutionNativeAttempt, claimExecutionNativeDispatch } from "../execution/native-dispatch";
import { prepareExpansionNativeAttempt, claimExpansionNativeDispatch } from "../expansion/native";
import { prepareSupportNativeAttempt, claimSupportNativeDispatch } from "../support/native";
import { conversationFeature } from "./feature";
import { createHash, randomUUID } from "node:crypto";
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

export function normalizeMessageText(text: string): string {
  return text.replace(/\r\n?/g, "\n").normalize("NFC");
}

export function messageDigest(text: string): string {
  return createHash("sha256").update(JSON.stringify({ message: normalizeMessageText(text) })).digest("hex");
}

async function requireWorkerHeartbeat(client: import("pg").PoolClient): Promise<void> {
  const result = await client.query(`SELECT 1 FROM maintenance_workers
    WHERE environment_id = $1 AND last_seen_at >= now() - interval '15 seconds' LIMIT 1`,
  [getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!result.rowCount) throw new HttpFailure(503, "maintenance_unavailable", "Service unavailable");
}

export async function prepareAttempt(
  session: CurrentSession, conversationId: string, nativeSessionId: string,
  requestKey: string, rawText: string, selections: readonly DraftSelection[] = [],
  existingClient?: PoolClient,
): Promise<{ attemptId: string; created: boolean; dispatchState: string; governed?: boolean }> {
  const feature = existingClient ? await conversationFeature(existingClient, conversationId) : await withTransaction(db => conversationFeature(db, conversationId));
  if (feature.kind === "execution") return { ...await prepareExecutionNativeAttempt(session, conversationId, nativeSessionId, requestKey, rawText, selections.length > 0, existingClient), governed: true };
  if(feature.kind==="expansion")return {...await prepareExpansionNativeAttempt(session,conversationId,nativeSessionId,requestKey,rawText,selections.length>0,existingClient),governed:true};
  if (feature.kind === "support") return { ...await prepareSupportNativeAttempt(session, conversationId, nativeSessionId, requestKey, rawText, selections.length > 0, existingClient), governed: true };
  if (feature.kind === "staffing") return { ...await prepareStaffingNativeAttempt(session, conversationId, nativeSessionId, requestKey, rawText, selections.length > 0, existingClient), governed: true };
  const text = normalizeMessageText(rawText);
  if (!text.trim()) throw new HttpFailure(422, "invalid_message", "Message required");
  if (Buffer.byteLength(text, "utf8") > 16 * 1024) {
    throw new HttpFailure(413, "message_too_large", "Message too large");
  }
  const digest = selections.length ? canonicalArtifactSendDigest(text,selections) : messageDigest(text);
  const run = async (client: PoolClient) => {
    const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [environmentId]);
    const conversation = await lockOwnedBinding(client, session, conversationId);
    // A first feature binder can win after the metadata preflight. Never let
    // an ordinary send cross that committed scope under the conversation lock.
    if (["execution", "staffing"].includes((await conversationFeature(client, conversationId)).kind))
      throw new HttpFailure(409, "conversation_already_bound", "Use the bound workflow to start this explanation");
    if (conversation.customer_id === null && (selections.length || process.env.TURAS_GENERAL_CHAT_DISABLED === "1")) {
      throw new HttpFailure(422,"general_scope_only","Customer sources require a customer-scoped conversation");
    }
    if (conversation.binding_state !== "bound" || conversation.eve_session_id !== nativeSessionId) {
      throw hiddenRecord();
    }
    const planning=await planningScopeForConversation(client,conversationId);
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
    const context = await client.query<{ context_snapshot_schema: string | null;
      context_generation: string | null; context_valid_until: Date | null }>(
      "SELECT context_snapshot_schema,context_generation,context_valid_until FROM conversations WHERE id=$1",
      [conversationId]);
    if (conversation.customer_id !== null && (context.rows[0]?.context_snapshot_schema !== "customer-context-v1" ||
        context.rows[0]?.context_generation === null)) {
      throw new HttpFailure(409, "historical_conversation", "Start a new conversation for current customer context");
    }
    if (context.rows[0].context_valid_until && context.rows[0].context_valid_until.getTime() <= Date.now()) {
      throw new HttpFailure(409, "context_changed", "Start a new conversation for current customer context");
    }
    await assertArtifactDependenciesCurrent(client, conversationId);
    await assertRetrievalDependenciesCurrent(client, conversationId);
    const existing = await client.query<{ id: string; body_digest: string; attempt_id: string; dispatch_state: string }>(`
      SELECT sm.id, sm.body_digest, a.id AS attempt_id, a.dispatch_state
      FROM submitted_messages sm JOIN response_attempts a ON a.message_id = sm.id
      WHERE sm.conversation_id = $1 AND sm.request_key = $2
    `, [conversationId, requestKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].body_digest !== digest) {
        throw new HttpFailure(409, "request_key_conflict", "Request key already used");
      }
      return { attemptId: existing.rows[0].attempt_id, created: false,
        dispatchState: existing.rows[0].dispatch_state };
    }
    const outstanding = await client.query(`SELECT 1 FROM response_attempts
      WHERE conversation_id = $1 AND response_state IN ('pending','running','stopping')
        AND dispatch_state <> 'rejected' LIMIT 1`, [conversationId]);
    if (outstanding.rowCount) {
      throw new HttpFailure(409, "conversation_busy", "Conversation has an active response");
    }
    await requireWorkerHeartbeat(client);
    const limits = await client.query<{
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
    await client.query(`INSERT INTO submitted_messages
      (id, conversation_id, request_key, body_digest, text)
      VALUES ($1,$2,$3,$4,$5)`, [messageId, conversationId, requestKey, digest, text]);
    await client.query(`INSERT INTO response_attempts
      (id, conversation_id, message_id, input_digest, dispatch_state, response_state)
      VALUES ($1,$2,$3,$4,'prepared','pending')`, [attemptId, conversationId, messageId, digest]);
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
    else await captureGeneralContext(client,session,conversationId,attemptId);
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
    if (prepared) {
      const prior = (await client.query(`SELECT native_receipt,native_response_status,native_response_headers FROM response_attempts
        WHERE id=$1 AND conversation_id=$2`, [attemptId, conversationId])).rows[0];
      if (prior?.native_receipt !== null && prior?.native_receipt !== undefined) {
        if (staffingSha256(prior.native_receipt) !== staffingSha256(receipt) || prior.native_response_status !== nativeResponse.status ||
          staffingSha256(prior.native_response_headers) !== staffingSha256(headers)) {
          throw new HttpFailure(409, "native_receipt_changed", "Native receipt differs from the saved result");
        }
        return;
      }
    }
    const result = await client.query(`UPDATE response_attempts SET
      dispatch_state = 'admitted', native_delivery_id = $2,
      native_receipt = $3, native_response_status = $4, native_response_headers = $5,
      updated_at = now(), revision = revision + 1
      WHERE id = $1 AND conversation_id = $6 AND (dispatch_state = 'dispatching' OR ($7 AND dispatch_state='admitted'))
        AND native_receipt IS NULL`,
    [attemptId, deliveryId, JSON.stringify(receipt), nativeResponse.status,
      JSON.stringify(headers), conversationId, Boolean(prepared)]);
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
    if (governedFeature.kind === "staffing" || governedFeature.kind === "execution") await client.query(`UPDATE ${governedFeature.kind === "staffing" ? "staffing_advisory_attempts" : "execution_advice_attempts"} SET state='unconfirmed',
      failure_code='native_completion_unconfirmed',settled_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE response_attempt_id=$1 AND conversation_id=$2 AND state='running'`, [attemptId, conversationId]);
  });
}

export async function deriveNativeAttempt(
  session: CurrentSession, nativeSessionId: string, requestKey: string, text: string,
): Promise<string> {
  const staffingAttempt = await withTransaction(async db => {
    const row = (await db.query(`SELECT a.id,a.conversation_id FROM response_attempts a JOIN submitted_messages sm ON sm.id=a.message_id
      JOIN conversations c ON c.id=a.conversation_id WHERE c.eve_session_id=$1 AND c.owner_principal_id=$2 AND c.environment_id=$3
      AND sm.request_key=$4 AND a.dispatch_state='dispatching'`,
      [nativeSessionId, session.principalId, getServerConfig().TURAS_ENVIRONMENT_ID, requestKey])).rows[0];
    return row && ["staffing", "execution", "support", "expansion"].includes((await conversationFeature(db, row.conversation_id)).kind) ? row as { id: string; conversation_id: string } : null;
  });
  if (staffingAttempt) {
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
    const found = await client.query<{ id: string; conversation_id: string; body_digest: string }>(`
      SELECT a.id, a.conversation_id, sm.body_digest
      FROM response_attempts a
      JOIN submitted_messages sm ON sm.id = a.message_id
      JOIN conversations c ON c.id = a.conversation_id
      WHERE c.eve_session_id = $1 AND c.owner_principal_id = $2
        AND c.environment_id = $3 AND sm.request_key = $4
        AND a.dispatch_state = 'dispatching'
      LIMIT 1
    `, [nativeSessionId, session.principalId,
      getServerConfig().TURAS_ENVIRONMENT_ID, requestKey]);
    const row = found.rows[0];
    if (!row) throw hiddenRecord();
    const artifact = await artifactContextSchemaReady(client)
      ? await client.query<{ native_text_digest: string }>(
        "SELECT native_text_digest FROM artifact_context_receipts WHERE attempt_id=$1", [row.id])
      : null;
    if ((artifact?.rows[0]?.native_text_digest ?? row.body_digest) !== messageDigest(text)) throw hiddenRecord();
    await lockOwnedBinding(client, session, row.conversation_id);
    await readCurrentAttemptContext(client, row.id, session.principalId);
    return row.id;
  });
  return result;
}
