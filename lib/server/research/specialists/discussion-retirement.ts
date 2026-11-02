import type {PoolClient} from 'pg';
import {getServerConfig} from '../../config';

/** Reuse the validated native parent-end receipt, not an accepted Stop request.
 * Retirement proves task termination, never usage settlement. No native fact
 * positions or financial records are manufactured here. Caller owns a transaction.
 */
export async function reconcileRetiredSpecialists(db:PoolClient,parentSessionId:string,discussionId?:string){
 const schema=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version;
 if(!(Number(schema)>=84))return false;
 const scope=(await db.query(`SELECT c.id,r.confirmed_at FROM conversations c JOIN ordinary_native_retirements r
  ON r.conversation_id=c.id AND r.environment_id=c.environment_id AND r.workspace_id=c.workspace_id
   AND r.owner_principal_id=c.owner_principal_id AND r.native_session_id=c.eve_session_id
  WHERE c.eve_session_id=$1 AND c.environment_id=$2 AND c.binding_state='bound'
   AND r.state='confirmed' AND r.confirmed_at IS NOT NULL FOR UPDATE OF c,r`,
 [parentSessionId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 if(!scope)return false;
 const rows=(await db.query(`SELECT d.id FROM specialist_discussions d JOIN conversations c ON c.id=d.conversation_id
  WHERE c.id=$1 AND d.parent_session_id=c.eve_session_id AND d.environment_id=c.environment_id
   AND d.workspace_id=c.workspace_id AND d.owner_principal_id=c.owner_principal_id
   AND ($2::uuid IS NULL OR d.id=$2) ORDER BY d.id FOR UPDATE OF d`,[scope.id,discussionId??null])).rows;
 for(const row of rows){
  await db.query(`SELECT id FROM specialist_assignments WHERE discussion_id=$1 ORDER BY ordinal FOR UPDATE`,[row.id]);
  await db.query(`UPDATE specialist_assignments SET state='cancelled',reason_code=COALESCE(reason_code,'parent_retired'),
   updated_at=GREATEST(updated_at,$2::timestamptz) WHERE discussion_id=$1 AND state IN('admitted','working','waiting_input','stopping')`,[row.id,scope.confirmed_at]);
  await db.query(`UPDATE specialist_discussions SET state='closed',closed_at=$2,close_reason='parent_retired',version=version+1
   WHERE id=$1 AND closed_at IS NULL`,[row.id,scope.confirmed_at]);
 }
 return rows.length>0;
}
