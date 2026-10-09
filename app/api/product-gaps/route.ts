import {gapRequest,gapQuery,gapRouteId} from '../../../lib/server/gaps/http';
import {readGaps,saveGap} from '../../../lib/server/gaps/service';
import {HttpFailure} from '../../../lib/contracts/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{}>};
export function GET(request:Request){return gapRequest(request,false,(actor)=>readGaps(actor,gapQuery(request)));}
export function POST(request:Request){return gapRequest(request,true,(actor,body)=>saveGap(actor,body),201);}
