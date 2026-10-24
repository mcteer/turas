import {pilotCaptureCandidateSchema} from '../../contracts/pilot-capture';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdir,rm} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {z} from 'zod';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotSource} from '../../../scripts/pilot-source';
import {createEvidenceDirectory,writeEvidence} from '../../../scripts/pilot-evidence';
import {withRecoveryDatabaseCheckpoint} from './database-checkpoint';
import {withPrivateRecoveryKey} from './recovery-key';
import {runRecoveryPgDump} from './pg-dump';
import {captureRecoveryObjects} from './object-checkpoint';
import {requiredRecoveryObjects} from './required-objects';
import {captureOwnedWorkflow} from './workflow-checkpoint';
import {packBackupArchive,type BackupArchiveHeader} from './backup-archive';
import {encryptRecoveryFile} from './backup-crypto';
import {LocalPrivateObjects} from '../storage/local-objects';
import {recoveryDigest} from '../../contracts/pilot-recovery';
const identity=z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/);
const inputSchema=z.strictObject({environmentId:identity,recoveryId:z.uuid(),controlRevision:z.number().int().positive(),sourceRoot:z.string().min(1),workflowRoot:z.string().min(1),keyFile:z.string().min(1),keyReference:identity,keyVersion:identity,output:z.string().min(1)});
const nested=(a:string,b:string)=>{const rel=relative(a,b);return rel===''||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel));};
/** Matched byte/database capture, not a recovery manifest. Independently current
 * authority, stopped/resumable native runtime and outside-domain copy are still
 * required. Caller labels cannot turn this candidate into verified recovery. */
export async function captureOwnedRecoveryCandidate(raw:z.infer<typeof inputSchema>,signal:AbortSignal){
 const input=inputSchema.parse(raw),connection=requireOwnedPilotDatabase(process.env,true);if(input.environmentId!==process.env.TURAS_ENVIRONMENT_ID)throw Error('Capture environment differs');
 const sourceRoot=resolve(input.sourceRoot),workflowRoot=resolve(input.workflowRoot),output=resolve(input.output);
 if([sourceRoot,workflowRoot].some(root=>nested(root,output)||nested(output,root))||nested(sourceRoot,workflowRoot)||nested(workflowRoot,sourceRoot))throw Error('Separate source workflow and archive roots required');
 signal.throwIfAborted();const source=await pilotSource();await createEvidenceDirectory(output);const work=join(output,'capture-work'),encryptedPath=join(output,'candidate.encrypted');await mkdir(work,{mode:0o700});let complete=false;
 try{const candidate=await withPrivateRecoveryKey({file:input.keyFile,excludedRoots:[sourceRoot,workflowRoot,output],signal},async(key,probeDigest)=>{
  const db=new Client({connectionString:connection,connectionTimeoutMillis:5000});await db.connect();
  try{return await withRecoveryDatabaseCheckpoint(db,{environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,signal},async boundary=>{
   const id=randomUUID(),database=await runRecoveryPgDump({environmentId:input.environmentId,serverMajor:boundary.serverMajor,snapshot:boundary.snapshot,output:join(work,'database.dump'),signal});
   const requiredObjects=await requiredRecoveryObjects(db,input.environmentId);
   const objects=await captureRecoveryObjects({store:new LocalPrivateObjects(sourceRoot,input.environmentId,10485760),environmentId:input.environmentId,target:join(work,'objects'),signal,requiredObjects});
   const workflow=await captureOwnedWorkflow({source:workflowRoot,target:join(work,'workflow'),signal});
   const ledgerDigest=recoveryDigest((await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows),databaseName=String((await db.query('SELECT current_database() AS name')).rows[0].name);
   const configurationDigest=recoveryDigest({environmentId:input.environmentId,databaseName,backend:'owned-local',sourceRoot,workflowRoot});
   const header:BackupArchiveHeader={contract:'pilot-archive-v1',checkpointId:id,environmentId:input.environmentId,capturedAt:boundary.capturedAt,provenance:{recoveryId:input.recoveryId,controlRevision:input.controlRevision,sourceCommit:source.sourceCommit,sourceDigest:source.sourceDigest,schemaVersion:79,ledgerDigest,runtimeGrantsDigest:boundary.runtimeGrantsDigest,configurationDigest,acceptedContentDigest:boundary.acceptedContentDigest,keyReference:input.keyReference,keyVersion:input.keyVersion},entries:[{name:'database.dump',sizeBytes:database.sizeBytes,digest:database.digest},...objects.entries,...workflow.entries]};
   const archive=join(work,'candidate.archive'),packed=await packBackupArchive({header,files:new Map([['database.dump',join(work,'database.dump')],...objects.files,...workflow.files]),output:archive,signal}),encrypted=await encryptRecoveryFile(archive,encryptedPath,key,packed.headerDigest,signal);
   signal.throwIfAborted();if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Capture source changed');
   const candidate={contract:'pilot-capture-candidate-v1',id,...source,environmentId:input.environmentId,recoveryId:input.recoveryId,controlRevision:input.controlRevision,capturedAt:boundary.capturedAt,sourceDatabaseName:databaseName,schemaVersion:79,ledgerDigest,runtimeGrantsDigest:boundary.runtimeGrantsDigest,acceptedContentDigest:boundary.acceptedContentDigest,configurationDigest,database:{...database},objects:{inventoryDigest:objects.inventory.digest,objectCount:objects.inventory.objects.length,entries:objects.entries},workflow:{inventoryDigest:workflow.inventoryDigest,fileCount:workflow.entries.length,entries:workflow.entries,stableBytesCaptured:true,runtimeStoppedVerified:false,resumptionVerified:false},encryptedBundle:{headerDigest:packed.headerDigest,...encrypted},key:{reference:input.keyReference,version:input.keyVersion,available:true,probeDigest},originalsRetained:true,currentAuthorityVerified:false,outsideCopyVerified:false,scheduledBackupVerified:false,restorationReady:false,mode:'locked',providerCalls:0};
   return candidate;
  });}finally{await db.end();}
 });const parsed=pilotCaptureCandidateSchema.parse(candidate);await writeEvidence(output,'candidate.json',parsed);complete=true;return parsed;}finally{await rm(work,{recursive:true,force:true});if(!complete){await rm(encryptedPath,{force:true});await rm(join(output,'candidate.json'),{force:true});}}
}
