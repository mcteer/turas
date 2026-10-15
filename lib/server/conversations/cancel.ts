import { conversationFeature } from "./feature";
import { lockExecutionActor } from "../execution/policy";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import {assertCustomerQuestionReads} from "./customer-accounts";
import { readOwnedBinding,lockOwnedBinding } from "./binding";
import type { PoolClient } from "pg";
import { staffingScopeForConversation } from "../staffing/context";
import { lockStaffingActor } from "../staffing/policy";
import { enqueueLearningRetirement } from '../learning/invalidation';
import { scheduleLearningPayloadPurge } from '../learning/retention';
import { lockInternalLearningActor } from '../learning/policy';

export async function requestCancellation(
  session: CurrentSession, nativeSessionId: string, turnId: string,
  existingClient?: PoolClient,
): Promise<void> {
  const run = async (client: PoolClient) => {
    const conversation = await client.query<{ id: string }>(`
      SELECT id FROM conversations WHERE eve_session_id = $1
        AND owner_principal_id = $2 AND environment_id = $3 LIMIT 1`,
    [nativeSessionId, session.principalId, getServerConfig().TURAS_ENVIRONMENT_ID]);
    const id = conversation.rows[0]?.id;
    if (!id) throw hiddenRecord();
    await readOwnedBinding(client, session, id);
    await client.query("SET LOCAL lock_timeout = '10000ms'");
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const marker = await client.query<{schema_version:number}>(
      "SELECT schema_version FROM turas_environment LIMIT 1");
    if ((marker.rows[0]?.schema_version ?? 0) >= 34) {
      const feature = await conversationFeature(client, id);
      if(feature.kind==='learning'){
        if(feature.scope.ownerMembershipId!==session.membershipId)throw hiddenRecord();
        await lockInternalLearningActor(client,session,feature.scope.customerId);
        await client.query("SET LOCAL lock_timeout='2000ms'");await client.query("SET LOCAL statement_timeout='5000ms'");
      }
      if (feature.kind === "execution") {
        if (feature.scope.ownerMembershipId !== session.membershipId) throw hiddenRecord();
        await lockExecutionActor(client, session, feature.scope.customerId, "read");
      }
      const staffing = feature.kind === "staffing" ? feature.scope : null;
      if (staffing) {
        if (staffing.ownerMembershipId !== session.membershipId) throw hiddenRecord();
        await lockStaffingActor(client, session, staffing.mode === "finance" ? "finance" : "operational",
          { customerId: staffing.customerId, write: true, allowDisabled: true });
      }
    }
    const attempt = await client.query<{ id: string; response_state: string }>(`
      SELECT id, response_state FROM response_attempts
      WHERE conversation_id = $1 AND (native_turn_id = $2
        ${(marker.rows[0]?.schema_version??0)>=61 ? `OR EXISTS(SELECT 1 FROM research_background_turns background
          WHERE background.attempt_id=response_attempts.id AND background.turn_id=$2)` : ''})
        AND response_state IN ('pending','running','waiting_input','stopping')
      FOR UPDATE`, [id, turnId]);
    if (!attempt.rows[0]) throw new HttpFailure(409, "stale_turn", "Turn is no longer active");
    if (attempt.rows[0].response_state !== "stopping") {
      await client.query(`UPDATE response_attempts SET response_state = 'stopping',
        updated_at = now(), revision = revision + 1 WHERE id = $1`, [attempt.rows[0].id]);
    }
    // This is the first durable acknowledgement of native cancellation. Close
    // the draft in the same transaction so a late save cannot win the gap
    // before the separate drafting-status request or turn.cancelled projection.
    if ((marker.rows[0]?.schema_version ?? 0) >= 31) {
      await client.query(`UPDATE plan_drafting_attempts SET state='cancelled',
        safe_error_code='cancelled', updated_at=now()
        WHERE response_attempt_id=$1 AND state IN ('prepared','running')`,
      [attempt.rows[0].id]);
    }
    if ((marker.rows[0]?.schema_version ?? 0) >= 38) {
      await client.query(`UPDATE execution_advice_attempts SET state='cancelled',failure_code='cancelled',settled_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE response_attempt_id=$1 AND conversation_id=$2 AND environment_id=$3 AND workspace_id=$4 AND owner_membership_id=$5 AND state IN ('prepared','running','unconfirmed')`,
        [attempt.rows[0].id,id,getServerConfig().TURAS_ENVIRONMENT_ID,session.workspaceId,session.membershipId]);
    }
    if((marker.rows[0]?.schema_version??0)>=47){
      await client.query(`UPDATE expansion_advice_attempts SET state='cancelled',failure_code='cancelled',settled_at=COALESCE(settled_at,clock_timestamp()),updated_at=clock_timestamp()
        WHERE response_attempt_id=$1 AND conversation_id=$2 AND environment_id=$3 AND workspace_id=$4 AND owner_membership_id=$5 AND state IN ('prepared','running','unconfirmed')`,
      [attempt.rows[0].id,id,getServerConfig().TURAS_ENVIRONMENT_ID,session.workspaceId,session.membershipId]);
    }
    if((marker.rows[0]?.schema_version??0)>=54){
      const learning=(await client.query(`UPDATE learning_attempts SET state='cancelled',failure_code='cancelled',settled_at=COALESCE(settled_at,clock_timestamp()),version=version+1
        WHERE response_attempt_id=$1 AND conversation_id=$2 AND environment_id=$3 AND workspace_id=$4 AND actor_membership_id=$5 AND state IN('prepared','admitted','running','unconfirmed') RETURNING id`,[attempt.rows[0].id,id,getServerConfig().TURAS_ENVIRONMENT_ID,session.workspaceId,session.membershipId])).rows;
      for(const item of learning){await scheduleLearningPayloadPurge(client,item.id,'attempt','obsolete');await enqueueLearningRetirement(client,session.workspaceId,item.id,new Date());}
    }
    if ((marker.rows[0]?.schema_version ?? 0) >= 43) {
      await client.query(`UPDATE support_advice_attempts SET state='cancelled',failure_code='cancelled',settled_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE response_attempt_id=$1 AND conversation_id=$2 AND environment_id=$3 AND workspace_id=$4 AND owner_membership_id=$5 AND state IN ('prepared','running','unconfirmed')`,
      [attempt.rows[0].id, id, getServerConfig().TURAS_ENVIRONMENT_ID, session.workspaceId, session.membershipId]);
    }
    if ((marker.rows[0]?.schema_version ?? 0) >= 34) {
      await client.query(`UPDATE staffing_advisory_attempts SET state='cancelled',failure_code='cancelled',
        settled_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE response_attempt_id=$1 AND conversation_id=$2 AND environment_id=$3 AND workspace_id=$4
          AND owner_membership_id=$5 AND state IN ('prepared','running','unconfirmed')`,
        [attempt.rows[0].id, id, getServerConfig().TURAS_ENVIRONMENT_ID, session.workspaceId, session.membershipId]);
    }
  };
  if (existingClient) return run(existingClient);
  await withTransaction(run);
}

