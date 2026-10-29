import {activeRecoveryLeaseStateSql} from './recovery-drain';
import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
import {requiredRecoveryObjects} from './required-objects';
import {recoveryDigest} from '../../contracts/pilot-recovery';

const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const databaseSafetyBoundarySchema=z.strictObject({
 contract:z.literal('pilot-database-safety-boundary-v1'),capturedAt:z.iso.datetime({offset:true}),
 requiredObjectsDigest:z.string().regex(/^[a-f0-9]{64}$/),requiredObjectCount:count.max(100000),requiredObjectBytes:count.max(1024**4),
 leaseInventoryDigest:z.string().regex(/^[a-f0-9]{64}$/),activeLeaseCount:count,pendingUploadCount:count,dispatchingDeliveryCount:count,
 externalAdmissionVerified:z.literal(false),privateBytesVerified:z.literal(false),fullServiceCheckpoint:z.literal(false),
});
/** Observations from the same exported read-only snapshot, not a claim that old
 * workers are fenced or private bytes exist. A signed capture time makes expiry
 * predicates reproducible on the cold restore without extending any authority. */
export async function readDatabaseSafetyBoundary(db:Client|PoolClient,environmentId:string,asOf?:Date,signal=AbortSignal.timeout(60000)){
 signal.throwIfAborted();
 const state=(await db.query("SELECT current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,transaction_timestamp() AS captured_at")).rows[0];
 if(state?.read_only!=='on'||!['repeatable read','serializable'].includes(state.isolation))throw Error('Read-only repeatable database safety boundary required');
 const capturedAt=asOf??state.captured_at;
 if(!(capturedAt instanceof Date)||!Number.isFinite(capturedAt.getTime()))throw Error('Exact database safety observation time required');
 signal.throwIfAborted();
 const marker=(await db.query("SELECT environment_id,schema_version,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_environment'::regclass)) AS owner FROM turas_environment")).rows;
 if(marker.length!==1||marker[0].environment_id!==environmentId||![77,79,80].includes(Number(marker[0].schema_version))||marker[0].owner!==true)throw Error('Exact current safety boundary owner required');
 signal.throwIfAborted();
 const objects=await requiredRecoveryObjects(db,environmentId,capturedAt);
 signal.throwIfAborted();
 const columns=(await db.query(`SELECT c.table_name,c.column_name,EXISTS(SELECT 1 FROM information_schema.columns s WHERE s.table_schema='public' AND s.table_name=c.table_name AND s.column_name='state') AS has_state
 FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
 WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.column_name IN('lease_until','lease_expires_at') ORDER BY c.table_name,c.column_name`)).rows;
 if(!columns.length||columns.length>100||columns.some(c=>!/^[a-z_][a-z0-9_]*$/.test(c.table_name)||!['lease_until','lease_expires_at'].includes(c.column_name)))throw Error('Safety lease inventory unavailable');
 const leases=[];
 for(const c of columns){
  signal.throwIfAborted();
  const row=(await db.query(`SELECT count(*)::text AS count FROM public."${c.table_name}" WHERE "${c.column_name}">$1::timestamptz${activeRecoveryLeaseStateSql(c.table_name,c.has_state)}`,[capturedAt])).rows[0];
  leases.push({table:c.table_name,column:c.column_name,count:Number(row.count)});
 }
 signal.throwIfAborted();
 const writes=(await db.query(`SELECT
 (SELECT count(*) FROM artifact_upload_intents WHERE environment_id=$1 AND state IN('uploading','staged') AND expires_at>$2::timestamptz)+
 (SELECT count(*) FROM workforce_import_intents WHERE environment_id=$1 AND state IN('uploading','uploaded') AND expires_at>$2::timestamptz) AS uploads,
 (SELECT count(*) FROM report_deliveries WHERE environment_id=$1 AND state='dispatching') AS deliveries`,[environmentId,capturedAt])).rows[0];
 signal.throwIfAborted();
 return databaseSafetyBoundarySchema.parse({contract:'pilot-database-safety-boundary-v1',capturedAt:capturedAt.toISOString(),requiredObjectsDigest:recoveryDigest(objects),requiredObjectCount:objects.length,requiredObjectBytes:objects.reduce((sum,o)=>sum+o.sizeBytes,0),leaseInventoryDigest:recoveryDigest(leases),activeLeaseCount:leases.reduce((sum,l)=>sum+l.count,0),pendingUploadCount:Number(writes.uploads),dispatchingDeliveryCount:Number(writes.deliveries),externalAdmissionVerified:false,privateBytesVerified:false,fullServiceCheckpoint:false});
}
