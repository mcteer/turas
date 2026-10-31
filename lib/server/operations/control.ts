import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import {currentRecoveryStateDigest} from './recovery-state';
import {recoveryLeasesOutstanding} from './recovery-drain';
import {createHash} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
const commandSchema=z.strictObject({environmentId:z.string().min(1).max(256),expectedRevision:z.number().int().positive(),recoveryId:z.uuid(),operationId:z.uuid(),mode:z.enum(['quiescing','locked','open']),restartVerification:z.literal(true).optional(),verifiedBundleDigest:z.string().regex(/^[a-f0-9]{64}$/).optional()});
export type RecoveryControlCommand=z.infer<typeof commandSchema>;
/** This connection must be independently supplied owner authority. Actor labels and runtime DTOs confer no privilege. */
export async function transitionRecoveryControl(db:Client|PoolClient,raw:RecoveryControlCommand){
 const input=commandSchema.parse(raw),operationDigest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='5000ms'");
  const authority=(await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0];
  if(authority?.owner!==true)throw Error('Recovery requires database owner authority');
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!==input.environmentId||marker[0].schema_version!==CURRENT_SCHEMA_VERSION)throw Error('Recovery target identity differs');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[input.environmentId]);
  if(input.mode!=='quiescing')await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[input.environmentId]);
  const replay=(await db.query('SELECT * FROM operations_control_transitions WHERE id=$1',[input.operationId])).rows[0];
  if(replay){if(replay.environment_id!==input.environmentId||replay.operation_digest!==operationDigest)throw Error('Recovery operation replay differs');await db.query('COMMIT');return {mode:replay.to_mode,revision:Number(replay.revision),recoveryId:replay.recovery_id,replayed:true};}
  const current=(await db.query('SELECT * FROM operations_control WHERE environment_id=$1 FOR UPDATE',[input.environmentId])).rows[0];
  if(!current||Number(current.revision)!==input.expectedRevision)throw Error('Recovery control revision changed');
  const restarting=input.restartVerification===true;
  if(restarting&&(current.mode!=='locked'||input.mode!=='locked'||input.verifiedBundleDigest))throw Error('Explicit locked deny-only verification restart required');
  if(restarting&&!(await db.query('SELECT 1 FROM operations_recovery_verifications WHERE environment_id=$1 AND recovery_id=$2 AND control_revision=$3 LIMIT 1',[input.environmentId,input.recoveryId,input.expectedRevision])).rowCount)throw Error('Prior committed verification required for a new verification attempt');
  if(!(restarting||current.mode==='open'&&input.mode==='quiescing'||current.mode==='quiescing'&&input.mode==='locked'||current.mode==='locked'&&input.mode==='open'))throw Error('Recovery transition denied');
  if(current.mode!=='open'&&current.recovery_id!==input.recoveryId)throw Error('Recovery identity differs');
  if(input.mode!=='quiescing'){
   const active=(await db.query(`SELECT EXISTS(SELECT 1 FROM operations_local_jobs WHERE environment_id=$1 AND state IN('running','reconciling'))
    OR EXISTS(SELECT 1 FROM operations_hosted_jobs WHERE environment_id=$1 AND state IN('admitted','starting','running','reconciling'))
    OR EXISTS(SELECT 1 FROM artifact_upload_intents WHERE environment_id=$1 AND state IN('uploading','staged') AND expires_at>clock_timestamp())
    OR EXISTS(SELECT 1 FROM workforce_import_intents WHERE environment_id=$1 AND state IN('uploading','uploaded') AND expires_at>clock_timestamp())
    OR EXISTS(SELECT 1 FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE c.environment_id=$1 AND a.response_state IN('pending','running','stopping'))
    OR EXISTS(SELECT 1 FROM operations_upload_capabilities WHERE environment_id=$1 AND expires_at>clock_timestamp()) AS active`,[input.environmentId])).rows[0].active;
   if(active||await recoveryLeasesOutstanding(db))throw Error('Recovery drain remains incomplete');
  }
  if(input.mode==='open'){
   if((await db.query(`SELECT 1 FROM operations_recovery_quarantines q WHERE q.environment_id=$1
    AND NOT EXISTS(SELECT 1 FROM operations_recovery_quarantine_resolutions r JOIN operations_recovery_verifications v ON v.id=r.verification_id
     WHERE r.environment_id=q.environment_id AND r.recovery_id=q.recovery_id AND r.scope_kind=q.scope_kind
     AND v.environment_id=$1 AND v.recovery_id=$2 AND v.control_revision=$3 AND v.bundle_digest=$4
     AND v.verified_at>clock_timestamp()-interval '30 minutes' AND v.verified_at<=clock_timestamp()
     AND v.required_scope_healthy AND v.integrity_verified AND v.denial_verified AND v.replay_verified AND v.workflow_verified)
    LIMIT 1`,[input.environmentId,input.recoveryId,input.expectedRevision,input.verifiedBundleDigest??null])).rowCount)throw Error('Required recovery scopes remain quarantined');
   if(!input.verifiedBundleDigest)throw Error('Recovery integrity and current-authority verification required');
   const verified=(await db.query(`SELECT current_state_digest FROM operations_recovery_verifications WHERE environment_id=$1 AND recovery_id=$2 AND control_revision=$3
    AND bundle_digest=$4 AND verified_at>clock_timestamp()-interval '30 minutes' AND verified_at<=clock_timestamp()
    AND required_scope_healthy AND integrity_verified AND denial_verified AND replay_verified AND workflow_verified`,[input.environmentId,input.recoveryId,input.expectedRevision,input.verifiedBundleDigest])).rows;
   if(verified.length!==1)throw Error('Recovery integrity and current-authority verification required');
   if(verified[0].current_state_digest!==await currentRecoveryStateDigest(db))throw Error('Recovery verified state changed');
  }else if(input.verifiedBundleDigest)throw Error('A capture fence cannot assert recovery verification');
  const revision=input.expectedRevision+1;
  await db.query(`UPDATE operations_control SET mode=$2,revision=$3,recovery_id=$4,owner_operation_digest=$5,verified_bundle_digest=$6,updated_at=clock_timestamp() WHERE environment_id=$1`,[input.environmentId,input.mode,revision,input.recoveryId,operationDigest,input.verifiedBundleDigest??null]);
  await db.query(`INSERT INTO operations_control_transitions(id,environment_id,from_mode,to_mode,revision,recovery_id,operation_digest,bundle_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[input.operationId,input.environmentId,current.mode,input.mode,revision,input.recoveryId,operationDigest,input.verifiedBundleDigest??null]);
  await db.query('COMMIT');return {mode:input.mode,revision,recoveryId:input.recoveryId,replayed:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
