import {it,beforeEach,afterEach,expect} from 'vitest';
import {mkdir,mkdtemp,rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {objectKey,environmentObjectId,type PrivateObjects} from '../../../lib/server/storage/private-objects';
import {activeObjectNamespaces} from '../../../lib/server/storage/inventory';
import {captureRecoveryObjects} from '../../../lib/server/operations/object-checkpoint';
let root:string,store:LocalPrivateObjects,key:string;const environmentId='owned-object-capture',bytes=Buffer.from('Synthetic matched checkpoint object'),expected={sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')};
beforeEach(async()=>{await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});root=await mkdtemp(resolve('local-artifacts/016/object-checkpoint-'));for(const namespace of activeObjectNamespaces)await mkdir(join(root,'source','e_'+environmentObjectId(environmentId),namespace),{recursive:true,mode:0o700});store=new LocalPrivateObjects(join(root,'source'),environmentId,10485760);key=objectKey(environmentId,'artifact',randomUUID());await store.put(key,(async function*(){yield bytes;})(),expected);});
afterEach(()=>rm(root,{recursive:true,force:true}));
const input=()=>({store,environmentId,target:join(root,'capture'),signal:AbortSignal.timeout(5000)});
it('stages exact archive entries without removing originals',async()=>{const capture=await captureRecoveryObjects(input());expect(capture.entries).toEqual([{name:'objects/artifact/'+key.split('/').at(-1),...expected}]);expect(await readFile(capture.files.get(capture.entries[0].name)!)).toEqual(bytes);expect(await store.stat(key)).toMatchObject(expected);expect(capture.originalsRetained).toBe(true);});
it('removes partial staging if stream bytes differ',async()=>{let reads=0;const changed:PrivateObjects={put:store.put.bind(store),stat:store.stat.bind(store),delete:store.delete.bind(store),list:store.list.bind(store),stream:async(...args:Parameters<PrivateObjects['stream']>)=>{if(++reads===2)return (async function*(){yield Buffer.from('Changed checkpoint bytes');})();return store.stream(args[0],args[1]);}};await expect(captureRecoveryObjects({...input(),store:changed})).rejects.toThrow(/expected bytes|integrity differs/);expect(await readdir(root)).not.toContain('capture');expect(await store.stat(key)).not.toBeNull();});
it('rejects a changed inventory after staging and removes owned partial files',async()=>{let calls=0;const changed:PrivateObjects={put:store.put.bind(store),stat:store.stat.bind(store),delete:store.delete.bind(store),list:async(...args:Parameters<PrivateObjects['list']>)=>{if(++calls===7)await store.delete(key);return store.list(args[0],args[1],args[2]);},stream:store.stream.bind(store)};await expect(captureRecoveryObjects({...input(),store:changed})).rejects.toThrow('inventory changed');expect(await readdir(root)).not.toContain('capture');});
it('refuses existing destinations without changing their contents',async()=>{const target=join(root,'capture');await mkdir(target,{mode:0o700});await writeFile(join(target,'retained'),'Synthetic operator archive',{mode:0o600});await expect(captureRecoveryObjects(input())).rejects.toThrow();expect(await readFile(join(target,'retained'),'utf8')).toBe('Synthetic operator archive');});
it('does not create staging for an already aborted capture',async()=>{await expect(captureRecoveryObjects({...input(),signal:AbortSignal.abort()})).rejects.toThrow();expect(await readdir(root)).not.toContain('capture');});
it('removes interrupted staging while preserving the source object',async()=>{
 const cancellation=new AbortController();let reads=0;
 const interrupted:PrivateObjects={put:store.put.bind(store),stat:store.stat.bind(store),delete:store.delete.bind(store),list:store.list.bind(store),stream:async(...args:Parameters<PrivateObjects['stream']>)=>{
  if(++reads!==2)return store.stream(args[0],args[1]);
  return (async function*(){yield bytes.subarray(0,8);cancellation.abort(Error('Synthetic interrupted capture'));yield bytes.subarray(8);})();
 }};
 await expect(captureRecoveryObjects({...input(),store:interrupted,signal:cancellation.signal})).rejects.toThrow('Synthetic interrupted capture');
 expect(await readdir(root)).not.toContain('capture');
 expect(await store.stat(key)).toMatchObject(expected);
});
