import { artifactIntentCommandSchema } from "../../../../../../lib/contracts/artifacts";
import { failure, success } from "../../../../../../lib/contracts/http";
import { artifactId, artifactJson, artifactSession } from "../../../../../../lib/server/artifacts/http";
import { cancelArtifactUpload } from "../../../../../../lib/server/artifacts/upload";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ intentId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request, true);
    await artifactJson(request, artifactIntentCommandSchema);
    return success(await cancelArtifactUpload(actor, artifactId((await context.params).intentId)));
  } catch (error) { return failure(error); }
}
