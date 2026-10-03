import {executionRequest,executionRouteId,executionQuery} from "../../../../../../lib/server/execution/http";
import {readExecutionSummary} from "../../../../../../lib/server/execution/summary";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{engagementId:string}>}):Promise<Response>{
  return executionRequest(request,false,async actor=>readExecutionSummary(actor,
    executionRouteId((await context.params).engagementId),executionQuery(request,["from","to"])));
}
