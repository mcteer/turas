import { z } from "zod";
import { HttpFailure, failure, success } from "../../contracts/http";
import { getCurrentSession } from "../auth/sessions";
import { checkSessionCsrf } from "../auth/csrf";
import { expansionId } from "../../contracts/expansion";
import {recordExpansionTelemetry} from "./telemetry";
import type { ExpansionActor } from "./policy";

export function expansionRouteId(raw: unknown): string {
  const result = expansionId.safeParse(raw);
  if (!result.success) throw new HttpFailure(400, "invalid_input", "Invalid expansion identity");
  return result.data;
}

export async function expansionBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw new HttpFailure(415, "invalid_input", "Expansion commands require JSON");
  if (!request.body) throw new HttpFailure(400, "invalid_input", "Expansion JSON body is required");
  if (Number(request.headers.get("content-length") ?? 0) > 65_536)
    throw new HttpFailure(413, "body_too_large", "Expansion request exceeds the byte limit");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65_536) throw new HttpFailure(413, "body_too_large", "Expansion request exceeds the byte limit");
      chunks.push(part.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new HttpFailure(400, "invalid_input", "Malformed expansion JSON"); }
}

export function expansionQuery(request: Request): Record<string, string> {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1))
    throw new HttpFailure(400, "invalid_input", "Duplicate expansion query");
  return Object.fromEntries(params);
}

export async function expansionRequest(request: Request, write: boolean,
  run: (actor: ExpansionActor, body: unknown) => Promise<unknown>): Promise<Response> {
  const started=performance.now(),correlationId=crypto.randomUUID();
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
    if (write) checkSessionCsrf(request, actor);
    const result = await run(actor, write ? await expansionBody(request) : undefined);
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > 262_144)
      throw new HttpFailure(422, "scope_too_large", "Narrow the expansion view");
    recordExpansionTelemetry({operation:write?"write":"read",outcome:"committed",correlationId,durationMs:performance.now()-started});
    return success(result,200,correlationId);
  } catch (error) {
    const known=error instanceof z.ZodError?new HttpFailure(400,"invalid_input","Invalid expansion input"):error;
    recordExpansionTelemetry({operation:write?"write":"read",outcome:known instanceof HttpFailure&&known.status<500?"denied":"failed",correlationId,durationMs:performance.now()-started});
    return failure(known,correlationId);
  }
}
