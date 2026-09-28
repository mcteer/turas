import { failure } from "../../../../../lib/contracts/http";
import { artifactId, artifactSession } from "../../../../../lib/server/artifacts/http";
import { streamArtifactOriginal } from "../../../../../lib/server/artifacts/read";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ versionId: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  try { return await streamArtifactOriginal(await artifactSession(request),
    artifactId((await context.params).versionId), request); }
  catch (error) { return failure(error); }
}
