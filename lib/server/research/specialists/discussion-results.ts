import {z} from 'zod';
import type {AppIdentity} from './identity';
import {withTransaction} from '../../db/client';
import {hiddenRecord,HttpFailure} from '../../../contracts/http';
import {lockOwnedDiscussion,authorizeSpecialistWorker} from './discussions';
import {researchRequestProgress} from './research-cache/requests';
import {researchReferenceSchema} from './solution-research/research-reference';
import {specialistKindSchema} from '../../../contracts/specialist-discussions';
import {readEligiblePracticeRun} from './practice-run';

export const specialistOutcomeSchema=z.object({kind:specialistKindSchema,status:z.enum(['ready','incomplete','unavailable']),reference:z.union([researchReferenceSchema,z.string().regex(/^[a-f0-9]{64}$/)]).nullable(),reason:z.string().max(2000)}).strict();
export type SpecialistOutcome=z.infer<typeof specialistOutcomeSchema>;

/** Store only server-validated result identity and an authored safe explanation.
 * The native call settlement separately proves delivery to the requesting turn. */
export async function publishSpecialistResult(identity:AppIdentity,conversationId:string,discussionId:string,assignmentId:string,output:{status:string;reference:unknown}|undefined,signal:AbortSignal):Promise<SpecialistOutcome>{
 signal.throwIfAborted();
 const scope=await withTransaction(async db=>{
  const discussion=await lockOwnedDiscussion(db,identity,conversationId,discussionId);
  if(!discussion.child_session_id||!identity.responseAttemptId)throw hiddenRecord();
  const bound=await authorizeSpecialistWorker(db,{attemptId:identity.responseAttemptId,principalId:identity.principalId,parentSessionId:discussion.parent_session_id,workerSessionId:discussion.child_session_id,kind:discussion.kind});
  if(bound.assignmentId!==assignmentId)throw hiddenRecord();
  const assignment=(await db.query('SELECT * FROM specialist_assignments WHERE id=$1',[assignmentId])).rows[0];
  const request=(await db.query(`SELECT * FROM turas_research_requests WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3
   AND key=$4 AND lease_id=$5 AND parent_session_id=$6 AND worker_session_id=$7`,
  [identity.environmentId,identity.workspaceId,identity.principalId,assignment.research_key,assignment.lease_id,discussion.parent_session_id,discussion.child_session_id])).rows[0];
  return {discussion,assignment,request,identity:bound.identity};
 });
 if(scope.assignment.result_reference)return specialistOutcomeSchema.parse(scope.assignment.result_reference);
 let reference:SpecialistOutcome['reference']=null;
 let status:SpecialistOutcome['status']='unavailable';
 if(scope.request?.receipt){
  if(scope.discussion.kind==='best-practices'){
   const receipt=z.object({kind:z.literal('best-practices'),reference:z.string().regex(/^[a-f0-9]{64}$/),sourceCount:z.number().int().positive()}).safeParse(scope.request.receipt);
   if(receipt.success&&(!output||output.status!=='unavailable'&&output.reference===receipt.data.reference)){
    // The current finalizer's committed receipt is authority, never child prose.
    // A completed native turn remains a separate prerequisite in the supervisor.
    const run=await withTransaction(async db=>{
     const current=await authorizeSpecialistWorker(db,{attemptId:identity.responseAttemptId!,principalId:identity.principalId,parentSessionId:scope.discussion.parent_session_id,workerSessionId:scope.discussion.child_session_id!,kind:'best-practices'});
     if(current.assignmentId!==assignmentId)throw hiddenRecord();
     return readEligiblePracticeRun(db,current.identity,current.discussion,receipt.data.reference,signal,scope.request.started_at);
    });
    reference=receipt.data.reference;
    status=run.brief.gaps.length?'incomplete':'ready';
   }
  }else if(output&&output.status!=='unavailable'){
   const supplied=researchReferenceSchema.safeParse(output.reference);
   if(supplied.success&&supplied.data.accountId===scope.discussion.customer_id&&supplied.data.researchId===scope.request.receipt.signature){
    const progress=await researchRequestProgress(scope.identity,scope.assignment.research_key,signal);
    if(progress.status==='available'){reference=progress.reference;status=output.status==='ready'?'ready':'incomplete';}
   }
  }
 }
 const outcome:SpecialistOutcome={kind:scope.discussion.kind,status:reference?status:'unavailable',reference,
  reason:reference?'Stored research is available through its governed reference. Preserve its source dates, gaps and caveats.':'The specialist did not produce a currently eligible result. Do not automatically restart research.'};
 signal.throwIfAborted();
 return withTransaction(async db=>{
  const current=await authorizeSpecialistWorker(db,{attemptId:identity.responseAttemptId!,principalId:identity.principalId,parentSessionId:scope.discussion.parent_session_id,workerSessionId:scope.discussion.child_session_id!,kind:scope.discussion.kind});
  if(current.assignmentId!==assignmentId)throw hiddenRecord();
  const row=(await db.query('SELECT result_reference FROM specialist_assignments WHERE id=$1 FOR UPDATE',[assignmentId])).rows[0];
  if(row.result_reference)return specialistOutcomeSchema.parse(row.result_reference);
  const saved=await db.query('UPDATE specialist_assignments SET result_reference=$2,reason_code=$3,updated_at=clock_timestamp() WHERE id=$1 AND result_reference IS NULL',[assignmentId,JSON.stringify(outcome),outcome.status==='unavailable'?'result_unavailable':'result_available']);
  if(saved.rowCount!==1)throw new HttpFailure(409,'specialist_result_conflict','The specialist result could not be recorded.');
  if(outcome.status==='unavailable')await db.query("UPDATE specialist_discussions SET state='failed',close_reason='result_unavailable',version=version+1 WHERE id=$1 AND state='open'",[discussionId]);
  return outcome;
 });
}
