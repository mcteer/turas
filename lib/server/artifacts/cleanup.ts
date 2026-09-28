import { randomUUID } from "node:crypto";
import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { getServerConfig, parseArtifactStoreConfig } from "../config";
import { withTransaction } from "../db/client";
import { LocalArtifactStore } from "./local-store";
import { releaseArtifactIntentReservation } from "./intake";
import { recordArtifactMetric } from "./telemetry";

type CleanupJob = { id: string; version_id: string; environment_id: string; workspace_id: string;
  lifecycle_generation: string; target_kind: string; opaque_target_id: string;
  lease_token: string; attempt_count: number; created_at: Date };

/** Claim one durable cleanup item without blocking document processing. */
export async function claimArtifactCleanup(): Promise<CleanupJob | null> {
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  return withTransaction(async (client) => {
    const result = await client.query<CleanupJob>(`
      SELECT * FROM artifact_cleanup_jobs WHERE environment_id=$1
        AND ((state IN ('queued','retry') AND next_attempt_at<=now())
          OR (state='leased' AND lease_expires_at<now()))
      ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
    `, [environmentId]);
    const row = result.rows[0];
    if (!row) return null;
    const token = randomUUID();
    await client.query(`UPDATE artifact_cleanup_jobs SET state='leased',lease_token=$2,
      lease_expires_at=now()+interval '30 seconds',attempt_count=attempt_count+1,updated_at=now()
      WHERE id=$1`, [row.id,token]);
    return { ...row, lease_token: token, attempt_count: row.attempt_count + 1 };
  });
}

async function purgeDatabase(job: CleanupJob): Promise<void> {
  await withTransaction(async (client) => {
    const current = await client.query<{ state: string; lifecycle_generation: string }>(`
      SELECT state,lifecycle_generation FROM artifact_versions
      WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR UPDATE
    `, [job.version_id,job.environment_id,job.workspace_id]);
    if (!current.rows[0] || !["deleting","deleted","cancelled"].includes(current.rows[0].state) ||
        Number(current.rows[0].lifecycle_generation) < Number(job.lifecycle_generation)) {
      throw new Error("Cleanup tombstone unavailable");
    }
    if (job.target_kind === "extraction") {
      await client.query(`UPDATE artifact_extraction_units SET text=NULL,formula=NULL,cached_value=NULL,
        purged_at=now() WHERE version_id=$1 AND text IS NOT NULL`, [job.version_id]);
    } else if (job.target_kind === "selection") {
      await client.query(`DELETE FROM artifact_evidence_payloads WHERE selection_id IN
        (SELECT id FROM artifact_evidence_selections WHERE version_id=$1)`, [job.version_id]);
    } else if (job.target_kind === "draft") {
      await client.query(`DELETE FROM artifact_context_payloads WHERE receipt_id IN
        (SELECT r.id FROM artifact_context_receipts r
          WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(r.selection_refs) s
            WHERE s->>'versionId'=$1))`, [job.version_id]);
    } else if (job.target_kind === "generated_history") {
      await client.query(`DELETE FROM event_projections WHERE event_type<>'message.received'
        AND conversation_id IN (SELECT conversation_id FROM conversation_artifact_dependencies
          WHERE version_id=$1)`, [job.version_id]);
      await client.query(`UPDATE conversations SET title='Previous conversation',updated_at=now()
        WHERE id IN (SELECT conversation_id FROM conversation_artifact_dependencies
          WHERE version_id=$1)`, [job.version_id]);
    }
  });
}

