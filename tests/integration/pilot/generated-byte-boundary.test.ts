import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {blobMock} from '../../fixtures/pilot/blob-mock';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {writeReportObject,readReportObject,deleteExactReportObject} from '../../../lib/server/reports/store';
import {objectKey} from '../../../lib/server/storage/private-objects';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {freezeReportMail} from '../../../lib/server/reports/resend';
import {maximumPilotPdf} from '../../../scripts/pilot-file-fixtures';
const original={backend:process.env.TURAS_PRIVATE_OBJECT_BACKEND,store:process.env.BLOB_STORE_ID,token:process.env.BLOB_READ_WRITE_TOKEN,retries:process.env.VERCEL_BLOB_RETRIES};
beforeAll(()=>{requireOwnedPilotDatabase(process.env,true);});
beforeEach(()=>{Object.assign(process.env,{TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'store_reportBoundaryFixture',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_reportBoundaryFixture_SYNTHETICFIXTUREONLY',VERCEL_BLOB_RETRIES:'0'});blobMock.objects.clear();});
afterEach(()=>{blobMock.objects.clear();for(const [key,value] of Object.entries({TURAS_PRIVATE_OBJECT_BACKEND:original.backend,BLOB_STORE_ID:original.store,BLOB_READ_WRITE_TOKEN:original.token,VERCEL_BLOB_RETRIES:original.retries}))if(value===undefined)delete process.env[key];else process.env[key]=value;});
afterAll(closeRuntimePool);
it('roundtrips the exact ten MiB boundary through the actual private report wrapper and common Blob adapter',async()=>{
 // Synthetic storage fixture, never represented as normal renderer output or publication.
 const bytes=maximumPilotPdf(),key=randomUUID(),written=await writeReportObject(bytes,key),path=objectKey(process.env.TURAS_ENVIRONMENT_ID!,'report',key);
 expect(written).toEqual({objectKey:key,contentDigest:createHash('sha256').update(bytes).digest('hex'),sizeBytes:10485760});expect([...blobMock.objects.keys()]).toEqual([path]);
 expect(Buffer.compare(await readReportObject(key,written.contentDigest,written.sizeBytes),bytes)).toBe(0);
 await deleteExactReportObject(key,written.contentDigest,written.sizeBytes);expect(blobMock.objects.has(path)).toBe(false);await expect(readReportObject(key,written.contentDigest,written.sizeBytes)).rejects.toThrow();
});
it('refuses empty oversized changed and wrong-digest report bytes without accepting metadata as proof',async()=>{
 await expect(writeReportObject(Buffer.alloc(0))).rejects.toThrow('exceeds limit');await expect(writeReportObject(Buffer.alloc(10485761))).rejects.toThrow('exceeds limit');expect(blobMock.objects.size).toBe(0);
 const key=randomUUID(),bytes=Buffer.from('%PDF-synthetic-wrapper-boundary'),written=await writeReportObject(bytes,key),path=objectKey(process.env.TURAS_ENVIRONMENT_ID!,'report',key);
 await expect(readReportObject(key,'0'.repeat(64),bytes.length)).rejects.toThrow('integrity');await expect(readReportObject(key,written.contentDigest,bytes.length+1)).rejects.toThrow('integrity');
 blobMock.objects.set(path,Buffer.alloc(bytes.length,65));await expect(readReportObject(key,written.contentDigest,bytes.length)).rejects.toThrow('integrity');
});
it('keeps report writes immutable and refuses changed cleanup identities',async()=>{
 const key=randomUUID(),bytes=Buffer.from('%PDF-synthetic-immutable'),written=await writeReportObject(bytes,key),path=objectKey(process.env.TURAS_ENVIRONMENT_ID!,'report',key);
 expect(await writeReportObject(bytes,key)).toEqual(written);await expect(writeReportObject(Buffer.from('%PDF-another-value'),key)).rejects.toThrow('conflict');expect(blobMock.objects.get(path)).toEqual(bytes);
 await expect(deleteExactReportObject(key,'0'.repeat(64),bytes.length)).rejects.toThrow('identity changed');expect(blobMock.objects.has(path)).toBe(true);await deleteExactReportObject(key,written.contentDigest,bytes.length);expect(blobMock.objects.size).toBe(0);
});
it('preserves the separate ten MiB file and fifteen MiB pair serialization limits without sending mail',()=>{
 const base={from:'synthetic@example.com',to:'recipient@example.com',subject:'Synthetic boundary serialization only',html:'<p>Synthetic</p>',text:'Synthetic'},pdf=Buffer.alloc(10485760),pptx=Buffer.alloc(5242880);
 expect(freezeReportMail({...base,attachments:[{format:'pdf',bytes:pdf},{format:'pptx',bytes:pptx}]}).bytes.length).toBeLessThanOrEqual(23068672);
 expect(()=>freezeReportMail({...base,attachments:[{format:'pdf',bytes:Buffer.alloc(10485761)}]})).toThrow('attachment limits');expect(()=>freezeReportMail({...base,attachments:[{format:'pdf',bytes:pdf},{format:'pptx',bytes:Buffer.alloc(5242881)}]})).toThrow('attachment limits');
});
