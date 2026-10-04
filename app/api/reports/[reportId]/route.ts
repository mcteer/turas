import {reportRequest,reportRouteId,reportQuery} from "../../../../lib/server/reports/http";
import {readReport} from "../../../../lib/server/reports/read";
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{reportId:string}>}){
 return reportRequest(request,false,async(actor,body)=>{const id=reportRouteId((await context.params).reportId);const query=reportQuery(request,['revisionId']);return readReport(actor,id,query.revisionId?reportRouteId(query.revisionId):undefined);});
}
