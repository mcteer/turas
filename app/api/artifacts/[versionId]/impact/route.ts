import { failure, success } from "../../../../../lib/contracts/http";
import { artifactId, artifactSession } from "../../../../../lib/server/artifacts/http";
import { readArtifactImpact } from "../../../../../lib/server/artifacts/read";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ versionId: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request,false);
    return success(await readArtifactImpact(actor,artifactId((await context.params).versionId)));
  } catch (error) { return failure(error); }
}
