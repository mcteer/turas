import {gapRequest,gapQuery,gapRouteId} from '../../../../lib/server/gaps/http';
import {readGap} from '../../../../lib/server/gaps/service';
import {HttpFailure} from '../../../../lib/contracts/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{gapId:string}>};
export function GET(request:Request,context:Context){return gapRequest(request,false,async actor=>{const id=gapRouteId((await context.params).gapId),query=gapQuery(request);if(Object.keys(query).some(k=>k!=='impactOffset'))throw new HttpFailure(400,'invalid_input','Invalid query');return readGap(actor,id,query.impactOffset===undefined?0:Number(query.impactOffset));});}
