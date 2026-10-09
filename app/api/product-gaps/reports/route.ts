import {gapRequest,gapRouteId} from '../../../../lib/server/gaps/http';
import {prepareGapReport} from '../../../../lib/server/gaps/reports';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return gapRequest(request,true,async(actor,body)=>{return prepareGapReport(actor,body);},202,65536);}
