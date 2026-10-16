import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, expect, it,vi } from "vitest";
import { nativeUploadReadHttp,nativeUploadHttp } from "../../lib/server/conversations/native-upload-http";
import { csrfTokenForSession } from "../../lib/server/auth/csrf";
import { sessionCookie, type CurrentSession } from "../../lib/server/auth/sessions";
import { createOwnedConversation, getOwnedConversationDetail } from "../../lib/server/conversations/repository";
import { claimBinding, bindNativeSession } from "../../lib/server/conversations/binding";
import { prepareAttempt, claimDispatch, deriveNativeAttempt } from "../../lib/server/conversations/dispatch";
import { hydrateNativeUploads, cleanupNativeUploads } from "../../lib/server/conversations/native-uploads";
import { nativeMessageDigest, parseOrdinaryNativeMessage,summarizeNativeMessage } from "../../lib/server/conversations/native-message";
import {projectNativeEvent} from '../../lib/server/conversations/projection';
import {wrapOrdinaryChatModel} from '../../lib/server/conversations/model-budget';
import { nativeUploadChunkBytes } from "../../lib/contracts/native-uploads";
import { withTransaction } from "../../lib/server/db/client";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { isolatedChatActor } from "../fixtures/isolated-chat-actor";
import { settleSyntheticConversationAttempts } from "../fixtures/ordinary-attempt-cleanup";
import {prepareOrdinarySteering} from '../../lib/server/conversations/steering';
import {uploadNativeFiles,cancelRemovedNativeFiles} from '../../lib/conversations/upload-native-files';

