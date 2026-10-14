import {constants} from 'node:fs';
import {mkdir,lstat,realpath,open,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifiedObjectInventory,activeObjectNamespaces,verifyRequiredObjects} from '../storage/inventory';
import {environmentObjectId,validateObjectKey,type PrivateObjects,type ObjectDescriptor} from '../storage/private-objects';
import type {BackupArchiveHeader} from './backup-archive';
/** Caller holds the owner capture fence throughout. Make private single-link
 * copies for the archive, retaining originals and verifying both inventories. */
export async function captureRecoveryObjects(input:{store:PrivateObjects;environmentId:string;target:string;signal:AbortSignal;maximumBytes?:number;maximumObjects?:number;pageSize?:number;requiredObjects?:readonly ObjectDescriptor[]}){
 input.signal.throwIfAborted();const target=resolve(input.target),parent=dirname(target),info=await lstat(parent);
 if(await realpath(parent)!==parent||!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o777)!==0o700||info.uid!==process.getuid?.())throw Error('Private checkpoint parent required');
 const limits={maximumBytes:input.maximumBytes,maximumObjects:input.maximumObjects,pageSize:input.pageSize};
 const before=await verifiedObjectInventory(input.store,input.environmentId,activeObjectNamespaces,input.signal,limits);
 if(input.requiredObjects)verifyRequiredObjects(before.objects,input.requiredObjects,input.environmentId);
 if(input.maximumBytes!==undefined&&(!Number.isSafeInteger(input.maximumBytes)||input.maximumBytes<0||before.objects.reduce((sum,row)=>sum+row.sizeBytes,0)>input.maximumBytes))throw Error('Object checkpoint byte allowance exceeded');
 await mkdir(target,{mode:0o700});let complete=false;
 try{
  const entries:BackupArchiveHeader['entries']=[],files=new Map<string,string>();
  for(const namespace of activeObjectNamespaces)await mkdir(join(target,namespace),{mode:0o700});
  for(const object of before.objects){input.signal.throwIfAborted();const namespace=validateObjectKey(object.key,environmentObjectId(input.environmentId)),id=object.key.split('/').at(-1)!,path=join(target,namespace,id),name='objects/'+namespace+'/'+id;
   const file=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600),hash=createHash('sha256');let size=0;
   try{for await(const chunk of await input.store.stream(object.key,object,input.signal)){input.signal.throwIfAborted();size+=chunk.byteLength;if(size>object.sizeBytes||size>10485760)throw Error('Object checkpoint exceeds expected bytes');hash.update(chunk);let written=0;while(written<chunk.byteLength){input.signal.throwIfAborted();const result=await file.write(chunk,written,chunk.byteLength-written);if(!result.bytesWritten)throw Error('Object checkpoint write incomplete');written+=result.bytesWritten;}}
    if(size!==object.sizeBytes||hash.digest('hex')!==object.digest)throw Error('Object checkpoint integrity differs');await file.sync();
   }finally{await file.close();}
   entries.push({name,sizeBytes:object.sizeBytes,digest:object.digest});files.set(name,path);
  }
  const after=await verifiedObjectInventory(input.store,input.environmentId,activeObjectNamespaces,input.signal,limits);if(before.digest!==after.digest)throw Error('Object capture inventory changed');input.signal.throwIfAborted();
  complete=true;return {entries,files,inventory:before,originalsRetained:true as const};
 }finally{if(!complete)await rm(target,{recursive:true,force:true});}
}
