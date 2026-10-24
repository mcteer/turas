import type {Client,PoolClient} from 'pg';
import {recoveryPostgresMajor,type RecoveryPostgresMajor} from './postgres-version';
import {currentRecoveryStateDigest} from './recovery-state';
import {recoveryLeasesOutstanding} from './recovery-drain';
import {recoveryGrantCheckpoint} from './grant-checkpoint';
import {recoveryContentDigest} from './recovery-content';
import {z} from 'zod';
/** Take the physical IO fence before establishing the repeatable-read snapshot.
 * Exported snapshots remain valid only while their transaction stays open. */
export async function withRecoveryDatabaseCheckpoint<T>(db:Client|PoolClient,input:{environmentId:string;recoveryId:string;controlRevision:number;signal:AbortSignal},capture:(boundary:{snapshot:string;capturedAt:string;currentStateDigest:string;runtimeGrantsDigest:string;acceptedContentDigest:string;serverMajor:RecoveryPostgresMajor;signal:AbortSignal})=>Promise<T>):Promise<T>{
 return withDatabaseCheckpoint(db,input,'locked-recovery',capture);
}
/** Routine backups take the same exclusive IO fence and require drained leases.
 * They never transition recovery control or manufacture a recovery verification.
 * A busy source fails its bounded capture instead of resuming uncertain work. */
export async function withScheduledDatabaseCheckpoint<T>(db:Client|PoolClient,input:{environmentId:string;recoveryId:string;controlRevision:number;signal:AbortSignal;scheduledNotBeforeCapturedAt?:string},capture:(boundary:{snapshot:string;capturedAt:string;currentStateDigest:string;runtimeGrantsDigest:string;acceptedContentDigest:string;serverMajor:RecoveryPostgresMajor;signal:AbortSignal})=>Promise<T>):Promise<T>{
 if(input.scheduledNotBeforeCapturedAt!==undefined)z.iso.datetime({offset:true}).parse(input.scheduledNotBeforeCapturedAt);
 return withDatabaseCheckpoint(db,input,'scheduled-backup',capture);
}
async function withDatabaseCheckpoint<T>(db:Client|PoolClient,input:{environmentId:string;recoveryId:string;controlRevision:number;signal:AbortSignal;scheduledNotBeforeCapturedAt?:string},purpose:'locked-recovery'|'scheduled-backup',capture:(boundary:{snapshot:string;capturedAt:string;currentStateDigest:string;runtimeGrantsDigest:string;acceptedContentDigest:string;serverMajor:RecoveryPostgresMajor;signal:AbortSignal})=>Promise<T>):Promise<T>{
 if(purpose!=='scheduled-backup'&&input.scheduledNotBeforeCapturedAt!==undefined)throw Error('Scheduled capture time cannot alter recovery');
 input.signal.throwIfAborted();let held=false,transaction=false;
 try{
  // READ COMMITTED admission cannot freeze a view from before drained cleanup.
  await db.query('BEGIN');transaction=true;await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='5000ms'");
  if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw Error('Capture requires owner authority');
  await db.query('SELECT pg_advisory_lock(hashtextextended($1,16017))',[input.environmentId]);held=true;
  await db.query('COMMIT');transaction=false;input.signal.throwIfAborted();
  // The session fence survives COMMIT. Every subsequent snapshot is post-drain.
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');transaction=true;
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='5000ms'");
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  const serverVersion=Number((await db.query("SELECT current_setting('server_version_num')::int AS version")).rows[0].version);const serverMajor=recoveryPostgresMajor(serverVersion);
  if(marker.length!==1||marker[0].environment_id!==input.environmentId||Number(marker[0].schema_version)!==79)throw Error('Capture target differs');
  const control=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1 FOR UPDATE',[input.environmentId])).rows[0];
  if(purpose==='locked-recovery'?(control?.mode!=='locked'||Number(control.revision)!==input.controlRevision||control.recovery_id!==input.recoveryId):(control?.mode!=='open'||Number(control.revision)!==input.controlRevision))throw Error(purpose==='locked-recovery'?'Exact locked capture boundary required':'Exact open scheduled capture boundary required');
  if(await recoveryLeasesOutstanding(db))throw Error('Capture lease drain remains incomplete');
  const currentStateDigest=await currentRecoveryStateDigest(db),runtimeGrantsDigest=await recoveryGrantCheckpoint(db),acceptedContentDigest=await recoveryContentDigest(db),row=(await db.query('SELECT pg_export_snapshot() AS snapshot,clock_timestamp() AS captured_at')).rows[0];
  if(!/^[a-fA-F0-9-]{1,128}$/.test(row.snapshot))throw Error('Database snapshot identity unavailable');
  if(input.scheduledNotBeforeCapturedAt!==undefined&&row.captured_at.getTime()<Date.parse(input.scheduledNotBeforeCapturedAt))throw Error('Scheduled snapshot precedes authorized capture time');
  input.signal.throwIfAborted();const result=await capture({snapshot:row.snapshot,capturedAt:row.captured_at.toISOString(),currentStateDigest,runtimeGrantsDigest,acceptedContentDigest,serverMajor,signal:input.signal});input.signal.throwIfAborted();
  await db.query('COMMIT');transaction=false;return result;
 }finally{
  try{if(transaction)await db.query('ROLLBACK');}
  finally{if(held&&(await db.query('SELECT pg_advisory_unlock(hashtextextended($1,16017)) AS released',[input.environmentId])).rows[0]?.released!==true)throw Error('Capture fence release unverified');}
 }
}
