import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { artifactId, artifactSession } from "../../../../../lib/server/artifacts/http";
import { submitArtifactProposal } from "../../../../../lib/server/artifacts/proposals";
import { artifactAudienceSchema, artifactDataCategorySchema,
  artifactSelectionSchema } from "../../../../../lib/contracts/artifacts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ versionId: string }> };
const shape = z.object({ selection: artifactSelectionSchema.safeExtend({
  audience: artifactAudienceSchema, dataCategory: artifactDataCategorySchema,
}), command: z.unknown() }).strict();
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request, true);
    if (Number(request.headers.get("content-length") ?? 0) > 65_536) {
      throw new HttpFailure(413, "too_large", "Request too large");
    }
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new HttpFailure(400, "malformed_json", "Malformed JSON body"); }
    const parsed = shape.safeParse(body);
    if (!parsed.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    const selection = parsed.data.selection;
    if (selection?.versionId !== artifactId((await context.params).versionId)) {
      throw new HttpFailure(404, "not_found", "Resource not found");
    }
    const result = await submitArtifactProposal(actor, { selection, command: parsed.data.command });
    return success(result, result.replayed ? 200 : 201);
  } catch (error) { return failure(error); }
}
