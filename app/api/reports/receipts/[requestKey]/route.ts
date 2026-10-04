import {reportRequest,reportRouteId} from "../../../../../lib/server/reports/http";
import {readReportCommandReceipt} from "../../../../../lib/server/reports/service";
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{requestKey:string}>}){
 return reportRequest(request,false,async(actor,body)=>{const id=reportRouteId((await context.params).requestKey);return readReportCommandReceipt(actor,id);});
}
