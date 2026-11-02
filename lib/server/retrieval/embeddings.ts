import {withOperationalProviderIo} from '../operations/admission';
import { randomUUID } from "node:crypto";
import { embedMany, gateway } from "ai";
import { withTransaction } from "../db/client";
import { retrievalLimits } from "../../contracts/retrieval";
import { finishEmbeddingOperation, markEmbeddingDispatched,
  reserveEmbeddingOperation } from "./jobs";
import { recordRetrievalMetric } from "./telemetry";
import { reserveParityEmbedding,settleParityProvider } from "../research/specialists/evaluation-budget";

export const embeddingModelId = "openai/text-embedding-3-small";

export function exactEmbeddingVector(value: readonly number[]): number[] {
  if (value.length !== retrievalLimits.embeddingDimensions ||
      value.some((entry) => !Number.isFinite(entry)) ||
      !value.some((entry) => entry !== 0)) {
    throw new Error("Embedding contract mismatch");
  }
  return [...value];
}

/** Internal provider-boundary admission; never supplied by a browser/model. */
export type RetrievalEmbeddingOptions={jobId?:string;operationKey?:string;signal?:AbortSignal;beforeProvider?:()=>Promise<void>};
export async function embedRetrievalTexts(values: readonly string[],options:RetrievalEmbeddingOptions={}) {
 return embedGovernedTexts(values,options,2000);
}
export async function embedWorkspacePatternText(value:string):Promise<number[]> {
 return (await embedGovernedTexts([value],{},16000))[0];
}
async function embedGovernedTextsWithinFence(values: readonly string[],
  options: RetrievalEmbeddingOptions,characterLimit:number): Promise<number[][]> {
  if (values.length < 1 || values.length > retrievalLimits.embeddingBatch ||
      values.some((value) => !value.trim() || Array.from(value).length > characterLimit) ||
      !process.env.AI_GATEWAY_API_KEY) throw new Error("Embedding unavailable or input exceeds limit");
  const normalized = values.map((value) => value.normalize("NFC"));
  const inputCharacters = normalized.reduce((sum,value) => sum + Array.from(value).length,0);
  const operation = await withTransaction(async (client) => {
    const reserved = await reserveEmbeddingOperation(client,{
      jobId: options.jobId ?? null,operationKey: options.operationKey ?? randomUUID(),
      inputCharacters,modelId: embeddingModelId,
    });
    if (reserved.state !== "reserved" || !await markEmbeddingDispatched(client,reserved.id)) {
      throw new Error("Embedding operation cannot be replayed");
    }
    return reserved;
  });
  const started = Date.now();
  try {
    const budget=await reserveParityEmbedding(inputCharacters);
    options.signal?.throwIfAborted();
    await options.beforeProvider?.();
    const response = await embedMany({ model: gateway.embeddingModel(embeddingModelId),
      values: normalized,maxRetries: 0,maxParallelCalls: retrievalLimits.concurrentEmbeddingCalls,
      abortSignal: AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(retrievalLimits.embeddingTimeoutMs)]),
      experimental_telemetry: { isEnabled: false } });
    await settleParityProvider(budget,response.providerMetadata);
    if (response.embeddings.length !== normalized.length) throw new Error("Embedding count mismatch");
    const vectors = response.embeddings.map(exactEmbeddingVector);
    await withTransaction((client) => finishEmbeddingOperation(client,operation.id,"succeeded"));
    recordRetrievalMetric("embedding_duration_ms",Date.now()-started);
    return vectors;
  } catch {
    await withTransaction((client) => finishEmbeddingOperation(client,operation.id,"unconfirmed"));
    recordRetrievalMetric("unconfirmed_operation_count",1);
    throw new Error("Embedding unavailable or outcome unconfirmed");
  }
}

async function embedGovernedTexts(values:readonly string[],options:RetrievalEmbeddingOptions,characterLimit:number):Promise<number[][]>{
 return withOperationalProviderIo(()=>embedGovernedTextsWithinFence(values,options,characterLimit),options.signal);
}
