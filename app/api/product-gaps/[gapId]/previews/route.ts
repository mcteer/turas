import {gapRequest,gapQuery,gapRouteId} from '../../../../../lib/server/gaps/http';
import {previewGapDecision} from '../../../../../lib/server/gaps/review';
import {HttpFailure} from '../../../../../lib/contracts/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{gapId:string}>};
export function POST(request:Request,context:Context){return gapRequest(request,true,async(actor,body)=>previewGapDecision(actor,gapRouteId((await context.params).gapId),body));}
