import {reportRequest,reportRouteId,reportQuery} from '../../../../../lib/server/reports/http';
import {listReportDeliveries} from '../../../../../lib/server/reports/management';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{reportId:string}>}){return reportRequest(request,false,async actor=>listReportDeliveries(actor,reportRouteId((await context.params).reportId),reportQuery(request,['limit','cursor'])));}
