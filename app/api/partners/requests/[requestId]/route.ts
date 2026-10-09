import { z } from "zod";
import { partnerRequest,partnerQuery } from "../../../../../lib/server/partners/http";
import { readPartnerRequest } from "../../../../../lib/server/partners/receipts";
const context=(params:Promise<{requestId:string}>)=>params;
export async function GET(request:Request,{params}:{params:Promise<{requestId:string}>}){return partnerRequest(request,false,async actor=>{z.object({}).strict().parse(partnerQuery(request));return readPartnerRequest(actor,(await context(params)).requestId);});}
export async function POST(request:Request,{params}:{params:Promise<{requestId:string}>}){return partnerRequest(request,true,async(actor,body)=>{z.object({expectedVersion:z.literal(0)}).strict().parse(body);return readPartnerRequest(actor,(await context(params)).requestId,true);});}
