import {it,expect} from 'vitest';
import {privateObjectBackend} from '../../../lib/server/storage/factory';
it('requires the exact store identity carried by the pinned SDK token',()=>{
 const environment:NodeJS.ProcessEnv={NODE_ENV:'test',TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'store_controlledStore',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_controlledStore_SYNTHETICFIXTUREONLY'};
 expect(privateObjectBackend(environment)).toBe('blob');expect(privateObjectBackend({...environment,BLOB_STORE_ID:'controlledStore'})).toBe('blob');
 expect(()=>privateObjectBackend({...environment,BLOB_STORE_ID:'store_foreignStore'})).toThrow('identity differs');
 expect(()=>privateObjectBackend({...environment,BLOB_READ_WRITE_TOKEN:'unsupported-format'})).toThrow('identity differs');
 expect(()=>privateObjectBackend({...environment,BLOB_READ_WRITE_TOKEN:undefined})).toThrow('configuration required');
 expect(()=>privateObjectBackend({...environment,TURAS_PRIVATE_OBJECT_BACKEND:'unexpected'})).toThrow('Unknown');
});
it('never selects an ephemeral local store for a hosted deployment',()=>{expect(privateObjectBackend({NODE_ENV:'test'})).toBe('local');for(const backend of [undefined,'local'])expect(()=>privateObjectBackend({NODE_ENV:'production',VERCEL:'1',VERCEL_BLOB_RETRIES:'0',TURAS_PRIVATE_OBJECT_BACKEND:backend})).toThrow('Hosted private storage');expect(()=>privateObjectBackend({NODE_ENV:'production',VERCEL:'1',VERCEL_BLOB_RETRIES:'0',TURAS_PRIVATE_OBJECT_BACKEND:'blob'})).toThrow('configuration required');expect(privateObjectBackend({NODE_ENV:'production',VERCEL:'1',VERCEL_BLOB_RETRIES:'0',TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'store_controlledStore',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_controlledStore_SYNTHETICFIXTUREONLY'})).toBe('blob');});
it('uses explicit project OIDC with the exact selected store and no read-write token',async()=>{
 const {privateBlobAuth}=await import('../../../lib/server/storage/blob-auth');
 const env:NodeJS.ProcessEnv={NODE_ENV:'test',TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'store_controlledStore',VERCEL_OIDC_TOKEN:'synthetic.project.identity'};
 expect(privateObjectBackend(env)).toBe('blob');expect(privateBlobAuth(env)).toEqual({storeId:'controlledStore',oidcToken:'synthetic.project.identity'});
 expect(()=>privateBlobAuth({...env,VERCEL_OIDC_TOKEN:'malformed'})).toThrow('OIDC');
 expect(()=>privateBlobAuth({...env,BLOB_READ_WRITE_TOKEN:'invalid'})).toThrow('identity differs');
});
it('lets the pinned SDK obtain fresh hosted request identity without a static secret',async()=>{
 const {privateBlobAuth}=await import('../../../lib/server/storage/blob-auth');
 const env:NodeJS.ProcessEnv={NODE_ENV:'production',VERCEL:'1',VERCEL_BLOB_RETRIES:'0',TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'store_controlledStore'};
 expect(privateObjectBackend(env)).toBe('blob');expect(privateBlobAuth(env)).toEqual({storeId:'controlledStore'});
 expect(()=>privateBlobAuth({...env,VERCEL_BLOB_RETRIES:undefined})).toThrow('disabled SDK retries');
 expect(()=>privateBlobAuth({...env,VERCEL_BLOB_RETRIES:'10'})).toThrow('disabled SDK retries');
 expect(()=>privateBlobAuth({...env,VERCEL:undefined})).toThrow('configuration required');
 expect(()=>privateBlobAuth({...env,BLOB_STORE_ID:undefined})).toThrow('configuration required');
});
