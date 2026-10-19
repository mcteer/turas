import {it,expect} from 'vitest';
import {readDatabaseSafetyBoundary} from '../../../lib/server/operations/database-safety-boundary';
import {Client} from 'pg';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {readOnlyDatabaseSafetyDigest,recoveryContentDigest} from '../../../lib/server/operations/recovery-content';
it('keeps application content proof at the exported snapshot while later rows change',async()=>{
 await withPilotEnvironment(async()=>{
  const snapshot=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),writer=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await snapshot.connect();await writer.connect();
  try{
   await writer.query('CREATE TABLE synthetic_safety_leases(id integer PRIMARY KEY,state text,lease_until timestamptz)');
   await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const boundary=await readDatabaseSafetyBoundary(snapshot,process.env.TURAS_ENVIRONMENT_ID!);
   expect(boundary).toMatchObject({requiredObjectCount:0,activeLeaseCount:0,pendingUploadCount:0,externalAdmissionVerified:false,privateBytesVerified:false,fullServiceCheckpoint:false});
   await writer.query("INSERT INTO synthetic_safety_leases VALUES(1,'leased',clock_timestamp()+interval '10 minutes')");
   expect(await readDatabaseSafetyBoundary(snapshot,process.env.TURAS_ENVIRONMENT_ID!,new Date(boundary.capturedAt))).toEqual(boundary);
   const before=await readOnlyDatabaseSafetyDigest(snapshot);expect(before).toMatch(/^[a-f0-9]{64}$/);
   await writer.query("UPDATE principals SET display_name=display_name || ' synthetic later change' WHERE id=(SELECT id FROM principals ORDER BY id LIMIT 1)");
   expect(await readOnlyDatabaseSafetyDigest(snapshot)).toBe(before);await snapshot.query('COMMIT');
   await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const after=await readOnlyDatabaseSafetyDigest(snapshot);expect(after).not.toBe(before);expect((await readDatabaseSafetyBoundary(snapshot,process.env.TURAS_ENVIRONMENT_ID!)).activeLeaseCount).toBe(1);await snapshot.query('COMMIT');
   await writer.query('BEGIN ISOLATION LEVEL REPEATABLE READ');expect(await recoveryContentDigest(writer)).toBe(after);await writer.query('COMMIT');
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
