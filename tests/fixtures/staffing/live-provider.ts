import { randomUUID } from "node:crypto";
import { wrapLanguageModel } from "ai";
import { requireOwnedStaffingClone } from "../../../scripts/staffing-eval-environment";
import { query } from "../../../lib/server/db/client";
import { assertGovernedStaffingProviderRelease } from "../../../lib/server/staffing/native-admission";
import { staffingSha256 } from "../../../lib/server/staffing/commands";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
type Principal = Parameters<typeof assertGovernedStaffingProviderRelease>[0];
type Identity = Parameters<typeof assertGovernedStaffingProviderRelease>[1];

/** Owned live-evaluation observation only. This wraps the selected real gateway
 * model; it never replaces its response or manufactures usage/step receipts.
 * Do not import from the checked-in root agent or ordinary runtime. */
export function observeStaffingLiveProvider(model: Model, principal: Principal, identity: Identity) {
  requireOwnedStaffingClone();
  if (process.env.TURAS_ALLOW_LIVE_MODEL_TESTS !== "1" || !process.env.AI_GATEWAY_API_KEY) throw new Error("Owned live provider observation required");
  return wrapLanguageModel({ model, middleware: { transformParams: async ({ params, type }) => {
    requireOwnedStaffingClone();
    // Retain actual prompt/catalog only. Provider headers, keys, credentials,
    // request metadata and arbitrary provider options are never copied.
    const captured = { prompt: params.prompt, tools: params.tools ?? [], toolChoice: params.toolChoice ?? null };
    const encoded = JSON.stringify(captured);
    if (Buffer.byteLength(encoded, "utf8") > 131_072 || !Number.isSafeInteger(params.maxOutputTokens) ||
      params.maxOutputTokens! < 1 || params.maxOutputTokens! > 4096) throw new Error("Owned live provider capture exceeded its boundary");
    const recorded = await query(`INSERT INTO staffing_live_provider_observations(id,attempt_id,response_attempt_id,step_receipt_id,
      turn_id,step_index,provider_path,max_output_tokens,content_digest,captured)
      SELECT $1,a.id,response.id,paid.id,$3,$4::integer,$5,$6,$7,$8::jsonb FROM staffing_advisory_attempts a
      JOIN response_attempts response ON response.id=a.response_attempt_id
      JOIN staffing_model_step_receipts paid ON paid.attempt_id=a.id AND paid.step_token=$3 || '/' || $4::integer::text
      WHERE response.id=$2 AND response.native_turn_id=$3 AND a.environment_id=$9 AND a.state='running'
        AND a.deadline_at>clock_timestamp() RETURNING id,attempt_id`,
    [randomUUID(), identity.responseAttemptId, identity.turnId, identity.stepIndex, type, params.maxOutputTokens,
      staffingSha256(captured), encoded, process.env.TURAS_ENVIRONMENT_ID]);
    if (recorded.rowCount !== 1) throw new Error("Owned live provider capture identity unavailable");
    const barrier = async () => (await query("SELECT step_index,released FROM staffing_live_provider_barriers WHERE attempt_id=$1",
      [recorded.rows[0].attempt_id])).rows[0];
    let waiting = await barrier();
    if (waiting?.step_index === identity.stepIndex) {
      if (!params.abortSignal) throw new Error("Owned live barrier requires the original deadline");
      while (!waiting.released) {
        params.abortSignal.throwIfAborted();
        await new Promise(resolve => setTimeout(resolve, 50));
        waiting = await barrier();
        if (!waiting || waiting.step_index !== identity.stepIndex) throw new Error("Owned live barrier identity changed");
      }
    }
    // Observation adds an asynchronous write between the normal wrapper's
    // release fence and provider IO. Recheck that original fence afterward.
    await assertGovernedStaffingProviderRelease(principal, identity);
    params.abortSignal?.throwIfAborted();
    return params;
  } } });
}
