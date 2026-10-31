import {CURRENT_SCHEMA_VERSION} from '../../../lib/contracts/current-schema';
import {recoveryContentDigest} from '../../../lib/server/operations/recovery-content';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {recoveryGrantCheckpoint} from '../../../lib/server/operations/grant-checkpoint';
import {it,expect} from 'vitest';
import {Client} from 'pg';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withRecoveryDatabaseCheckpoint} from '../../../lib/server/operations/database-checkpoint';
import {runRecoveryPgDump} from '../../../lib/server/operations/pg-dump';
import {restoreOwnedRecoveryDump,restoreOwnedWorkDump,prepareOwnedPreviewCloneRestoreFence} from '../../../lib/server/operations/pg-restore';
import {encryptRecoveryFile,decryptRecoveryFile} from '../../../lib/server/operations/backup-crypto';
async function verifyPostgresRestore(postgresMajor:17|18){
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/owned-restore-proof-')),dump=join(root,'checkpoint.dump'),restoredDump=join(root,'restored.dump'),cipher=join(root,'encrypted.bundle'),key=randomBytes(32);
 let sourceDatabaseName='',sourceEnvironmentId='',receipt:{digest:string;sizeBytes:number;serverMajor:17|18;clientMajor:17|18}|undefined,content:unknown,grants='',acceptedContent='';
 try{
  await withPilotEnvironment(async environment=>{sourceDatabaseName=environment.databaseName;sourceEnvironmentId=environment.environmentId;const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();try{await pilotPublishedKnowledgeFixture(db as any,'primary');const recoveryId=randomUUID(),revision=Number((await db.query("UPDATE operations_control SET mode='locked',recovery_id=$2,revision=revision+1 WHERE environment_id=$1 RETURNING revision",[sourceEnvironmentId,recoveryId])).rows[0].revision);await db.query("UPDATE principals SET display_name='Synthetic restored identity' WHERE login_name='mcteer'");content=(await db.query('SELECT id,login_name,display_name,active FROM principals ORDER BY id')).rows;grants=await recoveryGrantCheckpoint(db);receipt=await withRecoveryDatabaseCheckpoint(db,{environmentId:sourceEnvironmentId,recoveryId,controlRevision:revision,signal:environment.signal},boundary=>{acceptedContent=boundary.acceptedContentDigest;return runRecoveryPgDump({environmentId:sourceEnvironmentId,snapshot:boundary.snapshot,serverMajor:boundary.serverMajor,output:dump,signal:boundary.signal});});await expect(restoreOwnedRecoveryDump({...receipt,dump,sourceDatabaseName,sourceEnvironmentId,signal:environment.signal})).rejects.toThrow('Separate owned');}finally{await db.end();}},{deadlineMs:180000,postgresMajor});
  if(!receipt)throw Error('Source dump unavailable');const context='a'.repeat(64);await encryptRecoveryFile(dump,cipher,key,context,AbortSignal.timeout(30000));await decryptRecoveryFile(cipher,restoredDump,key,context,AbortSignal.timeout(30000));
  await withPilotEnvironment(async environment=>{const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await db.connect();await runtime.connect();try{await db.query("UPDATE operations_control SET mode='locked' WHERE environment_id=$1",[environment.environmentId]);const restored=await restoreOwnedRecoveryDump({...receipt!,dump:restoredDump,sourceDatabaseName,sourceEnvironmentId,signal:environment.signal});expect(restored.targetDatabaseName).not.toBe(sourceDatabaseName);expect(restored.restorationReady).toBe(false);expect((await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows).toEqual([{environment_id:sourceEnvironmentId,schema_version:CURRENT_SCHEMA_VERSION}]);expect((await db.query('SELECT mode FROM operations_control')).rows).toEqual([{mode:'locked'}]);expect((await db.query('SELECT id,login_name,display_name,active FROM principals ORDER BY id')).rows).toEqual(content);await expect(runtime.query('SELECT * FROM principals')).rejects.toMatchObject({code:'42501'});await db.query('BEGIN');expect(await recoveryContentDigest(db)).toBe(acceptedContent);await db.query('COMMIT');await db.query(await readFile(resolve('scripts/db-role-setup.sql'),'utf8'));expect(await recoveryGrantCheckpoint(db)).toBe(grants);expect((await runtime.query('SELECT id,login_name,display_name,active FROM principals ORDER BY id')).rows).toEqual(content);await expect(runtime.query("UPDATE operations_control SET mode='open'")).rejects.toMatchObject({code:'42501'});}finally{await runtime.end();await db.end();}},{deadlineMs:180000,postgresMajor});
 }finally{key.fill(0);await rm(root,{recursive:true,force:true});}
}
it('restores authenticated PostgreSQL bytes into a separate locked owned target with explicit runtime grants',async()=>{for(const major of [17,18] as const)await verifyPostgresRestore(major);},720000);

it('restores an open work snapshot into a fresh cluster with both runtime roles denied',async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/work-restore-proof-')),dump=join(root,'work.dump');
 let sourceDatabaseName='',sourceEnvironmentId='',receipt:Awaited<ReturnType<typeof runRecoveryPgDump>>|undefined,content:unknown;
 try{
  await withPilotEnvironment(async environment=>{
   sourceDatabaseName=environment.databaseName;sourceEnvironmentId=environment.environmentId;
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
   try{
    await db.query("UPDATE principals SET display_name='Synthetic open work snapshot' WHERE login_name='mcteer'");
    content=(await db.query('SELECT id,login_name,display_name,active FROM principals ORDER BY id')).rows;
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try{const snapshot=(await db.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;receipt=await runRecoveryPgDump({environmentId:sourceEnvironmentId,snapshot,serverMajor:18,output:dump,signal:environment.signal});}finally{await db.query('ROLLBACK');}
    expect((await db.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('open');
   }finally{await db.end();}
  },{postgresMajor:18,deadlineMs:180000});
  if(!receipt)throw Error('Work snapshot unavailable');
  await withPilotEnvironment(async environment=>{
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
   try{
    await db.query("UPDATE operations_control SET mode='locked'");
    // The owned-only adapter preserves external Preview trigger dependencies,
    // without importing copied-request fingerprints or allowing runtime writes.
    await db.query('ALTER ROLE turas_runtime NOLOGIN; CREATE ROLE turas_runtime_016 NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
    await db.query('REVOKE CONNECT ON DATABASE "'+environment.databaseName+'" FROM PUBLIC,turas_runtime,turas_runtime_016');
    await expect(prepareOwnedPreviewCloneRestoreFence(db,'production-synthetic')).rejects.toThrow('Owned Preview restore source');
    const unconnected=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await expect(prepareOwnedPreviewCloneRestoreFence(unconnected,'turas-preview-synthetic-restore')).rejects.toThrow('Actual owned Preview restore connection');
    const fence=await prepareOwnedPreviewCloneRestoreFence(db,'turas-preview-synthetic-restore');
    expect(fence).toMatchObject({ownerOnly:true,sourceCopiedRequestPolicyRestored:false,privateCloneRowsRestored:false});
    await db.query('CREATE TABLE public.owned_preview_fence_probe(id integer); CREATE TRIGGER preview_clone_copied_request BEFORE INSERT OR UPDATE ON public.owned_preview_fence_probe FOR EACH ROW EXECUTE FUNCTION turas_preview_clone.refuse_copied_request()');
    await db.query('INSERT INTO public.owned_preview_fence_probe VALUES(1)');
    await db.query('GRANT INSERT ON public.owned_preview_fence_probe TO turas_runtime');
    await db.query('SET ROLE turas_runtime');try{await expect(db.query('INSERT INTO public.owned_preview_fence_probe VALUES(2)')).rejects.toMatchObject({code:'42501',message:'Owned restore bootstrap required'});}finally{await db.query('RESET ROLE');}
    expect((await db.query('SELECT id FROM public.owned_preview_fence_probe')).rows).toEqual([{id:1}]);
    for(const role of ['turas_runtime','turas_runtime_016'])expect((await db.query("SELECT has_schema_privilege($1,'turas_preview_clone','USAGE') AS usage,has_function_privilege($1,'turas_preview_clone.refuse_copied_request()','EXECUTE') AS execute",[role])).rows[0]).toEqual({usage:false,execute:false});
    await expect(prepareOwnedPreviewCloneRestoreFence(db,'turas-preview-synthetic-restore')).rejects.toThrow('Isolated fresh Preview restore fence');
    await db.query('DROP TABLE public.owned_preview_fence_probe; DROP SCHEMA turas_preview_clone CASCADE');
    const restored=await restoreOwnedWorkDump({...receipt!,dump,sourceDatabaseName,sourceEnvironmentId,signal:environment.signal});
    expect(restored).toMatchObject({restorationReady:false,databaseSchemasRestored:['public'],allDatabaseSchemasVerified:false,runtimeGrantsVerified:false});
    expect((await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows).toEqual([{environment_id:sourceEnvironmentId,schema_version:CURRENT_SCHEMA_VERSION}]);
    expect((await db.query('SELECT mode,recovery_id FROM operations_control')).rows[0]).toEqual({mode:'locked',recovery_id:restored.recoveryId});
    expect((await db.query('SELECT id,login_name,display_name,active FROM principals ORDER BY id')).rows).toEqual(content);
    expect((await db.query("SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') ORDER BY rolname")).rows).toEqual([{rolname:'turas_runtime',rolcanlogin:false},{rolname:'turas_runtime_016',rolcanlogin:false}]);
    for(const role of ['turas_runtime','turas_runtime_016']){
     expect((await db.query("SELECT has_database_privilege($1,current_database(),'CONNECT') AS connect,has_schema_privilege($1,'public','USAGE') AS usage,has_table_privilege($1,'principals','SELECT') AS read",[role])).rows[0]).toEqual({connect:false,usage:false,read:false});
    }
   }finally{await db.end();}
  },{postgresMajor:18,deadlineMs:180000});
 }finally{await rm(root,{recursive:true,force:true});}
},420000);
