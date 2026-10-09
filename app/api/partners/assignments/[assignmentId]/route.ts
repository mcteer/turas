import {z} from "zod";
import {partnerRequest,partnerQuery} from "../../../../../lib/server/partners/http";
import {readPartnerAssignment,readPartnerAttemptHistory} from "../../../../../lib/server/partners/assignments";
export async function GET(request:Request,context:{params:Promise<{assignmentId:string}>}){return partnerRequest(request,false,async actor=>{const query=partnerQuery(request),id=(await context.params).assignmentId;if("checkpointId" in query)return readPartnerAttemptHistory(actor,id,query);z.object({}).strict().parse(query);return readPartnerAssignment(actor,id);});}
