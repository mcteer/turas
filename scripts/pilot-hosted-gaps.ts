import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {readHostedBaseline,type HostedBaselineInput,type HostedJourneyRequest as Request} from './pilot-hosted-baseline';
import {gapSaveSchema,gapImpactSaveSchema,gapPreviewSchema,gapCommitSchema,gapCanonicalPreviewSchema,gapReportPrepareSchema,gapReportReviewSchema,gapExportSchema,gapHandoffSchema,gapSourceSchema,type GapContent} from '../lib/contracts/product-gaps';

const receipt=z.object({operation:z.string(),recordId:z.uuid().nullable(),resultId:z.uuid().nullable(),bindingDigest:z.string().regex(/^[a-f0-9]{64}$/).nullable(),outcome:z.string(),version:z.number().int().nonnegative()});
const gapView=z.object({id:z.uuid(),version:z.number().int().positive(),canonicalTarget:z.uuid().nullable().optional(),reviewed:z.object({id:z.uuid(),availability:z.literal('eligible')}).nullable(),working:z.object({id:z.uuid()}).nullable(),impacts:z.array(z.object({id:z.uuid(),version:z.number().int().positive(),working:z.object({id:z.uuid()}).nullable()}))});
const document=z.object({schemaVersion:z.literal('gap-recipient-v1'),header:z.object({reportId:z.uuid(),revisionId:z.uuid()}),customers:z.array(z.object({id:z.uuid()})).max(200),sections:z.array(z.object({id:z.number().int(),title:z.string(),content:z.unknown()})).max(20)});
const reportView=z.object({id:z.uuid(),version:z.number().int().positive(),availability:z.string(),revision:z.object({id:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),audienceDigest:z.string().regex(/^[a-f0-9]{64}$/)}).nullable(),document:document.nullable(),artifacts:z.array(z.object({id:z.uuid(),format:z.enum(['json','markdown']),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),sizeBytes:z.number().int().positive().max(5242880)})).max(2),review:z.object({id:z.uuid(),action:z.string()}).nullable()});

/** Normal synthetic canonicalization/reporting, with real export bytes. Sources
 * supply controlled context only; suspected impact is never a real observation.
 * The handoff record is an explicitly unsent synthetic demonstration. */
