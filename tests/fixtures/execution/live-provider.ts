import {randomUUID} from "node:crypto";
import {wrapLanguageModel} from "ai";
import {executionDigest} from "../../../lib/server/execution/commands";
import {assertDeterministicTestMode} from "../runtime";
import {query} from "../../../lib/server/db/client";
import {assertExecutionProviderRelease,type ExecutionModelIdentity} from "../../../lib/server/execution/native-admission";
import type {FeaturePrincipal} from "../../../lib/server/conversations/feature";
import {requireOwnedExecutionClone} from "../../../scripts/execution-eval-environment";
type Model=Parameters<typeof wrapLanguageModel>[0]["model"];
/** Observer of the real selected gateway, installed only in an owned eval copy.
 * Provider headers/options/credentials are deliberately absent from captures. */
export function observeExecutionLiveProvider(model:Model,principal:FeaturePrincipal,identity:ExecutionModelIdentity){
  requireOwnedExecutionClone();if(process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY==="1")assertDeterministicTestMode();else if(process.env.TURAS_ALLOW_LIVE_MODEL_TESTS!=="1"||!process.env.AI_GATEWAY_API_KEY)throw new Error("Owned live observation required");
  let observationId:string|undefined;
  const begin=async(signal:AbortSignal|undefined)=>{
    if(!signal||!observationId)throw new Error("Native deadline and provider observation required");
    signal.throwIfAborted();await assertExecutionProviderRelease(principal,identity);signal.throwIfAborted();
    if((await query("UPDATE execution_live_provider_observations SET io_started_at=clock_timestamp() WHERE id=$1 AND io_started_at IS NULL",[observationId])).rowCount!==1)throw new Error("Actual live provider IO already claimed");
  };
  const hold=async(signal:AbortSignal|undefined)=>{
    while(true){signal?.throwIfAborted();const row=(await query(`SELECT b.released FROM execution_live_provider_barriers b
      JOIN execution_live_provider_observations o ON o.attempt_id=b.attempt_id WHERE o.id=$1`,[observationId])).rows[0];
      if(!row||row.released)return;await new Promise(r=>setTimeout(r,50));}
  };
  return wrapLanguageModel({model,middleware:{
    transformParams:async({params,type})=>{
      const captured={prompt:params.prompt,tools:params.tools??[],toolChoice:params.toolChoice??null},encoded=JSON.stringify(captured);
      if(Buffer.byteLength(encoded)>131072||!params.abortSignal||!Number.isSafeInteger(params.maxOutputTokens)||params.maxOutputTokens!<1||params.maxOutputTokens!>4096)throw new Error("Live native bounds absent");
      observationId=randomUUID();
      const result=await query(`INSERT INTO execution_live_provider_observations(id,attempt_id,response_attempt_id,step_id,step_index,provider_path,max_output_tokens,
        deadline_ms,prompt_digest,captured) SELECT $1,a.id,a.response_attempt_id,s.id,$4::int,$5,$6,EXTRACT(epoch FROM(a.deadline_at-clock_timestamp()))*1000,$7,$8::jsonb
        FROM execution_advice_attempts a JOIN execution_advice_steps s ON s.attempt_id=a.id AND s.step_token=$3||'/'||$4::int::text
        WHERE a.response_attempt_id=$2 AND a.state='running' AND a.deadline_at>clock_timestamp() AND a.environment_id=$9`,
        [observationId,identity.responseAttemptId,identity.turnId,identity.stepIndex,type,params.maxOutputTokens,executionDigest(captured),encoded,process.env.TURAS_ENVIRONMENT_ID]);
      if(result.rowCount!==1)throw new Error("Live provider receipt association unavailable");return params;
    },
    wrapGenerate:async({doGenerate,params})=>{await begin(params.abortSignal);const result=await doGenerate();await hold(params.abortSignal);return result;},
    wrapStream:async({doStream,params})=>{await begin(params.abortSignal);const result=await doStream();await hold(params.abortSignal);return result;},
  }});
}
