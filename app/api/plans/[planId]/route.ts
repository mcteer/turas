import { readPlan } from "../../../../lib/server/plans/read";
import { optionalPlanId,planId,planRequest } from "../_shared";

export const dynamic="force-dynamic";
export async function GET(request:Request,
  context:{params:Promise<{planId:string}>}):Promise<Response> {
  return planRequest(request,false,async(client,actor)=>{
    const {planId:raw}=await context.params;
    return readPlan(actor,planId(raw),
      optionalPlanId(new URL(request.url).searchParams.get("revisionId")),client);
  });
}
