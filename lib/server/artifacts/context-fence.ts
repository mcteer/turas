import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";

export async function artifactContextSchemaReady(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1",
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
  return (result.rows?.[0]?.schema_version ?? 0) >= 18;
}

/** Every consumed source remains a dependency for the whole native session. */
export async function assertArtifactDependenciesCurrent(client: PoolClient,
  conversationId: string): Promise<void> {
  if (!await artifactContextSchemaReady(client)) return;
  const stale = await client.query(`
    SELECT 1 FROM conversation_artifact_dependencies d
    LEFT JOIN artifact_versions v ON v.id=d.version_id
      AND v.environment_id=d.environment_id AND v.workspace_id=d.workspace_id
      AND v.customer_id=d.customer_id AND v.owner_principal_id=d.owner_principal_id
    LEFT JOIN artifact_extraction_runs r ON r.id=d.run_id AND r.version_id=d.version_id
      AND r.environment_id=d.environment_id AND r.workspace_id=d.workspace_id
    WHERE d.conversation_id=$1 AND (
      v.id IS NULL OR v.state NOT IN ('ready','partial') OR
      v.lifecycle_generation<>d.lifecycle_generation OR
      r.id IS NULL OR r.state<>'published') LIMIT 1
  `, [conversationId]);
  if (stale.rowCount) throw new HttpFailure(409, "artifact_context_changed",
    "Start a new conversation and reattach eligible sources");
}
