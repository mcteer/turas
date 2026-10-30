import {WORK_BACKUP_LIMITS} from './work-backup-limits';
import {constants} from 'node:fs';
import {open,lstat,realpath,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {backupArchiveHeader,type BackupArchiveHeader} from './backup-archive';
import {LocalPrivateObjects} from '../storage/local-objects';
import {objectKey,type ObjectNamespace} from '../storage/private-objects';
import {LegacyLocalPrivateObjects} from '../storage/legacy-local-objects';
import {verifiedBytes,validateObjectKey,environmentObjectId} from '../storage/private-objects';
import {activeObjectNamespaces,verifiedObjectInventory} from '../storage/inventory';

/** Copies authenticated archive objects into a newly created disposable local
 * store. Never overwrites a live store or deletes source bytes. This component
 * provides no restored authority, workflow resumption or hosted-service proof. */
export async function restoreOwnedRecoveryObjects(input:{header:BackupArchiveHeader;unpacked:string;target:string;signal:AbortSignal;maximumBytes?:number}){
 requireOwnedPilotDatabase();input.signal.throwIfAborted();
 const header=backupArchiveHeader.parse(input.header),source=resolve(input.unpacked),target=resolve(input.target);
 async function privateDirectory(path:string){const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o700||await realpath(path)!==path)throw Error('Direct private restore directory required');}
 await privateDirectory(source);await privateDirectory(dirname(target));
 const entries=header.entries.filter(entry=>entry.name.startsWith('objects/')),maximumBytes=input.maximumBytes??WORK_BACKUP_LIMITS.legacyObjectBytes;
 if(!Number.isSafeInteger(maximumBytes)||maximumBytes<0||maximumBytes>WORK_BACKUP_LIMITS.objectBytes)throw Error('Bounded owned object restore allowance required');
 if(entries.length>256||entries.reduce((sum,row)=>sum+row.sizeBytes,0)>maximumBytes||entries.some(row=>row.sizeBytes>10485760))throw Error('Owned object restore allowance exceeded');
 const verified:Array<{key:string;bytes:Buffer;sizeBytes:number;digest:string}>=[];
 // Authenticate every source before creating the destination. A corrupt late
 // entry cannot leave an apparently usable partially restored store.
 try{for(const entry of entries){
  input.signal.throwIfAborted();const [,namespace,id]=entry.name.split('/'),path=join(source,entry.name);
  const key=objectKey(header.environmentId,namespace as ObjectNamespace,id);
  await privateDirectory(dirname(path));
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const info=await file.stat();if(!info.isFile()||info.nlink!==1||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600||info.size!==entry.sizeBytes)throw Error('Private restore object differs');
   const bytes=await file.readFile();input.signal.throwIfAborted();if(bytes.length!==entry.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==entry.digest)throw Error('Restore object integrity differs');
   verified.push({key,bytes,sizeBytes:entry.sizeBytes,digest:entry.digest});
  }finally{await file.close();}
 }}catch(error){for(const object of verified)object.bytes.fill(0);throw error;}
 let created=false,complete=false;
 try{
  await mkdir(target,{mode:0o700});created=true;
  const store=new LocalPrivateObjects(target,header.environmentId,10485760);
  for(const namespace of activeObjectNamespaces)await mkdir(dirname(join(target,objectKey(header.environmentId,namespace,'0'.repeat(64)))),{recursive:true,mode:0o700});
  for(const object of verified){input.signal.throwIfAborted();await store.put(object.key,(async function*(){yield object.bytes;})(),object);}
  const inventory=await verifiedObjectInventory(store,header.environmentId,activeObjectNamespaces,input.signal,{maximumObjects:256,maximumBytes});
  const expected=verified.map(({key,sizeBytes,digest})=>({key,sizeBytes,digest})).sort((a,b)=>a.key.localeCompare(b.key));
  const actual=inventory.objects.map(({key,sizeBytes,digest})=>({key,sizeBytes,digest})).sort((a,b)=>a.key.localeCompare(b.key));
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Restored object inventory differs');
  input.signal.throwIfAborted();complete=true;
  return {objectCount:verified.length,sizeBytes:verified.reduce((sum,row)=>sum+row.sizeBytes,0),inventoryDigest:inventory.digest,objectBytesVerified:true,originalsRetained:true,currentAuthorityVerified:false,restorationReady:false};
 }finally{for(const object of verified)object.bytes.fill(0);if(created&&!complete)await rm(target,{recursive:true,force:true});}
}

