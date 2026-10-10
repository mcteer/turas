import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {getServerConfig} from '../config';
/** A due marker is review work, never external admission, fact acceptance or a draft. */
export async function markDueLearningReviews(db:PoolClient,at=new Date(),limit=100):Promise<number>{
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Bounded learning review batch required');
 const rows=(await db.query(`SELECT * FROM (
  SELECT d.environment_id,d.workspace_id,'publication' AS owner_kind,p.id AS owner_id,min(d.valid_until) AS deadline_at FROM learning_dependencies d
   JOIN learning_candidate_reviews r ON d.owner_kind='review' AND r.id=d.owner_id JOIN learning_release_decisions release ON release.review_id=r.id
   JOIN knowledge_publications p ON p.id=release.publication_id AND p.head_generation=release.publication_generation AND p.state='published'
   GROUP BY d.environment_id,d.workspace_id,p.id
  UNION ALL SELECT d.environment_id,d.workspace_id,'evaluation',e.id,min(d.valid_until) FROM learning_dependencies d JOIN learning_evaluations e ON d.owner_kind='evaluation' AND e.id=d.owner_id AND e.state IN('prepared','running','awaiting_review','passed') GROUP BY d.environment_id,d.workspace_id,e.id
  UNION ALL SELECT d.environment_id,d.workspace_id,'measurement',r.id,min(d.valid_until) FROM learning_dependencies d JOIN learning_measurement_revisions r ON d.owner_kind='measurement' AND r.id=d.owner_id JOIN learning_measurement_contributions c ON c.head_revision_id=r.id AND c.state IN('proposed','approved') GROUP BY d.environment_id,d.workspace_id,r.id
 ) work WHERE environment_id=$1 AND deadline_at<=$2 AND NOT EXISTS(SELECT 1 FROM learning_refresh_jobs j WHERE j.environment_id=work.environment_id AND j.workspace_id=work.workspace_id AND j.owner_kind=work.owner_kind AND j.owner_id=work.owner_id AND j.deadline_at=work.deadline_at)
 ORDER BY deadline_at,owner_id LIMIT $3`,[getServerConfig().TURAS_ENVIRONMENT_ID,at,limit])).rows;
 for(const row of rows)await db.query(`INSERT INTO learning_refresh_jobs(id,environment_id,workspace_id,owner_kind,owner_id,deadline_at,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(environment_id,workspace_id,owner_kind,owner_id,deadline_at) DO NOTHING`,[randomUUID(),row.environment_id,row.workspace_id,row.owner_kind,row.owner_id,row.deadline_at,at]);
 return rows.length;
}
