import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
import { checkSessionCsrf } from "../auth/csrf";
import { getCurrentSession, type CurrentSession } from "../auth/sessions";

export async function artifactSession(request: Request, command = false): Promise<CurrentSession> {
  const actor = await getCurrentSession(request);
  if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
  if (command) checkSessionCsrf(request, actor);
  return actor;
}

export async function artifactJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpFailure(415, "unsupported_media_type", "JSON body required");
  }
  if (Number(request.headers.get("content-length") ?? 0) > 32 * 1024) {
    throw new HttpFailure(413, "too_large", "Request too large");
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new HttpFailure(400, "malformed_json", "Malformed JSON body"); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
  return parsed.data;
}

export function artifactId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new HttpFailure(404, "not_found", "Resource not found");
  return id;
}

export async function* requestBytes(request: Request): AsyncGenerator<Uint8Array> {
  if (!request.body) throw new HttpFailure(400, "missing_body", "Upload body required");
  const reader = request.body.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      yield result.value;
    }
  } finally { reader.releaseLock(); }
}
