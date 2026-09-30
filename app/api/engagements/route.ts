import { listEngagements } from "../../../lib/server/engagements/read";
import { planId,planRequest } from "../plans/_shared";

export const dynamic="force-dynamic";
export async function GET(request:Request):Promise<Response> {
  return planRequest(request,false,(client,actor)=>{
    const url=new URL(request.url);
    const customerId=planId(url.searchParams.get("customerId") ?? "");
    const workloadId=url.searchParams.get("workloadId");
    return listEngagements(actor,customerId,workloadId ? planId(workloadId):null,client);
  });
}
