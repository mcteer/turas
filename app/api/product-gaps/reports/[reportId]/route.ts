import {gapRequest,gapRouteId} from '../../../../../lib/server/gaps/http';
import {readGapReport} from '../../../../../lib/server/gaps/reports';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{reportId:string}>};
export function GET(request:Request,context:Context){return gapRequest(request,false,async actor=>{const params=await context.params;return readGapReport(actor,gapRouteId(params.reportId));},200);}
