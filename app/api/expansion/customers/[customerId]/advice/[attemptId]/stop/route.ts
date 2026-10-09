import {expansionRequest,expansionRouteId} from '../../../../../../../../lib/server/expansion/http';
import {stopExpansionAdvice} from '../../../../../../../../lib/server/expansion/advice-controls';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{customerId:string;attemptId:string}>}){
 return expansionRequest(request,true,async(actor,body)=>{const params=await context.params;return stopExpansionAdvice(actor,expansionRouteId(params.customerId),expansionRouteId(params.attemptId),body);});
}
