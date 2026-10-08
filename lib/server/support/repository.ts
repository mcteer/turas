import type { PoolClient } from "pg";
import { getServerConfig } from "../config";
import { HttpFailure } from "../../contracts/http";
import { hiddenRecord } from "../../contracts/http";
import { randomUUID } from "node:crypto";
import type { SupportActor } from "./policy";
import { supportSourcesSchema, type SupportSource } from "./schema";

export type SupportScope = { id: string; generation: number; workloadId: string | null };

export async function supportScope(db: PoolClient, actor: SupportActor, customerId: string,
  workloadId: string | null, options: { create?: boolean; lock?: boolean } = {}): Promise<SupportScope | null> {
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  if (!options.create && !options.lock) {
    // Validate the optional workload even when no support scope exists. A lateral
    // lookup keeps those two read-only operations in one database round trip.
    const row = (await db.query(`SELECT s.id,s.generation,s.workload_id
      FROM (SELECT 1 WHERE $4::uuid IS NULL OR EXISTS(SELECT 1 FROM customer_workloads
        WHERE id=$4 AND workspace_id=$2 AND customer_id=$3 AND lifecycle='active')) permitted
      LEFT JOIN LATERAL (SELECT id,generation,workload_id FROM support_scopes
        WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3
          AND workload_id IS NOT DISTINCT FROM $4::uuid) s ON true`,
    [environmentId, actor.workspaceId, customerId, workloadId])).rows[0];
    if (!row) throw hiddenRecord();
    return row.id ? { id: row.id, generation: Number(row.generation), workloadId: row.workload_id } : null;
  }
  if (workloadId && !(await db.query(`SELECT 1 FROM customer_workloads
    WHERE id=$1 AND workspace_id=$2 AND customer_id=$3 AND lifecycle='active'`,
  [workloadId, actor.workspaceId, customerId])).rowCount) throw hiddenRecord();
  if (options.create) await db.query(`INSERT INTO support_scopes(id,environment_id,workspace_id,customer_id,workload_id)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(environment_id,workspace_id,customer_id,workload_id) DO NOTHING`,
  [randomUUID(), environmentId, actor.workspaceId, customerId, workloadId]);
  const row = (await db.query(`SELECT id,generation,workload_id FROM support_scopes
    WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND workload_id IS NOT DISTINCT FROM $4::uuid
    ${options.lock ? "FOR UPDATE" : ""}`, [environmentId, actor.workspaceId, customerId, workloadId])).rows[0];
  return row ? { id: row.id, generation: Number(row.generation), workloadId: row.workload_id } : null;
}

export async function incrementSupportScope(db: PoolClient, scopeId: string): Promise<number> {
  const row = (await db.query("UPDATE support_scopes SET generation=generation+1,updated_at=now() WHERE id=$1 RETURNING generation", [scopeId])).rows[0];
  if (!row) throw hiddenRecord();
  return Number(row.generation);
}

export async function supportRevisionSources(db: PoolClient, revisionId: string): Promise<SupportSource[]> {
  const rows = (await db.query(`SELECT source_key,source_kind,source_revision_id,generation,content_digest,locator,engagement_id
    FROM support_source_dependencies WHERE revision_id=$1 ORDER BY source_kind,source_revision_id`, [revisionId])).rows;
  return supportSourcesSchema.parse(rows.map(row => ({ id: row.source_key, kind: row.source_kind,
    sourceRevisionId: row.source_revision_id, generation: Number(row.generation), contentDigest: row.content_digest,
    ...(row.locator ? { locator: row.locator } : { engagementId: row.engagement_id }),
  })));
}

export async function requireSupportEnvironment(db: PoolClient, write = false, advice = false): Promise<void> {
  const marker = (await db.query<{ environment_id: string; schema_version: number }>(
    "SELECT environment_id,schema_version FROM turas_environment LIMIT 1")).rows[0];
  if (!marker || marker.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID || marker.schema_version < (advice ? 43 : 42))
    throw new HttpFailure(503, "schema_unavailable", "Support guidance unavailable");
  if (write && process.env.TURAS_010_DISABLED === "1")
    throw new HttpFailure(503, "feature_disabled", "New support work is temporarily unavailable");
}
