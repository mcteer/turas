import {reportRequest,reportRouteId} from "../../../../../lib/server/reports/http";
import {submitReportRevisionCommand} from "../../../../../lib/server/reports/service";
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{reportId:string}>}){
 return reportRequest(request,true,async(actor,body)=>{const id=reportRouteId((await context.params).reportId);return submitReportRevisionCommand(actor,id,body);});
}
