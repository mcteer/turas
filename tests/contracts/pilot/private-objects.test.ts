import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {mkdtemp,rm,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID,createHash} from 'node:crypto';
const mocked=vi.hoisted(()=>({objects:new Map<string,Buffer>(),stallReads:false,contentLength:undefined as string|null|undefined}));
vi.mock('@vercel/blob',()=>{
 class Conflict extends Error{};
 return {BlobPreconditionFailedError:Conflict,
 async put(key:string,bytes:Buffer,options:{access:string;allowOverwrite:boolean;addRandomSuffix:boolean}){expect(options.access).toBe('private');expect(options.allowOverwrite).toBe(false);expect(options.addRandomSuffix).toBe(false);if(mocked.objects.has(key))throw new Conflict();mocked.objects.set(key,Buffer.from(bytes));return {pathname:key};},
 async get(key:string,options:{access:string;useCache:boolean;abortSignal:AbortSignal}){expect(options.access).toBe('private');expect(options.useCache).toBe(false);if(mocked.stallReads)await new Promise((_,reject)=>{if(options.abortSignal.aborted)reject(options.abortSignal.reason);else options.abortSignal.addEventListener('abort',()=>reject(options.abortSignal.reason),{once:true});});const bytes=mocked.objects.get(key);return bytes?{statusCode:200,headers:new Headers(mocked.contentLength===null?{}:{'content-length':mocked.contentLength??String(bytes.length)}),blob:{pathname:key,size:mocked.contentLength===null?0:Number(mocked.contentLength??bytes.length)},stream:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})}:null;},
 async del(key:string){expect(key.startsWith('e_')).toBe(true);mocked.objects.delete(key);},
 async list(options:{prefix:string;cursor?:string;limit:number}){const keys=[...mocked.objects.keys()].filter(k=>k.startsWith(options.prefix)&&(!options.cursor||k>options.cursor)).sort();return {blobs:keys.slice(0,options.limit).map(pathname=>({pathname,size:mocked.objects.get(pathname)!.length,uploadedAt:new Date()})),hasMore:keys.length>options.limit,cursor:keys[options.limit-1]};}};
});
import {privateUploadUrl} from '../../../lib/contracts/blob-upload';
import {BlobPrivateObjects} from '../../../lib/server/storage/blob-objects';
import type {PrivateObjects} from '../../../lib/server/storage/private-objects';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';import {objectKey} from '../../../lib/server/storage/private-objects';
let root:string,stores:PrivateObjects[],key:string;const bytes=Buffer.from('Synthetic private original'),expected={sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')};async function* source(b=bytes){yield b;}
beforeEach(async()=>{root=await realpath(await mkdtemp(join(tmpdir(),'turas-private-contract-')));mocked.objects.clear();mocked.stallReads=false;mocked.contentLength=undefined;stores=[new LocalPrivateObjects(root,'test-contract',1024),new BlobPrivateObjects('test-contract','synthetic-test-token',1024)];key=objectKey('test-contract','artifact',randomUUID());});afterEach(()=>rm(root,{recursive:true,force:true}));
it('writes immutable verified bytes',async()=>{for(const store of stores){expect(await store.put(key,source(),expected)).toEqual({key,...expected});expect(await store.stat(key)).toEqual({key,...expected});}});
it('rejects incorrect size',async()=>{for(const store of stores){await expect(store.put(key,source(),{...expected,sizeBytes:expected.sizeBytes-1})).rejects.toThrow();expect(await store.stat(key)).toBeNull();}});
it('rejects incorrect digest',async()=>{for(const store of stores){await expect(store.put(key,source(),{...expected,digest:'a'.repeat(64)})).rejects.toThrow();expect(await store.stat(key)).toBeNull();}});
it('rejects opaque key traversal',async()=>{const signed='https://vercel.com/api/blob/?pathname='+encodeURIComponent(key)+'&vercel-blob-signature=synthetic';expect(privateUploadUrl(signed,key)).toBe(signed);for(const value of [signed.replace('https:','http:'),signed.replace('vercel.com','example.com'),signed.replace('/api/blob/','/other/'),signed+'&pathname=foreign',signed+'#fragment',signed.replace('https://','https://user:password@')])expect(()=>privateUploadUrl(value,key)).toThrow();expect(()=>privateUploadUrl(signed,key+'-foreign')).toThrow();for(const store of stores){await expect(store.put('../private',source(),expected)).rejects.toThrow();await expect(store.stat(objectKey('foreign-environment','artifact',randomUUID()))).rejects.toThrow();}});
it('reconciles an identical immutable conflict',async()=>{for(const store of stores){expect(await Promise.all([store.put(key,source(),expected),store.put(key,source(),expected)])).toEqual([{key,...expected},{key,...expected}]);expect(await store.put(key,source(),expected)).toEqual({key,...expected});}});
it('rejects different bytes at an existing key',async()=>{for(const store of stores){await store.put(key,source(),expected);const other=Buffer.from('Other synthetic bytes');await expect(store.put(key,source(other),{sizeBytes:other.length,digest:createHash('sha256').update(other).digest('hex')})).rejects.toThrow('Immutable');expect(await store.stat(key)).toEqual({key,...expected});}});
it('streams private bytes without a public URL',async()=>{for(const store of stores){await store.put(key,source(),expected);const chunks=[];for await(const chunk of await store.stream(key,expected))chunks.push(chunk);expect(Buffer.concat(chunks)).toEqual(bytes);expect(Object.keys((await store.stat(key))!)).toEqual(['key','sizeBytes','digest']);await expect(store.stream(key,{...expected,digest:'b'.repeat(64)})).rejects.toThrow();}
 // Match the uncached SDK response: absent Content-Length, size zero, but a
 // complete 10 MiB decoded stream. Keep expected-byte integrity authoritative.
 const maximum=10*1024*1024,large=Buffer.alloc(maximum,0x61),largeExpected={sizeBytes:maximum,digest:createHash('sha256').update(large).digest('hex')};
 const blob=new BlobPrivateObjects('test-contract','synthetic-test-token',maximum);
 mocked.objects.set(key,large);mocked.contentLength=null;
 const chunks=[];for await(const chunk of await blob.stream(key,largeExpected))chunks.push(chunk);
 const actual=Buffer.concat(chunks);expect(actual.length).toBe(maximum);expect(createHash('sha256').update(actual).digest('hex')).toBe(largeExpected.digest);expect(actual.equals(large)).toBe(true);expect(await blob.stat(key)).toEqual({key,...largeExpected});
 await expect(blob.stream(key,{...largeExpected,digest:'b'.repeat(64)})).rejects.toThrow('integrity');
 await expect(blob.stream(key,{...largeExpected,sizeBytes:maximum-1})).rejects.toThrow('integrity');
 mocked.objects.set(key,Buffer.alloc(maximum+1));await expect(blob.stat(key)).rejects.toThrow('exceeds limit');
 mocked.objects.set(key,bytes);
 for(const length of ['0',String(bytes.length-1),String(bytes.length+1)]){mocked.contentLength=length;await expect(blob.stat(key)).rejects.toThrow('size mismatch');}
 for(const length of ['-1','1.5','1x','',String(Number.MAX_SAFE_INTEGER+1),String(maximum+1)]){mocked.contentLength=length;await expect(blob.stat(key)).rejects.toThrow('unavailable');}
});
it('deletes only the exact scoped object',async()=>{for(const store of stores){const second=objectKey('test-contract','artifact',randomUUID());await store.put(key,source(),expected);await store.put(second,source(),expected);expect((await store.list('artifact',undefined,1)).cursor).toBeDefined();await store.delete(key);expect(await store.stat(key)).toBeNull();expect(await store.stat(second)).toEqual({key:second,...expected});await store.delete(key);}});
it('propagates the caller capture deadline into a stalled Blob read',async()=>{mocked.stallReads=true;const deadline=AbortSignal.timeout(20);await expect(stores[1].stream(key,expected,deadline)).rejects.toThrow();expect(deadline.aborted).toBe(true);});
