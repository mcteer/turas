import { executionRequest,executionRouteId } from "../../../../../../lib/server/execution/http";
import { previewExecutionCommand } from "../../../../../../lib/server/execution/service";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{engagementId:string}>}):Promise<Response>{
  return executionRequest(request,true,async(actor,body)=>{
    const id=executionRouteId((await context.params).engagementId);return previewExecutionCommand(actor,id,body);
  });
}
