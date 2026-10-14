import {createHash} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
// Control and observation rows are intentionally changed during isolated restore.
// All domain content, decisions, authority and permanent receipts remain included.
const excluded=new Set(['operations_control','operations_control_transitions','operations_recovery_verifications','operations_recovery_quarantine_resolutions','operations_maintenance_status','operations_health_samples','operations_store_observations','operations_backup_observations']);
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
/** Portable content proof: unlike the live authority digest, this does not hash
 * cluster-specific role/relation OIDs. Call within a bounded owner transaction. */
export async function recoveryContentDigest(db:Client|PoolClient){
 return databaseContentDigest(db,true);
}
/** Portable application-content proof for an ordinary database-only snapshot.
 * The caller must keep this same read-only repeatable-read transaction exported
 * throughout pg_dump. This provides no cross-store or current-authority proof. */
export async function readOnlyDatabaseSafetyDigest(db:Client|PoolClient){
 const state=(await db.query("SELECT current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation")).rows[0];
 if(state?.read_only!=='on'||!['repeatable read','serializable'].includes(state.isolation))throw Error('Read-only repeatable database safety snapshot required');
 return databaseContentDigest(db,false);
}
async function databaseContentDigest(db:Client|PoolClient,lock:boolean){
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>String(row.tablename)).filter(name=>!excluded.has(name));
 if(!tables.length||tables.length>1000)throw Error('Recovery content inventory unavailable');
 if(lock)await db.query('LOCK TABLE '+tables.map(name=>'public.'+quote(name)).join(',')+' IN SHARE MODE');
 const content=[];
 for(const table of tables){
  const row=(await db.query(`SELECT count(*)::text AS count,encode(sha256(convert_to(COALESCE(string_agg(digest,'' ORDER BY digest),''),'UTF8')),'hex') AS digest FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest FROM public.${quote(table)} t) hashed`)).rows[0];
  if(!row||!/^\d+$/.test(row.count)||!/^[a-f0-9]{64}$/.test(row.digest))throw Error('Recovery content proof unavailable');
  content.push({table,count:row.count,digest:row.digest});
 }
 const sequences=(await db.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
 if(sequences.length>1000)throw Error('Recovery sequence inventory exceeds bound');
 const sequenceState=[];
 for(const row of sequences){const value=(await db.query('SELECT last_value::text AS last_value,is_called FROM public.'+quote(String(row.sequencename)))).rows[0];sequenceState.push({name:row.sequencename,...value});}
 return createHash('sha256').update(JSON.stringify({content,sequenceState})).digest('hex');
}
