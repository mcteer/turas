import {expansionRequest,expansionRouteId} from '../../../../../../../../lib/server/expansion/http';
import {lookupExpansionAdvice} from '../../../../../../../../lib/server/expansion/advice-controls';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{customerId:string;requestKey:string}>}){
 return expansionRequest(request,false,async actor=>{const params=await context.params;return lookupExpansionAdvice(actor,expansionRouteId(params.customerId),expansionRouteId(params.requestKey));});
}
