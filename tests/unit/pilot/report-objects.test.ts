vi.mock('../../../lib/server/operations/admission',()=>({withOperationalIo:async(run:()=>Promise<unknown>)=>run()}));
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {blobMock} from '../../fixtures/pilot/blob-mock';
import {assertReportStoreReady,writeReportObject,readReportObject,deleteExactReportObject} from '../../../lib/server/reports/store';
const keys=['TURAS_PRIVATE_OBJECT_BACKEND','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN','TURAS_ENVIRONMENT_ID'] as const;let previous:Record<string,string|undefined>;
beforeEach(()=>{previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));Object.assign(process.env,{TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'store_controlledStore',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_controlledStore_SYNTHETICFIXTUREONLY',TURAS_ENVIRONMENT_ID:'controlled-report-objects'});blobMock.objects.clear();});
afterEach(()=>{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
it('uses private readiness and exact immutable bytes for both report namespaces',async()=>{
 const bytes=Buffer.from('Synthetic report bytes'),digest=createHash('sha256').update(bytes).digest('hex');
 for(const namespace of ['report','gap-report'] as const){await assertReportStoreReady(namespace);const key=randomUUID();expect(await writeReportObject(bytes,key,true,namespace)).toMatchObject({objectKey:key,contentDigest:digest,sizeBytes:bytes.length});expect(await readReportObject(key,digest,bytes.length,true,namespace)).toEqual(bytes);await expect(deleteExactReportObject(key,'a'.repeat(64),bytes.length,true,namespace)).rejects.toThrow('identity changed');expect(await readReportObject(key,digest,bytes.length,true,namespace)).toEqual(bytes);await deleteExactReportObject(key,digest,bytes.length,true,namespace);await deleteExactReportObject(key,digest,bytes.length,true,namespace);}
});
