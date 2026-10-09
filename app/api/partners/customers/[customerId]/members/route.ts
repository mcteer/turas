import {partnerRequest,partnerQuery} from "../../../../../../lib/server/partners/http";
import {listPartnerMembers} from "../../../../../../lib/server/partners/assignments";
export async function GET(request:Request,context:{params:Promise<{customerId:string}>}){return partnerRequest(request,false,async actor=>listPartnerMembers(actor,(await context.params).customerId,partnerQuery(request)));}
