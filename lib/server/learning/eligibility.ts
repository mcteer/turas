import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { getServerConfig } from '../config';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { learningSourceClosure } from './sources';
import { lockLearningActor } from './policy';
/** Re-resolve rights and all originals on every read/replay; a stored review is not authority. */
export async function currentLearningReview(db:PoolClient,actor:CurrentSession,reviewId:string){
 const review=(await db.query(`SELECT r.*,s.revoked_at FROM learning_candidate_reviews r JOIN learning_review_states s ON s.review_id=r.id
  WHERE r.id=$1 AND r.environment_id=$2 AND r.workspace_id=$3`,[reviewId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
 if(!review)throw hiddenRecord();
 await lockLearningActor(db,actor,review.customer_id);
 const latest=(await db.query('SELECT id FROM learning_candidate_reviews WHERE revision_id=$1 AND environment_id=$2 AND workspace_id=$3 AND NOT minimized ORDER BY created_at DESC,id DESC LIMIT 1',[review.revision_id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
 if(review.decision!=='accept'||review.revoked_at||latest?.id!==review.id)throw new HttpFailure(409,'review_unavailable','Current reuse review required');
 const reviewer=(await db.query(`SELECT m.revision,m.kind,m.role,m.active,p.active AS principal_active,w.active AS workspace_active
   FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=$1 AND m.workspace_id=$2 FOR SHARE OF m,p,w`,[review.reviewer_membership_id,actor.workspaceId])).rows[0];
 if(!reviewer?.active||!reviewer.principal_active||!reviewer.workspace_active||reviewer.kind!=='internal'||reviewer.role!=='admin'||Number(reviewer.revision)+1!==Number(review.reviewer_generation))throw new HttpFailure(409,'review_unavailable','Reuse reviewer authority changed');
 const lineage=(await db.query(`SELECT source_kind,source_revision_id,source_generation,source_digest,rights_basis FROM knowledge_lineage WHERE revision_id=$1 ORDER BY ordinal`,[review.revision_id])).rows.map(row=>({sourceKind:row.source_kind,sourceRevisionId:row.source_revision_id,sourceGeneration:Number(row.source_generation),sourceDigest:row.source_digest,rightsBasis:row.rights_basis}));
 const closure=await learningSourceClosure(db,actor,review.customer_id,lineage);
 if(closure.closureDigest!==review.closure_digest||closure.rightsDigest!==review.rights_digest)throw new HttpFailure(409,'source_changed','Reviewed original evidence changed');
 return {review,closure};
}
