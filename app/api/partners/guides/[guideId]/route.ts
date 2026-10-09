import { z } from "zod";
import { partnerRequest,partnerQuery } from "../../../../../lib/server/partners/http";
import { readPartnerGuide } from "../../../../../lib/server/partners/guides";
export async function GET(request:Request,context:{params:Promise<{guideId:string}>}){return partnerRequest(request,false,async actor=>{const query=z.object({revisionId:z.uuid().optional()}).strict().parse(partnerQuery(request));return readPartnerGuide(actor,(await context.params).guideId,query.revisionId);});}
