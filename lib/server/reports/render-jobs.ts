import {randomUUID} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,rm,writeFile,lstat} from 'node:fs/promises';import {join} from 'node:path';import type {PoolClient} from 'pg';import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';import {validateReportDocument} from '../../reports/document';
import {reportTransaction,reportDigest} from './commands';import {reportRevisionFence} from './release';import {requireCurrentReportBrand,verifiedBundledBrand} from './brand';
import {authorityForReportJob,enqueueReportJob,completeReportJob,heartbeatReportJob,failReportJob} from './jobs';import {lockReportJobAuthority} from './actor';
import {reportStoreRoot,writeReportObject} from './store';import {runReportRenderer} from './renderer-container';import {reportConfig} from './config';import {prepareReportMail} from './mail-content';import {reportDigestSchema,reportId} from './schema';
const execute=promisify(execFile);
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
 const row=(await db.query(`SELECT * FROM report_jobs WHERE id=$1 AND environment_id=$2 AND kind='render' AND state='leased' AND lease_token=$3 AND input_digest=$4 AND lease_until>now() AND deadline_at>now()`,[claimed.id,process.env.TURAS_ENVIRONMENT_ID,claimed.lease_token,claimed.input_digest])).rows[0];
 if(!row)throw new HttpFailure(409,'version_conflict','Render lease changed');
 await lockReportJobAuthority(db,authorityForReportJob(row));const input=inputSchema.parse(row.input);
 const revision=await reportRevisionFence(db,row.workspace_id,input.revisionId,{published:false});
 const current=(await db.query('SELECT current_revision_id FROM report_scopes WHERE id=$1',[revision.report_id])).rows[0];
 const brand=await requireCurrentReportBrand(db,row.workspace_id,input.brandId,false);
 if(current?.current_revision_id!==input.revisionId || revision.content_digest!==input.documentDigest || revision.source_set_digest!==input.sourceSetDigest || brand.manifest_digest!==input.brandDigest || revision.state!=='rendering')throw new HttpFailure(409,'source_changed','Render inputs changed');
 return {row,input,revision,brand};
}
export async function runReportRenderJob(claimed:{id:string;lease_token:string;input_digest:string}){
 const prepared=await reportTransaction(async db=>{const fence=await renderFence(db,claimed);const document=validateReportDocument((await db.query('SELECT document FROM report_revision_payloads WHERE revision_id=$1',[fence.input.revisionId])).rows[0].document);if(reportDigest(document)!==fence.input.documentDigest)throw new HttpFailure(409,'source_changed','Render content changed');return {...fence,document};});
 const image=reportConfig().rendererImage;if(!image)throw new HttpFailure(503,'unavailable','Renderer image unavailable');
 const scratchParent=join(await reportStoreRoot(),'scratch');await mkdir(scratchParent,{recursive:true,mode:0o700});
 const parentStat=await lstat(scratchParent);if(!parentStat.isDirectory() || parentStat.isSymbolicLink() || parentStat.mode & 0o077 || parentStat.uid!==process.getuid?.())throw new HttpFailure(503,'store_unavailable','Private render scratch unavailable');
 const scratch=await mkdtemp(join(scratchParent,'render-')),input=join(scratch,'input'),output=join(scratch,'output');
 const controller=new AbortController();let heartbeating=false;
 const remaining=()=>Math.max(0,new Date(prepared.row.deadline_at).getTime()-Date.now());
 const deadline=setTimeout(()=>controller.abort(),remaining());deadline.unref();
 const heartbeat=setInterval(()=>{if(heartbeating)return;heartbeating=true;reportTransaction(db=>heartbeatReportJob(db,claimed.id,claimed.lease_token)).then(valid=>{if(!valid)controller.abort();}).catch(()=>controller.abort()).finally(()=>{heartbeating=false;});},15000);heartbeat.unref();
 try{
  await writeFile(join(scratch,'.turas-report-scratch.json'),JSON.stringify({environmentId:process.env.TURAS_ENVIRONMENT_ID,jobId:claimed.id,leaseToken:claimed.lease_token}),{mode:0o600,flag:'wx'});await mkdir(input,{mode:0o700});await mkdir(output,{mode:0o700});await writeFile(join(input,'report.json'),JSON.stringify(prepared.document),{mode:0o600,flag:'wx'});
  await runReportRenderer({image,inputDirectory:input,outputDirectory:output,signal:controller.signal});
  if(!remaining())throw new HttpFailure(409,'version_conflict','Render deadline expired');
  const checks=JSON.parse((await execute('python3',['report-renderer/validate.py',output],{timeout:Math.min(30000,remaining()),signal:controller.signal,maxBuffer:65536})).stdout),result=JSON.parse(await readFile(join(output,'renderer.json'),'utf8'));
  const bundled=await verifiedBundledBrand();
  if(result.documentDigest!==prepared.input.documentDigest || result.brandDigest!==bundled.manifestDigest || bundled.profileDigest!==prepared.input.brandDigest || result.rendererCodeDigest!==bundled.rendererCodeDigest)throw new HttpFailure(409,'source_changed','Rendered binding changed');
  const files=await Promise.all((['pdf','pptx'] as const).map(async format=>({format,bytes:await readFile(join(output,`report.${format}`)),key:randomUUID(),metadata:result[format]})));
  const artifactDigests=Object.fromEntries(files.map(file=>[file.format,file.metadata.digest]));
  // Catalog each owned key before writing it. Unknown transaction outcomes never trigger blind deletion.
  await reportTransaction(async db=>{await renderFence(db,claimed);for(const file of files)await db.query(`INSERT INTO report_store_objects(object_key,environment_id,revision_id,content_digest,size_bytes,state,expires_at) VALUES($1,$2,$3,$4,$5,'staged',now()+interval '1 hour')`,[file.key,process.env.TURAS_ENVIRONMENT_ID,prepared.input.revisionId,file.metadata.digest,file.metadata.sizeBytes]);});
  for(const file of files){const written=await writeReportObject(file.bytes,file.key);if(written.contentDigest!==file.metadata.digest || written.sizeBytes!==file.metadata.sizeBytes)throw new HttpFailure(409,'source_changed','Rendered bytes changed');}
  await reportTransaction(async db=>{
   const current=await renderFence(db,claimed),mail=prepareReportMail(prepared.document),stored=(await db.query('SELECT content_digest FROM report_mail_payloads WHERE revision_id=$1',[current.input.revisionId])).rows[0];if(stored?.content_digest!==mail.contentDigest)throw new HttpFailure(409,'source_changed','Reviewed mail changed');
   await completeReportJob(db,claimed.id,claimed.lease_token,claimed.input_digest,reportDigest({result,checks}),async()=>{});
   const validationId=randomUUID();await db.query(`INSERT INTO report_validations(id,environment_id,workspace_id,customer_id,revision_id,document_digest,artifact_digests,mail_digest,validator_version,checks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'report-artifact-validation-v1',$9)`,[validationId,process.env.TURAS_ENVIRONMENT_ID,current.row.workspace_id,current.row.customer_id,current.input.revisionId,current.input.documentDigest,JSON.stringify(artifactDigests),mail.contentDigest,JSON.stringify(checks)]);
   for(const file of files){await db.query(`INSERT INTO report_artifacts(id,environment_id,workspace_id,customer_id,revision_id,render_attempt_id,format,content_digest,size_bytes,object_key,renderer_digest,font_digest,brand_digest,template_digest,validation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,current.row.workspace_id,current.row.customer_id,current.input.revisionId,claimed.lease_token,file.format,file.metadata.digest,file.metadata.sizeBytes,file.key,image.slice(7),current.brand.font_digest,current.brand.manifest_digest,current.brand.template_digest,validationId]);await db.query("UPDATE report_store_objects SET state='finalized',expires_at=$2 WHERE object_key=$1 AND state='staged'",[file.key,current.revision.expires_at]);}
   await db.query("UPDATE report_revision_states SET state='review_ready',updated_at=now() WHERE revision_id=$1 AND state='rendering'",[current.input.revisionId]);
  });
 }catch(error){await reportTransaction(db=>failReportJob(db,claimed.id,claimed.lease_token,error instanceof HttpFailure?error.code:'renderer_failed')).catch(()=>{});throw error instanceof HttpFailure?error:new HttpFailure(503,'unavailable','Executive rendering failed');}
 finally{clearInterval(heartbeat);clearTimeout(deadline);await rm(scratch,{recursive:true,force:true});}
}
