import { nativeUploadHttp,nativeUploadReadHttp } from "../../../../../../../../lib/server/conversations/native-upload-http";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ id: string; uploadId: string; index: string }> }) {
  return nativeUploadHttp(request, await context.params, "chunk");
}
export async function GET(request:Request,context:{params:Promise<{id:string;uploadId:string;index:string}>}){return nativeUploadReadHttp(request,await context.params);}
