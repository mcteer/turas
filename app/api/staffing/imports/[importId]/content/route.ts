import { staffingId, staffingStandaloneRequest } from "../../../_shared";
import { uploadImportOriginal, readImportOriginal } from "../../../../../../lib/server/staffing/imports";
import { getCurrentSession } from "../../../../../../lib/server/auth/sessions";
import { failure, HttpFailure } from "../../../../../../lib/contracts/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ importId: string }> };
export const PUT = async (request: Request, context: Context) => {
  const { importId } = await context.params;
  return staffingStandaloneRequest(request, true, async actor => {
    if (!request.body) throw new HttpFailure(422, "invalid_input", "Original body required");
    const mime = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const reader = request.body.getReader();
    async function* chunks() {
      for (;;) { const part = await reader.read(); if (part.done) break; yield part.value; }
    }
    try { return await uploadImportOriginal(actor, staffingId(importId), chunks(), mime); }
    finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }, false);
};
export const GET = async (request: Request, context: Context) => {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const { importId } = await context.params, original = await readImportOriginal(actor, staffingId(importId));
    return new Response(new Uint8Array(original.bytes), { headers: {
      "content-type": original.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(original.filename)}`,
      "content-security-policy": "sandbox; default-src 'none'",
    } });
  } catch (error) { return failure(error); }
};