export async function runArtifactCleanup(job: CleanupJob): Promise<void> {
  try {
    if (job.target_kind === "original" || job.target_kind === "staged") {
      const store = new LocalArtifactStore(parseArtifactStoreConfig(process.env));
      if (job.target_kind === "original") await store.delete(job.opaque_target_id);
      else await store.deleteStaged(job.opaque_target_id);
    } else {
      await purgeDatabase(job);
    }
    await withTransaction(async (client) => {
      const done = await client.query(`UPDATE artifact_cleanup_jobs SET state='done',lease_token=NULL,
        lease_expires_at=NULL,completed_at=now(),updated_at=now(),safe_error_code=NULL
        WHERE id=$1 AND state='leased' AND lease_token=$2`, [job.id,job.lease_token]);
      if (done.rowCount !== 1) return;
      const remaining = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM artifact_cleanup_jobs
        WHERE version_id=$1 AND lifecycle_generation=$2 AND state<>'done'
      `, [job.version_id,job.lifecycle_generation]);
      if (remaining.rows[0]?.count === "0") {
        await client.query(`UPDATE artifact_versions SET state='deleted',updated_at=now()
          WHERE id=$1 AND state='deleting' AND lifecycle_generation=$2`,
        [job.version_id,job.lifecycle_generation]);
      }
    });
    recordArtifactMetric("cleanup_lag_ms",Math.max(0,Date.now()-job.created_at.getTime()));
  } catch {
    await withTransaction(async (client) => {
      await client.query(`UPDATE artifact_cleanup_jobs SET state='retry',lease_token=NULL,
        lease_expires_at=NULL,next_attempt_at=now()+
          (least(300,power(2,least(attempt_count,8))::integer) * interval '1 second'),
        safe_error_code='cleanup_retry',updated_at=now()
        WHERE id=$1 AND state='leased' AND lease_token=$2`, [job.id,job.lease_token]);
    });
  }
}

/** Expire reservations and remove staged bytes after the database transition commits. */
export async function reconcileExpiredArtifactIntents(): Promise<number> {
  const environmentId = getServerConfig().TURAS_ENVIRONMENT_ID;
  const expired = await withTransaction(async (client) => {
    const rows = await client.query<{ id: string; workspace_id: string; staged_key: string | null }>(`
      SELECT id,workspace_id,staged_key FROM artifact_upload_intents
      WHERE environment_id=$1 AND state IN ('uploading','staged') AND expires_at<=now()
      ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT 20
    `, [environmentId]);
    for (const row of rows.rows) await releaseArtifactIntentReservation(client, {
      intentId: row.id,environmentId,workspaceId: row.workspace_id,terminalState: "expired" });
    return rows.rows;
  });
  if (expired.length) {
    const store = new LocalArtifactStore(parseArtifactStoreConfig(process.env));
    for (const row of expired) {
      if (row.staged_key) await store.deleteStaged(row.staged_key).catch(() => undefined);
    }
  }
  return expired.length;
}

/** Reap only unreferenced opaque files older than one hour. */
export async function reconcileArtifactOrphans(): Promise<number> {
  const config = parseArtifactStoreConfig(process.env);
  const store = new LocalArtifactStore(config);
  let removed = 0;
  for (const kind of ["staged", "objects"] as const) {
    const directory = join(config.root,kind);
    const names = await readdir(directory).catch(() => [] as string[]);
    for (const name of names.slice(0,100)) {
      if (!/^[0-9a-f]{64}$/.test(name)) continue;
      const stat = await lstat(join(directory,name)).catch(() => null);
      if (!stat?.isFile() || stat.isSymbolicLink() ||
          Date.now() - stat.mtimeMs < 60 * 60 * 1_000) continue;
      const referenced = await withTransaction(async (client) => {
        if (kind === "staged") return client.query(`SELECT 1 FROM artifact_upload_intents
          WHERE environment_id=$1 AND staged_key=$2 AND state IN ('uploading','staged') LIMIT 1`,
        [config.environmentId,name]);
        return client.query(`SELECT 1 FROM artifact_versions WHERE environment_id=$1
          AND object_key=$2 LIMIT 1`, [config.environmentId,name]);
      });
      if (referenced.rowCount) continue;
      if (kind === "staged") await store.deleteStaged(name);
      else await store.delete(name);
      removed += 1;
    }
  }
  return removed;
}
