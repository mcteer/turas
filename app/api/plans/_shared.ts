import type { PoolClient } from "pg";
import { z } from "zod";
import { failure,HttpFailure,success } from "../../../lib/contracts/http";
import { checkSessionCsrf } from "../../../lib/server/auth/csrf";
import { getCurrentSession,type CurrentSession } from "../../../lib/server/auth/sessions";
import { withTransaction } from "../../../lib/server/db/client";

const MAX_BODY_BYTES=145_000;
export function planId(raw:string):string {
  if (!z.uuid().safeParse(raw).success) throw new HttpFailure(422,"invalid_input","Invalid plan identifier");
  return raw;
}
export function optionalPlanId(raw:string|null):string|undefined {
  return raw===null ? undefined : planId(raw);
}

async function boundedBody(request:Request):Promise<unknown> {
  if (!request.body || Number(request.headers.get("content-length") ?? 0)>MAX_BODY_BYTES) {
    throw new HttpFailure(413,"too_large","Request too large");
  }
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[];
  let size=0;
  try {
    while (true) {
      const part=await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size>MAX_BODY_BYTES) throw new HttpFailure(413,"too_large","Request too large");
      chunks.push(part.value);
    }
  } catch (error) { await reader.cancel().catch(()=>undefined);throw error; }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new HttpFailure(422,"invalid_input","Invalid JSON request"); }
}

export async function planRequest<T>(request:Request,write:boolean,
  run:(client:PoolClient,actor:CurrentSession,body:unknown)=>Promise<T>):Promise<Response> {
  try {
    const actor=await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401,"authentication_required","Sign in required");
    if (write) checkSessionCsrf(request,actor);
    const body=write ? await boundedBody(request) : undefined;
    return success(await withTransaction((client)=>run(client,actor,body)));
  } catch (error) {
    if (process.env.TURAS_PLAN_DIAGNOSTICS==="1") {
      const value=error as {name?:unknown;code?:unknown};
      console.error("PLAN_DIAGNOSTIC",JSON.stringify({
        name:typeof value?.name==="string" ? value.name:"unknown",
        code:typeof value?.code==="string" ? value.code:"unknown"}));
    }
    return failure(error);
  }
}
