import { readExecutionAdviceStatus } from "../execution/advisory-status";
import { conversationFeature } from "./feature";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { query, withTransaction } from "../db/client";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import type { ConversationReference } from "../../contracts/conversations";
import { lockProfileActor, lockWorkspaceActor } from "../profiles/policy";
import { assertRetrievalDependenciesCurrent } from "../retrieval/fences";
import { assertPlanConversationFence } from "../plans/fences";
import { staffingScopeForConversation } from "../staffing/context";
import { prepareGovernedNativeRelease, assertGovernedNativeRelease } from "./native-release";
import { readStaffingAdvisoryStatus } from "../staffing/advisory-status";

type ConversationRow = {
  id: string;
  workspace_id: string;
  environment_id: string;
  customer_id: string | null;
  owner_principal_id: string;
  title: string;
  binding_state: ConversationReference["bindingState"];
  eve_session_id: string | null;
  created_at: Date;
  updated_at: Date;
  context_audience?: string | null;
  context_generation?: string | null;
  context_valid_until?: Date | null;
  context_snapshot_schema?: string | null;
  context_login_session_id?: string | null;
  context_membership_id?: string | null;
  internal_generation?: string;
  delivery_generation?: string;
  artifact_context_stale?: boolean;
  retrieval_context_stale?: boolean;
  planning_audience?:"internal"|"delivery"|null;
};

const scopedCustomer = `
  EXISTS (
    SELECT 1 FROM login_sessions ls
    JOIN principals p ON p.id = ls.principal_id
    JOIN memberships m ON m.id = $1 AND m.principal_id = p.id
    JOIN workspaces w ON w.id = m.workspace_id
    LEFT JOIN partner_organizations o ON o.id = m.partner_org_id AND o.workspace_id = m.workspace_id
    WHERE ls.id = $2 AND ls.revoked_at IS NULL AND ls.expires_at > now()
      AND p.id = $3 AND p.active AND m.active AND w.active
      AND m.workspace_id = customer.workspace_id
      AND (m.kind = 'internal' OR (o.active AND EXISTS (
        SELECT 1 FROM customer_grants g WHERE g.customer_id = customer.id
          AND g.membership_id = m.id AND g.state = 'active'
      )))
  )`;

const scopedGeneral = `c.customer_id IS NULL AND c.context_snapshot_schema='general-context-v1' AND EXISTS (
  SELECT 1 FROM login_sessions ls JOIN principals p ON p.id=ls.principal_id
  JOIN memberships m ON m.id=$1 AND m.principal_id=p.id
  JOIN workspaces w ON w.id=m.workspace_id
  LEFT JOIN partner_organizations o ON o.id=m.partner_org_id AND o.workspace_id=m.workspace_id
  WHERE ls.id=$2 AND ls.revoked_at IS NULL AND ls.expires_at>now()
    AND p.id=$3 AND p.active AND m.active AND w.active AND m.workspace_id=c.workspace_id
    AND (m.kind='internal' OR o.active)
)`;

function contextStatus(row: ConversationRow, session: CurrentSession): "current" | "changed" | "historical" {
  if (row.customer_id === null && row.context_snapshot_schema === "general-context-v1") return "current";
  if (row.context_snapshot_schema !== "customer-context-v1") return "historical";
  const audience = row.planning_audience ?? (session.kind === "internal" ? "internal" : "delivery");
  const generation = audience === "internal" ? row.internal_generation : row.delivery_generation;
  if (row.context_audience !== audience ||
      row.artifact_context_stale ||
      row.retrieval_context_stale ||
      row.context_login_session_id !== session.sessionId ||
      row.context_membership_id !== session.membershipId ||
      (generation !== undefined && row.context_generation !== generation) ||
      (row.context_valid_until && row.context_valid_until.getTime() <= Date.now())) return "changed";
  return "current";
}

