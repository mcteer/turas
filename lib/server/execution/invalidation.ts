import type { PoolClient } from 'pg';
import { getServerConfig } from '../config';
/** Source mutators enqueue metadata in their existing transaction. They never
 * acquire execution heads after source locks. Current read/review fences remain
 * authoritative while asynchronous retention work is paused. */
export async function enqueueExecutionSourceInvalidation(db:PoolClient,sourceKind:string,sourceRevisionId:string):Promise<number>{
  const environment=getServerConfig().TURAS_ENVIRONMENT_ID;
  const marker=(await db.query<{schema_version:number}>('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[environment])).rows[0];
  if(!marker||marker.schema_version<38)return 0;
  const kind=sourceKind==='published_shared'?'shared_knowledge':sourceKind;
  if(!['accepted_profile','approved_excerpt','verified_research','shared_knowledge','execution_record','milestone_baseline'].includes(kind))return 0;
  const result=await db.query(`WITH RECURSIVE affected(revision_id,source_generation) AS (
    SELECT s.revision_id,s.source_generation FROM execution_record_sources s WHERE s.environment_id=$1 AND s.source_kind=$2 AND s.source_revision_id=$3
    UNION
    SELECT s.revision_id,s.source_generation FROM execution_record_sources s JOIN affected a ON s.source_revision_id=a.revision_id
      WHERE s.environment_id=$1 AND s.source_kind='execution_record'
  ), targets AS (
    SELECT DISTINCT 'record' AS kind,v.id AS revision_id,v.environment_id,v.workspace_id,v.customer_id,v.engagement_id,v.content_digest AS payload_digest,a.source_generation
      FROM affected a JOIN execution_record_revisions v ON v.id=a.revision_id
    UNION ALL
    SELECT DISTINCT 'review',d.id,d.environment_id,d.workspace_id,d.customer_id,d.engagement_id,
      encode(sha256(convert_to(p.rationale,'UTF8')),'hex'),a.source_generation
      FROM affected a JOIN execution_review_decisions d ON d.revision_id=a.revision_id JOIN execution_review_payloads p ON p.decision_id=d.id
    UNION ALL
    SELECT DISTINCT 'milestone',e.id,e.environment_id,e.workspace_id,e.customer_id,e.engagement_id,
      encode(sha256(convert_to(p.rationale,'UTF8')),'hex'),a.source_generation
      FROM affected a JOIN execution_milestone_events e ON a.revision_id=ANY(e.evidence_revision_ids) JOIN execution_milestone_payloads p ON p.event_id=e.id
    UNION ALL
    SELECT DISTINCT 'time',v.id,v.environment_id,v.workspace_id,v.customer_id,v.engagement_id,v.content_digest,a.source_generation
      FROM affected a JOIN execution_time_revisions v ON v.activity_revision_id=a.revision_id
    UNION ALL
    SELECT DISTINCT 'time_decision',d.id,d.environment_id,d.workspace_id,d.customer_id,d.engagement_id,
      encode(sha256(convert_to(p.rationale,'UTF8')),'hex'),a.source_generation
      FROM affected a JOIN execution_time_revisions v ON v.activity_revision_id=a.revision_id JOIN execution_time_decisions d ON d.revision_id=v.id
      JOIN execution_time_decision_payloads p ON p.decision_id=d.id
  ), invalidated_closeouts AS (
    INSERT INTO execution_closeout_invalidations(revision_id)
      SELECT DISTINCT s.revision_id FROM execution_closeout_snapshots s
      JOIN execution_record_revisions v ON v.id=s.revision_id AND v.environment_id=$1
      JOIN affected a ON (s.inputs->'records') @> jsonb_build_array(jsonb_build_object('revision_id',a.revision_id))
      ON CONFLICT DO NOTHING
  ) INSERT INTO execution_cleanup_jobs(id,environment_id,workspace_id,customer_id,engagement_id,payload_kind,revision_id,payload_digest,source_generation,ineligible_at,due_at)
    SELECT gen_random_uuid(),environment_id,workspace_id,customer_id,engagement_id,kind,revision_id,payload_digest,source_generation,now(),now()+interval '30 days'
    FROM targets ON CONFLICT DO NOTHING`,[environment,kind,sourceRevisionId]);
  return result.rowCount??0;
}
