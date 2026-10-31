import {maximumPilotReportAnnotations} from './pilot-report-boundary';
import {planExecutiveSlides} from '../report-renderer/layout';
import {validateReportDocument} from '../lib/reports/document';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {reportPrepareSchema,reportRevisionCommandSchema,reportPublicationDecisionSchema} from '../lib/server/reports/schema';
const viewSchema=z.object({reportId:z.uuid(),revisionId:z.uuid(),customerId:z.uuid(),version:z.number().int().positive(),state:z.string(),artifacts:z.array(z.object({id:z.uuid(),format:z.enum(['pdf','pptx']),sizeBytes:z.number().int().positive().max(10485760),contentDigest:z.string().regex(/^[a-f0-9]{64}$/)}))});
const previewSchema=z.object({previewId:z.uuid(),previewDigest:z.string().regex(/^[a-f0-9]{64}$/)});
const sampleIdentitySchema=z.object({reportId:z.uuid(),revisionId:z.uuid(),version:z.number().int().positive()});
type SampleIdentity=z.infer<typeof sampleIdentitySchema>;
type SyntheticReportRecipeInput={scope:PilotHostedScope;db:Client;customerId:string;engagementId:string;workloadId:string;signal:AbortSignal;maximumReportLayout?:boolean;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;authorRequest:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;runQueuedRender:(revisionId:string)=>Promise<void>;readArtifact:(artifact:z.infer<typeof viewSchema>['artifacts'][number])=>Promise<void>};
export function requireSyntheticReportSampleBrand(value:unknown,expected?:{brandId:string;version:number}){
 const {brands}=z.object({brands:z.array(z.object({brandId:z.uuid(),version:z.number().int().positive(),state:z.string()}))}).parse(value);
 if(!brands.length||new Set(brands.map(x=>x.brandId)).size!==brands.length||new Set(brands.map(x=>x.version)).size!==brands.length)throw Error('Exact current synthetic sample brand required');
 const head=brands.reduce((a,b)=>a.version>b.version?a:b);
 if(!['draft','approved'].includes(head.state)||expected&&(head.brandId!==expected.brandId||head.version!==expected.version)||!expected&&brands.length!==1)throw Error('Exact current synthetic sample brand required');
 return head;
}
/** Continue only the approval/publication of three captured current samples.
 * This entry cannot create, revise, render, or queue a report. Domain preview
 * and decision APIs retain the actual authorization and publication fences. */
