import {it,expect} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {BoundedWorkBackupObjects} from '../../../lib/server/operations/work-backup-objects';
import {objectKey,type ObjectNamespace} from '../../../lib/server/storage/private-objects';
import {captureRecoveryObjects} from '../../../lib/server/operations/object-checkpoint';
function fixture(){
 const environment='synthetic-backup-bound',bytes=Buffer.from('Synthetic private bytes'),key=objectKey(environment,'artifact',randomUUID()),descriptor={key,sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')};
 let headers=0,reads=0,objects=[{key,sizeBytes:bytes.length,createdAt:new Date().toISOString()}];
 const source={headers:async(namespace:ObjectNamespace)=>{headers++;return {objects:namespace==='artifact'?objects:[]};},stat:async()=>{reads++;return descriptor;},stream:async()=>{reads++;return (async function*(){yield bytes;})();},list:async()=>{throw Error('Unbounded provider list must not run');},put:async()=>{throw Error('Provider write must not run');},delete:async()=>{throw Error('Provider delete must not run');}};
 return {environment,key,bytes,descriptor,source,count:()=>({headers,reads}),set:(rows:typeof objects)=>{objects=rows;}};
}
it('captures exact private bytes with metadata-first pages and five reads per object',async()=>{
 const f=fixture();await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/bounded-backup-'));
 try{const result=await captureRecoveryObjects({store:new BoundedWorkBackupObjects(f.source,f.environment,1,f.bytes.length),environmentId:f.environment,target:join(root,'capture'),signal:AbortSignal.timeout(5000)});expect(result.inventory.objects).toEqual([f.descriptor]);expect(f.count()).toEqual({headers:12,reads:5});expect(result.originalsRetained).toBe(true);}finally{await rm(root,{recursive:true,force:true});}
});
it('rejects an oversized metadata page before its first object download',async()=>{
 const f=fixture(),store=new BoundedWorkBackupObjects(f.source,f.environment,256,f.bytes.length-1);
 await expect(store.list('artifact')).rejects.toThrow('operator bound');expect(f.count()).toEqual({headers:1,reads:0});
});
it('rejects excess object counts before downloading an otherwise valid first entry',async()=>{
 const f=fixture();f.set([{key:f.key,sizeBytes:f.bytes.length,createdAt:new Date().toISOString()},{key:objectKey(f.environment,'artifact',randomUUID()),sizeBytes:1,createdAt:new Date().toISOString()}]);
 await expect(new BoundedWorkBackupObjects(f.source,f.environment,1,100).list('artifact')).rejects.toThrow('operator bound');expect(f.count().reads).toBe(0);
});
it('bounds metadata requests even when a provider keeps returning empty pages',async()=>{
 const f=fixture();f.set([]);const store=new BoundedWorkBackupObjects(f.source,f.environment,1,0);
 for(let i=0;i<32;i++)await store.list('artifact');await expect(store.list('artifact')).rejects.toThrow('request allowance');expect(f.count()).toEqual({headers:32,reads:0});
});
it('rejects changed known metadata before another download',async()=>{
 const f=fixture(),store=new BoundedWorkBackupObjects(f.source,f.environment,256,100);await store.list('artifact');
 f.set([{key:f.key,sizeBytes:f.bytes.length+1,createdAt:new Date().toISOString()}]);await expect(store.list('artifact')).rejects.toThrow('metadata changed');expect(f.count()).toEqual({headers:2,reads:1});
});
it('denies unlisted reads excess reads invalid namespaces and every source write',async()=>{
 const f=fixture(),store=new BoundedWorkBackupObjects(f.source,f.environment,1,100);
 await expect(store.stat(f.key)).rejects.toThrow('allowance');await expect(store.list('backup')).rejects.toThrow('metadata request');expect(f.count()).toEqual({headers:0,reads:0});
 await store.list('artifact');for(let i=0;i<4;i++)await store.stat(f.key);await expect(store.stat(f.key)).rejects.toThrow('allowance');
 await expect(store.put(f.key,(async function*(){yield f.bytes;})(),f.descriptor)).rejects.toThrow('read-only');await expect(store.delete(f.key)).rejects.toThrow('read-only');expect(f.count()).toEqual({headers:1,reads:5});
});

it('admits expanded metadata pages while preserving the explicit legacy page bound',async()=>{
 const f=fixture();f.set([]);const expanded=new BoundedWorkBackupObjects(f.source,f.environment,256,1,'pilot-work-backup-config-v2');for(let i=0;i<640;i++)await expanded.list('artifact');await expect(expanded.list('artifact')).rejects.toThrow('request allowance');expect(f.count()).toEqual({headers:640,reads:0});expect(()=>new BoundedWorkBackupObjects(f.source,f.environment,256,25165825)).toThrow();
});
