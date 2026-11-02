import type { PoolClient } from "pg";
import type { CurrentSession } from "../../auth/sessions";
import { getServerConfig } from "../../config";
import { lockWorkspaceActor,lockProfileActor } from "../../profiles/policy";
import { conversationFeature } from "../../conversations/feature";

/** Legacy background work uses its registered parent/worker lease. An expired
 * short chat receipt alone is never permission to run another paid call.
 * allowExpiredNotification is reserved for a trusted native task notification:
 * it permits a bounded failure explanation, never child/provider admission. */
export async function readResearchRuntimeAuthority(db:PoolClient,attemptId:string,principalId:string,
  lineage?:{parentSessionId:string;workerSessionId?:string;kind?:string},allowExpiredNotification=false,forWrite=false) {
  const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
  if((marker?.schema_version??0)<57)return null;
  const row=(await db.query(`SELECT c.id AS conversation_id,c.eve_session_id,c.customer_id,
    c.workspace_id,c.owner_principal_id,
    COALESCE(authority.login_session_id,g.login_session_id,receipt.login_session_id) AS login_session_id,
    COALESCE(authority.membership_id,g.membership_id,receipt.membership_id) AS membership_id,
    COALESCE(g.as_of,receipt.as_of) AS as_of,
    login.expires_at,p.login_name,p.display_name,m.kind,m.role
    FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id
    LEFT JOIN general_context_receipts g ON g.attempt_id=a.id
    LEFT JOIN ordinary_chat_authorities authority ON authority.attempt_id=a.id
    LEFT JOIN context_snapshot_receipts receipt ON receipt.attempt_id=a.id
    JOIN login_sessions login ON login.id=COALESCE(authority.login_session_id,g.login_session_id,receipt.login_session_id)
      AND login.principal_id=c.owner_principal_id AND login.revoked_at IS NULL AND login.expires_at>now()
    JOIN memberships m ON m.id=COALESCE(authority.membership_id,g.membership_id,receipt.membership_id)
      AND m.principal_id=c.owner_principal_id AND m.workspace_id=c.workspace_id AND m.active
    JOIN principals p ON p.id=c.owner_principal_id AND p.active
    WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.environment_id=$3 AND c.binding_state='bound'
      AND a.response_state NOT IN('cancelled','stopping')
      AND ($4::text IS NULL OR c.eve_session_id=$4)`,
    [attemptId,principalId,getServerConfig().TURAS_ENVIRONMENT_ID,lineage?.parentSessionId??null])).rows[0];
  if(!row || (await conversationFeature(db,row.conversation_id)).kind!=='normal')return null;
  const actor:CurrentSession={sessionId:row.login_session_id,token:'',expiresAt:row.expires_at,
    principalId:row.owner_principal_id,membershipId:row.membership_id,workspaceId:row.workspace_id,
    loginName:row.login_name,displayName:row.display_name,kind:row.kind,role:row.role};
  await lockWorkspaceActor(db,actor,undefined,!forWrite);
  const requests=(await db.query(`SELECT account_id,scope,key,lease_id,context_hash,worker_session_id,receipt IS NOT NULL AS completed,
    least($7::timestamptz,CASE WHEN receipt IS NULL THEN CASE WHEN $9::boolean AND lease_until<=now() THEN clock_timestamp()+interval '120 seconds' ELSE lease_until END
      ELSE completed_at+interval '10 minutes' END) AS valid_until
    FROM turas_research_requests WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3
      AND parent_session_id=$4 AND started_at>=$5 AND ($6::text IS NULL OR scope->>'kind'=$6)
      AND ((receipt IS NULL AND lease_until>now()) OR (receipt IS NOT NULL AND completed_at>now()-interval '10 minutes')
        OR ($9::boolean AND receipt IS NULL AND lease_until>now()-interval '10 minutes'))
      AND ($8::text IS NULL OR worker_session_id IS NULL OR worker_session_id=$8)
    ORDER BY key LIMIT 13`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,
      row.eve_session_id,row.as_of,lineage?.kind??null,actor.expiresAt,lineage?.workerSessionId??null,allowExpiredNotification])).rows;
  if(!requests.length || requests.length>12)return null;
  for(const request of requests) {
    await lockProfileActor(db,actor,request.account_id,undefined,true);
  }
  return {actor,conversationId:row.conversation_id,customerId:row.customer_id as string|null,
    asOf:row.as_of as Date,validUntil:new Date(Math.max(...requests.map(request=>request.valid_until.getTime()))),requests};
}