async function annotatePlanning(rows:ConversationRow[]):Promise<void> {
  if (!rows.length) return;
  const marker=await query<{schema_version:number}>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1",
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
  if ((marker.rows[0]?.schema_version ?? 0)<31) return;
  const bindings=await query<{conversation_id:string;audience:"internal"|"delivery"}>(
    "SELECT conversation_id,audience FROM planning_conversation_bindings WHERE conversation_id=ANY($1::uuid[])",
    [rows.map((row)=>row.id)]);
  const byId=new Map(bindings.rows.map((row)=>[row.conversation_id,row.audience]));
  if ((marker.rows[0]?.schema_version ?? 0)>=34) {
    const staffing=await query<{conversation_id:string}>("SELECT conversation_id FROM staffing_conversation_bindings WHERE conversation_id=ANY($1::uuid[])", [rows.map(row=>row.id)]);
    for (const row of staffing.rows) byId.set(row.conversation_id,"delivery");
  }
  for (const row of rows) row.planning_audience=byId.get(row.id) ?? null;
}

function toReference(row: ConversationRow, session: CurrentSession): ConversationReference {
  const status = contextStatus(row, session);
  return {
    id: row.id,
    customerId: row.customer_id,
    ownerPrincipalId: row.owner_principal_id,
    title: status === "current" ? row.title : "Previous conversation",
    bindingState: row.binding_state,
    eveSessionId: row.binding_state === "bound" ? row.eve_session_id : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    contextStatus: status,
  };
}

function values(session: CurrentSession): string[] {
  return [session.membershipId, session.sessionId, session.principalId];
}

async function staleArtifactConversations(ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const marker = await query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1",
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
  if ((marker.rows[0]?.schema_version ?? 0) < 18) return new Set();
  const stale = await query<{ conversation_id: string }>(`
    SELECT DISTINCT d.conversation_id FROM conversation_artifact_dependencies d
    LEFT JOIN artifact_versions v ON v.id=d.version_id
    LEFT JOIN artifact_extraction_runs r ON r.id=d.run_id AND r.version_id=d.version_id
    WHERE d.conversation_id=ANY($1::uuid[]) AND (
      v.id IS NULL OR v.state NOT IN ('ready','partial') OR
      v.lifecycle_generation<>d.lifecycle_generation OR
      r.id IS NULL OR r.state<>'published')`, [ids]);
  return new Set(stale.rows.map((row) => row.conversation_id));
}

async function staleRetrievalConversations(ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const marker = await query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1",
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
  if ((marker.rows[0]?.schema_version ?? 0) < 22) return new Set();
  const used = await query<{ conversation_id: string }>(`
    SELECT DISTINCT conversation_id FROM session_evidence_dependencies
    WHERE conversation_id=ANY($1::uuid[])`,[ids]);
  const stale = new Set<string>();
  for (const row of used.rows) {
    try {
      await withTransaction((client) => assertRetrievalDependenciesCurrent(client,row.conversation_id));
    } catch (error) {
      if (error instanceof HttpFailure && error.status === 409) stale.add(row.conversation_id);
      else throw error;
    }
  }
  return stale;
}

