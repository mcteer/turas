import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { artifactId, artifactSession } from "../../../../../lib/server/artifacts/http";
import { readArtifactUnits } from "../../../../../lib/server/artifacts/read";
import { artifactUnitsQuerySchema } from "../../../../../lib/contracts/artifacts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ versionId: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request);
    const input = artifactUnitsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!input.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    return success(await readArtifactUnits(actor, artifactId((await context.params).versionId), input.data));
  } catch (error) { return failure(error); }
}
