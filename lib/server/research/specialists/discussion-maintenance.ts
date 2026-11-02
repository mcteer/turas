import type {AttachSessionFn} from 'eve/channels';
import {resumeHook} from 'eve/workflow/api';
import {withTransaction,query} from '../../db/client';
import {getServerConfig} from '../../config';
import {readEveHistory} from '../../conversations/eve-reader';
import {reconcileRetiredSpecialists} from './discussion-retirement';

/** Cleanup-only capability: recorded Stop or immutable expiry, never a fresh
 * research lease. Lock order remains conversation then discussion/assignment. */
export async function claimSpecialistControl(){
 return withTransaction(async db=>{
  const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
  if((marker?.schema_version??0)<84)return null;
  const candidate=(await db.query(`SELECT d.id FROM specialist_discussions d JOIN conversations c ON c.id=d.conversation_id
   WHERE d.environment_id=$1 AND d.closed_at IS NULL AND d.control_next_attempt_at<=clock_timestamp()
    AND (d.state IN('stopping','failed','expired','closed') OR d.state='open' AND d.expires_at<=clock_timestamp())
   ORDER BY d.control_next_attempt_at,d.id LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if(!candidate)return null;
  const row=(await db.query(`SELECT id,original_attempt_id,state FROM specialist_discussions WHERE id=$1 FOR UPDATE`,[candidate.id])).rows[0];
  await db.query(`UPDATE specialist_discussions SET state='stopping',close_reason=COALESCE(close_reason,CASE WHEN state='open' THEN 'expired' ELSE 'cancelled' END),
   control_attempts=control_attempts+1,control_next_attempt_at=clock_timestamp()+interval '30 seconds',version=version+1 WHERE id=$1`,[row.id]);
  await db.query("UPDATE specialist_assignments SET state='stopping',updated_at=clock_timestamp() WHERE discussion_id=$1 AND state IN('admitted','working','waiting_input')",[row.id]);
  return {discussionId:row.id as string,attemptId:row.original_attempt_id as string};
 });
}
export async function reconcileSpecialistControl(attach:AttachSessionFn,discussionId:string,attemptId:string):Promise<'settled'|'cancel_requested'|'retry'>{
 const row=(await query(`SELECT d.workflow_run_id,d.control_hook_token,d.parent_session_id,d.closed_at FROM specialist_discussions d JOIN conversations c ON c.id=d.conversation_id
  JOIN response_attempts a ON a.id=d.original_attempt_id AND a.conversation_id=c.id
  WHERE d.id=$1 AND d.original_attempt_id=$2 AND d.environment_id=$3 AND c.environment_id=d.environment_id
   AND c.owner_principal_id=d.owner_principal_id AND c.workspace_id=d.workspace_id AND c.eve_session_id=d.parent_session_id
   AND (d.state='stopping' OR d.closed_at IS NOT NULL)`,[discussionId,attemptId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 if(!row)return 'retry';if(row.closed_at)return 'settled';
 if(await withTransaction(db=>reconcileRetiredSpecialists(db,row.parent_session_id,discussionId)))return 'settled';
 let accepted=false;
 try{await resumeHook(row.control_hook_token,{stop:true});accepted=true;}catch{/* A lost acknowledgement never proves completion. Replay actual native facts. */}
 await readEveHistory(attach,row.parent_session_id,0);
 const terminal=(await query('SELECT closed_at FROM specialist_discussions WHERE id=$1 AND environment_id=$2',[discussionId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]?.closed_at;
 return terminal?'settled':accepted?'cancel_requested':'retry';
}
