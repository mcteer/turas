import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { artifactId, artifactSession } from "../../../../../lib/server/artifacts/http";
import { createArtifactReplacementIntent } from "../../../../../lib/server/artifacts/replacements";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ versionId: string }> };
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request,true);
    if (Number(request.headers.get("content-length") ?? 0) > 8_192) {
      throw new HttpFailure(413,"too_large","Request too large");
    }
    let raw: unknown;
    try { raw = await request.json(); }
    catch { throw new HttpFailure(400,"malformed_json","Malformed JSON body"); }
    return success(await createArtifactReplacementIntent(actor,
      artifactId((await context.params).versionId),raw),201);
  } catch (error) { return failure(error); }
}
