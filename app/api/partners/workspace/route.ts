import { partnerRequest,partnerQuery } from "../../../../lib/server/partners/http";
import { readPartnerWorkspace } from "../../../../lib/server/partners/workspace";
export async function GET(request:Request){return partnerRequest(request,false,actor=>readPartnerWorkspace(actor,partnerQuery(request)));}
