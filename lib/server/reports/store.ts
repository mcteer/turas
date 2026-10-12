import {privateStoreObserver} from '../operations/store-observations';
import {privateBlobAuth} from '../storage/blob-auth';
import {withOperationalIo} from '../operations/admission';
import {lstat,readFile,mkdir,open,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {HttpFailure} from '../../contracts/http';
import {reportConfig} from './config';
import {privateObjectBackend} from '../storage/factory';
import {BlobPrivateObjects} from '../storage/blob-objects';
import {objectKey,type ObjectNamespace} from '../storage/private-objects';
import {reportId,reportDigestSchema} from './schema';
function blobStore(){return privateObjectBackend()==='blob'?new BlobPrivateObjects(process.env.TURAS_ENVIRONMENT_ID!,privateBlobAuth(),10485760,privateStoreObserver(process.env.TURAS_ENVIRONMENT_ID!)):null;}
export async function assertReportStoreReady(namespace:ObjectNamespace='report'){const blob=blobStore();if(blob){await blob.headers(namespace,undefined,1);return;}await reportObjectDirectory(false);}
export async function reportStoreRoot(){
 if(blobStore())throw new HttpFailure(503,'store_unavailable','Hosted objects require the governed executor');
 const root=reportConfig().storeRoot;if(!root)throw new HttpFailure(503,'store_unavailable','Report store unavailable');
 const stat=await lstat(root);if(!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)!==0)throw new HttpFailure(503,'store_unavailable','Report store unavailable');
 const markerStat=await lstat(join(root,'.turas-report-store.json'));if(!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.mode & 0o077)throw new HttpFailure(503,'store_unavailable','Report store unavailable');
 const marker=JSON.parse(await readFile(join(root,'.turas-report-store.json'),'utf8'));
 if(marker.environmentId!==process.env.TURAS_ENVIRONMENT_ID)throw new HttpFailure(503,'store_unavailable','Report store unavailable');
 return resolve(root);
}
export async function writeReportObject(bytes:Buffer,key:string=randomUUID(),preparedOnly=false,namespace:ObjectNamespace='report'){
 return withOperationalIo(()=>writeReportObjectBytes(bytes,key,preparedOnly,namespace));
}
async function writeReportObjectBytes(bytes:Buffer,key:string,preparedOnly:boolean,namespace:ObjectNamespace){
 reportId.parse(key);if(bytes.length<1 || bytes.length>10485760)throw new HttpFailure(422,'scope_too_large','Report file exceeds limit');
 const digest=createHash('sha256').update(bytes).digest('hex'),blob=blobStore();if(blob){await blob.put(objectKey(process.env.TURAS_ENVIRONMENT_ID!,namespace,key),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest});return {objectKey:key,contentDigest:digest,sizeBytes:bytes.length};}
 const objects=await reportObjectDirectory(!preparedOnly);
 const file=join(objects,key),handle=await open(file,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 return {objectKey:key,contentDigest:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length};
}
export async function readReportObject(key:string,digest:string,size:number,preparedOnly=false,namespace:ObjectNamespace='report'){
 reportId.parse(key);reportDigestSchema.parse(digest);if(!Number.isInteger(size) || size<1 || size>10485760)throw new HttpFailure(503,'store_unavailable','Report file unavailable');
 const blob=blobStore();if(blob){const parts:Buffer[]=[];for await(const part of await blob.stream(objectKey(process.env.TURAS_ENVIRONMENT_ID!,namespace,key),{sizeBytes:size,digest}))parts.push(Buffer.from(part));return Buffer.concat(parts);}
 const file=join(await reportObjectDirectory(!preparedOnly),key),handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes:Buffer;
 try{const stat=await handle.stat();if(!stat.isFile() || stat.size!==size || (stat.mode & 0o077)!==0)throw new HttpFailure(503,'store_unavailable','Report file unavailable');bytes=await handle.readFile();}finally{await handle.close();}
 if(bytes.length!==size || createHash('sha256').update(bytes).digest('hex')!==digest)throw new HttpFailure(503,'store_unavailable','Report file unavailable');return bytes;
}
export async function reportObjectDirectory(create=true){
 const directory=join(await reportStoreRoot(),'objects');if(create)try{await mkdir(directory,{mode:0o700});}catch(error){if((error as {code?:string}).code!=='EEXIST')throw error;}
 const stat=await lstat(directory);if(!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)throw new HttpFailure(503,'store_unavailable','Report store unavailable');return directory;
}
export async function deleteExactReportObject(key:string,digest:string,size:number,preparedOnly=false,namespace:ObjectNamespace='report'){
 return withOperationalIo(()=>deleteReportObjectBytes(key,digest,size,preparedOnly,namespace),true);
}
async function deleteReportObjectBytes(key:string,digest:string,size:number,preparedOnly:boolean,namespace:ObjectNamespace){
 reportId.parse(key);reportDigestSchema.parse(digest);if(!Number.isInteger(size)||size<1||size>10485760)throw new HttpFailure(503,'store_unavailable','Report cleanup identity unavailable');const blob=blobStore();if(blob){const path=objectKey(process.env.TURAS_ENVIRONMENT_ID!,namespace,key),current=await blob.stat(path);if(!current)return;if(current.digest!==digest||current.sizeBytes!==size)throw new HttpFailure(503,'store_unavailable','Report cleanup identity changed');await blob.delete(path);return;}await readReportObject(key,digest,size,preparedOnly,namespace);await unlink(join(await reportStoreRoot(),'objects',key));
}
