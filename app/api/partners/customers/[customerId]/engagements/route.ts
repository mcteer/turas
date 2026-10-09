import { partnerRequest,partnerQuery } from "../../../../../../lib/server/partners/http";
import { readPartnerEngagements } from "../../../../../../lib/server/partners/workspace";
export async function GET(request:Request,context:{params:Promise<{customerId:string}>}){return partnerRequest(request,false,async actor=>readPartnerEngagements(actor,(await context.params).customerId,partnerQuery(request)));}
