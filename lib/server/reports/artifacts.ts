import type {CurrentSession} from '../auth/sessions';import {hiddenRecord} from '../../contracts/http';
import {reportTransaction} from './commands';import {reportHead} from './revisions';import {lockReportActor} from './policy';import {reportRevisionFence} from './release';import {readReportObject} from './store';import {reportId} from './schema';
export async function downloadReportArtifact(actor:CurrentSession,reportIdValue:string,artifactId:string){
 reportId.parse(reportIdValue);reportId.parse(artifactId);
 return reportTransaction(async db=>{
  const head=await reportHead(db,actor,reportIdValue);
  const metadata=(await db.query(`SELECT a.*,EXISTS(SELECT 1 FROM report_publications p WHERE p.revision_id=a.revision_id) AS published FROM report_artifacts a JOIN report_revisions v ON v.id=a.revision_id WHERE a.id=$1 AND v.report_id=$2 AND a.environment_id=$3 AND a.workspace_id=$4 AND a.validation_id IS NOT NULL`,[artifactId,reportIdValue,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
  await lockReportActor(db,actor,head.customer_id,'read',head.audience,Boolean(metadata?.published));if(!metadata)throw hiddenRecord();
  const revision=await reportRevisionFence(db,actor.workspaceId,metadata.revision_id,{published:metadata.published});
  if(revision.state!=='review_ready' && revision.state!=='published')throw hiddenRecord();
  const validation=(await db.query('SELECT artifact_digests FROM report_validations WHERE id=$1 AND revision_id=$2 AND document_digest=$3',[metadata.validation_id,metadata.revision_id,revision.content_digest])).rows[0];
  if(validation?.artifact_digests?.[metadata.format]!==metadata.content_digest)throw hiddenRecord();
  const bytes=await readReportObject(metadata.object_key,metadata.content_digest,Number(metadata.size_bytes));
  return {bytes,contentType:metadata.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation',filename:`executive-review.${metadata.format}`};
 });
}
/** Every chunk is released only after a new current-policy/source transaction. */
export async function streamReportArtifact(actor:CurrentSession,reportIdValue:string,artifactId:string){
 const artifact=await downloadReportArtifact(actor,reportIdValue,artifactId);
 let offset=0;
 const stream=new ReadableStream<Uint8Array>({
  async pull(controller){
   try{
    await reportTransaction(async db=>{
     const head=await reportHead(db,actor,reportIdValue);
     const row=(await db.query(`SELECT a.revision_id,EXISTS(SELECT 1 FROM report_publications p WHERE p.revision_id=a.revision_id) AS published
      FROM report_artifacts a JOIN report_revisions r ON r.id=a.revision_id
      WHERE a.id=$1 AND r.report_id=$2 AND a.environment_id=$3 AND a.workspace_id=$4 AND a.validation_id IS NOT NULL`,
      [artifactId,reportIdValue,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
     if(!row)throw hiddenRecord();
     await lockReportActor(db,actor,head.customer_id,'read',head.audience,Boolean(row.published));
     await reportRevisionFence(db,actor.workspaceId,row.revision_id,{published:row.published});
    });
    if(offset>=artifact.bytes.length){controller.close();return;}
    const end=Math.min(offset+65536,artifact.bytes.length);
    controller.enqueue(new Uint8Array(artifact.bytes.subarray(offset,end)));offset=end;
   }catch{controller.error(new Error('Report download is no longer available'));}
  },
 },{highWaterMark:0});
 return {...artifact,stream};
}
