import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {CurrentSession} from '../auth/sessions';
import {lockWorkspaceActor} from '../profiles/policy';
import {hiddenRecord} from '../../contracts/http';
import {getServerConfig} from '../config';
import {conversationFeature} from './feature';
type HumanPrincipal={principalId?:string;principalType?:string;authenticator?:string;attributes?:Record<string,unknown>}|null|undefined;
/** Resolve only the exact authenticated submitting login. Neither a newer
 * continuation nor a research worker grants another login's human approval. */
export async function exactHumanResponder(db:PoolClient,principal:HumanPrincipal):Promise<CurrentSession>{
 const sessionId=principal?.attributes?.turasLoginSessionId,membershipId=principal?.attributes?.turasMembershipId;
 if(principal?.authenticator!=='turas-session'||principal.principalType!=='user'||!principal.principalId||!z.uuid().safeParse(sessionId).success||!z.uuid().safeParse(membershipId).success)throw hiddenRecord();
 const row=(await db.query(`SELECT s.expires_at,m.workspace_id,m.kind,m.role,p.login_name,p.display_name
 FROM login_sessions s JOIN principals p ON p.id=s.principal_id JOIN memberships m ON m.principal_id=p.id AND m.id=$3
 WHERE s.id=$1 AND s.principal_id=$2`,[sessionId,principal.principalId,membershipId])).rows[0];if(!row)throw hiddenRecord();
 const actor:CurrentSession={sessionId:sessionId as string,token:'',expiresAt:row.expires_at,principalId:principal.principalId,membershipId:membershipId as string,workspaceId:row.workspace_id,kind:row.kind,role:row.role,loginName:row.login_name,displayName:row.display_name};
 await lockWorkspaceActor(db,actor,undefined,true);return actor;
}
export async function humanResponderScope(db:PoolClient,principal:HumanPrincipal){
 const actor=await exactHumanResponder(db,principal),attemptId=principal?.attributes?.turasAttemptId;if(!z.uuid().safeParse(attemptId).success)throw hiddenRecord();
 const bound=(await db.query(`SELECT c.id,c.customer_id,EXISTS(SELECT 1 FROM general_context_receipts g WHERE g.attempt_id=a.id) AS general
 FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4 AND c.binding_state='bound' AND a.response_state IN('pending','running','waiting_input','completed')`,[attemptId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 if(!bound||(await conversationFeature(db,bound.id)).kind!=='normal')throw hiddenRecord();
 return {actor,attemptId:attemptId as string,general:Boolean(bound.general),customerId:bound.customer_id as string|null};
}
