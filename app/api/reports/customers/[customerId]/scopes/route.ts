import {reportRequest,reportRouteId} from '../../../../../../lib/server/reports/http';
import {reportScopeOptions} from '../../../../../../lib/server/reports/scope-options';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{customerId:string}>}){
 return reportRequest(request,false,async actor=>reportScopeOptions(actor,reportRouteId((await context.params).customerId)));
}
