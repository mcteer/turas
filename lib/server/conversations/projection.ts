import {customerQuestionActor,assertCustomerQuestionReads} from "./customer-accounts";
import {hasNativeInputWindow} from './input-responses';
import {readResearchRuntimeAuthority} from "../research/specialists/runtime-authority";
import { projectExecutionNativeEventInTransaction, type ExecutionNativeProjection } from "../execution/native-events";
import { projectLearningNativeEventInTransaction,type LearningNativeProjection } from '../learning/native-events';
import {projectExpansionNativeEventInTransaction,type ExpansionNativeProjection} from "../expansion/native-events";
import {recordExpansionTelemetry} from "../expansion/telemetry";
import { projectSupportNativeEventInTransaction, type SupportNativeProjection } from "../support/native-events";
import { recordSupportTelemetry } from "../support/telemetry";
import { recordExecutionTelemetry } from "../execution/telemetry";
import { conversationFeature } from "./feature";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/client";
import { messageDigest } from "./dispatch";
import { artifactContextSchemaReady, assertArtifactDependenciesCurrent } from "../artifacts/context-fence";
import { assertRetrievalDependenciesCurrent } from "../retrieval/fences";
import { reconcilePlanModelEvent } from "../plans/model-budget";
import { planningScopeForConversation } from "../plans/context";
import { assertPlanConversationFence } from "../plans/fences";
import { boundToolActor } from "../profiles/tool-actor";
import { staffingScopeForConversation } from "../staffing/context";
import { prepareGovernedReleaseForNative, type GovernedNativeRelease } from "./native-release";
import { projectStaffingNativeEventInTransaction, type StaffingNativeProjection } from "../staffing/native-events";
import { needsGovernedReleasePreflight } from "./release-preflight";
import { recordStaffingTelemetry } from "../staffing/telemetry";

export type NativeEvent = {
  type: string;
  data?: Record<string, unknown>;
  meta: { id?: string; at?: string };
};

const visibleTypes = new Set([
  "message.received", "message.appended", "message.completed", "input.requested", "input.resolved", "step.completed",
  "step.failed", "turn.completed", "turn.failed", "turn.cancelled",
]);

function visiblePayload(event: NativeEvent): Record<string, unknown> {
  const data = event.data ?? {};
  switch (event.type) {
    case "message.received": return { message: data.message };
    case "message.appended": return { messageDelta: data.messageDelta };
    case "message.completed": return { message: data.message, finishReason: data.finishReason };
    case "input.requested": return {requests:data.requests};
    case "input.resolved": return {resolutions:data.resolutions};
    case "step.completed": return { usage: data.usage ?? null };
    case "step.failed":
    case "turn.failed": {
      const details=typeof data.details==="object" && data.details!==null ?
        data.details as Record<string,unknown>:null;
      const semanticErrorId=details && typeof details.semanticErrorId==="string" &&
        /^[a-z0-9-]{1,80}$/.test(details.semanticErrorId) ? details.semanticErrorId:null;
      return { code: data.code ?? "native_failure",semanticErrorId };
    }
    default: return {};
  }
}

/** Input replies may resume in a new native turn. Bind them by the actual
 * native request IDs, not by assuming the reply keeps the original turn ID. */
async function inputResolutionAttempt(db:PoolClient,nativeSessionId:string,currentAttemptId:string,data:NativeEvent['data']){
 const resolutions=Array.isArray(data?.resolutions)?data.resolutions:[];
 const ids=resolutions.flatMap(value=>typeof value==='object' && value!==null && 'requestId' in value && typeof value.requestId==='string'?[value.requestId]:[]);
 if(!ids.length || ids.length!==resolutions.length || new Set(ids).size!==ids.length)return null;
 const owner=(await db.query(`SELECT c.id,c.owner_principal_id FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id
  WHERE a.id=$1 AND c.eve_session_id=$2 AND c.binding_state='bound'`,[currentAttemptId,nativeSessionId])).rows[0];
 if(!owner || (await conversationFeature(db,owner.id)).kind!=='normal')return null;
 const rows=(await db.query<{attempt_id:string;request_id:string}>(`SELECT DISTINCT a.id AS attempt_id,request->>'requestId' AS request_id
  FROM event_projections requested JOIN response_attempts a ON a.conversation_id=requested.conversation_id
   AND (a.native_turn_id=requested.turn_id OR EXISTS(SELECT 1 FROM research_background_turns bg
     WHERE bg.attempt_id=a.id AND bg.turn_id=requested.turn_id AND bg.native_session_id=$2)
    OR EXISTS(SELECT 1 FROM native_input_resume_windows resume JOIN event_projections prior ON prior.native_event_id=resume.native_event_id
      WHERE resume.attempt_id=a.id AND prior.turn_id=requested.turn_id AND prior.native_session_id=$2))
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(requested.visible_payload->'requests','[]'::jsonb)) request
  WHERE requested.conversation_id=$1 AND requested.native_session_id=$2 AND requested.event_type='input.requested'
   AND request->>'requestId'=ANY($3::text[])`,[owner.id,nativeSessionId,ids])).rows;
 return rows.length===ids.length && new Set(rows.map(row=>row.attempt_id)).size===1?rows[0].attempt_id:null;
}

