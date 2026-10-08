import {expansionRequest,expansionRouteId} from '../../../../../../../lib/server/expansion/http';
import {readExpansionAdviceStatus} from '../../../../../../../lib/server/expansion/advice-status';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{customerId:string;attemptId:string}>}){
 return expansionRequest(request,false,async actor=>{const params=await context.params;return readExpansionAdviceStatus(actor,expansionRouteId(params.customerId),expansionRouteId(params.attemptId));});
}
