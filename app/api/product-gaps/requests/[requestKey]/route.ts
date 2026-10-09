import {gapRequest,gapQuery,gapRouteId} from '../../../../../lib/server/gaps/http';
import {readGapReceipt} from '../../../../../lib/server/gaps/commands';
import {HttpFailure} from '../../../../../lib/contracts/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{requestKey:string}>};
export function GET(request:Request,context:Context){return gapRequest(request,false,async actor=>{const query=gapQuery(request);if(Object.keys(query).some(k=>k!=='operation')||!query.operation||!['save_gap','save_impact','preview_decision','gap_decision','preview_canonicalization','canonicalize','prepare_report','preview_report','review_report','export_report','handoff','cancel_report'].includes(query.operation))throw new HttpFailure(400,'invalid_input','Operation scope required');return readGapReceipt(actor,gapRouteId((await context.params).requestKey),query.operation);});}
