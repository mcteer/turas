import {assertNativeConversationOpen} from './native-retirement-state';
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { nativeUploadChunkBytes, nativeUploadIntentSchema, type NativeUploadIntent } from "../../contracts/native-uploads";
import { attachmentLimits } from "../../conversations/attachment-text";
import type { OrdinaryNativeMessage } from "../../conversations/native-message";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { lockOwnedBinding,readOwnedBinding } from "./binding";
import { conversationFeature } from "./feature";
import { ordinaryNativeFilesEnabled } from "./native-file-policy";
import { nativeMessageDigest, parseOrdinaryNativeMessage } from "./native-message";
import {assertCustomerQuestionReads} from './customer-accounts';
import {currentAttemptUserMessages} from './steering';

type Upload = { id: string; conversation_id: string; owner_principal_id: string; workspace_id: string;
  filename: string; media_type: string; size_bytes: number; sha256: string; state: string;
  bound_message_id: string | null; expires_at: Date };
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const reference = (row: Upload) => ({ type: "file" as const, filename: row.filename,
  mediaType: row.media_type, data: `turas-upload:${row.id}`, sha256: row.sha256, size: row.size_bytes });
async function scope(db: PoolClient, actor: CurrentSession, conversationId: string,readOnly=false) {
  if(readOnly)await readOwnedBinding(db,actor,conversationId);else await lockOwnedBinding(db, actor, conversationId);
  await assertNativeConversationOpen(db,conversationId);
  const marker = (await db.query("SELECT schema_version FROM turas_environment LIMIT 1")).rows[0];
  if (Number(marker?.schema_version ?? 0) < 74 || !ordinaryNativeFilesEnabled(conversationId))
    throw new HttpFailure(503, "native_files_unavailable", "Native file messages are not enabled");
  if ((await conversationFeature(db, conversationId)).kind !== "normal") throw hiddenRecord();
}
async function owned(db: PoolClient, actor: CurrentSession, conversationId: string, id: string,readOnly=false): Promise<Upload> {
  const row = (await db.query<Upload>(`SELECT * FROM ordinary_native_uploads WHERE id=$1
    AND conversation_id=$2 AND owner_principal_id=$3 AND workspace_id=$4 AND environment_id=$5 ${readOnly?'FOR SHARE':'FOR UPDATE'}`,
  [id, conversationId, actor.principalId, actor.workspaceId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if (!row) throw hiddenRecord();
  return row;
}
function available(row: Upload) {
  if (!["uploading", "ready", "bound"].includes(row.state) ||
      (row.state !== "bound" && row.expires_at.getTime() <= Date.now()))
    throw new HttpFailure(409, "native_upload_expired", "This file is no longer available; attach it again");
}
async function bytesFor(db: PoolClient, row: Upload) {
  const chunks = (await db.query<{chunk_index: number; bytes: Buffer; sha256: string}>(
    "SELECT chunk_index,bytes,sha256 FROM ordinary_native_upload_chunks WHERE upload_id=$1 ORDER BY chunk_index", [row.id])).rows;
  const expected = Math.ceil(row.size_bytes / nativeUploadChunkBytes);
  if (chunks.length !== expected || chunks.some((chunk, index) => chunk.chunk_index !== index ||
      chunk.bytes.length !== Math.min(nativeUploadChunkBytes, row.size_bytes - index * nativeUploadChunkBytes) ||
      hash(chunk.bytes) !== chunk.sha256))
    throw new HttpFailure(409, "native_upload_incomplete", "This file upload is incomplete");
  const bytes = Buffer.concat(chunks.map(chunk => chunk.bytes));
  if (bytes.length !== row.size_bytes || hash(bytes) !== row.sha256)
    throw new HttpFailure(409, "native_upload_changed", "The file differs from its original upload");
  return bytes;
}
export async function createNativeUpload(actor: CurrentSession, conversationId: string, raw: NativeUploadIntent) {
  const input = nativeUploadIntentSchema.parse(raw);
  return withTransaction(async db => {
    await scope(db, actor, conversationId);
    // Serialize reservation across all of this owner's conversations without
    // charging a response/model operation before a real send is admitted.
    await db.query("SELECT id FROM principals WHERE id=$1 FOR UPDATE", [actor.principalId]);
    const previous = (await db.query<Upload>(`SELECT * FROM ordinary_native_uploads
      WHERE conversation_id=$1 AND request_key=$2 FOR UPDATE`, [conversationId, input.requestKey])).rows[0];
    if (previous) {
      if (previous.filename !== input.filename.normalize("NFC") || previous.media_type !== input.mediaType.toLowerCase() ||
          previous.size_bytes !== input.size || previous.sha256 !== input.sha256)
        throw new HttpFailure(409, "native_upload_conflict", "Upload request key already used");
      available(previous); return { ...reference(previous), state: previous.state };
    }
    const used = (await db.query(`SELECT COALESCE(sum(size_bytes),0)::bigint AS bytes FROM ordinary_native_uploads
      WHERE owner_principal_id=$1 AND environment_id=$2 AND state IN('uploading','ready','bound')`,
    [actor.principalId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (Number(used.bytes) + input.size > 100 * 1024 * 1024)
      throw new HttpFailure(429, "native_upload_capacity", "File storage allowance reached; remove unused files or wait for cleanup");
    const row = (await db.query<Upload>(`INSERT INTO ordinary_native_uploads
      (id,environment_id,workspace_id,conversation_id,owner_principal_id,request_key,filename,media_type,size_bytes,sha256,state)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'uploading') RETURNING *`,
    [randomUUID(), getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, conversationId, actor.principalId,
      input.requestKey, input.filename.normalize("NFC"), input.mediaType.toLowerCase(), input.size, input.sha256])).rows[0];
    return { ...reference(row), state: row.state };
  });
}
export async function writeNativeUploadChunk(actor: CurrentSession, conversationId: string, id: string, index: number, bytes: Uint8Array) {
  if (!Number.isInteger(index) || index < 0 || index >= 20 || bytes.byteLength < 1 || bytes.byteLength > nativeUploadChunkBytes)
    throw new HttpFailure(413, "native_chunk_size", "Invalid file chunk size");
  return withTransaction(async db => {
    await scope(db, actor, conversationId);
    const row = await owned(db, actor, conversationId, id); available(row);
    const expected = Math.min(nativeUploadChunkBytes, row.size_bytes - index * nativeUploadChunkBytes);
    if (expected !== bytes.byteLength) throw new HttpFailure(413, "native_chunk_size", "Chunk differs from its declared size");
    const digest = hash(bytes);
    const prior = (await db.query("SELECT sha256 FROM ordinary_native_upload_chunks WHERE upload_id=$1 AND chunk_index=$2", [id, index])).rows[0];
    if (prior) {
      if (prior.sha256 !== digest) throw new HttpFailure(409, "native_chunk_conflict", "Chunk differs from its original bytes");
      return { state: row.state };
    }
    if (row.state !== "uploading") throw new HttpFailure(409, "native_upload_closed", "This upload is already complete");
    await db.query("INSERT INTO ordinary_native_upload_chunks(upload_id,chunk_index,bytes,sha256) VALUES($1,$2,$3,$4)",
      [id, index, Buffer.from(bytes), digest]);
    return { state: row.state };
  });
}
export async function finishNativeUpload(actor: CurrentSession, conversationId: string, id: string) {
  return withTransaction(async db => {
    await scope(db, actor, conversationId);
    const row = await owned(db, actor, conversationId, id); available(row);
    await bytesFor(db, row);
    if (row.state === "uploading") await db.query("UPDATE ordinary_native_uploads SET state='ready' WHERE id=$1", [id]);
    return reference(row);
  });
}
/** Admission binds references to the immutable human send. A substituted upload
 * ID cannot borrow another send's bytes even when both content hashes agree. */
export async function bindNativeUploads(db: PoolClient, actor: CurrentSession, conversationId: string, messageId: string, parts: OrdinaryNativeMessage) {
  for (const part of parts) {
    if (part.type !== "file" || !("sha256" in part)) continue;
    const row = await owned(db, actor, conversationId, part.data.slice("turas-upload:".length)); available(row);
    if (!['ready','bound'].includes(row.state) || row.filename !== part.filename || row.media_type !== part.mediaType ||
        row.size_bytes !== part.size || row.sha256 !== part.sha256 || (row.bound_message_id && row.bound_message_id !== messageId))
      throw new HttpFailure(409, "native_upload_changed", "The file reference differs from its original upload");
    await db.query(`UPDATE ordinary_native_uploads SET state='bound',bound_message_id=$2
      WHERE id=$1 AND state='ready'`, [row.id, messageId]);
  }
}
/** A correction does not open a second unbounded attachment allowance. Count
 * exact distinct file bytes/metadata across the initiating and consumed sends. */
export async function assertNativeAttemptFileLimit(db:PoolClient,actor:CurrentSession,attemptId:string,parts:OrdinaryNativeMessage){
 const messages=await currentAttemptUserMessages(db,attemptId,actor.principalId,actor.workspaceId);
 const rows=messages.length?(await db.query('SELECT ordinary_native_parts FROM submitted_messages WHERE id=ANY($1::uuid[])',[messages.map(message=>message.id)])).rows:[];
 const files=new Set<string>();
 for(const message of [...rows.map(row=>row.ordinary_native_parts),parts]){
  if(!Array.isArray(message))continue;
  for(const file of parseOrdinaryNativeMessage(message))if(file.type==='file')files.add(nativeMessageDigest([file]));
 }
 if(files.size>attachmentLimits.files)throw new HttpFailure(413,'native_attempt_file_limit','Use at most five distinct files while this response is running');
}

/** Eve deliberately renders images above 3 MiB and unsupported formats as
 * sandbox-path hints. Read only the five most recent distinct files from real
 * consumed sends in this owned conversation, including after reconnect. Model
 * prose, a sandbox path or another conversation's ID never grants access. */
export async function readNativeProviderFiles(db:PoolClient,actor:CurrentSession,conversationId:string,attemptId:string){
 const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
 if(Number(marker?.schema_version??0)<74)return [];
 const rows=(await db.query<{id:string;upload_id:string;ordinary_native_parts:unknown}>(
  `SELECT picked.id,picked.upload_id,picked.ordinary_native_parts FROM (
    SELECT DISTINCT ON(u.filename,u.media_type,u.sha256) m.id,m.created_at,m.ordinary_native_parts,u.id AS upload_id
    FROM submitted_messages m JOIN conversations c ON c.id=m.conversation_id
    JOIN ordinary_native_uploads u ON u.bound_message_id=m.id AND u.conversation_id=c.id
      AND u.owner_principal_id=c.owner_principal_id AND u.workspace_id=c.workspace_id AND u.environment_id=c.environment_id
    WHERE c.id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4
      AND EXISTS(SELECT 1 FROM response_attempts active WHERE active.id=$5 AND active.conversation_id=c.id AND active.response_state='running')
      AND (EXISTS(SELECT 1 FROM response_attempts a WHERE a.message_id=m.id AND a.input_event_id IS NOT NULL)
        OR EXISTS(SELECT 1 FROM ordinary_steering_deliveries d WHERE d.message_id=m.id AND d.native_event_id IS NOT NULL AND d.dispatch_state='admitted'))
    ORDER BY u.filename,u.media_type,u.sha256,m.created_at DESC,m.id DESC,u.id DESC
   ) picked ORDER BY picked.created_at DESC,picked.id DESC,picked.upload_id DESC LIMIT 5`,
  [conversationId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID,attemptId])).rows;
 const referenced=rows.flatMap(message=>Array.isArray(message.ordinary_native_parts)?parseOrdinaryNativeMessage(message.ordinary_native_parts)
  .flatMap(part=>part.type==='file'&&'sha256' in part&&part.data==='turas-upload:'+message.upload_id?[{part,messageId:message.id}]:[]):[]);
 if(!referenced.length)return [];
 await scope(db,actor,conversationId,true);
 await assertCustomerQuestionReads(db,actor,conversationId,attemptId);
 const files:Array<{filename:string;mediaType:string;sha256:string;bytes:Buffer}>=[],seen=new Set<string>();
 for(const {part,messageId}of referenced){
  const row=await owned(db,actor,conversationId,part.data.slice('turas-upload:'.length),true);available(row);
  if(row.state!=='bound'||row.bound_message_id!==messageId||row.sha256!==part.sha256||row.filename!==part.filename||row.media_type!==part.mediaType||row.size_bytes!==part.size)throw hiddenRecord();
  const key=JSON.stringify([row.filename,row.media_type,row.sha256]);if(seen.has(key))continue;
  seen.add(key);
  files.push({filename:row.filename,mediaType:row.media_type,sha256:row.sha256,bytes:await bytesFor(db,row)});
  if(files.length===attachmentLimits.files)break;
 }
 return files;
}
/** The only large payload is reconstructed inside the server. Browsers submit
 * compact references; no external request or public URL carries the file. */
export async function hydrateNativeUploads(actor: CurrentSession, conversationId: string, requestKey: string, parts: OrdinaryNativeMessage) {
  if (!parts.some(part => part.type === "file" && "sha256" in part)) return parseOrdinaryNativeMessage(parts);
  return withTransaction(async db => {
    await scope(db, actor, conversationId);
    const message = (await db.query(`SELECT id,ordinary_native_parts,body_digest FROM submitted_messages
      WHERE conversation_id=$1 AND request_key=$2`, [conversationId, requestKey])).rows[0];
    if (!message || JSON.stringify(parseOrdinaryNativeMessage(message.ordinary_native_parts)) !== JSON.stringify(parts) ||
        message.body_digest !== nativeMessageDigest(parts)) throw hiddenRecord();
    const hydrated: OrdinaryNativeMessage = [];
    for (const part of parts) {
      if (part.type !== "file" || !("sha256" in part)) { hydrated.push(part); continue; }
      const row = await owned(db, actor, conversationId, part.data.slice("turas-upload:".length)); available(row);
      if (row.state !== "bound" || row.bound_message_id !== message.id || row.sha256 !== part.sha256 ||
          row.filename !== part.filename || row.media_type !== part.mediaType || row.size_bytes !== part.size) throw hiddenRecord();
      const bytes = await bytesFor(db, row);
      hydrated.push({ type: "file", filename: row.filename, mediaType: row.media_type,
        data: `data:${row.media_type};base64,${bytes.toString("base64")}` });
    }
    return parseOrdinaryNativeMessage(hydrated, { trustedHydrated: true });
  });
}
export async function cancelNativeUpload(actor: CurrentSession, conversationId: string, id: string) {
  return withTransaction(async db => {
    await scope(db, actor, conversationId);
    const row = await owned(db, actor, conversationId, id);
    if (row.bound_message_id) throw new HttpFailure(409, "native_upload_bound", "A submitted file cannot be removed while its conversation is active");
    await db.query("DELETE FROM ordinary_native_upload_chunks WHERE upload_id=$1", [id]);
    await db.query("UPDATE ordinary_native_uploads SET state='cancelled' WHERE id=$1 AND state IN('uploading','ready')", [id]);
  });
}
async function viewScope(db:PoolClient,actor:CurrentSession,conversationId:string){
 await readOwnedBinding(db,actor,conversationId);
 if((await conversationFeature(db,conversationId)).kind!=='normal')throw hiddenRecord();
 await assertCustomerQuestionReads(db,actor,conversationId,undefined,true);
}
/** Private GETs never expose a public file URL or a whole oversized response. */
export async function readNativeUpload(actor:CurrentSession,conversationId:string,id:string,index?:number){
 return withTransaction(async db=>{
  await viewScope(db,actor,conversationId);
  const row=await owned(db,actor,conversationId,id,true);available(row);
  if(!['ready','bound'].includes(row.state))throw hiddenRecord();
  if(row.bound_message_id&&!(await db.query(`SELECT 1 FROM submitted_messages m WHERE m.id=$1 AND m.conversation_id=$2
   AND (EXISTS(SELECT 1 FROM response_attempts a WHERE a.message_id=m.id AND a.input_event_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM ordinary_steering_deliveries d WHERE d.message_id=m.id AND d.native_event_id IS NOT NULL AND d.dispatch_state='admitted'))`,
  [row.bound_message_id,conversationId])).rowCount)throw hiddenRecord();
  if(index===undefined)return {filename:row.filename,mediaType:row.media_type,size:row.size_bytes,sha256:row.sha256,chunkBytes:nativeUploadChunkBytes};
  if(!Number.isInteger(index)||index<0||index>=Math.ceil(row.size_bytes/nativeUploadChunkBytes))throw hiddenRecord();
  const chunk=(await db.query<{bytes:Buffer;sha256:string}>(
   'SELECT bytes,sha256 FROM ordinary_native_upload_chunks WHERE upload_id=$1 AND chunk_index=$2',[id,index])).rows[0];
  if(!chunk||chunk.bytes.length!==Math.min(nativeUploadChunkBytes,row.size_bytes-index*nativeUploadChunkBytes)||hash(chunk.bytes)!==chunk.sha256)
   throw new HttpFailure(409,'native_upload_changed','Stored file bytes could not be verified');
  return {bytes:chunk.bytes,sha256:chunk.sha256};
 });
}
export async function nativeAttachmentReferences(actor:CurrentSession,conversationId:string){
 return withTransaction(async db=>{
  const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
  if(Number(marker?.schema_version??0)<74)return [];
  // No private bytes are read before the current owner and every consumed
  // source/customer have been rechecked. Ineligible history has no file link.
  try{await viewScope(db,actor,conversationId);}catch(error){if(error instanceof HttpFailure&&[401,404,409].includes(error.status))return [];throw error;}
  const rows=(await db.query<{event_id:string;ordinary_native_parts:unknown}>(`SELECT consumed.event_id,m.ordinary_native_parts
   FROM conversations c JOIN submitted_messages m ON m.conversation_id=c.id
   JOIN LATERAL(SELECT a.input_event_id AS event_id FROM response_attempts a WHERE a.message_id=m.id AND a.input_event_id IS NOT NULL
    UNION ALL SELECT d.native_event_id FROM ordinary_steering_deliveries d WHERE d.message_id=m.id AND d.native_event_id IS NOT NULL AND d.dispatch_state='admitted') consumed ON true
   WHERE c.id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4 AND m.ordinary_native_parts IS NOT NULL
   ORDER BY m.created_at DESC,m.id DESC LIMIT 500`,[conversationId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
  return rows.map(row=>({eventId:row.event_id,files:parseOrdinaryNativeMessage(row.ordinary_native_parts).flatMap(part=>part.type==='file'&&'sha256' in part?
   [{filename:part.filename,mediaType:part.mediaType,size:part.size,url:`/api/conversations/${conversationId}/native-uploads/${part.data.slice('turas-upload:'.length)}`}]:[])}));
 });
}
/** Unbound uploads expire after thirty minutes. Admitted bytes retain the
 * conversation's lifetime and are removed only after its owner's confirmed
 * native retirement, never merely because a response finished or time passed. */
export async function cleanupNativeUploads(conversationId?: string) {
  return withTransaction(async db => {
    const marker = (await db.query("SELECT schema_version FROM turas_environment LIMIT 1")).rows[0];
    if (Number(marker?.schema_version ?? 0) < 74) return 0;
    if(conversationId)await markNativeUploadsRetired(db,conversationId);
    const rows = (await db.query<Upload>(`SELECT u.* FROM ordinary_native_uploads u
      WHERE u.environment_id=$1 AND (u.state IN('purged','expired','cancelled')
        AND EXISTS(SELECT 1 FROM ordinary_native_upload_chunks chunks WHERE chunks.upload_id=u.id)
        OR u.state IN('uploading','ready','bound')
        AND (($2::uuid IS NULL AND u.state IN('uploading','ready') AND u.expires_at<=clock_timestamp()) OR u.conversation_id=$2))
        AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM response_attempts a WHERE a.conversation_id=u.conversation_id
          AND a.response_state IN('pending','running','waiting_input','stopping')))
      ORDER BY u.expires_at,u.id LIMIT 100 FOR UPDATE OF u SKIP LOCKED`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, conversationId ?? null])).rows;
    for (const row of rows) {
      await db.query("DELETE FROM ordinary_native_upload_chunks WHERE upload_id=$1", [row.id]);
      if(!['purged','expired','cancelled'].includes(row.state))await db.query("UPDATE ordinary_native_uploads SET state=CASE WHEN bound_message_id IS NULL THEN 'expired' ELSE 'purged' END WHERE id=$1", [row.id]);
    }
    return rows.length;
  });
}

export async function markNativeUploadsRetired(db:PoolClient,conversationId:string){
    await db.query(`UPDATE ordinary_native_uploads u SET state=CASE WHEN bound_message_id IS NULL THEN 'expired' ELSE 'purged' END
      WHERE u.conversation_id=$1 AND u.environment_id=$2 AND u.state IN('uploading','ready','bound')
       AND NOT EXISTS(SELECT 1 FROM response_attempts a WHERE a.conversation_id=u.conversation_id
        AND a.response_state IN('pending','running','waiting_input','stopping'))`,[conversationId,getServerConfig().TURAS_ENVIRONMENT_ID]);
}
