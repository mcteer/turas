import { readPlanCommandReceipt } from "../../../../../lib/server/plans/commands";
import { planId,planRequest } from "../../_shared";

export const dynamic="force-dynamic";
export async function GET(request:Request,
  context:{params:Promise<{requestKey:string}>}):Promise<Response> {
  return planRequest(request,false,async(client,actor)=>{
    const {requestKey}=await context.params;
    return readPlanCommandReceipt(actor,requestKey,
      planId(new URL(request.url).searchParams.get("customerId") ?? ""),client);
  });
}
