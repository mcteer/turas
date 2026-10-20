import {currentRecoveryStateDigest} from '../../../lib/server/operations/recovery-state';
import {currentRecoveryStateDigest as originalStateDigest} from '../../fixtures/pilot/recovery-state-before-batching';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {readDatabaseSafetyBoundary} from '../../../lib/server/operations/database-safety-boundary';
import {Client} from 'pg';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {readOnlyDatabaseSafetyDigest,recoveryContentDigest} from '../../../lib/server/operations/recovery-content';
// Compatibility oracle: the released per-table query format, deliberately
// independent of the bounded UNION query used by the current implementation.
async function originalPortableDigest(db:Client){
 const excluded=new Set(['operations_control','operations_control_transitions','operations_recovery_verifications','operations_recovery_quarantine_resolutions','operations_maintenance_status','operations_health_samples','operations_store_observations','operations_backup_observations']);
 const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>String(row.tablename)).filter(name=>!excluded.has(name));
 const content=[];
 for(const table of tables){const row=(await db.query(`SELECT count(*)::text AS count,encode(sha256(convert_to(COALESCE(string_agg(digest,'' ORDER BY digest),''),'UTF8')),'hex') AS digest FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest FROM public.${quote(table)} t) hashed`)).rows[0];content.push({table,count:row.count,digest:row.digest});}
 const sequenceState=[];
 for(const row of (await db.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows){const value=(await db.query('SELECT last_value::text AS last_value,is_called FROM public.'+quote(String(row.sequencename)))).rows[0];sequenceState.push({name:row.sequencename,...value});}
 return createHash('sha256').update(JSON.stringify({content,sequenceState})).digest('hex');
}
it('keeps application content proof at the exported snapshot while later rows change',async()=>{
 await withPilotEnvironment(async()=>{
  const snapshot=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),writer=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await snapshot.connect();await writer.connect();
  try{
   for(let index=0;index<17;index++)await writer.query('CREATE TABLE synthetic_digest_boundary_'+index+'(value text)');
   await writer.query(`CREATE TABLE "synthetic_digest_quoted""table"(id serial,payload jsonb,amount numeric,optional text,raw bytea)`);
   await writer.query(`INSERT INTO "synthetic_digest_quoted""table"(payload,amount,raw) VALUES('{"unicode":"雪","nested":[null,true]}',12345678901234567890.123456789,decode('00ff','hex')),('{"unicode":"雪","nested":[null,true]}',12345678901234567890.123456789,decode('00ff','hex'))`);
   await writer.query('CREATE TABLE synthetic_safety_leases(id integer PRIMARY KEY,state text,lease_until timestamptz)');
   await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const boundary=await readDatabaseSafetyBoundary(snapshot,process.env.TURAS_ENVIRONMENT_ID!);
   expect(boundary).toMatchObject({requiredObjectCount:0,activeLeaseCount:0,pendingUploadCount:0,externalAdmissionVerified:false,privateBytesVerified:false,fullServiceCheckpoint:false});
   await writer.query("INSERT INTO synthetic_safety_leases VALUES(1,'leased',clock_timestamp()+interval '10 minutes')");
   expect(await readDatabaseSafetyBoundary(snapshot,process.env.TURAS_ENVIRONMENT_ID!,new Date(boundary.capturedAt))).toEqual(boundary);
   const before=await readOnlyDatabaseSafetyDigest(snapshot);expect(before).toMatch(/^[a-f0-9]{64}$/);expect(before).toBe(await originalPortableDigest(snapshot));
   await writer.query("UPDATE principals SET display_name=display_name || ' synthetic later change' WHERE id=(SELECT id FROM principals ORDER BY id LIMIT 1)");
   expect(await readOnlyDatabaseSafetyDigest(snapshot)).toBe(before);await snapshot.query('COMMIT');
   await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const after=await readOnlyDatabaseSafetyDigest(snapshot);expect(after).not.toBe(before);expect((await readDatabaseSafetyBoundary(snapshot,process.env.TURAS_ENVIRONMENT_ID!)).activeLeaseCount).toBe(1);await snapshot.query('COMMIT');
   await writer.query('BEGIN ISOLATION LEVEL REPEATABLE READ');expect(await recoveryContentDigest(writer)).toBe(after);const state=await currentRecoveryStateDigest(writer);expect(state).toBe(await originalStateDigest(writer));await writer.query("UPDATE principals SET display_name=display_name || ' synthetic authority mutation' WHERE id=(SELECT id FROM principals ORDER BY id LIMIT 1)");expect(await currentRecoveryStateDigest(writer)).not.toBe(state);await writer.query('ROLLBACK');
  }finally{await snapshot.query('ROLLBACK').catch(()=>undefined);await writer.query('ROLLBACK').catch(()=>undefined);await snapshot.end();await writer.end();}
 },{priorSchema:77,postgresMajor:18,deadlineMs:180000});
},210000);
it('rejects writable or read committed transactions as database safety checkpoints',async()=>{
 await withPilotEnvironment(async()=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{
   for(const statement of ['BEGIN','BEGIN READ ONLY','BEGIN ISOLATION LEVEL REPEATABLE READ']){
    await owner.query(statement);await expect(readOnlyDatabaseSafetyDigest(owner)).rejects.toThrow('Read-only repeatable');await expect(readDatabaseSafetyBoundary(owner,process.env.TURAS_ENVIRONMENT_ID!)).rejects.toThrow('Read-only repeatable');await owner.query('ROLLBACK');
   }
   await owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');expect(await readOnlyDatabaseSafetyDigest(owner)).toMatch(/^[a-f0-9]{64}$/);await owner.query('COMMIT');
  }finally{await owner.query('ROLLBACK').catch(()=>undefined);await owner.end();}
 },{postgresMajor:18,deadlineMs:180000});
},210000);