export async function projectNativeEvent(
  nativeSessionId: string, attemptId: string, event: NativeEvent, streamIndex?: number,
): Promise<void> {
  if (!visibleTypes.has(event.type)) return;
  if(event.type==='input.resolved'){
    const binding=await withTransaction(async db=>{
      const current=(await db.query('SELECT conversation_id FROM response_attempts WHERE id=$1',[attemptId])).rows[0];
      const normal=!!current && (await conversationFeature(db,current.conversation_id)).kind==='normal';
      return {normal,original:normal?await inputResolutionAttempt(db,nativeSessionId,attemptId,event.data):null};
    });
    if(binding.normal && !binding.original)throw new Error('Native input resolution has no owned pending request');
    if(binding.original)attemptId=binding.original;
  }else if(event.type==='input.requested' && typeof event.data?.turnId==='string'){
    const original=await withTransaction(async db=>{
      const current=(await db.query(`SELECT c.id FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id WHERE a.id=$1 AND c.eve_session_id=$2 AND c.binding_state='bound'`,[attemptId,nativeSessionId])).rows[0];
      if(!current || (await conversationFeature(db,current.id)).kind!=='normal')return null;
      const targets=(await db.query(`SELECT a.id FROM response_attempts a WHERE a.conversation_id=$1 AND
        (a.native_turn_id=$2 OR EXISTS(SELECT 1 FROM research_background_turns bg WHERE bg.attempt_id=a.id AND bg.turn_id=$2 AND bg.native_session_id=$3)
         OR EXISTS(SELECT 1 FROM native_input_resume_windows resume JOIN event_projections resolution ON resolution.native_event_id=resume.native_event_id
          WHERE resume.attempt_id=a.id AND resolution.turn_id=$2 AND resolution.native_session_id=$3))`,[current.id,event.data!.turnId,nativeSessionId])).rows;
      return targets.length===1?targets[0].id:null;
    });
    if(original)attemptId=original;
  }
  const staffing = await withTransaction(async client => {
    const row = (await client.query(`SELECT conversation_id,a.native_turn_id FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id
      WHERE a.id=$1 AND c.eve_session_id=$2 AND c.binding_state='bound'`, [attemptId, nativeSessionId])).rows[0];
    const kind = row ? (await conversationFeature(client, row.conversation_id)).kind : null;
    if ((kind === "support" || kind === "expansion" || kind==='learning') && event.type === "message.appended" &&
      (!row.native_turn_id || row.native_turn_id !== event.data?.turnId)) throw new Error("Native support delta association unavailable");
    return kind;
  });
  // No delta prose is released or retained for support. After the exact durable
  // turn/session association check, avoid a write transaction per hidden chunk.
  if ((staffing === "support" || staffing === "expansion" || staffing==='learning') && event.type === "message.appended") return;
  // Support never releases streaming deltas. Rebuilding its source closure for
  // each hidden token blocks the event hook and can prevent terminal settlement.
  // Durable attempt/turn association is still checked in the transaction below;
  // completed messages retain the full current-source release preflight.
  const prepared = needsGovernedReleasePreflight(staffing, event.type) ? await prepareGovernedReleaseForNative(nativeSessionId,
    { responseAttemptId: attemptId, incomingTurnId: event.type === "message.received" && typeof event.data?.turnId === "string" ? event.data.turnId : undefined }) : null;
  const started = performance.now();
  const projection = await withTransaction((client) =>
    projectNativeEventInTransaction(client, nativeSessionId, attemptId, event, streamIndex, prepared));
  if(projection&&"expansion" in projection&&projection.usage)recordExpansionTelemetry({operation:"model",outcome:"committed",correlationId:attemptId,...projection.usage,durationMs:Math.min(86400000,Math.max(0,performance.now()-started))});
  if (projection && "support" in projection && projection.usage) recordSupportTelemetry({ operation: "model", outcome: "committed",
    correlationId: attemptId, ...projection.usage, durationMs: Math.min(86400000, Math.max(0, performance.now() - started)) });
  if (projection?.usage && !("support" in projection)&&!("expansion" in projection)) ("execution" in projection ? recordExecutionTelemetry : recordStaffingTelemetry)({ operation: "model", outcome: "committed", ...projection.usage,
    durationMs: Math.min(86_400_000, Math.max(0, performance.now() - started)) });
}

