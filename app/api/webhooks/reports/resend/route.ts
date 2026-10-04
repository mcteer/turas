import {acceptReportWebhook} from '../../../../../lib/server/reports/webhooks';
import {reportJson,reportFailure} from '../../../../../lib/server/reports/http';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{return reportJson(await acceptReportWebhook(request));}catch(error){return reportFailure(error);}
}
