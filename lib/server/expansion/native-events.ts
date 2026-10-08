import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { validateExpansionAdviceResult } from "../../expansion/advice";
import type { NativeEvent } from "../conversations/projection";
import { getServerConfig } from "../config";
import { messageDigest } from "../conversations/dispatch";
import { conversationFeature } from "../conversations/feature";
import { assertExpansionNativeRelease, type ExpansionNativeRelease } from "./native-release";
import {validateExpansionAssertions} from "./sources";
import {assessPlanEvidence} from "../plans/sources";
import { expansionHash } from "./commands";

export type ExpansionNativeProjection = { expansion: true; usage?: { inputTokens: number | null; outputTokens: number | null } };
const tokens = (raw: unknown, key: string): number | null => {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
};

/** No intermediate model text is durable or visible. Only complete strict final
 * output can be released; terminal metadata is independent of content authority. */
export async function projectExpansionNativeEventInTransaction(db: PoolClient, nativeSessionId: string, responseAttemptId: string,
  event: NativeEvent, streamIndex?: number, prepared?: ExpansionNativeRelease | null): Promise<false | ExpansionNativeProjection> {
  const association = (await db.query(`SELECT c.id FROM conversations c JOIN response_attempts r ON r.conversation_id=c.id
    WHERE r.id=$1 AND c.eve_session_id=$2 AND c.environment_id=$3 AND c.binding_state='bound'`,
  [responseAttemptId, nativeSessionId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!association) throw hiddenRecord();
  if ((await conversationFeature(db, association.id)).kind !== "expansion") return false;
  if (!event.meta.id || !/^evt_[A-Za-z0-9_-]+$/.test(event.meta.id) || !event.meta.at || !Number.isFinite(Date.parse(event.meta.at)) ||
    streamIndex !== undefined && (!Number.isSafeInteger(streamIndex) || streamIndex < 0)) throw hiddenRecord();
  const data = event.data ?? {};
  if (typeof data.turnId !== "string" || !data.turnId || data.turnId.length > 180) throw hiddenRecord();
  let finalOutput: ReturnType<typeof validateExpansionAdviceResult> | null = null;
  let invalidOutput = false;
  let withheldOutput = false;
  if (event.type === "message.completed") {
    if (!prepared || prepared.responseAttemptId !== responseAttemptId || prepared.nativeSessionId !== nativeSessionId)
      throw new HttpFailure(503, "expansion_release_preflight_required", "Current expansion output preparation required");
    let bound: Awaited<ReturnType<typeof assertExpansionNativeRelease>> | null = null;
    try { bound = await assertExpansionNativeRelease(db, prepared); }
    catch (error) {
      // A denied content release must not interrupt the native event callback:
      // the framework still owes the admitted step's actual terminal usage.
      // Identity/turn association is checked below before any projection/write.
      if (!(error instanceof HttpFailure) || ![401, 403, 404, 409].includes(error.status)) throw error;
      withheldOutput = true;
    }
    // eve completes assistant messages before executing tools as well as at the
    // end of a turn. Pre-tool narration is never a released advice result.
    if (bound && data.finishReason !== "tool-calls") try {
      if (typeof data.message !== "string" || Buffer.byteLength(data.message, "utf8") > 65536) throw new Error("Invalid final output");
      finalOutput = validateExpansionAdviceResult(JSON.parse(data.message), bound.refs.map(ref=>({id:ref.id,kind:ref.kind})), bound.scope.selectedHypothesisIds);
      for(const proposal of finalOutput.proposals)await validateExpansionAssertions(db,bound.actor,bound.scope.customerId,proposal.content,bound.refs.filter(ref=>proposal.citationKeys.includes(ref.id)));
      for(const fact of finalOutput.facts.filter(fact=>fact.classification==='accepted_fact')){
        const originals=bound.refs.filter((ref):ref is Extract<typeof ref,{locator:unknown}>=>'locator' in ref&&fact.citationKeys.includes(ref.id));
        const assessment=await assessPlanEvidence(db,bound.actor,bound.scope.customerId,{sourceDependencies:originals,assertions:[{key:'advice-fact',text:fact.statement,kind:'accepted_fact',sourceDependencyIds:fact.citationKeys,decisionCritical:true}]});
        if(assessment.issues.length)throw new Error('Inadequate factual evidence');
      }
    } catch { invalidOutput = true; }
  }
  await db.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [association.id]);
  const response = (await db.query("SELECT * FROM response_attempts WHERE id=$1 AND conversation_id=$2 FOR UPDATE", [responseAttemptId, association.id])).rows[0];
  const advice = (await db.query("SELECT * FROM expansion_advice_attempts WHERE response_attempt_id=$1 AND conversation_id=$2 FOR UPDATE", [responseAttemptId, association.id])).rows[0];
  if (!response || !advice || !["dispatching", "admitted", "uncertain"].includes(response.dispatch_state)) throw hiddenRecord();
  if (event.type === "message.received") {
    if (typeof data.message !== "string" || messageDigest(data.message) !== response.input_digest ||
      response.input_event_id && response.input_event_id !== event.meta.id || response.native_turn_id && response.native_turn_id !== data.turnId) throw hiddenRecord();
  } else if (!response.input_event_id || response.native_turn_id !== data.turnId) throw hiddenRecord();
  const inputTokens = tokens(data.usage, "inputTokens"), outputTokens = tokens(data.usage, "outputTokens");
  const step = event.type === "step.completed" || event.type === "step.failed";
  const payload = finalOutput && !["cancelled", "failed", "expired", "unconfirmed"].includes(advice.state)
    ? { message: JSON.stringify(finalOutput), finishReason: data.finishReason }
    : step ? { usage: { inputTokens, outputTokens } } : invalidOutput ? { code: "invalid_advice" } : {};
  const inserted = await db.query(`INSERT INTO event_projections(native_event_id,conversation_id,native_session_id,stream_index,
    event_type,turn_id,step_index,visible_payload,emitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
    ON CONFLICT(native_event_id) DO NOTHING RETURNING native_event_id`,
  [event.meta.id, association.id, nativeSessionId, streamIndex ?? null, event.type, data.turnId,
    Number.isSafeInteger(data.stepIndex) ? data.stepIndex : null, JSON.stringify(payload), event.meta.at]);
  if (!inserted.rowCount) {
    const prior = (await db.query("SELECT * FROM event_projections WHERE native_event_id=$1", [event.meta.id])).rows[0];
    if (!prior || prior.conversation_id !== association.id || prior.native_session_id !== nativeSessionId || prior.event_type !== event.type ||
      prior.turn_id !== data.turnId || prior.emitted_at.getTime() !== Date.parse(event.meta.at) || expansionHash(prior.visible_payload) !== expansionHash(payload)) throw hiddenRecord();
    return { expansion: true };
  }
  if (event.type === "message.received") {
    await db.query(`UPDATE response_attempts SET input_event_id=$2,native_turn_id=$3,dispatch_state='admitted',
      response_state=CASE WHEN response_state='pending' AND $4='running' THEN 'running' ELSE response_state END,
      revision=revision+1,updated_at=clock_timestamp() WHERE id=$1`, [responseAttemptId, event.meta.id, data.turnId, advice.state]);
    await db.query("UPDATE expansion_advice_attempts SET native_turn_id=$2,native_session_id=$3 WHERE id=$1", [advice.id, data.turnId, nativeSessionId]);
  }
  if (finalOutput && !["cancelled", "failed", "expired", "unconfirmed"].includes(advice.state)) {
    const digest = expansionHash(finalOutput);
    await db.query(`INSERT INTO expansion_advice_payloads(attempt_id,kind,content_digest,payload) VALUES($1,'output',$2,$3::jsonb)
      ON CONFLICT(attempt_id,kind) DO NOTHING`, [advice.id, digest, JSON.stringify(finalOutput)]);
    const retained = (await db.query("SELECT content_digest FROM expansion_advice_payloads WHERE attempt_id=$1 AND kind='output'", [advice.id])).rows[0];
    if (retained?.content_digest !== digest) throw new HttpFailure(409, "output_conflict", "Expansion final output changed");
    await db.query("UPDATE expansion_advice_attempts SET output_digest=$2 WHERE id=$1", [advice.id, digest]);
  }
  if (invalidOutput) await db.query("UPDATE expansion_advice_attempts SET state='failed',failure_code='invalid_advice',settled_at=clock_timestamp() WHERE id=$1", [advice.id]);
  if (withheldOutput) await db.query(`UPDATE expansion_advice_attempts SET state='failed',failure_code='expansion_context_changed',
    settled_at=COALESCE(settled_at,clock_timestamp()) WHERE id=$1 AND state IN ('prepared','running')`, [advice.id]);
  if(event.type==='step.failed')await db.query("UPDATE expansion_advice_attempts SET state='failed',failure_code='provider_step_failed',settled_at=COALESCE(settled_at,clock_timestamp()) WHERE id=$1 AND state IN ('prepared','running')",[advice.id]);
  if (step) {
    if (!Number.isInteger(data.stepIndex) || Number(data.stepIndex) < 0 || Number(data.stepIndex) > 5) throw hiddenRecord();
    const receipt = (await db.query("SELECT id FROM expansion_model_step_receipts WHERE attempt_id=$1 AND step_token=$2", [advice.id, `${data.turnId}/${data.stepIndex}`])).rows[0];
    if (!receipt && event.type === "step.completed") throw new HttpFailure(409, "expansion_step_unadmitted", "Native usage has no admitted model call");
    if (receipt) await db.query(`INSERT INTO expansion_advice_usage(step_id,native_event_id,outcome,input_tokens,output_tokens) VALUES($1,$2,$3,$4,$5)`,
      [receipt.id, event.meta.id, inputTokens === null || outputTokens === null ? "unknown" : event.type === "step.failed" ? "failed" : "confirmed", inputTokens, outputTokens]);
    if (outputTokens !== null) await db.query("UPDATE response_attempts SET output_tokens=output_tokens+$2 WHERE id=$1", [responseAttemptId, outputTokens]);
  }
  if (["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type)) {
    const retained = (await db.query("SELECT 1 FROM expansion_advice_payloads WHERE attempt_id=$1 AND kind='output'", [advice.id])).rowCount;
    const state = event.type === "turn.cancelled" ? "cancelled" : event.type === "turn.completed" && retained ? "completed" : "failed";
    await db.query(`UPDATE expansion_advice_attempts SET state=CASE WHEN state IN ('prepared','running') THEN $2 ELSE state END,
      settled_at=COALESCE(settled_at,clock_timestamp()) WHERE id=$1`, [advice.id, state]);
    await db.query(`UPDATE response_attempts SET response_state=CASE WHEN response_state IN ('pending','running','stopping') THEN $2 ELSE response_state END,
      updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1`, [responseAttemptId, state]);
  }
  return { expansion: true, ...(step ? { usage: { inputTokens, outputTokens } } : {}) };
}
