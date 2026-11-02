import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import type {Client,PoolClient} from 'pg';
import type {z} from 'zod';
import type {recoveryDenialSnapshotSchema} from './recovery-denial-snapshot';
// Preserve PostgreSQL microseconds and normalize offsets, rather than truncating
// authoritative metadata through JavaScript Date millisecond decoding.
function instantMicros(value:unknown){
 const m=typeof value==='string'?value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/):null;
 if(!m)throw Error('Exact PostgreSQL named-content timestamp required');
 const ms=Date.parse(m[1]+'T'+m[2]+m[4]);if(!Number.isFinite(ms))throw Error('Exact PostgreSQL named-content timestamp required');
 return BigInt(ms)*1000n+BigInt((m[3]??'').padEnd(6,'0'));
}
/** Caller retains the actual owner/control/authority fences and transaction.
 * Never invent pruned names, upgrade legacy coverage, or modify Native history.
 * A stale restore may remain closed as legacy_gap; complete coverage may resume
 * only when its exact append-only metadata matches the authenticated source. */
export async function assertRestoredNamedContentSafety(db:Client|PoolClient,snapshot:z.infer<typeof recoveryDenialSnapshotSchema>,environmentId:string){
 const rows=(await db.query(`SELECT h.conversation_id,h.coverage,to_jsonb(h.recorded_at)#>>'{}' AS recorded_at FROM ordinary_named_content_coverage h
  JOIN conversations c ON c.id=h.conversation_id WHERE c.environment_id=$1 ORDER BY h.conversation_id LIMIT 10001`,[environmentId])).rows;
 if(rows.length>10000||rows.some(r=>!['complete','legacy_gap'].includes(r.coverage)))throw Error('Bounded restored named-content coverage required');
 const complete=rows.filter(r=>r.coverage==='complete').map(r=>String(r.conversation_id));
 if(!complete.length)return {completeConversations:0,legacyGapConversations:rows.length,activeNamedContentVerified:true,authorityGranted:false};
 if(!(snapshot.schemaVersion>=80&&snapshot.schemaVersion<=CURRENT_SCHEMA_VERSION))throw Error('Historical snapshot cannot establish complete named-content coverage');
 const coverage=snapshot.tables.find(t=>t.name==='ordinary_named_content_coverage'),dependencies=snapshot.tables.find(t=>t.name==='ordinary_named_content_dependencies');
 if(!coverage||!dependencies)throw Error('Complete named-content source inventory required');
 const sourceCoverage=new Map(coverage.rows.map(r=>[String(r.identity.conversation_id),r.status]));
 if(rows.filter(r=>r.coverage==='complete').some(row=>sourceCoverage.get(row.conversation_id)?.coverage!=='complete'||instantMicros(row.recorded_at)!==instantMicros(sourceCoverage.get(row.conversation_id)?.recorded_at)))throw Error('Restored named-content coverage cannot exceed current source authority');
 const actual=(await db.query(`SELECT d.conversation_id,d.scope_key,d.citation_id,d.customer_id,d.first_attempt_id,to_jsonb(d.consumed_at)#>>'{}' AS consumed_at
  FROM ordinary_named_content_dependencies d WHERE d.conversation_id=ANY($1::uuid[])
  ORDER BY d.conversation_id,d.scope_key,d.citation_id LIMIT 10001`,[complete])).rows;
 if(actual.length>10000)throw Error('Bounded restored named-content history required');
 const included=new Set(complete),expected=dependencies.rows.filter(r=>included.has(String(r.identity.conversation_id)));
 const key=(r:Record<string,unknown>)=>JSON.stringify([r.conversation_id,r.scope_key,r.citation_id]);
 const local=new Map(actual.map(r=>[key(r),r]));
 if(local.size!==actual.length||actual.length!==expected.length)throw Error('Restored named-content history is incomplete; keep legacy coverage closed');
 for(const row of expected){const found=local.get(key(row.identity)),s=row.status;
  if(!found||found.customer_id!==s.customer_id||found.first_attempt_id!==s.first_attempt_id||!Number.isFinite(Date.parse(String(s.consumed_at)))||instantMicros(found.consumed_at)!==instantMicros(s.consumed_at))throw Error('Restored named-content dependency differs; no inferred history');
 }
 return {completeConversations:complete.length,legacyGapConversations:rows.length-complete.length,activeNamedContentVerified:true,authorityGranted:false};
}
/** Deny-only owner reconciliation: append exact authenticated later dependency
 * metadata, never fact bodies or inferred names, and never upgrade coverage.
 * The caller has already verified the snapshot and holds owner/control fences. */
