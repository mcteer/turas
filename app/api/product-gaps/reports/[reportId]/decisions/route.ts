import {gapRequest,gapRouteId} from '../../../../../../lib/server/gaps/http';
import {commitGapReportReview} from '../../../../../../lib/server/gaps/report-review';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{reportId:string}>};
export function POST(request:Request,context:Context){return gapRequest(request,true,async(actor,body)=>{const params=await context.params;return commitGapReportReview(actor,gapRouteId(params.reportId),body);},200);}
