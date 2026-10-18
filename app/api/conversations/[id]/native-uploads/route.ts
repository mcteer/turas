import { nativeUploadHttp } from "../../../../../lib/server/conversations/native-upload-http";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return nativeUploadHttp(request, await context.params, "create");
}