export async function createOwnedConversation(
  session: CurrentSession,
  input: { customerId?: string | null; requestKey: string; title?: string },
): Promise<{ conversation: ConversationReference; created: boolean }> {
  const title = input.title ?? "New conversation";
  return withTransaction(async (client: PoolClient) => {
    if (!input.customerId) {
      await lockWorkspaceActor(client, session);
      const schema = (await client.query("SELECT schema_version FROM turas_environment LIMIT 1")).rows[0]?.schema_version;
      if (schema < 35 || process.env.TURAS_GENERAL_CHAT_DISABLED === "1") throw new HttpFailure(503, "general_chat_unavailable", "General chat is unavailable");
      const id = randomUUID();
      const result = await client.query<ConversationRow>(`INSERT INTO conversations
        (id,environment_id,workspace_id,customer_id,owner_principal_id,creation_operation_id,binding_state,title,
          context_snapshot_schema,context_login_session_id,context_membership_id)
        VALUES($1,$2,$3,NULL,$4,$5,'unbound',$6,'general-context-v1',$7,$8)
        ON CONFLICT(creation_operation_id) DO NOTHING RETURNING *`,
        [id,getServerConfig().TURAS_ENVIRONMENT_ID,session.workspaceId,session.principalId,input.requestKey,title,session.sessionId,session.membershipId]);
      const row = result.rows[0] ?? (await client.query<ConversationRow>("SELECT * FROM conversations WHERE creation_operation_id=$1", [input.requestKey])).rows[0];
      if (!row || row.owner_principal_id!==session.principalId || row.workspace_id !== session.workspaceId || row.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID || row.customer_id!==null || row.title!==title) throw new HttpFailure(409,"request_key_conflict","Request key already used");
      return { conversation: toReference(row,session), created: Boolean(result.rows[0]) };
    }
    await lockProfileActor(client, session, input.customerId);
    const allowed = await client.query(`
      SELECT customer.id FROM customer_references customer
      WHERE customer.id = $4 AND customer.workspace_id = $5 AND ${scopedCustomer}
    `, [...values(session), input.customerId, session.workspaceId]);
    if (!allowed.rowCount) throw hiddenRecord();
    const contextState = await client.query<{ internal_generation: string; delivery_generation: string }>(
      "SELECT internal_generation,delivery_generation FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2",
      [input.customerId, session.workspaceId]);
    if (!contextState.rows[0]) throw hiddenRecord();
    const audience = session.kind === "internal" ? "internal" : "delivery";
    const generation = audience === "internal" ? contextState.rows[0].internal_generation :
      contextState.rows[0].delivery_generation;
    const id = randomUUID();
    const inserted = await client.query<ConversationRow>(`
      INSERT INTO conversations
        (id, environment_id, workspace_id, customer_id, owner_principal_id,
         creation_operation_id, binding_state, title, context_audience,
         context_generation,context_snapshot_schema,context_login_session_id,context_membership_id)
      VALUES ($1,$2,$3,$4,$5,$6,'unbound',$7,$8,$9,'customer-context-v1',$10,$11)
      ON CONFLICT (creation_operation_id) DO NOTHING
      RETURNING *
    `, [id, getServerConfig().TURAS_ENVIRONMENT_ID, session.workspaceId,
      input.customerId, session.principalId, input.requestKey, title,
      audience, generation, session.sessionId, session.membershipId]);
    if (inserted.rows[0]) return { conversation: toReference(inserted.rows[0], session), created: true };
    const previous = await client.query<ConversationRow>(
      "SELECT * FROM conversations WHERE creation_operation_id = $1", [input.requestKey],
    );
    const row = previous.rows[0];
    if (!row || row.owner_principal_id !== session.principalId ||
        row.customer_id !== input.customerId || row.title !== title) {
      throw new HttpFailure(409, "request_key_conflict", "Request key already used");
    }
    return { conversation: toReference(row, session), created: false };
  });
}

export async function getOwnedConversation(
  session: CurrentSession, id: string,
): Promise<ConversationReference> {
  const result = await query<ConversationRow>(`
    SELECT c.*,state.internal_generation,state.delivery_generation FROM conversations c
    LEFT JOIN customer_references customer ON customer.id = c.customer_id
    LEFT JOIN customer_profile_state state ON state.customer_id=c.customer_id
    WHERE c.id = $4 AND c.owner_principal_id = $3 AND c.environment_id = $5
      AND (${scopedCustomer} OR (${scopedGeneral}))
    LIMIT 1
  `, [...values(session), id, getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!result.rows[0]) throw hiddenRecord();
  await annotatePlanning(result.rows);
  result.rows[0].artifact_context_stale = (await staleArtifactConversations([id])).has(id);
  result.rows[0].retrieval_context_stale = (await staleRetrievalConversations([id])).has(id);
  return toReference(result.rows[0], session);
}

const cursorSchema = z.object({ t: z.iso.datetime(), id: z.uuid() }).strict();
function decodeCursor(encoded?: string): { t: string; id: string } | null {
  if (!encoded) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (parsed.success) return parsed.data;
  } catch { /* invalid cursor */ }
  throw new HttpFailure(422, "invalid_cursor", "Invalid cursor");
}

