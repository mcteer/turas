import { readPlanDiff } from "../../../../../lib/server/plans/diff";
import { planId,planRequest } from "../../_shared";

export const dynamic="force-dynamic";
export async function GET(request:Request,
  context:{params:Promise<{planId:string}>}):Promise<Response> {
  return planRequest(request,false,async(client,actor)=>{
    const {planId:raw}=await context.params;
    const query=new URL(request.url).searchParams;
    return readPlanDiff(actor,planId(raw),planId(query.get("base") ?? ""),
      planId(query.get("target") ?? ""),client);
  });
}
