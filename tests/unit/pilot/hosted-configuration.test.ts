import {it,expect} from 'vitest';
import {readHostedConfiguration,verifyHostedConfiguration} from '../../../lib/server/operations/hosted-configuration';
const image=(kind:string)=>'vcr.vercel.com/synthetic/turas/'+kind+'@sha256:'+'a'.repeat(64);
const env={TURAS_ENVIRONMENT_ID:'synthetic-preview',VERCEL_PROJECT_ID:'prj_synthetic',VERCEL_TEAM_ID:'team_synthetic',BLOB_STORE_ID:'store_synthetic',VERCEL_BLOB_RETRIES:'0',TURAS_PRIVATE_OBJECT_BACKEND:'blob',TURAS_JOB_EXECUTOR:'sandbox',TURAS_PILOT_HOSTED_JOBS_ENABLED:'1',TURAS_PILOT_SCANNER_IMAGE:image('scanner'),TURAS_PILOT_PARSER_IMAGE:image('parser'),TURAS_PILOT_RENDERER_IMAGE:image('renderer'),TURAS_PILOT_JOB_COST_JSON:"{\"maximumDispatches\":32,\"budgetId\":\"00000000-0000-4000-8000-000000000001\",\"scopeDigest\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"pricingDigest\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"}"};
it('reports only explicit runtime identities and limits without credential material',()=>{
 const result=readHostedConfiguration({...env,VERCEL_TOKEN:'private-provider-key',BLOB_READ_WRITE_TOKEN:'private-store-key',DATABASE_URL:'private-database',VERCEL_OIDC_TOKEN:'private-oidc'});
 expect(result).toMatchObject({storeId:'synthetic',dispatcherEnabled:true,maximumConcurrentJobs:2,maximumDeadlineMs:300000});
 expect(JSON.stringify(result)).not.toContain('private-');expect(Object.keys(result!)).not.toContain('token');
});
it('withholds configuration on missing identities, local fallback, tags or malformed enablement',()=>{
 for(const patch of [{VERCEL_BLOB_RETRIES:undefined},{VERCEL_BLOB_RETRIES:'10'},{BLOB_STORE_ID:''},{VERCEL_TEAM_ID:''},{TURAS_ENVIRONMENT_ID:''},{TURAS_JOB_EXECUTOR:'local'},{TURAS_PRIVATE_OBJECT_BACKEND:'local'},{TURAS_PILOT_PARSER_IMAGE:'vcr.vercel.com/synthetic/turas/parser:latest'},{TURAS_PILOT_HOSTED_JOBS_ENABLED:'yes'},{TURAS_PILOT_JOB_COST_JSON:'{}'},{TURAS_PILOT_JOB_COST_JSON:'{"maximumDispatches":0}'},{TURAS_PILOT_JOB_COST_JSON:'{invalid'}])expect(readHostedConfiguration({...env,...patch})).toBeNull();
});
it('rejects cross-target, changed store, image, enablement and job limit readbacks',()=>{
 const expected=readHostedConfiguration(env)!;
 for(const patch of [{projectId:'prj_other'},{teamId:'team_other'},{environmentMarker:'other'},{storeId:'other'},{dispatcherEnabled:false},{maximumConcurrentJobs:3},{maximumDeadlineMs:300001},{images:{...expected.images,parser:image('other')}}])expect(()=>verifyHostedConfiguration({...expected,...patch},expected)).toThrow();
});
it('verifies exact configured readback while refusing extra provider health claims',()=>{
 const expected=readHostedConfiguration(env)!;expect(verifyHostedConfiguration(JSON.parse(JSON.stringify(expected)),expected)).toEqual(expected);
 expect(()=>verifyHostedConfiguration({...expected,providerHealthy:true},expected)).toThrow();
});
