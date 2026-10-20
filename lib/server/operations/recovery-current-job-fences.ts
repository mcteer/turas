import type {Client} from 'pg';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {isWorkRecoveryDecisionClient,requireLockedWorkRecoveryConnection,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {recoveryJobReplayTables,requireRecoveryJobReplayColumns} from './recovery-job-replay-keys';
async function currentKeys(db:Client,target:LockedWorkRecoveryTarget){
 const observed:{name:string;keys:{columns:string[];digest:string}[]}[]=[];
 for(const name of recoveryJobReplayTables){
  await db.query('LOCK TABLE public."'+name+'" IN SHARE MODE');
  const indexes=(await db.query(`SELECT array_agg(a.attname::text ORDER BY a.attname) AS columns FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinal) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=$1::regclass AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AND k.ordinal<=i.indnkeyatts GROUP BY i.indexrelid`,['public.'+name])).rows.map(row=>row.columns as string[]);
  const keys=[...new Map([...indexes,...await requireRecoveryJobReplayColumns(db,name)].map(key=>[JSON.stringify(key),key])).values()];
  const filter=name==='report_jobs'?" AND r.kind='render'":name==='retrieval_jobs'?" AND r.kind='index'":'';
  const rows=(await db.query(`SELECT item.columns,encode(sha256(convert_to(candidate.value::text,'UTF8')),'hex') AS digest FROM public."${name}" r CROSS JOIN jsonb_array_elements($2::jsonb) item(columns) CROSS JOIN LATERAL (SELECT jsonb_object_agg(e.key,e.value ORDER BY e.key) AS value FROM jsonb_each(to_jsonb(r)) e WHERE item.columns ? e.key) candidate WHERE r.environment_id=$1${filter} AND NOT EXISTS(SELECT 1 FROM jsonb_each(candidate.value) e WHERE e.value='null'::jsonb) LIMIT 100001`,[target.environmentId,JSON.stringify(keys)])).rows;
  if(rows.length>100000)throw Error('Current positive job identity bound exceeded');observed.push({name,keys:rows});
 }
 return observed;
}
/** Separate deny-only owner action for originals present in the restored DB but
 * absent from newer retained source metadata. Actual SQL, never caller keys. */
export async function fenceCurrentRecoveryJobs(db:Client,target:LockedWorkRecoveryTarget,retained:RetainedWorkDenials){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine current job fencing owner required');await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 const source=requireAuthenticatedRetainedDenials(retained,target.environmentId),observed=await currentKeys(db,target),digest=recoveryDigest({contract:'pilot-current-job-denials-v1',source:source.contextDigest,observed});
 for(const table of observed)await db.query(`INSERT INTO operations_replay_fences(environment_id,table_name,key_columns,key_digest,snapshot_digest,source_captured_at,recovery_id,control_revision) SELECT $1,$2,ARRAY(SELECT jsonb_array_elements_text(item.columns)),item.digest,$4,clock_timestamp(),$5,$6 FROM jsonb_to_recordset($3::jsonb) item(columns jsonb,digest text) ON CONFLICT(environment_id,table_name,key_columns,key_digest) DO NOTHING`,[target.environmentId,table.name,JSON.stringify(table.keys),digest,target.recoveryId,target.controlRevision]);
 requireAuthenticatedRetainedDenials(retained,target.environmentId);return {currentJobDenialDigest:digest};
}
export async function requireCurrentRecoveryJobFences(db:Client,target:LockedWorkRecoveryTarget){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine current job fence auditor required');
 const observed=await currentKeys(db,target);
 for(const table of observed){const n=(await db.query(`SELECT count(*)::int AS n FROM jsonb_to_recordset($1::jsonb) item(columns jsonb,digest text) WHERE NOT EXISTS(SELECT 1 FROM operations_replay_fences f WHERE f.environment_id=$2 AND f.table_name=$3 AND f.key_digest=item.digest AND f.key_columns=ARRAY(SELECT jsonb_array_elements_text(item.columns)))`,[JSON.stringify(table.keys),target.environmentId,table.name])).rows[0]?.n;if(n!==0)throw Error('Current original positive job lacks permanent admission fence');}
 return recoveryDigest(observed);
}
