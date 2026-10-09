import { partnerRequest,partnerQuery } from "../../../../lib/server/partners/http";
import { listPartnerEvidence } from "../../../../lib/server/partners/sources";
export async function GET(request:Request){return partnerRequest(request,false,actor=>listPartnerEvidence(actor,partnerQuery(request)));}
