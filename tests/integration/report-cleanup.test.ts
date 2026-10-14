import {describe,it,expect,vi} from 'vitest';
import {publishedReportFixture} from '../fixtures/reports/published';
import {reportTransaction} from '../../lib/server/reports/commands';
import {queueReportRevisionCleanup,cleanupReportRevisionPayloads,cleanupReportFiles,cleanupStagedReportObjects,cleanupReportScratch} from '../../lib/server/reports/cleanup';
import {mkdir,mkdtemp,writeFile,utimes,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {streamReportArtifact} from '../../lib/server/reports/artifacts';
import {readReportObject,writeReportObject} from '../../lib/server/reports/store';
import {BlobPrivateObjects} from '../../lib/server/storage/blob-objects';
import {createHash} from 'node:crypto';
import {objectKey} from '../../lib/server/storage/private-objects';

/** Actual rendered bytes copied into a deterministic private-adapter fault model.
 * This proves domain interruption/retry, not an actual hosted Blob operation. */
async function verifyInterruptedBlobCleanup(fixture:Awaited<ReturnType<typeof publishedReportFixture>>,report:{reportId:string;revisionId:string},files:any[]){
 const mirror=new Map<string,Buffer>();
 for(const file of files)mirror.set(objectKey(process.env.TURAS_ENVIRONMENT_ID!,'report',file.object_key),await readReportObject(file.object_key,file.content_digest,Number(file.size_bytes)));
 await reportTransaction(db=>queueReportRevisionCleanup(db,report.revisionId));
 const prior=Object.fromEntries(['TURAS_PRIVATE_OBJECT_BACKEND','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN'].map(key=>[key,process.env[key]]));
 let deleted=0,interrupt=true;
 const headers=vi.spyOn(BlobPrivateObjects.prototype,'headers').mockResolvedValue({objects:[]});
 const stat=vi.spyOn(BlobPrivateObjects.prototype,'stat').mockImplementation(async key=>{const bytes=mirror.get(key);return bytes?{key,sizeBytes:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')}:null;});
 const remove=vi.spyOn(BlobPrivateObjects.prototype,'delete').mockImplementation(async key=>{if(!mirror.has(key))throw Error('Unexpected cleanup key');if(interrupt&&++deleted===2)throw Error('Controlled private store interruption');mirror.delete(key);});
 try{
  Object.assign(process.env,{TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'controlled016',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_controlled016_SYNTHETIC_NOT_A_CREDENTIAL'});
  await expect(reportTransaction(db=>cleanupReportFiles(db))).rejects.toThrow('Controlled private store interruption');
  expect(mirror.size).toBe(files.length-1);
  await expect(streamReportArtifact(fixture.reviewer,report.reportId,files[0].id)).rejects.toThrow();
  expect((await reportTransaction(async db=>(await db.query("SELECT count(*)::int AS n FROM report_store_objects WHERE revision_id=$1 AND state='deleted'",[report.revisionId])).rows[0].n))).toBe(0);
  interrupt=false;
  expect((await reportTransaction(db=>cleanupReportFiles(db))).purged).toBe(files.length);
  expect(mirror.size).toBe(0);
  expect((await reportTransaction(db=>cleanupReportFiles(db))).purged).toBe(0);
 }finally{
  headers.mockRestore();stat.mockRestore();remove.mockRestore();
  for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
 // The fault model never deletes originals from another backend. Retire the
 // real owned local copies under a new exact cause in the remaining check.
 for(const file of files)expect(createHash('sha256').update(await readReportObject(file.object_key,file.content_digest,Number(file.size_bytes))).digest('hex')).toBe(file.content_digest);
 await reportTransaction(async db=>{
  // Restore only the fixture catalog for the untouched local copies after the
  // mirrored adapter test, then use a fresh cause for their actual deletion.
  await db.query("UPDATE report_store_objects SET state='finalized' WHERE revision_id=$1 AND object_key=ANY($2::uuid[]) AND state='deleted'",[report.revisionId,files.map(file=>file.object_key)]);
  await db.query('UPDATE report_revision_states SET generation=generation+1 WHERE revision_id=$1',[report.revisionId]);
 });
}

async function verifyArtifactCleanup(fixture:Awaited<ReturnType<typeof publishedReportFixture>>){
  await reportTransaction(db=>cleanupReportFiles(db));
  const sentinel=await writeReportObject(Buffer.from('Unrelated exact report object must survive'));
  const report=fixture.reports[1];
  const files=await reportTransaction(async db=>(await db.query('SELECT a.id,a.object_key,a.content_digest,a.size_bytes FROM report_artifacts a WHERE a.revision_id=$1 ORDER BY a.format',[report.revisionId])).rows);
  const artifact=await streamReportArtifact(fixture.reviewer,report.reportId,files[0].id),reader=artifact.stream.getReader();
  expect((await reader.read()).value?.byteLength).toBeGreaterThan(0);
  await reportTransaction(async db=>{
   await db.query("UPDATE report_revision_states SET visibility='withheld',generation=generation+1 WHERE revision_id=$1",[report.revisionId]);
   await queueReportRevisionCleanup(db,report.revisionId);
  });
  await expect(reader.read()).rejects.toThrow('Report download is no longer available');
  process.env.TURAS_REPORTS_ENABLED='false';
  await reportTransaction(async db=>{
   await db.query('UPDATE report_revision_states SET generation=generation+1 WHERE revision_id=$1',[report.revisionId]);
   expect((await cleanupReportFiles(db)).purged).toBe(0);
  });
  expect((await readReportObject(files[0].object_key,files[0].content_digest,Number(files[0].size_bytes))).length).toBe(Number(files[0].size_bytes));
  await verifyInterruptedBlobCleanup(fixture,report,files);
  await reportTransaction(async db=>{await queueReportRevisionCleanup(db,report.revisionId);expect((await cleanupReportFiles(db)).purged).toBe(files.length);});
  await expect(readReportObject(files[0].object_key,files[0].content_digest,Number(files[0].size_bytes))).rejects.toMatchObject({code:'ENOENT'});
  expect((await readReportObject(sentinel.objectKey,sentinel.contentDigest,sentinel.sizeBytes)).length).toBe(sentinel.sizeBytes);
  const orphan=await writeReportObject(Buffer.from('Synthetic expired staged render'));
  await reportTransaction(async db=>{
   await db.query(`INSERT INTO report_store_objects(object_key,environment_id,revision_id,content_digest,size_bytes,state,expires_at)
    VALUES($1,$2,$3,$4,$5,'staged',now()-interval '1 second')`,[orphan.objectKey,process.env.TURAS_ENVIRONMENT_ID,report.revisionId,orphan.contentDigest,orphan.sizeBytes]);
   expect((await cleanupStagedReportObjects(db)).purged).toBe(1);
  });
  await expect(readReportObject(orphan.objectKey,orphan.contentDigest,orphan.sizeBytes)).rejects.toMatchObject({code:'ENOENT'});
  expect((await readReportObject(sentinel.objectKey,sentinel.contentDigest,sentinel.sizeBytes)).length).toBe(sentinel.sizeBytes);
  const root=join(process.env.TURAS_REPORT_STORE_ROOT!,'scratch');await mkdir(root,{recursive:true,mode:0o700});
  const old=await mkdtemp(join(root,'render-')),foreign=await mkdtemp(join(root,'render-'));
  const job=await reportTransaction(async db=>(await db.query("SELECT id FROM report_jobs WHERE revision_id=$1 AND kind='render'",[report.revisionId])).rows[0]);
  for(const [path,environmentId]of [[old,process.env.TURAS_ENVIRONMENT_ID],[foreign,'foreign-environment']]){
   const marker=join(path!,'.turas-report-scratch.json');await writeFile(marker,JSON.stringify({environmentId,jobId:job.id,leaseToken:randomUUID()}),{mode:0o600});
   const past=new Date(Date.now()-7200000);await utimes(marker,past,past);
  }
  expect((await reportTransaction(db=>cleanupReportScratch(db))).purged).toBe(1);
  await expect(lstat(old)).rejects.toMatchObject({code:'ENOENT'});expect((await lstat(foreign)).isDirectory()).toBe(true);
}
describe('exact report revision payload cleanup',()=>{
 it('rejects stale causes and purges withdrawn payloads with reporting disabled',async()=>{
  const fixture=await publishedReportFixture();
  const revisionId=fixture.published.revisionId;
  process.env.TURAS_REPORTS_ENABLED='false';
  await reportTransaction(async db=>{
   await db.query("UPDATE report_revision_states SET visibility='withheld',generation=generation+1 WHERE revision_id=$1",[revisionId]);
   await queueReportRevisionCleanup(db,revisionId);
   await db.query('UPDATE report_revision_states SET generation=generation+1 WHERE revision_id=$1',[revisionId]);
    expect((await cleanupReportRevisionPayloads(db)).purged).toBe(0);
    expect((await db.query('SELECT 1 FROM report_revision_payloads WHERE revision_id=$1',[revisionId])).rowCount).toBe(1);
    expect((await db.query('SELECT 1 FROM report_decision_payloads WHERE revision_id=$1',[revisionId])).rowCount).toBe(1);
    expect((await db.query('SELECT 1 FROM report_calculations WHERE revision_id=$1',[revisionId])).rowCount).toBe(1);
    await queueReportRevisionCleanup(db,revisionId);
    expect((await cleanupReportRevisionPayloads(db)).purged).toBe(4);
    expect((await db.query('SELECT 1 FROM report_revision_payloads WHERE revision_id=$1',[revisionId])).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM report_decision_payloads WHERE revision_id=$1',[revisionId])).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM report_calculations WHERE revision_id=$1',[revisionId])).rowCount).toBe(0);
   expect((await db.query('SELECT 1 FROM report_publications WHERE revision_id=$1',[revisionId])).rowCount).toBe(1);
   // A separate revision must survive cleanup of the withdrawn publication.
   expect((await db.query('SELECT 1 FROM report_revision_payloads WHERE revision_id=$1',[fixture.reports[1].revisionId])).rowCount).toBe(1);
   await db.query("UPDATE report_revision_states SET payload_expires_at=now()-interval '1 second' WHERE revision_id=$1",[fixture.reports[2].revisionId]);
    expect((await cleanupReportRevisionPayloads(db)).purged).toBe(3);
    expect((await db.query('SELECT 1 FROM report_calculations WHERE revision_id=$1',[fixture.reports[2].revisionId])).rowCount).toBe(0);
   const expired=(await db.query('SELECT visibility FROM report_revision_states WHERE revision_id=$1',[fixture.reports[2].revisionId])).rows[0];
    expect(expired.visibility).toBe('expired');
    expect((await db.query('SELECT 1 FROM report_calculations WHERE revision_id=$1',[fixture.reports[1].revisionId])).rowCount).toBe(1);
   expect((await db.query('SELECT 1 FROM report_revision_payloads WHERE revision_id=$1',[fixture.reports[1].revisionId])).rowCount).toBe(1);
   });
   await verifyArtifactCleanup(fixture);
 });
});
