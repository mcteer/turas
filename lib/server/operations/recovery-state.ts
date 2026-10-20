import {createHash} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
const observationalTables=new Set(['operations_control','operations_control_transitions','operations_recovery_verifications','operations_recovery_quarantine_resolutions','operations_maintenance_status','operations_health_samples','operations_store_observations','operations_backup_observations']);
const identifier=(name:string)=>'"'+name.replaceAll('"','""')+'"';
/** Called under owner authority in a transaction. SHARE locks keep the verified
 * content/denial/replay state fixed until the caller commits its decision.
 * Only hashes leave SQL; private row payloads are never diagnostic output. */
export async function currentRecoveryStateDigest(db:Client|PoolClient){
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>String(row.tablename)).filter(name=>!observationalTables.has(name));
 if(!tables.length)throw Error('Recovery database inventory missing');
 await db.query('LOCK TABLE '+tables.map(name=>'public.'+identifier(name)).join(',')+' IN SHARE MODE');
 const statements=tables.map((name,index)=>`SELECT ${index} AS ordinal, count(*)::text AS count, encode(sha256(convert_to(COALESCE(string_agg(row_digest,'' ORDER BY row_digest),''),'UTF8')),'hex') AS digest FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS row_digest FROM public.${identifier(name)} t) rows`);
 const content=[];
 // Keep the released ordinal/hash serialization, with bounded planner input.
 for(let offset=0;offset<statements.length;offset+=16){
  const batch=statements.slice(offset,offset+16),rows=(await db.query(batch.join(' UNION ALL ')+' ORDER BY ordinal')).rows;
  if(rows.length!==batch.length)throw Error('Recovery state proof unavailable');
  for(const [index,row] of rows.entries()){
   if(row.ordinal!==offset+index||!/^\d+$/.test(row.count)||!/^[a-f0-9]{64}$/.test(row.digest))throw Error('Recovery state proof unavailable');
   content.push(row);
  }
 }
 const schema=(await db.query(`SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name,ordinal_position) FROM information_schema.columns c WHERE table_schema='public'),
 'grants',(SELECT jsonb_agg(to_jsonb(g) ORDER BY table_name,grantee,privilege_type,grantor) FROM information_schema.role_table_grants g WHERE table_schema='public'),
 'columnGrants',(SELECT jsonb_agg(to_jsonb(g) ORDER BY table_name,column_name,grantee,privilege_type,grantor) FROM information_schema.role_column_grants g WHERE table_schema='public'),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname) FROM pg_roles r),
 'roleMembership',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m),
 'schemaAuthority',(SELECT to_jsonb(n) FROM pg_namespace n WHERE nspname='public'),
 'defaultGrants',(SELECT jsonb_agg(to_jsonb(a) ORDER BY defaclrole,defaclnamespace,defaclobjtype) FROM pg_default_acl a),
 'relationAuthority',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'rowPolicies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
 'routineAuthority',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proowner,p.proacl,p.prosecdef,p.proconfig) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'extensions',(SELECT jsonb_agg(to_jsonb(e) ORDER BY extname) FROM pg_extension e),
 'views',(SELECT jsonb_agg(to_jsonb(v) ORDER BY viewname) FROM pg_views v WHERE schemaname='public'),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM pg_indexes i WHERE schemaname='public'),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.conrelid::regclass::text,c.conname,pg_get_constraintdef(c.oid)) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),
 'functions',(SELECT jsonb_agg(pg_get_functiondef(p.oid) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgrelid::regclass::text,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal)
 ) AS metadata`)).rows[0].metadata;
 return createHash('sha256').update(JSON.stringify({tables,content,schema})).digest('hex');
}
