import {it,expect} from 'vitest';
import {Client} from 'pg';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {runRecoveryPgDump} from '../../../lib/server/operations/pg-dump';
import {readOnlyDatabaseSafetyDigest} from '../../../lib/server/operations/recovery-content';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
import {restoreOwnedLegacySafetyCopy} from '../../../lib/server/operations/legacy-safety-restore';
it('restores an explicit schema 38 Preview snapshot through 57 and keeps both runtime roles denied',async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/preview-safety-'));
 let source:Parameters<typeof restoreOwnedLegacySafetyCopy>[0]|undefined;
 try{
  await withPilotEnvironment(async environment=>{
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
   try{
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const applicationContentDigest=await readOnlyDatabaseSafetyDigest(db),ledgerDigest=recoveryDigest((await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows),snapshot=(await db.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    const dump=join(root,'preview.dump'),receipt=await runRecoveryPgDump({environmentId:environment.environmentId,serverMajor:18,snapshot,output:dump,signal:environment.signal});
    source={dump,digest:receipt.digest,sizeBytes:receipt.sizeBytes,sourceEnvironmentId:environment.environmentId,sourceDatabaseName:environment.databaseName,sourceSchema:38,sourceTarget:'preview',serverMajor:18,applicationContentDigest,ledgerDigest};await db.query('COMMIT');
   }finally{await db.query('ROLLBACK').catch(()=>undefined);await db.end();}
  },{priorSchema:38,postgresMajor:18,deadlineMs:180000});
  if(!source)throw Error('Actual Preview-shaped owned snapshot required');
  const captured=source;
  await withPilotEnvironment(async environment=>{
   const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
   const secondUrl=new URL(requireOwnedPilotDatabase());secondUrl.username='turas_runtime_016';secondUrl.password='SyntheticRuntime16Only';
   try{
    await owner.query("CREATE ROLE turas_runtime_016 LOGIN PASSWORD 'SyntheticRuntime16Only'");
    const initial=new Client({connectionString:secondUrl.href});await initial.connect();await initial.end();
    await expect(restoreOwnedLegacySafetyCopy({...captured,sourceTarget:'production'},environment.signal)).rejects.toThrow('explicit Preview');
    expect((await owner.query('SELECT environment_id,schema_version FROM turas_environment')).rows[0]).toMatchObject({environment_id:environment.environmentId,schema_version:38});
    const result=await restoreOwnedLegacySafetyCopy(captured,environment.signal);
    expect(result).toMatchObject({sourceTarget:'preview',sourceSchema:38,targetSchema:57,applicationContentVerified:true,sourceLedgerVerified:true,forwardMigrationsVerified:true,mode:'locked',runtimeConnectionDenied:true,restorationReady:false});
    expect((await owner.query('SELECT count(*)::int AS n FROM turas_migrations')).rows[0].n).toBe(57);
    for(const connectionString of [requireOwnedPilotDatabase(),secondUrl.href]){const runtime=new Client({connectionString});try{await expect(runtime.connect()).rejects.toMatchObject({code:'42501'});}finally{await runtime.end();}}
    await expect(owner.query("UPDATE operations_control SET mode='open'")).rejects.toThrow('quarantined');
   }finally{await owner.end();}
  },{priorSchema:38,postgresMajor:18,deadlineMs:180000});
 }finally{await rm(root,{recursive:true,force:true});}
},420000);
