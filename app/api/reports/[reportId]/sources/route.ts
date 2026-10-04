import {reportRequest,reportRouteId,reportQuery} from '../../../../../lib/server/reports/http';
import {readReportSourceLabels} from '../../../../../lib/server/reports/history';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{reportId:string}>}){
 return reportRequest(request,false,async actor=>{reportQuery(request,[]);return readReportSourceLabels(actor,reportRouteId((await context.params).reportId));});
}
