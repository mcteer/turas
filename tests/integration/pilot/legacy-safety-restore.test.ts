import {captureRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {Client} from 'pg';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {runRecoveryPgDump} from '../../../lib/server/operations/pg-dump';
import {readOnlyDatabaseSafetyDigest} from '../../../lib/server/operations/recovery-content';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
import {restoreOwnedLegacySafetyCopy} from '../../../lib/server/operations/legacy-safety-restore';
let root:string,scope:Parameters<typeof restoreOwnedLegacySafetyCopy>[0];
let currentDenials:{snapshot:Awaited<ReturnType<typeof captureRecoveryDenialSnapshot>>;contextDigest:string;backupCapturedAt:string};
beforeAll(async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});root=await mkdtemp(resolve('local-artifacts/016/legacy-safety-fixture-'));
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{
   await owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const backupCapturedAt=(await owner.query('SELECT transaction_timestamp() AS time')).rows[0].time.toISOString();
   const applicationContentDigest=await readOnlyDatabaseSafetyDigest(owner),ledgerDigest=recoveryDigest((await owner.query('SELECT name FROM turas_migrations ORDER BY name')).rows),snapshot=(await owner.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
   const dump=join(root,'source.dump'),receipt=await runRecoveryPgDump({environmentId:environment.environmentId,serverMajor:18,snapshot,output:dump,signal:environment.signal});
   scope={dump,digest:receipt.digest,sizeBytes:receipt.sizeBytes,sourceEnvironmentId:environment.environmentId,sourceDatabaseName:environment.databaseName,sourceSchema:55,serverMajor:18,applicationContentDigest,ledgerDigest};
   await owner.query('COMMIT');
   const current=await captureRecoveryDenialSnapshot(owner,environment.environmentId,environment.signal);currentDenials={snapshot:current,contextDigest:current.snapshotDigest,backupCapturedAt};
  }finally{await owner.query('ROLLBACK').catch(()=>undefined);await owner.end();}
 },{priorSchema:55,postgresMajor:18,deadlineMs:180000});
},210000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
it('restores schema 055 content rehearses both forward migrations and leaves runtime and recovery closed',async()=>{
 await withPilotEnvironment(async environment=>{
  const result=await restoreOwnedLegacySafetyCopy(scope,environment.signal);
  expect(result).toMatchObject({sourceSchema:55,targetSchema:80,applicationContentVerified:true,sourceLedgerVerified:true,forwardMigrationsVerified:true,mode:'locked',runtimeConnectionDenied:true,currentAuthorityVerified:false,workflowResumed:false,restorationReady:false});
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();
  try{
   expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
   expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_quarantines')).rows[0].n).toBe(7);
   expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE revoked_at IS NULL')).rows[0].n).toBe(0);
   await expect(runtime.connect()).rejects.toMatchObject({code:'42501'});
   await expect(owner.query("UPDATE operations_control SET mode='open'")).rejects.toThrow('quarantined');
  }finally{await owner.end();await runtime.end();}
 },{priorSchema:55,postgresMajor:18,deadlineMs:180000});
},210000);
it('rejects altered legacy dump identity before fencing or replacing the target',async()=>{
 await withPilotEnvironment(async environment=>{
  await expect(restoreOwnedLegacySafetyCopy({...scope,digest:'0'.repeat(64)},environment.signal)).rejects.toThrow('dump digest differs');
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await runtime.connect();
  try{expect((await owner.query('SELECT environment_id,schema_version FROM turas_environment')).rows[0]).toEqual({environment_id:environment.environmentId,schema_version:55});expect((await runtime.query('SELECT count(*)::int AS n FROM principals')).rows[0].n).toBeGreaterThan(0);}
  finally{await owner.end();await runtime.end();}
 },{priorSchema:55,postgresMajor:18,deadlineMs:180000});
},210000);
it('holds the connection perimeter when restored legacy content fails verification',async()=>{
 await withPilotEnvironment(async environment=>{
  await expect(restoreOwnedLegacySafetyCopy({...scope,applicationContentDigest:'0'.repeat(64)},environment.signal)).rejects.toThrow('application content differs');
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();
  try{expect((await owner.query('SELECT environment_id,schema_version FROM turas_environment')).rows[0]).toEqual({environment_id:scope.sourceEnvironmentId,schema_version:55});await expect(runtime.connect()).rejects.toMatchObject({code:'42501'});}
  finally{await owner.end();await runtime.end();}
 },{priorSchema:55,postgresMajor:18,deadlineMs:180000});
},210000);

it('reapplies independently captured credential denials after 055 forward restoration while keeping full quarantine',async()=>{
 await withPilotEnvironment(async environment=>{
  const result=await restoreOwnedLegacySafetyCopy(scope,environment.signal,currentDenials);
  expect(result).toMatchObject({contract:'pilot-owned-legacy-restore-v2',applicationContentVerified:true,forwardMigrationsVerified:true,credentialDenialsReapplied:true,credentialReconciliation:{scope:'credentials-grants-and-source-denials',authorityGranted:false,quarantineCleared:false,currentAuthorityVerified:false,replayReconciled:false},mode:'locked',runtimeConnectionDenied:true,restorationReady:false});
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();try{expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_quarantines')).rows[0].n).toBe(7);await expect(owner.query("UPDATE operations_control SET mode='open'")).rejects.toThrow('quarantined');}finally{await owner.end();}
 },{priorSchema:55,postgresMajor:18,deadlineMs:180000});
},210000);
it('rejects changed current denial context before touching the owned restore target',async()=>{
 await withPilotEnvironment(async environment=>{
  await expect(restoreOwnedLegacySafetyCopy(scope,environment.signal,{...currentDenials,contextDigest:'0'.repeat(64)})).rejects.toThrow('Fresh independent');
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await runtime.connect();try{expect((await owner.query('SELECT environment_id,schema_version FROM turas_environment')).rows[0]).toEqual({environment_id:environment.environmentId,schema_version:55});expect((await runtime.query('SELECT count(*)::int AS n FROM principals')).rows[0].n).toBeGreaterThan(0);}finally{await runtime.end();await owner.end();}
 },{priorSchema:55,postgresMajor:18,deadlineMs:180000});
},210000);
