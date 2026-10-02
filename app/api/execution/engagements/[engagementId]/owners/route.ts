import { executionRequest,executionRouteId } from "../../../../../../lib/server/execution/http";
import { readExecutionOwners } from "../../../../../../lib/server/execution/service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{engagementId:string}>}):Promise<Response>{
  return executionRequest(request,false,async actor=>readExecutionOwners(actor,executionRouteId((await context.params).engagementId)));
}
