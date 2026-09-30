import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { recordPlanMetric } from "./telemetry";

type CleanupJob={id:string;revision_id:string;source_generation:string|null};

/** Persist exact revision cleanup in the same transaction as a source transition. */
export async function enqueuePlanCleanupForSource(client:PoolClient,sourceKind:string,
  sourceRevisionId:string):Promise<number> {
  const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
  const marker=await client.query<{schema_version:number}>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1",
    [environmentId]);
  if ((marker.rows[0]?.schema_version ?? 0)<31) return 0;
  const affected=await client.query<{revision_id:string;source_generation:string}>(`
    SELECT DISTINCT dependency.revision_id,dependency.source_generation
    FROM plan_source_dependencies dependency JOIN plan_revisions revision
      ON revision.id=dependency.revision_id
    WHERE revision.environment_id=$1 AND dependency.source_kind=$2
      AND dependency.source_revision_id=$3
    UNION
    SELECT DISTINCT dependency.revision_id,dependency.source_generation
    FROM plan_private_dependencies dependency JOIN plan_revisions revision
      ON revision.id=dependency.revision_id
    WHERE revision.environment_id=$1 AND dependency.source_kind=$2
      AND dependency.source_revision_id=$3`,
  [environmentId,sourceKind,sourceRevisionId]);
  let enqueued=0;
  for (const row of affected.rows) {
    const inserted=await client.query(`INSERT INTO plan_cleanup_jobs
      (id,environment_id,revision_id,source_generation,reason_code,state)
      VALUES($1,$2,$3,$4,'source_invalidated','queued') ON CONFLICT DO NOTHING`,
    [randomUUID(),environmentId,row.revision_id,row.source_generation]);
    enqueued += inserted.rowCount ?? 0;
  }
  if(enqueued>0)recordPlanMetric("invalidation_count",enqueued);
  return enqueued;
}

/** Schema-028 installations skip this worker until the explicit 006 migration. */
export async function runPlanCleanupTick():Promise<{jobs:number;pruned:number}> {
  const started=Date.now();
  const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
  const result=await withTransaction(async(client)=>{
    const marker=await client.query<{schema_version:number}>(
      "SELECT schema_version FROM turas_environment WHERE environment_id=$1",
      [environmentId]);
    if ((marker.rows[0]?.schema_version ?? 0)<31) return {jobs:0,pruned:0};
    await client.query(`UPDATE plan_drafting_attempts SET
      state=CASE WHEN response_attempt_id IS NULL THEN 'expired' ELSE 'unconfirmed' END,
      safe_error_code='draft_deadline',updated_at=now()
      WHERE environment_id=$1 AND state IN ('prepared','running')
        AND deadline_at<=now()`,[environmentId]);
    const claim=await client.query<CleanupJob>(`SELECT id,revision_id,source_generation
      FROM plan_cleanup_jobs WHERE environment_id=$1 AND attempts<10
        AND (state='queued' OR (state='failed' AND
          updated_at<now()-interval '5 seconds'))
      ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 100`,[environmentId]);
    let completed=0;
    for (const job of claim.rows) {
      await client.query("SAVEPOINT plan_cleanup_item");
      try {
        await client.query(`UPDATE plan_cleanup_jobs SET state='running',
          attempts=attempts+1,updated_at=now() WHERE id=$1`,[job.id]);
        const matches=job.source_generation===null ? true : Boolean((await client.query(
          `SELECT 1 FROM plan_source_dependencies WHERE revision_id=$1
            AND source_generation=$2
           UNION ALL
           SELECT 1 FROM plan_private_dependencies WHERE revision_id=$1
            AND source_generation=$2 LIMIT 1`,
          [job.revision_id,job.source_generation])).rowCount);
        if (matches) {
          const purged=await client.query<{purged:boolean}>(
            "SELECT turas_purge_plan_revision_payload($1) AS purged",[job.id]);
          if (purged.rows[0]?.purged!==true) throw new Error("Cleanup target unavailable");
        } else {
          // Old generation job cannot delete a different revision's new payload.
          await client.query(`UPDATE plan_cleanup_jobs SET state='completed',
            updated_at=now() WHERE id=$1`,[job.id]);
        }
        await client.query("RELEASE SAVEPOINT plan_cleanup_item");
        completed += 1;
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT plan_cleanup_item");
        await client.query("RELEASE SAVEPOINT plan_cleanup_item");
        await client.query(`UPDATE plan_cleanup_jobs SET state='failed',
          attempts=attempts+1,last_error_code='cleanup_retry',updated_at=now()
          WHERE id=$1`,[job.id]);
      }
    }
    const pruned=await client.query<{count:number}>(
      "SELECT turas_prune_plan_ephemera($1,100) AS count",[environmentId]);
    return {jobs:completed,pruned:Number(pruned.rows[0]?.count ?? 0)};
  });
  recordPlanMetric("cleanup_duration_ms",Math.max(0,Date.now()-started));
  if (result.jobs>0 || result.pruned>0) recordPlanMetric("cleanup_count",
    result.jobs+result.pruned);
  return result;
}
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
