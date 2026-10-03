import {executionRequest,executionQuery} from "../../../../lib/server/execution/http";
import {readExecutionUtilization} from "../../../../lib/server/execution/summary";
export const dynamic="force-dynamic";
export async function GET(request:Request):Promise<Response>{
  return executionRequest(request,false,async actor=>{
    const query=executionQuery(request,["from","to","resourceIds"]);
    return readExecutionUtilization(actor,{...query,resourceIds:query.resourceIds?.split(",")});
  });
}
