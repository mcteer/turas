import {reportRequest,reportQuery} from '../../../../lib/server/reports/http';
import {reportTransaction} from '../../../../lib/server/reports/commands';
import {reportReadiness} from '../../../../lib/server/reports/readiness';
import {lockWorkspaceActor} from '../../../../lib/server/profiles/policy';
import {hiddenRecord} from '../../../../lib/contracts/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 return reportRequest(request,false,actor=>reportTransaction(async db=>{
  reportQuery(request,[]);await lockWorkspaceActor(db,actor,undefined,true);if(actor.kind!=='internal')throw hiddenRecord();
  return reportReadiness(db,actor.workspaceId);
 }));
}
