import { failure, HttpFailure, success } from "../../../lib/contracts/http";
import { checkSessionCsrf } from "../../../lib/server/auth/csrf";
import { getCurrentSession, type CurrentSession } from "../../../lib/server/auth/sessions";
import { withTransaction } from "../../../lib/server/db/client";
import type { PoolClient } from "pg";

async function boundedBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > 24_576 || !request.body) {
    throw new HttpFailure(413,"too_large","Request too large");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 24_576) throw new HttpFailure(413,"too_large","Request too large");
      chunks.push(part.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new HttpFailure(422,"invalid_input","Invalid JSON request"); }
}

export async function knowledgeRequest<T>(request: Request,write: boolean,
  run: (client: PoolClient,actor: CurrentSession,body: unknown) => Promise<T>): Promise<Response> {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401,"authentication_required","Sign in required");
    if (write) checkSessionCsrf(request,actor);
    const body = write ? await boundedBody(request) : undefined;
    return success(await withTransaction((client) => run(client,actor,body)));
  } catch (error) { return failure(error); }
}
