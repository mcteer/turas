import {recordReportDecision} from './decisions';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure} from '../../contracts/http';
import {reportHead} from './revisions';
import {lockReportActor} from './policy';
import {reportRevisionFence} from './release';
import {createReportPreview,requireReportPreview} from './previews';
import {queueReportRevisionCleanup} from './cleanup';
import {readReportObject} from './store';
export type PublicationAction='publish'|'reject'|'withdraw';
export async function publicationBinding(db:PoolClient,actor:CurrentSession,reportId:string,action:PublicationAction){
 const head=await reportHead(db,actor,reportId);await lockReportActor(db,actor,head.customer_id,'publish',head.audience);
 const revisionId=head.current_revision_id;if(!revisionId)throw new HttpFailure(409,'version_conflict','Report revision unavailable');
 if(action==='publish'){
  const revision=await reportRevisionFence(db,actor.workspaceId,revisionId,{published:true,send:true});
  if(revision.state!=='review_ready')throw new HttpFailure(409,'version_conflict','Validate the exact report before publication');
  const validation=(await db.query('SELECT * FROM report_validations WHERE revision_id=$1 AND document_digest=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[revisionId,revision.content_digest])).rows[0];
   if(!validation)throw new HttpFailure(409,'version_conflict','Report validation required');
   if(head.kind!=='weekly'){
    const artifacts=(await db.query(`SELECT a.format,a.object_key,a.content_digest,a.size_bytes FROM report_artifacts a
     JOIN report_store_objects o ON o.object_key=a.object_key AND o.revision_id=a.revision_id
     WHERE a.revision_id=$1 AND a.validation_id=$2 AND o.state='finalized' AND o.environment_id=$3
     AND o.content_digest=a.content_digest AND o.size_bytes=a.size_bytes`,[revisionId,validation.id,process.env.TURAS_ENVIRONMENT_ID])).rows;
    if(artifacts.length!==2||new Set(artifacts.map(file=>file.format)).size!==2)throw new HttpFailure(503,'artifact_unavailable','Exact validated report files are unavailable');
    for(const file of artifacts){
     if(validation.artifact_digests[file.format]!==file.content_digest)throw new HttpFailure(503,'artifact_unavailable','Exact validated report files are unavailable');
     try{await readReportObject(file.object_key,file.content_digest,Number(file.size_bytes));}
     catch{throw new HttpFailure(503,'artifact_unavailable','Exact validated report files are unavailable');}
    }
   }
  const brand=(await db.query('SELECT manifest_digest,state,version FROM report_brand_profiles WHERE id=$1',[revision.brand_id])).rows[0];
  return {head,revision,validation,binding:{action,reportId,revisionId,reportVersion:Number(head.version),contentDigest:revision.content_digest,sourceSetDigest:revision.source_set_digest,
    validationId:validation.id,artifactDigests:validation.artifact_digests,mailDigest:validation.mail_digest,brandDigest:brand.manifest_digest,brandVersion:Number(brand.version)}};
 }
 const state=(await db.query('SELECT state,visibility,generation FROM report_revision_states WHERE revision_id=$1',[revisionId])).rows[0];
 const publication=(await db.query('SELECT id,revision_id,publication_number FROM report_publications WHERE report_id=$1 ORDER BY publication_number DESC LIMIT 1',[reportId])).rows[0];
 if(action==='withdraw' && !publication)throw new HttpFailure(409,'version_conflict','No publication is available to withdraw');
 return {head,revision:{id:revisionId},validation:null,binding:{action,reportId,revisionId,reportVersion:Number(head.version),generation:Number(state.generation),state:state.state,visibility:state.visibility,publicationId:publication?.id??null,publicationRevisionId:publication?.revision_id??null}};
}
export async function createPublicationPreview(db:PoolClient,actor:CurrentSession,reportId:string,action:PublicationAction,expectedVersion:number){
 const current=await publicationBinding(db,actor,reportId,action);
 if(Number(current.head.version)!==expectedVersion)throw new HttpFailure(409,'version_conflict','Report changed');
 const preview=await createReportPreview(db,actor,current.head.customer_id,reportId,'publication',expectedVersion,current.binding);
 return {...preview,binding:current.binding};
}
export async function decideReportPublication(db:PoolClient,actor:CurrentSession,reportId:string,command:{action:PublicationAction;expectedVersion:number;requestKey:string;previewId:string;previewDigest:string;rationale:string}){
 const current=await publicationBinding(db,actor,reportId,command.action),head=await reportHead(db,actor,reportId,true);
 if(Number(head.version)!==command.expectedVersion)throw new HttpFailure(409,'version_conflict','Report changed');
 await requireReportPreview(db,actor,reportId,'publication',command.previewId,command.previewDigest,command.expectedVersion,current.binding);
 const decisionId=await recordReportDecision(db,actor,head.customer_id,{action:command.action,subjectId:reportId,revisionId:current.revision.id,expectedVersion:command.expectedVersion,previewDigest:command.previewDigest,rationale:command.rationale,requestKey:command.requestKey});
 let publicationId:string|null=null;
 if(command.action==='publish'){
  const validation=current.validation!,revisionId=current.revision.id,number=Number((await db.query('SELECT COALESCE(MAX(publication_number),0)+1 AS n FROM report_publications WHERE report_id=$1',[reportId])).rows[0].n);
  const predecessor=(await db.query('SELECT predecessor_id FROM report_revisions WHERE id=$1',[revisionId])).rows[0].predecessor_id;
  const correction=predecessor?(await db.query('SELECT id FROM report_publications WHERE revision_id=$1',[predecessor])).rows[0]?.id:null;
  publicationId=randomUUID();
  await db.query(`INSERT INTO report_publications(id,environment_id,workspace_id,customer_id,report_id,revision_id,publication_number,decision_id,artifact_digests,mail_digest,audience,correction_of) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[publicationId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,head.customer_id,reportId,revisionId,number,decisionId,JSON.stringify(validation.artifact_digests),validation.mail_digest,head.audience,correction??null]);
  await db.query("UPDATE report_revision_states SET state='published',payload_expires_at=now()+interval '365 days',updated_at=now() WHERE revision_id=$1",[revisionId]);
 }else if(command.action==='reject'){
  const state=(await db.query('SELECT state FROM report_revision_states WHERE revision_id=$1',[current.revision.id])).rows[0].state;
  if(state==='published')throw new HttpFailure(409,'version_conflict','Published revisions cannot be rejected');
  await db.query("UPDATE report_revision_states SET state='draft',updated_at=now() WHERE revision_id=$1",[current.revision.id]);
 }else{
  const revisionId=(current.binding as {publicationRevisionId:string}).publicationRevisionId;
   await db.query("UPDATE report_revision_states SET visibility='withheld',generation=generation+1,reason_code='withdrawn',updated_at=now() WHERE revision_id=$1",[revisionId]);
   await queueReportRevisionCleanup(db,revisionId);
  await db.query("UPDATE report_deliveries SET state='cancelled',version=version+1,failure_code='publication_withdrawn' WHERE publication_id=$1 AND first_dispatch_at IS NULL AND state IN ('authorized','queued','retryable_failure')",[(current.binding as {publicationId:string}).publicationId]);
 }
 await db.query('UPDATE report_scopes SET version=version+1 WHERE id=$1',[reportId]);
 return {reportId,revisionId:current.revision.id,decisionId,...(publicationId?{publicationId}:{}),version:Number(head.version)+1};
}
