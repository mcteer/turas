import {reportRequest,reportRouteId} from "../../../../../lib/server/reports/http";
import {submitReportPublicationDecision} from "../../../../../lib/server/reports/service";
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{reportId:string}>}){
 return reportRequest(request,true,async(actor,body)=>{const id=reportRouteId((await context.params).reportId);return submitReportPublicationDecision(actor,id,body);});
}
