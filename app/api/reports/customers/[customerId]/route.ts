import {reportRequest,reportRouteId,reportQuery} from "../../../../../lib/server/reports/http";
import {listCustomerReports} from "../../../../../lib/server/reports/read";
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{customerId:string}>}){
 return reportRequest(request,false,async(actor,body)=>{const id=reportRouteId((await context.params).customerId);return listCustomerReports(actor,id,reportQuery(request,['kind','audience','limit','cursor']));});
}