const url = requireTestDatabaseUrl();
beforeAll(() => {
  const runtime = new URL(url); runtime.searchParams.set("options", "-c role=turas_runtime");
  process.env.DATABASE_URL = runtime.toString();
  process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
});
function request(actor: CurrentSession, method: string, body?: string | Uint8Array) {
  const origin = process.env.TURAS_APP_ORIGIN!;
  return new Request(`${origin}/api/conversations`, { method,
    headers: { origin, cookie: sessionCookie(actor.token, actor.expiresAt).split(";")[0],
      "x-csrf-token": csrfTokenForSession(actor.token) },
    body: typeof body === "string" ? body : body ? Buffer.from(body) : undefined });
}
async function fixture(db: Client, actor = undefined as CurrentSession|undefined) {
  actor ??= await isolatedChatActor(db, "internal", "admin"); const key = randomUUID();
  const { conversation } = await createOwnedConversation(actor, { requestKey: key });
  const binding = await claimBinding(actor, conversation.id, key);
  if (binding.state !== "claimed") throw Error("Owned fixture binding unavailable");
  const native = `wrun_${randomUUID()}`;
  await bindNativeSession(actor, conversation.id, binding.claimToken, native);
  await db.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at)
    VALUES($1,'staged-upload-fixture',now()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=now()`,
  [process.env.TURAS_TEST_ENVIRONMENT_ID]);
  return { actor, conversation, native };
}
async function stage(actor: CurrentSession, conversationId: string, bytes: Buffer) {
  const parameters = { id: conversationId };
  const input = { requestKey: randomUUID(), filename: "supplied.bin", mediaType: "application/octet-stream",
    size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  const created = await nativeUploadHttp(request(actor, "POST", JSON.stringify(input)), parameters, "create");
  expect(created.status).toBe(201);
  const reference = (await created.json()).data;
  const uploadId = reference.data.slice("turas-upload:".length);
  const replay = await nativeUploadHttp(request(actor, "POST", JSON.stringify(input)), parameters, "create");
  expect((await replay.json()).data.data).toBe(reference.data);
  for (let offset = 0, index = 0; offset < bytes.length; offset += nativeUploadChunkBytes, index++) {
    const chunk = await nativeUploadHttp(request(actor, "PUT", bytes.subarray(offset, offset + nativeUploadChunkBytes)),
      { ...parameters, uploadId, index: String(index) }, "chunk");
    expect(chunk.status).toBe(200);
  }
  const finished = await nativeUploadHttp(request(actor, "POST"), { ...parameters, uploadId }, "finish");
  expect(finished.status).toBe(200);
  return { reference: (await finished.json()).data, uploadId, input };
}

it.each([4, 10])("stages actual %i MiB bytes through bounded HTTP handlers and hydrates only the exact immutable owned send", async mib => {
  const db = new Client({ connectionString: url }); await db.connect();
  const owned: string[] = [], prior = process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;
  process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED = "1";
  try {
    const f = await fixture(db); owned.push(f.conversation.id);
    const bytes = Buffer.alloc(mib * 1024 * 1024, 0x5a);
    const staged = await stage(f.actor, f.conversation.id, bytes);
    expect((await db.query("SELECT count(*)::int AS n FROM response_attempts WHERE conversation_id=$1", [f.conversation.id])).rows[0].n).toBe(0);
    const viewParams={id:f.conversation.id,uploadId:staged.uploadId};
    const metadata=await nativeUploadReadHttp(request(f.actor,'GET'),viewParams);
    expect(metadata.status).toBe(200);expect((await metadata.json()).data).toMatchObject({size:bytes.length,sha256:staged.input.sha256,chunkBytes:nativeUploadChunkBytes});
    const downloaded:Buffer[]=[];
    for(let index=0;index<bytes.length/nativeUploadChunkBytes;index++){
      const response=await nativeUploadReadHttp(request(f.actor,'GET'),{...viewParams,index:String(index)});
      expect(response.status).toBe(200);const chunk=Buffer.from(await response.arrayBuffer());expect(chunk.length).toBeLessThanOrEqual(nativeUploadChunkBytes);downloaded.push(chunk);
    }
    expect(Buffer.concat(downloaded).equals(bytes)).toBe(true);
    expect((await nativeUploadReadHttp(request(f.actor,'GET'),{...viewParams,index:'20'})).status).toBe(404);
    const parts = parseOrdinaryNativeMessage([{ type: "text", text: "Read this file." }, staged.reference]);
    expect(Buffer.byteLength(JSON.stringify(parts))).toBeLessThan(1024);
    const key = randomUUID();
    const attempt = await prepareAttempt(f.actor, f.conversation.id, f.native, key, parts);
    expect(await prepareAttempt(f.actor, f.conversation.id, f.native, key, parts)).toMatchObject({ attemptId: attempt.attemptId, created: false });
    const stored = (await db.query("SELECT ordinary_native_parts FROM submitted_messages WHERE conversation_id=$1", [f.conversation.id])).rows[0];
    expect(Buffer.byteLength(JSON.stringify(stored.ordinary_native_parts))).toBeLessThan(1024);
    expect((await nativeUploadReadHttp(request(f.actor,'GET'),viewParams)).status).toBe(404); // A bound draft is not admitted history.
    await claimDispatch(f.actor, f.conversation.id, attempt.attemptId, 0);
    const hydrated = await hydrateNativeUploads(f.actor, f.conversation.id, key, parts);
    expect(nativeMessageDigest(hydrated)).toBe(nativeMessageDigest(parts));
    const file = hydrated.find(part => part.type === "file")!;
    expect(file.type === "file" && Buffer.from(file.data.slice(file.data.indexOf(",") + 1), "base64").equals(bytes)).toBe(true);
    expect(() => parseOrdinaryNativeMessage(hydrated)).toThrow();
    expect(await deriveNativeAttempt(f.actor, f.native, key, hydrated, { trustedHydrated: true })).toBe(attempt.attemptId);
    const turn='turn_'+randomUUID();
    await projectNativeEvent(f.native,attempt.attemptId,{type:'message.received',data:{message:summarizeNativeMessage(parts),turnId:turn},meta:{id:'evt_'+randomUUID(),at:new Date().toISOString()}});
    expect((await nativeUploadReadHttp(request(f.actor,'GET'),viewParams)).status).toBe(200);
    await db.query(`INSERT INTO general_context_injections(attempt_id,turn_id,snapshot_digest)
      SELECT attempt_id,$2,snapshot_digest FROM general_context_receipts WHERE attempt_id=$1`,[attempt.attemptId,turn]);
    let calls=0;type Model=Parameters<typeof wrapOrdinaryChatModel>[0];
    const provider={specificationVersion:'v4',provider:'owned-file-fixture',modelId:'owned-file-fixture',supportedUrls:{},
      async doGenerate(options:{prompt:Array<{content:unknown}>}){
        calls++;const files=options.prompt.flatMap(message=>Array.isArray(message.content)?message.content.filter(part=>part.type==='file'):[]);
        expect(files).toHaveLength(1);expect(Buffer.from(files[0].data.data).equals(bytes)).toBe(true);
        return {usage:{outputTokens:{total:1}}};
      },async doStream(){throw Error('Unused');}} as unknown as Model;
    const principal={principalId:f.actor.principalId,attributes:{turasAttemptId:attempt.attemptId}};
    await wrapOrdinaryChatModel(provider,principal,f.native,turn).doGenerate({prompt:[]});expect(calls).toBe(1);
    await wrapOrdinaryChatModel(provider,principal,f.native,turn).doGenerate({prompt:[{role:'user',content:[
      {type:'file',filename:'supplied.bin',mediaType:'application/octet-stream',data:{type:'data',data:bytes}},
    ]}]});expect(calls).toBe(2); // Exact bytes/name/MIME already present are not duplicated.
    await db.query('UPDATE memberships SET active=false WHERE id=$1',[f.actor.membershipId]);
    await expect(wrapOrdinaryChatModel(provider,principal,f.native,turn).doGenerate({prompt:[]})).rejects.toMatchObject({status:401,code:'unauthorized'});
    expect((await nativeUploadReadHttp(request(f.actor,'GET'),viewParams)).status).toBe(401);
    expect(calls).toBe(2); // Revocation after native admission still blocks I/O.
    await db.query('UPDATE memberships SET active=true WHERE id=$1',[f.actor.membershipId]);
    f.actor=await isolatedChatActor(db,'internal','admin',undefined,f.actor);
    const other = await isolatedChatActor(db, "internal", "member", f.actor.workspaceId);
    expect((await nativeUploadReadHttp(request(other,'GET'),viewParams)).status).toBe(404);
    await expect(hydrateNativeUploads(other, f.conversation.id, key, parts)).rejects.toMatchObject({ status: 404 });
    expect((await nativeUploadHttp(request(other, "PUT", bytes.subarray(0, nativeUploadChunkBytes)),
      { id: f.conversation.id, uploadId: staged.uploadId, index: "0" }, "chunk")).status).toBe(404);
    expect((await nativeUploadHttp(request(f.actor, "DELETE"), { id: f.conversation.id, uploadId: staged.uploadId }, "cancel")).status).toBe(409);
    const changed = Buffer.from(bytes.subarray(0, nativeUploadChunkBytes)); changed[0] ^= 1;
    expect((await nativeUploadHttp(request(f.actor, "PUT", changed), { id: f.conversation.id, uploadId: staged.uploadId, index: "0" }, "chunk")).status).toBe(409);
    const duplicate = await stage(f.actor, f.conversation.id, bytes);
    await expect(prepareAttempt(f.actor, f.conversation.id, f.native, key,
      parseOrdinaryNativeMessage([{ type: "text", text: "Read this file." }, duplicate.reference]))).rejects.toMatchObject({ code: "request_key_conflict" });
    // Even explicit cleanup may not erase a submitted active response's bytes.
    expect(await cleanupNativeUploads(f.conversation.id)).toBe(0);
    expect((await getOwnedConversationDetail(f.actor, f.conversation.id)).submittedMessages).toHaveLength(1);
    await settleSyntheticConversationAttempts(db, owned);
    await db.query("UPDATE ordinary_native_uploads SET expires_at=clock_timestamp()-interval '1 day' WHERE id=$1",[staged.uploadId]);
    expect(await cleanupNativeUploads()).toBe(0); // Admitted files have no new time expiry.
    expect(await cleanupNativeUploads(f.conversation.id)).toBe(2);
    expect((await db.query("SELECT count(*)::int AS n FROM ordinary_native_upload_chunks WHERE upload_id=$1", [staged.uploadId])).rows[0].n).toBe(0);
    await expect(hydrateNativeUploads(f.actor, f.conversation.id, key, parts)).rejects.toMatchObject({ code: "native_upload_expired" });
  } finally {
    if (prior === undefined) delete process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED; else process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED = prior;
    try { await settleSyntheticConversationAttempts(db, owned); } finally { await db.end(); }
  }
});

it("enforces actual transport bounds, CSRF, unused-upload expiry and least-privilege runtime grants", async () => {
  const db = new Client({ connectionString: url }); await db.connect();
  const prior = process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED; process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED = "1";
  try {
    const f = await fixture(db), bytes = Buffer.alloc(10, 0x62);
    const staged = await stage(f.actor, f.conversation.id, bytes);
    const noCsrf = request(f.actor, "POST", JSON.stringify(staged.input)); noCsrf.headers.delete("x-csrf-token");
    expect((await nativeUploadHttp(noCsrf, { id: f.conversation.id }, "create")).status).toBe(403);
    expect((await nativeUploadHttp(request(f.actor, "POST", JSON.stringify({ ...staged.input, size: 10 * 1024 * 1024 + 1 })), { id: f.conversation.id }, "create")).status).toBe(422);
    expect((await nativeUploadHttp(request(f.actor, "PUT", Buffer.alloc(nativeUploadChunkBytes + 1)),
      { id: f.conversation.id, uploadId: staged.uploadId, index: "0" }, "chunk")).status).toBe(413);
    expect(() => parseOrdinaryNativeMessage(Array.from({ length: 6 }, () => staged.reference))).toThrow();
    await db.query("UPDATE ordinary_native_uploads SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [staged.uploadId]);
    expect(await cleanupNativeUploads()).toBeGreaterThanOrEqual(1);
    expect((await db.query("SELECT state FROM ordinary_native_uploads WHERE id=$1", [staged.uploadId])).rows[0].state).toBe("expired");
    const grants = await withTransaction(client => client.query(`SELECT
      has_column_privilege(current_user,'ordinary_native_uploads','state','UPDATE') AS state,
      has_column_privilege(current_user,'ordinary_native_uploads','bound_message_id','UPDATE') AS binding,
      has_column_privilege(current_user,'ordinary_native_uploads','sha256','UPDATE') AS digest,
      has_column_privilege(current_user,'ordinary_native_uploads','expires_at','UPDATE') AS expiry,
      has_table_privilege(current_user,'ordinary_native_uploads','DELETE') AS metadata_delete,
      has_table_privilege(current_user,'ordinary_native_upload_chunks','UPDATE') AS chunk_update,
      has_table_privilege(current_user,'ordinary_native_upload_chunks','DELETE') AS chunk_delete`));
    expect(grants.rows[0]).toEqual({ state: true, binding: true, digest: false, expiry: false,
      metadata_delete: false, chunk_update: false, chunk_delete: true });
    await expect(withTransaction(client => client.query("UPDATE ordinary_native_uploads SET sha256=repeat('a',64) WHERE id=$1", [staged.uploadId]))).rejects.toMatchObject({ code: "42501" });
    await expect(withTransaction(client => client.query("UPDATE ordinary_native_upload_chunks SET sha256=repeat('a',64) WHERE upload_id=$1", [staged.uploadId]))).rejects.toMatchObject({ code: "42501" });
  } finally {
    if (prior === undefined) delete process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED; else process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED = prior;
    await db.end();
  }
});

it('keeps five distinct files across corrections inside the original response allowance',async()=>{
 const db=new Client({connectionString:url});await db.connect();const owned:string[]=[];
 const prior=process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED='1';
 try{
  const f=await fixture(db);owned.push(f.conversation.id);
  const references=[];for(let index=0;index<5;index++)references.push((await stage(f.actor,f.conversation.id,Buffer.from([index]))).reference);
  const parts=parseOrdinaryNativeMessage([{type:'text',text:'Read these five files.'},...references]);
  const attempt=await prepareAttempt(f.actor,f.conversation.id,f.native,randomUUID(),parts);await claimDispatch(f.actor,f.conversation.id,attempt.attemptId,0);
  await projectNativeEvent(f.native,attempt.attemptId,{type:'message.received',data:{message:summarizeNativeMessage(parts),turnId:'turn_'+randomUUID()},meta:{id:'evt_'+randomUUID(),at:new Date().toISOString()}});
  const sixth=await stage(f.actor,f.conversation.id,Buffer.from([6]));
  await expect(prepareOrdinarySteering(f.actor,f.conversation.id,f.native,randomUUID(),parseOrdinaryNativeMessage([
   {type:'text',text:'Add this sixth file.'},sixth.reference]))).rejects.toMatchObject({status:413,code:'native_attempt_file_limit'});
  expect((await db.query('SELECT count(*)::int AS n FROM response_attempts WHERE conversation_id=$1',[f.conversation.id])).rows[0].n).toBe(1);
  expect((await db.query('SELECT count(*)::int AS n FROM ordinary_model_operations WHERE conversation_id=$1',[f.conversation.id])).rows[0].n).toBe(0);
 }finally{if(prior===undefined)delete process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;else process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED=prior;try{await settleSyntheticConversationAttempts(db,owned);}finally{await db.end();}}
});

it('rejoins the original upload after a lost create acknowledgment and releases removed ready-file quota only through confirmed owner controls',async()=>{
 const db=new Client({connectionString:url});await db.connect();const prior=process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED='1';
 const storage=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
 try{
  const f=await fixture(db);let loseCreate=true,loseCancel=true;
  vi.stubGlobal('fetch',async(path:string,init:RequestInit)=>{
   const segments=path.split('/'),at=segments.indexOf('native-uploads'),uploadId=segments[at+1];
   const action=!uploadId?'create':segments[at+2]==='chunks'?'chunk':init.method==='DELETE'?'cancel':'finish';
   const body=typeof init.body==='string'?init.body:init.body instanceof Uint8Array?init.body:undefined;
   const response=await nativeUploadHttp(request(f.actor,init.method!,body),{id:f.conversation.id,uploadId,index:segments[at+3]},action);
   if(action==='create'&&loseCreate){loseCreate=false;throw new TypeError('Synthetic lost create acknowledgment');}
   if(action==='cancel'&&loseCancel){loseCancel=false;throw new TypeError('Synthetic lost cancellation acknowledgment');}
   return response;
  });
  const raw=parseOrdinaryNativeMessage([{type:'text',text:'Read this file.'},{type:'file',filename:'retry.bin',mediaType:'application/octet-stream',data:'data:application/octet-stream;base64,eA=='}]);
  await expect(uploadNativeFiles(raw,f.conversation.id,csrfTokenForSession(f.actor.token))).rejects.toThrow();expect(storage.size).toBe(1);
  const prepared=await uploadNativeFiles(raw,f.conversation.id,csrfTokenForSession(f.actor.token));expect(typeof prepared).not.toBe('string');expect(storage.size).toBe(0);
  expect((await db.query('SELECT count(*)::int AS n FROM ordinary_native_uploads WHERE conversation_id=$1',[f.conversation.id])).rows[0].n).toBe(1);
  const files=(prepared as ReturnType<typeof parseOrdinaryNativeMessage>).filter(part=>part.type==='file');
  await expect(cancelRemovedNativeFiles(files,[],f.conversation.id,csrfTokenForSession(f.actor.token))).rejects.toThrow('remains visible');
  await cancelRemovedNativeFiles(files,[],f.conversation.id,csrfTokenForSession(f.actor.token));
  expect((await db.query("SELECT COALESCE(sum(size_bytes),0)::int AS bytes FROM ordinary_native_uploads WHERE conversation_id=$1 AND state IN('uploading','ready','bound')",[f.conversation.id])).rows[0].bytes).toBe(0);
  expect((await db.query('SELECT count(*)::int AS n FROM response_attempts WHERE conversation_id=$1',[f.conversation.id])).rows[0].n).toBe(0);
 }finally{vi.unstubAllGlobals();if(prior===undefined)delete process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;else process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED=prior;await db.end();}
});


it('durably drains more than one retirement batch without expiring active bound files',async()=>{
 const db=new Client({connectionString:url});await db.connect();const prior=process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED='1';let id:string|undefined;
 try{
  const f=await fixture(db);id=f.conversation.id;
  const bytes=Buffer.from('x'),digest=createHash('sha256').update(bytes).digest('hex');
  const staged=await stage(f.actor,id,bytes),key=randomUUID();
  const attempt=await prepareAttempt(f.actor,id,f.native,key,parseOrdinaryNativeMessage([staged.reference]));
  const message=(await db.query('SELECT message_id FROM response_attempts WHERE id=$1',[attempt.attemptId])).rows[0].message_id;
  for(let index=0;index<100;index++){
   const upload=randomUUID();await db.query(`INSERT INTO ordinary_native_uploads(id,environment_id,workspace_id,conversation_id,owner_principal_id,request_key,filename,media_type,size_bytes,sha256,state,bound_message_id)
    VALUES($1,$2,$3,$4,$5,$6,'tiny.bin','application/octet-stream',1,$7,'bound',$8)`,[upload,process.env.TURAS_TEST_ENVIRONMENT_ID,f.actor.workspaceId,id,f.actor.principalId,randomUUID(),digest,message]);
   await db.query('INSERT INTO ordinary_native_upload_chunks(upload_id,chunk_index,bytes,sha256) VALUES($1,0,$2,$3)',[upload,bytes,digest]);
  }
  expect(await cleanupNativeUploads(id)).toBe(0);
  expect((await db.query("SELECT count(*)::int n FROM ordinary_native_uploads WHERE conversation_id=$1 AND state='bound'",[id])).rows[0].n).toBe(101);
  await settleSyntheticConversationAttempts(db,[id]);
  expect(await cleanupNativeUploads(id)).toBe(100);
  expect((await db.query("SELECT count(*)::int n FROM ordinary_native_uploads WHERE conversation_id=$1 AND state='purged'",[id])).rows[0].n).toBe(101);
  expect(await cleanupNativeUploads()).toBeGreaterThanOrEqual(1);
  expect((await db.query('SELECT count(*)::int n FROM ordinary_native_upload_chunks c JOIN ordinary_native_uploads u ON u.id=c.upload_id WHERE u.conversation_id=$1',[id])).rows[0].n).toBe(0);
 }finally{if(id)await settleSyntheticConversationAttempts(db,[id]);if(prior===undefined)delete process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;else process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED=prior;await db.end();}
});

it('recovers a lost native reset receipt from durable owner intent without purging on an unconfirmed response',async()=>{
 const db=new Client({connectionString:url});await db.connect();const prior=process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED,origin=process.env.TURAS_EVE_INTERNAL_ORIGIN;
 process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED='1';process.env.TURAS_EVE_INTERNAL_ORIGIN='http://127.0.0.1:39999/';let id:string|undefined;
 const {requestOrdinaryNativeRetirement,processOrdinaryNativeRetirement,authorizeOrdinaryNativeRetirementRecovery}=await import('../../lib/server/conversations/native-retirement-recovery');
 try{
  const f=await fixture(db);id=f.conversation.id;const staged=await stage(f.actor,id,Buffer.from('retained bytes'));
  const attempt=await prepareAttempt(f.actor,id,f.native,randomUUID(),parseOrdinaryNativeMessage([staged.reference]));
  await requestOrdinaryNativeRetirement(f.actor,f.native);
  await expect(prepareAttempt(f.actor,id,f.native,randomUUID(),'New send after reset intent.')).rejects.toMatchObject({status:409,code:'conversation_retired'});
  const row=(await db.query('SELECT * FROM ordinary_native_retirements WHERE conversation_id=$1',[id])).rows[0];
  let calls=0;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   calls++;expect(init?.redirect).toBe('error');const request=new Request(String(input),init);
   expect(await authorizeOrdinaryNativeRetirementRecovery(request,f.native)).toBe(f.actor.principalId);
   expect(await authorizeOrdinaryNativeRetirementRecovery(request,'wrun_wrong')).toBeNull();
   if(calls===1)throw Error('Synthetic lost native reset acknowledgment');
   return Response.json({ok:true,status:'no_active_session'});
  }));
  process.env.TURAS_EVE_INTERNAL_ORIGIN='http://untrusted.invalid/';
  expect(await processOrdinaryNativeRetirement()).toBe(true);expect(calls).toBe(0);
  await db.query("UPDATE ordinary_native_retirements SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[row.id]);
  process.env.TURAS_EVE_INTERNAL_ORIGIN='http://127.0.0.1:39999/';
  expect(await processOrdinaryNativeRetirement()).toBe(true);
  expect((await db.query('SELECT state FROM ordinary_native_retirements WHERE id=$1',[row.id])).rows[0].state).toBe('requested');
  expect(await cleanupNativeUploads()).toBe(0);
  expect((await db.query('SELECT state FROM ordinary_native_uploads WHERE id=$1',[staged.uploadId])).rows[0].state).toBe('bound');
  await db.query("UPDATE ordinary_native_retirements SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[row.id]);
  expect(await processOrdinaryNativeRetirement()).toBe(true);expect(calls).toBe(2);
  expect((await db.query('SELECT state,confirmed_at FROM ordinary_native_retirements WHERE id=$1',[row.id])).rows[0]).toMatchObject({state:'confirmed',confirmed_at:expect.any(Date)});
  expect((await db.query('SELECT response_state FROM response_attempts WHERE id=$1',[attempt.attemptId])).rows[0].response_state).toBe('cancelled');
  // Simulate process exit immediately after confirmation transaction: the next
  // independent maintenance invocation still sees and drains durable eligibility.
  expect(await cleanupNativeUploads()).toBeGreaterThanOrEqual(1);
  expect((await db.query('SELECT count(*)::int n FROM ordinary_native_upload_chunks WHERE upload_id=$1',[staged.uploadId])).rows[0].n).toBe(0);
  await expect(withTransaction(async runtime=>{await runtime.query('UPDATE ordinary_native_retirements SET native_session_id=$2 WHERE id=$1',[row.id,'wrun_substitute']);})).rejects.toMatchObject({code:'42501'});
  await expect(withTransaction(async runtime=>{await runtime.query('DELETE FROM ordinary_native_retirements WHERE id=$1',[row.id]);})).rejects.toMatchObject({code:'42501'});
 }finally{vi.unstubAllGlobals();if(id)await settleSyntheticConversationAttempts(db,[id]);if(prior===undefined)delete process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;else process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED=prior;if(origin===undefined)delete process.env.TURAS_EVE_INTERNAL_ORIGIN;else process.env.TURAS_EVE_INTERNAL_ORIGIN=origin;await db.end();}
});

it.each([{outcome:'approved',intervening:false},{outcome:'denied',intervening:false},{outcome:'approved',intervening:true},{outcome:'denied',intervening:true}] as const)('binds actual settled continuation $outcome after intervening=$intervening to its exact owner-posted window',async({outcome,intervening})=>{
 const db=new Client({connectionString:url});await db.connect();let id:string|undefined;
 const {authorizeOwnedInputResponse,nativeInputDeadline}=await import('../../lib/server/conversations/input-responses');
 const {redundantApprovalInstructions}=await import('../../lib/server/conversations/approval-continuation');
 const event=(type:string,data:Record<string,unknown>)=>({type,data,meta:{id:'evt_'+randomUUID(),at:new Date().toISOString()}});
 try{
  const f=await fixture(db);id=f.conversation.id;const text='Owned pending approval fixture.',attempt=await prepareAttempt(f.actor,id,f.native,randomUUID(),text);
  await claimDispatch(f.actor,id,attempt.attemptId,0);
  await projectNativeEvent(f.native,attempt.attemptId,event('message.received',{message:text,turnId:'turn_0',sequence:0}));
  const principal={authenticator:'turas-session',principalType:'user',principalId:f.actor.principalId,attributes:{turasAttemptId:attempt.attemptId,turasLoginSessionId:f.actor.sessionId,turasMembershipId:f.actor.membershipId}};
  const nextSequence=intervening?2:1,resumeTurn='turn_'+nextSequence;
  const continuation=event('turn.started',{turnId:resumeTurn,sequence:nextSequence});
  const redundant=(value=continuation,caller=principal)=>withTransaction(runtime=>redundantApprovalInstructions(runtime,caller,f.native,value));
  const requestId='approval_'+randomUUID();
  await projectNativeEvent(f.native,attempt.attemptId,event('input.requested',{turnId:'turn_0',sequence:0,requests:[{requestId,kind:'tool-approval'}]}));
  await projectNativeEvent(f.native,attempt.attemptId,event('turn.started',{turnId:'turn_1',sequence:1}));
  expect(await withTransaction(runtime=>nativeInputDeadline(runtime,attempt.attemptId,f.native,'turn_1'))).toBeNull();
  await expect(projectNativeEvent(f.native,attempt.attemptId,event('step.completed',{turnId:'turn_1',sequence:1,stepIndex:0,usage:{outputTokens:1}}))).rejects.toThrow('Native turn does not match');
  if(intervening){
   const followup='An unrelated ordinary follow-up.',other=await prepareAttempt(f.actor,id,f.native,randomUUID(),followup);
   await claimDispatch(f.actor,id,other.attemptId,0);
   await projectNativeEvent(f.native,other.attemptId,event('message.received',{message:followup,turnId:'turn_1',sequence:1}));
   await projectNativeEvent(f.native,other.attemptId,event('turn.completed',{turnId:'turn_1',sequence:1}));
  }
  expect(await redundant()).toBe(false);
  await authorizeOwnedInputResponse(f.actor,f.native,{inputResponses:[{requestId,optionId:outcome==='approved'?'approve':'cancel'}]});
  expect(await redundant()).toBe(false); // Owner POST alone does not prove native settlement.
  const posted=await withTransaction(runtime=>nativeInputDeadline(runtime,attempt.attemptId,f.native,''));expect(posted).toBeInstanceOf(Date);
  await projectNativeEvent(f.native,attempt.attemptId,event('approval.settled',{turnId:'',sequence:nextSequence,requestId,outcome:outcome==='approved'?'approved':'cancelled',responderPrincipalId:f.actor.principalId}));
  await projectNativeEvent(f.native,attempt.attemptId,event('input.resolved',{turnId:'turn_0',sequence:0,resolutions:[{requestId,kind:'tool-approval',outcome}]}));
  expect(await redundant()).toBe(true); // Works before the turn.started projection listener binds it.
  expect(await redundant(event('turn.started',{turnId:'turn_unrelated',sequence:7}))).toBe(false);
  expect(await redundant(continuation,{...principal,attributes:{...principal.attributes,turasLoginSessionId:randomUUID()}})).toBe(false);
  await projectNativeEvent(f.native,attempt.attemptId,event('turn.started',{turnId:'turn_unrelated',sequence:7}));
  expect(await withTransaction(runtime=>nativeInputDeadline(runtime,attempt.attemptId,f.native,'turn_unrelated'))).toBeNull();
  await projectNativeEvent(f.native,attempt.attemptId,continuation);
  expect(await withTransaction(runtime=>nativeInputDeadline(runtime,attempt.attemptId,f.native,resumeTurn))).toEqual(posted);
  await projectNativeEvent(f.native,attempt.attemptId,event('turn.started',{turnId:'turn_substitute',sequence:nextSequence}));
  expect(await withTransaction(runtime=>nativeInputDeadline(runtime,attempt.attemptId,f.native,'turn_substitute'))).toBeNull();
  expect(await redundant(event('turn.started',{turnId:'turn_substitute',sequence:nextSequence}))).toBe(false);
  await projectNativeEvent(f.native,attempt.attemptId,event('step.completed',{turnId:resumeTurn,sequence:nextSequence,stepIndex:0,usage:{outputTokens:7}}));
  expect((await db.query('SELECT native_turn_id FROM response_attempts WHERE id=$1',[attempt.attemptId])).rows[0].native_turn_id).toBe('turn_0');
  expect((await db.query('SELECT count(*)::int n FROM response_attempts WHERE conversation_id=$1',[id])).rows[0].n).toBe(intervening?2:1);
  await db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[f.actor.sessionId]);
  expect(await redundant()).toBe(false);
 }finally{if(id)await settleSyntheticConversationAttempts(db,[id]);await db.end();}
});

it('binds only the actual question callback after an exact owner POST without renewing its allowance',async()=>{
 const db=new Client({connectionString:url});await db.connect();let id:string|undefined;
 const {bindPostedQuestionStep}=await import('../../lib/server/conversations/question-continuation');
 const {authorizeOwnedInputResponse,nativeInputDeadline}=await import('../../lib/server/conversations/input-responses');
 const event=(type:string,data:Record<string,unknown>)=>({type,data,meta:{id:'evt_'+randomUUID(),at:new Date().toISOString()}});
 try{
  const f=await fixture(db);id=f.conversation.id;const text='Owned pending question fixture.',attempt=await prepareAttempt(f.actor,id,f.native,randomUUID(),text);
  await claimDispatch(f.actor,id,attempt.attemptId,0);
  await projectNativeEvent(f.native,attempt.attemptId,event('message.received',{message:text,turnId:'turn_0',sequence:0}));
  const requestId='question_'+randomUUID();await projectNativeEvent(f.native,attempt.attemptId,event('input.requested',{turnId:'turn_0',sequence:0,requests:[{requestId,kind:'question'}]}));
  const principal={authenticator:'turas-session',principalType:'user',principalId:f.actor.principalId,attributes:{turasAttemptId:attempt.attemptId,turasLoginSessionId:f.actor.sessionId,turasMembershipId:f.actor.membershipId}};
  const step=event('step.started',{turnId:'turn_2',sequence:2,stepIndex:0}),turn={id:'turn_2',sequence:2};
  const bind=(value=step,caller=principal,current=turn)=>withTransaction(runtime=>bindPostedQuestionStep(runtime,caller,f.native,value,current));
  const deadline=(value='turn_2')=>withTransaction(runtime=>nativeInputDeadline(runtime,attempt.attemptId,f.native,value));
  await bind();expect(await deadline()).toBeNull();
  const postingActor=await isolatedChatActor(db,'internal','admin',undefined,f.actor);
  await authorizeOwnedInputResponse(postingActor,f.native,{inputResponses:[{requestId,optionId:'Desktop'}]});
  const posted=await deadline('');expect(posted).toBeInstanceOf(Date);
  await bind(step,{...principal,principalId:randomUUID()});expect(await deadline()).toBeNull();
  await bind(step,principal,{id:'turn_wrong',sequence:2});expect(await deadline()).toBeNull();
  await bind();expect(await deadline()).toEqual(posted);
  await expect(withTransaction(runtime=>runtime.query('UPDATE ordinary_question_continuations SET native_turn_id=$2 WHERE attempt_id=$1',[attempt.attemptId,'turn_forged']))).rejects.toMatchObject({code:'42501'});
  await expect(withTransaction(runtime=>runtime.query('DELETE FROM ordinary_question_continuations WHERE attempt_id=$1',[attempt.attemptId]))).rejects.toMatchObject({code:'42501'});
  await bind(event('step.started',{turnId:'turn_substitute',sequence:3,stepIndex:0}),principal,{id:'turn_substitute',sequence:3});expect(await deadline('turn_substitute')).toBeNull();
  await bind();expect(await deadline()).toEqual(posted);
  // A different owner-posted batch cannot inherit an earlier continuation.
  const another=event('input.requested',{turnId:'turn_2',sequence:2,requests:[{requestId:'expired_'+randomUUID(),kind:'question'}]});
  await projectNativeEvent(f.native,attempt.attemptId,another);
  await db.query("INSERT INTO native_input_resume_windows(attempt_id,native_event_id,issued_at,deadline_at) VALUES($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')",[attempt.attemptId,another.meta.id]);
  await db.query("UPDATE response_attempts SET response_state='running' WHERE id=$1",[attempt.attemptId]);
  await bind(event('step.started',{turnId:'turn_expired',sequence:3,stepIndex:0}),principal,{id:'turn_expired',sequence:3});expect(await deadline('turn_expired')).toBeNull();
  await projectNativeEvent(f.native,attempt.attemptId,event('step.completed',{turnId:'turn_2',sequence:2,stepIndex:0,usage:{outputTokens:3}}));
  expect((await db.query('SELECT native_turn_id FROM response_attempts WHERE id=$1',[attempt.attemptId])).rows[0].native_turn_id).toBe('turn_0');
  await db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[f.actor.sessionId]);
  await bind(); // The workflow callback retains its original login; exact POST authority remains live.
  const newest=await isolatedChatActor(db,'internal','admin',undefined,f.actor);
  await expect(authorizeOwnedInputResponse(newest,f.native,{inputResponses:[{requestId,optionId:'Desktop'}]})).rejects.toMatchObject({status:409});
  await db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[postingActor.sessionId]);
  await expect(bind(step,{...principal,attributes:{...principal.attributes,turasLoginSessionId:newest.sessionId}})).rejects.toMatchObject({status:401});
  expect(await deadline()).toBeNull();
  await expect(bind(event('step.started',{turnId:'turn_2',sequence:2,stepIndex:1}))).rejects.toMatchObject({status:401});
  expect((await db.query("SELECT count(*)::int n FROM ordinary_question_continuations WHERE conversation_id=$1",[id])).rows[0].n).toBe(1);
 }finally{if(id)await settleSyntheticConversationAttempts(db,[id]);await db.end();}
});

it.each(['login','workspace','source'] as const)('permits only an actual owned admitted followup question-control hook and fences revoked %s',async(revoked)=>{
 const db=new Client({connectionString:url});await db.connect();let id:string|undefined;
 const {hasOwnedQuestionControl}=await import('../../lib/server/conversations/question-control');
 const {nativeInputDeadline}=await import('../../lib/server/conversations/input-responses');
 const event=(type:string,data:Record<string,unknown>)=>({type,data,meta:{id:'evt_'+randomUUID(),at:new Date().toISOString()}});
 try{
  const actor=await isolatedChatActor(db,revoked==='source'?'partner':'internal',revoked==='source'?'member':'admin'),f=await fixture(db,actor);id=f.conversation.id;
  const text='Owned control question.',attempt=await prepareAttempt(actor,id,f.native,randomUUID(),text);await claimDispatch(actor,id,attempt.attemptId,0);
  await projectNativeEvent(f.native,attempt.attemptId,event('message.received',{message:text,turnId:'turn_0',sequence:0}));
  await projectNativeEvent(f.native,attempt.attemptId,event('input.requested',{turnId:'turn_0',sequence:0,requests:[{requestId:'control_'+randomUUID(),kind:'question'}]}));
  const principal={authenticator:'turas-session',principalType:'user',principalId:actor.principalId,attributes:{turasAttemptId:attempt.attemptId,turasLoginSessionId:actor.sessionId,turasMembershipId:actor.membershipId}};
  const control=(caller=principal)=>withTransaction(runtime=>hasOwnedQuestionControl(runtime,caller,f.native));
  expect(await control()).toBe(false);
  let customer:string|undefined;
  if(revoked==='source'){
   customer=randomUUID();await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic question control customer',false)",[customer,actor.workspaceId]);
   await db.query("INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),actor.workspaceId,customer,actor.membershipId,actor.principalId]);
   await db.query("INSERT INTO general_customer_read_scopes(attempt_id,customer_id,audience,generation,citation_ids) VALUES($1,$2,'delivery',0,'{}')",[attempt.attemptId,customer]);
  }
  const followup=await prepareAttempt(actor,id,f.native,randomUUID(),'An actual unrelated follow-up.');expect(await control()).toBe(false);
  await claimDispatch(actor,id,followup.attemptId,0);expect(await control()).toBe(true);
  expect(await control({...principal,principalId:randomUUID()})).toBe(false);
  expect(await withTransaction(runtime=>nativeInputDeadline(runtime,attempt.attemptId,f.native,''))).toBeNull();
  if(revoked==='login')await db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[actor.sessionId]);
  else if(revoked==='workspace')await db.query('UPDATE workspaces SET active=false WHERE id=$1',[actor.workspaceId]);
  else await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE customer_id=$1 AND membership_id=$2",[customer,actor.membershipId]);
  await expect(control()).rejects.toMatchObject({status:revoked==='source'?404:401});
 }finally{if(id)await settleSyntheticConversationAttempts(db,[id]);await db.end();}
});
