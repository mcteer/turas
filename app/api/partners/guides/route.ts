import { partnerRequest,partnerQuery } from "../../../../lib/server/partners/http";
import { listPartnerGuides } from "../../../../lib/server/partners/guides";
export async function GET(request:Request){return partnerRequest(request,false,actor=>listPartnerGuides(actor,partnerQuery(request)));}