/** Materialize measured restored bytes for the unchanged canonical local domain
 * adapters. Filesystem parity only: no authority, database grant or readiness is
 * created. Caller must bind/recheck its actual restore integrity separately. */
export async function materializeOwnedRecoveryStores(input:{sourceRoot:string;target:string;environmentId:string;signal:AbortSignal;maximumBytes?:number}){
 requireOwnedPilotDatabase();
 const signal=AbortSignal.any([input.signal,AbortSignal.timeout(60000)]),source=resolve(input.sourceRoot),target=resolve(input.target);
 const privateDirectory=async(path:string)=>{const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o700||await realpath(path)!==path)throw Error('Direct private recovery store required');};
 signal.throwIfAborted();await privateDirectory(source);await privateDirectory(dirname(target));
 if(dirname(target)!==dirname(source)||source===target)throw Error('Fresh sibling recovery store required');
 const maximumBytes=input.maximumBytes??WORK_BACKUP_LIMITS.legacyObjectBytes;if(!Number.isSafeInteger(maximumBytes)||maximumBytes<0||maximumBytes>WORK_BACKUP_LIMITS.objectBytes)throw Error('Bounded owned object restore allowance required');
 const store=new LocalPrivateObjects(source,input.environmentId,10485760),limits={maximumObjects:256,maximumBytes};
 const inventory=await verifiedObjectInventory(store,input.environmentId,activeObjectNamespaces,signal,limits),reportNamespaces=new Map<string,'report'|'gap-report'>();
 // Reject every unrepresentable or colliding identity before creating anything.
 const locations=inventory.objects.map(object=>{
  const namespace=validateObjectKey(object.key,environmentObjectId(input.environmentId)),id=object.key.split('/').at(-1)!;
  if(object.sizeBytes<1||namespace.startsWith('artifact')&&!/^[a-f0-9]{64}$/.test(id)||!namespace.startsWith('artifact')&&!/^[a-f0-9-]{36}$/.test(id))throw Error('Canonical recovery object identity differs');
  const kind=namespace.startsWith('artifact')?'artifact':namespace.startsWith('workforce')?'workforce':'report';
  if(namespace==='report'||namespace==='gap-report'){if(reportNamespaces.has(id))throw Error('Canonical recovery report identity collision');reportNamespaces.set(id,namespace);}
  return {object,kind,directory:namespace.endsWith('-staging')?'staged':'objects',id};
 });
 const roots={artifactRoot:join(target,'artifact'),workforceRoot:join(target,'workforce'),reportRoot:join(target,'report')};
 let created=false,complete=false;
 try{
  await mkdir(target,{mode:0o700});created=true;
  for(const kind of ['artifact','workforce','report'] as const){
   const root=join(target,kind);await mkdir(root,{mode:0o700});
   await writeFile(join(root,`.turas-${kind}-store.json`),JSON.stringify({environmentId:input.environmentId}),{mode:0o600,flag:'wx'});
   for(const directory of ['objects','staged'])await mkdir(join(root,directory),{mode:0o700});
  }
  // These per-lease copies are disposable. Await writes and close before full
  // source/destination hash verification; durable restored originals are retained.
  for(const {object,kind,directory,id} of locations){
   signal.throwIfAborted();const bytes=await verifiedBytes(await store.stream(object.key,object),object,10485760);
   try{signal.throwIfAborted();const file=await open(join(target,kind,directory,id),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);try{await file.writeFile(bytes);}finally{await file.close();}}finally{bytes.fill(0);}
  }
  const destination=new LegacyLocalPrivateObjects({environmentId:input.environmentId,...roots,reportNamespaces});
  const cold=await verifiedObjectInventory(destination,input.environmentId,activeObjectNamespaces,signal,limits),current=await verifiedObjectInventory(store,input.environmentId,activeObjectNamespaces,signal,limits);
  if(cold.digest!==inventory.digest||current.digest!==inventory.digest)throw Error('Canonical recovery store parity differs');
  signal.throwIfAborted();complete=true;
  return {...roots,inventoryDigest:inventory.digest,objectCount:inventory.objects.length,originalsRetained:true as const,canonicalStoreParityVerified:true as const,currentAuthorityVerified:false as const,restorationReady:false as const};
 }finally{if(created&&!complete)await rm(target,{recursive:true,force:true});}
}
