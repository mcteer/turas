"use client";
import { nativeUploadChunkBytes } from "../contracts/native-uploads";
import { ordinaryNativeMessageSchema, type OrdinaryNativeMessage } from "./native-message";
import type { OrdinarySendMessage,OrdinaryAttachment } from "./ordinary-documents";

export async function cancelRemovedNativeFiles(previous:readonly OrdinaryAttachment[],next:readonly OrdinaryAttachment[],conversationId:string,csrfToken:string){
  const retained=new Set(next.flatMap(file=>'data' in file?[file.data]:[]));
  const removed=previous.filter(file=>'sha256' in file&&!retained.has(file.data));
  for(const file of removed){
    if(!('data' in file))continue;
    try{
      const response=await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/native-uploads/${encodeURIComponent(file.data.slice('turas-upload:'.length))}`,
        {method:'DELETE',headers:{'x-csrf-token':csrfToken}});
      if(!response.ok)throw Error('Unconfirmed removal');
    }catch{throw Error('File removal could not be confirmed. The attachment remains visible; retry removal to check its status.');}
  }
}

/** Bounded binary requests avoid base64/hosted ingress limits. Only opaque,
 * owner-bound references enter the durable chat draft and final send body. */
export async function uploadNativeFiles(message: OrdinarySendMessage, conversationId: string, csrfToken: string): Promise<OrdinarySendMessage> {
  if (typeof message === "string") return message;
  const prepared: OrdinaryNativeMessage = [], created: Array<{id:string;cacheKey:string}> = [];
  const headers = { "x-csrf-token": csrfToken };
  const base = `/api/conversations/${encodeURIComponent(conversationId)}/native-uploads`;
  try {
    for (const part of message) {
      if (part.type !== "file" || "sha256" in part) { prepared.push(part); continue; }
      const encoded = part.data.slice(part.data.indexOf(",") + 1);
      const binary = atob(encoded), bytes = Uint8Array.from(binary, value => value.charCodeAt(0));
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
      // Retain the exact operation key before I/O. A lost create acknowledgment
      // rejoins the same reservation after retry/reload instead of topping up.
      const cacheKey=`turas-native-upload:${conversationId}:${sha256}:${encodeURIComponent(part.filename)}:${part.mediaType}`;
      let requestKey=sessionStorage.getItem(cacheKey)??crypto.randomUUID();sessionStorage.setItem(cacheKey,requestKey);
      const create=()=>fetch(base, { method: "POST", headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ requestKey, filename: part.filename, mediaType: part.mediaType, size: bytes.length, sha256 }) });
      let intent=await create();
      if(intent.status===409&&(await intent.clone().json().catch(()=>null))?.error?.code==='native_upload_expired'){
        requestKey=crypto.randomUUID();sessionStorage.setItem(cacheKey,requestKey);intent=await create();
      }
      if (!intent.ok) throw Error("The file upload could not be started. No chat response was requested.");
      const reference = (await intent.json()).data as Extract<OrdinaryNativeMessage[number], { type: "file" }>;
      const id = reference.data.slice("turas-upload:".length); created.push({id,cacheKey});
      for (let offset = 0, index = 0; offset < bytes.length; offset += nativeUploadChunkBytes, index++) {
        const uploaded = await fetch(`${base}/${id}/chunks/${index}`, { method: "PUT", headers: { ...headers, "content-type": "application/octet-stream" },
          body: bytes.slice(offset, offset + nativeUploadChunkBytes) });
        if (!uploaded.ok) throw Error("The file upload did not finish. No chat response was requested.");
      }
      const finished = await fetch(`${base}/${id}`, { method: "POST", headers });
      if (!finished.ok) throw Error("The uploaded file could not be verified. No chat response was requested.");
      prepared.push((await finished.json()).data);
    }
    const result=ordinaryNativeMessageSchema.parse(prepared);
    for(const intent of created)sessionStorage.removeItem(intent.cacheKey);
    return result;
  } catch (error) {
    await Promise.allSettled(created.map(async({id,cacheKey})=>{
      const cancelled=await fetch(`${base}/${id}`, { method: "DELETE", headers });
      if(cancelled.ok)sessionStorage.removeItem(cacheKey);
    }));
    throw error;
  }
}
