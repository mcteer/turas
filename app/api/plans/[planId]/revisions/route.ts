import { submitPlanCommand } from "../../../../../lib/server/plans/commands";
import { readPlanHistory } from "../../../../../lib/server/plans/read";
import { planId,planRequest } from "../../_shared";

export const dynamic="force-dynamic";
export async function GET(request:Request,
  context:{params:Promise<{planId:string}>}):Promise<Response> {
  return planRequest(request,false,async(client,actor)=>{
    const {planId:raw}=await context.params;
    const url=new URL(request.url);
    const rawLimit=url.searchParams.get("limit");
    return readPlanHistory(actor,planId(raw),{
      limit:rawLimit===null ? undefined:Number(rawLimit),
      cursor:url.searchParams.get("cursor") ?? undefined},client);
  });
}
export async function POST(request:Request,
  context:{params:Promise<{planId:string}>}):Promise<Response> {
  return planRequest(request,true,async(client,actor,body)=>{
    const {planId:raw}=await context.params;
    return submitPlanCommand(actor,{...(typeof body==="object" && body!==null && !Array.isArray(body)
      ? body:{}),planId:planId(raw),action:"save"},client);
  });
}