export async function reconcileRestoredNamedContentSafety(db:Client|PoolClient,snapshot:z.infer<typeof recoveryDenialSnapshotSchema>,environmentId:string){
 await db.query('SAVEPOINT named_content_reconciliation');await db.query('RELEASE SAVEPOINT named_content_reconciliation');
 const owner=(await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0];
 if(owner?.owner!==true)throw Error('Named-content reconciliation requires the actual recovery owner');
 const coverage=(await db.query(`SELECT h.conversation_id,h.coverage,to_jsonb(h.recorded_at)#>>'{}' AS recorded_at FROM ordinary_named_content_coverage h
  JOIN conversations c ON c.id=h.conversation_id WHERE c.environment_id=$1 ORDER BY h.conversation_id LIMIT 10001`,[environmentId])).rows;
 if(coverage.length>10000)throw Error('Bounded restored named-content coverage required');
 const complete=coverage.filter(r=>r.coverage==='complete').map(r=>String(r.conversation_id));let appended=0;
 if(complete.length){
  if(!(snapshot.schemaVersion>=80&&snapshot.schemaVersion<=CURRENT_SCHEMA_VERSION))throw Error('Historical snapshot cannot establish complete named-content coverage');
  const sourceCoverage=snapshot.tables.find(t=>t.name==='ordinary_named_content_coverage'),dependencies=snapshot.tables.find(t=>t.name==='ordinary_named_content_dependencies');
  if(!sourceCoverage||!dependencies)throw Error('Complete named-content source inventory required');
  const source=new Map(sourceCoverage.rows.map(r=>[String(r.identity.conversation_id),r.status]));
  if(coverage.filter(r=>r.coverage==='complete').some(row=>source.get(row.conversation_id)?.coverage!=='complete'||instantMicros(row.recorded_at)!==instantMicros(source.get(row.conversation_id)?.recorded_at)))throw Error('Restored named-content coverage cannot exceed current source authority');
  const included=new Set(complete),expected=dependencies.rows.filter(r=>included.has(String(r.identity.conversation_id)));
  const key=(r:Record<string,unknown>)=>JSON.stringify([r.conversation_id,r.scope_key,r.citation_id]);
  const expectedMap=new Map(expected.map(r=>[key(r.identity),r]));
  const actual=(await db.query(`SELECT d.conversation_id,d.scope_key,d.citation_id,d.customer_id,d.first_attempt_id,to_jsonb(d.consumed_at)#>>'{}' AS consumed_at
   FROM ordinary_named_content_dependencies d WHERE d.conversation_id=ANY($1::uuid[])
   ORDER BY d.conversation_id,d.scope_key,d.citation_id LIMIT 10001`,[complete])).rows;
  if(actual.length>10000)throw Error('Bounded restored named-content history required');
  for(const row of actual){const expected=expectedMap.get(key(row));if(!expected||row.customer_id!==expected.status.customer_id||row.first_attempt_id!==expected.status.first_attempt_id||instantMicros(row.consumed_at)!==instantMicros(expected.status.consumed_at))throw Error('Restored named-content conflicts with authenticated source; no rewrite');}
  const present=new Set(actual.map(key)),missing=expected.filter(r=>!present.has(key(r.identity))).map(r=>({conversation_id:r.identity.conversation_id,customer_id:r.status.customer_id,citation_id:r.identity.citation_id,first_attempt_id:r.status.first_attempt_id,consumed_at:r.status.consumed_at}));
  for(let start=0;start<missing.length;start+=256){const batch=missing.slice(start,start+256),json=JSON.stringify(batch);if(Buffer.byteLength(json)>1048576)throw Error('Named-content recovery batch exceeds bound');
   appended+=(await db.query(`INSERT INTO ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id,consumed_at)
    SELECT conversation_id,customer_id,citation_id,first_attempt_id,consumed_at FROM jsonb_to_recordset($1::jsonb)
    AS d(conversation_id uuid,customer_id uuid,citation_id text,first_attempt_id uuid,consumed_at timestamptz)
    ON CONFLICT(conversation_id,scope_key,citation_id) DO NOTHING`,[json])).rowCount??0;
  }
 }
 return {...await assertRestoredNamedContentSafety(db,snapshot,environmentId),authenticatedDependencyMetadataAppended:appended};
}