export async function runHostedGapBoundary(input:HostedBaselineInput&{authorRequest:Request;waitForReport:(reportId:string)=>Promise<void>;verifyPrimaryIsolation:(gapIds:readonly string[],reportId:string,query:string)=>Promise<void>;readExport:(input:{reportId:string;exportId:string;format:'json'|'markdown';sizeBytes:number;contentDigest:string})=>Promise<Buffer>}){
 const {scope,db,customerId,workloadId,engagementId,authorRequest,reviewerRequest,signal}=input;
 const dependency=await readHostedBaseline(input),source=gapSourceSchema.parse({id:randomUUID(),kind:dependency.kind,customerId,sourceRevisionId:dependency.sourceRevisionId,generation:dependency.generation,contentDigest:dependency.contentDigest,locator:dependency.locator,purpose:'customer_need'});
 const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data,token=randomUUID().slice(0,8);let commands=0;
 const envelope=(version:number)=>({contractVersion:'product-gaps-v1',requestKey:randomUUID(),expectedVersion:version});
 async function command(path:string,body:{requestKey:string;[key:string]:unknown},request:Request=reviewerRequest){
  signal.throwIfAborted();let result:unknown;
  try{result=unwrap(await request(path,'POST',body));}catch(error){try{result=unwrap(await request('/api/product-gaps/requests/'+body.requestKey,'GET'));}catch{throw error;}}
  const value=receipt.parse(result);commands++;return value;
 }
 async function readGap(id:string){signal.throwIfAborted();return gapView.parse(unwrap(await reviewerRequest('/api/product-gaps/'+id,'GET')));}
 const content=(label:string):GapContent=>({kind:'product_gap',title:'Synthetic Pilot '+token+' '+label,productKey:'synthetic-pilot-product',capability:'Controlled Synthetic Workflow',productVersion:null,problem:'Controlled synthetic example only; no actual product limitation is established.',workflow:'Review the scoped synthetic linked delivery workflow.',desiredOutcome:'Demonstrate governed capability review without asserting customer impact.',reproduction:'Controlled synthetic fixture only; actual reproduction remains unknown.',constraints:'Actual security, compatibility and adoption constraints remain unknown.',workaround:'Retain the reviewed synthetic baseline while discovery is incomplete.',workaroundLimitations:'Actual workaround burden remains unknown.',proposedCapability:'Synthetic example only; an actual requested product change remains unknown.',alternatives:'Retain the current practice and obtain separate eligible evidence.',unknowns:'Actual limitation, customer need, impact, product version and roadmap remain unknown.',requestedDecision:'Review a controlled synthetic demonstration.',triageTeam:'Synthetic Internal Review',acceptanceCriteria:['Preserve source scope, review lineage and synthetic count exclusions.'],severity:'unknown',severityRationale:'No real incident or business impact has been observed.',workaroundFeasibility:'unknown'});
 async function accept(gapId:string,revisionId:string,version:number,impactId?:string){
  const preview=await command('/api/product-gaps/'+gapId+'/previews',gapPreviewSchema.parse({...envelope(version),target:impactId?'impact':'gap',...(impactId?{impactId}:{}),revisionId,action:'accept',rationale:'Review of the controlled synthetic demonstration only.',revisitDate:null,selfReview:true,...(!impactId?{customerIndependentAcknowledgment:true}:{})}));
  if(!preview.resultId||!preview.bindingDigest||preview.recordId!==gapId)throw Error('Exact synthetic gap review preview required');
  const reviewed=await command('/api/product-gaps/'+gapId+'/decisions',gapCommitSchema.parse({...envelope(version),previewId:preview.resultId,bindingDigest:preview.bindingDigest}));
  if(reviewed.recordId!==gapId||reviewed.outcome!=='accept')throw Error('Normal synthetic gap review differs');
 }
 const gaps:string[]=[],observations:string[]=[];
 for(const label of ['First Capability','Second Capability']){
  const saved=await command('/api/product-gaps',gapSaveSchema.parse({...envelope(0),content:content(label),sourceRefs:[],customerIndependentAcknowledgment:true}),authorRequest);
  if(!saved.recordId||!saved.resultId)throw Error('Normal synthetic gap proposal required');
  await accept(saved.recordId,saved.resultId,saved.version);const gap=await readGap(saved.recordId);
  if(gap.reviewed?.id!==saved.resultId)throw Error('Reviewed canonical gap differs');gaps.push(gap.id);
  const impact=await command('/api/product-gaps/'+gap.id+'/impacts',gapImpactSaveSchema.parse({...envelope(0),expectedGapVersion:gap.version,customerId,workloadId,engagementId,recurrenceParent:null,content:{observedAt:null,resolvedAt:null,classification:'suspected',consequences:'Controlled synthetic observation only; no actual customer consequence is established.',workaroundBurden:'Actual workload burden remains unknown.',severity:'unknown',severityRationale:'No real customer impact has been observed.',assertions:[]},sourceRefs:[source]}),authorRequest);
  if(!impact.resultId)throw Error('Normal synthetic impact proposal required');const pending=await readGap(gap.id),observation=pending.impacts.find(row=>row.working?.id===impact.resultId);
  if(!observation)throw Error('Exact pending synthetic impact unavailable');await accept(gap.id,impact.resultId,observation.version,observation.id);observations.push(observation.id);
 }
 const [first,second]=await Promise.all(gaps.map(readGap));
 const merge=gapCanonicalPreviewSchema.parse({...envelope(first.version),operation:'merge',gapIds:gaps,versions:{[first.id]:first.version,[second.id]:second.version},survivorId:first.id,assignments:observations.map(observationId=>({observationId,resultKey:first.id})),results:[],rationale:'Consolidate the two controlled synthetic capability definitions.',selfReview:true});
 async function canonicalize(value:z.infer<typeof gapCanonicalPreviewSchema>){
  const preview=await command('/api/product-gaps/canonicalization/previews',value);if(!preview.resultId||!preview.bindingDigest)throw Error('Exact canonicalization preview required');
  await command('/api/product-gaps/canonicalization/decisions',gapCommitSchema.parse({...envelope(value.expectedVersion),previewId:preview.resultId,bindingDigest:preview.bindingDigest}));
 }
 await canonicalize(merge);const merged=await readGap(first.id),alias=await readGap(second.id);
 if(alias.canonicalTarget!==first.id||JSON.stringify(merged.impacts.map(row=>row.id).sort())!==JSON.stringify([...observations].sort()))throw Error('Normal merge or assignment lineage differs');
 await canonicalize(gapCanonicalPreviewSchema.parse({...envelope(merged.version),operation:'split',gapIds:[first.id],versions:{[first.id]:merged.version},survivorId:first.id,assignments:[{observationId:observations[0],resultKey:'retained'},{observationId:observations[1],resultKey:'separated'}],results:[{key:'retained',retainOriginal:true,content:content('Retained Capability'),sourceRefs:[]},{key:'separated',retainOriginal:false,content:content('Separated Capability'),sourceRefs:[]}],rationale:'Split the controlled synthetic capability mappings without duplicating customer observations.',selfReview:true}));
 // Exact metadata lookup after normal authorized decisions; the actual new
 // narrative and assignment are then reauthorized through the public API.
 const mapped=(await db.query('SELECT a.canonical_gap_id FROM gap_observation_assignments a JOIN product_gaps g ON g.id=a.canonical_gap_id WHERE a.observation_id=$1 AND g.workspace_id=$2 AND g.environment_id=$3',[observations[1],scope.workspaceId,scope.environmentMarker])).rows[0]?.canonical_gap_id;
 if(!mapped||mapped===first.id)throw Error('Exact fresh split identity required');
 const [retained,separated]=await Promise.all([readGap(first.id),readGap(String(mapped))]);
 if(retained.impacts.length!==1||retained.impacts[0].id!==observations[0]||separated.impacts.length!==1||separated.impacts[0].id!==observations[1])throw Error('Split did not preserve exact observation assignment');
 const prepared=await command('/api/product-gaps/reports',gapReportPrepareSchema.parse({...envelope(0),kind:'detail',gapIds:[first.id],asOf:new Date().toISOString(),comparisonAt:null,audience:{team:'Synthetic Internal Review',recipients:['Synthetic Internal Reviewer'],purpose:'Controlled synthetic canonicalization and private export verification only.'}}));
 if(!prepared.recordId)throw Error('Normal private gap report preparation required');const reportId=prepared.recordId;
 await input.waitForReport(reportId);
 async function readReport(){signal.throwIfAborted();return reportView.parse(unwrap(await reviewerRequest('/api/product-gaps/reports/'+reportId,'GET')));}
 let report=await readReport();if(report.id!==reportId||report.availability!=='eligible'||!report.revision||!report.document||report.artifacts.length!==2)throw Error('Actual private report and both exports required');
 let countsVerified=false;
 for(const section of report.document.sections){if(!section.content||typeof section.content!=='object')continue;const counts=(section.content as {counts?:unknown}).counts;if(counts&&typeof counts==='object'&&['confirmed','suspectedOnly','resolvedHistory'].every(key=>Object.hasOwn(counts,key))){const actual=counts as {confirmed:unknown;suspectedOnly:unknown;resolvedHistory:unknown};if(actual.confirmed!==0||actual.suspectedOnly!==1||actual.resolvedHistory!==0)throw Error('Scoped synthetic pilot customer counts differ');countsVerified=true;}}
 if(!countsVerified)throw Error('Actual report customer-count evidence required');
 const review=gapReportReviewSchema.parse({...envelope(report.version),action:'approve',revisionId:report.revision.id,customerDisclosures:report.document.customers.map(row=>row.id),audienceDigest:report.revision.audienceDigest,rationale:'Review of actual controlled synthetic document, disclosures and both exact export formats.',selfReview:true});
 const preview=await command('/api/product-gaps/reports/'+reportId+'/previews',review);if(!preview.resultId||!preview.bindingDigest)throw Error('Exact private report review preview required');
 await command('/api/product-gaps/reports/'+reportId+'/decisions',gapCommitSchema.parse({...envelope(report.version),previewId:preview.resultId,bindingDigest:preview.bindingDigest}));
 report=await readReport();if(report.review?.action!=='approve'||!report.revision)throw Error('Normal private report approval required');
 let actualExportReads=0;
 for(const artifact of report.artifacts){
  const exported=await command('/api/product-gaps/reports/'+reportId+'/exports',gapExportSchema.parse({...envelope(report.version),format:artifact.format,reviewId:report.review.id}));if(!exported.resultId||exported.outcome!=='ready')throw Error('Exact admitted private export required');
  const bytes=await input.readExport({reportId,exportId:exported.resultId,format:artifact.format,sizeBytes:artifact.sizeBytes,contentDigest:artifact.contentDigest});
  if(bytes.length!==artifact.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==artifact.contentDigest)throw Error('Actual gap export bytes differ');
  if(artifact.format==='json'){const actual=document.parse(JSON.parse(bytes.toString('utf8')));if(actual.header.reportId!==reportId||actual.header.revisionId!==report.revision.id)throw Error('Actual JSON export identity differs');}else if(!bytes.toString('utf8').includes('Synthetic Pilot '+token))throw Error('Actual Markdown export lacks the reviewed synthetic narrative');actualExportReads++;
 }
 const handoff=await command('/api/product-gaps/reports/'+reportId+'/handoffs',gapHandoffSchema.parse({...envelope(report.version),kind:'handed_off',eventAt:new Date().toISOString(),audienceDigest:report.revision.audienceDigest,predecessorId:null,correctedId:null,metadataOnly:false,note:'Controlled synthetic manual handoff demonstration only, kept unsent. No actual external delivery or engineering acknowledgment is claimed.',reference:null,sourceRefs:[]}));
 if(!handoff.resultId)throw Error('Normal synthetic manual handoff record required');
 await input.verifyPrimaryIsolation([first.id,second.id,String(mapped)],reportId,token);
 return {contract:'pilot-hosted-gap-boundary-v1',journey:'J012',gapId:first.id,separatedGapId:String(mapped),observationIds:observations,reportId,handoffId:handoff.resultId,normalCommands:commands,actualExportReads,pilotCustomerCountsVerified:true,primaryCountsIsolationVerified:true,providerCalls:0,externalMessagesSent:0,syntheticOnly:true,humanFeedbackRecorded:false,fullGapJourneyVerified:false,fullHostedCatalogVerified:false};
}
