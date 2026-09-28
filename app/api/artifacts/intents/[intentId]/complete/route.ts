import { artifactIntentCommandSchema } from "../../../../../../lib/contracts/artifacts";
import { failure, success } from "../../../../../../lib/contracts/http";
import { artifactId, artifactJson, artifactSession } from "../../../../../../lib/server/artifacts/http";
import { completeArtifactUpload } from "../../../../../../lib/server/artifacts/upload";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ intentId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request, true);
    const input = await artifactJson(request, artifactIntentCommandSchema);
    return success(await completeArtifactUpload(actor, artifactId((await context.params).intentId), input.idempotencyKey));
  } catch (error) { return failure(error); }
}
