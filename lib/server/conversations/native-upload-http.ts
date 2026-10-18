import { z } from "zod";
import { nativeUploadIntentSchema, nativeUploadChunkBytes } from "../../contracts/native-uploads";
import { failure, hiddenRecord, HttpFailure, success } from "../../contracts/http";
import { checkSessionCsrf } from "../auth/csrf";
import { getCurrentSession } from "../auth/sessions";
import { cancelNativeUpload, createNativeUpload, finishNativeUpload, writeNativeUploadChunk,readNativeUpload } from "./native-uploads";

export async function nativeUploadReadHttp(request:Request,params:{id:string;uploadId:string;index?:string}){
 try{
  const actor=await getCurrentSession(request);if(!actor)throw new HttpFailure(401,'authentication_required','Sign in required');
  if(!z.uuid().safeParse(params.id).success||!z.uuid().safeParse(params.uploadId).success||params.index!==undefined&&!/^(?:0|[1-9]\d?)$/.test(params.index))throw hiddenRecord();
  const result=await readNativeUpload(actor,params.id,params.uploadId,params.index===undefined?undefined:Number(params.index));
  if('bytes' in result&&result.bytes)return new Response(new Uint8Array(result.bytes),{headers:{'cache-control':'private, no-store','content-type':'application/octet-stream','x-content-type-options':'nosniff','x-chunk-sha256':result.sha256}});
  return success(result);
 }catch(error){return failure(error);}
}

export async function nativeUploadHttp(request: Request, params: { id: string; uploadId?: string; index?: string },
  action: "create" | "chunk" | "finish" | "cancel") {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
    checkSessionCsrf(request, actor);
    if (!z.uuid().safeParse(params.id).success || (params.uploadId && !z.uuid().safeParse(params.uploadId).success)) throw hiddenRecord();
    const maximum = action === "chunk" ? nativeUploadChunkBytes : 4096;
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let received = 0;
    if (reader) {
      try { while (true) {
        const item = await reader.read(); if (item.done) break;
        received += item.value.byteLength;
        if (received > maximum) { await reader.cancel(); throw new HttpFailure(413, "native_upload_too_large", "File request exceeds its transport limit"); }
        chunks.push(item.value);
      } } finally { reader.releaseLock(); }
    }
    const body = Buffer.concat(chunks);
    if (action === "create") {
      let value: unknown;
      try { value = JSON.parse(body.toString("utf8")); } catch { throw new HttpFailure(422, "invalid_input", "Invalid upload request"); }
      const input = nativeUploadIntentSchema.safeParse(value);
      if (!input.success) throw new HttpFailure(422, "invalid_input", "Invalid upload request");
      return success(await createNativeUpload(actor, params.id, input.data), 201);
    }
    if (action === "chunk") {
      if (!/^(?:0|[1-9]\d?)$/.test(params.index ?? "")) throw hiddenRecord();
      return success(await writeNativeUploadChunk(actor, params.id, params.uploadId!, Number(params.index), body));
    }
    if (body.length) throw new HttpFailure(422, "invalid_input", "This upload control does not accept a body");
    if (action === "finish") return success(await finishNativeUpload(actor, params.id, params.uploadId!));
    await cancelNativeUpload(actor, params.id, params.uploadId!);
    return success({ cancelled: true });
  } catch (error) { return failure(error); }
}
