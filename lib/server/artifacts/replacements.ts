import { z } from "zod";
import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { artifactFileMetadataSchema } from "../../contracts/artifacts";
import { hiddenRecord } from "../../contracts/http";
import { createArtifactUploadBatch } from "./intake";

export const artifactReplacementCommandSchema = z.object({
  expectedGeneration: z.number().int().positive(),
  idempotencyKey: z.string().min(1).max(128),
  file: artifactFileMetadataSchema,
}).strict();

export async function createArtifactReplacementIntent(actor: CurrentSession,versionId: string,
  raw: unknown,existingClient?: PoolClient) {
  const input = artifactReplacementCommandSchema.parse(raw);
  const execute = async (client: PoolClient) => {
    const source = await client.query<{ customer_id: string; workload_id: string | null;
      origin_conversation_id: string }>(`
      SELECT v.customer_id,a.workload_id,a.origin_conversation_id
      FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id
      WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3`,
    [versionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId]);
    if (!source.rows[0]) throw hiddenRecord();
    const batch = await createArtifactUploadBatch(actor,{
      conversationId: source.rows[0].origin_conversation_id,
      customerId: source.rows[0].customer_id,workloadId: source.rows[0].workload_id,
      idempotencyKey: input.idempotencyKey,files: [input.file],
    },client,{ versionId,expectedGeneration: input.expectedGeneration });
    return { batchId: batch.batchId,intent: batch.intents[0],expiresAt: batch.expiresAt };
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}
