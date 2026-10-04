import {lstat,readFile,mkdir,open,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {HttpFailure} from '../../contracts/http';
import {reportConfig} from './config';
import {reportId,reportDigestSchema} from './schema';
export async function reportStoreRoot(){
 const root=reportConfig().storeRoot;if(!root)throw new HttpFailure(503,'store_unavailable','Report store unavailable');
 const stat=await lstat(root);if(!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)!==0)throw new HttpFailure(503,'store_unavailable','Report store unavailable');
 const markerStat=await lstat(join(root,'.turas-report-store.json'));if(!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.mode & 0o077)throw new HttpFailure(503,'store_unavailable','Report store unavailable');
 const marker=JSON.parse(await readFile(join(root,'.turas-report-store.json'),'utf8'));
 if(marker.environmentId!==process.env.TURAS_ENVIRONMENT_ID)throw new HttpFailure(503,'store_unavailable','Report store unavailable');
 return resolve(root);
}
export async function writeReportObject(bytes:Buffer,key=randomUUID()){
 reportId.parse(key);if(bytes.length<1 || bytes.length>10485760)throw new HttpFailure(422,'scope_too_large','Report file exceeds limit');
 const objects=await reportObjectDirectory();
 const file=join(objects,key),handle=await open(file,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 return {objectKey:key,contentDigest:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length};
}
export async function readReportObject(key:string,digest:string,size:number){
 reportId.parse(key);reportDigestSchema.parse(digest);if(!Number.isInteger(size) || size<1 || size>10485760)throw new HttpFailure(503,'store_unavailable','Report file unavailable');
 const file=join(await reportObjectDirectory(),key),handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes:Buffer;
 try{const stat=await handle.stat();if(!stat.isFile() || stat.size!==size || (stat.mode & 0o077)!==0)throw new HttpFailure(503,'store_unavailable','Report file unavailable');bytes=await handle.readFile();}finally{await handle.close();}
 if(bytes.length!==size || createHash('sha256').update(bytes).digest('hex')!==digest)throw new HttpFailure(503,'store_unavailable','Report file unavailable');return bytes;
}
export async function reportObjectDirectory(){
 const directory=join(await reportStoreRoot(),'objects');try{await mkdir(directory,{mode:0o700});}catch(error){if((error as {code?:string}).code!=='EEXIST')throw error;}
 const stat=await lstat(directory);if(!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)throw new HttpFailure(503,'store_unavailable','Report store unavailable');return directory;
}
export async function deleteExactReportObject(key:string,digest:string,size:number){
 await readReportObject(key,digest,size);await unlink(join(await reportStoreRoot(),'objects',key));
}
