import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';import {validateReportDocument} from '../../reports/document';
import {reportTransaction,reportDigest} from './commands';import {reportRevisionFence} from './release';import {requireCurrentReportBrand,verifiedBundledBrand,reportRendererImageDigest} from './brand';
import {authorityForReportJob,enqueueReportJob,completeReportJob,heartbeatReportJob,failReportJob} from './jobs';import {lockReportJobAuthority} from './actor';
import {writeReportObject} from './store';import {reportConfig} from './config';import {prepareReportMail} from './mail-content';import {reportDigestSchema,reportId} from './schema';
import {runGovernedExecution,executionBackend} from '../jobs/governed';
import {sha256} from '../jobs/executor';
const fileMetadata=z.strictObject({digest:reportDigestSchema,sizeBytes:z.number().int().min(1).max(10485760)});
const rendererResult=z.strictObject({schemaVersion:z.literal('report-render-result-v1'),rendererCodeDigest:reportDigestSchema,documentDigest:reportDigestSchema,brandDigest:reportDigestSchema,fontDigests:z.strictObject({regular:reportDigestSchema,bold:reportDigestSchema}),pages:z.number().int().positive(),slides:z.number().int().positive(),pdf:fileMetadata,pptx:fileMetadata,editingRequirement:z.string().min(1).max(500)});
const rendererChecks=z.strictObject({pages:z.number().int().positive(),slides:z.number().int().positive(),nativeTables:z.number().int().positive(),nativeCharts:z.number().int().min(0),approvedEmbeddedFonts:z.literal(true)});
type ReportRenderStage='prepare'|'execute'|'validate_output'|'store_output'|'publish_output';
type ReportRenderDiagnostic=Readonly<{stage:ReportRenderStage;category:string;location:string}>;
function renderDiagnostic(error:unknown,stage:ReportRenderStage):ReportRenderDiagnostic{
 const safe=['Execution output unavailable','Execution deadline exceeded','Local execution unavailable','Owned execution cleanup unverified','Execution requires the original finite deadline'];
 const codes=['EACCES','ENOENT','ENOSPC','EPERM','ETIMEDOUT','ECONNRESET','ABORT_ERR','23503','23505','23514','42501','42P01','55000','55P03','57014','P0001','brand_unapproved','source_changed','version_conflict','forbidden','not_found','invalid_input','unavailable'];
 const code=(error as {code?:unknown}|null)?.code;
 const category=error instanceof z.ZodError?'renderer_contract_invalid':error instanceof Error&&safe.includes(error.message)?error.message:typeof code==='string'&&codes.includes(code)?code:'renderer_failed';
 // Only authored locations survive; exception text and private IO paths never do.
 const location=error instanceof Error?error.stack?.match(/lib\/server\/(?:jobs\/(?:local-executor|executor|governed)|operations\/(?:local-jobs|admission|hosted-jobs|cost)|reports\/(?:actor|brand|release|render-jobs))\.ts:\d+:\d+/)?.[0]??'unlocated':'unlocated';
 return Object.freeze({stage,category,location});
}
export function reportRenderFailureMessage(error:unknown,stage:ReportRenderStage){
 const detail=renderDiagnostic(error,stage);
 return `Executive rendering failed (${detail.stage}: ${detail.category}; ${detail.location})`;
}
class ReportRenderFailure extends HttpFailure{
 readonly diagnostic:ReportRenderDiagnostic;
 constructor(error:unknown,stage:ReportRenderStage){
  super(error instanceof HttpFailure?error.status:503,error instanceof HttpFailure?error.code:'unavailable',reportRenderFailureMessage(error,stage),error instanceof HttpFailure?error.retryAfterSeconds:undefined);
  this.diagnostic=renderDiagnostic(error,stage);
 }
}
/** Only failures constructed at this boundary can contribute structured log fields. */
export function reportRenderFailureDiagnostic(error:unknown):ReportRenderDiagnostic|null{
 return error instanceof ReportRenderFailure?error.diagnostic:null;
}
const inputSchema=z.strictObject({revisionId:reportId,documentDigest:reportDigestSchema,sourceSetDigest:reportDigestSchema,brandId:reportId,brandDigest:reportDigestSchema});
export async function enqueueReportRender(db:PoolClient,actor:{workspaceId:string;membershipId:string},revisionId:string){
 const revision=await reportRevisionFence(db,actor.workspaceId,revisionId,{published:false});
 if(revision.kind==='weekly' || revision.state==='published')throw new HttpFailure(409,'version_conflict','Select an unpublished executive revision');
 const brand=await requireCurrentReportBrand(db,actor.workspaceId,revision.brand_id,false);
 const job=await enqueueReportJob(db,{environmentId:process.env.TURAS_ENVIRONMENT_ID!,workspaceId:actor.workspaceId,customerId:revision.customer_id,ownerMembershipId:actor.membershipId,ownerDecisionId:null,policyRevisionId:null},'render',{revisionId,documentDigest:revision.content_digest,sourceSetDigest:revision.source_set_digest,brandId:revision.brand_id,brandDigest:brand.manifest_digest},revisionId);
 const state=(await db.query('SELECT state FROM report_jobs WHERE id=$1',[job.id])).rows[0].state;
 if(state!=='completed')await db.query("UPDATE report_revision_states SET state='rendering',updated_at=now() WHERE revision_id=$1 AND state IN ('draft','rendering','review_ready')",[revisionId]);
 return {jobId:job.id,revisionId};
}
async function renderFence(db:PoolClient,claimed:{id:string;lease_token:string;input_digest:string}){
 const row=(await db.query(`SELECT * FROM report_jobs WHERE id=$1 AND environment_id=$2 AND kind='render' AND state='leased' AND lease_token=$3 AND input_digest=$4 AND lease_until>now() AND deadline_at>now() FOR UPDATE`,[claimed.id,process.env.TURAS_ENVIRONMENT_ID,claimed.lease_token,claimed.input_digest])).rows[0];
 if(!row)throw new HttpFailure(409,'version_conflict','Render lease changed');
 await lockReportJobAuthority(db,authorityForReportJob(row));const input=inputSchema.parse(row.input);
 const revision=await reportRevisionFence(db,row.workspace_id,input.revisionId,{published:false});
 const current=(await db.query('SELECT current_revision_id FROM report_scopes WHERE id=$1 FOR UPDATE',[revision.report_id])).rows[0];
 const brand=await requireCurrentReportBrand(db,row.workspace_id,input.brandId,false);
 if(current?.current_revision_id!==input.revisionId || revision.content_digest!==input.documentDigest || revision.source_set_digest!==input.sourceSetDigest || brand.manifest_digest!==input.brandDigest || revision.state!=='rendering')throw new HttpFailure(409,'source_changed','Render inputs changed');
 return {row,input,revision,brand};
}
export async function runReportRenderJob(claimed:{id:string;lease_token:string;input_digest:string},parentSignal?:AbortSignal){
 const controller=new AbortController();let busy=false,pending:Promise<void>|undefined,deadline:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined;
 const abort=()=>controller.abort();let listenerRegistered=false,renderStage:ReportRenderStage='prepare';
 try{
 parentSignal?.throwIfAborted();
 const prepared=await reportTransaction(async db=>{const fence=await renderFence(db,claimed);const document=validateReportDocument((await db.query('SELECT document FROM report_revision_payloads WHERE revision_id=$1',[fence.input.revisionId])).rows[0].document);if(reportDigest(document)!==fence.input.documentDigest)throw new HttpFailure(409,'source_changed','Render content changed');return {...fence,document};});
 const image=process.env.TURAS_PILOT_RENDERER_IMAGE??reportConfig().rendererImage;
 if(!image||!(executionBackend()==='local'?/^sha256:[a-f0-9]{64}$/:/^vcr\.vercel\.com\/[a-zA-Z0-9_/-]+@sha256:[a-f0-9]{64}$/).test(image))throw new HttpFailure(503,'unavailable','Pinned renderer image unavailable');
 const imageDigest=reportRendererImageDigest(image),bytes=Buffer.from(JSON.stringify(prepared.document));
 parentSignal?.throwIfAborted();parentSignal?.addEventListener('abort',abort,{once:true});listenerRegistered=parentSignal!==undefined;
 const deadlineAt=new Date(prepared.row.deadline_at).toISOString(),remaining=()=>Math.max(0,Date.parse(deadlineAt)-Date.now());
 deadline=setTimeout(()=>controller.abort(),remaining());
 heartbeat=setInterval(()=>{if(busy)return;busy=true;pending=reportTransaction(db=>heartbeatReportJob(db,claimed.id,claimed.lease_token)).then(valid=>{if(!valid)controller.abort();}).catch(()=>controller.abort()).finally(()=>{busy=false;});},15000);
 let result:ReturnType<typeof rendererResult.parse>,checks:ReturnType<typeof rendererChecks.parse>,files:{format:'pdf'|'pptx';bytes:Buffer;key:string;metadata:{digest:string;sizeBytes:number}}[];
 renderStage='execute';
  await runGovernedExecution({request:{id:randomUUID(),kind:'report-render',image,imageDigest,deadlineAt,inputs:[{name:'report.json',bytes,sizeBytes:bytes.length,digest:sha256(bytes)}],signal:controller.signal},domain:{domainKind:'report',domainJobId:claimed.id,sourceGeneration:1,sourceDigest:claimed.input_digest},localAssets:{signaturesPath:'',ocrAssetsPath:''},sourceCurrent:async db=>{await renderFence(db,claimed);return true;},prepareOutput:async output=>{
   renderStage='validate_output';
   if(output.exitCode!==0||!output.files['renderer.json']||!output.files['checks.json'])throw new HttpFailure(503,'unavailable',`Isolated report validation failed (${output.safeFailure??'renderer_output_unavailable'})`);
   result=rendererResult.parse(JSON.parse(output.files['renderer.json'].toString()));checks=rendererChecks.parse(JSON.parse(output.files['checks.json'].toString()));
   const bundled=await verifiedBundledBrand();
   if(result.editingRequirement!==bundled.manifest.editingRequirement||result.fontDigests.regular!==bundled.manifest.assets.find(asset=>asset.path.endsWith('/Geist-Regular.ttf'))?.sha256||result.fontDigests.bold!==bundled.manifest.assets.find(asset=>asset.path.endsWith('/Geist-Bold.ttf'))?.sha256)throw new HttpFailure(409,'source_changed','Rendered font binding changed');
   if(result.documentDigest!==prepared.input.documentDigest||result.brandDigest!==bundled.manifestDigest||bundled.profileDigest!==prepared.input.brandDigest||result.rendererCodeDigest!==bundled.rendererCodeDigest||checks.pages!==result.pages||checks.slides!==result.slides)throw new HttpFailure(409,'source_changed','Rendered binding changed');
   files=(['pdf','pptx'] as const).map(format=>{const content=output.files[format==='pdf'?'report.pdf':'report.pptx'],metadata=result[format];if(!content||content.length!==metadata.sizeBytes||sha256(content)!==metadata.digest||content.subarray(0,format==='pdf'?5:2).toString()!==(format==='pdf'?'%PDF-':'PK'))throw new HttpFailure(409,'source_changed','Rendered bytes changed');return {format,bytes:content,key:randomUUID(),metadata};});
   renderStage='store_output';
   // Catalog each exact key before private-store IO, preserving crash reconciliation.
   await reportTransaction(async db=>{await renderFence(db,claimed);for(const file of files)await db.query(`INSERT INTO report_store_objects(object_key,environment_id,revision_id,content_digest,size_bytes,state,expires_at) VALUES($1,$2,$3,$4,$5,'staged',now()+interval '1 hour')`,[file.key,process.env.TURAS_ENVIRONMENT_ID,prepared.input.revisionId,file.metadata.digest,file.metadata.sizeBytes]);});
   for(const file of files){controller.signal.throwIfAborted();const written=await writeReportObject(file.bytes,file.key);if(written.contentDigest!==file.metadata.digest||written.sizeBytes!==file.metadata.sizeBytes)throw new HttpFailure(409,'source_changed','Stored bytes changed');}
  },complete:async db=>{
   renderStage='publish_output';
   const current=await renderFence(db,claimed),mail=prepareReportMail(prepared.document),stored=(await db.query('SELECT content_digest FROM report_mail_payloads WHERE revision_id=$1',[current.input.revisionId])).rows[0];if(stored?.content_digest!==mail.contentDigest)throw new HttpFailure(409,'source_changed','Reviewed mail changed');
   const artifactDigests=Object.fromEntries(files.map(file=>[file.format,file.metadata.digest]));
   await completeReportJob(db,claimed.id,claimed.lease_token,claimed.input_digest,reportDigest({result,checks}),async()=>{});
   const validationId=randomUUID();await db.query(`INSERT INTO report_validations(id,environment_id,workspace_id,customer_id,revision_id,document_digest,artifact_digests,mail_digest,validator_version,checks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'report-artifact-validation-v1',$9)`,[validationId,process.env.TURAS_ENVIRONMENT_ID,current.row.workspace_id,current.row.customer_id,current.input.revisionId,current.input.documentDigest,JSON.stringify(artifactDigests),mail.contentDigest,JSON.stringify(checks)]);
   for(const file of files){await db.query(`INSERT INTO report_artifacts(id,environment_id,workspace_id,customer_id,revision_id,render_attempt_id,format,content_digest,size_bytes,object_key,renderer_digest,font_digest,brand_digest,template_digest,validation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,current.row.workspace_id,current.row.customer_id,current.input.revisionId,claimed.lease_token,file.format,file.metadata.digest,file.metadata.sizeBytes,file.key,imageDigest,current.brand.font_digest,current.brand.manifest_digest,current.brand.template_digest,validationId]);await db.query("UPDATE report_store_objects SET state='finalized',expires_at=$2 WHERE object_key=$1 AND state='staged'",[file.key,current.revision.expires_at]);}
   await db.query("UPDATE report_revision_states SET state='review_ready',updated_at=now() WHERE revision_id=$1 AND state='rendering'",[current.input.revisionId]);
  }});
 }catch(error){await reportTransaction(db=>failReportJob(db,claimed.id,claimed.lease_token,error instanceof HttpFailure?error.code:'renderer_failed')).catch(()=>{});throw new ReportRenderFailure(error,renderStage);}
 finally{if(heartbeat)clearInterval(heartbeat);if(deadline)clearTimeout(deadline);if(listenerRegistered)parentSignal?.removeEventListener('abort',abort);if(pending)await pending;}
}
