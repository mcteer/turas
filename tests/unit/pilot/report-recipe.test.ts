import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
import {requireSyntheticReportSampleBrand,publishExistingSyntheticReportSamples} from '../../../scripts/pilot-report-recipe';

describe('synthetic report operator brand history',()=>{
 const previous={brandId:randomUUID(),version:1,state:'approved'},head={brandId:randomUUID(),version:2,state:'draft'};
 it('selects the unique latest brand only when all captured sample revisions bind it',()=>{
  expect(requireSyntheticReportSampleBrand({brands:[head,previous]},head)).toEqual(head);
  expect(requireSyntheticReportSampleBrand({brands:[previous,{...head,state:'approved'}]},head).state).toBe('approved');
  for(const [brands,expected] of [
   [[],head],[[previous,head],previous],[[previous,head],{...head,brandId:randomUUID()}],
   [[previous,head,{...head,brandId:randomUUID()}],head],
   [[previous,{...head,state:'revoked'}],head],[[previous,{...head,state:'unknown'}],head],
   [[previous,{...head,brandId:previous.brandId}],head],
  ] as Array<[unknown[],typeof head]>)expect(()=>requireSyntheticReportSampleBrand({brands},expected)).toThrow('Exact current synthetic sample brand required');
  expect(()=>requireSyntheticReportSampleBrand({brands:[previous,head]})).toThrow();
 });
});

