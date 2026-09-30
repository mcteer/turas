import { readEngagement } from "../../../../lib/server/engagements/read";
import { planId,planRequest } from "../../plans/_shared";

export const dynamic="force-dynamic";
export async function GET(request:Request,
  context:{params:Promise<{engagementId:string}>}):Promise<Response> {
  return planRequest(request,false,async(client,actor)=>{
    const {engagementId}=await context.params;
    return readEngagement(actor,planId(engagementId),client);
  });
}
