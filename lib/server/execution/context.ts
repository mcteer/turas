import type { PoolClient } from "pg";
import { conversationFeature } from "../conversations/feature";
export async function executionScopeForConversation(db: PoolClient, conversationId: string) {
  const feature = await conversationFeature(db, conversationId);
  return feature.kind === "execution" ? feature.scope : null;
}
