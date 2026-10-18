import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
import {createRequire} from 'node:module';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {currentRecoveryStateDigest} from './recovery-state';
import {recoveryDenialSnapshotSchema,verifyRecoveryDenialSnapshot} from './recovery-denial-snapshot';
const scopeSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),snapshotDigest:z.string().regex(/^[a-f0-9]{64}$/),backupCapturedAt:z.iso.datetime({offset:true})});
const inheritedFence=z.strictObject({environment_id:z.string(),table_name:z.string().regex(/^[a-z_][a-z0-9_]*$/),key_columns:z.array(z.string().regex(/^[a-z_][a-z0-9_]*$/)).min(1).max(16),key_digest:z.string().regex(/^[a-f0-9]{64}$/)});
function installedReplayFunctions(){
 let sql='';const migration=createRequire(import.meta.url)('../../../migrations/079-pilot-operations.cjs');
 // Read the authored migration's SQL through its normal static emitter. Never
 // execute a migration or schema initialization against the audit database.
 migration.up({sql(value:string){sql+=value;}});
 const body=/CREATE FUNCTION turas_recovery_replay_guard\(\) RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS \$\$([\s\S]*?)\$\$;/.exec(sql)?.[1];
 const immutable=/CREATE FUNCTION turas_pilot_immutable_recovery_receipt\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/.exec(sql)?.[1];
 if(!body||!immutable)throw Error('Authored permanent request function unavailable');return {guard:body.trim(),immutable:immutable.trim()};
}
/** Actual locked-owner inspection, not an owner-supplied healthy boolean.
 * The snapshot context digest must come from independently authenticated cold
 * bytes. This checks permanent request fences only: provider effects, charges,
 * source denials and workflow closure still need their separate verification. */
