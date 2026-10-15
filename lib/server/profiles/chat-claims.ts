import {conversationFeature} from "../conversations/feature";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { ProfileActor } from "./policy";
import type { ProfilePayload } from "../../contracts/profile-payloads";
import { HttpFailure, hiddenRecord } from "../../contracts/http";

export async function validateOwnedClaimSource(client: PoolClient, actor: ProfileActor,
  customerId: string, payload: ProfilePayload): Promise<{ conversationId: string;
  messageId: string; spanDigest: string } | null> {
  if (payload.kind !== "claim") return null;
  if (!payload.sourceMessageId && !payload.sourceSpanDigest) return null;
  if (!payload.sourceMessageId || !payload.sourceSpanDigest || !payload.sourceExcerpt) {
    throw new HttpFailure(422, "invalid_claim_source", "Select an exact owned message span");
  }
  if (payload.sourceUrl) {
    throw new HttpFailure(422, "invalid_claim_source", "A chat claim cannot impersonate a public source");
  }
  const digest = createHash("sha256").update(payload.sourceExcerpt).digest("hex");
  if (digest !== payload.sourceSpanDigest) {
    throw new HttpFailure(422, "invalid_claim_source", "Message span changed");
  }
  const message = await client.query<{ conversation_id: string; text: string;customer_id:string|null;live_customer_context:boolean }>(`
    SELECT sm.conversation_id,sm.text,c.customer_id,to_jsonb(c)->>'live_customer_context'='true' AS live_customer_context FROM submitted_messages sm
    JOIN conversations c ON c.id=sm.conversation_id
    WHERE sm.id=$1 AND c.workspace_id=$3
      AND c.owner_principal_id=$4 AND ($2::uuid IS NOT NULL)`,
  [payload.sourceMessageId, customerId, actor.workspaceId, actor.principalId]);
  const original=message.rows[0];
  if (!original || !original.text.includes(payload.sourceExcerpt)) throw hiddenRecord();
  if(original.customer_id && original.customer_id!==customerId &&
    (!original.live_customer_context || (await conversationFeature(client,original.conversation_id)).kind!=='normal'))throw hiddenRecord();
  return { conversationId: message.rows[0].conversation_id,
    messageId: payload.sourceMessageId, spanDigest: digest };
}
