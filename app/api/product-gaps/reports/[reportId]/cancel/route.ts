import {gapRequest,gapRouteId} from '../../../../../../lib/server/gaps/http';
import {cancelGapReport} from '../../../../../../lib/server/gaps/reports';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{reportId:string}>};
export function POST(request:Request,context:Context){return gapRequest(request,true,async(actor,body)=>{const params=await context.params;return cancelGapReport(actor,gapRouteId(params.reportId),body);},200);}