export async function projectNativeEventInTransaction(
  client: PoolClient, nativeSessionId: string, attemptId: string,
  event: NativeEvent, streamIndex?: number, preparedStaffing?: GovernedNativeRelease | null,
): Promise<void | StaffingNativeProjection | ExecutionNativeProjection | SupportNativeProjection | ExpansionNativeProjection | LearningNativeProjection> {
  if (!visibleTypes.has(event.type)) return;
  if (!event.meta.id?.startsWith("evt_") || !event.meta.at ||
      !Number.isFinite(Date.parse(event.meta.at))) {
    throw new Error("Native event identity unavailable");
  }
  const data = event.data ?? {};

  // Fence every visible event before response locks, projection writes or usage
  // reconciliation. A historical/uncertain native session must not bypass the
  // closed staffing context entry point through received/completed events.
  const owned = (await client.query<{ conversation_id: string }>(`SELECT a.conversation_id FROM response_attempts a
    JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1 AND c.eve_session_id=$2 AND c.binding_state='bound'`,
    [attemptId, nativeSessionId])).rows[0];
  if (!owned) throw new Error("Native attempt association unavailable");
  if((await conversationFeature(client,owned.conversation_id)).kind==='learning'){
    const learningProjection=await projectLearningNativeEventInTransaction(client,nativeSessionId,attemptId,event,streamIndex);
    if(!learningProjection)throw new Error('Learning event association unavailable');
    return learningProjection;
  }
  const expansionProjection=await projectExpansionNativeEventInTransaction(client,nativeSessionId,attemptId,event,streamIndex,preparedStaffing?.kind==="expansion"?preparedStaffing:null);
  if(expansionProjection)return expansionProjection;
  const supportProjection = await projectSupportNativeEventInTransaction(client, nativeSessionId, attemptId, event, streamIndex, preparedStaffing?.kind === "support" ? preparedStaffing : null);
  if (supportProjection) return supportProjection;
  const staffingProjection = await projectStaffingNativeEventInTransaction(client, nativeSessionId, attemptId, event, streamIndex, preparedStaffing?.kind === "staffing" ? preparedStaffing : null);
  if (staffingProjection) return staffingProjection;
  const executionProjection = await projectExecutionNativeEventInTransaction(client, nativeSessionId, attemptId, event, streamIndex, preparedStaffing?.kind === "execution" ? preparedStaffing : null);
  if (executionProjection) return executionProjection;
  {
    if (["message.appended","message.completed"].includes(event.type)) {
      const scope=await client.query<{conversation_id:string;owner_principal_id:string}>(`
        SELECT response.conversation_id,conversation.owner_principal_id
        FROM response_attempts response JOIN conversations conversation
          ON conversation.id=response.conversation_id
        WHERE response.id=$1 AND conversation.eve_session_id=$2
          AND conversation.binding_state='bound'`,[attemptId,nativeSessionId]);
      const owner=scope.rows[0];
      if (!owner) throw new Error("Planning conversation owner unavailable");
      if((await conversationFeature(client,owner.conversation_id)).kind==='normal'){
        const scope=await customerQuestionActor(client,{principalId:owner.owner_principal_id,attributes:{turasAttemptId:attemptId}});
        await assertCustomerQuestionReads(client,scope.actor,owner.conversation_id,attemptId);
      }
      if (await planningScopeForConversation(client,owner.conversation_id)) {
        const bound=await boundToolActor(client,{principalId:owner.owner_principal_id,
          attributes:{turasAttemptId:attemptId}});
        await assertPlanConversationFence(client,bound.actor,owner.conversation_id);
      }
    }
    const attempt = await client.query<{
      conversation_id: string; native_turn_id: string | null; input_event_id: string | null;
      input_digest: string; dispatch_state: string; response_state: string;
    }>(`
      SELECT a.conversation_id, a.native_turn_id, a.input_event_id,
        a.input_digest, a.dispatch_state, a.response_state
      FROM response_attempts a JOIN conversations c ON c.id = a.conversation_id
      WHERE a.id = $1 AND c.eve_session_id = $2 AND c.binding_state = 'bound'
      FOR UPDATE OF a
    `, [attemptId, nativeSessionId]);
    const row = attempt.rows[0];
    if (!row || !["dispatching", "admitted", "uncertain"].includes(row.dispatch_state)) {
      throw new Error("Native attempt association unavailable");
    }
    if (event.type !== "message.received") {
      await assertArtifactDependenciesCurrent(client,row.conversation_id);
      // Ordinary lifecycle/tool events may announce freshly changed research.
      // Exact source validation belongs to each new assistant output and model
      // admission; dated replay stays readable under cumulative access checks.
      if((await conversationFeature(client,row.conversation_id)).kind!=='normal' || ['message.appended','message.completed'].includes(event.type))
        await assertRetrievalDependenciesCurrent(client,row.conversation_id);
    }
    if(event.type==='message.received' && data.kind==='execution.background_task') {
      const owner=(await client.query('SELECT owner_principal_id FROM conversations WHERE id=$1',[row.conversation_id])).rows[0];
      const authority=await readResearchRuntimeAuthority(client,attemptId,owner.owner_principal_id,{parentSessionId:nativeSessionId},true);
      if(!authority || typeof data.turnId!=='string' || !data.turnId)throw new Error('Background research delivery has no current parent authority');
      await client.query(`INSERT INTO research_background_turns(native_session_id,turn_id,attempt_id,native_event_id)
        VALUES($1,$2,$3,$4) ON CONFLICT(native_session_id,turn_id) DO NOTHING`,
        [nativeSessionId,data.turnId,attemptId,event.meta.id]);
      const accepted=(await client.query(`SELECT attempt_id,native_event_id FROM research_background_turns
        WHERE native_session_id=$1 AND turn_id=$2`,[nativeSessionId,data.turnId])).rows[0];
      if(accepted?.attempt_id!==attemptId || accepted.native_event_id!==event.meta.id)throw new Error('Background delivery association conflicts');
      await client.query(`UPDATE response_attempts SET response_state='running',updated_at=now(),revision=revision+1
        WHERE id=$1 AND response_state<>'cancelled'`,[attemptId]);
      return;
    }
    const artifact = await artifactContextSchemaReady(client)
      ? await client.query<{ native_text_digest: string }>(
        "SELECT native_text_digest FROM artifact_context_receipts WHERE attempt_id=$1", [attemptId])
      : null;
    const nativeInputDigest = artifact?.rows[0]?.native_text_digest ?? row.input_digest;
    const inserted = await client.query(`INSERT INTO event_projections
      (native_event_id, conversation_id, native_session_id, stream_index,
       event_type, turn_id, step_index, visible_payload, emitted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (native_event_id) DO NOTHING RETURNING native_event_id`,
    [event.meta.id, row.conversation_id, nativeSessionId, streamIndex ?? null,
      event.type, typeof data.turnId === "string" ? data.turnId : null,
      Number.isInteger(data.stepIndex) ? data.stepIndex : null,
      JSON.stringify(visiblePayload(event)), event.meta.at]);
    if (!inserted.rowCount) {
      if (streamIndex !== undefined) {
        await client.query(`UPDATE event_projections SET stream_index = COALESCE(stream_index, $2)
          WHERE native_event_id = $1 AND conversation_id = $3`,
        [event.meta.id, streamIndex, row.conversation_id]);
      }
      return;
    }
    if (event.type === "message.received") {
      if (typeof data.message !== "string" || typeof data.turnId !== "string" ||
          messageDigest(data.message) !== nativeInputDigest ||
          (row.input_event_id && row.input_event_id !== event.meta.id) ||
          (row.native_turn_id && row.native_turn_id !== data.turnId)) {
        throw new Error("Native input does not match the reserved attempt");
      }
      await client.query(`UPDATE response_attempts SET input_event_id = $2,
        native_turn_id = $3, dispatch_state = 'admitted', response_state = 'running',
        updated_at = now(), revision = revision + 1 WHERE id = $1`,
      [attemptId, event.meta.id, data.turnId]);
      return;
    }
    if (!row.native_turn_id || row.native_turn_id !== data.turnId) {
      const marker=(await client.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
      const background=marker?.schema_version>=61 && typeof data.turnId==='string' && (await client.query(`SELECT 1 FROM research_background_turns
        WHERE native_session_id=$1 AND turn_id=$2 AND attempt_id=$3`,[nativeSessionId,data.turnId,attemptId])).rowCount;
      const resumed=typeof data.turnId==='string' && (await hasNativeInputWindow(client,attemptId,nativeSessionId,data.turnId,false) || marker?.schema_version>=65 && !!(await client.query(`SELECT 1 FROM native_input_resume_windows resume
        JOIN event_projections resolution ON resolution.native_event_id=resume.native_event_id
        WHERE resume.attempt_id=$1 AND resolution.native_session_id=$2 AND resolution.turn_id=$3`,[attemptId,nativeSessionId,data.turnId])).rowCount);
      const resolving=event.type==='input.resolved' && await inputResolutionAttempt(client,nativeSessionId,attemptId,data)===attemptId;
      if(!background && !resumed && !resolving)throw new Error("Native turn does not match the reserved attempt");
    }
    if((event.type==='input.requested' || event.type==='input.resolved') &&
       (await conversationFeature(client,row.conversation_id)).kind==='normal') {
      if(event.type==='input.requested') {
        await client.query(`UPDATE response_attempts SET response_state='waiting_input',updated_at=now(),revision=revision+1
          WHERE id=$1 AND response_state IN('pending','running','completed')`,[attemptId]);
        await client.query(`UPDATE watchdog_jobs SET state='settled',lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE attempt_id=$1`,[attemptId]);
      }else{
        if(await inputResolutionAttempt(client,nativeSessionId,attemptId,data)!==attemptId)throw new Error('Native input resolution has no owned pending request');
        const posted=(await client.query(`SELECT min(resume.deadline_at) AS deadline_at FROM native_input_resume_windows resume
          JOIN event_projections request ON request.native_event_id=resume.native_event_id
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(request.visible_payload->'requests','[]'::jsonb)) item
          WHERE resume.attempt_id=$1 AND request.native_session_id=$2 AND request.event_type='input.requested'
            AND item->>'requestId' IN(SELECT resolution->>'requestId' FROM jsonb_array_elements($3::jsonb) resolution)`,
          [attemptId,nativeSessionId,JSON.stringify(data.resolutions??[])])).rows[0]?.deadline_at;
        const resumed=await client.query(`UPDATE response_attempts SET response_state='running',updated_at=now(),revision=revision+1
          WHERE id=$1 AND response_state='waiting_input' RETURNING id`,[attemptId]);
        if(posted && posted.getTime()>Date.now()) {
          await client.query(`INSERT INTO native_input_resume_windows(attempt_id,native_event_id,deadline_at)
            VALUES($1,$2,$3) ON CONFLICT(native_event_id) DO NOTHING`,[attemptId,event.meta.id,posted]);
        }else if(resumed.rows[0]) {
          const window=(await client.query(`INSERT INTO native_input_resume_windows(attempt_id,native_event_id,deadline_at)
            VALUES($1,$2,date_trunc('milliseconds',clock_timestamp())+interval '120 seconds') RETURNING deadline_at`,[attemptId,event.meta.id])).rows[0];
          await client.query(`UPDATE watchdog_jobs SET deadline_at=$2,state='pending',next_attempt_at=$2,
            lease_owner=NULL,lease_expires_at=NULL,failure_count=0,last_error_code=NULL,updated_at=now() WHERE attempt_id=$1`,[attemptId,window.deadline_at]);
        }
      }
      return;
    }
    const planStepRecorded=await reconcilePlanModelEvent(client,attemptId,event.type,data);
    if (event.type === "step.completed" && planStepRecorded!==false) {
      const usage = data.usage;
      const outputTokens = typeof usage === "object" && usage !== null &&
        "outputTokens" in usage && Number.isSafeInteger(usage.outputTokens) &&
        (usage.outputTokens as number) >= 0 ? usage.outputTokens as number : 0;
      await client.query(`UPDATE response_attempts SET output_tokens = output_tokens + $2,
        updated_at = now(), revision = revision + 1 WHERE id = $1`, [attemptId, outputTokens]);
    }
    const terminal: Record<string, string> = {
      "turn.completed": "completed", "turn.cancelled": "cancelled", "turn.failed": "failed",
    };
    if (terminal[event.type]) {
      if(event.type==='turn.completed' && row.native_turn_id===data.turnId &&
        await hasNativeInputWindow(client,attemptId,nativeSessionId,'',true))return;
      await client.query(`UPDATE response_attempts SET response_state = $2,
        updated_at = now(), revision = revision + 1 WHERE id = $1
        AND response_state IN ('pending','running','stopping')`, [attemptId, terminal[event.type]]);
      await client.query(`UPDATE watchdog_jobs SET state = 'settled', lease_owner = NULL,
        lease_expires_at = NULL, updated_at = now() WHERE attempt_id = $1`, [attemptId]);
    }
  }
}
