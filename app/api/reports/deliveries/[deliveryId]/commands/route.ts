import {reportRequest,reportRouteId} from '../../../../../../lib/server/reports/http';
import {submitReportDeliveryCommand} from '../../../../../../lib/server/reports/delivery-commands';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{deliveryId:string}>}){
 return reportRequest(request,true,async(actor,body)=>submitReportDeliveryCommand(actor,reportRouteId((await context.params).deliveryId),body));
}
