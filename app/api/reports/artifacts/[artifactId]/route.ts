import {getCurrentSession} from '../../../../../lib/server/auth/sessions';import {HttpFailure,hiddenRecord} from '../../../../../lib/contracts/http';
import {reportFailure,reportRouteId,reportQuery} from '../../../../../lib/server/reports/http';import {reportTransaction} from '../../../../../lib/server/reports/commands';import {streamReportArtifact} from '../../../../../lib/server/reports/artifacts';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{artifactId:string}>}){
  try{const actor=await getCurrentSession(request);if(!actor)throw new HttpFailure(401,'unauthenticated','Sign in required');reportQuery(request,[]);const id=reportRouteId((await context.params).artifactId);
  if(request.headers.has('range'))throw new HttpFailure(422,'range_unavailable','Partial report downloads are not supported');
 const metadata=await reportTransaction(async db=>(await db.query('SELECT v.report_id FROM report_artifacts a JOIN report_revisions v ON v.id=a.revision_id WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3',[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0]);if(!metadata)throw hiddenRecord();
  const artifact=await streamReportArtifact(actor,metadata.report_id,id);return new Response(artifact.stream,{headers:{'content-type':artifact.contentType,'content-length':String(artifact.bytes.length),'content-disposition':`attachment; filename="${artifact.filename}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }catch(error){return reportFailure(error);}
}
