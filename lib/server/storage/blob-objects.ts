import type {PrivateBlobAuth} from './blob-auth';
import {get,put,del,list,BlobPreconditionFailedError} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {environmentObjectId,validateObjectKey,verifiedBytes,sameObject,type PrivateObjects,type ObjectDescriptor,type ObjectNamespace} from './private-objects';
/** Private store only. No URLs or SDK metadata leave this adapter. */
export class BlobPrivateObjects implements PrivateObjects {
 private environment:string;
 private auth:PrivateBlobAuth;
 constructor(environmentId:string,auth:string|PrivateBlobAuth,private maximumBytes:number,private observeWrite?: (object:ObjectDescriptor)=>Promise<void>){this.environment=environmentObjectId(environmentId);this.auth=typeof auth==='string'?{token:auth}:{...auth};if(!auth||!Number.isSafeInteger(maximumBytes)||maximumBytes<1)throw Error('Explicit private Blob configuration required');}
 private key(key:string){validateObjectKey(key,this.environment);return key;}
 private async read(key:string,signal?:AbortSignal){
  signal?.throwIfAborted();
  const result=await get(this.key(key),{access:'private',...this.auth,useCache:false,abortSignal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
  if(!result)return null;
  // The SDK reports size zero when an uncached response omits Content-Length.
  // Only an actual declared length can establish the transport size; the stream
  // limit and the caller's expected size/digest still apply to every read.
  const declaredLength=result.headers.get('content-length');
  const declaredSize=declaredLength===null?null:Number(declaredLength);
  const invalidDeclaredLength=declaredLength!==null&&(!/^\d+$/.test(declaredLength)||declaredSize===null||!Number.isSafeInteger(declaredSize)||declaredSize<0||declaredSize>this.maximumBytes||declaredSize!==result.blob.size);
  if(result.statusCode!==200||result.blob.pathname!==key||!Number.isSafeInteger(result.blob.size)||result.blob.size<0||result.blob.size>this.maximumBytes||invalidDeclaredLength){
   await result.stream?.cancel();throw Error('Private object unavailable');
  }
  const reader=result.stream.getReader();let size=0;const parts:Buffer[]=[];
  try{
   for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>this.maximumBytes)throw Error('Private object exceeds limit');parts.push(Buffer.from(next.value));}
   if(declaredSize!==null&&size!==declaredSize)throw Error('Private object size mismatch');
   return Buffer.concat(parts,size);
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 async stat(key:string,signal?:AbortSignal){const bytes=await this.read(key,signal);return bytes===null?null:{key,sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')};}
 async put(key:string,bytes:AsyncIterable<Uint8Array>,expected:Omit<ObjectDescriptor,'key'>,signal?:AbortSignal){signal?.throwIfAborted();this.key(key);const buffer=await verifiedBytes(bytes,expected,this.maximumBytes);try{const result=await put(key,buffer,{access:'private',...this.auth,addRandomSuffix:false,allowOverwrite:false,contentType:'application/octet-stream',abortSignal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(result.pathname!==key)throw Error('Private object identity mismatch');}catch(error){if(!(error instanceof BlobPreconditionFailedError))throw Error('Private object write unavailable');const existing=await this.stat(key,signal);if(!existing||!sameObject(existing,expected))throw Error('Immutable private object conflict');}const actual=await this.stat(key,signal);if(!actual||!sameObject(actual,expected))throw Error('Private object integrity mismatch');await this.observeWrite?.(actual);return actual;}
 async stream(key:string,expected?:Omit<ObjectDescriptor,'key'>,signal?:AbortSignal){const bytes=await this.read(key,signal);if(bytes===null)throw Error('Private object unavailable');if(expected&&!sameObject({key,sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')},expected))throw Error('Private object integrity mismatch');return (async function*(){for(let offset=0;offset<bytes.length;offset+=65536)yield bytes.subarray(offset,offset+65536);})();}
 async delete(key:string,signal?:AbortSignal){await del(this.key(key),{...this.auth,abortSignal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(await this.stat(key)!==null)throw Error('Private object deletion unverified');}
 async headers(namespace:ObjectNamespace,cursor?:string,limit=100,signal?:AbortSignal){signal?.throwIfAborted();const prefix=`e_${this.environment}/${namespace}/`;this.key(prefix+'00000000-0000-4000-8000-000000000000');if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor&&cursor.length>2048)throw Error('Invalid private inventory bounds');const page=await list({prefix,cursor,limit,...this.auth,abortSignal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(page.blobs.length>limit||page.hasMore&&!page.cursor)throw Error('Private inventory unavailable');const objects:{key:string;sizeBytes:number;createdAt:string}[]=[];for(const blob of page.blobs){this.key(blob.pathname);if(!blob.pathname.startsWith(prefix)||!Number.isSafeInteger(blob.size)||blob.size<0||blob.size>this.maximumBytes||!(blob.uploadedAt instanceof Date)||!Number.isFinite(blob.uploadedAt.getTime()))throw Error('Private inventory metadata unavailable');objects.push({key:blob.pathname,sizeBytes:blob.size,createdAt:blob.uploadedAt.toISOString()});}return {objects,...(page.hasMore?{cursor:page.cursor}:{})};}
 async list(namespace:ObjectNamespace,cursor?:string,limit=100,signal?:AbortSignal){const page=await this.headers(namespace,cursor,limit,signal);const objects:(ObjectDescriptor & {createdAt:string})[]=[];for(const header of page.objects){const actual=await this.stat(header.key,signal);if(!actual||actual.sizeBytes!==header.sizeBytes)throw Error('Private inventory changed');objects.push({...actual,createdAt:header.createdAt});}return {objects,...(page.cursor?{cursor:page.cursor}:{})};}
}
