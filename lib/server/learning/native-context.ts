import type { FeaturePrincipal } from '../conversations/feature';
import { hiddenRecord,HttpFailure } from '../../contracts/http';
import { learningTransaction,learningHash } from './repository';
import { boundLearningActor } from './tool-actor';

export async function readLearningDraftInitialContext(principal:FeaturePrincipal,turnId:string,nativeSessionId:string,recordInjection=true){
 return learningTransaction(async db=>{
  const bound=await boundLearningActor(db,principal,turnId);
  if(bound.nativeSessionId!==nativeSessionId||bound.nativeTurnId!==turnId)throw hiddenRecord();
  const digest=learningHash(bound.snapshot);
  if(recordInjection)await db.query(`INSERT INTO context_injection_receipts(attempt_id,turn_id,snapshot_digest) VALUES($1,$2,$3) ON CONFLICT(attempt_id,turn_id) DO NOTHING`,[bound.responseAttemptId,turnId,digest]);
  const receipt=(await db.query('SELECT snapshot_digest FROM context_injection_receipts WHERE attempt_id=$1 AND turn_id=$2',[bound.responseAttemptId,turnId])).rows[0];
  if(receipt?.snapshot_digest!==digest)throw new HttpFailure(409,'learning_context_changed','Learning context injection changed');
  return bound.snapshot;
 });
}
