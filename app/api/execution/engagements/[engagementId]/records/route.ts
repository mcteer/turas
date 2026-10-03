import { HttpFailure } from "../../../../../../lib/contracts/http";
import { executionRequest,executionRouteId,executionQuery } from "../../../../../../lib/server/execution/http";
import { readExecutionRecords,readExecutionHistory } from "../../../../../../lib/server/execution/service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{engagementId:string}>}):Promise<Response>{
  return executionRequest(request,false,async(actor,body)=>{
    const id=executionRouteId((await context.params).engagementId);const query=executionQuery(request,["kind","state","recordId","cursor","limit","history"]);
    if(query.history!==undefined){if(query.history!=="1")throw new HttpFailure(400,"invalid_input","Invalid history selector");const {history:_history,...filters}=query;return readExecutionHistory(actor,id,filters);}
    return readExecutionRecords(actor,id,query);
  });
}
