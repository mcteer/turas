import {constants} from 'node:fs';
import {open,lstat,realpath,mkdir,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {backupArchiveHeader,type BackupArchiveHeader} from './backup-archive';
import {LocalPrivateObjects} from '../storage/local-objects';
import {objectKey,type ObjectNamespace} from '../storage/private-objects';
import {activeObjectNamespaces,verifiedObjectInventory} from '../storage/inventory';

/** Copies authenticated archive objects into a newly created disposable local
 * store. Never overwrites a live store or deletes source bytes. This component
 * provides no restored authority, workflow resumption or hosted-service proof. */
export async function restoreOwnedRecoveryObjects(input:{header:BackupArchiveHeader;unpacked:string;target:string;signal:AbortSignal}){
 requireOwnedPilotDatabase();input.signal.throwIfAborted();
 const header=backupArchiveHeader.parse(input.header),source=resolve(input.unpacked),target=resolve(input.target);
 async function privateDirectory(path:string){const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o700||await realpath(path)!==path)throw Error('Direct private restore directory required');}
 await privateDirectory(source);await privateDirectory(dirname(target));
 const entries=header.entries.filter(entry=>entry.name.startsWith('objects/'));
 if(entries.length>256||entries.reduce((sum,row)=>sum+row.sizeBytes,0)>24*1024*1024||entries.some(row=>row.sizeBytes>10485760))throw Error('Owned object restore allowance exceeded');
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
  const inventory=await verifiedObjectInventory(store,header.environmentId,activeObjectNamespaces,input.signal,{maximumObjects:256,maximumBytes:24*1024*1024});
  const expected=verified.map(({key,sizeBytes,digest})=>({key,sizeBytes,digest})).sort((a,b)=>a.key.localeCompare(b.key));
  const actual=inventory.objects.map(({key,sizeBytes,digest})=>({key,sizeBytes,digest})).sort((a,b)=>a.key.localeCompare(b.key));
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Restored object inventory differs');
  input.signal.throwIfAborted();complete=true;
  return {objectCount:verified.length,sizeBytes:verified.reduce((sum,row)=>sum+row.sizeBytes,0),inventoryDigest:inventory.digest,objectBytesVerified:true,originalsRetained:true,currentAuthorityVerified:false,restorationReady:false};
 }finally{for(const object of verified)object.bytes.fill(0);if(created&&!complete)await rm(target,{recursive:true,force:true});}
}
