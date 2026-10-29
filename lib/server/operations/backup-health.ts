import type {Client,PoolClient} from 'pg';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {privateStoreBinding} from './store-observations';
/** Called only after actual cold authentication, provenance verification,
 * temporary cleanup and settlement of both independent operator reservations.
 * The database owner records it; application runtime cannot assert backup proof.
 * This observation is not scheduled cadence, current denials, or restore proof. */
export async function recordVerifiedBackup(db:Client,input:{archiveId:string;environmentId:string;storeId:string;sourceCommit:string;capturedAt:string;encryptedDigest:string;candidateDigest:string;reservationIds:string[]}){
 if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_backup_observations'::regclass")).rows[0]?.owner!==true)throw Error('Backup observation requires source owner');
 const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
 if(marker.length!==1||marker[0].environment_id!==input.environmentId||Number(marker[0].schema_version)!==80)throw Error('Backup observation source differs');
 const proof=recoveryDigest({contract:'pilot-cold-backup-observation-v1',encryptedDigest:input.encryptedDigest,candidateDigest:input.candidateDigest,reservationIds:input.reservationIds});
 const values=[input.archiveId,input.environmentId,privateStoreBinding(input.environmentId,input.storeId),input.sourceCommit,proof,input.capturedAt];
 await db.query('INSERT INTO operations_backup_observations(id,environment_id,store_binding_digest,code_version,proof_digest,captured_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',values);
 const row=(await db.query('SELECT environment_id,store_binding_digest,code_version,proof_digest,captured_at FROM operations_backup_observations WHERE id=$1',[input.archiveId])).rows[0];
 if(!row||JSON.stringify([row.environment_id,row.store_binding_digest,row.code_version,row.proof_digest,row.captured_at.toISOString()])!==JSON.stringify(values.slice(1)))throw Error('Backup observation replay differs');
}
export async function readVerifiedBackupHealth(db:PoolClient,environmentId:string,codeVersion:string,env:NodeJS.ProcessEnv=process.env){
 if(env.TURAS_PRIVATE_OBJECT_BACKEND!=='blob'||!env.BLOB_STORE_ID)return 'unverified' as const;
 const observed=(await db.query(`SELECT 1 FROM operations_backup_observations WHERE environment_id=$1 AND store_binding_digest=$2 AND code_version=$3
  AND sampled_at<=clock_timestamp() AND captured_at<=clock_timestamp() AND captured_at>clock_timestamp()-interval '24 hours'
  AND captured_at>COALESCE((SELECT max(created_at) FROM operations_control_transitions WHERE environment_id=$1 AND to_mode='locked'),'-infinity'::timestamptz)
  LIMIT 1`,[environmentId,privateStoreBinding(environmentId,env.BLOB_STORE_ID),codeVersion])).rowCount;
 return observed?'healthy' as const:'unverified' as const;
}
