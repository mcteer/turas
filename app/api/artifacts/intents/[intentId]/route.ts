import { failure, success } from "../../../../../lib/contracts/http";
import { artifactId, artifactSession } from "../../../../../lib/server/artifacts/http";
import { readArtifactUploadIntent } from "../../../../../lib/server/artifacts/upload";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ intentId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request);
    const id = artifactId((await context.params).intentId);
    return success(await readArtifactUploadIntent(actor, id));
  } catch (error) { return failure(error); }
}
