import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";

/** Service authority only changes lifecycle metadata. It does not retrieve
 * customer content, assume provider completion, or authorize another call.
 * Native terminal events can still settle usage after this deadline fence. */
export async function settleDueExecutionAdvisories(): Promise<number> {
  return withTransaction(async db => {
    const env = getServerConfig().TURAS_ENVIRONMENT_ID;
    const marker = (await db.query("SELECT schema_version FROM turas_environment WHERE environment_id=$1", [env])).rows[0];
    if (!marker || Number(marker.schema_version) < 38) return 0;
    const due = (await db.query(`SELECT id,conversation_id,response_attempt_id FROM execution_advice_attempts
      WHERE environment_id=$1 AND state IN ('prepared','running') AND
        (deadline_at<=clock_timestamp() OR (deadline_at IS NULL AND created_at<=clock_timestamp()-interval '5 minutes'))
      ORDER BY created_at,id LIMIT 100`, [env])).rows;
    let settled = 0;
    for (const candidate of due) {
      // Same mutex order as native release, cancellation and settlement.
      if (!(await db.query("SELECT id FROM conversations WHERE id=$1 AND environment_id=$2 FOR UPDATE SKIP LOCKED", [candidate.conversation_id, env])).rowCount) continue;
      if (candidate.response_attempt_id) await db.query("SELECT id FROM response_attempts WHERE id=$1 FOR UPDATE", [candidate.response_attempt_id]);
      const row = (await db.query(`SELECT state,dispatch_at,deadline_at,created_at,response_attempt_id,clock_timestamp() AS now
        FROM execution_advice_attempts WHERE id=$1 AND environment_id=$2 FOR UPDATE`, [candidate.id, env])).rows[0];
      if (!row || !["prepared", "running"].includes(row.state) ||
        (row.deadline_at ? row.deadline_at.getTime() > row.now.getTime() : row.created_at.getTime() + 300000 > row.now.getTime())) continue;
      const uncertain = row.dispatch_at !== null;
      await db.query(`UPDATE execution_advice_attempts SET state=$2,failure_code=$3,settled_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,
        [candidate.id, uncertain ? "unconfirmed" : "expired", uncertain ? "native_completion_unconfirmed" : "request_expired"]);
      // An undispatched reservation has no provider work to reconcile. A
      // dispatched response keeps its native/watchdog state until actual proof.
      if (!uncertain && row.response_attempt_id) await db.query(`UPDATE response_attempts SET response_state='failed',dispatch_state='rejected',
        last_error_code='request_expired',updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND dispatch_state='prepared'`, [row.response_attempt_id]);
      settled++;
    }
    return settled;
  });
}

import type { PoolClient } from "pg";
import { originalCurrent, confirmedConflictAfter } from "../retrieval/fences";
import { lockOriginalHeader } from "../plans/sources";
import { enqueueExecutionSourceInvalidation } from "./invalidation";
export type ExecutionCleanupJob = {
  id:string; environment_id:string; workspace_id:string; customer_id:string; engagement_id:string;
  payload_kind:string; revision_id:string; payload_digest:string; source_generation:string;
  cause_kind:string; cause_revision_id:string; cause_digest:string; lease_token:string;
};
async function executionMaintenanceReady(db:PoolClient) {
  return Number((await db.query("SELECT schema_version FROM turas_environment WHERE environment_id=$1",[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]?.schema_version??0)>=38;
}
export async function claimExecutionCleanup():Promise<ExecutionCleanupJob[]> {
  return withTransaction(async db=>!await executionMaintenanceReady(db)?[]:
    (await db.query<ExecutionCleanupJob>("SELECT * FROM turas_claim_execution_cleanup($1)",[getServerConfig().TURAS_ENVIRONMENT_ID])).rows);
}
/** Metadata-only service checks use the exact queued source identity. No login
 * impersonation, retrieved prose, or invented reviewer authority is involved. */
async function cleanupCauseCurrent(db:PoolClient,j:ExecutionCleanupJob) {
  const id=j.cause_revision_id;
  if(j.cause_kind==="execution_record")return !!(await db.query(`SELECT 1 FROM execution_records r JOIN execution_record_revisions v ON v.record_id=r.id
    WHERE v.id=$1 AND v.revision_number=$2 AND v.content_digest=$3 AND r.accepted_revision_id=v.id`,[id,j.source_generation,j.cause_digest])).rowCount;
  if(j.cause_kind==="execution_time")return !!(await db.query(`SELECT 1 FROM execution_time_entries e JOIN execution_time_revisions v ON v.entry_id=e.id
    WHERE v.id=$1 AND v.revision_number=$2 AND v.content_digest=$3 AND (e.approved_revision_id=v.id OR e.current_revision_id=v.id AND e.state IN('draft','submitted'))`,[id,j.source_generation,j.cause_digest])).rowCount;
  if(j.cause_kind==="milestone_baseline")return !!(await db.query(`SELECT 1 FROM milestone_baselines b JOIN engagements e ON e.id=b.engagement_id
    WHERE b.id=$1 AND b.baseline_number=$2 AND b.content_digest=$3 AND e.active_baseline_id=b.id`,[id,j.source_generation,j.cause_digest])).rowCount;
  if(j.cause_kind==="advice")return !!(await db.query(`SELECT 1 FROM execution_advice_attempts a JOIN execution_advice_bindings b ON b.id=a.binding_id
    JOIN conversations c ON c.id=a.conversation_id JOIN login_sessions s ON s.id=c.context_login_session_id
    JOIN execution_workspaces w ON w.engagement_id=b.engagement_id JOIN engagements e ON e.id=b.engagement_id
    WHERE a.id=$1 AND b.generation=$2 AND a.request_digest=$3 AND a.state IN('prepared','running','completed') AND s.revoked_at IS NULL
      AND s.expires_at>clock_timestamp() AND c.context_valid_until>clock_timestamp() AND w.generation=b.generation AND e.active_baseline_id=b.baseline_id`,[id,j.source_generation,j.cause_digest])).rowCount;
  const kind=j.cause_kind==="shared_knowledge"?"published_shared":j.cause_kind;
  return await originalCurrent(db,{source_kind:kind,source_revision_id:id,source_generation:j.source_generation,source_digest:j.cause_digest}) &&
    !await confirmedConflictAfter(db,kind,id,new Date(0));
}
export async function finishExecutionCleanup(job:ExecutionCleanupJob):Promise<boolean> {
  return withTransaction(async db=>{
    const env=getServerConfig().TURAS_ENVIRONMENT_ID;
    const j=(await db.query<ExecutionCleanupJob>(`SELECT * FROM execution_cleanup_jobs WHERE id=$1 AND environment_id=$2 AND state='leased'
      AND lease_token=$3 AND lease_until>clock_timestamp() AND revision_id=$4 AND payload_digest=$5 AND source_generation=$6`,
      [job.id,env,job.lease_token,job.revision_id,job.payload_digest,job.source_generation])).rows[0];
    if(!j)return false;
    if(["accepted_profile","approved_excerpt","verified_research","shared_knowledge"].includes(j.cause_kind))
      await lockOriginalHeader(db,j.cause_kind as "accepted_profile"|"approved_excerpt"|"verified_research"|"shared_knowledge",j.cause_revision_id);
    if(j.cause_kind==="milestone_baseline")await db.query("SELECT p.id FROM delivery_plans p JOIN milestone_baselines b ON b.plan_id=p.id WHERE b.id=$1 FOR SHARE OF p",[j.cause_revision_id]);
    await db.query("SELECT id FROM engagements WHERE id=$1 AND environment_id=$2 FOR SHARE",[j.engagement_id,env]);
    if(j.cause_kind==="execution_record")await db.query("SELECT r.id FROM execution_records r JOIN execution_record_revisions v ON v.record_id=r.id WHERE v.id=$1 FOR SHARE OF r",[j.cause_revision_id]);
    if(j.cause_kind==="execution_time")await db.query("SELECT e.id FROM execution_time_entries e JOIN execution_time_revisions v ON v.entry_id=e.id WHERE v.id=$1 FOR SHARE OF e",[j.cause_revision_id]);
    // Native lifecycle mutex precedes the cleanup lease, matching release and
    // settlement. A delayed terminal receipt cannot reinsert customer content.
    if(j.payload_kind==="advice"){
      const a=(await db.query("SELECT conversation_id,response_attempt_id FROM execution_advice_attempts WHERE id=$1",[j.revision_id])).rows[0];
      if(a){await db.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE",[a.conversation_id]);
        if(a.response_attempt_id)await db.query("SELECT id FROM response_attempts WHERE id=$1 FOR UPDATE",[a.response_attempt_id]);
        await db.query("SELECT id FROM execution_advice_attempts WHERE id=$1 FOR UPDATE",[j.revision_id]);}
    }
    const eligible=await cleanupCauseCurrent(db,j);
    return (await db.query("SELECT turas_finish_execution_cleanup($1,$2,$3,$4,$5,$6,$7) AS purged",
      [env,j.id,j.lease_token,j.revision_id,j.payload_digest,j.source_generation,!eligible])).rows[0].purged===true;
  });
}
/** Expired context has a finite retention clock even without a later source
 * mutation. Queue at most 100 exact attempts and never advance the original due. */
export async function queueExpiredExecutionAdvice():Promise<number> {
  return withTransaction(async db=>{
    if(!await executionMaintenanceReady(db))return 0;
    const rows=(await db.query(`SELECT a.id FROM execution_advice_attempts a JOIN execution_advice_bindings b ON b.id=a.binding_id
      JOIN conversations c ON c.id=a.conversation_id JOIN execution_workspaces w ON w.engagement_id=b.engagement_id
      LEFT JOIN login_sessions s ON s.id=c.context_login_session_id
      WHERE a.environment_id=$1 AND (a.state IN('failed','cancelled','expired') OR c.context_valid_until<=clock_timestamp()
        OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR w.generation<>b.generation)
        AND NOT EXISTS(SELECT 1 FROM execution_advice_retirements r WHERE r.attempt_id=a.id)
        AND NOT EXISTS(SELECT 1 FROM execution_cleanup_jobs j WHERE j.payload_kind='advice' AND j.revision_id=a.id AND j.state<>'stale')
      ORDER BY a.created_at,a.id LIMIT 100`,[getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
    let queued=0;for(const row of rows)queued+=await enqueueExecutionSourceInvalidation(db,"advice",row.id);return queued;
  });
}
export async function runExecutionCleanupTick() {
  await queueExpiredExecutionAdvice();
  const jobs=await claimExecutionCleanup();let purged=0;
  for(const job of jobs)try{if(await finishExecutionCleanup(job))purged++;}catch{/* bounded lease expiry permits retry, no prose in worker logs */}
  return {claimed:jobs.length,purged};
}
