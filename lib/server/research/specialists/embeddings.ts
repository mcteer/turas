import type {SpecialistResearchGuard} from './discussion-research-guard';
import { z } from "zod";
import { embeddingModelId,embedRetrievalTexts } from "../../retrieval/embeddings";
export const embeddingModel=embeddingModelId;
export const embeddingSchema=z.array(z.number().finite()).length(1536)
  .refine(vector=>vector.some(value=>value!==0),"An embedding must have nonzero magnitude");
export function embeddingsConfigured() { return Boolean(process.env.AI_GATEWAY_API_KEY); }
export async function embedQuery(query:string,signal?:AbortSignal,guard?:SpecialistResearchGuard) {
  signal?.throwIfAborted();
  let operation:Awaited<ReturnType<SpecialistResearchGuard['beforeRequest']>>|undefined;
  const vector=(await embedRetrievalTexts([query],{signal,beforeProvider:async()=>{
    operation=await guard?.beforeRequest('embedding:'+query,{inputTokens:Buffer.byteLength(query)+256});
  }}))[0];
  const parsed=embeddingSchema.parse(vector);
  // The validated response is completion evidence even if downstream use was
  // cancelled meanwhile. Monetary usage stays unknown and fully reserved.
  await operation?.complete();
  signal?.throwIfAborted();
  return parsed;
}
