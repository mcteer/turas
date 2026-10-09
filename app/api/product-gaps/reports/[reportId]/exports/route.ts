import {gapRequest,gapRouteId} from '../../../../../../lib/server/gaps/http';
import {admitGapExport} from '../../../../../../lib/server/gaps/report-release';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{reportId:string}>};
export function POST(request:Request,context:Context){return gapRequest(request,true,async(actor,body)=>{const params=await context.params;return admitGapExport(actor,gapRouteId(params.reportId),body);},201);}
