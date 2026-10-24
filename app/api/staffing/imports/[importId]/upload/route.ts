import {directUploadRequest} from '../../../../../../lib/server/storage/uploads';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{importId:string}>}){return directUploadRequest(request,'workforce',(await context.params).importId);}
