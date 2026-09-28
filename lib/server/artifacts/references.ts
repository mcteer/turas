import { randomUUID } from "node:crypto";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockOwnedBinding } from "../conversations/binding";
import { hiddenRecord, HttpFailure } from "../../contracts/http";

export async function listConversationArtifacts(actor: CurrentSession, conversationId: string) {
  return withTransaction(async (client) => {
    await lockOwnedBinding(client, actor, conversationId);
    const result = await client.query<{ version_id: string; display_name: string; state: string;
      format: string | null; created_at: Date }>(`
      SELECT r.version_id,v.filename AS display_name,v.state,v.detected_format AS format,r.created_at
      FROM conversation_artifact_refs r JOIN artifact_versions v ON v.id=r.version_id
      WHERE r.conversation_id=$1 AND r.environment_id=$2 AND r.workspace_id=$3
        AND r.owner_principal_id=$4 AND r.detached_at IS NULL
      ORDER BY r.created_at,r.id
    `, [conversationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId]);
    return { items: result.rows.map((row) => ({ versionId: row.version_id,
      displayName: row.display_name, state: row.state, format: row.format,
      attachedAt: row.created_at.toISOString() })) };
  });
}

export async function attachConversationArtifact(actor: CurrentSession, conversationId: string, versionId: string) {
  return withTransaction(async (client) => {
    const binding = await lockOwnedBinding(client, actor, conversationId);
    const version = await client.query<{ id: string; state: string; filename: string }>(`
      SELECT id,state,filename FROM artifact_versions WHERE id=$1 AND environment_id=$2
        AND workspace_id=$3 AND customer_id=$4 AND owner_principal_id=$5 FOR UPDATE
    `, [versionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,binding.customer_id,actor.principalId]);
    const row = version.rows[0];
    if (!row) throw hiddenRecord();
    if (!["ready","partial"].includes(row.state)) throw new HttpFailure(409, "artifact_not_ready", "Source unavailable");
    await client.query(`INSERT INTO conversation_artifact_refs
      (id,conversation_id,version_id,environment_id,workspace_id,customer_id,owner_principal_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (conversation_id,version_id) DO UPDATE SET detached_at=NULL`,
    [randomUUID(),conversationId,versionId,getServerConfig().TURAS_ENVIRONMENT_ID,
      actor.workspaceId,binding.customer_id,actor.principalId]);
    return { versionId, displayName: row.filename, state: row.state };
  });
}

export async function detachConversationArtifact(actor: CurrentSession, conversationId: string, versionId: string): Promise<void> {
  await withTransaction(async (client) => {
    await lockOwnedBinding(client, actor, conversationId);
    const row = await client.query<{ id: string }>(`
      SELECT id FROM conversation_artifact_refs WHERE conversation_id=$1 AND version_id=$2
        AND environment_id=$3 AND workspace_id=$4 AND owner_principal_id=$5 FOR UPDATE
    `, [conversationId,versionId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId]);
    if (!row.rows[0]) throw hiddenRecord();
    await client.query("UPDATE conversation_artifact_refs SET detached_at=COALESCE(detached_at,now()) WHERE id=$1",
      [row.rows[0].id]);
  });
}
