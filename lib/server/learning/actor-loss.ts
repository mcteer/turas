import type {PoolClient} from 'pg';
import {getServerConfig} from '../config';
import {scheduleLearningPayloadPurge} from './retention';
import {enqueueLearningRetirement} from './invalidation';
/** Retire only the obsolete owner's work. Session loss cannot cancel another
 * live session, and membership loss never revokes independent original reuse. */
export async function reconcileLearningActorLoss(db:PoolClient,at:Date,limit=25){
 if(!Number.isInteger(limit)||limit<10||limit>100)throw Error('Bounded actor-loss budget required');
 const env=getServerConfig().TURAS_ENVIRONMENT_ID,started=performance.now();let processed=0;
 while(limit-processed>=10&&performance.now()-started<3000){
  const owner=(await db.query(`SELECT * FROM (
   SELECT a.id,a.workspace_id,'attempt' AS kind FROM learning_attempts a JOIN memberships m ON m.id=a.actor_membership_id JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id JOIN conversations c ON c.id=a.conversation_id LEFT JOIN login_sessions s ON s.id=c.context_login_session_id LEFT JOIN learning_attempt_payloads payload ON payload.attempt_id=a.id AND payload.kind='context'
   WHERE a.environment_id=$1 AND a.state IN('prepared','admitted','running','unconfirmed') AND(NOT m.active OR NOT p.active OR NOT w.active OR m.kind<>'internal' OR a.purpose<>'draft' AND m.role<>'admin' OR s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=$2 OR coalesce((payload.content#>>'{fence,actorGeneration}')::bigint,-1)<>m.revision+1)
   UNION ALL
   SELECT e.id,e.workspace_id,'evaluation' FROM learning_evaluations e JOIN memberships m ON m.id=e.actor_membership_id JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id LEFT JOIN learning_evaluation_payloads payload ON payload.evaluation_id=e.id
   WHERE e.environment_id=$1 AND e.state IN('prepared','running','awaiting_review','unconfirmed') AND(NOT m.active OR NOT p.active OR NOT w.active OR m.kind<>'internal' OR m.role<>'admin' OR coalesce((payload.content#>>'{fence,actorGeneration}')::bigint,-1)<>m.revision+1)
  ) owners ORDER BY id LIMIT 1`,[env,at])).rows[0];if(!owner)break;
  if(owner.kind==='attempt'){
   const row=(await db.query("UPDATE learning_attempts SET state='invalidated',failure_code='actor_unavailable',version=version+1 WHERE id=$1 AND state IN('prepared','admitted','running','unconfirmed') RETURNING response_attempt_id",[owner.id])).rows[0];if(!row)continue;
   if(row.response_attempt_id)await db.query("UPDATE response_attempts SET response_state='failed',last_error_code='actor_unavailable',updated_at=$2,revision=revision+1 WHERE id=$1 AND response_state IN('pending','running','stopping')",[row.response_attempt_id,at]);
   await scheduleLearningPayloadPurge(db,owner.id,'attempt','obsolete',at);await enqueueLearningRetirement(db,owner.workspace_id,owner.id,at);processed+=4;
  }else{
   const row=(await db.query("UPDATE learning_evaluations SET state='ineligible',invalidated_at=least(invalidated_at,$2),version=version+1 WHERE id=$1 AND state IN('prepared','running','awaiting_review','unconfirmed') RETURNING id",[owner.id,at])).rows[0];if(!row)continue;
   await scheduleLearningPayloadPurge(db,owner.id,'evaluation','obsolete',at);processed+=2;
   const reviews=(await db.query('SELECT id FROM learning_case_reviews WHERE evaluation_id=$1 ORDER BY id LIMIT 8',[owner.id])).rows;
   for(const review of reviews){await scheduleLearningPayloadPurge(db,review.id,'case_review','obsolete',at);processed++;}
  }
 }
 return processed;
}
