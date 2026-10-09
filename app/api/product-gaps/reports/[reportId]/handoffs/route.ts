import {gapRequest,gapRouteId} from '../../../../../../lib/server/gaps/http';
import {recordGapHandoff} from '../../../../../../lib/server/gaps/handoffs';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{reportId:string}>};
export function POST(request:Request,context:Context){return gapRequest(request,true,async(actor,body)=>recordGapHandoff(actor,gapRouteId((await context.params).reportId),body),201);}
