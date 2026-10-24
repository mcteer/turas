import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
import {currentRecoveryStateDigest} from './recovery-state';

const command=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),verificationId:z.uuid()});
/** Resolve holds against an existing complete owner verification, preserving
 * their immutable history. This neither creates proof nor opens service. */
export async function resolveRecoveryQuarantines(db:Client|PoolClient,raw:z.infer<typeof command>){
 const input=command.parse(raw);await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='10000ms'");await db.query("SET LOCAL transaction_timeout='60s'");
  if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw Error('Recovery resolution requires actual owner authority');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[input.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[input.environmentId]);
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!==input.environmentId||Number(marker[0].schema_version)!==79)throw Error('Recovery resolution target differs');
  const control=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1 FOR UPDATE',[input.environmentId])).rows[0];
  if(control?.mode!=='locked'||Number(control.revision)!==input.controlRevision||control.recovery_id!==input.recoveryId)throw Error('Exact locked recovery resolution required');
  const verified=(await db.query(`SELECT id,current_state_digest FROM operations_recovery_verifications WHERE id=$1 AND environment_id=$2 AND recovery_id=$3 AND control_revision=$4
   AND verified_at>clock_timestamp()-interval '30 minutes' AND verified_at<=clock_timestamp()
   AND required_scope_healthy AND integrity_verified AND denial_verified AND replay_verified AND workflow_verified FOR SHARE`,[input.verificationId,input.environmentId,input.recoveryId,input.controlRevision])).rows;
  if(verified.length!==1)throw Error('Fresh complete recovery verification required');
  if(verified[0].current_state_digest!==await currentRecoveryStateDigest(db))throw Error('Recovery verified state changed');
  const result=await db.query(`INSERT INTO operations_recovery_quarantine_resolutions(environment_id,recovery_id,scope_kind,verification_id)
   SELECT environment_id,recovery_id,scope_kind,$2 FROM operations_recovery_quarantines WHERE environment_id=$1
   ON CONFLICT(environment_id,recovery_id,scope_kind,verification_id) DO NOTHING RETURNING scope_kind`,[input.environmentId,input.verificationId]);
  const resolved=(await db.query('SELECT recovery_id,scope_kind FROM operations_recovery_quarantine_resolutions WHERE environment_id=$1 AND verification_id=$2 ORDER BY recovery_id,scope_kind',[input.environmentId,input.verificationId])).rows;
  await db.query('COMMIT');return {contract:'pilot-quarantine-resolution-v1' as const,...input,newlyResolved:result.rowCount??0,resolved,quarantineHistoryRetained:true,serviceOpened:false,restorationReady:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
