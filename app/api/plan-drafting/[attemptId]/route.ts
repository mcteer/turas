import { getPlanDraft } from "../../../../lib/server/plans/drafting";
import { planId,planRequest } from "../../plans/_shared";

export const dynamic="force-dynamic";

export async function GET(request:Request,
  context:{params:Promise<{attemptId:string}>}):Promise<Response> {
  return planRequest(request,false,async(client,actor)=>{
    const {attemptId}=await context.params;
    return getPlanDraft(actor,planId(attemptId),client);
  });
}
