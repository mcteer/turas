import {describe,it,expect} from 'vitest';import {verifiedBundledBrand,reportRendererImageDigest} from '../../lib/server/reports/brand';
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
