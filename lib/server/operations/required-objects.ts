import type {Client,PoolClient} from 'pg';
import {objectKey,validateExpected,type ObjectDescriptor,type ObjectNamespace} from '../storage/private-objects';
import {activeObjectNamespaces} from '../storage/inventory';

/** Read only under the caller's matched database checkpoint. Physical listing
 * alone cannot prove that the originals referenced by live ledgers still exist. */
export async function requiredRecoveryObjects(db:Client|PoolClient,environmentId:string,asOf?:Date){
 if(asOf!==undefined&&!Number.isFinite(asOf.getTime()))throw Error('Exact required-object observation time required');
 const rows=(await db.query(`
 SELECT 'artifact' AS namespace,object_key::text AS object_id,sha256_digest AS digest,actual_size_bytes AS size_bytes
 FROM artifact_versions WHERE environment_id=$1 AND state NOT IN('cancelled','deleting','deleted')
 UNION ALL SELECT 'artifact-staging',staged_key,staged_sha256_digest,staged_actual_size_bytes
 FROM artifact_upload_intents WHERE environment_id=$1 AND state IN('uploading','staged') AND expires_at>COALESCE($2::timestamptz,clock_timestamp()) AND staged_key IS NOT NULL
 UNION ALL SELECT 'workforce',v.object_key,v.content_digest,v.byte_size
 FROM workforce_source_versions v JOIN workforce_sources s ON s.id=v.source_id AND s.environment_id=v.environment_id
 JOIN workforce_source_payloads p ON p.revision_id=v.id
 WHERE v.environment_id=$1 AND s.state NOT IN('cancelled','withdrawn','deleting','deleted')
 UNION ALL SELECT 'workforce-staging',staged_object_key::text,uploaded_digest,received_bytes
 FROM workforce_import_intents WHERE environment_id=$1 AND state='uploaded' AND expires_at>COALESCE($2::timestamptz,clock_timestamp()) AND staged_object_key IS NOT NULL
 UNION ALL SELECT 'report',object_key::text,content_digest,size_bytes
 FROM report_store_objects WHERE environment_id=$1 AND state IN('staged','finalized')
 UNION ALL SELECT 'gap-report',object_key::text,content_digest,size_bytes
 FROM gap_report_store_objects WHERE environment_id=$1 AND state IN('staged','attached','quarantined')
 LIMIT 100001`,[environmentId,asOf??null])).rows;
 if(rows.length>100000)throw Error('Required object ledger exceeds bound');
 const objects=new Map<string,ObjectDescriptor>();
 for(const row of rows){
  if(!activeObjectNamespaces.includes(row.namespace))throw Error('Required object namespace differs');
  const key=objectKey(environmentId,row.namespace as ObjectNamespace,row.object_id),object={key,digest:row.digest,sizeBytes:Number(row.size_bytes)};
  validateExpected(object,10485760);
  const prior=objects.get(key);if(prior&&(prior.digest!==object.digest||prior.sizeBytes!==object.sizeBytes))throw Error('Required object ledger identity collision');
  objects.set(key,object);
 }
 return [...objects.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
}
