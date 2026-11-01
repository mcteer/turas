import {expect,it} from 'vitest';
import {operationalFenceDatabaseUrl} from '../../lib/server/db/operational-fence-url';
const runtime='postgresql://restricted:runtime%24secret@ep-owned-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require&application_name=runtime-fence';
const owner='postgresql://owner:owner-secret@ep-owned.c-12.us-east-1.aws.neon.tech/neondb';
it('uses a direct matching Neon host while retaining only runtime credentials and options',()=>{
 const direct=new URL(operationalFenceDatabaseUrl(runtime,owner)),original=new URL(runtime);
 expect(direct.hostname).toBe('ep-owned.c-12.us-east-1.aws.neon.tech');
 expect(direct.username).toBe(original.username);expect(direct.password).toBe(original.password);
 expect(direct.search).toBe(original.search);expect(direct.pathname).toBe(original.pathname);
 expect(direct.href).not.toContain('owner-secret');expect(direct.href).not.toContain('owner:');
});
it('rejects another endpoint, database or port rather than borrowing the owner connection',()=>{
 for(const invalid of [owner.replace('ep-owned.','ep-other.'),owner.replace('/neondb','/otherdb'),owner.replace('/neondb',':5433/neondb')])
  expect(()=>operationalFenceDatabaseUrl(runtime,invalid)).toThrow('Direct runtime fence target differs');
});
it('preserves direct and local runtime URLs without substituting privileged descriptors',()=>{
 for(const url of [owner.replace('owner:owner-secret','restricted:runtime-secret'),'postgresql://restricted:local@127.0.0.1:5432/turas_test?options=-c%20role%3Dturas_runtime'])
  expect(operationalFenceDatabaseUrl(url,owner)).toBe(url);
});
it('does not rewrite lookalike hosts outside the recognized Neon endpoint form',()=>{
 for(const host of ['ep-owned-pooler.neon.tech.example.com','ep-owned-pooler.example.com','custom-pooler.c-12.us-east-1.aws.neon.tech']){
  const url='postgresql://restricted:synthetic@'+host+'/neondb';expect(operationalFenceDatabaseUrl(url,owner)).toBe(url);
 }
});

it('rejects query routing overrides on either connection descriptor',()=>{
 for(const parameter of ['host=ep-owned-pooler.c-12.us-east-1.aws.neon.tech','port=5433','database=otherdb']){
  expect(()=>operationalFenceDatabaseUrl(runtime+'&'+parameter,owner)).toThrow('Direct runtime fence target differs');
  expect(()=>operationalFenceDatabaseUrl(runtime,owner+'?'+parameter)).toThrow('Direct runtime fence target differs');
 }
});

it('does not expose malformed credential-bearing descriptors in errors',()=>{
 for(const [runtimeUrl,ownerUrl]of [['postgresql://restricted:private-runtime@[]/db',owner],[runtime,'postgresql://owner:private-owner@[]/db']]){
  let error:unknown;try{operationalFenceDatabaseUrl(runtimeUrl,ownerUrl);}catch(value){error=value;}
  expect(error).toBeInstanceOf(Error);expect(String(error)).toBe('Error: Direct runtime fence target differs');
  expect(error).not.toHaveProperty('input');expect(error).not.toHaveProperty('cause');
 }
});
