import {reportRequest,reportRouteId} from "../../../../../../lib/server/reports/http";
import {submitReportCustomerCommand} from "../../../../../../lib/server/reports/service";
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{customerId:string}>}){
 return reportRequest(request,true,async(actor,body)=>{const id=reportRouteId((await context.params).customerId);return submitReportCustomerCommand(actor,id,body);});
}
