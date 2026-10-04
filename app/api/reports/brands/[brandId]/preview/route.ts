import {reportRequest,reportRouteId} from '../../../../../../lib/server/reports/http';import {previewReportBrand} from '../../../../../../lib/server/reports/brand-review';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{brandId:string}>}){return reportRequest(request,true,async(actor,body)=>previewReportBrand(actor,reportRouteId((await context.params).brandId),body));}
