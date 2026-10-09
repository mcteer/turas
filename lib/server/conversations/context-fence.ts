import { conversationFeature } from "./feature";
import type { PoolClient } from "pg";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { readOwnedBinding } from "./binding";
import { assertArtifactDependenciesCurrent } from "../artifacts/context-fence";
import { assertRetrievalDependenciesCurrent } from "../retrieval/fences";
import { assertResearchConversationCurrent } from "../research/fences";
import { planningScopeForConversation } from "../plans/context";
import { assertPlanConversationFence } from "../plans/fences";
import { staffingScopeForConversation } from "../staffing/context";
import { assertGovernedNativeRelease, prepareGovernedReleaseForNative, type GovernedNativeRelease } from "./native-release";

export async function assertNativeContextCurrentInTransaction(client: PoolClient, session: CurrentSession,
  nativeSessionId: string, preparedStaffing?: GovernedNativeRelease | null): Promise<void> {
  const lookup = await client.query<{ id: string }>(`
    SELECT id FROM conversations WHERE eve_session_id=$1 AND owner_principal_id=$2
      AND workspace_id=$3 AND environment_id=$4`,
  [nativeSessionId, session.principalId, session.workspaceId,
    getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!lookup.rows[0]) throw hiddenRecord();
  const feature = await conversationFeature(client, lookup.rows[0].id);
  if (feature.kind === "staffing" || feature.kind === "execution" || feature.kind === "support" || feature.kind === "expansion") {
    if (!preparedStaffing || preparedStaffing.conversationId !== lookup.rows[0].id || preparedStaffing.nativeSessionId !== nativeSessionId) {
      throw new HttpFailure(503, `${feature.kind}_release_preflight_required`, "Current source preparation is required");
    }
    await assertGovernedNativeRelease(client, preparedStaffing, session);
    return;
  }
  const conversation = await readOwnedBinding(client, session, lookup.rows[0].id);
  if (conversation.eve_session_id !== nativeSessionId) throw hiddenRecord();
  if (conversation.customer_id === null) {
    if (process.env.TURAS_GENERAL_CHAT_DISABLED === "1") throw hiddenRecord();
    return;
  }
  const bound = await client.query<{ context_audience: string | null;
    context_generation: string | null; context_valid_until: Date | null;
    context_snapshot_schema: string | null; internal_generation: string;
    delivery_generation: string }>(`
    SELECT c.context_audience,c.context_generation,c.context_valid_until,
      c.context_snapshot_schema,s.internal_generation,s.delivery_generation
    FROM conversations c JOIN customer_profile_state s ON s.customer_id=c.customer_id
    WHERE c.id=$1`, [conversation.id]);
  const row = bound.rows[0];
  const planning=await planningScopeForConversation(client,conversation.id);
  const audience = planning?.audience ??
    (session.kind === "internal" ? "internal" : "delivery");
  const current = audience === "internal" ? row?.internal_generation : row?.delivery_generation;
  if (!row || row.context_snapshot_schema !== "customer-context-v1" ||
      row.context_audience !== audience || row.context_generation !== current ||
      (row.context_valid_until && row.context_valid_until.getTime() <= Date.now())) {
    throw new HttpFailure(409, "context_changed", "Start a new conversation for current customer context");
  }
  await assertArtifactDependenciesCurrent(client, conversation.id);
  await assertRetrievalDependenciesCurrent(client, conversation.id);
  await assertResearchConversationCurrent(client, conversation.id);
  await assertPlanConversationFence(client,session,conversation.id);
}

export async function assertNativeContextCurrent(session: CurrentSession,
  nativeSessionId: string): Promise<void> {
  const prepared = await prepareGovernedReleaseForNative(nativeSessionId, { actor: session });
  await withTransaction((client) => assertNativeContextCurrentInTransaction(client, session, nativeSessionId, prepared));
}

export async function releaseNativeChunk(session: CurrentSession,
  nativeSessionId: string, enqueue: () => void): Promise<void> {
  const prepared = await prepareGovernedReleaseForNative(nativeSessionId, { actor: session });
  await withTransaction(async (client) => {
    await assertNativeContextCurrentInTransaction(client, session, nativeSessionId, prepared);
    enqueue();
  });
}
