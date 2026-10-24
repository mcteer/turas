import {constants} from 'node:fs';
import {open,lstat,mkdtemp,rm,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyRecoveryManifest,recoveryDigest,type RecoveryManifest} from '../../contracts/pilot-recovery';
import {objectKey} from '../storage/private-objects';
import {withPrivateRecoveryKey} from './recovery-key';
import {decryptRecoveryFile} from './backup-crypto';
import {unpackBackupArchive,type BackupArchiveHeader} from './backup-archive';
export function verifyRecoveryArchiveIndex(header:BackupArchiveHeader,manifest:RecoveryManifest){
 const provenance={recoveryId:manifest.recoveryId,controlRevision:manifest.controlRevision,sourceCommit:manifest.sourceCommit,sourceDigest:manifest.sourceDigest,schemaVersion:manifest.schemaVersion,ledgerDigest:manifest.ledgerDigest,runtimeGrantsDigest:manifest.runtimeGrantsDigest,configurationDigest:manifest.configurationDigest,acceptedContentDigest:manifest.acceptedContentDigest,keyReference:manifest.key.reference,keyVersion:manifest.key.version};
 if(header.checkpointId!==manifest.id||header.environmentId!==manifest.environmentId||header.capturedAt!==manifest.capturedAt||JSON.stringify(header.provenance)!==JSON.stringify(provenance))throw Error('Archive capture provenance differs');
 const database=header.entries.find(entry=>entry.name==='database.dump');if(!database||database.digest!==manifest.database.dumpDigest||database.sizeBytes!==manifest.database.dumpBytes||manifest.database.checkpoint.digest!==database.digest)throw Error('Database checkpoint differs');
 for(const store of manifest.stores){const objects=header.entries.filter(entry=>entry.name.startsWith('objects/'+store.kind+'/')||['artifact','workforce'].includes(store.kind)&&entry.name.startsWith('objects/'+store.kind+'-staging/')).map(entry=>{const [,namespace,id]=entry.name.split('/');return {key:objectKey(manifest.environmentId,namespace as 'artifact',id),sizeBytes:entry.sizeBytes,digest:entry.digest};}).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  const digest=recoveryDigest(objects);if(objects.length!==store.objectCount||digest!==store.inventoryDigest||digest!==store.checkpoint.digest)throw Error('Private store checkpoint differs');}
 const workflow=header.entries.filter(entry=>entry.name.startsWith('workflow/'));
 if(manifest.workflow.backend==='managed-workflow'&&workflow.length||recoveryDigest(workflow)!==manifest.workflow.checkpoint.digest)throw Error('Workflow inventory differs');
}
export async function verifyEncryptedRecoveryBundle(input:{manifest:unknown;environmentId:string;ledgerDigest:string;bundle:string;keyFile:string;signal:AbortSignal}){
 const manifest=verifyRecoveryManifest(input.manifest,{environmentId:input.environmentId,ledgerDigest:input.ledgerDigest}),bundle=resolve(input.bundle),parent=dirname(bundle),stat=await lstat(parent);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid?.()||await realpath(parent)!==parent)throw Error('Private backup directory required');
 const file=await open(bundle,constants.O_RDONLY|constants.O_NOFOLLOW);try{const info=await file.stat();if(!info.isFile()||info.nlink!==1||(info.mode&0o777)!==0o600||info.uid!==process.getuid?.()||info.size!==manifest.encryptedBundle.sizeBytes)throw Error('Encrypted backup inventory differs');const hash=createHash('sha256'),buffer=Buffer.alloc(65536);for(let position=0;position<info.size;){input.signal.throwIfAborted();const read=await file.read(buffer,0,Math.min(buffer.length,info.size-position),position);if(!read.bytesRead)throw Error('Encrypted backup truncated');hash.update(buffer.subarray(0,read.bytesRead));position+=read.bytesRead;}if(hash.digest('hex')!==manifest.encryptedBundle.digest||(await file.stat()).size!==info.size)throw Error('Encrypted backup digest differs');}finally{await file.close();}
 const temporary=await mkdtemp(join(parent,'verify-'));
 try{return await withPrivateRecoveryKey({file:input.keyFile,excludedRoots:[parent],signal:input.signal},async key=>{const archive=join(temporary,'matched.archive');await decryptRecoveryFile(bundle,archive,key,manifest.encryptedBundle.headerDigest,input.signal);const header=await unpackBackupArchive({archive,target:join(temporary,'verified'),expectedHeaderDigest:manifest.encryptedBundle.headerDigest,environmentId:manifest.environmentId,checkpointId:manifest.id,signal:input.signal});verifyRecoveryArchiveIndex(header,manifest);return {integrityVerified:true as const,objectCount:manifest.stores.reduce((total,store)=>total+store.objectCount,0),restorationReady:false as const,currentAuthorityVerified:false as const,outsideFailureDomainVerified:false as const};});}
 finally{await rm(temporary,{recursive:true,force:true});}
}
