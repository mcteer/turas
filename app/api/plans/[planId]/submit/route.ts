import { submitPlanCommand } from "../../../../../lib/server/plans/commands";
import { planId,planRequest } from "../../_shared";

export const dynamic="force-dynamic";
export async function POST(request:Request,
  context:{params:Promise<{planId:string}>}):Promise<Response> {
  return planRequest(request,true,async(client,actor,body)=>{
    const {planId:raw}=await context.params;
    return submitPlanCommand(actor,{...(typeof body==="object" && body!==null && !Array.isArray(body)
      ? body:{}),planId:planId(raw),action:"submit"},client);
  });
}
