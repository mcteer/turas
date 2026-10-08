import {expansionRequest,expansionQuery,expansionRouteId} from '../../../../../../lib/server/expansion/http';
import {readExpansionDeliveryChoices} from '../../../../../../lib/server/expansion/link-choices';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{customerId:string}>}){
 return expansionRequest(request,false,async actor=>readExpansionDeliveryChoices(actor,expansionRouteId((await context.params).customerId),expansionQuery(request)));
}
