import {expansionRequest,expansionRouteId} from '../../../../../../lib/server/expansion/http';
import {prepareExpansionAdvice} from '../../../../../../lib/server/expansion/advisory';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{customerId:string}>}){
 return expansionRequest(request,true,async (actor,body)=>prepareExpansionAdvice(actor,expansionRouteId((await context.params).customerId),body));
}
