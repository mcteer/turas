import {createHash} from 'node:crypto';
import type {Client} from 'pg';

// Only ordinary authentication, personal read-only SDK capabilities and their
// counters may change during this measurement. Domain decisions, grants,
// permanent receipts, jobs and all pre-existing credentials remain included.
const observations=new Set(['operations_control','operations_control_transitions','operations_recovery_verifications','operations_recovery_quarantine_resolutions','operations_maintenance_status','operations_health_samples','operations_store_observations','operations_backup_observations','rate_windows','mcp_rate_windows']);
const connections=new Set(['mcp_connection_customers','mcp_management_receipts','mcp_management_cursors','mcp_access_receipts','mcp_handles','mcp_read_leases']);
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
/** The caller holds an owner transaction. Empty exclusions establish the
 * baseline; later exclusions must come from actual issued-and-retired probes. */
export async function ordinaryRecoveryStateDigest(db:Client,probes:{sessionHashes:readonly string[];connectionIds:readonly string[]}){
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>String(row.tablename)).filter(name=>!observations.has(name));
 if(!tables.length||tables.length>1000)throw Error('Ordinary recovery state inventory unavailable');
 await db.query('LOCK TABLE '+tables.map(name=>'public.'+quote(name)).join(',')+' IN SHARE MODE');
 const content=[];
 for(let offset=0;offset<tables.length;offset+=16){
  const statements=tables.slice(offset,offset+16).map((name,index)=>{
   const predicate=name==='login_sessions'?'NOT(t.token_hash=ANY($1::text[]))':name==='access_audit'?'NOT(COALESCE(t.actor_session_id IN(SELECT id FROM login_sessions WHERE token_hash=ANY($1::text[])),false))':name==='mcp_connections'?'NOT(t.id=ANY($2::uuid[]))':connections.has(name)?'NOT(COALESCE(t.connection_id=ANY($2::uuid[]),false))':'true';
   return `SELECT ${offset+index} AS ordinal,count(*)::text AS count,encode(sha256(convert_to(COALESCE(string_agg(digest,'' ORDER BY digest),''),'UTF8')),'hex') AS digest FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest FROM public.${quote(name)} t CROSS JOIN (SELECT $1::text[],$2::uuid[]) parameters WHERE ${predicate}) rows`;
  });
  const rows=(await db.query(statements.join(' UNION ALL ')+' ORDER BY ordinal',[[...probes.sessionHashes],[...probes.connectionIds]])).rows;
  if(rows.length!==statements.length)throw Error('Ordinary recovery state proof unavailable');
  for(const[index,row]of rows.entries()){
   if(row.ordinal!==offset+index||!/^\d+$/.test(row.count)||!/^[a-f0-9]{64}$/.test(row.digest))throw Error('Ordinary recovery state proof unavailable');
   content.push({table:tables[row.ordinal],count:row.count,digest:row.digest});
  }
 }
 const schema=(await db.query(`SELECT jsonb_build_object(
  'columns',(SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name,ordinal_position) FROM information_schema.columns c WHERE table_schema='public'),
  'functions',(SELECT jsonb_agg(pg_get_functiondef(p.oid) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p')),
  'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgrelid::regclass::text,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
  'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM pg_indexes i WHERE schemaname='public'),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
  'views',(SELECT jsonb_agg(to_jsonb(v) ORDER BY viewname) FROM pg_views v WHERE schemaname='public'),
  'constraints',(SELECT jsonb_agg(jsonb_build_array(c.conrelid::regclass::text,c.conname,pg_get_constraintdef(c.oid)) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),
  'enums',(SELECT jsonb_agg(jsonb_build_array(t.typname,e.enumlabel,e.enumsortorder) ORDER BY t.typname,e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'),
  'sequences',(SELECT jsonb_agg(to_jsonb(s) ORDER BY sequencename) FROM pg_sequences s WHERE schemaname='public')) AS metadata`)).rows[0]?.metadata;
 if(!schema?.columns)throw Error('Ordinary recovery schema proof unavailable');
 return createHash('sha256').update(JSON.stringify({content,schema})).digest('hex');
}
