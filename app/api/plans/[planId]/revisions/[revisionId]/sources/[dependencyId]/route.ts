import { readPlanSource } from "../../../../../../../../lib/server/plans/sources";
import { planId,planRequest } from "../../../../../_shared";

export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{
  planId:string;revisionId:string;dependencyId:string}>}):Promise<Response> {
  return planRequest(request,false,async(client,actor)=>{
    const params=await context.params;
    return readPlanSource(client,actor,planId(params.planId),
      planId(params.revisionId),planId(params.dependencyId));
  });
}