function fixture(){
 const customerId=randomUUID(),engagementId=randomUUID(),workloadId=randomUUID(),brandId=randomUUID();
 const scope={workspaceId:randomUUID(),environmentMarker:'synthetic-report-operator'} as PilotHostedScope;
 const heads=['weekly','monthly','quarterly'].map(kind=>({report_id:randomUUID(),customer_id:customerId,kind,audience:'delivery',timezone:'UTC',engagement_ids:[engagementId],workload_ids:[workloadId],include_customer_level:true,report_version:2,revision_id:randomUUID(),brand_id:brandId,brand_version:2}));
 const samples=heads.map(h=>({reportId:h.report_id,revisionId:h.revision_id,version:2}));
 const views=new Map(heads.map(h=>[String(h.report_id),{reportId:h.report_id,revisionId:h.revision_id,customerId,version:2,state:'review_ready',artifacts:h.kind==='weekly'?[]:['pdf','pptx'].map(format=>({id:randomUUID(),format,sizeBytes:64,contentDigest:'a'.repeat(64)}))}]));
 const brands=[{brandId:randomUUID(),version:1,state:'approved'},{brandId,version:2,state:'draft'}];
 const calls:Array<{path:string;method:string;body?:any}>=[];const receipts=new Map<string,unknown>();let synthetic=true,loseBrandReply=false,artifactReads=0;
 const db={query:async(sql:string)=>({rows:sql.startsWith('SELECT c.synthetic')?[{synthetic}]:sql.includes('FROM report_scopes')?heads:[]})} as unknown as Client;
 const request=async(path:string,method:'GET'|'POST',body?:any)=>{
  calls.push({path,method,body});
  if(method==='GET'&&path==='/api/reports/brands')return {data:{brands}};
  if(method==='GET'&&path.startsWith('/api/reports/receipts/')){const receipt=receipts.get(path.split('/').at(-1)!);if(!receipt)throw Error('No receipt');return {data:receipt};}
  const id=path.split('/')[3];
  if(method==='GET'&&views.has(id))return {data:{...views.get(id)}};
  if(method==='POST'&&path.endsWith('/preview'))return {data:{previewId:randomUUID(),previewDigest:'b'.repeat(64)}};
  if(method==='POST'&&path.endsWith('/decisions')){
   if(path.includes('/brands/')){const result={brandId,version:2,state:'approved'};receipts.set(body.requestKey,result);if(loseBrandReply)throw Error('Lost response after committed decision');return {data:result};}
   const view=views.get(id)!;view.state='published';return {data:{...view,publicationId:randomUUID()}};
  }
  throw Error('Unexpected operation: '+method+' '+path);
 };
 // Publication GETs retain the normal API publication identifier.
 const transport:typeof request=async(path,method,body)=>{const v=await request(path,method,body);if(method==='GET'&&views.has(path.split('/')[3])&&(v.data as any).state==='published')return {data:{...v.data,publicationId:randomUUID()}};return v;};
 const input={scope,db,customerId,engagementId,workloadId,signal:new AbortController().signal,request:transport,readArtifact:async()=>{artifactReads++;},samples};
 return {input,heads,views,brands,calls,setSynthetic:(v:boolean)=>{synthetic=v;},loseBrandReply:()=>{loseBrandReply=true;},artifactReads:()=>artifactReads};
}
describe('post-render synthetic report continuation',()=>{
 it('reads all three current samples before normal brand and publication decisions, without rendering again',async()=>{
  const f=fixture();f.loseBrandReply();const result=await publishExistingSyntheticReportSamples(f.input);
  expect(result).toMatchObject({actualRenderedJobs:0,normalReportCommands:4,actualArtifactReads:4,brandVersion:2});expect(f.artifactReads()).toBe(4);
  const firstWrite=f.calls.findIndex(c=>c.method==='POST');expect(f.calls.slice(0,firstWrite).filter(c=>f.views.has(c.path.split('/')[3]))).toHaveLength(3);
  expect(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/brands/'+result.brandId+'/decisions'))).toHaveLength(1);
  const brandDecision=f.calls.find(c=>c.method==='POST'&&c.path.includes('/brands/')&&c.path.endsWith('/decisions'))!;
  expect(f.calls.some(c=>c.method==='GET'&&c.path==='/api/reports/receipts/'+brandDecision.body.requestKey)).toBe(true);
  expect(f.calls.filter(c=>c.method==='POST'&&!c.path.includes('/brands/')&&c.path.endsWith('/decisions'))).toHaveLength(3);
  expect(f.calls.some(c=>c.path.endsWith('/commands')||c.body?.action==='render'||c.body?.action==='prepare'||c.body?.action==='revise')).toBe(false);
 });
 it('refuses stale, foreign, wrong-state or mismatched samples before any write',async()=>{
  const mutations=[
   (f:ReturnType<typeof fixture>)=>{f.setSynthetic(false);},
   (f:ReturnType<typeof fixture>)=>{f.heads[0].revision_id=randomUUID();},
   (f:ReturnType<typeof fixture>)=>{f.heads[0].brand_id=randomUUID();},
   (f:ReturnType<typeof fixture>)=>{f.heads[0].brand_version=1;},
   (f:ReturnType<typeof fixture>)=>{f.heads[0].workload_ids=[randomUUID()];},
   (f:ReturnType<typeof fixture>)=>{f.heads[0].customer_id=randomUUID();},
   (f:ReturnType<typeof fixture>)=>{f.views.get(f.heads[2].report_id)!.state='rendering';},
   (f:ReturnType<typeof fixture>)=>{f.views.get(f.heads[1].report_id)!.version=3;},
   (f:ReturnType<typeof fixture>)=>{f.heads[2].kind='monthly';},
   (f:ReturnType<typeof fixture>)=>{f.brands.push({...f.brands[1],brandId:randomUUID()});},
   (f:ReturnType<typeof fixture>)=>{f.brands[1].state='revoked';},
  ];
  for(const mutate of mutations){const f=fixture();mutate(f);await expect(publishExistingSyntheticReportSamples(f.input)).rejects.toThrow();expect(f.calls.some(c=>c.method==='POST')).toBe(false);}
 });
 it('requires the retained forty-slide layout when continuing the maximum layout exercise',async()=>{
  const f=fixture();await expect(publishExistingSyntheticReportSamples({...f.input,maximumReportLayout:true})).rejects.toThrow('retain forty slides');expect(f.calls.some(c=>c.method==='POST')).toBe(false);
 });
 it('refuses duplicate sample identities and a cancelled continuation before reads or writes',async()=>{
  const f=fixture();await expect(publishExistingSyntheticReportSamples({...f.input,samples:[f.input.samples[0],f.input.samples[0],f.input.samples[2]]})).rejects.toThrow();expect(f.calls).toHaveLength(0);
  const abort=new AbortController();abort.abort();await expect(publishExistingSyntheticReportSamples({...f.input,signal:abort.signal})).rejects.toThrow();expect(f.calls).toHaveLength(0);
 });
});
