import {specialistPolicies} from './discussion-policy';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../../auth/sessions';
import {withTransaction} from '../../db/client';
import {getServerConfig} from '../../config';
import {hiddenRecord,HttpFailure} from '../../../contracts/http';
import {readOwnedBinding,lockOwnedOrdinaryCleanup} from '../../conversations/binding';
import {lockProfileActor,lockWorkspaceActor} from '../../profiles/policy';
import {conversationFeature} from '../../conversations/feature';
import type {SpecialistKind} from '../../../contracts/specialist-discussions';
import {createHash,randomUUID} from 'node:crypto';
import {readResearchRuntimeAuthority} from './runtime-authority';
import {loadResearchContext,researchContextDigest} from './solution-research/context';
import {discussionSnapshots,discussionSnapshotsCurrent} from './discussion-sources';
import type {AppIdentity} from './identity';
import {snapshotReferenceSchema} from './research-cache/schema';

export type OwnedDiscussion={id:string;conversation_id:string;customer_id:string;kind:SpecialistKind;workload:string;
 parent_session_id:string;workflow_run_id:string;control_hook_token:string;child_session_id:string|null;native_task_id:string|null;
 state:'open'|'stopping'|'closed'|'failed'|'expired';expires_at:Date;created_at:Date;context_digest:string;authority_digest:string;original_attempt_id:string;
 dependencies:unknown[];input_ceiling:string;output_ceiling:string;cost_ceiling_micro_usd:string};

/** Discussion writes serialize their conversation, not customer profile data.
 * Profile SHARE locks coexist with native projection's conversation-first read
 * fence; taking a profile UPDATE lock here would deadlock that projection. */
async function lockDiscussionConversation(db:PoolClient,actor:CurrentSession,conversationId:string){
 await lockWorkspaceActor(db,actor);
 const locked=await db.query(`SELECT id FROM conversations WHERE id=$1 AND owner_principal_id=$2 AND workspace_id=$3 AND environment_id=$4 FOR UPDATE`,[conversationId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID]);
 if(!locked.rowCount)throw hiddenRecord();
 return readOwnedBinding(db,actor,conversationId);
}

/** Only authenticated server/domain callers reach native bindings. Possessing
 * a discussion UUID or a native run ID never supplies retrieval authority. */
export async function lockOwnedDiscussion(db:PoolClient,actor:CurrentSession,conversationId:string,discussionId:string){
 const scope=(await db.query<{customer_id:string}>(`SELECT customer_id FROM specialist_discussions
  WHERE id=$1 AND conversation_id=$2 AND environment_id=$3 AND workspace_id=$4 AND owner_principal_id=$5`,
 [discussionId,conversationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId])).rows[0];
 if(!scope)throw hiddenRecord();
 await lockWorkspaceActor(db,actor);
 await lockProfileActor(db,actor,scope.customer_id,undefined,true);
 const conversation=await lockDiscussionConversation(db,actor,conversationId);
 if((await conversationFeature(db,conversationId)).kind!=='normal')throw hiddenRecord();
 const row=(await db.query<OwnedDiscussion>(`SELECT * FROM specialist_discussions WHERE id=$1
  AND conversation_id=$2 AND environment_id=$3 AND workspace_id=$4 AND owner_principal_id=$5 FOR UPDATE`,
 [discussionId,conversationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId])).rows[0];
 if(!row||row.customer_id!==scope.customer_id||row.parent_session_id!==conversation.eve_session_id)throw hiddenRecord();
 return row;
}

/** This durable fence commits before runtime cancellation. A failed native
 * request leaves the discussion stopping; it cannot renew paid authority. */
