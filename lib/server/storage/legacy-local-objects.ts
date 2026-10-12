import {constants} from 'node:fs';
import {open,lstat,realpath,opendir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {environmentObjectId,objectKey,validateObjectKey,sameObject,type PrivateObjects,type ObjectDescriptor,type ObjectNamespace} from './private-objects';
/** Read-only bridge for fenced operator capture/cutover. Never creates a store,
 * classifies an unknown report, changes configuration or removes originals. */
export class LegacyLocalPrivateObjects implements PrivateObjects{
 private environment:string;
 constructor(private input:{environmentId:string;artifactRoot:string;workforceRoot:string;reportRoot:string;reportNamespaces:ReadonlyMap<string,'report'|'gap-report'>}){if(new Set([input.artifactRoot,input.workforceRoot,input.reportRoot].map(root=>resolve(root))).size!==3)throw Error('Distinct legacy store roots required');this.input={...input,reportNamespaces:new Map(input.reportNamespaces)};this.environment=environmentObjectId(input.environmentId);}
 private async directory(path:string){if(resolve(path)!==path||await realpath(path)!==path)throw Error('Indirect legacy store');const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o777)!==0o700||info.uid!==process.getuid?.())throw Error('Unsafe legacy store');}
 private async location(namespace:ObjectNamespace){
  if(namespace==='backup')throw Error('Legacy backup namespace unsupported');
  const kind=namespace.startsWith('artifact')?'artifact':namespace.startsWith('workforce')?'workforce':'report',root=kind==='artifact'?this.input.artifactRoot:kind==='workforce'?this.input.workforceRoot:this.input.reportRoot;
  await this.directory(root);const marker=await open(join(root,`.turas-${kind}-store.json`),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const info=await marker.stat();if(!info.isFile()||info.nlink!==1||(info.mode&0o777)!==0o600||info.uid!==process.getuid?.()||info.size>1024)throw Error('Unsafe legacy marker');const value=JSON.parse(await marker.readFile('utf8'));if(value.environmentId!==this.input.environmentId)throw Error('Legacy store environment differs');}finally{await marker.close();}
  const directory=join(root,namespace.endsWith('-staging')?'staged':'objects');await this.directory(directory);return directory;
 }
 private namespace(key:string){const namespace=validateObjectKey(key,this.environment),id=key.split('/').at(-1)!;
  if(namespace==='backup'||namespace.startsWith('artifact')&&!/^[a-f0-9]{64}$/.test(id)||!namespace.startsWith('artifact')&&!/^[a-f0-9-]{36}$/.test(id))throw Error('Legacy identity differs');
  if((namespace==='report'||namespace==='gap-report')&&this.input.reportNamespaces.get(id)!==namespace)throw Error('Legacy report classification unavailable');return namespace;
 }
 private async read(key:string){const namespace=this.namespace(key),directory=await this.location(namespace),file=await open(join(directory,key.split('/').at(-1)!),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const info=await file.stat();if(!info.isFile()||(info.mode&0o777)!==0o600||info.uid!==process.getuid?.()||info.size<1||info.size>10485760||info.nlink<1||info.nlink>2)throw Error('Unsafe legacy original');const bytes=await file.readFile(),after=await file.stat();if(bytes.length!==info.size||after.size!==info.size||after.mtimeMs!==info.mtimeMs||after.ctimeMs!==info.ctimeMs)throw Error('Legacy original changed');return {bytes,createdAt:info.birthtime.toISOString(),descriptor:{key,sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')}};}finally{await file.close();}
 }
 async stat(key:string):Promise<ObjectDescriptor|null>{try{return (await this.read(key)).descriptor;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}}
 async stream(key:string,expected?:Omit<ObjectDescriptor,'key'>){const result=await this.read(key);if(expected&&!sameObject(result.descriptor,expected))throw Error('Legacy original integrity differs');return (async function*(){yield result.bytes;})();}
 async list(namespace:ObjectNamespace,cursor?:string,limit=100){if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid legacy inventory bounds');if(cursor&&this.namespace(cursor)!==namespace)throw Error('Legacy inventory cursor differs');
  const directory=await this.location(namespace),walk=await opendir(directory),keys:string[]=[];try{for(let inspected=0;;inspected++){const entry=await walk.read();if(!entry)break;if(inspected>=100000)throw Error('Legacy inventory exceeds bound');if(!entry.isFile())throw Error('Legacy inventory contains unsupported bytes');const key=objectKey(this.input.environmentId,namespace,entry.name);
   if(namespace==='report'||namespace==='gap-report'){const classified=this.input.reportNamespaces.get(entry.name);if(!classified)throw Error('Legacy report classification unavailable');if(classified!==namespace)continue;}
   this.namespace(key);keys.push(key);
  }}finally{await walk.close();}keys.sort();const selected=keys.filter(key=>!cursor||key>cursor).slice(0,limit+1),objects=[];for(const key of selected.slice(0,limit)){const value=await this.read(key);objects.push({...value.descriptor,createdAt:value.createdAt});}return {objects,...(selected.length>limit?{cursor:selected[limit-1]}:{})};
 }
 async put():Promise<ObjectDescriptor>{throw Error('Legacy capture source is read-only');}
 async delete():Promise<void>{throw Error('Legacy capture source is read-only');}
}
