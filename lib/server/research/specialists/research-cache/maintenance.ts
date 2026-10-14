import type { AppIdentity } from "../identity";
import { withTransaction } from "../../../db/client";
import { lockWorkspaceActor } from "../../../profiles/policy";
import { z } from "zod";
import { evidenceDatabase } from "./database";
import { refreshPublicLearning } from "./public-learning";
import { indexSnapshot } from "./sources";

export async function maintainResearchEvidence(identity: AppIdentity, signal: AbortSignal) {
  await withTransaction(db=>lockWorkspaceActor(db,identity));
  if(identity.kind!=="internal" || identity.role!=="admin") throw new Error("Research maintenance requires an administrator");
  const environmentId=identity.environmentId;
  signal.throwIfAborted();
  const sql = await evidenceDatabase();
  const counts = await sql.transaction([
    sql.query(`DELETE FROM turas_research_requests WHERE (environment_id,workspace_id,owner_user_id,key) IN
      (SELECT environment_id,workspace_id,owner_user_id,key FROM turas_research_requests WHERE environment_id=$1 AND workspace_id=$2
       AND started_at<now()-interval '30 days' ORDER BY started_at LIMIT 1000) RETURNING key`, [environmentId,identity.workspaceId]),
    sql.query(`DELETE FROM turas_evidence_fetches WHERE (environment_id,workspace_id,key) IN
      (SELECT environment_id,workspace_id,key FROM turas_evidence_fetches WHERE environment_id=$1 AND workspace_id=$2
       AND expires_at<now()-interval '30 days' AND (lease_until IS NULL OR lease_until<now()) LIMIT 1000) RETURNING key`, [environmentId,identity.workspaceId]),
    sql.query(`DELETE FROM turas_evidence_snapshots WHERE (environment_id,workspace_id,id) IN
      (SELECT environment_id,workspace_id,id FROM turas_evidence_snapshots WHERE environment_id=$1 AND workspace_id=$2
       AND checked_at<now()-interval '90 days' ORDER BY checked_at LIMIT 1000) RETURNING id`, [environmentId,identity.workspaceId]),
    sql.query(`DELETE FROM turas_vercel_practice_runs WHERE environment_id=$1 AND workspace_id=$2
      AND refresh_after<now()-interval '180 days' RETURNING id`, [environmentId,identity.workspaceId]),
    sql.query(`DELETE FROM turas_vercel_practice_sources WHERE environment_id=$1 AND workspace_id=$2
      AND last_seen<now()-interval '180 days' AND refresh_after<now()-interval '90 days' RETURNING url`, [environmentId,identity.workspaceId]),
  ]);
  const pending = z.array(z.object({ id: z.string(), workspace_id: z.string() })).parse(await sql.query(
    `SELECT id,workspace_id FROM turas_evidence_snapshots WHERE environment_id=$1 AND workspace_id=$2 AND index_state<>'ready'
      AND index_attempts<3 AND index_after<=now() ORDER BY index_after LIMIT 3`, [environmentId,identity.workspaceId]));
  for (const source of pending) {
    signal.throwIfAborted();
    await indexSnapshot({ environmentId, workspaceId: source.workspace_id }, source.id, signal);
  }
  const learning = await refreshPublicLearning(identity, signal);
  const result = { ...learning, briefsDeleted: counts[0].length, fetchesDeleted: counts[1].length, snapshotsDeleted: counts[2].length,
    practiceRunsDeleted: counts[3].length, practiceSourcesDeleted: counts[4].length,
    indexingAttempted: pending.length };
  console.info(JSON.stringify({ event: "research_cache.maintenance", environmentId, ...result }));
  return result;
}
