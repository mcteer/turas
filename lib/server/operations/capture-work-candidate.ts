import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdir,rm,open,lstat,realpath,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {z} from 'zod';
import {workCaptureCandidateSchema} from '../../contracts/pilot-capture';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {withRecoveryDatabaseCheckpoint,withScheduledDatabaseCheckpoint} from './database-checkpoint';
import {runNativeRecoveryPgDump} from './native-postgres';
import {captureRecoveryObjects} from './object-checkpoint';
import {requiredRecoveryObjects} from './required-objects';
import {packBackupArchive,type BackupArchiveHeader} from './backup-archive';
import {encryptRecoveryFile,verifyRecoveryKey} from './backup-crypto';
import type {PrivateObjects} from '../storage/private-objects';
const identity=z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const schema=z.strictObject({environmentId:identity,recoveryId:z.uuid(),controlRevision:z.number().int().positive(),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,ledgerDigest:digest,sourceProjectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),storeId:identity,keyReference:identity,keyVersion:identity,purpose:z.enum(['recovery','scheduled-backup']).default('recovery')});

/** Protected operator primitive, never a customer-facing capability. The
 * caller supplies fixed deployment provenance, separately retained key bytes,
 * and an authenticated store. This operation never unlocks or resumes work. */
export async function captureWorkRecoveryCandidate(input:{scope:z.input<typeof schema>;connectionString:string;assetRoot:string;output:string;objects:PrivateObjects;key:Uint8Array;signal:AbortSignal;maximumObjectBytes?:number;maximumObjects?:number;archiveId?:string;scheduledNotBeforeCapturedAt?:string}){
 const scope=schema.parse(input.scope),output=resolve(input.output);input.signal.throwIfAborted();
 if(input.scheduledNotBeforeCapturedAt!==undefined){z.iso.datetime({offset:true}).parse(input.scheduledNotBeforeCapturedAt);if(scope.purpose!=='scheduled-backup')throw Error('Scheduled capture time cannot alter recovery');}
 if(input.key.byteLength!==32)throw Error('Separate work recovery key required');
 if(input.archiveId!==undefined)z.uuid().parse(input.archiveId);
 const url=new URL(input.connectionString),local=url.hostname==='127.0.0.1';
 if(!['postgres:','postgresql:'].includes(url.protocol)||(local?(process.env.VERCEL==='1'||process.env.TURAS_PILOT_OWNED!=='1'||process.env.TURAS_TEST_ENVIRONMENT_ID!==scope.environmentId||!/^test-pilot-[a-f0-9]{12}$/.test(scope.environmentId)||!/^\/turas_test_016_eval_[a-f0-9]{12}$/.test(url.pathname)):(!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.')||url.searchParams.get('sslmode')!=='verify-full')))throw Error('Explicit work capture source required');
 const directory=await lstat(output);if(!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==process.getuid?.()||(directory.mode&0o777)!==0o700||await realpath(output)!==output)throw Error('Private work capture output required');
 if((await readdir(output)).length)throw Error('Fresh exclusive work capture output required');
 const work=join(output,'capture-work'),encryptedPath=join(output,'candidate.encrypted');await mkdir(work,{mode:0o700});let complete=false,receiptCreated=false;
 const db=new Client({connectionString:input.connectionString,connectionTimeoutMillis:5000,statement_timeout:5000});
 try{
  await db.connect();
  if(!local){
   const roles=(await db.query("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') ORDER BY rolname")).rows;
   if(roles.length!==2||roles[0].rolname!=='turas_runtime'||roles[0].rolcanlogin!==false||roles[1].rolname!=='turas_runtime_016'||roles[1].rolcanlogin!==true||roles.some(role=>role.rolsuper||role.rolcreatedb||role.rolcreaterole||role.rolreplication||role.rolbypassrls))throw Error('Retired legacy and restricted replacement runtime required');
  }
  const checkpoint=scope.purpose==='scheduled-backup'?withScheduledDatabaseCheckpoint:withRecoveryDatabaseCheckpoint;
  const candidate=await checkpoint(db,{...scope,signal:input.signal,scheduledNotBeforeCapturedAt:input.scheduledNotBeforeCapturedAt},async boundary=>{
   if(boundary.serverMajor!==18)throw Error('Hosted PostgreSQL 18 source required');
   const ledgerDigest=recoveryDigest((await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows);
   if(ledgerDigest!==scope.ledgerDigest)throw Error('Work capture installed ledger differs');
   const native=await runNativeRecoveryPgDump({assetRoot:input.assetRoot,connectionString:input.connectionString,environmentId:scope.environmentId,serverMajor:18,snapshot:boundary.snapshot,output:join(work,'database.dump'),signal:input.signal});
   const database={digest:native.digest,sizeBytes:native.sizeBytes,serverMajor:native.serverMajor,clientMajor:native.clientMajor};
   // Reserve archive-header/encryption overhead within the 64 MiB archive cap.
   const requiredObjects=await requiredRecoveryObjects(db,scope.environmentId);
   const objects=await captureRecoveryObjects({store:input.objects,environmentId:scope.environmentId,target:join(work,'objects'),signal:input.signal,maximumBytes:Math.min(input.maximumObjectBytes??25165824,67108864-native.sizeBytes-1048576-80),maximumObjects:input.maximumObjects??256,pageSize:1,requiredObjects});
   const databaseName=String((await db.query('SELECT current_database() AS name')).rows[0].name);
   const id=input.archiveId??randomUUID(),configurationDigest=recoveryDigest({environmentId:scope.environmentId,databaseName,sourceProjectId:scope.sourceProjectId,storeId:scope.storeId,backend:'private-blob',workflow:'managed-workflow',clientManifestDigest:native.clientManifestDigest});
   const captureProvenance={recoveryId:scope.recoveryId,controlRevision:scope.controlRevision,sourceCommit:scope.sourceCommit,sourceDigest:scope.sourceDigest,schemaVersion:79 as const,ledgerDigest,runtimeGrantsDigest:boundary.runtimeGrantsDigest,configurationDigest,acceptedContentDigest:boundary.acceptedContentDigest};
   const provenance={...captureProvenance,keyReference:scope.keyReference,keyVersion:scope.keyVersion};
   const header:BackupArchiveHeader={contract:'pilot-archive-v1',checkpointId:id,environmentId:scope.environmentId,capturedAt:boundary.capturedAt,provenance,entries:[{name:'database.dump',sizeBytes:database.sizeBytes,digest:database.digest},...objects.entries]};
   if(Buffer.byteLength(JSON.stringify(header))+header.entries.reduce((sum,row)=>sum+row.sizeBytes,0)+12+68>67108864)throw Error('Matched encrypted archive allowance exceeded');
   const archive=join(work,'candidate.archive'),packed=await packBackupArchive({header,files:new Map([['database.dump',join(work,'database.dump')],...objects.files]),output:archive,signal:input.signal});
   const encrypted=await encryptRecoveryFile(archive,encryptedPath,input.key,packed.headerDigest,input.signal);
   input.signal.throwIfAborted();
   return workCaptureCandidateSchema.parse({contract:'pilot-work-capture-candidate-v1',id,catalogDigest:scope.catalogDigest,environmentId:scope.environmentId,...captureProvenance,capturedAt:boundary.capturedAt,sourceDatabaseName:databaseName,database,objects:{inventoryDigest:objects.inventory.digest,objectCount:objects.inventory.objects.length,entries:objects.entries},workflow:{inventoryDigest:recoveryDigest([]),fileCount:0,entries:[],backend:'managed-workflow',capability:'interrupted-reconciliation',runtimeStoppedVerified:false,resumptionVerified:false,reconciliationVerified:false},encryptedBundle:{headerDigest:packed.headerDigest,...encrypted},key:{reference:scope.keyReference,version:scope.keyVersion,available:true,probeDigest:verifyRecoveryKey(input.key)},originalsRetained:true,currentAuthorityVerified:false,outsideCopyVerified:false,scheduledBackupVerified:false,restorationReady:false,mode:scope.purpose==='scheduled-backup'?'open':'locked',modelCalls:0,mailCalls:0});
  });
  const receipt=await open(join(output,'candidate.json'),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  receiptCreated=true;
  try{await receipt.writeFile(JSON.stringify(candidate));await receipt.sync();}finally{await receipt.close();}
  complete=true;return candidate;
 }finally{try{await db.end();}finally{await rm(work,{recursive:true,force:true});if(!complete){await rm(encryptedPath,{force:true});if(receiptCreated)await rm(join(output,'candidate.json'),{force:true});}}}
}
