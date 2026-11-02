import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import {readRetainedWorkDenialSnapshot} from './pilot-denial-reader';
import {Client} from 'pg';
import {z} from 'zod';
import {resolve,dirname,basename,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {withPilotEnvironment} from './pilot-environment';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from './pilot-neon-archive';
import {readWorkRecoveryKey,workRecoveryKeyReferenceSchema} from './pilot-database-safety-copy';
import {neonArchiveScopeSchema,downloadNeonEncryptedArchive} from '../lib/server/operations/neon-archive';
import {decryptRecoveryFile} from '../lib/server/operations/backup-crypto';
import {restoreOwnedLegacySafetyCopy} from '../lib/server/operations/legacy-safety-restore';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {recoveryDigest} from '../lib/contracts/pilot-recovery';
import {databaseSafetyBoundarySchema} from '../lib/server/operations/database-safety-boundary';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const legacySafetyContextSchema=z.strictObject({contract:z.literal('pilot-database-safety-copy-v2'),id:z.uuid(),sourceProjectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),environmentId:z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/),schemaVersion:z.literal(55),capturedAt:z.iso.datetime({offset:true}),ledgerDigest:digest,applicationContentDigest:digest,sourceDatabaseName:z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/),serverMajor:z.union([z.literal(17),z.literal(18)]),dumpDigest:digest,dumpBytes:z.number().int().positive().max(67108864),matchedServiceCheckpoint:z.literal(false)});
export const targetedSafetyContextSchema=z.strictObject({...legacySafetyContextSchema.shape,contract:z.literal('pilot-database-safety-copy-v3'),sourceTarget:z.enum(['preview','production']),schemaVersion:z.union([z.literal(38),z.literal(55),z.literal(57),z.literal(77),z.literal(79),z.literal(80),z.literal(81),z.literal(82),z.literal(83),z.literal(84),z.literal(CURRENT_SCHEMA_VERSION)])}).superRefine((value,ctx)=>{
 if(value.schemaVersion===38&&value.sourceTarget!=='preview')ctx.addIssue({code:'custom',message:'Schema 38 safety context requires Preview'});
});
export const observedSafetyContextSchema=z.strictObject({...legacySafetyContextSchema.shape,contract:z.literal('pilot-database-safety-copy-v4'),sourceTarget:z.enum(['preview','production']),schemaVersion:z.union([z.literal(77),z.literal(79),z.literal(80),z.literal(81),z.literal(82),z.literal(83),z.literal(84),z.literal(CURRENT_SCHEMA_VERSION)]),databaseBoundary:databaseSafetyBoundarySchema}).refine(value=>value.capturedAt===value.databaseBoundary.capturedAt,'Exact snapshot observation time required');
/** Authenticate a supported target-bound safety archive in an owned disposable
 * target, rehearse through the current migration, quarantine, then destroy only that owned target. */
