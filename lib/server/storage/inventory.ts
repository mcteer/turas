import {createHash} from 'node:crypto';
import {objectNamespaces,environmentObjectId,validateObjectKey,validateExpected,verifiedBytes,type PrivateObjects,type ObjectDescriptor,type ObjectNamespace} from './private-objects';
export const activeObjectNamespaces:readonly ObjectNamespace[]=objectNamespaces.filter(namespace=>namespace!=='backup');
export async function verifiedObjectInventory(store:PrivateObjects,environmentId:string,namespaces:readonly ObjectNamespace[]=activeObjectNamespaces,signal=AbortSignal.timeout(300000),limits:{maximumObjects?:number;maximumBytes?:number;pageSize?:number}={}){
 if(!namespaces.length||new Set(namespaces).size!==namespaces.length||namespaces.some(namespace=>!activeObjectNamespaces.includes(namespace)))throw Error('Exact active-store namespaces required');
 const maximumObjects=limits.maximumObjects??100000,maximumBytes=limits.maximumBytes??1024**4,pageSize=limits.pageSize??100;
 if(!Number.isSafeInteger(maximumObjects)||maximumObjects<1||maximumObjects>100000||!Number.isSafeInteger(maximumBytes)||maximumBytes<0||maximumBytes>1024**4||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Bounded object inventory limits required');
 const objects:ObjectDescriptor[]=[],seen=new Set<string>(),environment=environmentObjectId(environmentId);let totalBytes=0;
 for(const namespace of namespaces){let cursor:string|undefined;const cursors=new Set<string>();
  do{signal.throwIfAborted();const page=await store.list(namespace,cursor,pageSize,signal);if(page.objects.length>pageSize)throw Error('Inventory page exceeds bound');
   for(const object of page.objects){signal.throwIfAborted();if(validateObjectKey(object.key,environment)!==namespace||seen.has(object.key))throw Error('Inventory identity differs');validateExpected(object,10485760);seen.add(object.key);totalBytes+=object.sizeBytes;if(seen.size>maximumObjects||totalBytes>maximumBytes)throw Error('Inventory exceeds operator bound');await verifiedBytes(await store.stream(object.key,object,signal),object,10485760);objects.push({key:object.key,digest:object.digest,sizeBytes:object.sizeBytes});}
   if(page.cursor){if(cursors.has(page.cursor)||page.cursor===cursor)throw Error('Inventory cursor did not advance');cursors.add(page.cursor);}cursor=page.cursor;
  }while(cursor);
 }
 objects.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);return {objects,digest:createHash('sha256').update(JSON.stringify(objects)).digest('hex')};
}
/** Caller owns the exclusive environment capture fence and separately admits any
 * provider costs. This procedure never deletes originals or changes configuration. */
export function verifyRequiredObjects(inventory:readonly ObjectDescriptor[],required:readonly ObjectDescriptor[],environmentId:string){
 const byKey=new Map(inventory.map(object=>[object.key,object])),seen=new Set<string>();
 if(required.length>100000)throw Error('Required object inventory exceeds bound');
 for(const expected of required){
  if(!activeObjectNamespaces.includes(validateObjectKey(expected.key,environmentObjectId(environmentId)))||seen.has(expected.key))throw Error('Required object identity differs');
  validateExpected(expected,10485760);seen.add(expected.key);const actual=byKey.get(expected.key);
  if(!actual||actual.digest!==expected.digest||actual.sizeBytes!==expected.sizeBytes)throw Error('Required original missing or different');
 }
}
export async function copyVerifiedObjects(input:{source:PrivateObjects;destination:PrivateObjects;environmentId:string;namespaces?:readonly ObjectNamespace[];signal?:AbortSignal;limits?:{maximumObjects?:number;maximumBytes?:number;pageSize?:number};requiredObjects?:readonly ObjectDescriptor[]}){
 const signal=input.signal??AbortSignal.timeout(300000),namespaces=input.namespaces??activeObjectNamespaces;
 const source=await verifiedObjectInventory(input.source,input.environmentId,namespaces,signal,input.limits);
 if(input.requiredObjects)verifyRequiredObjects(source.objects,input.requiredObjects,input.environmentId);
 const destination=await verifiedObjectInventory(input.destination,input.environmentId,namespaces,signal,input.limits),byKey=new Map(source.objects.map(object=>[object.key,object]));
 for(const object of destination.objects){const expected=byKey.get(object.key);if(!expected||expected.digest!==object.digest||expected.sizeBytes!==object.sizeBytes)throw Error('Destination inventory differs');}
 let copied=0;const existing=new Set(destination.objects.map(object=>object.key));
 for(const object of source.objects){signal.throwIfAborted();if(existing.has(object.key))continue;await input.destination.put(object.key,await input.source.stream(object.key,object,signal),object,signal);copied++;}
 const current=await verifiedObjectInventory(input.source,input.environmentId,namespaces,signal,input.limits),result=await verifiedObjectInventory(input.destination,input.environmentId,namespaces,signal,input.limits);
 if(source.digest!==current.digest||source.digest!==result.digest)throw Error('Storage parity verification failed');
 return {inventoryDigest:source.digest,objectCount:source.objects.length,copied,originalsRetained:true as const,configurationChanged:false as const};
}
