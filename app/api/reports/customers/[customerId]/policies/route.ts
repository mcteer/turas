import {reportRequest,reportRouteId,reportQuery} from '../../../../../../lib/server/reports/http';
import {listReportPolicies} from '../../../../../../lib/server/reports/management';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{customerId:string}>}){return reportRequest(request,false,async actor=>listReportPolicies(actor,reportRouteId((await context.params).customerId),reportQuery(request,['limit','cursor'])));}