export async function pilotLegacySafetyRehearsal(args:string[]){
 const denialReceipt=args.length===9&&args[7]==='--denial-receipt'?args[8]:undefined;
 if((args.length!==7&&!denialReceipt)||denialReceipt?.startsWith('--')||args[0]!=='--restore-database-safety-copy'||args[1]!=='--receipt'||args[3]!=='--destination'||args[5]!=='--output'||args.slice(1,7).some((value,index)=>index%2===1&&(!value||value.startsWith('--'))))throw Error('Explicit legacy safety-copy receipt destination and output required');
 const file=resolve(args[2]),destinationFile=resolve(args[4]),root=resolve(args[6]);
 const receipt=await readEvidence(dirname(file),basename(file)) as Record<string,unknown>;
 const contextSchema=receipt.contract==='pilot-database-safety-copy-v4'?observedSafetyContextSchema:receipt.contract==='pilot-database-safety-copy-v3'?targetedSafetyContextSchema:legacySafetyContextSchema;
 const context=contextSchema.parse(Object.fromEntries(Object.keys(contextSchema.shape).map(key=>[key,receipt[key]])));
 const archive=neonArchiveScopeSchema.parse(receipt.archive),reference=workRecoveryKeyReferenceSchema.parse(receipt.keyReference),destination=neonArchiveDestinationSchema.parse(await readEvidence(dirname(destinationFile),basename(destinationFile)));
 if(context.sourceProjectId!==destination.sourceProjectId||archive.installationId!==destination.installationId||archive.id!==context.id||archive.environmentId!==context.environmentId||archive.capturedAt!==context.capturedAt||archive.headerDigest!==recoveryDigest(context)||archive.sizeBytes!==context.dumpBytes+68||reference.projectId!==destination.operatorProjectId||reference.name!=='TURAS_RECOVERY_KEY_'+context.id.replaceAll('-','').toUpperCase())throw Error('Exact authenticated legacy safety context required');
 const now=Date.now();if(Date.parse(context.capturedAt)>now||now-Date.parse(context.capturedAt)>86400000||Date.parse(archive.expiresAt)<=now)throw Error('Fresh unexpired legacy safety copy required');
 const source=await pilotSource(),before=await pilotProtectedSnapshot(),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(360000,async signal=>{
  const staging=await mkdtemp(join(root,'private-staging-'));let key:Buffer|undefined;
  try{
   const cloud=await verifyWorkNeonDestination(destination,signal);key=await readWorkRecoveryKey(reference,destination.teamId,destination.operatorProjectId,signal);
   const cold=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});
   try{await cold.connect();await downloadNeonEncryptedArchive(cold,archive,join(staging,'legacy.encrypted'),signal);}finally{await cold.end();}
   await decryptRecoveryFile(join(staging,'legacy.encrypted'),join(staging,'legacy.dump'),key,archive.headerDigest,signal);
   signal.throwIfAborted();
   const denials=denialReceipt?await readRetainedWorkDenialSnapshot({receipt:denialReceipt,destination:destinationFile,staging,environmentId:context.environmentId,after:context.capturedAt},signal):undefined;
   const result=await withPilotEnvironment(async environment=>restoreOwnedLegacySafetyCopy({dump:join(staging,'legacy.dump'),digest:context.dumpDigest,sizeBytes:context.dumpBytes,sourceEnvironmentId:context.environmentId,sourceDatabaseName:context.sourceDatabaseName,sourceSchema:context.schemaVersion,sourceTarget:context.contract!=='pilot-database-safety-copy-v2'?context.sourceTarget:'production',serverMajor:context.serverMajor,applicationContentDigest:context.applicationContentDigest,ledgerDigest:context.ledgerDigest,...(context.contract==='pilot-database-safety-copy-v4'?{databaseBoundary:context.databaseBoundary}:{})},AbortSignal.any([signal,environment.signal]),denials),{priorSchema:context.schemaVersion===CURRENT_SCHEMA_VERSION?undefined:context.schemaVersion,postgresMajor:context.serverMajor,deadlineMs:240000});
   if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Legacy safety rehearsal source destination or protected checkout changed');
   const {contract:databaseRestoreContract,...restored}=result;
   const completed={contract:'pilot-legacy-safety-rehearsal-v1',databaseRestoreContract,id,...source,cloud,archiveId:context.id,recordedAt:new Date().toISOString(),...restored,ownedTargetRemoved:true,primaryDatabaseChanged:false,privateObjectsRestored:false,currentAuthorityVerified:false,workflowResumed:false,fullServiceRecoveryVerified:false,restorationReady:false};
   await writeEvidence(root,'rehearsal.json',completed);console.info(JSON.stringify({legacyDatabaseRestore:'pass',forwardMigrations:'pass',mode:'locked',ownedTargetRemoved:true,primaryDatabaseChanged:false,fullServiceRecoveryVerified:false}));return completed;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,archiveId:context.id,state:'fail',safeFailure:'incomplete_legacy_safety_rehearsal',primaryDatabaseChanged:false,restorationReady:false});throw error;}
  finally{key?.fill(0);await rm(staging,{recursive:true,force:true});}
 });
}
