import type {AppIdentity} from './identity';
import {withTransaction} from '../../db/client';
import {hiddenRecord} from '../../../contracts/http';
import {lockOwnedDiscussion} from './discussions';
import {specialistOutcomeSchema} from './discussion-results';
import {readEligiblePracticeRun} from './practice-run';

import {practiceResultSchema} from '../../../contracts/vercel-practice-result';
export {practiceBriefSchema,practiceResultSchema} from '../../../contracts/vercel-practice-result';

/** The reference is not a capability. Only a result owned by this current parent
 * may be read; no fresh research lease, model call, cache fallback or writes. */
export async function readOwnedPracticeResult(identity:AppIdentity,parentSessionId:string,reference:string,signal:AbortSignal){
 if(!/^[a-f0-9]{64}$/.test(reference))throw hiddenRecord();signal.throwIfAborted();
 return withTransaction(async db=>{
  const scope=(await db.query(`SELECT d.id,d.conversation_id,a.result_reference FROM specialist_discussions d
   JOIN specialist_assignments a ON a.discussion_id=d.id JOIN conversations c ON c.id=d.conversation_id
   WHERE d.environment_id=$1 AND d.workspace_id=$2 AND d.owner_principal_id=$3 AND d.parent_session_id=$4
    AND c.native_protocol=27 AND c.eve_session_id=d.parent_session_id AND c.environment_id=d.environment_id AND c.workspace_id=d.workspace_id AND c.owner_principal_id=d.owner_principal_id
    AND d.kind='best-practices' AND a.state='completed' AND a.result_reference->>'kind'='best-practices'
    AND a.result_reference->>'reference'=$5 AND a.result_reference->>'status' IN('ready','incomplete')
   ORDER BY a.ordinal DESC LIMIT 1`,[identity.environmentId,identity.workspaceId,identity.principalId,parentSessionId,reference])).rows[0];
  if(!scope)throw hiddenRecord();
  const discussion=await lockOwnedDiscussion(db,identity,scope.conversation_id,scope.id);
  const outcome=specialistOutcomeSchema.parse(scope.result_reference);
  const run=await readEligiblePracticeRun(db,identity,discussion,reference,signal);
  return practiceResultSchema.parse({status:outcome.status,...run});
 });
}
