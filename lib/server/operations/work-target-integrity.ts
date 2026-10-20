import{workIntegrityBlobAuth}from'./work-integrity-blob-auth';
import type {Client} from 'pg';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {workCaptureCandidateSchema} from '../../contracts/pilot-capture';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {withLockedWorkRecoveryDecision,requireLockedWorkRecoveryConnection,isWorkRecoveryDecisionClient,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {verifyRecoveryCandidate} from './candidate-verification';
import {verifyNativePostgresClient} from './native-postgres';
import {recoveryContentDigest} from './recovery-content';
import {currentRecoveryStateDigest} from './recovery-state';
import {recoveryGrantCheckpoint} from './grant-checkpoint';
import {requiredRecoveryObjects} from './required-objects';
import {verifiedObjectInventory,verifyRequiredObjects,activeObjectNamespaces} from '../storage/inventory';
import {BlobPrivateObjects} from '../storage/blob-objects';
import {BoundedWorkBackupObjects} from './work-backup-objects';
const storeIdSchema=z.string().regex(/^[A-Za-z0-9-]{1,128}$/);
const oidcSchema=z.string().max(16384).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
type Candidate=z.infer<typeof workCaptureCandidateSchema>;
type Material={candidate:Candidate;bundle:string;keyFile:string;assetRoot:string;storeId:string;oidcToken?:string;blobToken?:string};
export type WorkTargetIntegrityInput=Omit<Material,'candidate'>&{candidate:unknown;target:LockedWorkRecoveryInput};
export type WorkTargetIntegrity=Readonly<{contract:'pilot-work-target-integrity-v1';targetDigest:string;candidateId:string;encryptedBundleDigest:string;headerDigest:string;ledgerDigest:string;acceptedContentDigest:string;objectsDigest:string;objectCount:number;nativeManifestDigest:string;sourceGrantsDigest:string;targetGrantsDigest:string;measuredStateDigest:string;measuredAt:string;restorationReady:false}>;
const measured=new WeakMap<object,Material>();
const scope=(target:LockedWorkRecoveryTarget)=>({environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
const targetDigest=(target:LockedWorkRecoveryTarget)=>recoveryDigest({...scope(target),projectId:target.projectId,teamId:target.teamId,sourceCommit:target.sourceCommit,sourceDigest:target.sourceDigest,catalogDigest:target.catalogDigest,origin:target.origin,deploymentId:target.deploymentId,databaseBindingDigest:target.databaseBindingDigest});
function liveSignal(target:LockedWorkRecoveryTarget,signal:AbortSignal){signal.throwIfAborted();if(target.deadline<=Date.now())throw Error('Current finite integrity target required');return AbortSignal.any([signal,AbortSignal.timeout(target.deadline-Date.now())]);}
async function authenticate(material:Material,target:LockedWorkRecoveryTarget,signal:AbortSignal){
 const {candidate}=material,age=Date.now()-Date.parse(candidate.capturedAt);
 if(candidate.environmentId!==target.environmentId||!Number.isFinite(age)||age<0||age>86400000)throw Error('Applicable recovery candidate within accepted-work loss bound required');
 await verifyRecoveryCandidate({candidate,environmentId:target.environmentId,bundle:material.bundle,keyFile:material.keyFile,signal});
 const native=await verifyNativePostgresClient(material.assetRoot);
 const configurationDigest=recoveryDigest({environmentId:target.environmentId,databaseName:candidate.sourceDatabaseName,sourceProjectId:target.projectId,storeId:material.storeId,backend:'private-blob',workflow:'managed-workflow',clientManifestDigest:native.manifestDigest});
 if(configurationDigest!==candidate.configurationDigest)throw Error('Authenticated candidate store/native/project binding differs');
 signal.throwIfAborted();return native;
}
async function ledger(db:Client,candidate:Candidate){
 const actual=(await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows;
 const installed=JSON.parse(await readFile(resolve('migrations/manifest.json'),'utf8')).migrations.map((row:{file:string})=>({name:row.file.replace(/\.cjs$/,'')})).sort((a:{name:string},b:{name:string})=>a.name.localeCompare(b.name));
 if(JSON.stringify(actual)!==JSON.stringify(installed)||recoveryDigest(actual)!==candidate.ledgerDigest)throw Error('Work integrity installed ledger differs');
}
async function objects(db:Client,material:Material,target:LockedWorkRecoveryTarget,signal:AbortSignal){
 if(process.env.VERCEL_BLOB_RETRIES!=='0')throw Error('Work integrity requires disabled Blob retries');
 const store=new BoundedWorkBackupObjects(new BlobPrivateObjects(target.environmentId,workIntegrityBlobAuth(material.storeId,material),10485760),target.environmentId,256,25165824);
 const limits={maximumObjects:256,maximumBytes:25165824};
 const before=await verifiedObjectInventory(store,target.environmentId,activeObjectNamespaces,signal,limits);
 verifyRequiredObjects(before.objects,await requiredRecoveryObjects(db,target.environmentId),target.environmentId);
 const after=await verifiedObjectInventory(store,target.environmentId,activeObjectNamespaces,signal,limits);
 if(before.digest!==after.digest||after.digest!==material.candidate.objects.inventoryDigest||after.objects.length!==material.candidate.objects.objectCount)throw Error('Work integrity current original bytes differ');
 return after;
}
/** Physical proof before quarantine/probe mutations. Fixed genuine owner and
 * explicit private Blob transports only; this does not verify current denials or service. */
export async function measureWorkTargetIntegrity(input:WorkTargetIntegrityInput){
 const material:Material={candidate:workCaptureCandidateSchema.parse(input.candidate),bundle:resolve(input.bundle),keyFile:resolve(input.keyFile),assetRoot:resolve(input.assetRoot),storeId:storeIdSchema.parse(input.storeId),...(input.oidcToken!==undefined?{oidcToken:oidcSchema.parse(input.oidcToken)}:{}),...(input.blobToken!==undefined?{blobToken:z.string().min(1).max(8192).parse(input.blobToken)}:{})};
 workIntegrityBlobAuth(material.storeId,material);
 if(material.candidate.encryptedBundle.sizeBytes>67108864||material.candidate.objects.objectCount>256||material.candidate.objects.entries.reduce((sum,row)=>sum+row.sizeBytes,0)>25165824)throw Error('Work integrity candidate exceeds original capture allowance');
 const proof=await withLockedWorkRecoveryDecision(input.target,async(db,target)=>{
  const signal=liveSignal(target,input.target.signal),native=await authenticate(material,target,signal);
  await requireLockedWorkRecoveryConnection(db,target,scope(target));
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);
  const measuredStateDigest=await currentRecoveryStateDigest(db);await ledger(db,material.candidate);
  if(await recoveryContentDigest(db)!==material.candidate.acceptedContentDigest)throw Error('Work integrity captured database content differs');
  const inventory=await objects(db,material,target,signal),targetGrantsDigest=await recoveryGrantCheckpoint(db);signal.throwIfAborted();
  return Object.freeze({contract:'pilot-work-target-integrity-v1' as const,targetDigest:targetDigest(target),candidateId:material.candidate.id,encryptedBundleDigest:material.candidate.encryptedBundle.digest,headerDigest:material.candidate.encryptedBundle.headerDigest,ledgerDigest:material.candidate.ledgerDigest,acceptedContentDigest:material.candidate.acceptedContentDigest,objectsDigest:inventory.digest,objectCount:inventory.objects.length,nativeManifestDigest:native.manifestDigest,sourceGrantsDigest:material.candidate.runtimeGrantsDigest,targetGrantsDigest,measuredStateDigest,measuredAt:new Date().toISOString(),restorationReady:false as const});
 });
 measured.set(proof,material);return proof;
}
/** Consume only genuine live physical proof inside the controller-owned final
 * decision. Authority/probe rows may have changed legitimately since restore;
 * current deny/replay/service capabilities must independently account for them. */
export async function requireMeasuredWorkTargetIntegrity(db:Client,target:LockedWorkRecoveryTarget,proof:WorkTargetIntegrity,signal:AbortSignal){
 const material=measured.get(proof),age=Date.now()-Date.parse(proof.measuredAt);
 if(!material||!isWorkRecoveryDecisionClient(db)||proof.targetDigest!==targetDigest(target)||!Number.isFinite(age)||age<0||age>14400000)throw Error('Genuine current work target integrity required');
 const bounded=liveSignal(target,signal);await requireLockedWorkRecoveryConnection(db,target,scope(target));
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);await currentRecoveryStateDigest(db);
 const native=await authenticate(material,target,bounded);await ledger(db,material.candidate);
 if(native.manifestDigest!==proof.nativeManifestDigest||await recoveryGrantCheckpoint(db)!==proof.targetGrantsDigest)throw Error('Measured work integrity native/grant binding changed');
 await objects(db,material,target,bounded);bounded.throwIfAborted();return proof;
}

/** Lost-COMMIT acknowledgement recovery only. Authenticate the original cold
 * bytes and current physical originals without rebasing captured database truth
 * onto legitimate post-restore quarantine/probe mutations. The caller must first
 * find an immutable complete verification and match its exact current state. */
export async function authenticateCommittedWorkTargetIntegrity(db:Client,target:LockedWorkRecoveryTarget,input:WorkTargetIntegrityInput,signal:AbortSignal){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine committed integrity owner required');
 const material:Material={candidate:workCaptureCandidateSchema.parse(input.candidate),bundle:resolve(input.bundle),keyFile:resolve(input.keyFile),assetRoot:resolve(input.assetRoot),storeId:storeIdSchema.parse(input.storeId),...(input.oidcToken!==undefined?{oidcToken:oidcSchema.parse(input.oidcToken)}:{}),...(input.blobToken!==undefined?{blobToken:z.string().min(1).max(8192).parse(input.blobToken)}:{})};
 workIntegrityBlobAuth(material.storeId,material);
 if(material.candidate.encryptedBundle.sizeBytes>67108864||material.candidate.objects.objectCount>256||material.candidate.objects.entries.reduce((sum,row)=>sum+row.sizeBytes,0)>25165824)throw Error('Work integrity candidate exceeds original capture allowance');
 await requireLockedWorkRecoveryConnection(db,target,scope(target));const bounded=liveSignal(target,signal);await authenticate(material,target,bounded);await ledger(db,material.candidate);const inventory=await objects(db,material,target,bounded);bounded.throwIfAborted();
 return {bundleDigest:material.candidate.encryptedBundle.digest,ledgerDigest:material.candidate.ledgerDigest,objectsDigest:inventory.digest};
}