export async function listOwnedConversations(
  session: CurrentSession,
  options: { customerId?: string; title?: string; cursor?: string; limit: number },
): Promise<{ items: ConversationReference[]; nextCursor: string | null }> {
  const cursor = decodeCursor(options.cursor);
  const escapedTitle = options.title?.replace(/[\\%_]/g, "\\$&") ?? null;
  const result = await query<ConversationRow>(`
    SELECT c.*,state.internal_generation,state.delivery_generation FROM conversations c
    LEFT JOIN customer_references customer ON customer.id = c.customer_id
    LEFT JOIN customer_profile_state state ON state.customer_id=c.customer_id
    WHERE c.owner_principal_id = $3 AND c.environment_id = $4
      AND (${scopedCustomer} OR (${scopedGeneral}))
      AND ($5::uuid IS NULL OR c.customer_id = $5)
      AND ($6::text IS NULL OR ((${scopedGeneral}) AND c.title ILIKE '%' || $6 || '%' ESCAPE '\\') OR (c.context_snapshot_schema='customer-context-v1'
        AND c.context_audience=CASE WHEN $10::text='internal' THEN 'internal' ELSE 'delivery' END
        AND c.context_login_session_id=$11 AND c.context_membership_id=$12
        AND c.context_generation=CASE WHEN $10::text='internal'
          THEN state.internal_generation ELSE state.delivery_generation END
        AND (c.context_valid_until IS NULL OR c.context_valid_until>now())
        AND c.title ILIKE '%' || $6 || '%' ESCAPE '\\'))
      AND ($7::timestamptz IS NULL OR (c.updated_at, c.id) < ($7, $8::uuid))
    ORDER BY c.updated_at DESC, c.id DESC LIMIT $9
  `, [...values(session), getServerConfig().TURAS_ENVIRONMENT_ID, options.customerId ?? null,
    escapedTitle, cursor?.t ?? null, cursor?.id ?? null, options.limit + 1,
    session.kind, session.sessionId, session.membershipId]);
  const rows = result.rows.slice(0, options.limit);
  await annotatePlanning(rows);
  const stale = await staleArtifactConversations(rows.map((row) => row.id));
  const retrievalStale = await staleRetrievalConversations(rows.map((row) => row.id));
  for (const row of rows) row.artifact_context_stale = stale.has(row.id);
  for (const row of rows) row.retrieval_context_stale = retrievalStale.has(row.id);
  const last = rows.at(-1);
  return {
    items: rows.map((row) => toReference(row, session)),
    nextCursor: result.rows.length > options.limit && last
      ? Buffer.from(JSON.stringify({ t: last.updated_at.toISOString(), id: last.id })).toString("base64url")
      : null,
  };
}