export async function fenceSpecialistCancellation(actor:CurrentSession,conversationId:string,discussionId:string){
 return withTransaction(async db=>{
  const scope=(await db.query<{parent_session_id:string}>(`SELECT parent_session_id FROM specialist_discussions WHERE id=$1
   AND conversation_id=$2 AND environment_id=$3 AND workspace_id=$4 AND owner_principal_id=$5`,
  [discussionId,conversationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId])).rows[0];
  if(!scope)throw hiddenRecord();
  const conversation=await lockOwnedOrdinaryCleanup(db,actor,scope.parent_session_id);
  if(conversation.id!==conversationId)throw hiddenRecord();
  const row=(await db.query<{id:string;workflow_run_id:string;state:OwnedDiscussion['state'];closed_at:Date|null;control_hook_token:string;assignment_state:string|null}>(`SELECT id,workflow_run_id,state,closed_at,control_hook_token,(SELECT state FROM specialist_assignments WHERE discussion_id=specialist_discussions.id ORDER BY ordinal DESC LIMIT 1) AS assignment_state FROM specialist_discussions
   WHERE id=$1 AND conversation_id=$2 AND environment_id=$3 AND workspace_id=$4 AND owner_principal_id=$5 FOR UPDATE`,
  [discussionId,conversationId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId])).rows[0];
  if(!row)throw hiddenRecord();
  if(!row.closed_at&&row.state!=='stopping'){
   await db.query("UPDATE specialist_discussions SET state='stopping',close_reason=COALESCE(close_reason,'cancelled'),version=version+1 WHERE id=$1",[row.id]);
   await db.query("UPDATE specialist_assignments SET state='stopping',updated_at=clock_timestamp() WHERE discussion_id=$1 AND state IN('admitted','working','waiting_input')",[row.id]);
   row.state='stopping';
  }
  return {discussionId:row.id,workflowRunId:row.workflow_run_id,controlHookToken:row.control_hook_token,state:row.state,closedAt:row.closed_at,terminalState:row.assignment_state};
 });
}

export function requireOpenDiscussion(row:OwnedDiscussion,kind:SpecialistKind,now:Date){
 if(row.kind!==kind)throw hiddenRecord();
 if(row.state!=='open'||!Number.isFinite(row.expires_at.getTime())||!Number.isFinite(now.getTime())||row.expires_at.getTime()<=now.getTime())
  throw new HttpFailure(409,'specialist_unavailable','This specialist discussion is closed or expired. A fresh authorized assignment is required.');
}

type DiscussionCall={attemptId:string;principalId:string;parentSessionId:string;workflowRunId:string;callId:string;kind:SpecialistKind;message:string};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function authorityDigest(db:PoolClient,actor:CurrentSession,customerId:string){
 const row=(await db.query(`SELECT m.revision AS membership_revision,p.revision AS principal_revision,g.revision AS grant_revision
  FROM memberships m JOIN principals p ON p.id=m.principal_id LEFT JOIN customer_grants g ON g.membership_id=m.id AND g.customer_id=$3 AND g.state='active'
  WHERE m.id=$1 AND m.workspace_id=$2 AND m.principal_id=$4 AND m.active AND p.active`,[actor.membershipId,actor.workspaceId,customerId,actor.principalId])).rows[0];
 if(!row||actor.kind==='partner'&&row.grant_revision==null)throw hiddenRecord();
 return hash({membershipId:actor.membershipId,kind:actor.kind,role:actor.role,membershipRevision:String(row.membership_revision),principalRevision:String(row.principal_revision),grantRevision:row.grant_revision==null?null:String(row.grant_revision)});
}

/** Called only by a trusted workflow step. Native IDs bind observations; all
 * customer/owner/lease scope is recovered from current server authority. */