export async function auditRecoveredRequestFences(db:Client|PoolClient,raw:unknown,rawScope:z.infer<typeof scopeSchema>){
 const scope=scopeSchema.parse(rawScope),snapshot=recoveryDenialSnapshotSchema.parse(raw);
 if(snapshot.contract!=='pilot-denial-replay-snapshot-v7'||snapshot.schemaVersion!==79)throw Error('Complete current schema-079 replay inventory required');
 await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='10000ms'");await db.query("SET LOCAL transaction_timeout='120s'");
  if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw Error('Request fence audit requires actual owner authority');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[scope.environmentId]);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
  // Take table locks only after the waited-for authority fences, then measure
  // the current committed state rather than an earlier repeatable snapshot.
  const currentStateDigest=await currentRecoveryStateDigest(db);
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!==scope.environmentId||Number(marker[0].schema_version)!==79)throw Error('Request fence audit target differs');
  const control=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1 FOR SHARE',[scope.environmentId])).rows[0];
  if(control?.mode!=='locked'||Number(control.revision)!==scope.controlRevision||control.recovery_id!==scope.recoveryId)throw Error('Exact locked request fence audit required');
  const now=Number((await db.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS now')).rows[0].now);
  verifyRecoveryDenialSnapshot(snapshot,{environmentId:scope.environmentId,contextDigest:scope.snapshotDigest,after:scope.backupCapturedAt,now});
  const expectedFunction=installedReplayFunctions();
  const actualFunction=(await db.query(`SELECT p.prosrc,p.prosecdef,p.proconfig,l.lanname,p.proowner=(SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass) AS owner
   FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='public.turas_recovery_replay_guard()'::regprocedure`)).rows;
  if(actualFunction.length!==1||actualFunction[0].prosrc.trim()!==expectedFunction.guard||actualFunction[0].prosecdef!==true||actualFunction[0].lanname!=='plpgsql'||actualFunction[0].owner!==true||JSON.stringify(actualFunction[0].proconfig)!==JSON.stringify(['search_path=pg_catalog, public']))throw Error('Actual permanent request function differs');
  const functionDigest=recoveryDigest(expectedFunction);
  const entries=new Map<string,{columns:Map<string,string[]>;keys:Map<string,{columns:string[];digest:string}>}>();
  function include(name:string,columns:string[],digest?:string){
   let entry=entries.get(name);if(!entry){entry={columns:new Map(),keys:new Map()};entries.set(name,entry);}
   entry.columns.set(JSON.stringify(columns),columns);
   if(digest)entry.keys.set(JSON.stringify([columns,digest]),{columns,digest});
  }
  for(const table of snapshot.tables){for(const columns of table.replayKeyColumns??[])include(table.name,columns);for(const row of table.rows)for(const key of row.replayKeys??[])include(table.name,key.columns,key.digest);}
  for(const row of snapshot.tables.find(table=>table.name==='operations_replay_fences')!.rows){const fence=inheritedFence.parse(row.identity);if(fence.environment_id!==scope.environmentId)throw Error('Inherited request fence environment differs');include(fence.table_name,fence.key_columns,fence.key_digest);}
  if(entries.size>128)throw Error('Request fence audit inventory exceeds bound');
  await db.query('LOCK TABLE operations_replay_fences IN SHARE MODE');
  const immutable=(await db.query(`SELECT t.tgenabled='O' AND t.tgtype=27 AND t.tgqual IS NULL AS enabled,p.prosrc,p.prosecdef,p.proconfig,l.lanname,
   p.proowner=(SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass) AS owner
   FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_language l ON l.oid=p.prolang
   WHERE t.tgrelid='public.operations_replay_fences'::regclass AND t.tgname='replay_fence_immutable' AND t.tgfoid='public.turas_pilot_immutable_recovery_receipt()'::regprocedure`)).rows;
  if(immutable.length!==1||immutable[0].enabled!==true||immutable[0].prosrc.trim()!==expectedFunction.immutable||immutable[0].prosecdef!==false||immutable[0].proconfig!==null||immutable[0].lanname!=='plpgsql'||immutable[0].owner!==true)throw Error('Actual permanent request fence immutability unavailable');
  if((await db.query("SELECT has_table_privilege('turas_runtime','public.operations_replay_fences','INSERT,UPDATE,DELETE,TRUNCATE') AS write")).rows[0].write!==false)throw Error('Runtime permanent request fence authority differs');
  const tables=[];
  for(const [name,entry] of entries){
   // Names/columns are already constrained by the versioned snapshot schema.
   await db.query('LOCK TABLE public."'+name+'" IN SHARE MODE');
   const guard=(await db.query(`SELECT t.tgenabled='O' AND t.tgfoid='public.turas_recovery_replay_guard()'::regprocedure AND (t.tgtype&1)=1 AND (t.tgtype&2)=2 AND (t.tgtype&4)=4 AND (t.tgtype&16)=16 AND t.tgqual IS NULL AS enabled
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1 AND t.tgname='recovered_request_replay'`,[name])).rows;
   if(guard.length!==1||guard[0].enabled!==true)throw Error('Actual permanent request guard unavailable');
   const indexes=(await db.query(`SELECT array_agg(a.attname::text ORDER BY a.attname) AS columns FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinal) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
    WHERE n.nspname='public' AND c.relname=$1 AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AND k.ordinal<=i.indnkeyatts GROUP BY i.indexrelid`,[name])).rows;
   const available=new Set(indexes.map(row=>JSON.stringify(row.columns)));
   if([...entry.columns.keys()].some(columns=>!available.has(columns)))throw Error('Actual permanent request index differs');
   const keys=[...entry.keys.values()];
   const missing=(await db.query(`SELECT count(*)::int AS missing FROM jsonb_to_recordset($1::jsonb) expected(columns jsonb,digest text)
    WHERE NOT EXISTS(SELECT 1 FROM operations_replay_fences f WHERE f.environment_id=$2 AND f.table_name=$3 AND f.key_digest=expected.digest
     AND f.key_columns=ARRAY(SELECT jsonb_array_elements_text(expected.columns)))`,[JSON.stringify(keys),scope.environmentId,name])).rows[0].missing;
   if(Number(missing)!==0)throw Error('Captured permanent request fence missing');
   tables.push({name,indexes:entry.columns.size,keys:keys.length,keySetDigest:recoveryDigest(keys)});
  }
  const proofDigest=recoveryDigest({scope,currentStateDigest,functionDigest,tables});await db.query('COMMIT');
  return {contract:'pilot-request-fence-audit-v1',...scope,currentStateDigest,proofDigest,functionDigest,tables,permanentRequestFencesVerified:true,authorityGranted:false,quarantineCleared:false,providerCalls:0,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
