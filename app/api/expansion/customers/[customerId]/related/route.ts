import {expansionRequest,expansionQuery,expansionRouteId} from '../../../../../../lib/server/expansion/http';
import {readExpansionRelated} from '../../../../../../lib/server/expansion/related';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{customerId:string}>}){
 return expansionRequest(request,false,async actor=>readExpansionRelated(actor,expansionRouteId((await context.params).customerId),expansionQuery(request)));
}
