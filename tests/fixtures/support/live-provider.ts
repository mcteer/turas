import { randomUUID } from "node:crypto";
import { wrapLanguageModel } from "ai";
import { query } from "../../../lib/server/db/client";
import { supportDigest } from "../../../lib/server/support/commands";
import type { ExecutionModelIdentity } from "../../../lib/server/execution/native-admission";
import type { FeaturePrincipal } from "../../../lib/server/conversations/feature";
import { requireOwnedSupportClone } from "../../../scripts/support-eval-environment";
import { assertDeterministicTestMode } from "../runtime";
import { captureSupportProviderOutput, supportProviderFinishReason } from "../../../scripts/support-provider-output";
type Model = Parameters<typeof wrapLanguageModel>[0]["model"];

/** Observe, never replace, the supplied model. Never retain headers, credentials
 * or arbitrary provider metadata. Private prompts/tools remain in the owned DB. */
export function observeSupportLiveProvider(model: Model, principal: FeaturePrincipal, identity: ExecutionModelIdentity) {
  requireOwnedSupportClone();
  if (process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY === "1") assertDeterministicTestMode();
  else if (process.env.TURAS_ALLOW_LIVE_MODEL_TESTS !== "1" || !process.env.AI_GATEWAY_API_KEY) throw new Error("Explicit owned live observation required");
  let observationId: string | undefined;
  async function begin(signal: AbortSignal | undefined) {
    if (!signal || !observationId) throw new Error("Support observation requires native admission and deadline");
    // The outer production wrapSupportModel runs its authoritative beforeProvider
    // check before entering this observer. Do not repeat its full governed source
    // retrieval here: observation must not add another content-authority pass.
    // transformParams below still requires the exact durable admitted step.
    signal.throwIfAborted();
    if ((await query("UPDATE support_live_provider_observations SET io_started_at=clock_timestamp() WHERE id=$1 AND io_started_at IS NULL", [observationId])).rowCount !== 1)
      throw new Error("Support provider IO already claimed");
  }
  async function hold(signal: AbortSignal | undefined) {
    for (;;) {
      signal?.throwIfAborted();
      const row = (await query(`SELECT b.released FROM support_live_provider_barriers b
        JOIN support_live_provider_observations o ON o.attempt_id=b.attempt_id WHERE o.id=$1`, [observationId])).rows[0];
      if (!row || row.released) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  async function finish(metadata: unknown, text: string, reason: unknown) {
    const gateway = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).gateway : null;
    const values = gateway && typeof gateway === "object" ? gateway as Record<string, unknown> : {};
    // Gateway documents cost as a decimal string. Capture only the allowlisted
    // actual cost and generation identity, never routing/credential metadata.
    const cost = typeof values.cost === "string" && /^\d+(?:\.\d+)?$/.test(values.cost) &&
      Number.isFinite(Number(values.cost)) ? values.cost : null;
    const generation = typeof values.generationId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(values.generationId) ? values.generationId : null;
    const output = captureSupportProviderOutput(text, reason);
    // Preserve bounded text even when malformed. Its absence previously prevented
    // offline diagnosis; a digest is still assigned only to valid final advice.
    await query("UPDATE support_live_provider_observations SET cost_usd=$2,generation_id=$3,provider_finished_at=clock_timestamp(),output_text=$4,output_digest=$5,finish_reason=$6 WHERE id=$1",
      [observationId, cost, generation, text || null, output?.digest ?? null, supportProviderFinishReason(reason)]);
    return output !== null;
  }
  return wrapLanguageModel({ model, middleware: {
    transformParams: async ({ params, type }) => {
      const captured = { prompt: params.prompt, tools: params.tools ?? [], toolChoice: params.toolChoice ?? null }, encoded = JSON.stringify(captured);
      if (Buffer.byteLength(encoded) > 131072 || !params.abortSignal || !Number.isSafeInteger(params.maxOutputTokens) ||
        params.maxOutputTokens! < 1 || params.maxOutputTokens! > 4096) throw new Error("Support observation bounds unavailable");
      observationId = randomUUID();
      const row = await query(`INSERT INTO support_live_provider_observations(id,attempt_id,response_attempt_id,step_id,step_index,
        provider_path,max_output_tokens,prompt_digest,captured)
        SELECT $1,a.id,a.response_attempt_id,s.id,$4,$5,$6,$7,$8::jsonb FROM support_advice_attempts a
        JOIN support_model_step_receipts s ON s.attempt_id=a.id AND s.step_token=$3||'/'||$4::int::text
        WHERE a.response_attempt_id=$2 AND a.state='running' AND a.deadline_at>clock_timestamp() AND a.environment_id=$9`,
      [observationId, identity.responseAttemptId, identity.turnId, identity.stepIndex, type, params.maxOutputTokens,
        supportDigest(captured), encoded, process.env.TURAS_ENVIRONMENT_ID]);
      if (row.rowCount !== 1) throw new Error("Support observation admission association unavailable");
      return params;
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      await begin(params.abortSignal); const result = await doGenerate();
      const text = result.content.filter(item => item.type === "text").map(item => item.text).join("");
      if (await finish(result.providerMetadata, text, result.finishReason)) await hold(params.abortSignal);
      return result;
    },
    wrapStream: async ({ doStream, params }) => {
      await begin(params.abortSignal); const result = await doStream(); let text = "";
      return { ...result, stream: result.stream.pipeThrough(new TransformStream({
        async transform(chunk, controller) {
          if (chunk.type === "text-delta") {
            text += chunk.delta;
            if (Buffer.byteLength(text, "utf8") > 131072) throw new Error("Support provider output capture exceeds bound");
          }
          if (chunk.type === "finish" && await finish(chunk.providerMetadata, text, chunk.finishReason)) await hold(params.abortSignal);
          controller.enqueue(chunk);
        },
      })) };
    },
  } });
}
