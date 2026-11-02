import {encodeSpecialistCursor,decodeSpecialistCursor} from './discussion-cursor';
import type {CurrentSession} from '../../auth/sessions';
import {withTransaction} from '../../db/client';
import {readOwnedBinding} from '../../conversations/binding';
import {lockProfileActor} from '../../profiles/policy';
import {getServerConfig} from '../../config';
import {specialistListSchema,type SpecialistStatus} from '../../../contracts/specialist-discussions';

/** Project only owned task metadata. Native identities and child output never
 * cross this API. Each customer reference is checked against current grants. */
export async function listOwnedSpecialists(actor:CurrentSession,conversationId:string,cursor?:string){
 return withTransaction(async db=>{
  const binding=JSON.stringify([getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,conversationId]);
  const after=cursor?decodeSpecialistCursor(cursor,binding):null;
  const rows=(await db.query(`SELECT d.id,d.customer_id,d.kind,d.state AS discussion_state,d.expires_at,d.closed_at,
   a.id AS assignment_id,a.state,a.created_at,a.updated_at,
   to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM specialist_discussions d
   JOIN LATERAL(SELECT id,state,created_at,updated_at FROM specialist_assignments WHERE discussion_id=d.id ORDER BY ordinal DESC LIMIT 1)a ON true
   WHERE d.conversation_id=$1 AND d.environment_id=$2 AND d.workspace_id=$3 AND d.owner_principal_id=$4
   AND ($5::timestamptz IS NULL OR (a.created_at,d.id)<($5::timestamptz,$6::uuid)) ORDER BY a.created_at DESC,d.id DESC LIMIT 51`,[conversationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,after?.at??null,after?.id??null])).rows;
  for(const customer of [...new Set(rows.map(row=>row.customer_id))].sort())await lockProfileActor(db,actor,customer,undefined,true);
  await readOwnedBinding(db,actor,conversationId);
  const items:SpecialistStatus[]=[];
  for(const row of rows.slice(0,50)){

   const expired=row.expires_at.getTime()<=Date.now();
   const open=row.discussion_state==='open'&&!expired;
   const state=row.discussion_state==='stopping'?'stopping':row.state;
   items.push({discussionId:row.id,specialistKind:row.kind,assignmentId:row.assignment_id,state,
    canContinue:open&&state==='completed',canCancel:open&&!['failed','cancelled','unavailable','stopping'].includes(state),
    reasonCode:expired?'expired':state==='waiting_input'?'question':state==='admitted'?'pending':state==='working'?'running':state==='unavailable'?'result_unavailable':state,
    updatedAt:row.updated_at.toISOString()});
  }
  return specialistListSchema.parse({contract:'specialist-discussions-v1',items,...(rows.length>50?{nextCursor:encodeSpecialistCursor(rows[49].cursor_at,rows[49].id,binding)}:{})});
 });
}
