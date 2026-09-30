import { z } from "zod";
import { HttpFailure } from "../../../lib/contracts/http";
import { submitPlanCommand } from "../../../lib/server/plans/commands";
import { listPlans } from "../../../lib/server/plans/read";
import { planId,planRequest } from "./_shared";

export const dynamic="force-dynamic";
export async function GET(request:Request):Promise<Response> {
  return planRequest(request,false,(client,actor)=>{
    const url=new URL(request.url);
    const customerId=planId(url.searchParams.get("customerId") ?? "");
    const workloadId=url.searchParams.get("workloadId");
    const rawLimit=url.searchParams.get("limit");
    if (rawLimit && !/^\d{1,2}$/.test(rawLimit))
      throw new HttpFailure(422,"invalid_input","Invalid page limit");
    return listPlans(actor,customerId,{workloadId:workloadId ? planId(workloadId):undefined,
      limit:rawLimit ? Number(rawLimit):undefined,
      cursor:url.searchParams.get("cursor") ?? undefined},client);
  });
}
export async function POST(request:Request):Promise<Response> {
  return planRequest(request,true,(client,actor,body)=>
    submitPlanCommand(actor,{...(z.record(z.string(),z.unknown()).safeParse(body).success ?
      body as Record<string,unknown> : {}),action:"create"},client));
}
