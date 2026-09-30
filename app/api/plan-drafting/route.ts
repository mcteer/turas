import { startPlanDraft } from "../../../lib/server/plans/drafting";
import { planRequest } from "../plans/_shared";

export const dynamic="force-dynamic";

export async function POST(request:Request):Promise<Response> {
  return planRequest(request,true,(client,actor,body)=>
    startPlanDraft(actor,body,client));
}
