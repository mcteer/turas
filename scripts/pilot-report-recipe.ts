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
export async function runSyntheticReportRecipe(input:{scope:PilotHostedScope;db:Client;customerId:string;engagementId:string;workloadId:string;signal:AbortSignal;maximumReportLayout?:boolean;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;authorRequest:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;runQueuedRender:(revisionId:string)=>Promise<void>;readArtifact:(artifact:z.infer<typeof viewSchema>['artifacts'][number])=>Promise<void>}){
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
 const brands=z.object({brands:z.array(z.object({brandId:z.uuid(),version:z.number().int().positive(),state:z.string()}))}).parse(unwrap(await request('/api/reports/brands','GET')));
 if(brands.brands.length!==1||brands.brands[0].state!=='draft')throw Error('Exact fresh synthetic sample brand required');
 const brand=brands.brands[0],body={customerId,action:'approve',expectedVersion:brand.version,sampleRevisionIds:samples.map(x=>x.revisionId)};
 const preview=previewSchema.parse(unwrap(await request('/api/reports/brands/'+brand.brandId+'/preview','POST',body)));
 await command('/api/reports/brands/'+brand.brandId+'/decisions',{...body,...preview,requestKey:randomUUID(),rationale:'Operator review of actual validated synthetic weekly, monthly and quarterly samples'});
 let actualArtifactReads=0;
 for(const sample of samples){
  const current=viewSchema.parse(unwrap(await request('/api/reports/'+sample.reportId,'GET')));
  const preview=previewSchema.parse(unwrap(await request('/api/reports/'+sample.reportId+'/preview','POST',{action:'publish',expectedVersion:current.version})));
  await command('/api/reports/'+sample.reportId+'/decisions',reportPublicationDecisionSchema.parse({action:'publish',requestKey:randomUUID(),expectedVersion:current.version,...preview,rationale:'Operator review and synthetic pilot publication of the linked report'}));
  const published=viewSchema.extend({publicationId:z.uuid()}).parse(unwrap(await request('/api/reports/'+sample.reportId,'GET')));
  if(published.reportId!==sample.reportId||published.revisionId!==sample.revisionId||published.state!=='published')throw Error('Ordinary linked report publication unavailable');
  for(const artifact of published.artifacts){await input.readArtifact(artifact);actualArtifactReads++;}
 }
 return {contract:'pilot-synthetic-reports-recipe-v1',journey:'J009',normalReportCommands:10+boundaryRevisions,normalFortySlideRevisions:boundaryRevisions,actualRenderedJobs:2,actualArtifactReads,outboundSendAttempts:0,syntheticOnly:true,fullReportJourneyVerified:false,fullLinkedJourneyVerified:false};
}
