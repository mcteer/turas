import type { PoolClient } from "pg";
import { failure, HttpFailure, success } from "../../../lib/contracts/http";
import { checkSessionCsrf } from "../../../lib/server/auth/csrf";
import { getCurrentSession, type CurrentSession } from "../../../lib/server/auth/sessions";
import { withTransaction } from "../../../lib/server/db/client";

export async function researchRequest<T>(request: Request,write: boolean,
  run: (client: PoolClient,actor: CurrentSession,body: unknown) => Promise<T>): Promise<Response> {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401,"authentication_required","Sign in required");
    if (write) checkSessionCsrf(request,actor);
    let body: unknown;
    if (write) {
      if (Number(request.headers.get("content-length") ?? 0) > 16_384 || !request.body) {
        throw new HttpFailure(413,"too_large","Research request too large");
      }
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 16_384) {
          await reader.cancel().catch(() => undefined);
          throw new HttpFailure(413,"too_large","Research request too large");
        }
        chunks.push(part.value);
      }
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
      catch { throw new HttpFailure(422,"invalid_input","Invalid JSON request"); }
    }
    return success(await withTransaction((client) => run(client,actor,body)));
  } catch (error) { return failure(error); }
}
