import {reportRequest,reportRouteId,reportQuery} from '../../../../../lib/server/reports/http';
import {readReportHistory} from '../../../../../lib/server/reports/history';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{reportId:string}>}){
 return reportRequest(request,false,async actor=>readReportHistory(actor,reportRouteId((await context.params).reportId),reportQuery(request,['limit','cursor'])));
}
