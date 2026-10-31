import {CURRENT_SCHEMA_VERSION} from '../../../lib/contracts/current-schema';
import {readDatabaseSafetyBoundary} from '../../../lib/server/operations/database-safety-boundary';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {Client} from 'pg';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {runRecoveryPgDump} from '../../../lib/server/operations/pg-dump';
import {readOnlyDatabaseSafetyDigest} from '../../../lib/server/operations/recovery-content';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
import {restoreOwnedLegacySafetyCopy} from '../../../lib/server/operations/legacy-safety-restore';
import {captureRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';

let root:string,source:Parameters<typeof restoreOwnedLegacySafetyCopy>[0]|undefined,denials:Parameters<typeof restoreOwnedLegacySafetyCopy>[2];
beforeAll(async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});root=await mkdtemp(resolve('local-artifacts/016/released-safety-'));
  await withPilotEnvironment(async environment=>{
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
   try{
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const boundary=(await db.query('SELECT pg_export_snapshot() AS snapshot,transaction_timestamp() AS captured_at')).rows[0];
    const applicationContentDigest=await readOnlyDatabaseSafetyDigest(db),ledger=(await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows;
    expect(ledger).toHaveLength(77);
    const databaseBoundary=await readDatabaseSafetyBoundary(db,environment.environmentId,boundary.captured_at);
    const dump=join(root,'released.dump'),receipt=await runRecoveryPgDump({environmentId:environment.environmentId,serverMajor:18,snapshot:boundary.snapshot,output:dump,signal:environment.signal});
    source={dump,digest:receipt.digest,sizeBytes:receipt.sizeBytes,sourceEnvironmentId:environment.environmentId,sourceDatabaseName:environment.databaseName,sourceSchema:77,sourceTarget:'production',serverMajor:18,applicationContentDigest,ledgerDigest:recoveryDigest(ledger),databaseBoundary};
    await db.query('COMMIT');
    const snapshot=await captureRecoveryDenialSnapshot(db,environment.environmentId,environment.signal);
    denials={snapshot,contextDigest:snapshot.snapshotDigest,backupCapturedAt:boundary.captured_at.toISOString()};
   }finally{await db.query('ROLLBACK').catch(()=>undefined);await db.end();}
  },{priorSchema:77,postgresMajor:18,deadlineMs:180000});
},210000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
it('cold restores the released 077 ledger through 079 and reapplies newer denials behind both runtime perimeters',async()=>{
  if(!source||!denials)throw Error('Actual released-schema owned snapshot and newer denials required');
  const captured=source,current=denials;
  await withPilotEnvironment(async environment=>{
   const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
   const second=new URL(requireOwnedPilotDatabase());second.username='turas_runtime_016';second.password='SyntheticRuntime16Only';
   try{
    await owner.query("CREATE ROLE turas_runtime_016 LOGIN PASSWORD 'SyntheticRuntime16Only'");
    const result=await restoreOwnedLegacySafetyCopy(captured,environment.signal,current);
    expect(result).toMatchObject({contract:'pilot-owned-legacy-restore-v2',sourceSchema:77,targetSchema:CURRENT_SCHEMA_VERSION,applicationContentVerified:true,sourceLedgerVerified:true,snapshotBoundaryVerified:true,forwardMigrationsVerified:true,credentialDenialsReapplied:true,mode:'locked',runtimeConnectionDenied:true,currentAuthorityVerified:false,workflowResumed:false,restorationReady:false});
    expect((await owner.query('SELECT count(*)::int AS n FROM turas_migrations')).rows[0].n).toBe(80);
    expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_quarantines')).rows[0].n).toBe(7);
    expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE revoked_at IS NULL')).rows[0].n).toBe(0);
    for(const connectionString of [requireOwnedPilotDatabase(),second.href]){const runtime=new Client({connectionString});try{await expect(runtime.connect()).rejects.toMatchObject({code:'42501'});}finally{await runtime.end();}}
    await expect(owner.query("UPDATE operations_control SET mode='open'")).rejects.toThrow('quarantined');
   }finally{await owner.end();}
  },{priorSchema:77,postgresMajor:18,deadlineMs:180000});
},210000);

it('rejects tampered 077 archive bytes before changing the target perimeter',async()=>{
 if(!source)throw Error('Released snapshot required');const captured=source;
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});
  await owner.connect();
  try{
   await expect(restoreOwnedLegacySafetyCopy({...captured,digest:'0'.repeat(64)},environment.signal)).rejects.toThrow('dump digest differs');
   await runtime.connect();
   expect((await owner.query('SELECT environment_id,schema_version FROM turas_environment')).rows).toEqual([{environment_id:environment.environmentId,schema_version:77}]);
   expect((await runtime.query('SELECT count(*)::int AS n FROM principals')).rows[0].n).toBeGreaterThan(0);
  }finally{await runtime.end();await owner.end();}
 },{priorSchema:77,postgresMajor:18,deadlineMs:180000});
},210000);
it('keeps both runtime roles closed when 077 accepted content verification fails',async()=>{
 if(!source)throw Error('Released snapshot required');const captured=source;
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  const second=new URL(requireOwnedPilotDatabase());second.username='turas_runtime_016';second.password='SyntheticRuntime16Only';
  try{
   await owner.query("CREATE ROLE turas_runtime_016 LOGIN PASSWORD 'SyntheticRuntime16Only'");
   await expect(restoreOwnedLegacySafetyCopy({...captured,applicationContentDigest:'0'.repeat(64)},environment.signal)).rejects.toThrow('application content differs');
   expect((await owner.query('SELECT environment_id,schema_version FROM turas_environment')).rows).toEqual([{environment_id:captured.sourceEnvironmentId,schema_version:77}]);
   expect((await owner.query('SELECT count(*)::int AS n FROM turas_migrations')).rows[0].n).toBe(77);
   for(const connectionString of [requireOwnedPilotDatabase(),second.href]){
    const runtime=new Client({connectionString});try{await expect(runtime.connect()).rejects.toMatchObject({code:'42501'});}finally{await runtime.end();}
   }
  }finally{await owner.end();}
 },{priorSchema:77,postgresMajor:18,deadlineMs:180000});
},210000);

it('rejects altered snapshot object and lease observations while retaining the restored runtime fence',async()=>{
 if(!source?.databaseBoundary)throw Error('Actual released boundary required');const captured=source;
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{
   await expect(restoreOwnedLegacySafetyCopy({...captured,databaseBoundary:{...captured.databaseBoundary!,requiredObjectsDigest:'0'.repeat(64)}},environment.signal)).rejects.toThrow('safety boundary differs');
   expect((await owner.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version).toBe(77);
   const runtime=new Client({connectionString:requireOwnedPilotDatabase()});try{await expect(runtime.connect()).rejects.toMatchObject({code:'42501'});}finally{await runtime.end();}
  }finally{await owner.end();}
 },{priorSchema:77,postgresMajor:18,deadlineMs:180000});
},210000);
