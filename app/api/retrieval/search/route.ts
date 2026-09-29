import { failure, HttpFailure, success } from "../../../../lib/contracts/http";
import { checkSessionCsrf } from "../../../../lib/server/auth/csrf";
import { getCurrentSession } from "../../../../lib/server/auth/sessions";
import { searchEvidence } from "../../../../lib/server/retrieval/search";

export const dynamic = "force-dynamic";

async function boundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new HttpFailure(422,"invalid_input","Request body required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4_096) throw new HttpFailure(413,"too_large","Request too large");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new HttpFailure(422,"invalid_input","Invalid JSON request"); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401,"authentication_required","Sign in required");
    checkSessionCsrf(request,actor);
    if (Number(request.headers.get("content-length") ?? 0) > 4_096) {
      throw new HttpFailure(413,"too_large","Request too large");
    }
    const input = await boundedJson(request);
    return success(await searchEvidence(actor,input));
  } catch (error) { return failure(error); }
}
