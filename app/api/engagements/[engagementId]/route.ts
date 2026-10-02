import { readEngagement } from "../../../../lib/server/engagements/read";
import { planId,planRequest } from "../../plans/_shared";
import { HttpFailure } from "../../../../lib/contracts/http";

export const dynamic="force-dynamic";
export async function GET(request:Request,
  context:{params:Promise<{engagementId:string}>}):Promise<Response> {
  return planRequest(request,false,async(client,actor)=>{
    const {engagementId}=await context.params;
    const params=new URL(request.url).searchParams;
    if ([...params.keys()].some(key=>!["assignmentCursor","assignmentPageSize"].includes(key)) ||
      [...new Set(params.keys())].some(key=>params.getAll(key).length!==1)) {
      throw new HttpFailure(422,"invalid_input","Invalid engagement query");
    }
    const paging={...(params.has("assignmentCursor") ? {cursor:params.get("assignmentCursor")}:{}),
      ...(params.has("assignmentPageSize") ? {pageSize:Number(params.get("assignmentPageSize"))}:{})};
    return readEngagement(actor,planId(engagementId),client,paging);
  });
}
