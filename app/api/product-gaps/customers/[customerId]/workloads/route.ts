import {gapRequest,gapRouteId} from '../../../../../../lib/server/gaps/http';
import {readGapCustomerWorkloads} from '../../../../../../lib/server/gaps/customer-context';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(request:Request,context:{params:Promise<{customerId:string}>}){return gapRequest(request,false,async actor=>readGapCustomerWorkloads(actor,gapRouteId((await context.params).customerId)));}
