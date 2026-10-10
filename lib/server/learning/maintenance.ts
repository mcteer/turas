import type {AttachSessionFn} from 'eve/channels';
import {reconcileLearningActorLoss} from './actor-loss';
import {learningTransaction} from './repository';
import {getServerConfig} from '../config';
import {scheduleLearningPayloadPurge,purgeLearningPayloads} from './retention';
import {enqueueLearningRetirement} from './invalidation';
import {markDueLearningReviews} from './refresh';
import {reconcileLearningLifecycle} from './lifecycle';
import {processLearningNativeRetirement} from './native-retirement';
/** Only deterministic settlement/cleanup. Unknown provider dispatch is never retried. */
export async function runLearningMaintenanceTick(options:{at?:Date;nativeRetirement?:boolean;attachSession?:AttachSessionFn}={}){
 const started=performance.now(),at=options.at??new Date();if(!Number.isFinite(at.getTime()))throw Error('Valid maintenance clock required');
 let ready=false,retired=0;
 // Give storage retirement a reserved lane before expensive dependency scans.
 if(options.nativeRetirement!==false)while(retired<10&&performance.now()-started<1000){if(!await processLearningNativeRetirement({attachSession:options.attachSession}))break;retired++;}
 let processed=await learningTransaction(async db=>{
  const env=getServerConfig().TURAS_ENVIRONMENT_ID;
  if(Number((await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[env])).rows[0]?.schema_version??0)<54)return 0;
  ready=true;await db.query("SELECT set_config('transaction_timeout',$1,true)",[`${Math.max(1,Math.floor(8000-(performance.now()-started)))}ms`]);
  let count=retired+await reconcileLearningActorLoss(db,at,25);
  const rows=(await db.query(`SELECT a.id,a.workspace_id,a.response_attempt_id,
   EXISTS(SELECT 1 FROM learning_budget_reservations reservation JOIN learning_model_dispatches dispatch ON dispatch.reservation_id=reservation.id LEFT JOIN learning_budget_settlements settlement ON settlement.reservation_id=reservation.id WHERE reservation.attempt_id=a.id AND settlement.id IS NULL) AS unknown
   FROM learning_attempts a WHERE a.environment_id=$1 AND a.state IN('prepared','admitted','running') AND (a.prepared_until<=$2 AND a.dispatch_at IS NULL OR a.deadline_at<=$2) ORDER BY coalesce(a.deadline_at,a.prepared_until),a.id FOR UPDATE OF a SKIP LOCKED LIMIT 25`,[env,at])).rows;
  for(const row of rows){if(performance.now()-started>=8000)break;
   await db.query("UPDATE learning_attempts SET state=$2,failure_code=$3,settled_at=$4,version=version+1 WHERE id=$1",[row.id,row.unknown?'unconfirmed':'failed',row.unknown?'accounting_unknown':'deadline_exceeded',at]);
   if(row.response_attempt_id)await db.query("UPDATE response_attempts SET response_state='failed',last_error_code=$2,updated_at=$3,revision=revision+1 WHERE id=$1 AND response_state IN('pending','running','stopping')",[row.response_attempt_id,row.unknown?'accounting_unknown':'deadline_exceeded',at]);
   await scheduleLearningPayloadPurge(db,row.id,'attempt','obsolete',at);await enqueueLearningRetirement(db,row.workspace_id,row.id,at);count++;
  }
  if(performance.now()-started<8000){
   const evaluations=(await db.query(`UPDATE learning_evaluations SET state='failed',version=version+1 WHERE id IN(SELECT id FROM learning_evaluations WHERE environment_id=$1 AND state IN('prepared','running','awaiting_review') AND deadline_at<=$2 ORDER BY deadline_at,id FOR UPDATE SKIP LOCKED LIMIT $3) RETURNING id`,[env,at,Math.min(25,100-count)])).rows;
   for(const row of evaluations)await scheduleLearningPayloadPurge(db,row.id,'evaluation','obsolete',at);count+=evaluations.length;
  }
  return count;
 });
 if(!ready)return {processed:0,durationMs:Math.ceil(performance.now()-started)};
 // Reserve the maximum cascade (one evaluation plus sixteen arms and eight reviews).
 while(processed<=75&&performance.now()-started<5000){const examined=await reconcileLearningLifecycle(at);if(!examined)break;processed+=examined;}
 processed+=await learningTransaction(async db=>{
  let count=processed;
  await db.query("SELECT set_config('transaction_timeout',$1,true)",[`${Math.max(1,Math.floor(9000-(performance.now()-started)))}ms`]);
  if(Number((await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]?.schema_version??0)<54)return 0;
  if(count<100&&performance.now()-started<8000){
   const released=await db.query(`INSERT INTO learning_reservation_releases(reservation_id,reason) SELECT r.id,'terminal_without_dispatch' FROM learning_budget_reservations r JOIN learning_attempts a ON a.id=r.attempt_id WHERE a.environment_id=$1 AND a.state IN('completed','failed','cancelled','unconfirmed','invalidated') AND NOT EXISTS(SELECT 1 FROM learning_model_dispatches d WHERE d.reservation_id=r.id) AND NOT EXISTS(SELECT 1 FROM learning_budget_settlements s WHERE s.reservation_id=r.id) AND NOT EXISTS(SELECT 1 FROM learning_reservation_releases release WHERE release.reservation_id=r.id) ORDER BY r.created_at,r.id LIMIT $2 ON CONFLICT(reservation_id) DO NOTHING RETURNING reservation_id`,[getServerConfig().TURAS_ENVIRONMENT_ID,Math.min(10,100-count)]);count+=released.rowCount??0;
  }
  if(count<100&&performance.now()-started<8000)count+=await markDueLearningReviews(db,at,Math.min(25,100-count));
  if(count<99&&performance.now()-started<8000)count+=await purgeLearningPayloads(db,Math.min(20,99-count));
  return count-processed;
 });
 if(options.nativeRetirement!==false)while(processed<100&&performance.now()-started<4000){if(!await processLearningNativeRetirement({attachSession:options.attachSession}))break;processed++;}
 return {processed,durationMs:Math.ceil(performance.now()-started)};
}
