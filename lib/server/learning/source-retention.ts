import type {PoolClient} from 'pg';
/** Original lifecycle timestamps determine retention even after a worker outage.
 * This reads metadata only, for the bounded dependency union captured at intake. */
export async function learningSourceLossAt(db:PoolClient,environmentId:string,workspaceId:string,kind:string,ownerId:string):Promise<Date|null>{
 const row=(await db.query(`WITH owner AS (
  SELECT created_at FROM learning_candidate_reviews WHERE $3='review' AND id=$4
  UNION ALL SELECT created_at FROM learning_attempts WHERE $3='draft' AND id=$4
  UNION ALL SELECT created_at FROM learning_evaluations WHERE $3='evaluation' AND id=$4
  UNION ALL SELECT created_at FROM learning_measurement_revisions WHERE $3='measurement' AND id=$4
 ), deps AS (SELECT source_kind,source_revision_id FROM learning_dependencies WHERE environment_id=$1 AND workspace_id=$2 AND owner_kind=$3 AND owner_id=$4), events AS (
  SELECT e.created_at FROM deps d JOIN profile_lifecycle_events e ON d.source_kind='accepted_profile' AND (e.previous_head_id=d.source_revision_id OR e.revision_id=d.source_revision_id)
  UNION ALL SELECT e.created_at FROM deps d JOIN evidence_source_events e ON d.source_kind='verified_research' AND e.source_revision_id=d.source_revision_id
  UNION ALL SELECT e.created_at FROM deps d JOIN artifact_evidence_selections s ON d.source_kind='approved_excerpt' AND s.id=d.source_revision_id JOIN artifact_lifecycle_events e ON e.version_id=s.version_id AND e.event_type IN ('replace','withdraw','delete','deleted')
  UNION ALL SELECT e.decided_at FROM deps d JOIN knowledge_decisions e ON d.source_kind='published_shared' AND e.revision_id=d.source_revision_id AND e.action='withdraw'
  UNION ALL SELECT e.created_at FROM deps d JOIN execution_record_revisions r ON d.source_kind='accepted_execution' AND r.id=d.source_revision_id JOIN execution_review_decisions e ON e.record_id=r.record_id AND (e.action='retract' OR (e.action='accept' AND e.revision_id<>r.id))
  UNION ALL SELECT t.updated_at FROM deps d JOIN evidence_conflict_targets t ON t.environment_id=$1 AND t.state='confirmed' AND ((t.first_kind=d.source_kind AND t.first_revision_id=d.source_revision_id) OR (t.second_kind=d.source_kind AND t.second_revision_id=d.source_revision_id))
  UNION ALL SELECT e.created_at FROM deps d JOIN evidence_conflicts c ON d.source_kind='accepted_profile' AND c.state='confirmed' AND (c.first_revision_id=d.source_revision_id OR c.second_revision_id=d.source_revision_id) JOIN evidence_conflict_events e ON e.conflict_id=c.id AND e.event_type='confirm'
 ) SELECT min(events.created_at) AS lost_at FROM events,owner WHERE events.created_at>=owner.created_at`,[environmentId,workspaceId,kind,ownerId])).rows[0];
 return row?.lost_at??null;
}
