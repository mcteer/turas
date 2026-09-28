import { artifactLifecycleActionSchema } from "../../../../../lib/contracts/artifacts";
import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { artifactId, artifactSession } from "../../../../../lib/server/artifacts/http";
import { retireArtifactVersion, retryArtifactVersion } from "../../../../../lib/server/artifacts/lifecycle";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ versionId: string }> };
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request, true);
    if (Number(request.headers.get("content-length") ?? 0) > 8_192) {
      throw new HttpFailure(413, "too_large", "Request too large");
    }
    let raw: unknown;
    try { raw = await request.json(); }
    catch { throw new HttpFailure(400, "malformed_json", "Malformed JSON body"); }
    const parsed = artifactLifecycleActionSchema.safeParse(raw);
    if (!parsed.success) throw new HttpFailure(422, "invalid_input", "Invalid lifecycle action");
    const id = artifactId((await context.params).versionId);
    const result = parsed.data.action === "retry"
      ? await retryArtifactVersion(actor, id, { ...parsed.data, action: "retry" })
      : await retireArtifactVersion(actor, id, { ...parsed.data,
        action: parsed.data.action as "cancel" | "withdraw" | "delete" });
    return success(result);
  } catch (error) { return failure(error); }
}
