import {reportRequest,reportRouteId} from '../../../../../../lib/server/reports/http';
import {previewReportPolicy} from '../../../../../../lib/server/reports/service';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{policyId:string}>}){
 return reportRequest(request,true,async(actor,body)=>previewReportPolicy(actor,reportRouteId((await context.params).policyId),body));
}
