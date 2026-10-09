import {gapRequest,gapRouteId} from '../../../../../../../lib/server/gaps/http';
import {gapExportResponse} from '../../../../../../../lib/server/gaps/report-artifacts';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{reportId:string;exportId:string}>};
export function GET(request:Request,context:Context){return gapRequest(request,false,async actor=>{const params=await context.params;return gapExportResponse(actor,gapRouteId(params.reportId),gapRouteId(params.exportId));},200);}