export async function getOwnedConversationByNativeSession(
  session: CurrentSession, nativeSessionId: string,
): Promise<ConversationReference> {
  const result = await query<{ id: string }>(`
    SELECT id FROM conversations WHERE eve_session_id = $1
      AND owner_principal_id = $2 AND environment_id = $3 LIMIT 1
  `, [nativeSessionId, session.principalId, getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!result.rows[0]) throw hiddenRecord();
  return getOwnedConversation(session, result.rows[0].id);
}

export async function getOwnedAttemptStatus(
  session: CurrentSession, conversationId: string, requestKey: string,
): Promise<{
  dispatchState: string; responseState: string; nativeTurnId: string | null;
  deadlineAt: string | null; lastErrorCode: string | null; outputTokens: number | null;
  watchdogState: string | null;
}> {
  await getOwnedConversation(session, conversationId);
  const feature = await withTransaction(db => conversationFeature(db, conversationId));
  if (feature.kind === "staffing" || feature.kind === "execution") {
    if (!z.uuid().safeParse(requestKey).success) throw hiddenRecord();
    const attempt = (await query<{ id: string }>(`SELECT id FROM ${feature.kind === "staffing" ? "staffing_advisory_attempts" : "execution_advice_attempts"}
      WHERE conversation_id=$1 AND native_request_id=$2 AND binding_id=$3`, [conversationId, requestKey, feature.scope.bindingId])).rows[0];
    if (!attempt) throw hiddenRecord();
    const status = feature.kind === "execution" ? await readExecutionAdviceStatus(session, attempt.id) : await readStaffingAdvisoryStatus(session, attempt.id);
    if (status.nativeRequestId !== requestKey || !status.responseAttemptId || !status.dispatchState || !status.responseState) throw hiddenRecord();
    return { dispatchState: status.dispatchState, responseState: status.responseState, nativeTurnId: status.nativeTurnId,
      deadlineAt: status.deadlineAt, lastErrorCode: status.failureCode, outputTokens: status.outputTokens, watchdogState: status.watchdogState };
  }
  const result = await query<{
    dispatch_state: string; response_state: string; native_turn_id: string | null;
    deadline_at: Date | null; last_error_code: string | null; output_tokens: number;
    watchdog_state: string | null;
  }>(`SELECT a.dispatch_state, a.response_state, a.native_turn_id,
    a.deadline_at, a.last_error_code, a.output_tokens, j.state AS watchdog_state
    FROM response_attempts a JOIN submitted_messages sm ON sm.id = a.message_id
    LEFT JOIN watchdog_jobs j ON j.attempt_id = a.id
    WHERE a.conversation_id = $1 AND sm.request_key = $2 LIMIT 1`,
  [conversationId, requestKey]);
  const row = result.rows[0];
  if (!row) throw hiddenRecord();
  return {
    dispatchState: row.dispatch_state,
    responseState: row.response_state,
    nativeTurnId: row.native_turn_id,
    deadlineAt: row.deadline_at?.toISOString() ?? null,
    lastErrorCode: row.last_error_code,
    outputTokens: row.output_tokens,
    watchdogState: row.watchdog_state,
  };
}

export async function getOwnedConversationDetail(session: CurrentSession, id: string) {
  const feature = await withTransaction(db => conversationFeature(db, id));
  if (feature.kind === "staffing" || feature.kind === "execution" || feature.kind === "support") {
    const prepared = await prepareGovernedNativeRelease(id, { actor: session });
    if (!prepared) throw hiddenRecord();
    return withTransaction(async db => {
      const bound = await assertGovernedNativeRelease(db, prepared, session);
      const row = (await db.query<ConversationRow>("SELECT * FROM conversations WHERE id=$1 AND owner_principal_id=$2", [id, session.principalId])).rows[0];
      if (!row) throw hiddenRecord();
      const events = await db.query<{ native_event_id: string; event_type: string; visible_payload: Record<string, unknown>;
        stream_index: string | null; emitted_at: Date }>(`SELECT native_event_id,event_type,visible_payload,stream_index,emitted_at
        FROM event_projections WHERE conversation_id=$1 ORDER BY emitted_at,native_event_id LIMIT 501`, [id]);
      const attempts = await db.query<{ request_key: string; dispatch_state: string; response_state: string;
        watchdog_state: string | null; created_at: Date }>(`SELECT sm.request_key,a.dispatch_state,a.response_state,j.state AS watchdog_state,a.created_at
        FROM response_attempts a JOIN submitted_messages sm ON sm.id=a.message_id LEFT JOIN watchdog_jobs j ON j.attempt_id=a.id
        WHERE a.conversation_id=$1 ORDER BY a.created_at,a.id LIMIT 101`, [id]);
      const submitted = await db.query<{ id: string; text: string; created_at: Date }>(
        "SELECT id,text,created_at FROM submitted_messages WHERE conversation_id=$1 ORDER BY created_at,id LIMIT 101", [id]);
      const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
      if (feature.kind === "staffing" && bound.deadlineAt.getTime() <= now.getTime() || bound.actor.expiresAt.getTime() <= now.getTime()) {
        throw new HttpFailure(409, "staffing_advisory_expired", "Staffing output is unavailable");
      }
      return { id: row.id, customerId: row.customer_id, ownerPrincipalId: row.owner_principal_id, title: row.title,
        bindingState: row.binding_state, eveSessionId: row.eve_session_id, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
        contextStatus: "current" as const,
        history: events.rows.slice(0, 500).map(event => ({ eventId: event.native_event_id, eventType: event.event_type,
          payload: event.visible_payload, streamIndex: event.stream_index === null ? null : Number(event.stream_index), emittedAt: event.emitted_at.toISOString() })),
        historyTruncated: events.rows.length > 500,
        attempts: attempts.rows.slice(0, 100).map(attempt => ({ requestKey: attempt.request_key, dispatchState: attempt.dispatch_state,
          responseState: attempt.response_state, watchdogState: attempt.watchdog_state, createdAt: attempt.created_at.toISOString() })),
        attemptsTruncated: attempts.rows.length > 100,
        submittedMessages: submitted.rows.slice(0, 100).map(message => ({ id: message.id, text: message.text, createdAt: message.created_at.toISOString() })),
        submittedMessagesTruncated: submitted.rows.length > 100 };
    });
  }
  const conversation = await getOwnedConversation(session, id);
  const [events, partials, attempts, submitted] = await Promise.all([
    query<{
      native_event_id: string; event_type: string; visible_payload: Record<string, unknown>;
      stream_index: string | null; emitted_at: Date;
    }>(`SELECT native_event_id, event_type, visible_payload, stream_index, emitted_at
      FROM event_projections WHERE conversation_id = $1
        AND event_type <> 'message.appended'
      ORDER BY emitted_at, native_event_id LIMIT 501`, [id]),
    query<{ turn_id: string; message: string; emitted_at: Date }>(`
      SELECT e.turn_id, string_agg(e.visible_payload->>'messageDelta', ''
        ORDER BY e.emitted_at, e.native_event_id) AS message, max(e.emitted_at) AS emitted_at
      FROM event_projections e WHERE e.conversation_id = $1
        AND e.event_type = 'message.appended' AND e.turn_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM event_projections completed
          WHERE completed.conversation_id = e.conversation_id
            AND completed.turn_id = e.turn_id AND completed.event_type = 'message.completed')
      GROUP BY e.turn_id ORDER BY max(e.emitted_at) DESC LIMIT 5`, [id]),
    query<{
      request_key: string; dispatch_state: string; response_state: string;
      watchdog_state: string | null; created_at: Date;
    }>(`SELECT sm.request_key, a.dispatch_state, a.response_state,
      j.state AS watchdog_state, a.created_at
      FROM response_attempts a JOIN submitted_messages sm ON sm.id = a.message_id
      LEFT JOIN watchdog_jobs j ON j.attempt_id = a.id
      WHERE a.conversation_id = $1 ORDER BY a.created_at, a.id LIMIT 101`, [id]),
    query<{ id: string; text: string; created_at: Date }>(`
      SELECT id,text,created_at FROM submitted_messages
      WHERE conversation_id=$1 ORDER BY created_at,id LIMIT 101`, [id]),
  ]);
  // Recheck after potentially long history reads so a concurrent grant change
  // cannot return a completed payload under the authorization observed earlier.
  const latest = await getOwnedConversation(session, id);
  const planStale=await withTransaction((client)=>
    assertPlanConversationFence(client,session,id)).then(()=>false,()=>true);
  const stale = latest.contextStatus !== "current" || planStale;
  const ownerEvents = stale ? await query<{
    native_event_id: string; event_type: string; visible_payload: Record<string, unknown>;
    stream_index: string | null; emitted_at: Date;
  }>(`SELECT native_event_id,event_type,visible_payload,stream_index,emitted_at
    FROM event_projections WHERE conversation_id=$1 AND event_type='message.received'
    ORDER BY emitted_at,native_event_id LIMIT 501`, [id]) : null;
  const final = await getOwnedConversation(session, id);
  const finalPlanStale=await withTransaction((client)=>
    assertPlanConversationFence(client,session,id)).then(()=>false,()=>true);
  const hideGenerated = final.contextStatus !== "current" || finalPlanStale;
  const visibleEvents = hideGenerated ? (ownerEvents?.rows ?? events.rows.filter((row) => row.event_type === "message.received")) : events.rows;
  return {
    ...conversation, contextStatus: hideGenerated ? "changed":final.contextStatus,
    title: hideGenerated ? "Previous conversation" : conversation.title,
    history: [...visibleEvents.slice(0, 500).map((row) => ({
      eventId: row.native_event_id,
      eventType: row.event_type,
      payload: row.visible_payload,
      streamIndex: row.stream_index === null ? null : Number(row.stream_index),
      emittedAt: row.emitted_at.toISOString(),
    })), ...(hideGenerated ? [] : partials.rows.map((row) => ({
      eventId: `partial_${row.turn_id}`, eventType: "message.appended",
      payload: { messageDelta: row.message, partial: true }, streamIndex: null,
      emittedAt: row.emitted_at.toISOString(),
    })))].sort((a, b) => a.emittedAt.localeCompare(b.emittedAt)),
    historyTruncated: visibleEvents.length > 500,
    attempts: attempts.rows.slice(0, 100).map((row) => ({
      requestKey: row.request_key,
      dispatchState: row.dispatch_state,
      responseState: row.response_state,
      watchdogState: row.watchdog_state,
      createdAt: row.created_at.toISOString(),
    })),
    attemptsTruncated: attempts.rows.length > 100,
    submittedMessages: submitted.rows.slice(0, 100).map((row) => ({
      id: row.id, text: row.text, createdAt: row.created_at.toISOString(),
    })),
    submittedMessagesTruncated: submitted.rows.length > 100,
  };
}
