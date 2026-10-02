import type { PoolClient } from "pg";
import { HttpFailure, failure, success } from "../../../lib/contracts/http";
import { staffingIdSchema } from "../../../lib/contracts/staffing";
import { parseStaffing } from "../../../lib/server/staffing/commands";
import { checkSessionCsrf } from "../../../lib/server/auth/csrf";
import { getCurrentSession, type CurrentSession } from "../../../lib/server/auth/sessions";
import { withTransaction } from "../../../lib/server/db/client";

export function staffingId(raw: unknown): string { return parseStaffing(staffingIdSchema, raw); }

export async function staffingBody(request: Request, limit = 131_072): Promise<unknown> {
  if (!request.body || Number(request.headers.get("content-length") ?? 0) > limit) {
    throw new HttpFailure(413, "too_large", "Request too large");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new HttpFailure(413, "too_large", "Request too large");
      chunks.push(part.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new HttpFailure(422, "invalid_input", "Invalid JSON request"); }
}

export async function staffingRequest<T>(request: Request, write: boolean,
  run: (client: PoolClient, actor: CurrentSession, body: unknown) => Promise<T>): Promise<Response> {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
    if (write) checkSessionCsrf(request, actor);
    const body = write ? await staffingBody(request) : undefined;
    return success(await withTransaction((client) => run(client, actor, body)));
  } catch (error) { return failure(error); }
}

export function staffingQuery(request: Request, extraKeys: readonly string[] = []): { pageSize?: number; cursor?: string } {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => !["pageSize", "cursor", ...extraKeys].includes(key) || params.getAll(key).length !== 1)) {
    throw new HttpFailure(422, "invalid_input", "Invalid staffing query");
  }
  const pageSize = params.get("pageSize");
  if (pageSize !== null && !/^[0-9]{1,2}$/.test(pageSize)) throw new HttpFailure(422, "invalid_input", "Invalid staffing page size");
  return { ...(pageSize === null ? {} : { pageSize: Number(pageSize) }),
    ...(params.has("cursor") ? { cursor: params.get("cursor")! } : {}) };
}
/** Services containing file/container IO own their short DB transactions. */
export async function staffingStandaloneRequest<T>(request: Request, write: boolean,
  run: (actor: CurrentSession, body: unknown) => Promise<T>, parseBody = true): Promise<Response> {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
    if (write) checkSessionCsrf(request, actor);
    const body = write && parseBody ? await staffingBody(request) : undefined;
    return success(await run(actor, body));
  } catch (error) { return failure(error); }
}
