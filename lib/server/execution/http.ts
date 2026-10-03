import { HttpFailure, failure, success } from "../../contracts/http";
import { getCurrentSession } from "../auth/sessions";
import { checkSessionCsrf } from "../auth/csrf";
import { executionId } from "./schema";
import type { ExecutionActor } from "./policy";

export function executionRouteId(raw: unknown): string {
  const result = executionId.safeParse(raw); if (!result.success) throw new HttpFailure(400, "invalid_input", "Invalid identity");
  return result.data;
}
export async function executionBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw new HttpFailure(415, "invalid_input", "Execution commands require JSON");
  if (!request.body) throw new HttpFailure(400, "invalid_input", "Execution JSON body is required");
  if (Number(request.headers.get("content-length") ?? 0) > 131072)
    throw new HttpFailure(413, "body_too_large", "Execution body too large");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 131072) throw new HttpFailure(413, "body_too_large", "Execution body too large");
      chunks.push(part.value); }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new HttpFailure(400, "invalid_input", "Invalid execution JSON"); }
}
export async function executionRequest(request: Request, write: boolean,
  run: (actor: ExecutionActor, body: unknown) => Promise<unknown>): Promise<Response> {
  try {
    const actor = await getCurrentSession(request); if (!actor) throw new HttpFailure(401, "unauthenticated", "Sign in required");
    if (write) checkSessionCsrf(request, actor);
    const result = await run(actor, write ? await executionBody(request) : undefined);
    if (Buffer.byteLength(JSON.stringify({ data: result, correlationId: "0".repeat(36) }), "utf8") > 262144)
      throw new HttpFailure(422, "scope_too_large", "Narrow the execution view");
    return success(result);
  } catch (error) { return failure(error); }
}
export function executionQuery(request: Request, allowed: readonly string[]): Record<string, string> {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(k => !allowed.includes(k) || params.getAll(k).length !== 1))
    throw new HttpFailure(400, "invalid_input", "Invalid execution query");
  return Object.fromEntries(params);
}