export async function publishExistingSyntheticReportSamples(input:Pick<SyntheticReportRecipeInput,'scope'|'db'|'customerId'|'engagementId'|'workloadId'|'signal'|'maximumReportLayout'|'request'|'readArtifact'>&{samples:readonly SampleIdentity[]}){
 const {scope,db,customerId,engagementId,workloadId,signal,request}=input;
 signal.throwIfAborted();
 const identities=z.array(sampleIdentitySchema).length(3).parse(input.samples);
 if(new Set(identities.map(x=>x.reportId)).size!==3||new Set(identities.map(x=>x.revisionId)).size!==3)throw Error('Three distinct current synthetic samples required');
 const linked=(await db.query('SELECT c.synthetic FROM customer_references c JOIN engagements e ON e.customer_id=c.id AND e.workspace_id=c.workspace_id WHERE c.id=$1 AND c.workspace_id=$2 AND e.id=$3',[customerId,scope.workspaceId,engagementId])).rows;
 if(linked.length!==1||linked[0].synthetic!==true)throw Error('Exact synthetic linked report scope required');
 const heads=(await db.query(`SELECT s.id AS report_id,s.customer_id,s.kind,s.audience,s.timezone,s.engagement_ids,s.workload_ids,s.include_customer_level,s.version AS report_version,v.id AS revision_id,v.brand_id,v.brand_version
 FROM report_scopes s JOIN report_revisions v ON v.id=s.current_revision_id AND v.report_id=s.id AND v.environment_id=s.environment_id AND v.workspace_id=s.workspace_id AND v.customer_id=s.customer_id
 WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.customer_id=$3 AND s.id=ANY($4::uuid[])`,[scope.environmentMarker,scope.workspaceId,customerId,identities.map(x=>x.reportId)])).rows;
 if(heads.length!==3||new Set(heads.map(x=>x.report_id)).size!==3||new Set(heads.map(x=>x.kind)).size!==3||!['weekly','monthly','quarterly'].every(kind=>heads.some(x=>x.kind===kind)))throw Error('Exact current weekly monthly quarterly sample heads required');
 const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
 const samples:z.infer<typeof viewSchema>[]=[];
 for(const expected of identities){
  const head=heads.find(x=>x.report_id===expected.reportId);
  if(!head||head.revision_id!==expected.revisionId||Number(head.report_version)!==expected.version||head.customer_id!==customerId||head.audience!=='delivery'||head.timezone!=='UTC'||JSON.stringify(head.engagement_ids)!==JSON.stringify([engagementId])||JSON.stringify(head.workload_ids)!==JSON.stringify([workloadId])||head.include_customer_level!==true)throw Error('Captured synthetic sample no longer matches current scope');
  signal.throwIfAborted();const current=viewSchema.parse(unwrap(await request('/api/reports/'+expected.reportId,'GET')));
  if(current.reportId!==expected.reportId||current.revisionId!==expected.revisionId||current.version!==expected.version||current.customerId!==customerId||current.state!=='review_ready')throw Error('Captured synthetic sample readback changed');
  if(head.kind!=='weekly'&&(current.artifacts.length!==2||new Set(current.artifacts.map(x=>x.format)).size!==2))throw Error('Actual PDF and PPTX artifacts required');
  if(input.maximumReportLayout&&head.kind!=='weekly'){
   const payload=(await db.query('SELECT document FROM report_revision_payloads WHERE revision_id=$1',[current.revisionId])).rows;
   if(payload.length!==1||planExecutiveSlides(validateReportDocument(payload[0].document)).length!==40)throw Error('Actual ordinary revised report must retain forty slides');
  }
  samples.push(current);
 }
 const expectedBrand={brandId:String(heads[0].brand_id),version:Number(heads[0].brand_version)};
 if(heads.some(x=>x.brand_id!==expectedBrand.brandId||Number(x.brand_version)!==expectedBrand.version))throw Error('All samples must retain the same captured brand');
 const brand=requireSyntheticReportSampleBrand(unwrap(await request('/api/reports/brands','GET')),expectedBrand);
 async function command(path:string,body:{requestKey:string;[key:string]:unknown}){signal.throwIfAborted();try{return unwrap(await request(path,'POST',body));}catch(error){try{return unwrap(await request('/api/reports/receipts/'+body.requestKey,'GET'));}catch{throw error;}}}
 const body={customerId,action:'approve',expectedVersion:brand.version,sampleRevisionIds:samples.map(x=>x.revisionId)};
 signal.throwIfAborted();const brandPreview=previewSchema.parse(unwrap(await request('/api/reports/brands/'+brand.brandId+'/preview','POST',body)));
 await command('/api/reports/brands/'+brand.brandId+'/decisions',{...body,...brandPreview,requestKey:randomUUID(),rationale:'Operator review of actual validated synthetic weekly, monthly and quarterly samples'});
 let actualArtifactReads=0;
 for(const sample of samples){
  signal.throwIfAborted();const current=viewSchema.parse(unwrap(await request('/api/reports/'+sample.reportId,'GET')));
  if(current.reportId!==sample.reportId||current.revisionId!==sample.revisionId||current.version!==sample.version||current.customerId!==customerId||current.state!=='review_ready')throw Error('Captured synthetic sample changed before publication');
  signal.throwIfAborted();const preview=previewSchema.parse(unwrap(await request('/api/reports/'+sample.reportId+'/preview','POST',{action:'publish',expectedVersion:current.version})));
  await command('/api/reports/'+sample.reportId+'/decisions',reportPublicationDecisionSchema.parse({action:'publish',requestKey:randomUUID(),expectedVersion:current.version,...preview,rationale:'Operator review and synthetic pilot publication of the linked report'}));
  const published=viewSchema.extend({publicationId:z.uuid()}).parse(unwrap(await request('/api/reports/'+sample.reportId,'GET')));
  if(published.reportId!==sample.reportId||published.revisionId!==sample.revisionId||published.customerId!==customerId||published.state!=='published')throw Error('Ordinary linked report publication unavailable');
  for(const artifact of published.artifacts){await input.readArtifact(artifact);actualArtifactReads++;}
 }
 return {contract:'pilot-synthetic-reports-post-render-v1',sampleRevisionIds:samples.map(x=>x.revisionId),brandId:brand.brandId,brandVersion:brand.version,normalReportCommands:4,actualRenderedJobs:0,actualArtifactReads,outboundSendAttempts:0,syntheticOnly:true,fullReportJourneyVerified:false,fullLinkedJourneyVerified:false};
}
export async function runSyntheticReportRecipe(input:SyntheticReportRecipeInput){
 const {scope,db,customerId,engagementId,workloadId,signal,request}=input;
 const rows=(await db.query('SELECT c.synthetic FROM customer_references c JOIN engagements e ON e.customer_id=c.id AND e.workspace_id=c.workspace_id WHERE c.id=$1 AND c.workspace_id=$2 AND e.id=$3',[customerId,scope.workspaceId,engagementId])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic linked report scope required');
 const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
 async function command(path:string,body:{requestKey:string;[key:string]:unknown},transport=request){signal.throwIfAborted();try{return unwrap(await transport(path,'POST',body));}catch(error){try{return unwrap(await transport('/api/reports/receipts/'+body.requestKey,'GET'));}catch{throw error;}}}
 const today=new Date(),year=today.getUTCFullYear(),month=today.getUTCMonth(),day=today.getUTCDate(),monday=new Date(Date.UTC(year,month,day-(today.getUTCDay()+6)%7)),quarter=Math.floor(month/3)*3;
 const date=(value:Date)=>value.toISOString().slice(0,10);
 const periods=[{kind:'weekly' as const,fromDate:date(monday),toDate:date(new Date(monday.valueOf()+6*86400000))},{kind:'monthly' as const,fromDate:date(new Date(Date.UTC(year,month,1))),toDate:date(new Date(Date.UTC(year,month+1,0)))},{kind:'quarterly' as const,fromDate:date(new Date(Date.UTC(year,quarter,1))),toDate:date(new Date(Date.UTC(year,quarter+3,0)))}];
 const samples:z.infer<typeof viewSchema>[]=[];let boundaryRevisions=0;
 for(const period of periods){
  let prepared=viewSchema.parse(await command('/api/reports/customers/'+customerId+'/commands',reportPrepareSchema.parse({action:'prepare',requestKey:randomUUID(),expectedVersion:0,selection:{kind:period.kind,audience:'delivery',timezone:'UTC',engagementIds:[engagementId],workloadIds:[workloadId],includeCustomerLevel:true},fromDate:period.fromDate,toDate:period.toDate,partial:true}),input.authorRequest));
  if(prepared.customerId!==customerId)throw Error('Linked report customer differs');
  if(input.maximumReportLayout&&period.kind!=='weekly'){
   const payload=(await db.query('SELECT document FROM report_revision_payloads WHERE revision_id=$1',[prepared.revisionId])).rows;if(payload.length!==1)throw Error('Exact normal captured report required');
   const boundary=maximumPilotReportAnnotations(payload[0].document);
   prepared=viewSchema.parse(await command('/api/reports/'+prepared.reportId+'/commands',reportRevisionCommandSchema.parse({action:'revise',requestKey:randomUUID(),expectedVersion:prepared.version,rationale:'Controlled synthetic maximum normal slide-layout exercise',annotations:boundary.annotations}),input.authorRequest));
   const current=(await db.query('SELECT document FROM report_revision_payloads WHERE revision_id=$1',[prepared.revisionId])).rows;
   if(current.length!==1||planExecutiveSlides(validateReportDocument(current[0].document)).length!==40)throw Error('Actual ordinary revised report must reach forty slides before paid render');boundaryRevisions++;
  }

  await command('/api/reports/'+prepared.reportId+'/commands',reportRevisionCommandSchema.parse({action:'render',requestKey:randomUUID(),expectedVersion:prepared.version,rationale:'Validate the controlled synthetic linked report'}));
  if(period.kind!=='weekly')await input.runQueuedRender(prepared.revisionId);
  const rendered=viewSchema.parse(unwrap(await request('/api/reports/'+prepared.reportId,'GET')));
  if(rendered.reportId!==prepared.reportId||rendered.revisionId!==prepared.revisionId||rendered.state!=='review_ready')throw Error('Actual linked report validation unavailable');
  if(period.kind!=='weekly'&&(rendered.artifacts.length!==2||new Set(rendered.artifacts.map(x=>x.format)).size!==2))throw Error('Actual PDF and PPTX artifacts required');
  samples.push(rendered);
 }
 const published=await publishExistingSyntheticReportSamples({...input,samples});
 return {...published,contract:'pilot-synthetic-reports-recipe-v1',journey:'J009',normalReportCommands:10+boundaryRevisions,normalFortySlideRevisions:boundaryRevisions,actualRenderedJobs:2};
}
