import { z } from "zod";
import { embeddingModelId,embedRetrievalTexts } from "../../retrieval/embeddings";
export const embeddingModel=embeddingModelId;
export const embeddingSchema=z.array(z.number().finite()).length(1536)
  .refine(vector=>vector.some(value=>value!==0),"An embedding must have nonzero magnitude");
export function embeddingsConfigured() { return Boolean(process.env.AI_GATEWAY_API_KEY); }
export async function embedQuery(query:string,signal?:AbortSignal) {
  signal?.throwIfAborted();
  const vector=(await embedRetrievalTexts([query],{signal}))[0];
  signal?.throwIfAborted();
  return embeddingSchema.parse(vector);
}
