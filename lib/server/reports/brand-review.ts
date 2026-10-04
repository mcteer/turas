import {recordReportDecision} from './decisions';
import {randomUUID} from 'node:crypto';import type {PoolClient} from 'pg';import type {CurrentSession} from '../auth/sessions';import {z} from 'zod';
import {HttpFailure,hiddenRecord} from '../../contracts/http';import {reportId,reportCommandSchema,reportDigestSchema} from './schema';import {reportTransaction,executeReportCommand} from './commands';import {lockReportActor} from './policy';import {requireCurrentReportBrand} from './brand';import {reportRevisionFence} from './release';import {createReportPreview,requireReportPreview} from './previews';import {readReportObject} from './store';
const base={customerId:reportId,action:z.enum(['approve','revoke']),expectedVersion:z.number().int().positive().safe(),sampleRevisionIds:z.array(reportId).max(10).default([]).refine(ids=>new Set(ids).size===ids.length)};
export const brandPreviewSchema=z.strictObject(base);
export const brandDecisionSchema=reportCommandSchema.extend({...base,previewId:reportId,previewDigest:reportDigestSchema});
export async function reportBrandProjection(db:PoolClient,actor:CurrentSession,brandId:string,customerId:string){
 await lockReportActor(db,actor,customerId,'brand','delivery');const row=(await db.query('SELECT id,state,version,manifest,manifest_digest,font_digest,template_digest FROM report_brand_profiles WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[brandId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();return {brandId:row.id,state:row.state,version:Number(row.version),manifest:row.manifest,manifestDigest:row.manifest_digest,fontDigest:row.font_digest,templateDigest:row.template_digest};
}
async function brandBinding(db:PoolClient,actor:CurrentSession,brandId:string,command:z.infer<typeof brandPreviewSchema>){
 await lockReportActor(db,actor,command.customerId,'brand','delivery',false,command.action==='approve');
 const brand=await requireCurrentReportBrand(db,actor.workspaceId,brandId,false);
 if(Number(brand.version)!==command.expectedVersion || brand.state!==(command.action==='approve'?'draft':'approved'))throw new HttpFailure(409,'version_conflict','Brand state changed');
 const samples:Array<{revisionId:string;reportId:string;kind:string;documentDigest:string;mailDigest:string;validationId:string;artifactDigests:Record<string,string>;checks:unknown}>=[];
 if(command.action==='approve'){
  if(command.sampleRevisionIds.length<3)throw new HttpFailure(409,'brand_unapproved','Inspect validated weekly, monthly and quarterly samples');
  for(const id of [...command.sampleRevisionIds].sort()){
   const revision=await reportRevisionFence(db,actor.workspaceId,id,{published:false});
   const synthetic=(await db.query('SELECT synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2',[revision.customer_id,actor.workspaceId])).rows[0]?.synthetic;
   if(!synthetic || revision.brand_id!==brandId || !['review_ready','published'].includes(revision.state))throw new HttpFailure(409,'brand_unapproved','Select current validated synthetic samples for this brand');
   const validation=(await db.query('SELECT * FROM report_validations WHERE revision_id=$1 AND document_digest=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[id,revision.content_digest])).rows[0];if(!validation)throw new HttpFailure(409,'brand_unapproved','Actual sample validation required');
   const artifacts=(await db.query('SELECT * FROM report_artifacts WHERE revision_id=$1 AND validation_id=$2 ORDER BY format',[id,validation.id])).rows;
   if(revision.kind!=='weekly' && (artifacts.length!==2 || artifacts.map(row=>row.format).join('|')!=='pdf|pptx'))throw new HttpFailure(409,'brand_unapproved','Actual PDF and native slide samples required');
   for(const artifact of artifacts){if(artifact.brand_digest!==brand.manifest_digest || artifact.renderer_digest!==brand.manifest.rendererImage?.slice(7) || validation.artifact_digests[artifact.format]!==artifact.content_digest)throw new HttpFailure(409,'brand_unapproved','Sample renderer or bytes changed');await readReportObject(artifact.object_key,artifact.content_digest,Number(artifact.size_bytes));}
   samples.push({revisionId:id,reportId:revision.report_id,kind:revision.kind,documentDigest:revision.content_digest,mailDigest:validation.mail_digest,validationId:validation.id,artifactDigests:validation.artifact_digests,checks:validation.checks});
  }
  if(['weekly','monthly','quarterly'].some(kind=>!samples.some(sample=>sample.kind===kind)))throw new HttpFailure(409,'brand_unapproved','Inspect all supported sample kinds');
 }else if(command.sampleRevisionIds.length)throw new HttpFailure(422,'invalid_input','Revocation does not accept new samples');
 return {brand,binding:{action:command.action,brandId,customerId:command.customerId,brandVersion:Number(brand.version),state:brand.state,brandDigest:brand.manifest_digest,fontDigest:brand.font_digest,templateDigest:brand.template_digest,rendererImage:brand.manifest.rendererImage,rendererCodeDigest:brand.manifest.rendererCodeDigest,samples}};
}
export async function previewReportBrand(actor:CurrentSession,brandId:string,raw:unknown){
 const parsed=brandPreviewSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid brand preview');
 return reportTransaction(async db=>{const {binding}=await brandBinding(db,actor,brandId,parsed.data);return {...await createReportPreview(db,actor,parsed.data.customerId,brandId,'brand',parsed.data.expectedVersion,binding),brand:binding};});
}
export async function submitReportBrandDecision(actor:CurrentSession,brandId:string,raw:unknown){
 const parsed=brandDecisionSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid brand decision');
 return executeReportCommand(actor,parsed.data.customerId,'delivery','brand',brandDecisionSchema,parsed.data,async(db,command)=>{
  const current=await brandBinding(db,actor,brandId,command);await requireReportPreview(db,actor,brandId,'brand',command.previewId,command.previewDigest,command.expectedVersion,current.binding);
  await db.query('SELECT id FROM report_brand_profiles WHERE id=$1 FOR UPDATE',[brandId]);
  const id=await recordReportDecision(db,actor,command.customerId,{action:command.action==='approve'?'approve_brand':'revoke_brand',subjectId:brandId,expectedVersion:command.expectedVersion,previewDigest:command.previewDigest,rationale:command.rationale,requestKey:command.requestKey});
  await db.query('UPDATE report_brand_profiles SET state=$2,approval_decision_id=$3 WHERE id=$1',[brandId,command.action==='approve'?'approved':'revoked',id]);
  if(command.action==='revoke')await db.query("UPDATE report_revision_states s SET visibility='withheld',generation=generation+1,reason_code='brand_revoked',updated_at=now() FROM report_revisions v WHERE v.id=s.revision_id AND v.brand_id=$1 AND s.visibility NOT IN ('withheld','expired')",[brandId]);
  return {brandId,decisionId:id};
 },db=>reportBrandProjection(db,actor,brandId,parsed.data.customerId),{settlement:parsed.data.action==='revoke',subjectId:brandId});
}