export async function admitSpecialistCall(input:DiscussionCall){
 if(!input.message.trim()||input.message.length>20000||!input.callId||!input.workflowRunId)throw hiddenRecord();
 return withTransaction(async db=>{
  const authority=await readResearchRuntimeAuthority(db,input.attemptId,input.principalId,{parentSessionId:input.parentSessionId,kind:input.kind},false,true);
  if(!authority)throw hiddenRecord();
  const actor=authority.actor;
  const pending=authority.requests.filter(request=>!request.completed);
  const priorIdentity=(await db.query(`SELECT a.research_key,a.lease_id FROM specialist_assignments a JOIN specialist_discussions d ON d.id=a.discussion_id
   WHERE d.workflow_run_id=$1 AND a.call_id=$2 AND d.environment_id=$3 AND d.workspace_id=$4 AND d.owner_principal_id=$5`,
  [input.workflowRunId,input.callId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId])).rows[0];
  const request=(priorIdentity?authority.requests.find(candidate=>candidate.key===priorIdentity.research_key&&candidate.lease_id===priorIdentity.lease_id):undefined)??(pending.length===1?pending[0]:null);
  if(!request)throw new HttpFailure(409,'specialist_reservation_unavailable','A unique current research reservation is required.');
  await lockDiscussionConversation(db,actor,authority.conversationId);
  if((await db.query('SELECT native_protocol FROM conversations WHERE id=$1',[authority.conversationId])).rows[0]?.native_protocol!==27)throw hiddenRecord();
  const identity={...actor,userId:actor.principalId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID,responseAttemptId:input.attemptId};
  const context=await loadResearchContext(identity,request.account_id,undefined,db,'authority');
  const digest=researchContextDigest(context);
  const permissionDigest=await authorityDigest(db,actor,request.account_id);
  if(digest!==request.context_hash)throw new HttpFailure(409,'context_changed','Customer context changed. Prepare a fresh authorized assignment.');
  const dependencies=context.evidence.map(evidence=>({id:evidence.id,digest:hash(evidence)}));
  let row=(await db.query<OwnedDiscussion>(`SELECT * FROM specialist_discussions WHERE workflow_run_id=$1
   AND environment_id=$2 AND workspace_id=$3 AND owner_principal_id=$4 FOR UPDATE`,
  [input.workflowRunId,identity.environmentId,actor.workspaceId,actor.principalId])).rows[0];
  const now=(await db.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
  if(row){
   if(row.conversation_id!==authority.conversationId||row.customer_id!==request.account_id||row.workload!==request.scope.workload||row.parent_session_id!==input.parentSessionId)throw hiddenRecord();
   requireOpenDiscussion(row,input.kind,now);
   if(row.authority_digest!==permissionDigest)throw new HttpFailure(409,'context_changed','Specialist authority changed. Start a fresh authorized assignment.');
   if(!await readResearchRuntimeAuthority(db,row.original_attempt_id,input.principalId,{parentSessionId:input.parentSessionId,kind:input.kind}))throw hiddenRecord();
   if(row.context_digest!==digest||row.dependencies.filter(value=>!(typeof value==='object'&&value!==null&&'kind' in value&&value.kind==='snapshot')).some(value=>{
    if(typeof value!=='object'||value===null||!('id' in value)||!('digest' in value))return true;
    return !dependencies.some(current=>current.id===value.id&&current.digest===value.digest);
   }))throw new HttpFailure(409,'context_changed','Retained specialist context is no longer eligible. Start a fresh authorized assignment.');
   if(!await discussionSnapshotsCurrent(db,identity,row.customer_id,discussionSnapshots(row.dependencies)))throw new HttpFailure(409,'context_changed','A retained specialist source changed or was withdrawn.');
  }else{
   const active=await db.query("SELECT 1 FROM specialist_discussions WHERE conversation_id=$1 AND state IN('open','stopping') AND expires_at>clock_timestamp() LIMIT 12",[authority.conversationId]);
   if((active.rowCount??0)>=12)throw new HttpFailure(429,'specialist_limit','Close an existing specialist discussion before starting another.');
   const expiresAt=new Date(Math.min(now.getTime()+specialistPolicies[input.kind].timeoutMs,new Date(request.valid_until).getTime(),actor.expiresAt.getTime()));
   if(expiresAt.getTime()<=now.getTime())throw hiddenRecord();
   row=(await db.query<OwnedDiscussion>(`INSERT INTO specialist_discussions(id,conversation_id,environment_id,workspace_id,owner_principal_id,customer_id,kind,parent_session_id,first_call_id,workflow_run_id,original_attempt_id,original_lease_id,context_digest,dependencies,input_ceiling,output_ceiling,cost_ceiling_micro_usd,expires_at,workload,authority_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
   [randomUUID(),authority.conversationId,identity.environmentId,actor.workspaceId,actor.principalId,request.account_id,input.kind,input.parentSessionId,input.callId,input.workflowRunId,input.attemptId,request.lease_id,digest,JSON.stringify(dependencies),specialistPolicies[input.kind].inputTokens,specialistPolicies[input.kind].outputTokens,specialistPolicies[input.kind].microUsd,expiresAt,request.scope.workload,permissionDigest])).rows[0];
  }
  const payloadDigest=hash(input.message);
  const previous=(await db.query('SELECT * FROM specialist_assignments WHERE discussion_id=$1 AND (call_id=$2 OR request_key=$3)',[row.id,input.callId,request.lease_id])).rows;
  if(previous.length){
   if(previous.length!==1||previous[0].input_digest!==payloadDigest||previous[0].call_id!==input.callId||previous[0].attempt_id!==input.attemptId||previous[0].lease_id!==request.lease_id||previous[0].research_key!==request.key)throw new HttpFailure(409,'specialist_conflict','Research admission conflicts with prior work.');
   return {discussionId:row.id,assignmentId:previous[0].id as string,controlHookToken:row.control_hook_token,expiresAt:row.expires_at.toISOString(),duplicate:true,scope:request.scope,state:previous[0].state as string,resultReference:previous[0].result_reference??null};
  }
  const active=await db.query("SELECT 1 FROM specialist_assignments WHERE discussion_id=$1 AND state IN('admitted','working','waiting_input','stopping')",[row.id]);
  if(active.rowCount)throw new HttpFailure(409,'specialist_busy','The specialist is still working on its current assignment.');
  const assignmentId=randomUUID();
  await db.query(`INSERT INTO specialist_assignments(id,discussion_id,parent_session_id,ordinal,attempt_id,request_key,input_digest,call_id,research_key,lease_id,authority_expires_at)
   SELECT $1,$2,$3,COALESCE(max(ordinal),0)+1,$4,$5,$6,$7,$8,$5,$9 FROM specialist_assignments WHERE discussion_id=$2`,
  [assignmentId,row.id,input.parentSessionId,input.attemptId,request.lease_id,payloadDigest,input.callId,request.key,new Date(Math.min(row.expires_at.getTime(),new Date(request.valid_until).getTime()))]);
  await db.query('UPDATE specialist_discussions SET dependencies=$2,version=version+1 WHERE id=$1',[row.id,JSON.stringify([...dependencies,...discussionSnapshots(row.dependencies)])]);
  return {discussionId:row.id,assignmentId,controlHookToken:row.control_hook_token,expiresAt:row.expires_at.toISOString(),duplicate:false,scope:request.scope};
 });
}

export type SpecialistWorkerIdentity={attemptId:string;principalId:string;parentSessionId:string;workerSessionId:string;kind:SpecialistKind};

/** Rechecked inside the provider/research reservation transaction. A worker
 * cannot inherit authority merely from retained native conversation state. */
export async function authorizeSpecialistWorker(db:PoolClient,input:SpecialistWorkerIdentity){
 const authority=await readResearchRuntimeAuthority(db,input.attemptId,input.principalId,{parentSessionId:input.parentSessionId,workerSessionId:input.workerSessionId,kind:input.kind},false,true);
 if(!authority)throw hiddenRecord();
 await lockDiscussionConversation(db,authority.actor,authority.conversationId);
 const candidates=(await db.query<OwnedDiscussion>(`SELECT d.* FROM specialist_discussions d
  WHERE d.conversation_id=$1 AND d.parent_session_id=$2 AND d.kind=$3 AND d.state='open'
   AND (d.child_session_id IS NULL OR d.child_session_id=$4)
   AND EXISTS(SELECT 1 FROM specialist_assignments a WHERE a.discussion_id=d.id AND a.attempt_id=$5
    AND a.state IN('admitted','working','waiting_input')) FOR UPDATE`,
 [authority.conversationId,input.parentSessionId,input.kind,input.workerSessionId,input.attemptId])).rows;
 if(candidates.length!==1)throw hiddenRecord();
 const row=candidates[0];
 const now=(await db.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
 requireOpenDiscussion(row,input.kind,now);
 if(!await readResearchRuntimeAuthority(db,row.original_attempt_id,input.principalId,{parentSessionId:input.parentSessionId,kind:input.kind}))throw hiddenRecord();
 const assignments=(await db.query(`SELECT * FROM specialist_assignments WHERE discussion_id=$1 AND attempt_id=$2
  AND authority_expires_at>clock_timestamp() AND state IN('admitted','working','waiting_input') FOR UPDATE`,[row.id,input.attemptId])).rows;
 if(assignments.length!==1)throw hiddenRecord();
 const assignment=assignments[0];
 const request=authority.requests.find(candidate=>candidate.key===assignment.research_key&&candidate.lease_id===assignment.lease_id&&candidate.account_id===row.customer_id);
 if(!request||request.scope.workload!==row.workload)throw hiddenRecord();
 if(row.authority_digest!==await authorityDigest(db,authority.actor,row.customer_id))throw new HttpFailure(409,'context_changed','Specialist authority changed.');
 const identity={...authority.actor,userId:authority.actor.principalId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID,responseAttemptId:input.attemptId,workerSessionId:input.workerSessionId};
 const context=await loadResearchContext(identity,row.customer_id,undefined,db,'authority');
 const digest=researchContextDigest(context);
 const dependencies=context.evidence.map(evidence=>({id:evidence.id,digest:hash(evidence)}));
 if(digest!==row.context_digest||digest!==request.context_hash||row.dependencies.filter(value=>!(typeof value==='object'&&value!==null&&'kind' in value&&value.kind==='snapshot')).some(value=>{
  if(typeof value!=='object'||value===null||!('id' in value)||!('digest' in value))return true;
  return !dependencies.some(current=>current.id===value.id&&current.digest===value.digest);
 }))throw new HttpFailure(409,'context_changed','Retained specialist context is no longer eligible.');
 if(!await discussionSnapshotsCurrent(db,identity,row.customer_id,discussionSnapshots(row.dependencies)))throw new HttpFailure(409,'context_changed','A retained specialist source changed or was withdrawn.');
 await db.query('UPDATE specialist_discussions SET child_session_id=$2,dependencies=$3,version=version+1 WHERE id=$1',[row.id,input.workerSessionId,JSON.stringify([...dependencies,...discussionSnapshots(row.dependencies)])]);
 await db.query("UPDATE specialist_assignments SET state='working',updated_at=clock_timestamp() WHERE id=$1 AND state='admitted'",[assignment.id]);
 return {identity,discussion:row,assignmentId:assignment.id as string};
}

export async function registerSpecialistSources(identity:AppIdentity,references:readonly unknown[]){
 if(!identity.workerSessionId||!references.length)return;
 if(!identity.responseAttemptId)throw hiddenRecord();
 const parsed=references.map(value=>({kind:'snapshot' as const,...snapshotReferenceSchema.parse(value)}));
 await withTransaction(async db=>{
  const scope=(await db.query<{parent_session_id:string;kind:SpecialistKind}>(`SELECT parent_session_id,kind FROM specialist_discussions
   WHERE child_session_id=$1 AND environment_id=$2 AND workspace_id=$3 AND owner_principal_id=$4`,[identity.workerSessionId,getServerConfig().TURAS_ENVIRONMENT_ID,identity.workspaceId,identity.principalId])).rows[0];
  if(!scope)throw hiddenRecord();
  const bound=await authorizeSpecialistWorker(db,{attemptId:identity.responseAttemptId!,principalId:identity.principalId,parentSessionId:scope.parent_session_id,workerSessionId:identity.workerSessionId!,kind:scope.kind});
  const existing=(await db.query('SELECT dependencies FROM specialist_discussions WHERE id=$1',[bound.discussion.id])).rows[0].dependencies as unknown[];
  const snapshots=[...new Map([...discussionSnapshots(existing),...parsed].map(reference=>[reference.snapshotId,reference])).values()];
  if(!await discussionSnapshotsCurrent(db,bound.identity,bound.discussion.customer_id,snapshots))throw new HttpFailure(409,'context_changed','The specialist source is no longer eligible.');
  const context=existing.filter(value=>!(typeof value==='object'&&value!==null&&'kind' in value&&value.kind==='snapshot'));
  await db.query('UPDATE specialist_discussions SET dependencies=$2,version=version+1 WHERE id=$1',[bound.discussion.id,JSON.stringify([...context,...snapshots])]);
 });
}

/** Cleanup capability held by the admitted workflow itself, including after
 * logout/revocation. It can only fence that workflow's own existing work. */
export async function closeSpecialistWorkflow(workflowRunId:string,parentSessionId:string,ownerPrincipalId:string,reason:'expired'|'failed'|'cancelled'){
 await withTransaction(async db=>{
  const scope=(await db.query(`SELECT c.id FROM conversations c JOIN specialist_discussions d ON d.conversation_id=c.id
   WHERE d.workflow_run_id=$1 AND d.parent_session_id=$2 AND d.owner_principal_id=$3 AND d.environment_id=$4
    AND c.eve_session_id=$2 AND c.owner_principal_id=$3 AND c.environment_id=$4 FOR UPDATE OF c`,[workflowRunId,parentSessionId,ownerPrincipalId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if(!scope)return;
  const discussion=(await db.query('SELECT id FROM specialist_discussions WHERE workflow_run_id=$1 AND conversation_id=$2 FOR UPDATE',[workflowRunId,scope.id])).rows[0];
  if(!discussion)return;
  await db.query("UPDATE specialist_discussions SET state='stopping',close_reason=COALESCE(close_reason,$2),version=version+1 WHERE id=$1 AND state='open'",[discussion.id,reason]);
  await db.query("UPDATE specialist_assignments SET state='stopping',reason_code=COALESCE(reason_code,$2),updated_at=clock_timestamp() WHERE discussion_id=$1 AND state IN('admitted','working','waiting_input')",[discussion.id,reason]);
 });
}
