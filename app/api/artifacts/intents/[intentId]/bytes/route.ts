import { failure, HttpFailure } from "../../../../../../lib/contracts/http";
import { artifactId, artifactSession, requestBytes } from "../../../../../../lib/server/artifacts/http";
import { stageArtifactUpload } from "../../../../../../lib/server/artifacts/upload";
import { artifactMaxOriginalBytes } from "../../../../../../lib/contracts/artifacts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ intentId: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request, true);
    if (request.headers.get("content-type")?.toLowerCase() !== "application/octet-stream") {
      throw new HttpFailure(415, "unsupported_media_type", "Binary body required");
    }
    const length = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(length) || length < 1) throw new HttpFailure(400, "content_length_required", "Content length required");
    if (length > artifactMaxOriginalBytes) throw new HttpFailure(413, "too_large", "Upload too large");
    await stageArtifactUpload(actor, artifactId((await context.params).intentId), requestBytes(request), length);
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return failure(error); }
}
