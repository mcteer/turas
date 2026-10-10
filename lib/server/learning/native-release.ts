import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { hiddenRecord } from '../../contracts/http';
import { learningTransaction } from './repository';
import { getServerConfig } from '../config';
import { conversationFeature } from '../conversations/feature';
import { boundLearningActor } from './tool-actor';
export type LearningNativeRelease={principal:{principalId:string;attributes:{turasAttemptId:string}};conversationId:string;responseAttemptId:string;nativeSessionId:string;incomingTurnId?:string;allowUnclaimedTurn?:boolean};
type Expected={actor?:CurrentSession;nativeSessionId?:string;responseAttemptId?:string;incomingTurnId?:string;allowUnclaimedTurn?:boolean};
export async function prepareLearningNativeRelease(conversationId:string,expected?:Expected):Promise<LearningNativeRelease|null>{
 return learningTransaction(async db=>{
  const feature=await conversationFeature(db,conversationId);if(feature.kind!=='learning')return null;
  const row=(await db.query(`SELECT c.owner_principal_id,c.eve_session_id,a.response_attempt_id FROM conversations c JOIN learning_attempts a ON a.conversation_id=c.id WHERE c.id=$1 AND c.environment_id=$2 AND c.workspace_id=a.workspace_id AND a.environment_id=c.environment_id`,[conversationId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if(!row?.response_attempt_id||!row.eve_session_id||expected?.actor&&(expected.actor.principalId!==row.owner_principal_id||expected.actor.membershipId!==feature.scope.ownerMembershipId)||expected?.nativeSessionId&&expected.nativeSessionId!==row.eve_session_id||expected?.responseAttemptId&&expected.responseAttemptId!==row.response_attempt_id)throw hiddenRecord();
  return {principal:{principalId:row.owner_principal_id,attributes:{turasAttemptId:row.response_attempt_id}},conversationId,responseAttemptId:row.response_attempt_id,nativeSessionId:row.eve_session_id,incomingTurnId:expected?.incomingTurnId,allowUnclaimedTurn:expected?.allowUnclaimedTurn};
 });
}
export async function assertLearningNativeRelease(db:PoolClient,release:LearningNativeRelease,actor?:CurrentSession){
 const bound=await boundLearningActor(db,release.principal,release.incomingTurnId,{release:true,allowUnclaimedTurn:release.allowUnclaimedTurn});
 if(bound.scope.conversationId!==release.conversationId||bound.responseAttemptId!==release.responseAttemptId||bound.nativeSessionId!==release.nativeSessionId||actor&&(actor.sessionId!==bound.actor.sessionId||actor.principalId!==bound.actor.principalId||actor.membershipId!==bound.actor.membershipId||actor.workspaceId!==bound.actor.workspaceId))throw hiddenRecord();
 return bound;
}
