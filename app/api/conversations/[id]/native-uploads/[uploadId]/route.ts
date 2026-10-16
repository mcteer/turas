import { nativeUploadHttp,nativeUploadReadHttp } from "../../../../../../lib/server/conversations/native-upload-http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; uploadId: string }> };
export async function POST(request: Request, context: Context) { return nativeUploadHttp(request, await context.params, "finish"); }
export async function DELETE(request: Request, context: Context) { return nativeUploadHttp(request, await context.params, "cancel"); }
export async function GET(request:Request,context:Context){return nativeUploadReadHttp(request,await context.params);}
