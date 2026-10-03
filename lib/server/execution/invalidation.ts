import type { PoolClient } from "pg";
import { getServerConfig } from "../config";
/** Enqueue exact payloads within the source mutation. No execution head locks or
 * content retrieval here; authoritative release fences remain synchronous. */
export async function enqueueExecutionSourceInvalidation(db:PoolClient,sourceKind:string,sourceRevisionId:string):Promise<number>{
  const env=getServerConfig().TURAS_ENVIRONMENT_ID;
  if(Number((await db.query("SELECT schema_version FROM turas_environment WHERE environment_id=$1",[env])).rows[0]?.schema_version??0)<38)return 0;
  const kind=sourceKind==="published_shared"?"shared_knowledge":sourceKind;
  if(!["accepted_profile","approved_excerpt","verified_research","shared_knowledge","execution_record","milestone_baseline","execution_time","advice"].includes(kind))return 0;
  const root=(await db.query(`SELECT generation,digest FROM execution_cleanup_source_identities WHERE kind=$1 AND revision_id=$2 AND environment_id=$3`,[kind,sourceRevisionId,env])).rows[0];
  if(!root)return 0;
  const result=await db.query(`WITH RECURSIVE baselines AS (
    SELECT b.id FROM milestone_baselines b WHERE b.environment_id=$1 AND
      (($2='milestone_baseline' AND b.id=$3) OR EXISTS(SELECT 1 FROM plan_source_dependencies d WHERE d.revision_id=b.revision_id AND d.source_kind=$2 AND d.source_revision_id=$3)
      OR EXISTS(SELECT 1 FROM plan_private_dependencies d WHERE d.revision_id=b.revision_id AND
        CASE WHEN d.source_kind='published_shared' THEN 'shared_knowledge' ELSE d.source_kind END=$2 AND d.source_revision_id=$3))
  ), affected(revision_id) AS (
    SELECT v.id FROM execution_record_revisions v WHERE v.environment_id=$1 AND
      (($2='execution_record' AND v.id=$3) OR v.baseline_id IN(SELECT id FROM baselines) OR
        EXISTS(SELECT 1 FROM execution_record_sources s WHERE s.revision_id=v.id AND s.source_kind=$2 AND s.source_revision_id=$3))
    UNION SELECT s.revision_id FROM execution_record_sources s JOIN affected a ON s.source_revision_id=a.revision_id
      WHERE s.environment_id=$1 AND s.source_kind='execution_record'
  ), times AS (
    SELECT id FROM execution_time_revisions WHERE environment_id=$1 AND
      (activity_revision_id IN(SELECT revision_id FROM affected) OR ($2='execution_time' AND id=$3))
  ), targets(kind,id) AS (
    SELECT 'record',revision_id FROM affected
    UNION SELECT 'review',id FROM execution_review_decisions WHERE revision_id IN(SELECT revision_id FROM affected)
    UNION SELECT 'milestone',id FROM execution_milestone_events WHERE evidence_revision_ids && ARRAY(SELECT revision_id FROM affected)
    UNION SELECT 'time',id FROM times
    UNION SELECT 'time_decision',id FROM execution_time_decisions WHERE revision_id IN(SELECT id FROM times)
    UNION SELECT 'reconciliation',id FROM execution_reconciliations WHERE old_baseline_id IN(SELECT id FROM baselines) OR new_baseline_id IN(SELECT id FROM baselines)
    UNION SELECT 'advice',a.id FROM execution_advice_attempts a WHERE a.environment_id=$1 AND
      (($2='advice' AND a.id=$3) OR EXISTS(SELECT 1 FROM execution_advice_dependencies d WHERE d.attempt_id=a.id AND
        ((d.kind=$2 AND d.revision_id=$3) OR (d.kind='execution_record' AND d.revision_id IN(SELECT revision_id FROM affected)) OR
         (d.kind='baseline' AND d.revision_id IN(SELECT id FROM baselines)))))
  ), invalidated_closeouts AS (
    INSERT INTO execution_closeout_invalidations(revision_id) SELECT DISTINCT s.revision_id FROM execution_closeout_snapshots s
      JOIN execution_record_revisions v ON v.id=s.revision_id AND v.environment_id=$1
      JOIN affected a ON (s.inputs->'records') @> jsonb_build_array(jsonb_build_object('revision_id',a.revision_id)) ON CONFLICT DO NOTHING
  ) INSERT INTO execution_cleanup_jobs(id,environment_id,workspace_id,customer_id,engagement_id,payload_kind,revision_id,payload_digest,
      source_generation,cause_kind,cause_revision_id,cause_digest,ineligible_at,due_at)
    SELECT gen_random_uuid(),p.environment_id,p.workspace_id,p.customer_id,p.engagement_id,p.kind,p.revision_id,p.digest,$4,$2,$3,$5,now(),now()+interval '30 days'
    FROM targets t JOIN execution_cleanup_payload_identities p ON p.kind=t.kind AND p.revision_id=t.id WHERE p.environment_id=$1 ON CONFLICT DO NOTHING`,
    [env,kind,sourceRevisionId,root.generation,root.digest]);
  return result.rowCount??0;
}
