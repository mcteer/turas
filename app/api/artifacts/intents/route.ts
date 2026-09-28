import { artifactIntentBatchSchema } from "../../../../lib/contracts/artifacts";
import { failure, success } from "../../../../lib/contracts/http";
import { createArtifactUploadBatch } from "../../../../lib/server/artifacts/intake";
import { artifactJson, artifactSession } from "../../../../lib/server/artifacts/http";
import { artifactInfrastructureReady } from "../../../../lib/server/artifacts/worker-readiness";
import { HttpFailure } from "../../../../lib/contracts/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await artifactSession(request, true);
    if (!(await artifactInfrastructureReady())) throw new HttpFailure(503, "artifact_unprepared", "Artifact intake unavailable");
    const input = await artifactJson(request, artifactIntentBatchSchema);
    const result = await createArtifactUploadBatch(actor, input);
    return success(result, 201);
  } catch (error) { return failure(error); }
}
