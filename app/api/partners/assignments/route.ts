import {partnerRequest,partnerQuery} from "../../../../lib/server/partners/http";
import {listPartnerAssignments} from "../../../../lib/server/partners/assignments";
export async function GET(request:Request){return partnerRequest(request,false,actor=>listPartnerAssignments(actor,partnerQuery(request)));}
