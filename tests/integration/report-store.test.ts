import {describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {reportStoreRoot,writeReportObject,readReportObject,deleteExactReportObject} from '../../lib/server/reports/store';
describe('separate owned report namespace',()=>{
 it('verifies identity and exact bytes before reading/deleting',async()=>{
  const prior=process.env.TURAS_REPORT_STORE_ROOT;
  const root=await mkdtemp(resolve('local-artifacts/009/store-'));process.env.TURAS_REPORT_STORE_ROOT=root;
  try{
   await writeFile(join(root,'.turas-report-store.json'),JSON.stringify({environmentId:process.env.TURAS_ENVIRONMENT_ID}),{mode:0o600});
   const object=await writeReportObject(Buffer.from('synthetic report'));
   const second=await writeReportObject(Buffer.from('second synthetic report'));expect(second.objectKey).not.toBe(object.objectKey);
   expect((await readReportObject(second.objectKey,second.contentDigest,second.sizeBytes)).toString()).toBe('second synthetic report');
   expect((await readReportObject(object.objectKey,object.contentDigest,object.sizeBytes)).toString()).toBe('synthetic report');
   await expect(deleteExactReportObject(object.objectKey,'0'.repeat(64),object.sizeBytes)).rejects.toThrow();
   expect((await readReportObject(object.objectKey,object.contentDigest,object.sizeBytes)).length).toBe(object.sizeBytes);
   await deleteExactReportObject(object.objectKey,object.contentDigest,object.sizeBytes);
   await expect(readReportObject(object.objectKey,object.contentDigest,object.sizeBytes)).rejects.toThrow();
  }finally{if(prior===undefined)delete process.env.TURAS_REPORT_STORE_ROOT;else process.env.TURAS_REPORT_STORE_ROOT=prior;await rm(root,{recursive:true,force:true});}
 });
 it('refuses symlink objects and a symlink object directory',async()=>{
  const prior=process.env.TURAS_REPORT_STORE_ROOT,root=await mkdtemp(resolve('local-artifacts/009/store-'));
  process.env.TURAS_REPORT_STORE_ROOT=root;
  try{
   await writeFile(join(root,'.turas-report-store.json'),JSON.stringify({environmentId:process.env.TURAS_ENVIRONMENT_ID}),{mode:0o600});
   const object=await writeReportObject(Buffer.from('synthetic object')),alias='86b45c0a-130a-4b56-aabc-c1939d1a9121';
   await symlink(join(root,'objects',object.objectKey),join(root,'objects',alias));await expect(readReportObject(alias,object.contentDigest,object.sizeBytes)).rejects.toThrow();
   await rm(join(root,'objects'),{recursive:true});await mkdir(join(root,'other'),{mode:0o700});await symlink(join(root,'other'),join(root,'objects'));await expect(writeReportObject(Buffer.from('must not write'))).rejects.toThrow();
  }finally{if(prior===undefined)delete process.env.TURAS_REPORT_STORE_ROOT;else process.env.TURAS_REPORT_STORE_ROOT=prior;await rm(root,{recursive:true,force:true});}
 });
 it('refuses wrong markers, upload root reuse and traversal',async()=>{
  const prior=process.env.TURAS_REPORT_STORE_ROOT,root=await mkdtemp(resolve('local-artifacts/009/store-'));
  try{
   process.env.TURAS_REPORT_STORE_ROOT=root;await writeFile(join(root,'.turas-report-store.json'),JSON.stringify({environmentId:'wrong'}));
   await expect(reportStoreRoot()).rejects.toThrow();
   await expect(readReportObject('../outside','0'.repeat(64),1)).rejects.toThrow();
   process.env.TURAS_REPORT_STORE_ROOT=process.env.TURAS_ARTIFACT_STORE_ROOT;await expect(reportStoreRoot()).rejects.toThrow();
  }finally{if(prior===undefined)delete process.env.TURAS_REPORT_STORE_ROOT;else process.env.TURAS_REPORT_STORE_ROOT=prior;await rm(root,{recursive:true,force:true});}
 });
});
