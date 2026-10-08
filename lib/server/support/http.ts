import { z } from "zod";
import { HttpFailure, failure, success } from "../../contracts/http";
import { getCurrentSession } from "../auth/sessions";
import { checkSessionCsrf } from "../auth/csrf";
import { supportId } from "../../contracts/support";
import type { SupportActor } from "./policy";

export function supportRouteId(raw: unknown): string {
  const result = supportId.safeParse(raw);
  if (!result.success) throw new HttpFailure(400, "invalid_input", "Invalid support identity");
  return result.data;
}

export async function supportBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw new HttpFailure(415, "invalid_input", "Support commands require JSON");
  if (!request.body) throw new HttpFailure(400, "invalid_input", "Support JSON body is required");
  if (Number(request.headers.get("content-length") ?? 0) > 65_536)
    throw new HttpFailure(413, "body_too_large", "Support request exceeds the byte limit");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65_536) throw new HttpFailure(413, "body_too_large", "Support request exceeds the byte limit");
      chunks.push(part.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new HttpFailure(400, "invalid_input", "Malformed support JSON"); }
}

export function supportQuery(request: Request): Record<string, string> {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1))
    throw new HttpFailure(400, "invalid_input", "Duplicate support query");
  return Object.fromEntries(params);
}

export async function supportRequest(request: Request, write: boolean,
  run: (actor: SupportActor, body: unknown) => Promise<unknown>): Promise<Response> {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
    if (write) checkSessionCsrf(request, actor);
    const result = await run(actor, write ? await supportBody(request) : undefined);
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > 262_144)
      throw new HttpFailure(422, "scope_too_large", "Narrow the support view");
    return success(result);
  } catch (error) {
    return failure(error instanceof z.ZodError ? new HttpFailure(400, "invalid_input", "Invalid support input") : error);
  }
}
