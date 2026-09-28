import { artifactAttachmentReferenceCommandSchema } from "../../../../../lib/contracts/artifacts";
import { failure, success } from "../../../../../lib/contracts/http";
import { artifactId, artifactJson, artifactSession } from "../../../../../lib/server/artifacts/http";
import { attachConversationArtifact, listConversationArtifacts } from "../../../../../lib/server/artifacts/references";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  try { return success(await listConversationArtifacts(await artifactSession(request),
    artifactId((await context.params).id))); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request, true);
    const input = await artifactJson(request, artifactAttachmentReferenceCommandSchema);
    return success(await attachConversationArtifact(actor,
      artifactId((await context.params).id),input.versionId));
  } catch (error) { return failure(error); }
}
