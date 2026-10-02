import { executionRequest,executionRouteId,executionQuery } from "../../../../../../lib/server/execution/http";
import { readExecutionRecords } from "../../../../../../lib/server/execution/service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{engagementId:string}>}):Promise<Response>{
  return executionRequest(request,false,async(actor,body)=>{
    const id=executionRouteId((await context.params).engagementId);return readExecutionRecords(actor,id,executionQuery(request,["kind","cursor","limit"]),true);
  });
}