/** Legacy Stop cancels the owner's research cohort even after its initial
 * acknowledgement has completed. A task receipt never grants cross-session
 * control, and cancellation closes database admission before the native call. */
export async function requestOwnedTaskCancellation(session:CurrentSession,nativeSessionId:string){
 await withTransaction(async db=>{
  const row=(await db.query(`SELECT id FROM conversations WHERE eve_session_id=$1 AND owner_principal_id=$2 AND workspace_id=$3 AND environment_id=$4`,[nativeSessionId,session.principalId,session.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if(!row || (await conversationFeature(db,row.id)).kind!=='normal')throw hiddenRecord();
  await lockOwnedBinding(db,session,row.id);
  await assertCustomerQuestionReads(db,session,row.id,undefined,false);
  const requests=(await db.query(`SELECT r.key,parent.id AS attempt_id FROM turas_research_requests r
   LEFT JOIN LATERAL(SELECT a.id FROM response_attempts a JOIN general_context_receipts g ON g.attempt_id=a.id
    WHERE a.conversation_id=$1 AND g.as_of<=r.started_at ORDER BY g.as_of DESC LIMIT 1) parent ON true
   WHERE r.environment_id=$2 AND r.workspace_id=$3 AND r.owner_user_id=$4 AND r.parent_session_id=$5
     AND r.receipt IS NULL AND r.lease_until>now() FOR UPDATE OF r`,[row.id,getServerConfig().TURAS_ENVIRONMENT_ID,session.workspaceId,session.principalId,nativeSessionId])).rows;
  await db.query(`UPDATE response_attempts SET response_state=CASE WHEN response_state IN('pending','running','waiting_input','stopping') THEN 'stopping' ELSE 'cancelled' END,
   updated_at=now(),revision=revision+1 WHERE conversation_id=$1 AND (response_state IN('pending','running','waiting_input','stopping') OR id=ANY($2::uuid[]))`,[row.id,requests.map(r=>r.attempt_id).filter(Boolean)]);
  await db.query(`UPDATE turas_research_requests SET lease_until=least(lease_until,clock_timestamp())
   WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3 AND parent_session_id=$4 AND receipt IS NULL AND lease_until>now()`,[getServerConfig().TURAS_ENVIRONMENT_ID,session.workspaceId,session.principalId,nativeSessionId]);
 });
}

/** Reconcile only the runtime's explicit no-active-turn acknowledgment. An
 * accepted cancellation request alone does not prove a running turn stopped. */
export async function settleInactiveOwnedCancellation(session:CurrentSession,nativeSessionId:string){
 return withTransaction(async db=>{
  const row=(await db.query(`SELECT id FROM conversations WHERE eve_session_id=$1 AND owner_principal_id=$2
    AND workspace_id=$3 AND environment_id=$4`,[nativeSessionId,session.principalId,session.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if(!row || (await conversationFeature(db,row.id)).kind!=='normal')return;
  await lockOwnedBinding(db,session,row.id);
  const settled=(await db.query(`UPDATE response_attempts SET response_state='cancelled',updated_at=now(),revision=revision+1
    WHERE conversation_id=$1 AND response_state='stopping' RETURNING id`,[row.id])).rows;
  for(const attempt of settled)await db.query(`UPDATE watchdog_jobs SET state='settled',lease_owner=NULL,
    lease_expires_at=NULL,updated_at=now() WHERE attempt_id=$1`,[attempt.id]);
 });
}
