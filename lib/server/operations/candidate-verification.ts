import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pilotCaptureCandidateSchema,workCaptureCandidateSchema} from '../../contracts/pilot-capture';
import {backupArchiveHeader,verifyBackupArchiveChunks} from './backup-archive';
import {withPrivateRecoveryKey} from './recovery-key';
import {decryptRecoveryChunks} from './backup-crypto';
import {objectKey,type ObjectNamespace} from '../storage/private-objects';
/** Authenticate bytes and capture provenance only. Does not restore SQL, verify
 * current permissions/replay, certify an outside copy, resume or unlock. */
export async function verifyRecoveryCandidate(input:{candidate:unknown;environmentId:string;bundle:string;keyFile:string;signal:AbortSignal;excludedKeyRoots?:readonly string[]}){
 const candidate=(input.candidate as {contract?:unknown}|null)?.contract==='pilot-work-capture-candidate-v1'?workCaptureCandidateSchema.parse(input.candidate):pilotCaptureCandidateSchema.parse(input.candidate);if(candidate.environmentId!==input.environmentId||Date.parse(candidate.capturedAt)>Date.now())throw Error('Candidate environment or time differs');
 const expected=backupArchiveHeader.parse({contract:'pilot-archive-v1',checkpointId:candidate.id,environmentId:candidate.environmentId,capturedAt:candidate.capturedAt,provenance:{recoveryId:candidate.recoveryId,controlRevision:candidate.controlRevision,sourceCommit:candidate.sourceCommit,sourceDigest:candidate.sourceDigest,schemaVersion:candidate.schemaVersion,ledgerDigest:candidate.ledgerDigest,runtimeGrantsDigest:candidate.runtimeGrantsDigest,configurationDigest:candidate.configurationDigest,acceptedContentDigest:candidate.acceptedContentDigest,keyReference:candidate.key.reference,keyVersion:candidate.key.version},entries:[{name:'database.dump',sizeBytes:candidate.database.sizeBytes,digest:candidate.database.digest},...candidate.objects.entries,...candidate.workflow.entries]});
 const bundle=resolve(input.bundle),parent=dirname(bundle),directory=await lstat(parent);
 if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o777)!==0o700||directory.uid!==process.getuid?.()||await realpath(parent)!==parent)throw Error('Private candidate directory required');
 input.signal.throwIfAborted();const file=await open(bundle,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=await file.stat();if(!before.isFile()||before.nlink!==1||(before.mode&0o777)!==0o600||before.uid!==process.getuid?.()||before.size!==candidate.encryptedBundle.sizeBytes)throw Error('Candidate encrypted inventory differs');
 const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;while(position<before.size){input.signal.throwIfAborted();const read=await file.read(buffer,0,Math.min(buffer.length,before.size-position),position);if(!read.bytesRead)throw Error('Candidate truncated');position+=read.bytesRead;hash.update(buffer.subarray(0,read.bytesRead));}const after=await file.stat();if(hash.digest('hex')!==candidate.encryptedBundle.digest||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('Candidate encrypted digest differs');
 }finally{await file.close();}
 return withPrivateRecoveryKey({file:input.keyFile,excludedRoots:[parent,...input.excludedKeyRoots??[]],signal:input.signal},async key=>{
 const header=await verifyBackupArchiveChunks({chunks:decryptRecoveryChunks(bundle,key,candidate.encryptedBundle.headerDigest,input.signal,candidate.encryptedBundle.digest),expectedHeaderDigest:candidate.encryptedBundle.headerDigest,environmentId:candidate.environmentId,checkpointId:candidate.id,signal:input.signal});
 if(JSON.stringify(header)!==JSON.stringify(expected))throw Error('Candidate authenticated provenance differs');
 const objects=candidate.objects.entries.map(row=>{const [,namespace,id]=row.name.split('/');return {key:objectKey(candidate.environmentId,namespace as ObjectNamespace,id),digest:row.digest,sizeBytes:row.sizeBytes};}).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 if(sha(objects)!==candidate.objects.inventoryDigest||sha(candidate.workflow.entries)!==candidate.workflow.inventoryDigest)throw Error('Candidate inventory digest differs');
 input.signal.throwIfAborted();return {contract:'pilot-candidate-verification-v1' as const,candidateId:candidate.id,environmentId:candidate.environmentId,encryptedDigest:candidate.encryptedBundle.digest,headerDigest:candidate.encryptedBundle.headerDigest,archiveIntegrityVerified:true as const,captureProvenanceVerified:true as const,objectCount:objects.length,workflowFiles:candidate.workflow.fileCount,sourceDatabaseNameAuthenticated:false as const,catalogDigestAuthenticated:false as const,databaseRestoreVerified:false as const,workflowResumptionVerified:false as const,currentAuthorityVerified:false as const,outsideCopyVerified:false as const,restorationReady:false as const,...(candidate.contract==='pilot-work-capture-candidate-v1'?{modelCalls:0,mailCalls:0}:{providerCalls:0})};
 });
}
