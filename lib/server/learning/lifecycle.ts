import {learningSourceLossAt} from './source-retention';
import {learningId} from '../../contracts/learning';
import {getServerConfig} from '../config';
import {learningTransaction} from './repository';
import {originalCurrent,confirmedConflictAfterAny} from '../retrieval/fences';
import {invalidateLearningAttempt} from './invalidation';
import {scheduleLearningPayloadPurge} from './retention';
import {withholdLearningMeasurementFamilies} from './cohort-eligibility';
import {learningIndependentClosureCurrent} from './sources';
/** Fair, bounded metadata scan. Individual membership loss never revokes reuse. */
export async function reconcileLearningLifecycle(at:Date,ownerId?:string):Promise<number>{
 if(ownerId)learningId.parse(ownerId);
 return learningTransaction(async db=>{
  await db.query("SET LOCAL transaction_timeout='4s'");
  const env=getServerConfig().TURAS_ENVIRONMENT_ID;
  const scope=(await db.query(`SELECT d.workspace_id,d.owner_kind,d.owner_id FROM learning_dependencies d LEFT JOIN learning_lifecycle_scans scan ON scan.environment_id=d.environment_id AND scan.workspace_id=d.workspace_id AND scan.owner_kind=d.owner_kind AND scan.owner_id=d.owner_id
   WHERE d.environment_id=$1 AND ($3::uuid IS NULL OR d.owner_id=$3) AND ($3::uuid IS NOT NULL OR scan.next_check_at IS NULL OR scan.next_check_at<=$2) GROUP BY d.workspace_id,d.owner_kind,d.owner_id,scan.next_check_at ORDER BY scan.next_check_at NULLS FIRST,d.owner_kind,d.owner_id LIMIT 1`,[env,at,ownerId??null])).rows[0];if(!scope)return 0;let records=1;
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`learning-lifecycle:${env}:${scope.workspace_id}:${scope.owner_kind}:${scope.owner_id}`]);
  const deps=(await db.query('SELECT * FROM learning_dependencies WHERE environment_id=$1 AND workspace_id=$2 AND owner_kind=$3 AND owner_id=$4 ORDER BY source_kind,source_revision_id LIMIT 201',[env,scope.workspace_id,scope.owner_kind,scope.owner_id])).rows;
  let sourceDeadline=deps.reduce<Date|null>((earliest,dependency)=>dependency.purge_at&&(!earliest||dependency.purge_at<earliest)?dependency.purge_at:earliest,null);
  let current=deps.length>0&&deps.length<=200;
  for(const dependency of deps){
   if(!current)break;
   if(dependency.source_kind==='accepted_execution')current=!!(await db.query(`SELECT 1 FROM execution_record_revisions r JOIN execution_records record ON record.id=r.record_id AND record.accepted_revision_id=r.id WHERE r.id=$1 AND r.revision_number=$2 AND r.content_digest=$3 AND r.environment_id=$4 AND r.workspace_id=$5 AND r.customer_id=$6`,[dependency.source_revision_id,dependency.source_generation,dependency.source_digest,env,scope.workspace_id,dependency.customer_id])).rowCount;
   else current=await originalCurrent(db,dependency);
  }
  if(current)current=!await confirmedConflictAfterAny(db,deps.filter(d=>d.source_kind!=='accepted_execution').map(d=>({kind:d.source_kind,revisionId:d.source_revision_id})),new Date(0));
  const lossAt=!current?await learningSourceLossAt(db,env,scope.workspace_id,scope.owner_kind,scope.owner_id):null;
  if(lossAt){const deadline=new Date(lossAt.getTime()+24*3600000);if(!sourceDeadline||deadline<sourceDeadline)sourceDeadline=deadline;}
  if(scope.owner_kind==='review'){
   const review=(await db.query('SELECT r.*,s.revoked_at FROM learning_candidate_reviews r JOIN learning_review_states s ON s.review_id=r.id WHERE r.id=$1 AND r.environment_id=$2 AND r.workspace_id=$3',[scope.owner_id,env,scope.workspace_id])).rows[0];
   if(review&&!review.revoked_at&&current){const refs=(await db.query('SELECT source_kind,source_revision_id,source_generation,source_digest,rights_basis FROM knowledge_lineage WHERE revision_id=$1 ORDER BY ordinal',[review.revision_id])).rows.map(r=>({sourceKind:r.source_kind,sourceRevisionId:r.source_revision_id,sourceGeneration:Number(r.source_generation),sourceDigest:r.source_digest,rightsBasis:r.rights_basis}));current=await learningIndependentClosureCurrent(db,scope.workspace_id,review.customer_id,refs,review.closure_digest,review.rights_digest);}
   if(review&&(review.revoked_at||!current)){await db.query('UPDATE learning_review_states SET revoked_at=$2,version=version+1 WHERE review_id=$1 AND revoked_at IS NULL',[review.id,at]);await scheduleLearningPayloadPurge(db,review.id,'review','global_invalidated',at,sourceDeadline);}
  }else if(scope.owner_kind==='draft'){
   const attempt=(await db.query('SELECT state FROM learning_attempts WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[scope.owner_id,env,scope.workspace_id])).rows[0];if(attempt&&!current)await invalidateLearningAttempt(db,scope.workspace_id,scope.owner_id,at,sourceDeadline);
  }else if(scope.owner_kind==='evaluation'){
   const row=(await db.query('SELECT e.id,e.review_id,s.revoked_at FROM learning_evaluations e JOIN learning_review_states s ON s.review_id=e.review_id WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3',[scope.owner_id,env,scope.workspace_id])).rows[0];
   const reviewDeadline=row?(await db.query("SELECT purge_at FROM learning_payload_states WHERE kind='review' AND owner_id=$1",[row.review_id])).rows[0]?.purge_at:null;
   const evaluationDeadline=reviewDeadline&&(!sourceDeadline||reviewDeadline<sourceDeadline)?reviewDeadline:sourceDeadline;
   if(row&&(!current||row.revoked_at)){await db.query("UPDATE learning_evaluations SET state='ineligible',invalidated_at=least(invalidated_at,$2),version=version+1 WHERE id=$1 AND state<>'ineligible'",[row.id,at]);await scheduleLearningPayloadPurge(db,row.id,'evaluation','global_invalidated',at,evaluationDeadline);
    // No global source loss may retain private case rationales or arm context.
    const assessments=(await db.query('SELECT id FROM learning_case_reviews WHERE evaluation_id=$1 ORDER BY id LIMIT 8',[row.id])).rows;
    records+=assessments.length;for(const assessment of assessments)await scheduleLearningPayloadPurge(db,assessment.id,'case_review','global_invalidated',at,evaluationDeadline);
    const arms=(await db.query('SELECT a.id FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id WHERE b.evaluation_id=$1 ORDER BY a.id LIMIT 16',[row.id])).rows;
    records+=arms.length;for(const arm of arms)await invalidateLearningAttempt(db,scope.workspace_id,arm.id,at,evaluationDeadline);
   }
  }else if(scope.owner_kind==='measurement'&&!current){
   await withholdLearningMeasurementFamilies(db,scope.owner_id);await scheduleLearningPayloadPurge(db,scope.owner_id,'measurement','global_invalidated',at,sourceDeadline);
   const approvals=(await db.query('SELECT id FROM learning_measurement_approvals WHERE revision_id=$1',[scope.owner_id])).rows;records+=approvals.length;for(const approval of approvals)await scheduleLearningPayloadPurge(db,approval.id,'measurement_review','global_invalidated',at,sourceDeadline);
  }
  await db.query(`INSERT INTO learning_lifecycle_scans(environment_id,workspace_id,owner_kind,owner_id,checked_at,next_check_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(environment_id,workspace_id,owner_kind,owner_id) DO UPDATE SET checked_at=EXCLUDED.checked_at,next_check_at=EXCLUDED.next_check_at`,[env,scope.workspace_id,scope.owner_kind,scope.owner_id,at,new Date(at.getTime()+60000)]);
  return records;
 });
}
