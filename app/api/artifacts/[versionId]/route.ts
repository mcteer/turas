import { failure, success } from "../../../../lib/contracts/http";
import { artifactId, artifactSession } from "../../../../lib/server/artifacts/http";
import { readArtifactVersion } from "../../../../lib/server/artifacts/read";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ versionId: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  try { return success(await readArtifactVersion(await artifactSession(request),
    artifactId((await context.params).versionId))); }
  catch (error) { return failure(error); }
}
