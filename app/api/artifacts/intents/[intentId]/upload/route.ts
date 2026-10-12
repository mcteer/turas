import {directUploadRequest} from '../../../../../../lib/server/storage/uploads';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{intentId:string}>}){return directUploadRequest(request,'artifact',(await context.params).intentId);}
