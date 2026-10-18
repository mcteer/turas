import {createHash,randomUUID} from 'node:crypto';
import {query} from '../db/client';
import {optionalOperationalCodeVersion} from './code-version';
import {environmentObjectId,validateObjectKey,type ObjectDescriptor} from '../storage/private-objects';
import type {PoolClient} from 'pg';
import {activeObjectNamespaces} from '../storage/inventory';
export function privateStoreBinding(environmentId:string,storeId:string){
 const id=storeId.replace(/^store_/,'');if(!/^[A-Za-z0-9-]{1,128}$/.test(id))throw Error('Exact private store identity required');
 return createHash('sha256').update(JSON.stringify({contract:'pilot-store-binding-v1',environmentId,storeId:id})).digest('hex');
}
/** Wired only to application adapters after an immutable PUT and uncached,
 * digest-verified GET. The independent backup adapter has no application hook. */
export function privateStoreObserver(environmentId:string,env:NodeJS.ProcessEnv=process.env){
 const version=optionalOperationalCodeVersion(env),storeId=env.BLOB_STORE_ID;
 if(!version||!storeId)return undefined;
 const binding=privateStoreBinding(environmentId,storeId);
 return async(object:ObjectDescriptor)=>{
  const namespace=validateObjectKey(object.key,environmentObjectId(environmentId));
  if(namespace==='backup')throw Error('Application store observation scope differs');
  const marker=(await query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!==environmentId)throw Error('Store observation environment differs');
  if(Number(marker[0].schema_version)<79)return;
  if(Number(marker[0].schema_version)!==79)throw Error('Store observation schema differs');
  const keyDigest=createHash('sha256').update(object.key).digest('hex');
  const proof=createHash('sha256').update(JSON.stringify({contract:'pilot-verified-private-write-v1',keyDigest,digest:object.digest,sizeBytes:object.sizeBytes})).digest('hex');
  await query('INSERT INTO operations_store_observations(id,environment_id,namespace,store_binding_digest,code_version,proof_digest) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),environmentId,namespace,binding,version,proof]);
 };
}
/** SQL-only observation read. Polling never performs paid Blob operations or
 * fabricates a sample. All six namespaces require current-deployment proof. */
export async function readPrivateStoreHealth(db:PoolClient,environmentId:string,codeVersion:string,env:NodeJS.ProcessEnv=process.env){
 if(env.TURAS_PRIVATE_OBJECT_BACKEND!=='blob'||!env.BLOB_STORE_ID)return 'unverified' as const;
 const binding=privateStoreBinding(environmentId,env.BLOB_STORE_ID);
 const rows=(await db.query(`SELECT DISTINCT namespace FROM operations_store_observations WHERE environment_id=$1 AND store_binding_digest=$2 AND code_version=$3
  AND sampled_at>COALESCE((SELECT max(created_at) FROM operations_control_transitions WHERE environment_id=$1 AND to_mode='locked'),'-infinity'::timestamptz)
  AND sampled_at<=clock_timestamp() AND sampled_at>clock_timestamp()-interval '24 hours'`,[environmentId,binding,codeVersion])).rows;
 return activeObjectNamespaces.every(namespace=>rows.some(row=>row.namespace===namespace))?'healthy' as const:'unverified' as const;
}
