import { HttpFailure } from "../../../../../../lib/contracts/http";
import { executionRequest,executionRouteId,executionQuery } from "../../../../../../lib/server/execution/http";
import { readExecutionRecords } from "../../../../../../lib/server/execution/service";
import { readExecutionTime } from "../../../../../../lib/server/execution/time";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{engagementId:string}>}):Promise<Response>{
  return executionRequest(request,false,async actor=>{
    const id=executionRouteId((await context.params).engagementId), query=executionQuery(request,["kind","cursor","limit","from","to"]);
    if(query.kind==="time") {const {kind:_kind,...filters}=query;return readExecutionTime(actor,id,{...filters,review:"1"});}
    if(query.from||query.to)throw new HttpFailure(400,"invalid_input","Date filters require time review");
    return readExecutionRecords(actor,id,query,true);
  });
}
