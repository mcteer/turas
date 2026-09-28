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
  const message = await client.query<{ conversation_id: string; text: string }>(`
    SELECT sm.conversation_id,sm.text FROM submitted_messages sm
    JOIN conversations c ON c.id=sm.conversation_id
    WHERE sm.id=$1 AND c.customer_id=$2 AND c.workspace_id=$3
      AND c.owner_principal_id=$4`,
  [payload.sourceMessageId, customerId, actor.workspaceId, actor.principalId]);
  if (!message.rows[0] || !message.rows[0].text.includes(payload.sourceExcerpt)) throw hiddenRecord();
  return { conversationId: message.rows[0].conversation_id,
    messageId: payload.sourceMessageId, spanDigest: digest };
}
