import {gapRequest,gapQuery,gapRouteId} from '../../../../../../../lib/server/gaps/http';
import {saveGapImpact} from '../../../../../../../lib/server/gaps/impacts';
import {HttpFailure} from '../../../../../../../lib/contracts/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{gapId:string;impactId:string}>};
export function POST(request:Request,context:Context){return gapRequest(request,true,async(actor,body)=>{const params=await context.params;return saveGapImpact(actor,gapRouteId(params.gapId),body,gapRouteId(params.impactId));},201);}
