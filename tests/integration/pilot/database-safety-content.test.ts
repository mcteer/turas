import {it,expect} from 'vitest';
import {Client} from 'pg';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {readOnlyDatabaseSafetyDigest,recoveryContentDigest} from '../../../lib/server/operations/recovery-content';
it('keeps application content proof at the exported snapshot while later rows change',async()=>{
 await withPilotEnvironment(async()=>{
  const snapshot=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),writer=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await snapshot.connect();await writer.connect();
  try{
   await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const before=await readOnlyDatabaseSafetyDigest(snapshot);expect(before).toMatch(/^[a-f0-9]{64}$/);
   await writer.query("UPDATE principals SET display_name=display_name || ' synthetic later change' WHERE id=(SELECT id FROM principals ORDER BY id LIMIT 1)");
   expect(await readOnlyDatabaseSafetyDigest(snapshot)).toBe(before);await snapshot.query('COMMIT');
   await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const after=await readOnlyDatabaseSafetyDigest(snapshot);expect(after).not.toBe(before);await snapshot.query('COMMIT');
   await writer.query('BEGIN ISOLATION LEVEL REPEATABLE READ');expect(await recoveryContentDigest(writer)).toBe(after);await writer.query('COMMIT');
  }finally{await snapshot.query('ROLLBACK').catch(()=>undefined);await writer.query('ROLLBACK').catch(()=>undefined);await snapshot.end();await writer.end();}
 },{postgresMajor:18,deadlineMs:180000});
},210000);
it('rejects writable or read committed transactions as database safety checkpoints',async()=>{
 await withPilotEnvironment(async()=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{
   for(const statement of ['BEGIN','BEGIN READ ONLY','BEGIN ISOLATION LEVEL REPEATABLE READ']){
    await owner.query(statement);await expect(readOnlyDatabaseSafetyDigest(owner)).rejects.toThrow('Read-only repeatable');await owner.query('ROLLBACK');
   }
   await owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');expect(await readOnlyDatabaseSafetyDigest(owner)).toMatch(/^[a-f0-9]{64}$/);await owner.query('COMMIT');
  }finally{await owner.query('ROLLBACK').catch(()=>undefined);await owner.end();}
 },{postgresMajor:18,deadlineMs:180000});
},210000);
