import {reportDigest} from '../../lib/server/reports/commands';
import {requireCurrentReportBrand} from '../../lib/server/reports/brand';
import {withRecoveryReportBrand,recoveryReportBrandBinding} from '../../lib/server/operations/recovery-report-brand';
import type {PoolClient} from 'pg';
const recoveryAuthentication=vi.hoisted(()=>({proof:null as any}));
vi.mock('../../lib/server/operations/recovery-http-read',()=>({authenticateRecoveryHttpRead:vi.fn(async()=>{if(!recoveryAuthentication.proof)throw Error('No authenticated admission');return recoveryAuthentication.proof;})}));
import {describe,it,expect,vi} from 'vitest';import {verifiedBundledBrand,reportRendererImageDigest} from '../../lib/server/reports/brand';
describe('brand review renderer binding',()=>{
 it('requires a new profile digest when the immutable renderer image changes',async()=>{
  const keys=['TURAS_REPORT_RENDERER_IMAGE','TURAS_PILOT_RENDERER_IMAGE','TURAS_JOB_EXECUTOR','VERCEL'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try{
   delete process.env.VERCEL;delete process.env.TURAS_PILOT_RENDERER_IMAGE;process.env.TURAS_JOB_EXECUTOR='local';
   const digest='a'.repeat(64),local='sha256:'+digest,hosted='vcr.vercel.com/team/project/renderer@sha256:'+digest;
   process.env.TURAS_REPORT_RENDERER_IMAGE=local;const a=await verifiedBundledBrand();
   expect(reportRendererImageDigest(a.profileManifest.rendererImage)).toBe(digest);
   process.env.TURAS_REPORT_RENDERER_IMAGE='sha256:'+'b'.repeat(64);const b=await verifiedBundledBrand();
   expect(a.profileDigest).not.toBe(b.profileDigest);expect(a.manifestDigest).toBe(b.manifestDigest);expect(a.rendererCodeDigest).toMatch(/^[a-f0-9]{64}$/);
   process.env.TURAS_JOB_EXECUTOR='sandbox';process.env.TURAS_REPORT_RENDERER_IMAGE=hosted;const c=await verifiedBundledBrand();
   expect(reportRendererImageDigest(c.profileManifest.rendererImage)).toBe(digest);
   expect(c.profileDigest).not.toBe(a.profileDigest);expect(c.manifestDigest).toBe(a.manifestDigest);
   expect(reportRendererImageDigest('vcr.vercel.com/team/project/renderer@sha256:'+'b'.repeat(64))).not.toBe(digest);
  }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
 });
 it('blocks mutable image tags from a brand approval binding',async()=>{
  const previous=process.env.TURAS_REPORT_RENDERER_IMAGE;
  try{
   process.env.TURAS_REPORT_RENDERER_IMAGE='mutable:latest';await expect(verifiedBundledBrand()).rejects.toMatchObject({code:'brand_unapproved'});
   for(const image of ['mutable:latest','vcr.vercel.com/team/project/renderer:latest','sha256:'+'a'.repeat(63),'sha256:'+'g'.repeat(64),'vcr.vercel.com/team/project/renderer@sha256:'+'a'.repeat(64)+':extra','other.example/renderer@sha256:'+'a'.repeat(64),null]){
    expect(()=>reportRendererImageDigest(image)).toThrow(expect.objectContaining({code:'brand_unapproved'}));
   }
  }finally{if(previous===undefined)delete process.env.TURAS_REPORT_RENDERER_IMAGE;else process.env.TURAS_REPORT_RENDERER_IMAGE=previous;}
 });
});

describe('archived report renderer identity in authenticated recovery',()=>{
 it('binds archived bytes to the exact live report transaction and retains approval and immutable manifests',async()=>{
  const keys=['TURAS_REPORT_RENDERER_IMAGE','TURAS_PILOT_RENDERER_IMAGE','TURAS_JOB_EXECUTOR','VERCEL'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try{
   delete process.env.VERCEL;delete process.env.TURAS_PILOT_RENDERER_IMAGE;process.env.TURAS_JOB_EXECUTOR='local';process.env.TURAS_REPORT_RENDERER_IMAGE='sha256:'+'a'.repeat(64);
   const current=await verifiedBundledBrand(),image='vcr.vercel.com/team/project/renderer@sha256:'+'b'.repeat(64);
   const manifest={...current.profileManifest,rendererImage:image};
   const original={id:'brand',manifest,manifest_digest:reportDigest(manifest),font_digest:current.fontDigest,template_digest:current.templateDigest,state:'approved'};
   let row={...original};let artifact={renderer_digest:'b'.repeat(64),brand_digest:row.manifest_digest,font_digest:row.font_digest,template_digest:row.template_digest};let exactArtifact=true;
   const db={query:vi.fn(async(sql:string,values:unknown[])=>{
    if(sql.startsWith('SELECT * FROM report_brand_profiles'))return {rows:[row]};
    expect(sql).toContain('r.brand_id=$7');expect(values).toEqual(['artifact','environment','workspace','customer','revision','report','brand','bytes',100,1]);
    return {rows:exactArtifact?[artifact]:[]};
   })} as unknown as PoolClient;
   const request=new Request('http://127.0.0.1/api/operations/recovery-read/admission/report');
   const proof={readKind:'report',actor:{workspaceId:'workspace'},environmentId:'environment',customerId:'customer',recordId:'artifact',recordParentId:'report',recordRevisionId:'revision',recordDigest:'bytes',recordSize:100,recordGeneration:1,deadline:Date.now()+59000};
   recoveryAuthentication.proof=proof;
   await expect(requireCurrentReportBrand(db,'workspace','brand')).rejects.toMatchObject({code:'brand_unapproved'});
   await withRecoveryReportBrand(db,request,'admission',async()=>{
    expect((await requireCurrentReportBrand(db,'workspace','brand')).id).toBe('brand');
    await expect(requireCurrentReportBrand({...db} as PoolClient,'workspace','brand')).rejects.toMatchObject({code:'brand_unapproved'});
    await expect(recoveryReportBrandBinding(db,'other-workspace','brand')).rejects.toMatchObject({status:403});
    for(const state of ['draft','revoked']){row={...original,state};await expect(requireCurrentReportBrand(db,'workspace','brand')).rejects.toMatchObject({code:'brand_unapproved'});if(state==='draft')expect((await requireCurrentReportBrand(db,'workspace','brand',false)).state).toBe('draft');else await expect(requireCurrentReportBrand(db,'workspace','brand',false)).rejects.toMatchObject({code:'brand_unapproved'});}
    row={...original};
    for(const changed of [{manifest:{...manifest,rendererImage:'mutable:latest'}},{manifest:{...manifest,rendererCodeDigest:'c'.repeat(64)}},{font_digest:'c'.repeat(64)},{template_digest:'c'.repeat(64)}]){
     row={...original,...changed};await expect(requireCurrentReportBrand(db,'workspace','brand')).rejects.toMatchObject({code:'brand_unapproved'});
    }
    row={...original};const retained={...artifact};
    for(const field of ['renderer_digest','brand_digest','font_digest','template_digest'] as const){artifact={...retained,[field]:'c'.repeat(64)};await expect(requireCurrentReportBrand(db,'workspace','brand')).rejects.toMatchObject({code:'brand_unapproved'});}
    artifact=retained;exactArtifact=false;await expect(requireCurrentReportBrand(db,'workspace','brand')).rejects.toMatchObject({status:403});exactArtifact=true;
   });
   expect(await recoveryReportBrandBinding(db,'workspace','brand')).toBeNull();
   await expect(requireCurrentReportBrand(db,'workspace','brand')).rejects.toMatchObject({code:'brand_unapproved'});
   recoveryAuthentication.proof={...proof,readKind:'profile'};await expect(withRecoveryReportBrand(db,request,'admission',async()=>{})).rejects.toMatchObject({status:403});
   recoveryAuthentication.proof=proof;await expect(withRecoveryReportBrand(db,request,'admission',async()=>{throw Error('consumer failed');})).rejects.toThrow('consumer failed');expect(await recoveryReportBrandBinding(db,'workspace','brand')).toBeNull();
   row={...original,manifest:{...current.profileManifest,rendererImage:'sha256:'+'a'.repeat(64)},manifest_digest:current.profileDigest,state:'draft'};expect((await requireCurrentReportBrand(db,'workspace','brand',false)).state).toBe('draft');
   recoveryAuthentication.proof=null;await expect(withRecoveryReportBrand(db,request,'admission',async()=>{})).rejects.toThrow('No authenticated admission');
  }finally{recoveryAuthentication.proof=null;for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
 });
});
